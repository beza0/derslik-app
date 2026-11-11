import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { inject } from 'vitest';
import { createApp } from '../src/bootstrap';
import { loadConfig, type AppConfig } from '../src/config';
import { createDb, createPool, type Db } from '../src/db/db';
import { MailService } from '../src/common/mail.service';

export interface TestCtx {
  app: INestApplication;
  pool: Pool;
  db: Db;
  config: AppConfig;
  mail: MailService;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export async function startApp(overrides: Record<string, string> = {}): Promise<TestCtx> {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: inject('databaseUrl'),
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
    AI_PROVIDER: 'fake',
    ...overrides,
  });
  const pool = createPool(config.DATABASE_URL);
  const app = await createApp(config, pool);
  await app.init();
  const server = app.getHttpServer();
  return {
    app,
    pool,
    db: createDb(pool),
    config,
    mail: app.get(MailService),
    http: () => request(server),
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}

let seq = 0;
export function uniqueEmail(prefix = 'u'): string {
  return `${prefix}.${Date.now().toString(36)}.${(seq++).toString(36)}.${Math.random().toString(36).slice(2, 6)}@example.test`;
}

export interface Account {
  email: string;
  token: string;
  userId: string;
  auth: { Authorization: string };
}

export async function register(ctx: TestCtx, role: 'teacher' | 'member' = 'teacher', name = 'Test Kişi'): Promise<Account> {
  const email = uniqueEmail(role);
  const res = await ctx
    .http()
    .post('/api/auth/register')
    .set('X-Client', 'mobile')
    .send({ email, password: 'cok-gizli-parola-123', name, role });
  if (res.status !== 201) throw new Error(`register failed ${res.status} ${JSON.stringify(res.body)}`);
  const token = res.body.accessToken as string;
  const me = await ctx.http().get('/api/me').set('Authorization', `Bearer ${token}`);
  return { email, token, userId: me.body.user.id, auth: { Authorization: `Bearer ${token}` } };
}

/** Test için çalışma alanını daha yüksek limitli bir plana geçirir (ödeme akışı ayrı test edilir). */
export async function upgrade(ctx: TestCtx, t: Account, limit = 10): Promise<void> {
  const { sql, eq } = await import('drizzle-orm');
  const { planVersion, subscription, workspace } = await import('../src/db/schema');
  const [ws] = await ctx.db.select().from(workspace).where(eq(workspace.ownerUserId, t.userId));
  const planId = (await ctx.db.execute<{ id: string }>(sql`SELECT id FROM plan WHERE code = 'pro_draft'`)).rows[0]!.id;
  const [v] = await ctx.db
    .insert(planVersion)
    .values({ planId, version: 100 + Math.floor(Math.random() * 1e9), activeStudentLimit: limit, aiMonthlyQuota: 100, isCurrent: false })
    .returning();
  await ctx.db
    .update(subscription)
    .set({ planVersionId: v!.id, status: 'active', currentPeriodEnd: new Date(Date.now() + 30 * 864e5) })
    .where(eq(subscription.workspaceId, ws!.id));
}

/** Öğrenci kaydı oluşturur ve isteğe bağlı olarak yeni bir üye hesabını davetle bağlar. */
export async function studentWithAccount(ctx: TestCtx, t: Account, name: string) {
  const s = (await ctx.http().post('/api/students').set(t.auth).send({ displayName: name })).body;
  const inv = (await ctx.http().post(`/api/students/${s.id}/invites`).set(t.auth).send({ kind: 'student' })).body;
  const acc = await register(ctx, 'member', name);
  await ctx.http().post('/api/invites/accept').set(acc.auth).send({ code: inv.code });
  return { student: s as { id: string; displayName: string }, account: acc };
}

export async function linkAccount(ctx: TestCtx, t: Account, studentId: string, acc: Account, kind: 'student' | 'guardian' = 'student', canRequestChanges = false) {
  const inv = (await ctx.http().post(`/api/students/${studentId}/invites`).set(t.auth).send({ kind, canRequestChanges })).body;
  const res = await ctx.http().post('/api/invites/accept').set(acc.auth).send({ code: inv.code });
  if (res.status !== 200) throw new Error(`accept failed ${res.status} ${JSON.stringify(res.body)}`);
}
