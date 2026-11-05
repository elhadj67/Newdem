# Newdem — Application Flutter

Client mobile de la plateforme VTC **Newdem** (voitures & motos, Sénégal).
Consomme l'API NestJS : auth OTP + JWT, courses, paiement Wave/Orange Money, temps réel Socket.IO.
Carte **OpenStreetMap** (via `flutter_map`) — cohérent avec le choix OSM/OSRM du backend, pas de clé Google.

## Structure

```
lib/
  core/        config, thème Newdem, client HTTP (Dio + JWT), stockage sécurisé
  models/      modèles alignés sur l'API (GeoPoint {lng,lat}, FareQuote, Trip…)
  services/    auth_api, trips_api, realtime (Socket.IO)
  state/       providers Riverpod : AuthController, TripController (machine à états)
  screens/     login (OTP), passenger (carte + parcours), driver
  main.dart    app, thème, aiguillage connexion + coquille Passager/Chauffeur
```

## Démarrage

```bash
flutter pub get
# Le backend doit tourner (voir newdem-backend). Émulateur Android -> 10.0.2.2.
flutter run --dart-define=API_BASE=http://10.0.2.2:3000 --dart-define=WS_BASE=http://10.0.2.2:3000
```

En production : `--dart-define=API_BASE=https://api.newdem.sn` (idem WS_BASE).

## Parcours

- **Passager** : choix d'une destination → estimation des deux tarifs (voiture/moto) →
  `Commander` → suivi live (positions poussées par le socket) → paiement
  Espèces / Wave / Orange Money → course terminée. Le contrôleur `TripController`
  suit une machine à états (`home → quotes → matching → enroute → inTrip → payment → done`)
  et réagit aux événements `trip:assigned`, `trip:in_progress`, `trip:completed`.
- **Chauffeur** : passage en ligne (socket), réception des offres (`ride:offer`),
  acceptation → transitions via l'API Trips.

## Correspondance avec l'API

| Écran / action | Appel |
|---|---|
| Connexion | `POST /auth/otp/request`, `/auth/otp/verify` |
| Estimation | `POST /trips/estimate` |
| Commande | `POST /trips` (id passager déduit du JWT) |
| Paiement | `POST /trips/:id/pay/wave` \| `/pay/orange-money` (URL ouverte via `url_launcher`) |
| Fin de course | `POST /trips/:id/complete` |
| Temps réel | socket `trip:subscribe`, `driver:location`, `ride:offer` |

## Permissions à déclarer

- **Android** (`android/app/src/main/AndroidManifest.xml`) : `INTERNET`,
  `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` ; en dev local http,
  `android:usesCleartextTraffic="true"`.
- **iOS** (`ios/Runner/Info.plist`) : `NSLocationWhenInUseUsageDescription`.

## À compléter

- Nominatim impose ~1 req/s et un User-Agent : pour de la volumétrie, self-host
  Nominatim/Photon ou passer par un service dédié ; le routage réel (OSRM) peut
  aussi remplacer l'estimation à vol d'oiseau côté backend.
- Capture par appareil photo pour le KYC ; élargir l'outbox à d'autres écritures sûres.
- Revue KYC côté admin via le tableau de bord web (déjà livré séparément).

## Tests & hors-ligne

- Tests unitaires des modèles : `flutter test` (voir `test/models_test.dart`).
- CI GitHub Actions (`.github/workflows/ci.yml`) : `flutter pub get`, `flutter analyze`, `flutter test`.
- **Hors-ligne** : bannière globale d'état réseau (`connectivity_plus`), historique consultable
  hors connexion (cache `shared_preferences`), et **outbox** — les notations faites hors-ligne
  sont mises en file d'attente puis rejouées au retour du réseau.

> Scaffold v0.7 — géolocalisation, recherche d'adresses, notation, mode chauffeur,
> KYC, historique, refresh JWT, reconnexion socket, gestion hors-ligne (cache + outbox)
> et tests + CI. À compiler dans un projet Flutter (`android/`, `ios/` générés par `flutter create`).
