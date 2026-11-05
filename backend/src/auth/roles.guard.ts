import {
  Injectable, CanActivate, ExecutionContext, ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY, AuthUser } from './auth.decorators';

/**
 * Contrôle d'accès par rôle (enregistré en APP_GUARD, après le JwtAuthGuard).
 * Sans @Roles sur la route, aucun rôle n'est exigé (auth seule suffit).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;

    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = ctx.switchToHttp().getRequest().user as AuthUser;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Accès réservé : ' + required.join(', '));
    }
    return true;
  }
}
