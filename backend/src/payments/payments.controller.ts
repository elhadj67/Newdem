import {
  Controller, Post, Req, Body, Headers, HttpCode, BadRequestException, Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { WaveService } from './wave.service';
import { OrangeMoneyService } from './orange-money.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { MetricsService } from '../observability/metrics.service';
import { Public } from '../auth/auth.decorators';

@Controller('payments')
export class PaymentsController {
  private readonly log = new Logger(PaymentsController.name);

  constructor(
    private wave: WaveService,
    private om: OrangeMoneyService,
    private prisma: PrismaService,
    private wallet: WalletService,
    private metrics: MetricsService,
  ) {}

  // ============================ WAVE ============================
  /**
   * Webhook Wave. Corps BRUT requis pour vérifier la signature HMAC-SHA256.
   * On n'établit la vérité de paiement qu'ici, jamais sur un retour client.
   */
  @Public()
  @Post('wave/webhook')
  @HttpCode(200)
  async waveWebhook(@Req() req: Request, @Headers('x-wave-signature') signature: string) {
    const raw = (req as any).rawBody as Buffer;
    if (!this.wave.verifySignature(raw, signature)) {
      throw new BadRequestException('Signature invalide');
    }
    const event = JSON.parse(raw.toString('utf8'));
    const key = `wave:${event.id}`;
    if (await this.isDuplicate(key)) return { ok: true, duplicate: true };

    if (event.type === 'checkout.session.completed') {
      await this.markPaid({
        tripId: event.data?.client_reference,
        provider: 'wave',
        method: 'wave',
        amount: Number(event.data?.amount ?? 0),
        externalRef: event.data?.id,
        idempotencyKey: key,
        raw: event,
      });
    }
    return { ok: true };
  }

  // ======================= ORANGE MONEY =======================
  /**
   * Notification Orange Money (notif_url). Pas de signature HMAC : on
   *   1) retrouve la transaction en attente pour cette course,
   *   2) vérifie le notif_token qu'on avait émis,
   *   3) CONFIRME le statut cote serveur via /transactionstatus,
   * avant de marquer la course payee.
   */
  @Public()
  @Post('orange-money/notify')
  @HttpCode(200)
  async omNotify(@Body() body: { status: string; txnid?: string; notif_token?: string; order_id?: string }) {
    const tripId = body.order_id;
    const pending = await this.prisma.transaction.findFirst({
      where: { tripId, provider: 'orange_money', status: { in: ['pending', 'processing'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending) return { ok: true, ignored: 'aucune transaction en attente' };

    const stored = (pending.raw as any)?.notif_token;
    if (stored && body.notif_token && stored !== body.notif_token) {
      throw new BadRequestException('notif_token non concordant');
    }

    const trip = await this.prisma.trip.findUnique({ where: { id: tripId! } });
    const amount = Number(trip?.finalFare ?? trip?.quotedFare ?? 0);
    const confirmed = await this.om.checkStatus(tripId!, amount, pending.externalRef!);

    const key = `om:${confirmed.txnid ?? body.txnid ?? pending.id}`;
    if (await this.isDuplicate(key)) return { ok: true, duplicate: true };

    if (confirmed.status === 'SUCCESS') {
      await this.prisma.transaction.update({
        where: { id: pending.id },
        data: { status: 'paid', idempotencyKey: key, raw: { ...(pending.raw as any), confirmed } },
      });
      await this.settle(tripId!, 'orange_money');
    } else if (confirmed.status === 'FAILED' || confirmed.status === 'EXPIRED') {
      await this.prisma.transaction.update({ where: { id: pending.id }, data: { status: 'failed' } });
      if (tripId) await this.prisma.trip.update({ where: { id: tripId }, data: { paymentStatus: 'failed' } });
    }
    return { ok: true, status: confirmed.status };
  }

  // ============================ commun ============================
  private async isDuplicate(idempotencyKey: string): Promise<boolean> {
    return !!(await this.prisma.transaction.findUnique({ where: { idempotencyKey } }));
  }

  /** Cree la transaction `paid` (Wave) puis regle la course. */
  private async markPaid(p: {
    tripId: string; provider: string; method: 'wave' | 'orange_money';
    amount: number; externalRef?: string; idempotencyKey: string; raw: any;
  }) {
    const trip = await this.prisma.trip.findUnique({ where: { id: p.tripId } });
    if (!trip) return;
    await this.prisma.transaction.create({
      data: {
        tripId: p.tripId, provider: p.provider, method: p.method, direction: 'in',
        amount: BigInt(p.amount), status: 'paid',
        externalRef: p.externalRef, idempotencyKey: p.idempotencyKey, raw: p.raw,
      },
    });
    await this.settle(p.tripId, p.method);
  }

  /** Marque la course payee et credite la part conducteur au portefeuille. */
  private async settle(tripId: string, method: 'wave' | 'orange_money') {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return;
    await this.prisma.trip.update({ where: { id: tripId }, data: { paymentStatus: 'paid' } });
    this.metrics.payments.inc({ provider: method, status: 'paid' });
    if (trip.driverId && trip.finalFare && trip.commissionAmount) {
      await this.wallet.settleTrip({
        driverId: trip.driverId, tripId,
        fare: Number(trip.finalFare), commission: Number(trip.commissionAmount), method,
      });
    }
  }
}
