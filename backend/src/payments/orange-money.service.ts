import { Injectable, Logger, BadRequestException } from '@nestjs/common';

interface OmToken { access_token: string; expires_at: number }

export interface OmWebPayment {
  status: number;
  message: string;
  pay_token: string;
  payment_url: string;
  notif_token: string;
}

export interface OmStatus {
  status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'INITIATED' | 'EXPIRED';
  txnid?: string;
}

/**
 * Intégration Orange Money Sénégal — API Web Payment (Orange Developer / Sonatel).
 *
 * Flux, différent de Wave :
 *   1. OAuth2 client_credentials -> access_token (mis en cache jusqu'à expiration).
 *   2. POST /orange-money-webpay/sn/v1/webpayment -> payment_url + pay_token + notif_token.
 *      On redirige le client ; il valide avec un OTP obtenu par USSD.
 *   3. Orange POSTe sur notif_url (status, txnid). PAS de signature HMAC :
 *      on sécurise en (a) vérifiant le notif_token qu'on a émis, puis
 *      (b) en CONFIRMANT le statut côté serveur via /transactionstatus.
 *
 * Sandbox : segment de pays `dev` et devise `OUV` au lieu de `sn` / `XOF`.
 * Onboarding marchand via Sonatel (RCCM + NINEA + CNI) — plus long que Wave.
 */
@Injectable()
export class OrangeMoneyService {
  private readonly log = new Logger(OrangeMoneyService.name);
  private readonly tokenUrl = process.env.OM_TOKEN_URL ?? 'https://api.orange.com/oauth/v3/token';
  private readonly base = process.env.OM_API_BASE ?? 'https://api.orange.com/orange-money-webpay';
  private readonly country = process.env.OM_COUNTRY ?? 'sn';   // 'dev' en sandbox
  private readonly currency = process.env.OM_CURRENCY ?? 'XOF'; // 'OUV' en sandbox
  private readonly merchantKey = process.env.OM_MERCHANT_KEY ?? '';
  private token: OmToken | null = null;

  /** access_token en cache, renouvelé ~60 s avant expiration. */
  private async getToken(): Promise<string> {
    if (this.token && this.token.expires_at > Date.now() + 60_000) {
      return this.token.access_token;
    }
    // Orange fournit soit un "Authorization header" complet, soit consumer key/secret.
    const auth =
      process.env.OM_AUTH_HEADER ??
      'Basic ' + Buffer.from(
        `${process.env.OM_CONSUMER_KEY}:${process.env.OM_CONSUMER_SECRET}`,
      ).toString('base64');

    const res = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      this.log.error(`OAuth Orange Money échoué (${res.status})`);
      throw new BadRequestException('Authentification Orange Money impossible');
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 };
    return this.token.access_token;
  }

  /** Crée un paiement web et renvoie l'URL de redirection + les jetons. */
  async createWebPayment(amountFcfa: number, tripId: string): Promise<OmWebPayment> {
    const token = await this.getToken();
    const res = await fetch(`${this.base}/${this.country}/v1/webpayment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_key: this.merchantKey,
        currency: this.currency,
        order_id: tripId,
        amount: Math.round(amountFcfa),
        return_url: `${process.env.APP_URL}/pay/success?trip=${tripId}`,
        cancel_url: `${process.env.APP_URL}/pay/cancel?trip=${tripId}`,
        notif_url: `${process.env.APP_URL}/payments/orange-money/notify`,
        lang: 'fr',
        reference: `Newdem - Course ${tripId}`,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      this.log.error(`Web payment OM échoué (${res.status}) : ${detail}`);
      throw new BadRequestException('Impossible de créer le paiement Orange Money');
    }
    return res.json() as Promise<OmWebPayment>;
  }

  /**
   * Confirme le statut côté serveur — la source de vérité, jamais la notif seule.
   * Renvoie le statut Orange Money pour l'order_id / pay_token donnés.
   */
  async checkStatus(tripId: string, amountFcfa: number, payToken: string): Promise<OmStatus> {
    const token = await this.getToken();
    const res = await fetch(`${this.base}/${this.country}/v1/transactionstatus`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: tripId, amount: Math.round(amountFcfa), pay_token: payToken }),
    });
    if (!res.ok) throw new BadRequestException('Statut Orange Money indisponible');
    return res.json() as Promise<OmStatus>;
  }
}
