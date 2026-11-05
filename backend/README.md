# Newdem — Backend & modèle de données

API de la plateforme VTC **Newdem** (voitures & motos, Sénégal).
Stack : **NestJS** (TypeScript) · **PostgreSQL + PostGIS** · **Prisma** · **Socket.IO** · **Wave Business API**.

Ce dépôt couvre le socle serveur : modèle de données, tarification, matching géospatial,
cycle de vie des courses, portefeuille conducteur / commission, paiement Wave et temps réel.

---

## Modèle de données

La source de vérité est `db/schema.sql` (PostgreSQL 15+ / PostGIS 3+). Points clés :

- **Montants en entiers FCFA** (`BIGINT`) — le XOF n'a pas de sous-unité.
- **Positions** en `geography(Point, 4326)` ; index **GiST** sur `drivers.last_location`
  pour un matching rapide (`ST_DWithin` / `ST_Distance`).
- **Barèmes versionnés** (`pricing`) modifiables sans redéploiement, un actif par type.
- **Portefeuille conducteur** (`wallets` + `wallet_ledger`) : c'est ici que la commission
  Newdem est prélevée, y compris sur les courses payées en espèces.
- **`transactions`** : encaissements/reversements prestataires, avec `idempotency_key`
  unique pour absorber les rejeux de webhooks.

Tables : `users`, `otp_codes`, `drivers`, `vehicles`, `driver_documents`, `pricing`,
`trips`, `wallets`, `wallet_ledger`, `transactions`, `ratings`.

`prisma/schema.prisma` mappe ce modèle. Les colonnes PostGIS y sont en `Unsupported(...)`
et manipulées via requêtes brutes (`$queryRaw`), notamment le matching.

---

## Démarrage

```bash
docker compose up -d            # PostgreSQL/PostGIS + Redis
cp .env.example .env            # renseigner DATABASE_URL, clés Wave, JWT
npm install
npm run prisma:generate
psql "$DATABASE_URL" -f db/schema.sql   # crée le schéma (extensions + tables + index)
npm run db:seed                 # barèmes voiture/moto
npm run start:dev
```

> Alternative Prisma : `db/schema.sql` est aussi fourni comme migration
> (`prisma/migrations/0001_init/migration.sql`) pour `prisma migrate`.

---

## Déploiement (Docker)

Image multi-étapes (`Dockerfile`) : build TypeScript + génération du client Prisma,
puis image d'exécution slim (utilisateur non-root, `HEALTHCHECK` sur `/health`).
Au démarrage, `entrypoint.sh` applique les migrations (`prisma migrate deploy`) avant de lancer l'API.

```bash
cp .env.example .env      # renseigner les secrets de PRODUCTION (voir ci-dessous)
# (optionnel) routage self-host : ./osrm/prepare.sh
docker compose -f docker-compose.prod.yml up -d --build
```

Le compose démarre **API + PostGIS + Redis + OSRM**, avec health checks, volumes
persistants (base, pièces KYC) et `restart: unless-stopped`.

L'image tourne en `NODE_ENV=production` : `validateEnv()` **refuse de démarrer** si un
secret critique manque. Renseigner au minimum dans `.env` : `JWT_SECRET`, `APP_URL`,
`WAVE_API_KEY`, `WAVE_WEBHOOK_SECRET`, et `CORS_ORIGINS`. `DATABASE_URL` et `OSRM_URL`
sont fournis par le compose (services `db` et `osrm`).

> Les pièces KYC sont dans un volume Docker ; en production réelle, préférer un bucket
> S3/GCS privé (le `StorageService` est prévu pour ce basculement).

---

---

## Flux métier

### Commande d'une course
1. `POST /trips/estimate` → distance, durée et **les deux tarifs** (voiture / moto).
   Distance/durée calculées par **OSRM** (`RoutingService`), avec repli à vol d'oiseau (PostGIS)
   si OSRM est indisponible. Serveur OSRM self-host fourni : voir `osrm/README.md`.
2. `POST /trips` → fige le devis, crée la course (`requested`) et lance le **matching**
   (`MatchingService.findNearby`, PostGIS) qui propose la course au conducteur le plus proche.
3. Le conducteur reçoit `ride:offer` (WebSocket) → `POST /trips/:id/accept`.
4. `:id/arriving` → `:id/start` → `:id/complete`.

