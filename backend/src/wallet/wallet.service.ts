import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, PaymentMethod, TxnType } from '@prisma/client';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async getOrCreate(driverId: string) {
    return this.prisma.wallet.upsert({
      where: { driverId },
      update: {},
      create: { driverId, balance: 0n },
    });
  }

  /** Un conducteur ne peut passer en ligne que si son solde >= plancher. */
  async canGoOnline(driverId: string): Promise<boolean> {
    const w = await this.getOrCreate(driverId);
    return w.balance >= w.minBalance;
  }

  /**
   * Écrit un mouvement dans le grand livre et met à jour le solde,
   * de façon atomique. `amount` est signé (+ crédit, - débit).
   */
  private async post(
    tx: Prisma.TransactionClient,
    driverId: string,
    type: TxnType,
    amount: bigint,
    note: string,
    tripId?: string,
  ) {
    const wallet = await tx.wallet.update({
      where: { driverId },
      data: { balance: { increment: amount } },
    });
    await tx.walletLedger.create({
      data: {
        walletId: wallet.id,
        tripId: tripId ?? null,
        type,
        amount,
        balanceAfter: wallet.balance,
        note,
      },
    });
    return wallet;
  }

  /**
   * Règlement d'une course terminée. Logique différente selon le paiement :
   *
   *  - ESPÈCES : le conducteur a encaissé tout le cash. On lui DÉBITE
   *    seulement la commission Newdem du portefeuille.
   *  - WAVE / OM : Newdem a encaissé la totalité (transaction `in`), garde
   *    la commission, et CRÉDITE la part conducteur au portefeuille
   *    (réglée ensuite par payout).
   */
  async settleTrip(params: {
    driverId: string;
    tripId: string;
    fare: number;
    commission: number;
    method: PaymentMethod;
  }) {
    const { driverId, tripId, fare, commission, method } = params;
    const driverShare = BigInt(fare - commission);
    const commissionB = BigInt(commission);

    return this.prisma.$transaction(async (tx) => {
      if (method === 'cash') {
        return this.post(tx, driverId, 'commission', -commissionB,
          `Commission course ${tripId}`, tripId);
      }
      // mobile money : la part conducteur arrive au portefeuille
      return this.post(tx, driverId, 'ride_payment', driverShare,
        `Part course ${tripId} (${method})`, tripId);
    });
  }

  /** Recharge du portefeuille (retour d'un encaissement Wave/OM validé). */
  async topUp(driverId: string, amount: number, provider: string) {
    return this.prisma.$transaction((tx) =>
      this.post(tx, driverId, 'wallet_topup', BigInt(amount), `Recharge ${provider}`),
    );
  }

  async ledger(driverId: string, limit = 30) {
    const w = await this.getOrCreate(driverId);
    return this.prisma.walletLedger.findMany({
      where: { walletId: w.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
