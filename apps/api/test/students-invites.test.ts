import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { planVersion, subscription, workspace } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { register, startApp, type Account, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(async () => ctx.close());

async function addStudent(t: Account, displayName = 'Elif') {
  return ctx.http().post('/api/students').set(t.auth).send({ displayName });
}

/** Test için çalışma alanını 30 öğrencilik taslak plana geçirir (ödeme akışı ayrı test edilir). */
async function upgrade(t: Account, limit = 3) {
  const [ws] = await ctx.db.select().from(workspace).where(eq(workspace.ownerUserId, t.userId));
  const [v] = await ctx.db
    .insert(planVersion)
    .values({
      planId: (await ctx.db.execute<{ id: string }>(sql`SELECT id FROM plan WHERE code = 'pro_draft'`)).rows[0]!.id,
      version: 100 + Math.floor(Math.random() * 1e6),
      activeStudentLimit: limit,
      aiMonthlyQuota: 100,
      isCurrent: false,
    })
    .returning();
  await ctx.db
    .update(subscription)
    .set({ planVersionId: v!.id, status: 'active', currentPeriodEnd: new Date(Date.now() + 30 * 864e5) })
    .where(eq(subscription.workspaceId, ws!.id));
}

describe('öğrenci kaydı ve paket limiti (AS-1, AS-4)', () => {
  it('yalnızca adla öğrenci eklenir; ikinci aktif öğrenci ücretsiz planda reddedilir', async () => {
    const t = await register(ctx);
    const s1 = await addStudent(t, 'Elif');
    expect(s1.status).toBe(201);
    expect(s1.body).toMatchObject({ displayName: 'Elif', status: 'active', hasAccount: false, level: null });
    const s2 = await addStudent(t, 'Ali');
    expect(s2.status).toBe(402);
    expect(s2.body.error.code).toBe('PLAN_LIMIT_REACHED');
    expect(s2.body.error.details).toMatchObject({ limit: 1, current: 1 });
  });

  it('arşivlenen öğrenci limite sayılmaz; arşivden çıkarma limite tabidir', async () => {
    const t = await register(ctx);
    const s1 = (await addStudent(t, 'Ece')).body;
    await ctx.http().post(`/api/students/${s1.id}/archive`).set(t.auth).expect(200);
    const s2 = await addStudent(t, 'Can');
    expect(s2.status).toBe(201);
    const un = await ctx.http().post(`/api/students/${s1.id}/unarchive`).set(t.auth);
    expect(un.status).toBe(402);
    expect(un.body.error.code).toBe('PLAN_LIMIT_REACHED');
    const archived = await ctx.http().get('/api/students?status=archived').set(t.auth);
    expect(archived.body.map((s: { id: string }) => s.id)).toEqual([s1.id]);
  });

  it('toplu ekleme limiti aşarsa hiçbiri eklenmez', async () => {
    const t = await register(ctx);
    await upgrade(t, 3);
    await addStudent(t, 'A');
    const bulk = await ctx.http().post('/api/students/bulk').set(t.auth).send({ students: [{ displayName: 'B' }, { displayName: 'C' }, { displayName: 'D' }] });
    expect(bulk.status).toBe(402);
    const list = await ctx.http().get('/api/students').set(t.auth);
    expect(list.body).toHaveLength(1);
    const ok = await ctx.http().post('/api/students/bulk').set(t.auth).send({ students: [{ displayName: 'B' }, { displayName: 'C' }] });
    expect(ok.status).toBe(201);
  });

  it('eşzamanlı 10 ekleme isteğinden yalnızca limit kadarı başarılı olur', async () => {
    const t = await register(ctx);
    await upgrade(t, 3);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => addStudent(t, `Eş ${i}`)));
    const ok = results.filter((r) => r.status === 201).length;
    const limited = results.filter((r) => r.status === 402).length;
    expect(ok).toBe(3);
    expect(limited).toBe(7);
    const ent = await ctx.http().get('/api/billing/entitlement').set(t.auth);
    expect(ent.body.activeStudentCount).toBe(3);
  });

  it('arşivdeki öğrenciye davet üretilemez', async () => {
    const t = await register(ctx);
    const s = (await addStudent(t)).body;
    await ctx.http().post(`/api/students/${s.id}/archive`).set(t.auth).expect(200);
    const inv = await ctx.http().post(`/api/students/${s.id}/invites`).set(t.auth).send({ kind: 'student' });
    expect(inv.status).toBe(409);
    expect(inv.body.error.code).toBe('STUDENT_ARCHIVED');
  });

  it('kalıcı silme ad onayı ister', async () => {
    const t = await register(ctx);
    const s = (await addStudent(t, 'Zeynep')).body;
    expect((await ctx.http().post(`/api/students/${s.id}/delete`).set(t.auth).send({ confirmName: 'Zey' })).status).toBe(400);
    expect((await ctx.http().post(`/api/students/${s.id}/delete`).set(t.auth).send({ confirmName: 'Zeynep' })).status).toBe(204);
    expect((await ctx.http().get(`/api/students/${s.id}`).set(t.auth)).status).toBe(404);
  });
});

