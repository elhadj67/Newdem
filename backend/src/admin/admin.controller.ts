import {
  Controller, Get, Post, Param, Body, Res, StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { AdminService } from './admin.service';
import { KycService } from '../drivers/kyc.service';
import { Roles } from '../auth/auth.decorators';

/** Espace d'administration — entièrement réservé au rôle admin. */
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService, private kyc: KycService) {}

  /** Dossiers KYC en attente de revue. */
  @Get('kyc/pending')
  pending() {
    return this.admin.pendingKyc();
  }

  /** Détail d'un dossier (conducteur + pièces). */
  @Get('kyc/:driverId')
  detail(@Param('driverId') driverId: string) {
    return this.admin.kycDetail(driverId);
  }

  /** Sert le fichier d'une pièce (image/PDF) depuis le stockage privé. */
  @Get('kyc/:driverId/documents/:kind')
  async document(
    @Param('driverId') driverId: string,
    @Param('kind') kind: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, mime } = await this.admin.readDocument(driverId, kind);
    res.set({ 'Content-Type': mime, 'Cache-Control': 'no-store' });
    return new StreamableFile(buffer);
  }

  /** Décision de revue : approuver ou rejeter le dossier. */
  @Post('kyc/:driverId/review')
  review(@Param('driverId') driverId: string, @Body() b: { approved: boolean }) {
    return this.kyc.review(driverId, b.approved);
  }
}
