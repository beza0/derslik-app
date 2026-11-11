import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@derslik/shared';
import type { Request } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { CONFIG, type AppConfig } from '../config';
import { DB, type Db } from '../db/db';
import { appUser, session } from '../db/schema';
import { AppError } from './errors';

export interface AuthUser {
  id: string;
  sessionId: string;
}

export const IS_PUBLIC = 'isPublic';
/** Kimlik doğrulama gerektirmeyen uç. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
  if (!req.user) throw new AppError(ErrorCode.UNAUTHENTICATED, 'Oturum gerekli');
  return req.user;
});

export const ACCESS_TTL_SECONDS = 15 * 60;

@Injectable()
export class TokenService {
  private readonly key: Uint8Array;
  constructor(@Inject(CONFIG) config: AppConfig) {
    this.key = new TextEncoder().encode(config.JWT_SECRET);
  }

  async signAccess(user: AuthUser): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + ACCESS_TTL_SECONDS * 1000);
    const token = await new SignJWT({ sid: user.sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .setAudience('derslik-api')
      .sign(this.key);
    return { token, expiresAt };
  }

  async verifyAccess(token: string): Promise<AuthUser> {
    const { payload } = await jwtVerify(token, this.key, { audience: 'derslik-api', algorithms: ['HS256'] });
    if (!payload.sub || typeof payload.sid !== 'string') throw new Error('invalid');
    return { id: payload.sub, sessionId: payload.sid };
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    @Inject(DB) private readonly db: Db,
  ) {}

  /** İmza geçerli olsa da oturum kapatılmış veya hesap askıya alınmışsa token reddedilir. */
  private async sessionActive(user: AuthUser): Promise<boolean> {
    const [row] = await this.db
      .select({ id: session.id })
      .from(session)
      .innerJoin(appUser, eq(appUser.id, session.userId))
      .where(
        and(
          eq(session.id, user.sessionId),
          eq(session.userId, user.id),
          isNull(session.revokedAt),
          gt(session.expiresAt, new Date()),
          eq(appUser.status, 'active'),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const user = await this.tokens.verifyAccess(header.slice(7));
        if (!(await this.sessionActive(user))) throw new Error('session closed');
        req.user = user;
      } catch {
        if (!isPublic) throw new AppError(ErrorCode.UNAUTHENTICATED, 'Oturum süresi doldu veya geçersiz');
      }
    }
    if (isPublic) return true;
    if (!req.user) throw new AppError(ErrorCode.UNAUTHENTICATED, 'Oturum gerekli');
    return true;
  }
}
