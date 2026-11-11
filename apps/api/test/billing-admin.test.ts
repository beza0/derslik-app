import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appUser } from '../src/db/schema';
import { hmacSha256 } from '../src/common/crypto';
import { register, startApp, type Account, type TestCtx } from './helpers';

let ctx: TestCtx;
let admin: Account;
let proVersionId: string;
let proPlanId: string;

beforeAll(async () => {
  ctx = await startApp();
  admin = await register(ctx, 'member', 'Yönetici');
  await ctx.db.update(appUser).set({ isAdmin: true }).where(eq(appUser.id, admin.userId));
  const code = `pro_${Date.now().toString(36)}`;
  const p = await ctx.http().post('/api/admin/plans').set(admin.auth).send({
    code,
    name: 'Pro Test',
    isPublic: true,
    version: { activeStudentLimit: 5, aiMonthlyQuota: 200, priceMinor: 19900, currency: 'TRY', period: 'monthly' },
  });
  expect(p.status).toBe(201);
  proPlanId = p.body.id;
  const plans = await ctx.http().get('/api/billing/plans');
  proVersionId = plans.body.plans.find((x: { code: string }) => x.code === code).planVersionId;
});
afterAll(async () => ctx.close());

const post = (a: Account, url: string, body: object = {}) => ctx.http().post(url).set(a.auth).send(body);
const ent = async (t: Account) => (await ctx.http().get('/api/billing/entitlement').set(t.auth)).body;

describe('abonelik (AS-12, AS-13)', () => {
  it('istemcinin "başarılı" demesi hak açmaz; yalnızca doğrulanmış olay açar; tekrar olay çift işlem yapmaz', async () => {
    const t = await register(ctx);
    const co = await post(t, '/api/billing/checkout', { planVersionId: proVersionId });
    expect(co.status).toBe(201);
    expect(co.body.testMode).toBe(true);
    // Checkout başlatmak hak açmaz
    expect((await ent(t)).planCode).toBe('free');

    // İmzasız veya yanlış imzalı webhook reddedilir
    const forged = JSON.stringify({ id: 'evt_forged', type: 'subscription.activated', workspaceId: (await ctx.http().get('/api/me').set(t.auth)).body.contexts.teacher.workspaceId, planVersionId: proVersionId, periodEnd: '2099-01-01T00:00:00Z' });
    expect((await ctx.http().post('/api/billing/webhooks/sandbox').set('Content-Type', 'application/json').set('x-signature', 'bad').send(forged)).status).toBe(400);
    expect((await ent(t)).planCode).toBe('free');

    // Doğru imzalı olay (sağlayıcının göndereceği gibi)
    const sig = hmacSha256(ctx.config.PAYMENT_WEBHOOK_SECRET, forged);
    const ok = await ctx.http().post('/api/billing/webhooks/sandbox').set('Content-Type', 'application/json').set('x-signature', sig).send(forged);
    expect(ok.body).toEqual({ duplicate: false, processed: true });
    const e1 = await ent(t);
    expect(e1).toMatchObject({ subscriptionStatus: 'active', activeStudentLimit: 5 });

    // Aynı olay tekrar → değişiklik yok
    const again = await ctx.http().post('/api/billing/webhooks/sandbox').set('Content-Type', 'application/json').set('x-signature', sig).send(forged);
    expect(again.body).toEqual({ duplicate: true, processed: false });
    const n = await ctx.db.execute<{ n: number }>(sql`SELECT count(*)::int n FROM payment_event WHERE event_id = 'evt_forged'`);
    expect(n.rows[0]!.n).toBe(1);
  });

  it('sandbox test ödeme ekranı akışı; başarısız ödeme hak açmaz', async () => {
    const t = await register(ctx);
    const co1 = (await post(t, '/api/billing/checkout', { planVersionId: proVersionId })).body;
    await post(t, `/api/billing/sandbox/${co1.checkoutId}/pay`, { outcome: 'fail' }).expect(200);
    expect((await ent(t)).planCode).toBe('free');
    expect((await ctx.http().get(`/api/billing/checkout/${co1.checkoutId}`).set(t.auth)).body.status).toBe('failed');
    const co2 = (await post(t, '/api/billing/checkout', { planVersionId: proVersionId })).body;
    await post(t, `/api/billing/sandbox/${co2.checkoutId}/pay`, { outcome: 'success' }).expect(200);
    // Aynı checkout iki kez ödenirse tek olay
    const dup = await post(t, `/api/billing/sandbox/${co2.checkoutId}/pay`, { outcome: 'success' });
    expect(dup.body.duplicate).toBe(true);
    expect((await ent(t)).activeStudentLimit).toBe(5);
    // Başka öğretmen bu checkout'u kullanamaz
    const other = await register(ctx);
    expect((await post(other, `/api/billing/sandbox/${co2.checkoutId}/pay`)).status).toBe(404);
  });

  it('abonelik bitince veri silinmez; limit üstü anlaşılır; ekleme ve arşivden çıkarma engellenir, arşivleme serbest', async () => {
    const t = await register(ctx);
    const co = (await post(t, '/api/billing/checkout', { planVersionId: proVersionId })).body;
    await post(t, `/api/billing/sandbox/${co.checkoutId}/pay`).expect(200);
    const ids: string[] = [];
    for (const n of ['A', 'B', 'C']) ids.push((await post(t, '/api/students', { displayName: n })).body.id);
    await post(t, '/api/lessons', { studentId: ids[1], date: '2028-01-04', startTime: '10:00', durationMin: 60 }).expect(201);

    // Süre doldu (sağlayıcı olayı)
    const ws = (await ctx.http().get('/api/me').set(t.auth)).body.contexts.teacher.workspaceId;
    const body = JSON.stringify({ id: `evt_exp_${ws}`, type: 'subscription.expired', workspaceId: ws });
    await ctx.http().post('/api/billing/webhooks/sandbox').set('Content-Type', 'application/json').set('x-signature', hmacSha256(ctx.config.PAYMENT_WEBHOOK_SECRET, body)).send(body).expect(200);

    const e = await ent(t);
    expect(e).toMatchObject({ planCode: 'free', activeStudentLimit: 1, activeStudentCount: 3, overLimit: true, subscriptionStatus: 'expired' });
    // Veriler duruyor
    expect((await ctx.http().get('/api/students').set(t.auth)).body).toHaveLength(3);
    expect((await ctx.http().get(`/api/students/${ids[1]}/lessons`).set(t.auth)).body).toHaveLength(1);
    // Ekleme engelli, arşivleme serbest, arşivden çıkarma engelli
    expect((await post(t, '/api/students', { displayName: 'D' })).status).toBe(402);
    await post(t, `/api/students/${ids[2]}/archive`).expect(200);
    expect((await post(t, `/api/students/${ids[2]}/unarchive`)).status).toBe(402);
  });

  it('iptal dönem sonuna kadar hakkı korur', async () => {
    const t = await register(ctx);
    const co = (await post(t, '/api/billing/checkout', { planVersionId: proVersionId })).body;
    await post(t, `/api/billing/sandbox/${co.checkoutId}/pay`).expect(200);
    const res = await post(t, '/api/billing/cancel');
    expect(res.body).toMatchObject({ subscriptionStatus: 'canceled', activeStudentLimit: 5 });
  });

  it('fiyatı belirlenmemiş ve ücretsiz paket satın alınamaz', async () => {
    const t = await register(ctx);
    const plans = (await ctx.http().get('/api/billing/plans')).body.plans;
    const free = plans.find((p: { code: string }) => p.code === 'free');
    expect((await post(t, '/api/billing/checkout', { planVersionId: free.planVersionId })).status).toBe(400);
  });
});

