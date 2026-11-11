import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RemindersService } from '../src/notifications/reminders.service';
import { linkAccount, register, startApp, studentWithAccount, upgrade, type Account, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(async () => ctx.close());

const post = (t: Account, url: string, body: object) => ctx.http().post(url).set(t.auth).send(body);
const patch = (t: Account, url: string, body: object) => ctx.http().patch(url).set(t.auth).send(body);
const get = (t: Account, url: string) => ctx.http().get(url).set(t.auth);

async function teacherWithStudent(name = 'Elif', limit = 10) {
  const t = await register(ctx, 'teacher', 'Hoca');
  await upgrade(ctx, t, limit);
  const s = (await post(t, '/api/students', { displayName: name })).body as { id: string };
  return { t, s };
}

const range = (from: string, to: string) => `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

describe('ders oluşturma ve çakışma (AS-1, AS-6)', () => {
  it('hesabı olmayan öğrenciye tek ders eklenir ve takvimde görünür', async () => {
    const { t, s } = await teacherWithStudent();
    const res = await post(t, '/api/lessons', { studentId: s.id, date: '2027-02-02', startTime: '18:00', durationMin: 60, mode: 'online', meetingUrl: 'https://meet.example.com/abc' });
    expect(res.status).toBe(201);
    expect(res.body.lessons[0]).toMatchObject({ startsAt: '2027-02-02T15:00:00.000Z', endsAt: '2027-02-02T16:00:00.000Z', timezone: 'Europe/Istanbul', status: 'scheduled', targetName: 'Elif' });
    const cal = await get(t, `/api/calendar?${range('2027-02-01T00:00:00+03:00', '2027-02-08T00:00:00+03:00')}`);
    expect(cal.body).toHaveLength(1);
  });

  it('http (güvensiz) görüşme bağlantısı reddedilir', async () => {
    const { t, s } = await teacherWithStudent();
    const res = await post(t, '/api/lessons', { studentId: s.id, date: '2027-02-02', startTime: '18:00', durationMin: 60, meetingUrl: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });

  it('çakışan ders reddedilir; arka arkaya ders ve iptal edilmiş dersin saati serbesttir', async () => {
    const { t, s } = await teacherWithStudent();
    const a = (await post(t, '/api/lessons', { studentId: s.id, date: '2027-03-01', startTime: '10:00', durationMin: 60 })).body.lessons[0];
    const overlap = await post(t, '/api/lessons', { studentId: s.id, date: '2027-03-01', startTime: '10:30', durationMin: 60 });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe('LESSON_CONFLICT');
    expect(overlap.body.error.details.conflicts[0].withLessonId).toBe(a.id);
    expect((await post(t, '/api/lessons', { studentId: s.id, date: '2027-03-01', startTime: '11:00', durationMin: 30 })).status).toBe(201);
    expect((await post(t, '/api/lessons', { studentId: s.id, date: '2027-03-01', startTime: '09:00', durationMin: 60 })).status).toBe(201);
    await post(t, `/api/lessons/${a.id}/cancel`, {}).expect(200);
    expect((await post(t, '/api/lessons', { studentId: s.id, date: '2027-03-01', startTime: '10:00', durationMin: 60 })).status).toBe(201);
  });

  it('eşzamanlı çakışan istekler: yalnızca biri kaydedilir (veritabanı kısıtı)', async () => {
    const { t, s } = await teacherWithStudent();
    const res = await Promise.all(Array.from({ length: 6 }, () => post(t, '/api/lessons', { studentId: s.id, date: '2027-03-05', startTime: '14:00', durationMin: 60 })));
    expect(res.filter((r) => r.status === 201)).toHaveLength(1);
    expect(res.filter((r) => r.status === 409)).toHaveLength(5);
  });

  it('salı-perşembe 4 haftalık seri 8 ders üretir; seride tek çakışma varsa hiçbiri kaydedilmez', async () => {
    const { t, s } = await teacherWithStudent();
    // 25 Mart 2027 Perşembe 18:00'de engel ders
    await post(t, '/api/lessons', { studentId: s.id, date: '2027-03-25', startTime: '18:30', durationMin: 30 }).expect(201);
    const bad = await post(t, '/api/lessons', { studentId: s.id, date: '2027-03-15', startTime: '18:00', durationMin: 60, recurrence: { weekdays: [2, 4], count: 8 } });
    expect(bad.status).toBe(409);
    expect(bad.body.error.details.conflicts).toHaveLength(1);
    const cal = await get(t, `/api/calendar?${range('2027-03-01T00:00:00Z', '2027-05-01T00:00:00Z')}`);
    expect(cal.body).toHaveLength(1);
    const n = await ctx.db.execute<{ n: number }>(sql`SELECT count(*)::int n FROM lesson_series ls JOIN student s ON s.id = ls.student_id WHERE s.id = ${s.id}`);
    expect(n.rows[0]!.n).toBe(0);

    const ok = await post(t, '/api/lessons', { studentId: s.id, date: '2027-03-15', startTime: '19:00', durationMin: 60, recurrence: { weekdays: [2, 4], count: 8 } });
    expect(ok.status).toBe(201);
    expect(ok.body.lessons).toHaveLength(8);
    expect(ok.body.lessons[0].startsAt).toBe('2027-03-16T16:00:00.000Z');
  });

  it('arşivdeki öğrenciye ders eklenemez', async () => {
    const { t, s } = await teacherWithStudent();
    await post(t, `/api/students/${s.id}/archive`, {}).expect(200);
    const res = await post(t, '/api/lessons', { studentId: s.id, date: '2027-02-02', startTime: '18:00', durationMin: 60 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STUDENT_ARCHIVED');
  });
});

describe('seri düzenleme (AS-6)', () => {
  async function series(start = '2027-04-05', count = 6) {
    const { t, s } = await teacherWithStudent();
    const res = await post(t, '/api/lessons', { studentId: s.id, date: start, startTime: '17:00', durationMin: 60, recurrence: { weekdays: [1], count } });
    expect(res.status).toBe(201);
    return { t, s, lessons: res.body.lessons as { id: string; startsAt: string; seriesId: string }[] };
  }

  it('"yalnızca bu ders" diğerlerini etkilemez ve istisna olarak işaretlenir', async () => {
    const { t, lessons } = await series();
    const res = await patch(t, `/api/lessons/${lessons[1]!.id}`, { scope: 'this', startTime: '18:30' });
    expect(res.status).toBe(200);
    expect(res.body.lessons[0]).toMatchObject({ isException: true, startsAt: '2027-04-12T15:30:00.000Z' });
    const other = await get(t, `/api/lessons/${lessons[2]!.id}`);
    expect(other.body.startsAt).toBe('2027-04-19T14:00:00.000Z');
  });

  it('"bu ve sonraki" yalnızca seçilen dersten sonrasını değiştirir; istisnalar ve yapılmış dersler korunur', async () => {
    const { t, s, lessons } = await series();
    await post(t, `/api/lessons/${lessons[0]!.id}/complete`, { topicsCovered: 'Üslü sayılar' }).expect(200);
    await patch(t, `/api/lessons/${lessons[4]!.id}`, { scope: 'this', startTime: '12:00' }).expect(200);
    // 3. dersten itibaren çarşambaya ve 20:00'ye taşı
    const res = await patch(t, `/api/lessons/${lessons[2]!.id}`, { scope: 'this_and_following', weekdays: [3], startTime: '20:00' });
    expect(res.status).toBe(200);
    expect(res.body.seriesId).not.toBe(lessons[0]!.seriesId);
    const cal = (await get(t, `/api/calendar?${range('2027-04-01T00:00:00Z', '2027-06-01T00:00:00Z')}&studentId=${s.id}`)).body as {
      id: string;
      startsAt: string;
      status: string;
      isException: boolean;
      topicsCovered: string | null;
    }[];
    const summary = cal.map((l) => `${l.startsAt.slice(0, 16)} ${l.status}${l.isException ? ' istisna' : ''}`);
    expect(summary).toEqual([
      '2027-04-05T14:00 done', // yapılmış ders korunur
      '2027-04-12T14:00 scheduled', // önceki ders değişmez
      '2027-04-21T17:00 scheduled', // yeni kural: çarşamba 20:00 yerel
      '2027-04-28T17:00 scheduled',
      '2027-05-03T09:00 scheduled istisna', // tekil düzenlenmiş ders korunur ve kalan haktan sayılır
      '2027-05-05T17:00 scheduled', // toplam 6 korunur: 2 önceki + 1 istisna + 3 yeni
    ]);
    expect(cal[0]!.topicsCovered).toBe('Üslü sayılar');
  });

  it('"bu ve sonraki" çakışırsa hiçbir değişiklik kaydedilmez', async () => {
    const { t, s, lessons } = await series();
    await post(t, '/api/lessons', { studentId: s.id, date: '2027-04-28', startTime: '20:00', durationMin: 60 }).expect(201);
    const before = (await get(t, `/api/calendar?${range('2027-04-01T00:00:00Z', '2027-06-01T00:00:00Z')}`)).body.map((l: { id: string; startsAt: string }) => `${l.id}@${l.startsAt}`);
    const res = await patch(t, `/api/lessons/${lessons[2]!.id}`, { scope: 'this_and_following', weekdays: [3], startTime: '20:00' });
    expect(res.status).toBe(409);
    const after = (await get(t, `/api/calendar?${range('2027-04-01T00:00:00Z', '2027-06-01T00:00:00Z')}`)).body.map((l: { id: string; startsAt: string }) => `${l.id}@${l.startsAt}`);
    expect(after).toEqual(before);
  });

  it('seriyi "bu ve sonraki" iptal etmek öncekileri korur', async () => {
    const { t, lessons } = await series();
    const res = await post(t, `/api/lessons/${lessons[3]!.id}/cancel`, { scope: 'this_and_following' });
    expect(res.body.cancelled).toBe(3);
    expect((await get(t, `/api/lessons/${lessons[2]!.id}`)).body.status).toBe('scheduled');
    expect((await get(t, `/api/lessons/${lessons[5]!.id}`)).body.status).toBe('cancelled');
  });
});

describe('grup dersleri (AS-5)', () => {
  it('grup dersi takvimde bir kez görünür; yoklama öğrenci bazında; bir öğrencinin gelmemesi dersi iptal etmez', async () => {
    const t = await register(ctx);
    await upgrade(ctx, t, 10);
    const ids: string[] = [];
    for (const n of ['A', 'B', 'C']) ids.push((await post(t, '/api/students', { displayName: n })).body.id);
    const g = (await post(t, '/api/groups', { name: 'LGS Grubu', studentIds: ids })).body;
    expect(g.members).toHaveLength(3);
    const l = (await post(t, '/api/lessons', { groupId: g.id, date: '2027-05-04', startTime: '16:00', durationMin: 90 })).body.lessons[0];
    expect(l.participants).toHaveLength(3);
    const cal = await get(t, `/api/calendar?${range('2027-05-01T00:00:00Z', '2027-05-10T00:00:00Z')}`);
    expect(cal.body).toHaveLength(1);
    // Grup dersi de öğretmenin zamanını kaplar
    expect((await post(t, '/api/lessons', { studentId: ids[0], date: '2027-05-04', startTime: '17:00', durationMin: 30 })).status).toBe(409);

    const done = await post(t, `/api/lessons/${l.id}/complete`, {
      topicsCovered: 'Oran orantı',
      attendance: [
        { studentId: ids[0], attendance: 'present' },
        { studentId: ids[1], attendance: 'absent' },
      ],
    });
    expect(done.body.status).toBe('done');
    const byId = Object.fromEntries(done.body.participants.map((p: { studentId: string; attendance: string }) => [p.studentId, p.attendance]));
    expect(byId).toEqual({ [ids[0]!]: 'present', [ids[1]!]: 'absent', [ids[2]!]: 'unknown' });
  });

  it('üyelik değişikliği: geçmiş katılım değişmez, gelecek dersler yalnızca açık seçimle güncellenir', async () => {
    const t = await register(ctx);
    await upgrade(ctx, t, 10);
    const a = (await post(t, '/api/students', { displayName: 'A' })).body.id;
    const b = (await post(t, '/api/students', { displayName: 'B' })).body.id;
    const c = (await post(t, '/api/students', { displayName: 'C' })).body.id;
    const g = (await post(t, '/api/groups', { name: 'G', studentIds: [a, b] })).body;
    const past = (await post(t, '/api/lessons', { groupId: g.id, date: '2025-01-07', startTime: '16:00', durationMin: 60 })).body.lessons[0];
    const future = (await post(t, '/api/lessons', { groupId: g.id, date: '2027-06-01', startTime: '16:00', durationMin: 60, recurrence: { weekdays: [2], count: 3 } })).body.lessons;

    const change = { add: [c], remove: [b] };
    const preview = await post(t, `/api/groups/${g.id}/members/preview`, change);
    expect(preview.body.futureLessons).toHaveLength(3);
    // Önizleme hiçbir şey değiştirmez
    expect((await get(t, `/api/groups/${g.id}`)).body.members).toHaveLength(2);

    // Gelecek derslere uygulamadan
    await post(t, `/api/groups/${g.id}/members`, { ...change, applyToFutureLessons: false }).expect(200);
    expect((await get(t, `/api/lessons/${future[0].id}`)).body.participants.map((p: { displayName: string }) => p.displayName)).toEqual(['A', 'B']);
    // Şimdi C'yi ekleyip B'yi çıkarmayı gelecek derslere de uygula (B zaten çıkmış, C zaten üye: yalnızca derslere yansır)
    const g2 = (await post(t, '/api/groups', { name: 'G2', studentIds: [a, b] })).body;
    const f2 = (await post(t, '/api/lessons', { groupId: g2.id, date: '2027-07-06', startTime: '16:00', durationMin: 60, recurrence: { weekdays: [2], count: 2 } })).body.lessons;
    const p2 = (await post(t, '/api/lessons', { groupId: g2.id, date: '2025-02-04', startTime: '16:00', durationMin: 60 })).body.lessons[0];
    const applied = await post(t, `/api/groups/${g2.id}/members`, { add: [c], remove: [b], applyToFutureLessons: true });
    expect(applied.body).toMatchObject({ added: 1, removed: 1, lessonsUpdated: 2 });
    expect((await get(t, `/api/lessons/${f2[0].id}`)).body.participants.map((p: { displayName: string }) => p.displayName)).toEqual(['A', 'C']);
    expect((await get(t, `/api/lessons/${p2.id}`)).body.participants.map((p: { displayName: string }) => p.displayName)).toEqual(['A', 'B']);
    expect((await get(t, `/api/lessons/${past.id}`)).body.participants.map((p: { displayName: string }) => p.displayName)).toEqual(['A', 'B']);
  });

  it('başka öğretmenin öğrencisi gruba eklenemez', async () => {
    const t1 = await register(ctx);
    const t2 = await register(ctx);
    const other = (await post(t2, '/api/students', { displayName: 'X' })).body.id;
    expect((await post(t1, '/api/groups', { name: 'G', studentIds: [other] })).status).toBe(404);
  });
});

describe('öğrenci/veli portalı ve talepler (AS-7, AS-8 kısmi)', () => {
  it('öğrenci kendi dersini görür; öğretmen notu ve diğer grup üyeleri görünmez', async () => {
    const t = await register(ctx, 'teacher', 'Selin Hoca');
    await upgrade(ctx, t, 10);
    const { student: s1, account: acc1 } = await studentWithAccount(ctx, t, 'Mert');
    const s2 = (await post(t, '/api/students', { displayName: 'Gizli Üye' })).body;
    const g = (await post(t, '/api/groups', { name: 'Fizik', studentIds: [s1.id, s2.id] })).body;
    const l = (await post(t, '/api/lessons', { groupId: g.id, date: '2027-08-03', startTime: '10:00', durationMin: 60, note: 'ÖZEL: Mert dikkat dağınık' })).body.lessons[0];

    const cal = await get(acc1, `/api/portal/calendar?${range('2027-08-01T00:00:00Z', '2027-08-10T00:00:00Z')}`);
    expect(cal.status).toBe(200);
    expect(cal.body).toHaveLength(1);
    expect(cal.body[0]).toMatchObject({ id: l.id, teacherName: 'Selin Hoca', targetName: 'Fizik', forStudentName: 'Mert' });
    const raw = JSON.stringify(cal.body) + JSON.stringify((await get(acc1, `/api/portal/lessons/${l.id}`)).body);
    expect(raw).not.toContain('ÖZEL');
    expect(raw).not.toContain('Gizli Üye');
    expect(raw).not.toContain('participants');
    // Öğrenci öğretmen uçlarına erişemez
    expect((await get(acc1, `/api/lessons/${l.id}`)).status).toBe(403);
    expect((await get(acc1, '/api/students')).status).toBe(403);
  });

  it('birden fazla öğretmenin dersleri birleşik takvimde görünür', async () => {
    const tA = await register(ctx, 'teacher', 'A Hoca');
    const tB = await register(ctx, 'teacher', 'B Hoca');
    const { student: sA, account } = await studentWithAccount(ctx, tA, 'Nil');
    const sB = (await post(tB, '/api/students', { displayName: 'Nil' })).body;
    await linkAccount(ctx, tB, sB.id, account);
    await post(tA, '/api/lessons', { studentId: sA.id, date: '2027-09-01', startTime: '10:00', durationMin: 60 }).expect(201);
    const res = await post(tB, '/api/lessons', { studentId: sB.id, date: '2027-09-01', startTime: '10:30', durationMin: 60 });
    // Öğretmen B için engelleyici değil, yalnızca uyarı; A'nın dersinin ayrıntısı yok.
    expect(res.status).toBe(201);
    expect(res.body.warnings).toEqual([{ studentId: sB.id, displayName: 'Nil', dates: ['2027-09-01'] }]);
    const cal = await get(account, `/api/portal/calendar?${range('2027-09-01T00:00:00Z', '2027-09-02T00:00:00Z')}`);
    expect(cal.body.map((l: { teacherName: string }) => l.teacherName).sort()).toEqual(['A Hoca', 'B Hoca']);
  });

  it('erteleme talebi öğretmen onayına kadar takvimi değiştirmez; onayla değişir', async () => {
    const t = await register(ctx);
    await upgrade(ctx, t, 10);
    const { student: s, account } = await studentWithAccount(ctx, t, 'Ece');
    const l = (await post(t, '/api/lessons', { studentId: s.id, date: '2027-10-07', startTime: '19:00', durationMin: 60 })).body.lessons[0];
    const req = await post(account, `/api/portal/lessons/${l.id}/change-requests`, { studentId: s.id, kind: 'reschedule', proposedStartsAt: '2027-10-08T19:00:00+03:00', message: 'Sınavım var' });
    expect(req.status).toBe(201);
    expect((await get(t, `/api/lessons/${l.id}`)).body.startsAt).toBe(l.startsAt);
    // Aynı ders için ikinci bekleyen talep reddedilir
    expect((await post(account, `/api/portal/lessons/${l.id}/change-requests`, { studentId: s.id, kind: 'cancel' })).status).toBe(409);

    const pending = await get(t, '/api/change-requests?status=pending');
    expect(pending.body).toHaveLength(1);
    expect(pending.body[0]).toMatchObject({ studentName: 'Ece', requesterRole: 'student', kind: 'reschedule' });

    const decided = await post(t, `/api/change-requests/${req.body.id}/decide`, { decision: 'approve' });
    expect(decided.status).toBe(200);
    expect((await get(t, `/api/lessons/${l.id}`)).body.startsAt).toBe('2027-10-08T16:00:00.000Z');
    // Tekrar karar verilemez
    expect((await post(t, `/api/change-requests/${req.body.id}/decide`, { decision: 'reject' })).status).toBe(409);
    const notifs = await get(account, '/api/notifications');
    expect(notifs.body.items.map((n: { type: string }) => n.type)).toEqual(expect.arrayContaining(['lesson.created', 'lesson.updated', 'request.approved']));
  });

  it('onaylanan erteleme yeni bir çakışma yaratıyorsa onay reddedilir ve talep beklemede kalır', async () => {
    const t = await register(ctx);
    await upgrade(ctx, t, 10);
    const { student: s, account } = await studentWithAccount(ctx, t, 'Can');
    const l = (await post(t, '/api/lessons', { studentId: s.id, date: '2027-10-14', startTime: '19:00', durationMin: 60 })).body.lessons[0];
    const req = (await post(account, `/api/portal/lessons/${l.id}/change-requests`, { studentId: s.id, kind: 'reschedule', proposedStartsAt: '2027-10-15T19:00:00+03:00' })).body;
    await post(t, '/api/lessons', { studentId: s.id, date: '2027-10-15', startTime: '19:00', durationMin: 60 }).expect(201);
    const res = await post(t, `/api/change-requests/${req.id}/decide`, { decision: 'approve' });
    expect(res.status).toBe(409);
    expect((await get(t, '/api/change-requests?status=pending')).body).toHaveLength(1);
    expect((await get(t, `/api/lessons/${l.id}`)).body.startsAt).toBe(l.startsAt);
  });

  it('veli yalnızca izin verildiyse talep oluşturur; iptal onayı dersi iptal eder', async () => {
    const t = await register(ctx);
    await upgrade(ctx, t, 10);
    const s = (await post(t, '/api/students', { displayName: 'Ada' })).body;
    const noPerm = await register(ctx, 'member', 'Veli 1');
    const withPerm = await register(ctx, 'member', 'Veli 2');
    await linkAccount(ctx, t, s.id, noPerm, 'guardian', false);
    await linkAccount(ctx, t, s.id, withPerm, 'guardian', true);
    const l = (await post(t, '/api/lessons', { studentId: s.id, date: '2027-11-02', startTime: '15:00', durationMin: 60 })).body.lessons[0];
    expect((await post(noPerm, `/api/portal/lessons/${l.id}/change-requests`, { studentId: s.id, kind: 'cancel' })).status).toBe(403);
    const req = await post(withPerm, `/api/portal/lessons/${l.id}/change-requests`, { studentId: s.id, kind: 'cancel' });
    expect(req.status).toBe(201);
    await post(t, `/api/change-requests/${req.body.id}/decide`, { decision: 'approve' }).expect(200);
    expect((await get(t, `/api/lessons/${l.id}`)).body.status).toBe('cancelled');
  });

  it('bağlı olmayan kullanıcı başkasının dersini göremez veya talep açamaz', async () => {
    const t = await register(ctx);
    const s = (await post(t, '/api/students', { displayName: 'Lale' })).body;
    const l = (await post(t, '/api/lessons', { studentId: s.id, date: '2027-11-09', startTime: '15:00', durationMin: 60 })).body.lessons[0];
    const stranger = await register(ctx, 'member');
    expect((await get(stranger, `/api/portal/lessons/${l.id}`)).status).toBe(403);
    expect((await post(stranger, `/api/portal/lessons/${l.id}/change-requests`, { studentId: s.id, kind: 'cancel' })).status).toBe(404);
  });
});

describe('bildirimler', () => {
  it('ders hatırlatması bir kez üretilir; okundu işaretlenir; tercih kapatılabilir', async () => {
    const t = await register(ctx);
    await upgrade(ctx, t, 10);
    const { student: s, account } = await studentWithAccount(ctx, t, 'Deniz');
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 60_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    // Yerel İstanbul saatiyle 30 dk sonrası
    const ist = new Date(soon.getTime() + 3 * 3600_000);
    const date = `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
    const time = `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
    await post(t, '/api/lessons', { studentId: s.id, date, startTime: time, durationMin: 30 }).expect(201);
    const reminders = ctx.app.get(RemindersService);
    await reminders.run();
    await reminders.run();
    const list = await get(account, '/api/notifications');
    expect(list.body.items.filter((n: { type: string }) => n.type === 'lesson.reminder')).toHaveLength(1);
    expect((await get(account, '/api/notifications/unread-count')).body.count).toBeGreaterThan(0);
    await post(account, '/api/notifications/read', { all: true }).expect(204);
    expect((await get(account, '/api/notifications/unread-count')).body.count).toBe(0);

    await ctx.http().put('/api/notifications/prefs').set(account.auth).send({ category: 'lesson', enabled: false }).expect(204);
    await post(t, '/api/lessons', { studentId: s.id, date: '2027-12-01', startTime: '10:00', durationMin: 30 }).expect(201);
    expect((await get(account, '/api/notifications/unread-count')).body.count).toBe(0);
  });
});
