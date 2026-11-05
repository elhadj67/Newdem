#!/bin/sh
set -e

# Applique les migrations (idempotent) puis démarre l'API.
echo "→ Application des migrations Prisma…"
npx prisma migrate deploy

echo "→ Démarrage de l'API Newdem…"
exec node dist/main.js
