import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { register, startApp, uniqueEmail, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(async () => ctx.close());

describe('kimlik doğrulama', () => {
  it('öğretmen kaydı çalışma alanı ve ücretsiz plan oluşturur (AS-1)', async () => {
    const t = await register(ctx, 'teacher', 'Ayşe Hoca');
    const me = await ctx.http().get('/api/me').set(t.auth);
    expect(me.status).toBe(200);
    expect(me.body.contexts.teacher).toMatchObject({ timezone: 'Europe/Istanbul' });
    const ent = await ctx.http().get('/api/billing/entitlement').set(t.auth);
    expect(ent.body).toMatchObject({ planCode: 'free', activeStudentLimit: 1, activeStudentCount: 0, overLimit: false });
  });

  it('üye hesabı öğretmen çalışma alanı açmaz ve öğretmen uçlarına erişemez', async () => {
    const m = await register(ctx, 'member');
    const me = await ctx.http().get('/api/me').set(m.auth);
    expect(me.body.contexts.teacher).toBeNull();
    const res = await ctx.http().get('/api/students').set(m.auth);
    expect(res.status).toBe(403);
  });

  it('aynı e-postayla ikinci kayıt reddedilir (büyük/küçük harf duyarsız)', async () => {
    const email = uniqueEmail();
    const body = { email, password: 'cok-gizli-parola-123', name: 'X' };
    expect((await ctx.http().post('/api/auth/register').send(body)).status).toBe(201);
    const dup = await ctx.http().post('/api/auth/register').send({ ...body, email: email.toUpperCase() });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('yanlış parola ve olmayan hesap aynı hatayı verir', async () => {
    const t = await register(ctx);
    const wrong = await ctx.http().post('/api/auth/login').send({ email: t.email, password: 'yanlis-parola-000' });
    const none = await ctx.http().post('/api/auth/login').send({ email: uniqueEmail(), password: 'yanlis-parola-000' });
    expect(wrong.status).toBe(401);
    expect(none.status).toBe(401);
    expect(wrong.body.error.code).toBe(none.body.error.code);
  });

  it('web girişinde refresh token yalnızca HttpOnly çerezde döner', async () => {
    const t = await register(ctx);
    const res = await ctx.http().post('/api/auth/login').send({ email: t.email, password: 'cok-gizli-parola-123' });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/dl_rt=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('refresh token döndürülür; eski token tekrar kullanılırsa tüm oturumlar kapanır', async () => {
    const t = await register(ctx);
    const login = await ctx.http().post('/api/auth/login').set('X-Client', 'mobile').send({ email: t.email, password: 'cok-gizli-parola-123' });
    const rt1 = login.body.refreshToken as string;
    const r2 = await ctx.http().post('/api/auth/refresh').set('X-Client', 'mobile').send({ refreshToken: rt1 });
    expect(r2.status).toBe(200);
    const rt2 = r2.body.refreshToken as string;
    expect(rt2).not.toBe(rt1);
    // Çalınmış token senaryosu: eski token yeniden gelir.
    const reuse = await ctx.http().post('/api/auth/refresh').set('X-Client', 'mobile').send({ refreshToken: rt1 });
    expect(reuse.status).toBe(401);
    // Yeni token da artık geçersiz, erişim token'ı da.
    const after = await ctx.http().post('/api/auth/refresh').set('X-Client', 'mobile').send({ refreshToken: rt2 });
    expect(after.status).toBe(401);
    const me = await ctx.http().get('/api/me').set('Authorization', `Bearer ${r2.body.accessToken}`);
    expect(me.status).toBe(401);
  });

  it('çıkıştan sonra erişim token’ı reddedilir', async () => {
    const t = await register(ctx);
    await ctx.http().post('/api/auth/logout').set(t.auth).send({});
    expect((await ctx.http().get('/api/me').set(t.auth)).status).toBe(401);
  });

  it('e-posta doğrulama ve parola sıfırlama tek kullanımlık token ile çalışır', async () => {
    const email = uniqueEmail();
    await ctx.http().post('/api/auth/register').send({ email, password: 'cok-gizli-parola-123', name: 'D' });
    const verifyMail = ctx.mail.outbox.filter((m) => m.to === email).at(-1)!;
    const vtoken = /token=([\w-]+)/.exec(verifyMail.text)![1];
    expect((await ctx.http().post('/api/auth/verify-email').send({ token: vtoken })).status).toBe(204);
    expect((await ctx.http().post('/api/auth/verify-email').send({ token: vtoken })).status).toBe(400);

    expect((await ctx.http().post('/api/auth/request-password-reset').send({ email })).status).toBe(204);
    // Olmayan hesap için de aynı yanıt
    expect((await ctx.http().post('/api/auth/request-password-reset').send({ email: uniqueEmail() })).status).toBe(204);
    const resetMail = ctx.mail.outbox.filter((m) => m.to === email).at(-1)!;
    const rtoken = /token=([\w-]+)/.exec(resetMail.text)![1];
    expect((await ctx.http().post('/api/auth/reset-password').send({ token: rtoken, password: 'yeni-guclu-parola-99' })).status).toBe(204);
    expect((await ctx.http().post('/api/auth/login').send({ email, password: 'cok-gizli-parola-123' })).status).toBe(401);
    expect((await ctx.http().post('/api/auth/login').send({ email, password: 'yeni-guclu-parola-99' })).status).toBe(200);
  });

  it('kısa parola reddedilir', async () => {
    const res = await ctx.http().post('/api/auth/register').send({ email: uniqueEmail(), password: 'kisa', name: 'K' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});