describe('yönetim paneli', () => {
  it('yönetici olmayan erişemez; yönetici istatistik ve kullanıcıları görür', async () => {
    const t = await register(ctx);
    expect((await ctx.http().get('/api/admin/stats').set(t.auth)).status).toBe(403);
    const s = await ctx.http().get('/api/admin/stats').set(admin.auth);
    expect(s.status).toBe(200);
    expect(s.body.users).toBeGreaterThan(0);
  });

  it('plan sürümü: mevcut aboneler yalnızca açık seçimle taşınır', async () => {
    const t = await register(ctx);
    const co = (await post(t, '/api/billing/checkout', { planVersionId: proVersionId })).body;
    await post(t, `/api/billing/sandbox/${co.checkoutId}/pay`).expect(200);
    const v2 = await post(admin, `/api/admin/plans/${proPlanId}/versions`, { activeStudentLimit: 3, aiMonthlyQuota: 100, priceMinor: 29900, period: 'monthly', applyToExistingSubscribers: false });
    expect(v2.body.movedSubscribers).toBe(0);
    expect((await ent(t)).activeStudentLimit).toBe(5);
    // Yeni satın alanlar yeni sürüme
    const plans = (await ctx.http().get('/api/billing/plans')).body.plans;
    expect(plans.find((p: { planId: string }) => p.planId === proPlanId).priceMinor).toBe(29900);
  });

  it('kullanıcı askıya alınınca oturumları kapanır', async () => {
    const t = await register(ctx);
    await post(admin, `/api/admin/users/${t.userId}/status`, { status: 'suspended' }).expect(204);
    expect((await ctx.http().get('/api/me').set(t.auth)).status).toBe(401);
  });

  it('destek erişimi: öğretmen onayı olmadan özet yok; onayla yalnızca sayısal özet ve denetim kaydı', async () => {
    const t = await register(ctx);
    await post(t, '/api/students', { displayName: 'Gizli İsim' }).expect(201);
    const ws = (await ctx.http().get('/api/me').set(t.auth)).body.contexts.teacher.workspaceId;
    expect((await ctx.http().get(`/api/admin/workspaces/${ws}/support-view`).set(admin.auth)).status).toBe(403);
    const g = (await post(admin, `/api/admin/workspaces/${ws}/support-access`, { reason: 'Öğretmen takvim hatası bildirdi' })).body;
    expect((await ctx.http().get('/api/support-access').set(t.auth)).body[0].reason).toContain('takvim');
    await post(t, `/api/support-access/${g.id}/decide`, { decision: 'approve', hours: 2 }).expect(200);
    const view = await ctx.http().get(`/api/admin/workspaces/${ws}/support-view`).set(admin.auth);
    expect(view.status).toBe(200);
    expect(view.body.summary.active_students).toBe(1);
    expect(JSON.stringify(view.body)).not.toContain('Gizli İsim');
    await post(t, `/api/support-access/${g.id}/decide`, { decision: 'revoke' }).expect(200);
    expect((await ctx.http().get(`/api/admin/workspaces/${ws}/support-view`).set(admin.auth)).status).toBe(403);
    const audit = (await ctx.http().get('/api/admin/audit').set(admin.auth)).body.map((a: { action: string }) => a.action);
    expect(audit).toEqual(expect.arrayContaining(['support.request', 'support.approved', 'support.view', 'support.revoked']));
  });
});
