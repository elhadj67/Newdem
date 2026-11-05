import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/** Marque une route comme publique (contourne l'auth JWT) : OTP, webhooks. */
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restreint une route à certains rôles. Ex : @Roles('driver'). */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Injecte l'utilisateur authentifié (payload du JWT) dans un paramètre. */
export interface AuthUser { sub: string; role: UserRole }
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | string => {
    const user = ctx.switchToHttp().getRequest().user as AuthUser;
    return data ? user?.[data] : user;
  },
);
