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
