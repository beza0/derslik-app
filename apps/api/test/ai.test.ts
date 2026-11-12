import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { register, startApp, studentWithAccount, upgrade, type Account, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await startApp({ AI_PROVIDER: 'fake' });
});
afterAll(async () => ctx.close());

const post = (a: Account, url: string, body: object = {}) => ctx.http().post(url).set(a.auth).send(body);
const get = (a: Account, url: string) => ctx.http().get(url).set(a.auth);
const ask = (a: Account, text: string, conversationId?: string) => post(a, '/api/ai/messages', { text, conversationId });

async function teacher(limit = 10) {
  const t = await register(ctx, 'teacher', 'AI Hoca');
  await upgrade(ctx, t, limit);
  return t;
}

describe('AI asistan (AS-10, AS-11, AS-14)', () => {
  it('belirsiz isimde seçim ister; onaydan önce takvim değişmez; onay kesin tarihli önizlemeyi uygular; çift onay tek işlem', async () => {
    const t = await teacher();
    await post(t, '/api/students', { displayName: 'Ali Kaya' });
    await post(t, '/api/students', { displayName: 'Ali Demir' });
    const elif = (await post(t, '/api/students', { displayName: 'Elif' })).body;

    const find = await ask(t, '/tool find_students {"query":"ali"}');
    expect(find.status).toBe(200);
    expect(find.body.choices[0].options.map((o: { label: string }) => o.label).sort()).toEqual(['Ali Demir', 'Ali Kaya']);
    expect(find.body.text).toContain('[TEST]');

    const series = await ask(
      t,
      `/tool create_lessons {"studentId":"${elif.id}","date":"2027-11-15","startTime":"18:00","durationMin":60,"recurrence":{"weekdays":[2,4],"count":8}}`,
    );
    const action = series.body.actions[0];
    expect(action.status).toBe('proposed');
    expect(action.preview[0]).toMatchObject({ kind: 'create', entity: 'lesson', who: 'Elif' });
    expect(action.preview[0].when).toContain('16 Kasım 2027 Salı 18:00–19:00');
    expect(action.preview[0].summary).toContain('8 derslik seri');

    // Onaydan önce takvimde hiçbir ders yok
    const range = `from=${encodeURIComponent('2027-11-01T00:00:00Z')}&to=${encodeURIComponent('2028-01-01T00:00:00Z')}`;
    expect((await get(t, `/api/calendar?${range}`)).body).toHaveLength(0);

    // Eşzamanlı çift onay → tek işlem
    const [c1, c2] = await Promise.all([post(t, `/api/ai/actions/${action.id}/decide`, { decision: 'confirm' }), post(t, `/api/ai/actions/${action.id}/decide`, { decision: 'confirm' })]);
    expect(c1.body.status).toBe('applied');
    expect(c2.body.status).toBe('applied');
    expect((await get(t, `/api/calendar?${range}`)).body).toHaveLength(8);
  });

  it('onay beklerken takvim değişirse sunucu yeniden doğrular ve çakışmayı atlamaz', async () => {
    const t = await teacher();
    const s = (await post(t, '/api/students', { displayName: 'Ece' })).body;
    const r = await ask(t, `/tool create_lessons {"studentId":"${s.id}","date":"2027-12-01","startTime":"10:00","durationMin":60}`);
    const action = r.body.actions[0];
    // Bu arada öğretmen aynı saate elle ders ekler
    await post(t, '/api/lessons', { studentId: s.id, date: '2027-12-01', startTime: '10:30', durationMin: 60 }).expect(201);
    const res = await post(t, `/api/ai/actions/${action.id}/decide`, { decision: 'confirm' });
    expect(res.body.status).toBe('stale');
    expect(res.body.result.error.code).toBe('LESSON_CONFLICT');
    const range = `from=${encodeURIComponent('2027-12-01T00:00:00Z')}&to=${encodeURIComponent('2027-12-02T00:00:00Z')}`;
    expect((await get(t, `/api/calendar?${range}`)).body).toHaveLength(1);
  });

  it('veri değişip sonuç farklılaşırsa eski önizleme uygulanmaz, yeni önizleme döner', async () => {
    const t = await teacher();
    const ids: string[] = [];
    for (const n of ['A', 'B']) ids.push((await post(t, '/api/students', { displayName: n })).body.id);
    const g = (await post(t, '/api/groups', { name: 'G', studentIds: ids })).body;
    const r = await ask(t, `/tool create_assignment {"title":"20 problem","groupId":"${g.id}","publish":true}`);
    const action = r.body.actions[0];
    expect(action.preview[0].who).toBe('A, B');
    // Gruba yeni üye eklenir → alıcılar değişir
    const c = (await post(t, '/api/students', { displayName: 'C' })).body.id;
    await post(t, `/api/groups/${g.id}/members`, { add: [c] }).expect(200);
    const res = await post(t, `/api/ai/actions/${action.id}/decide`, { decision: 'confirm' });
    expect(res.body.status).toBe('stale');
    expect(res.body.newAction.preview[0].who).toBe('A, B, C');
    expect((await get(t, '/api/assignments')).body).toHaveLength(0);
    const ok = await post(t, `/api/ai/actions/${res.body.newAction.id}/decide`, { decision: 'confirm' });
    expect(ok.body.status).toBe('applied');
    expect((await get(t, '/api/assignments')).body).toHaveLength(1);
  });

  it('özel not doğrudan kaydedilir ve geri alınabilir; öğrenci görmez', async () => {
    const t = await teacher();
    const { student: s, account } = await studentWithAccount(ctx, t, 'Ece');
    const r = await ask(t, `/tool add_private_note {"studentId":"${s.id}","body":"Logaritmada taban aralığını karıştırıyor"}`);
    expect(r.body.undoable).toHaveLength(1);
    expect((await get(t, `/api/students/${s.id}/notes`)).body[0].visibility).toBe('private');
    expect(JSON.stringify((await get(account, '/api/portal/notes')).body)).not.toContain('Logaritma');
    await post(t, `/api/ai/actions/${r.body.undoable[0].actionId}/undo`).expect(200);
    expect((await get(t, `/api/students/${s.id}/notes`)).body).toHaveLength(0);
  });

  it('AI ile öğrenci ekleme de paket limitine uyar', async () => {
    const t = await register(ctx); // ücretsiz plan: 1 öğrenci
    await post(t, '/api/students', { displayName: 'Tek' }).expect(201);
    const r = await ask(t, '/tool create_students {"students":[{"displayName":"İkinci"}]}');
    expect(r.body.actions).toHaveLength(0);
    expect((await get(t, '/api/students')).body).toHaveLength(1);
  });

  it('öğrenci hiçbir AI ucuna erişemez', async () => {
    const t = await teacher();
    const { account } = await studentWithAccount(ctx, t, 'Öğr');
    expect((await ask(account, 'merhaba')).status).toBe(403);
    expect((await get(account, '/api/ai/conversations')).status).toBe(403);
  });

  it('kota dolunca AI reddedilir ama manuel akış çalışır', async () => {
    const t = await register(ctx); // ücretsiz plan: 30 AI isteği
    const { sql } = await import('drizzle-orm');
    const ws = (await get(t, '/api/me')).body.contexts.teacher.workspaceId;
    await ctx.db.execute(sql`INSERT INTO usage_counter (workspace_id, metric, period, value) VALUES (${ws}, 'ai_request', ${new Date().toISOString().slice(0, 7)}, 30)`);
    const r = await ask(t, 'merhaba');
    expect(r.status).toBe(402);
    expect(r.body.error.code).toBe('AI_QUOTA_EXCEEDED');
    expect((await post(t, '/api/students', { displayName: 'Manuel' })).status).toBe(201);
  });
});

describe('AI servisi kapalıyken', () => {
  it('AI uçları anlaşılır hata verir, temel akışlar çalışır', async () => {
    const off = await startApp({ AI_PROVIDER: 'disabled' });
    try {
      const t = await register(off);
      const r = await off.http().post('/api/ai/messages').set(t.auth).send({ text: 'merhaba' });
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('AI_DISABLED');
      const s = await off.http().post('/api/students').set(t.auth).send({ displayName: 'X' });
      expect(s.status).toBe(201);
      expect((await off.http().post('/api/lessons').set(t.auth).send({ studentId: s.body.id, date: '2028-01-05', startTime: '10:00', durationMin: 60 })).status).toBe(201);
    } finally {
      await off.close();
    }
  });
});