describe('davet ve hesap bağlama (AS-2)', () => {
  it('öğrenci daveti mevcut kayda bağlar; tekrar kabul mükerrer bağlantı oluşturmaz', async () => {
    const t = await register(ctx, 'teacher', 'Murat Hoca');
    const s = (await addStudent(t, 'Elif')).body;
    const inv = await ctx.http().post(`/api/students/${s.id}/invites`).set(t.auth).send({ kind: 'student' });
    expect(inv.status).toBe(201);
    expect(inv.body.code).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{1,4})+$/);

    const preview = await ctx.http().post('/api/invites/preview').send({ code: inv.body.code });
    expect(preview.body).toMatchObject({ kind: 'student', teacherName: 'Murat Hoca', studentDisplayName: 'Elif' });

    const st = await register(ctx, 'member', 'Elif Y.');
    // Küçük harf ve boşluklu yazım da kabul edilir.
    const code = inv.body.code.toLowerCase().replace(/-/g, ' ');
    const a1 = await ctx.http().post('/api/invites/accept').set(st.auth).send({ code });
    expect(a1.status).toBe(200);
    expect(a1.body).toMatchObject({ studentId: s.id, alreadyAccepted: false });
    const a2 = await ctx.http().post('/api/invites/accept').set(st.auth).send({ code });
    expect(a2.body.alreadyAccepted).toBe(true);

    const list = await ctx.http().get('/api/students').set(t.auth);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: s.id, hasAccount: true });
    const me = await ctx.http().get('/api/me').set(st.auth);
    expect(me.body.contexts.studentLinks).toEqual([{ studentId: s.id, workspaceId: me.body.contexts.studentLinks[0].workspaceId, teacherName: 'Murat Hoca' }]);
  });

  it('kullanılmış davet başka hesapla kabul edilemez', async () => {
    const t = await register(ctx);
    const s = (await addStudent(t)).body;
    const inv = (await ctx.http().post(`/api/students/${s.id}/invites`).set(t.auth).send({ kind: 'student' })).body;
    const u1 = await register(ctx, 'member');
    const u2 = await register(ctx, 'member');
    await ctx.http().post('/api/invites/accept').set(u1.auth).send({ code: inv.code }).expect(200);
    const res = await ctx.http().post('/api/invites/accept').set(u2.auth).send({ code: inv.code });
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('INVITE_INVALID');
  });

  it('iptal edilen, yenilenen ve süresi dolan davet reddedilir', async () => {
    const t = await register(ctx);
    const s = (await addStudent(t)).body;
    const first = (await ctx.http().post(`/api/students/${s.id}/invites`).set(t.auth).send({ kind: 'student' })).body;
    // Yenileme eski daveti geçersiz kılar
    const second = (await ctx.http().post(`/api/students/${s.id}/invites`).set(t.auth).send({ kind: 'student' })).body;
    const u = await register(ctx, 'member');
    expect((await ctx.http().post('/api/invites/accept').set(u.auth).send({ code: first.code })).status).toBe(410);
    // İptal
    await ctx.http().delete(`/api/invites/${second.id}`).set(t.auth).expect(204);
    expect((await ctx.http().post('/api/invites/accept').set(u.auth).send({ code: second.code })).status).toBe(410);
    // Süresi dolan
    const third = (await ctx.http().post(`/api/students/${s.id}/invites`).set(t.auth).send({ kind: 'student' })).body;
    await ctx.db.execute(sql`UPDATE invite SET expires_at = now() - interval '1 minute' WHERE id = ${third.id}`);
    expect((await ctx.http().post('/api/invites/accept').set(u.auth).send({ code: third.code })).status).toBe(410);
    expect((await ctx.http().post('/api/invites/preview').send({ code: third.code })).status).toBe(410);
    // Tahmin edilen kod
    expect((await ctx.http().post('/api/invites/accept').set(u.auth).send({ code: 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA' })).status).toBe(410);
  });

  it('eşzamanlı kabul tek bağlantı üretir', async () => {
    const t = await register(ctx);
    const s = (await addStudent(t)).body;
    const inv = (await ctx.http().post(`/api/students/${s.id}/invites`).set(t.auth).send({ kind: 'student' })).body;
    const u = await register(ctx, 'member');
    const res = await Promise.all(Array.from({ length: 5 }, () => ctx.http().post('/api/invites/accept').set(u.auth).send({ code: inv.code })));
    expect(res.every((r) => r.status === 200)).toBe(true);
    const n = await ctx.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM student_account_link WHERE student_id = ${s.id}`);
    expect(n.rows[0]!.n).toBe(1);
  });

  it('yanlış hesapla kabul: öğretmen bağlantıyı kaldırır, yeni davetle doğru hesap bağlanır', async () => {
    const t = await register(ctx);
    const s = (await addStudent(t)).body;
    const wrong = await register(ctx, 'member');
    const right = await register(ctx, 'member');
    const i1 = (await ctx.http().post(`/api/students/${s.id}/invites`).set(t.auth).send({ kind: 'student' })).body;
    await ctx.http().post('/api/invites/accept').set(wrong.auth).send({ code: i1.code }).expect(200);
    // Bağlıyken yeni öğrenci daveti üretilemez
    expect((await ctx.http().post(`/api/students/${s.id}/invites`).set(t.auth).send({ kind: 'student' })).status).toBe(409);
    await ctx.http().delete(`/api/students/${s.id}/account-link`).set(t.auth).expect(204);
    const i2 = (await ctx.http().post(`/api/students/${s.id}/invites`).set(t.auth).send({ kind: 'student' })).body;
    await ctx.http().post('/api/invites/accept').set(right.auth).send({ code: i2.code }).expect(200);
    const meWrong = await ctx.http().get('/api/me').set(wrong.auth);
    expect(meWrong.body.contexts.studentLinks).toHaveLength(0);
  });

  it('veli daveti ayrı role bağlanır; birden fazla çocuk takip edilebilir', async () => {
    const t = await register(ctx);
    await upgrade(t, 5);
    const c1 = (await addStudent(t, 'Deniz')).body;
    const c2 = (await addStudent(t, 'Derin')).body;
    const parent = await register(ctx, 'member', 'Veli');
    for (const c of [c1, c2]) {
      const inv = (await ctx.http().post(`/api/students/${c.id}/invites`).set(t.auth).send({ kind: 'guardian', canRequestChanges: true })).body;
      await ctx.http().post('/api/invites/accept').set(parent.auth).send({ code: inv.code }).expect(200);
    }
    const me = await ctx.http().get('/api/me').set(parent.auth);
    expect(me.body.contexts.guardianLinks.map((g: { studentName: string }) => g.studentName).sort()).toEqual(['Deniz', 'Derin']);
    expect(me.body.contexts.studentLinks).toHaveLength(0);
    const guardians = await ctx.http().get(`/api/students/${c1.id}/guardians`).set(t.auth);
    expect(guardians.body[0]).toMatchObject({ name: 'Veli', canRequestChanges: true });
  });

  it('öğretmen kendi davetini kabul edemez', async () => {
    const t = await register(ctx);
    const s = (await addStudent(t)).body;
    const inv = (await ctx.http().post(`/api/students/${s.id}/invites`).set(t.auth).send({ kind: 'student' })).body;
    expect((await ctx.http().post('/api/invites/accept').set(t.auth).send({ code: inv.code })).status).toBe(403);
  });
});

describe('öğretmenler arası veri ayrımı (AS-3)', () => {
  it('aynı kişi iki öğretmene bağlanır; öğretmenler birbirinin kaydına erişemez', async () => {
    const tA = await register(ctx, 'teacher', 'A Hoca');
    const tB = await register(ctx, 'teacher', 'B Hoca');
    const sA = (await addStudent(tA, 'Kerem')).body;
    const sB = (await addStudent(tB, 'Kerem')).body;
    const kerem = await register(ctx, 'member', 'Kerem');
    for (const [t, s] of [[tA, sA], [tB, sB]] as const) {
      const inv = (await ctx.http().post(`/api/students/${s.id}/invites`).set(t.auth).send({ kind: 'student' })).body;
      await ctx.http().post('/api/invites/accept').set(kerem.auth).send({ code: inv.code }).expect(200);
    }
    const me = await ctx.http().get('/api/me').set(kerem.auth);
    expect(me.body.contexts.studentLinks.map((l: { teacherName: string }) => l.teacherName).sort()).toEqual(['A Hoca', 'B Hoca']);

    // B, A'nın öğrenci kimliğini kullanarak hiçbir şey yapamaz; varlığı da sızmaz (404).
    expect((await ctx.http().get(`/api/students/${sA.id}`).set(tB.auth)).status).toBe(404);
    expect((await ctx.http().patch(`/api/students/${sA.id}`).set(tB.auth).send({ displayName: 'X' })).status).toBe(404);
    expect((await ctx.http().post(`/api/students/${sA.id}/archive`).set(tB.auth)).status).toBe(404);
    expect((await ctx.http().post(`/api/students/${sA.id}/invites`).set(tB.auth).send({ kind: 'guardian' })).status).toBe(404);
    expect((await ctx.http().get(`/api/students/${sA.id}/invites`).set(tB.auth)).status).toBe(404);
    expect((await ctx.http().delete(`/api/students/${sA.id}/account-link`).set(tB.auth)).status).toBe(404);
    const listB = await ctx.http().get('/api/students').set(tB.auth);
    expect(listB.body.map((s: { id: string }) => s.id)).toEqual([sB.id]);
  });

  it('kimliksiz istek reddedilir', async () => {
    expect((await ctx.http().get('/api/students')).status).toBe(401);
    expect((await ctx.http().get('/api/students').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(401);
  });
});
