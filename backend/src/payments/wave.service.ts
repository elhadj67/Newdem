import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

export interface WaveCheckout {
  id: string;
  wave_launch_url: string;
}

/**
 * Intégration Wave Business API.
 *  - Encaissement : POST /v1/checkout/sessions -> URL de paiement Wave.
 *  - Webhook : Wave notifie le statut ; on VÉRIFIE la signature HMAC-SHA256
 *    avant toute écriture, et on gère l'idempotence via l'id d'événement.
 * Montants en ENTIER FCFA (Wave rejette les décimales / strings).
 */
@Injectable()
export class WaveService {
  private readonly log = new Logger(WaveService.name);
  private readonly base = process.env.WAVE_API_BASE ?? 'https://api.wave.com/v1';
  private readonly apiKey = process.env.WAVE_API_KEY ?? '';
  private readonly webhookSecret = process.env.WAVE_WEBHOOK_SECRET ?? '';

  async createCheckout(amountFcfa: number, tripId: string): Promise<WaveCheckout> {
    const body = {
      amount: Math.round(amountFcfa),          // entier, jamais de décimale
      currency: 'XOF',
      client_reference: tripId,
      success_url: `${process.env.APP_URL}/pay/success?trip=${tripId}`,
      error_url: `${process.env.APP_URL}/pay/error?trip=${tripId}`,
    };

    const res = await fetch(`${this.base}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `trip-${tripId}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text();
      this.log.error(`Échec checkout Wave (${res.status}) : ${detail}`);
      throw new BadRequestException('Impossible de créer le paiement Wave');
    }
    return res.json() as Promise<WaveCheckout>;
  }

  /**
   * Vérifie la signature du webhook (header X-Wave-Signature) sur le corps BRUT.
   * Comparaison à temps constant. Retourne false si invalide -> on ignore.
   */
  verifySignature(rawBody: Buffer, signature: string): boolean {
    if (!signature || !this.webhookSecret) return false;
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
}
