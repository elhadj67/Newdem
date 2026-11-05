import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/** Pièces exigées pour valider un conducteur (cf. schéma driver_documents). */
export const REQUIRED_DOCS = ['id_card', 'license', 'registration', 'insurance'] as const;
export type DocKind = (typeof REQUIRED_DOCS)[number];

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'application/pdf'];

@Injectable()
export class KycService {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  private async driverOf(userId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) throw new NotFoundException('Aucun profil conducteur');
    return driver;
  }

  /** Ajoute (ou remplace) une pièce d'un type donné. */
  async addDocument(userId: string, kind: string, file: { buffer: Buffer; mimetype: string; originalname: string }) {
    if (!REQUIRED_DOCS.includes(kind as DocKind)) {
      throw new BadRequestException(`Type de pièce invalide : ${kind}`);
    }
    if (!file || !ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Format accepté : JPEG, PNG ou PDF');
    }
    const driver = await this.driverOf(userId);
    const ext = file.mimetype === 'application/pdf' ? 'pdf' : file.mimetype.split('/')[1];
    const url = await this.storage.save(`${driver.id}/${kind}-${Date.now()}.${ext}`, file.buffer);

    // Une pièce active par type : on retire les anciennes du même type.
    await this.prisma.driverDocument.deleteMany({ where: { driverId: driver.id, kind } });
    const doc = await this.prisma.driverDocument.create({
      data: { driverId: driver.id, kind, fileUrl: url, verified: false },
    });

    // Toute nouvelle pièce repasse le dossier en 'pending' (à re-soumettre).
    if (driver.kycStatus !== 'approved') {
      await this.prisma.driver.update({ where: { id: driver.id }, data: { kycStatus: 'pending' } });
    }
    return { kind: doc.kind, verified: doc.verified, uploadedAt: doc.createdAt };
  }

  /** État KYC du conducteur : statut global + pièces manquantes/présentes. */
  async status(userId: string) {
    const driver = await this.driverOf(userId);
    const docs = await this.prisma.driverDocument.findMany({ where: { driverId: driver.id } });
    const present = new Set(docs.map((d) => d.kind));
    return {
      kycStatus: driver.kycStatus,
      documents: REQUIRED_DOCS.map((kind) => {
        const d = docs.find((x) => x.kind === kind);
        return { kind, uploaded: present.has(kind), verified: d?.verified ?? false };
      }),
      missing: REQUIRED_DOCS.filter((k) => !present.has(k)),
    };
  }

  /** Soumission pour revue : refusée tant que les 4 pièces ne sont pas là. */
  async submit(userId: string) {
    const driver = await this.driverOf(userId);
    const docs = await this.prisma.driverDocument.findMany({ where: { driverId: driver.id } });
    const present = new Set(docs.map((d) => d.kind));
    const missing = REQUIRED_DOCS.filter((k) => !present.has(k));
    if (missing.length) throw new BadRequestException(`Pièces manquantes : ${missing.join(', ')}`);

    await this.prisma.driver.update({ where: { id: driver.id }, data: { kycStatus: 'submitted' } });
    return { kycStatus: 'submitted' };
  }

  /** Revue par un administrateur : approuve ou rejette le dossier. */
  async review(driverId: string, approved: boolean) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Conducteur introuvable');
    await this.prisma.$transaction([
      this.prisma.driver.update({
        where: { id: driverId },
        data: { kycStatus: approved ? 'approved' : 'rejected' },
      }),
      this.prisma.driverDocument.updateMany({
        where: { driverId },
        data: { verified: approved },
      }),
    ]);
    return { kycStatus: approved ? 'approved' : 'rejected' };
  }
}
