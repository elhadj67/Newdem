import {
  Injectable, CanActivate, ExecutionContext, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC } from './auth.decorators';

/**
 * Auth par défaut sur toute l'API (enregistré en APP_GUARD).
 * - Les routes @Public() sont laissées passer (OTP, webhooks paiement).
 * - Les contextes non-HTTP (WebSocket) sont ignorés ici : la passerelle
 *   authentifie elle-même le socket à la connexion.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] ?? '';
    if (!header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Jeton manquant');
    }
    try {
      req.user = this.jwt.verify(header.slice(7));
      return true;
    } catch {
      throw new UnauthorizedException('Jeton invalide ou expiré');
    }
  }
}
