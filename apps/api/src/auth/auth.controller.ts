import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ErrorCode,
  LoginInput,
  RefreshInput,
  RegisterInput,
  RequestPasswordResetInput,
  ResetPasswordInput,
  UpdateProfileInput,
  VerifyEmailInput,
  type AuthTokens,
} from '@derslik/shared';
import type { Request, Response } from 'express';
import { Inject } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Public, type AuthUser } from '../common/auth';
import { AppError } from '../common/errors';
import { Zod } from '../common/zod';
import { CONFIG, type AppConfig } from '../config';
import { AuthService, type IssuedSession } from './auth.service';

export const REFRESH_COOKIE = 'dl_rt';
const STRICT = { default: { limit: 10, ttl: 60_000 } };

/** Mobil istemci `X-Client: mobile` başlığı gönderir ve refresh token'ı gövdede alır (SecureStore'da saklar). */
function clientOf(req: Request): 'web' | 'mobile' {
  return req.headers['x-client'] === 'mobile' ? 'mobile' : 'web';
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private respond(req: Request, res: Response, s: IssuedSession): AuthTokens {
    if (clientOf(req) === 'mobile') {
      return { accessToken: s.accessToken, accessTokenExpiresAt: s.accessTokenExpiresAt, refreshToken: s.refreshToken };
    }
    res.cookie(REFRESH_COOKIE, s.refreshToken, {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/api/auth',
      expires: s.refreshExpiresAt,
    });
    return { accessToken: s.accessToken, accessTokenExpiresAt: s.accessTokenExpiresAt };
  }

  /** Çerezle yapılan isteklerde Origin izinli listede olmalı (CSRF savunması). */
  private assertOrigin(req: Request) {
    const origin = req.headers.origin;
    if (!origin) return;
    const allowed = this.config.CORS_ORIGINS.split(',').map((s) => s.trim());
    if (!allowed.includes(origin)) throw new AppError(ErrorCode.FORBIDDEN, 'İzin verilmeyen kaynak');
  }

  @Public()
  @Throttle(STRICT)
  @Post('register')
  async register(@Body(new Zod(RegisterInput)) body: RegisterInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(req, res, await this.auth.register(body, clientOf(req)));
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('login')
  async login(@Body(new Zod(LoginInput)) body: LoginInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(req, res, await this.auth.login(body.email, body.password, clientOf(req)));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Body(new Zod(RefreshInput)) body: z.infer<typeof RefreshInput>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const token = body.refreshToken ?? fromCookie;
    if (!body.refreshToken && fromCookie) this.assertOrigin(req);
    if (!token) throw new AppError(ErrorCode.UNAUTHENTICATED, 'Oturum bulunamadı');
    return this.respond(req, res, await this.auth.refresh(token));
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Body(new Zod(RefreshInput)) body: z.infer<typeof RefreshInput>, @Req() req: Request & { user?: AuthUser }, @Res({ passthrough: true }) res: Response) {
    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await this.auth.logout(body.refreshToken ?? fromCookie, req.user?.sessionId);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(204)
  @Post('verify-email')
  async verifyEmail(@Body(new Zod(VerifyEmailInput)) body: { token: string }) {
    await this.auth.verifyEmail(body.token);
  }

  @Throttle(STRICT)
  @HttpCode(204)
  @Post('resend-verification')
  async resend(@CurrentUser() user: AuthUser) {
    const me = await this.auth.me(user.id);
    if (!me.user.emailVerified) await this.auth.sendVerification(user.id, me.user.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @Post('request-password-reset')
  async requestReset(@Body(new Zod(RequestPasswordResetInput)) body: { email: string }) {
    await this.auth.requestPasswordReset(body.email);
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(204)
  @Post('reset-password')
  async reset(@Body(new Zod(ResetPasswordInput)) body: { token: string; password: string }) {
    await this.auth.resetPassword(body.token, body.password);
  }
}

@Controller('me')
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body(new Zod(UpdateProfileInput)) body: z.infer<typeof UpdateProfileInput>) {
    return this.auth.updateProfile(user.id, body);
  }
}
