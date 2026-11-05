#!/usr/bin/env bash
# Prépare les données OSRM pour le Sénégal (pipeline MLD).
# À exécuter une fois avant de démarrer le service osrm du docker-compose.
set -euo pipefail

DATA_DIR="$(cd "$(dirname "$0")" && pwd)/data"
PBF="senegal-latest.osm.pbf"
OSRM_IMG="ghcr.io/project-osrm/osrm-backend:latest"

mkdir -p "$DATA_DIR"

# 1) Extrait OSM du Sénégal (Geofabrik).
if [ ! -f "$DATA_DIR/$PBF" ]; then
  echo "Téléchargement de l'extrait Sénégal…"
  curl -L -o "$DATA_DIR/$PBF" https://download.geofabrik.de/africa/senegal-latest.osm.pbf
fi

run() { docker run --rm -t -v "$DATA_DIR:/data" "$OSRM_IMG" "$@"; }

# 2) Extract / Partition / Customize (profil voiture).
run osrm-extract   -p /opt/car.lua /data/$PBF
run osrm-partition  /data/senegal-latest.osrm
run osrm-customize  /data/senegal-latest.osrm

echo "OK — données prêtes dans $DATA_DIR. Démarrez : docker compose up osrm"
