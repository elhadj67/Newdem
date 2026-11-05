# syntax=docker/dockerfile:1

# ============================ builder ============================
FROM node:20-slim AS builder
WORKDIR /app
# openssl : requis par le moteur Prisma
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate      # génère le client Prisma (aucune base requise)

COPY . .
RUN npm run build            # -> dist/

# ============================ runner ============================
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# node_modules (avec le client Prisma généré), build et fichiers d'exécution
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json entrypoint.sh ./
COPY db ./db

RUN chmod +x entrypoint.sh \
    && mkdir -p storage/kyc \
    && chown -R node:node /app
USER node

EXPOSE 3000

# Health check via l'endpoint /health (fetch natif Node 20, aucun outil externe).
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["./entrypoint.sh"]
