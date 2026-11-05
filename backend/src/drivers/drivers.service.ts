import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class DriversService {
  constructor(private prisma: PrismaService, private wallet: WalletService) {}

  /** Profil conducteur de l'utilisateur authentifié (avec véhicules et note). */
  async me(userId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      include: { vehicles: true },
    });
    if (!driver) throw new NotFoundException('Aucun profil conducteur');
    return {
      id: driver.id,
      kycStatus: driver.kycStatus,
      status: driver.status,
      rating: Number(driver.rating),
      ratingCount: driver.ratingCount,
      vehicles: driver.vehicles,
    };
  }

  /** Solde + derniers mouvements du portefeuille du conducteur authentifié. */
  async wallet_(userId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) throw new NotFoundException('Aucun profil conducteur');
    const wallet = await this.wallet.getOrCreate(driver.id);
    const ledger = await this.wallet.ledger(driver.id);
    return {
      balance: Number(wallet.balance),
      minBalance: Number(wallet.minBalance),
      currency: wallet.currency,
      ledger: ledger.map((e) => ({
        type: e.type,
        amount: Number(e.amount),
        balanceAfter: Number(e.balanceAfter),
        note: e.note,
        createdAt: e.createdAt,
      })),
    };
  }

  /**
   * Passage en ligne / hors ligne. Le passage en ligne est refusé si le solde
   * du portefeuille est sous le plancher (le conducteur doit recharger).
   */
  async setOnline(userId: string, online: boolean) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) throw new NotFoundException('Aucun profil conducteur');
    if (online && !(await this.wallet.canGoOnline(driver.id))) {
      throw new ForbiddenException('Solde insuffisant : rechargez pour repasser en ligne');
    }
    await this.prisma.driver.update({
      where: { id: driver.id },
      data: { status: online ? 'online' : 'offline' },
    });
    return { id: driver.id, status: online ? 'online' : 'offline' };
  }
}
