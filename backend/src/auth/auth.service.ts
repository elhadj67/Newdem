import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

const REFRESH_TTL_DAYS = 60;

/**
 * Auth par OTP SMS + jetons rotatifs :
 *   - access token : JWT court (15 min), porté dans Authorization.
 *   - refresh token : chaîne opaque longue durée, hash stocké en base,
 *     ROTATIF (chaque rafraîchissement révoque l'ancien) et révocable.
 */
@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async requestOtp(phone: string): Promise<{ sent: true }> {
    const code = '' + Math.floor(100000 + Math.random() * 900000);
    const codeHash = this.sha256(code);
    await this.prisma.otpCode.create({
      data: { phone, codeHash, expiresAt: new Date(Date.now() + 5 * 60_000) },
    });
    await this.sendSms(phone, `Newdem : votre code est ${code}`);
    return { sent: true };
  }

  async verifyOtp(phone: string, code: string) {
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.codeHash !== this.sha256(code)) {
      throw new UnauthorizedException('Code invalide ou expiré');
    }
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    const user = await this.prisma.user.upsert({
      where: { phone }, update: {}, create: { phone, role: 'passenger' },
    });
    const tokens = await this.issueTokens(user.id, user.role);
    return { ...tokens, user };
  }

  /** Rotation : valide le refresh, révoque l'ancien, émet une nouvelle paire. */
  async refresh(refreshToken: string) {
    const hash = this.sha256(refreshToken);
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token invalide');
    }
    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    if (!user) throw new UnauthorizedException('Utilisateur introuvable');

    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    return this.issueTokens(user.id, user.role);
  }

  /** Déconnexion : révoque le refresh token présenté. */
  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------
  private async issueTokens(userId: string, role: string) {
    const accessToken = await this.jwt.signAsync({ sub: userId, role }); // exp 15m (module)
    const refreshToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000),
      },
    });
    return { accessToken, refreshToken };
  }

  private sha256(v: string) {
    return crypto.createHash('sha256').update(v).digest('hex');
  }

  private async sendSms(phone: string, message: string): Promise<void> {
    // TODO: brancher un fournisseur SMS (Orange SMS API, Twilio…).
    this.log.log(`SMS -> ${phone} : ${message}`);
  }
}
