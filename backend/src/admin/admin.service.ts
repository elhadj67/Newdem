import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  /** Dossiers en attente de revue (soumis), du plus ancien au plus récent. */
  async pendingKyc() {
    const drivers = await this.prisma.driver.findMany({
      where: { kycStatus: 'submitted' },
      include: { user: true, _count: { select: { vehicles: true } } },
      orderBy: { updatedAt: 'asc' },
    });
    const rows = [];
    for (const d of drivers) {
      const docCount = await this.prisma.driverDocument.count({ where: { driverId: d.id } });
      rows.push({
        driverId: d.id,
        phone: d.user.phone,
        name: d.user.name,
        submittedAt: d.updatedAt,
        documentCount: docCount,
      });
    }
    return rows;
  }

  /** Détail d'un dossier : conducteur, véhicules, pièces (métadonnées). */
  async kycDetail(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true, vehicles: true },
    });
    if (!driver) throw new NotFoundException('Conducteur introuvable');
    const docs = await this.prisma.driverDocument.findMany({ where: { driverId } });
    return {
      driverId: driver.id,
      phone: driver.user.phone,
      name: driver.user.name,
      kycStatus: driver.kycStatus,
      vehicles: driver.vehicles,
      documents: docs.map((d) => ({ kind: d.kind, verified: d.verified, uploadedAt: d.createdAt })),
    };
  }

  /**
   * Lit une pièce depuis le stockage privé pour la servir à l'admin
   * (l'accès est protégé par le rôle admin ; en prod, préférer une URL signée).
   */
  async readDocument(driverId: string, kind: string): Promise<{ buffer: Buffer; mime: string }> {
    const doc = await this.prisma.driverDocument.findFirst({ where: { driverId, kind } });
    if (!doc) throw new NotFoundException('Pièce introuvable');
    const ext = doc.fileUrl.split('.').pop() ?? '';
    const buffer = await this.storage.read(doc.fileUrl);
    return { buffer, mime: MIME[ext] ?? 'application/octet-stream' };
  }
}
