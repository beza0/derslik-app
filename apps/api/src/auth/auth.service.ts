import { Inject, Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { DEFAULT_TIMEZONE, ErrorCode, type MeResponse, type RegisterInput } from '@derslik/shared';
import { CONFIG, type AppConfig } from '../config';
import { DB, PgError, pgErrorCode, type Db } from '../db/db';
import {
  appUser,
  emailToken,
  guardianLink,
  session,
  student,
  studentAccountLink,
  subscription,
  workspace,
} from '../db/schema';
import { AppError } from '../common/errors';
import { randomToken, sha256 } from '../common/crypto';
import { TokenService } from '../common/auth';
import { MailService } from '../common/mail.service';
import { EntitlementsService } from '../billing/entitlements.service';

const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const; // OWASP önerisi (argon2id)
// Kullanıcı yokken de doğrulama süresini eşitlemek için sabit bir hash.
let dummyHash: Promise<string> | null = null;

export interface IssuedSession {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async register(input: RegisterInput, client: 'web' | 'mobile'): Promise<IssuedSession> {
    const passwordHash = await hash(input.password, ARGON);
    const timezone = input.timezone ?? DEFAULT_TIMEZONE;
    let userId: string;
    try {
      userId = await this.db.transaction(async (tx) => {
        const [u] = await tx
          .insert(appUser)
          .values({ email: input.email.trim(), passwordHash, name: input.name, timezone })
          .returning({ id: appUser.id });
        if (input.role === 'teacher') {
          const [ws] = await tx
            .insert(workspace)
            .values({ ownerUserId: u!.id, displayName: input.name, timezone })
            .returning({ id: workspace.id });
          const freeVersionId = await this.entitlements.freePlanVersion(tx);
          await tx.insert(subscription).values({ workspaceId: ws!.id, planVersionId: freeVersionId, status: 'free' });
        }
        return u!.id;
      });
    } catch (err) {
      if (pgErrorCode(err) === PgError.UNIQUE_VIOLATION) {
        throw new AppError(ErrorCode.EMAIL_TAKEN, 'Bu e-posta adresiyle bir hesap zaten var');
      }
      throw err;
    }
    await this.sendVerification(userId, input.email);
    return this.issue(userId, client);
  }

  async login(email: string, password: string, client: 'web' | 'mobile'): Promise<IssuedSession> {
    const [u] = await this.db
      .select({ id: appUser.id, hash: appUser.passwordHash, status: appUser.status })
      .from(appUser)
      .where(sql`lower(${appUser.email}) = lower(${email.trim()})`)
      .limit(1);
    if (!u) {
      dummyHash ??= hash('timing-equalizer-password', ARGON);
      await verify(await dummyHash, password).catch(() => false);
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'E-posta veya parola hatalı');
    }
    const ok = await verify(u.hash, password).catch(() => false);
    if (!ok) throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'E-posta veya parola hatalı');
    if (u.status !== 'active') throw new AppError(ErrorCode.FORBIDDEN, 'Hesap kullanıma kapalı');
    return this.issue(u.id, client);
  }

  private async issue(userId: string, client: 'web' | 'mobile', tx: Db | Parameters<Parameters<Db['transaction']>[0]>[0] = this.db): Promise<IssuedSession> {
    const refreshToken = randomToken(32);
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    const [s] = await tx
      .insert(session)
      .values({ userId, tokenHash: sha256(refreshToken), client, expiresAt: refreshExpiresAt })
      .returning({ id: session.id });
    const access = await this.tokens.signAccess({ id: userId, sessionId: s!.id });
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken,
      refreshExpiresAt,
    };
  }

  /**
   * Refresh token döndürme. Daha önce kullanılmış (döndürülmüş) bir token tekrar gelirse
   * çalınmış kabul edilir ve kullanıcının tüm oturumları kapatılır.
   */
  async refresh(refreshToken: string): Promise<IssuedSession> {
    const outcome = await this.db.transaction(async (tx) => {
      const rows = await tx.execute<{ id: string; user_id: string; client: 'web' | 'mobile'; expires_at: Date; revoked_at: Date | null }>(
        sql`SELECT id, user_id, client, expires_at, revoked_at FROM session WHERE token_hash = ${sha256(refreshToken)} FOR UPDATE`,
      );
      const s = rows.rows[0];
      if (!s) throw new AppError(ErrorCode.UNAUTHENTICATED, 'Oturum geçersiz');
      if (s.revoked_at) return { kind: 'reused' as const, userId: s.user_id };
      if (new Date(s.expires_at) <= new Date()) throw new AppError(ErrorCode.UNAUTHENTICATED, 'Oturum süresi doldu');
      const [u] = await tx.select({ status: appUser.status }).from(appUser).where(eq(appUser.id, s.user_id));
      if (u?.status !== 'active') throw new AppError(ErrorCode.UNAUTHENTICATED, 'Hesap kullanıma kapalı');
      const next = await this.issue(s.user_id, s.client, tx);
      await tx.update(session).set({ revokedAt: new Date() }).where(eq(session.id, s.id));
      return { kind: 'ok' as const, next };
    });
    if (outcome.kind === 'reused') {
      // Transaction dışında: hata fırlatmak geri alma yapmasın diye. Kullanıcının tüm oturumları kapanır.
      await this.db
        .update(session)
        .set({ revokedAt: new Date() })
        .where(and(eq(session.userId, outcome.userId), isNull(session.revokedAt)));
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'Oturum geçersiz');
    }
    return outcome.next;
  }

  async logout(refreshToken: string | undefined, sessionId?: string): Promise<void> {
    if (refreshToken) {
      await this.db.update(session).set({ revokedAt: new Date() }).where(eq(session.tokenHash, sha256(refreshToken)));
    }
    if (sessionId) {
      await this.db.update(session).set({ revokedAt: new Date() }).where(eq(session.id, sessionId));
    }
  }

  /** Erişim token'ı imzası geçerli olsa bile oturum kapatıldıysa reddedilir. */
  async assertSessionActive(sessionId: string): Promise<void> {
    const [s] = await this.db
      .select({ id: session.id })
      .from(session)
      .where(and(eq(session.id, sessionId), isNull(session.revokedAt), gt(session.expiresAt, new Date())));
    if (!s) throw new AppError(ErrorCode.UNAUTHENTICATED, 'Oturum kapatılmış');
  }

  private async createEmailToken(userId: string, purpose: 'verify_email' | 'reset_password', ttlMs: number) {
    const token = randomToken(32);
    await this.db.insert(emailToken).values({ userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) });
    return token;
  }

  async sendVerification(userId: string, email: string) {
    const token = await this.createEmailToken(userId, 'verify_email', 48 * 3600 * 1000);
    await this.mail.send({
      to: email,
      subject: 'E-posta adresinizi doğrulayın',
      text: `Hesabınızı doğrulamak için: ${this.config.APP_URL}/verify-email?token=${token}`,
    });
  }

  private async consumeEmailToken(token: string, purpose: 'verify_email' | 'reset_password') {
    const [row] = await this.db
      .update(emailToken)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(emailToken.tokenHash, sha256(token)),
          eq(emailToken.purpose, purpose),
          isNull(emailToken.usedAt),
          gt(emailToken.expiresAt, new Date()),
        ),
      )
      .returning({ userId: emailToken.userId });
    if (!row) throw new AppError(ErrorCode.TOKEN_INVALID, 'Bağlantı geçersiz veya süresi dolmuş');
    return row.userId;
  }

  async verifyEmail(token: string) {
    const userId = await this.consumeEmailToken(token, 'verify_email');
    await this.db.update(appUser).set({ emailVerifiedAt: new Date() }).where(eq(appUser.id, userId));
  }

  /** Hesap olsun olmasın aynı yanıt döner (e-posta numaralandırmasını önler). */
  async requestPasswordReset(email: string) {
    const [u] = await this.db
      .select({ id: appUser.id, email: appUser.email })
      .from(appUser)
      .where(sql`lower(${appUser.email}) = lower(${email.trim()})`);
    if (!u) return;
    const token = await this.createEmailToken(u.id, 'reset_password', 3600 * 1000);
    await this.mail.send({
      to: u.email,
      subject: 'Parola sıfırlama',
      text: `Parolanızı sıfırlamak için (1 saat geçerli): ${this.config.APP_URL}/reset-password?token=${token}`,
    });
  }

  async resetPassword(token: string, password: string) {
    const userId = await this.consumeEmailToken(token, 'reset_password');
    const passwordHash = await hash(password, ARGON);
    await this.db.transaction(async (tx) => {
      await tx.update(appUser).set({ passwordHash, updatedAt: new Date() }).where(eq(appUser.id, userId));
      // Parola değişince tüm oturumlar kapanır.
      await tx.update(session).set({ revokedAt: new Date() }).where(and(eq(session.userId, userId), isNull(session.revokedAt)));
    });
  }

  async me(userId: string): Promise<MeResponse> {
    const [u] = await this.db.select().from(appUser).where(eq(appUser.id, userId));
    if (!u) throw new AppError(ErrorCode.UNAUTHENTICATED, 'Oturum geçersiz');
    const [ws] = await this.db.select().from(workspace).where(eq(workspace.ownerUserId, userId));
    const studentLinks = await this.db
      .select({ studentId: studentAccountLink.studentId, workspaceId: studentAccountLink.workspaceId, teacherName: workspace.displayName })
      .from(studentAccountLink)
      .innerJoin(workspace, eq(workspace.id, studentAccountLink.workspaceId))
      .where(eq(studentAccountLink.userId, userId));
    const guardianLinks = await this.db
      .select({
        studentId: guardianLink.studentId,
        workspaceId: guardianLink.workspaceId,
        studentName: student.displayName,
        teacherName: workspace.displayName,
      })
      .from(guardianLink)
      .innerJoin(student, eq(student.id, guardianLink.studentId))
      .innerJoin(workspace, eq(workspace.id, guardianLink.workspaceId))
      .where(eq(guardianLink.userId, userId));
    return {
      user: { id: u.id, email: u.email, name: u.name, emailVerified: Boolean(u.emailVerifiedAt), isAdmin: u.isAdmin },
      contexts: {
        teacher: ws ? { workspaceId: ws.id, timezone: ws.timezone } : null,
        studentLinks,
        guardianLinks,
        admin: u.isAdmin,
      },
    };
  }

  async updateProfile(userId: string, patch: { name?: string; timezone?: string }) {
    await this.db.transaction(async (tx) => {
      if (patch.name || patch.timezone) {
        await tx.update(appUser).set({ ...patch, updatedAt: new Date() }).where(eq(appUser.id, userId));
        await tx
          .update(workspace)
          .set({ ...(patch.name ? { displayName: patch.name } : {}), ...(patch.timezone ? { timezone: patch.timezone } : {}) })
          .where(eq(workspace.ownerUserId, userId));
      }
    });
    return this.me(userId);
  }
}
