import {
  Body, Controller, Get, Post, Param, UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DriversService } from './drivers.service';
import { KycService } from './kyc.service';
import { Roles, CurrentUser } from '../auth/auth.decorators';

/** Endpoints conducteurs (profil déduit du JWT) + KYC. */
@Controller()
export class DriversController {
  constructor(private drivers: DriversService, private kyc: KycService) {}

  @Roles('driver')
  @Get('drivers/me')
  me(@CurrentUser('sub') userId: string) {
    return this.drivers.me(userId);
  }

  @Roles('driver')
  @Get('wallets/me')
  wallet(@CurrentUser('sub') userId: string) {
    return this.drivers.wallet_(userId);
  }

  @Roles('driver')
  @Post('drivers/status')
  status(@CurrentUser('sub') userId: string, @Body() b: { online: boolean }) {
    return this.drivers.setOnline(userId, b.online);
  }

  // ---------------------------- KYC ----------------------------
  /** Upload d'une pièce (multipart : champ `file` + `kind`). Limite 5 Mo. */
  @Roles('driver')
  @Post('drivers/kyc/documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadDoc(
    @CurrentUser('sub') userId: string,
    @UploadedFile() file: any,
    @Body('kind') kind: string,
  ) {
    if (!file) throw new BadRequestException('Fichier manquant');
    return this.kyc.addDocument(userId, kind, file);
  }

  @Roles('driver')
  @Get('drivers/kyc')
  kycStatus(@CurrentUser('sub') userId: string) {
    return this.kyc.status(userId);
  }

  @Roles('driver')
  @Post('drivers/kyc/submit')
  submitKyc(@CurrentUser('sub') userId: string) {
    return this.kyc.submit(userId);
  }

  /** Revue du dossier par un administrateur. */
  @Roles('admin')
  @Post('drivers/:id/kyc/review')
  reviewKyc(@Param('id') driverId: string, @Body() b: { approved: boolean }) {
    return this.kyc.review(driverId, b.approved);
  }
}
