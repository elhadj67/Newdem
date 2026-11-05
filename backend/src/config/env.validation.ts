import { Logger } from '@nestjs/common';

/**
 * Vérifie la configuration au démarrage. En production, refuse de démarrer
 * si un secret critique est absent ou laissé à sa valeur de développement.
 */
export function validateEnv(): void {
  const log = new Logger('Config');
  const prod = process.env.NODE_ENV === 'production';

  const problems: string[] = [];
  const requireInProd = (key: string, forbidden?: string[]) => {
    const v = process.env[key];
    if (!v) problems.push(`${key} manquant`);
    else if (forbidden?.includes(v)) problems.push(`${key} a une valeur non sécurisée`);
  };

  if (prod) {
    requireInProd('JWT_SECRET', ['changez-moi', 'dev-secret-change-me']);
    requireInProd('DATABASE_URL');
    requireInProd('APP_URL');
    // Passerelles de paiement : au moins Wave doit être configuré en prod.
    requireInProd('WAVE_API_KEY');
    requireInProd('WAVE_WEBHOOK_SECRET');
    if (!process.env.CORS_ORIGINS) {
      log.warn('CORS_ORIGINS non défini : le CORS sera restreint à une liste vide.');
    }
  }

  if (problems.length) {
    throw new Error('Configuration invalide :\n  - ' + problems.join('\n  - '));
  }
  log.log(`Configuration validée (${prod ? 'production' : 'développement'}).`);
}

/** Origines CORS autorisées (liste séparée par des virgules). */
export function corsOrigins(): string[] | boolean {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) return process.env.NODE_ENV === 'production' ? [] : true; // dev: tout autorisé
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}