### Tarification (`PricingService`)
`prix = max(minimum, base + km × prix_km + min × prix_min)`, arrondi à 100 FCFA.
Barème lu en base ; commission par défaut 18 %.

### Fin de course & portefeuille (`WalletService.settleTrip`)
- **Espèces** : le conducteur garde le cash ; on **débite la commission** de son portefeuille.
- **Wave / OM** : Newdem encaisse tout, garde la commission, **crédite la part conducteur**
  au portefeuille (réglé ensuite par payout).
- Passage en ligne conditionné à `balance ≥ min_balance` (plancher, ex. −2 000 F).

### Paiement Wave (`WaveService` + `PaymentsController`)
- `POST /trips/:id/pay/wave` → crée une session `checkout/sessions`, renvoie l'URL Wave.
- `POST /payments/wave/webhook` → **vérifie la signature HMAC-SHA256** sur le corps brut,
  gère l'**idempotence** par id d'événement, puis marque la course payée et règle le portefeuille.
  On ne marque jamais une course payée sur un simple retour client.

### Paiement Orange Money (`OrangeMoneyService` + `PaymentsController`)
Flux **différent de Wave** (API Web Payment, Orange Developer / Sonatel) :
- OAuth2 `client_credentials` → `access_token` (mis en cache jusqu'à expiration).
- `POST /trips/:id/pay/orange-money` → crée un web payment (`pay_token`, `notif_token`,
  `payment_url`) et une transaction `pending` ; le client valide avec un **OTP obtenu par USSD**.
- `POST /payments/orange-money/notify` (notif_url) → **pas de signature HMAC** : on vérifie
  le `notif_token` émis, puis on **confirme le statut côté serveur** via `/transactionstatus`
  avant de marquer la course payée et de régler le portefeuille.
- Sandbox : pays `dev` et devise `OUV`. Onboarding marchand via Sonatel (RCCM + NINEA + CNI),
  plus long que Wave.

### KYC conducteur (`KycService` + `StorageService`)
- Pièces requises : `id_card`, `license`, `registration`, `insurance`.
- Upload multipart (`/drivers/kyc/documents`), validé (JPEG/PNG/PDF, ≤ 5 Mo).
  Le fichier va au stockage **privé** ; seule la clé/URL est conservée en base
  (`driver_documents`). En prod : bucket S3/GCS privé + URLs signées.
- Une seule pièce active par type ; toute nouvelle pièce repasse le dossier en `pending`.
- `/drivers/kyc/submit` refuse tant que les 4 pièces ne sont pas présentes (`pending → submitted`).
- `/drivers/:id/kyc/review` (admin) approuve/rejette (`submitted → approved | rejected`)
  et marque les pièces vérifiées. Le matching n'attribue des courses qu'aux conducteurs
  `kyc_status = approved`.

### Temps réel (`RealtimeGateway`, Socket.IO)
- `driver:location` → met à jour PostGIS + diffuse au passager (salon `trip:<id>`).
- Événements poussés : `trip:assigned`, `trip:accepted`, `trip:in_progress`, `trip:completed`, `ride:offer`.

---

## Endpoints principaux

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/auth/otp/request` | Envoi du code OTP par SMS |
| POST | `/auth/otp/verify` | Vérifie l'OTP, renvoie access + refresh + user |
| POST | `/auth/refresh` | Rotation : échange un refresh contre une nouvelle paire |
| POST | `/auth/logout` | Révoque le refresh token |
| POST | `/trips/estimate` | Estime distance, durée et tarifs |
| POST | `/trips` | Demande une course + matching |
| POST | `/trips/:id/accept` `/arriving` `/start` | Transitions conducteur |
| POST | `/trips/:id/complete` | Fige le prix, commission, règle le portefeuille |
| GET | `/trips/history` | Historique des courses (adapté au rôle) |
| POST | `/trips/:id/pay/wave` | Lien de paiement Wave |
| POST | `/payments/wave/webhook` | Webhook Wave (signé) |
| POST | `/trips/:id/pay/orange-money` | Lien de paiement Orange Money |
| POST | `/payments/orange-money/notify` | Notification OM (confirmée par statut) |
| POST | `/trips/:id/rate` | Noter la course (auteur = JWT) |
| GET | `/drivers/me` | Profil du conducteur authentifié |
| GET | `/wallets/me` | Solde + mouvements du portefeuille |
| POST | `/drivers/status` | Passer en ligne / hors ligne |
| POST | `/drivers/kyc/documents` | Upload d'une pièce (multipart) |
| GET | `/drivers/kyc` | État KYC + pièces présentes/manquantes |
| POST | `/drivers/kyc/submit` | Soumettre le dossier pour revue |
| POST | `/drivers/:id/kyc/review` | Revue admin (approuver / rejeter) |
| GET | `/admin/kyc/pending` | Dossiers KYC en attente (admin) |
| GET | `/admin/kyc/:driverId` | Détail d'un dossier (admin) |
| GET | `/admin/kyc/:driverId/documents/:kind` | Visionner une pièce (admin) |
| POST | `/admin/kyc/:driverId/review` | Approuver / rejeter (admin) |

---

## Tests & CI

Tests unitaires (Jest) sur la logique métier déterministe :
`PricingService` (calcul du tarif), la machine à états des courses (`trip-state`),
et la vérification de signature du webhook Wave. Lancement : `npm test`.

Tests d'intégration (vraie base PostgreSQL + PostGIS) : matching géospatial
(`test/matching.int-spec.ts`) et e2e de démarrage/health/protection JWT
(`test/health.e2e-spec.ts`). Lancement : `npm run test:int` (nécessite `DATABASE_URL`).

CI GitHub Actions (`.github/workflows/ci.yml`) : un job **unit** (`npm test` + build)
et un job **integration** qui démarre un service PostGIS, applique le schéma + seed
et exécute les tests d'intégration.

## Observabilité

- `GET /metrics` — exposition Prometheus (requêtes HTTP, latences, `newdem_trips_requested_total`,
  `newdem_payments_total`, métriques process). Restreindre l'accès réseau en prod.
- `GET /health` — liveness + vérification base (readiness).
- Logs par requête (méthode, route, statut, latence).
- Règles d'alerte d'exemple : `ops/prometheus/alerts.yml` (API down, taux d'erreur 5xx,
  latence p95, chute d'activité).

## Sécurité (durcissement)

- `helmet` (en-têtes de sécurité), **CORS restreint** par `CORS_ORIGINS`, **rate-limiting**
  (`@nestjs/throttler`, protège notamment l'OTP du bruteforce).
- Validation des secrets au démarrage (`validateEnv`) : en `NODE_ENV=production`, l'API refuse
  de démarrer si `JWT_SECRET`, `DATABASE_URL`, clés Wave… sont absents ou laissés à leur valeur de dev.

## Authentification & rôles

- **JWT global** : `JwtAuthGuard` protège toute l'API par défaut (enregistré en `APP_GUARD`).
  L'**access token** est court (15 min). À l'expiration, le client échange son **refresh token**
  (opaque, hash stocké, durée 60 j) via `/auth/refresh` : rotation systématique — l'ancien est
  révoqué à chaque usage —, et révocation à la déconnexion (`/auth/logout`).
- **Routes publiques** : `@Public()` sur les OTP et les webhooks paiement (appelés par
  Wave/Orange, non par un utilisateur — sécurisés par signature / confirmation de statut).
- **Rôles** : `@Roles('passenger' | 'driver' | 'admin')` + `RolesGuard`. Ex. : commander une
  course est réservé au passager, les transitions (`accept`/`start`/`complete`) au conducteur.
- **Identité de confiance** : l'id passager d'une commande vient du JWT (`@CurrentUser('sub')`),
  jamais du corps de la requête.
- **WebSocket** : le socket est authentifié à la connexion (jeton dans `handshake.auth.token`) ;
  un socket invalide est déconnecté.

## À compléter avant production

- Rafraîchissement/rotation des JWT (refresh tokens), révocation, et vérification que le
  conducteur qui agit sur une course en est bien l'assigné (contrôle de propriété).
- Compte admin : promouvoir un utilisateur en base (`UPDATE users SET role='admin' WHERE phone='+221…'`)
  pour accéder à `/admin/*` et au tableau de bord de revue KYC.
- Fournisseur SMS réel (`AuthService.sendSms`).
- API de routage (Google Distance Matrix ou OSRM) à la place de la distance à vol d'oiseau.
- Récupération des clés marchandes Orange Money (Sonatel) pour activer le service intégré.
- File de matching multi-candidats avec timeout/ré-attribution, tarification heure de pointe.
- Tests, migrations versionnées, observabilité, conformité BCEAO/CDP.

_Scaffold v0.1 — logique métier fonctionnelle, périmètre volontairement resserré._
