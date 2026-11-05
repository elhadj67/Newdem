# OSRM self-host (Sénégal)

Sert le routage réel utilisé par `RoutingService` (distance/durée des courses),
en remplacement de la démo publique `router.project-osrm.org`.

## Mise en route

```bash
./osrm/prepare.sh            # télécharge l'extrait Sénégal + prépare les fichiers .osrm
docker compose up -d osrm    # démarre le serveur de routage sur :5000
```

Puis dans `.env` :

```
OSRM_URL="http://localhost:5000"      # ou http://osrm:5000 si l'API tourne dans le même réseau Docker
```

## Notes

- Profil `car.lua` par défaut. Pour un profil moto/vélo, adapter la commande
  `osrm-extract` (ex. `bicycle.lua`) et exposer un second service si besoin.
- Rafraîchir les données : relancer `prepare.sh` périodiquement (Geofabrik publie
  des extraits quotidiens) puis redémarrer le service.
- Le repli à vol d'oiseau (PostGIS) reste actif si OSRM est indisponible.
```
