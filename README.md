# Newdem

Plateforme de VTC (voitures & motos) pour le Sénégal, avec paiement **Wave** et **Orange Money**.
« Newdem » — *Allons-y !*

## Structure du dépôt

| Dossier | Contenu |
|---|---|
| [`backend/`](backend/) | API **NestJS** + PostgreSQL/PostGIS : auth (JWT rotatifs + rôles), tarification, matching géospatial, routage OSRM, courses, portefeuille conducteur & commission, paiements Wave/Orange Money, KYC, temps réel, observabilité. Conteneurisée (Docker). |
| [`app/`](app/) | Application mobile **Flutter** (passager + chauffeur) : commande, suivi live, paiement, notation, KYC, historique, gestion hors-ligne. |
| [`admin/`](admin/) | Tableau de bord web de **revue KYC** (page autonome). |
| [`docs/`](docs/) | Dossier d'architecture et prototype cliquable. |

## Démarrage rapide

**Backend**
```bash
cd backend
cp .env.example .env            # renseigner les secrets
docker compose -f docker-compose.prod.yml up -d --build
```

**Application**
```bash
cd app
flutter pub get
flutter run --dart-define=API_BASE=http://10.0.2.2:3000
```

Chaque sous-projet a son propre `README.md` détaillé.

## Intégration continue

- `backend-ci.yml` — tests unitaires + build, et tests d'intégration sur une base PostGIS.
- `app-ci.yml` — `flutter analyze` + `flutter test`.

## Licence

Propriétaire — tous droits réservés.
