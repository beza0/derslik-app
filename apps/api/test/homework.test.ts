import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { linkAccount, register, startApp, studentWithAccount, upgrade, type Account, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await startApp({ STORAGE_DIR: '../../.uploads-test' });
});
afterAll(async () => ctx.close());

const post = (a: Account, url: string, body: object) => ctx.http().post(url).set(a.auth).send(body);
const get = (a: Account, url: string) => ctx.http().get(url).set(a.auth);

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 2)]);

/** Gerçek akış: kayıt → imzalı URL'ye PUT → complete. */
async function upload(a: Account, bytes: Buffer, mime: string, purpose: string, studentId?: string, claimedSize = bytes.length) {
  const res = await post(a, '/api/files', { name: `dosya.${mime.split('/')[1]}`, mime, size: claimedSize, purpose, studentId });
  if (res.status !== 201) return { status: res.status, body: res.body };
  const path = new URL(res.body.upload.url).pathname;
  await ctx.http().put(path).set('Content-Type', 'application/octet-stream').send(bytes).expect(204);
  const done = await post(a, `/api/files/${res.body.fileId}/complete`, {});
  return { status: done.status, body: done.body, fileId: res.body.fileId as string };
}

describe('dosyalar', () => {
  it('içerik imzası bildirilen türle uyuşmazsa dosya reddedilir', async () => {
    const t = await register(ctx);
    const fake = await upload(t, Buffer.from('<html>not a pdf</html>'), 'application/pdf', 'assignment');
    expect(fake.status).toBe(415);
    const wrongSize = await upload(t, PNG, 'image/png', 'assignment', undefined, PNG.length + 10);
    expect(wrongSize.status).toBe(415);
    const exe = await post(t, '/api/files', { name: 'x.exe', mime: 'application/x-msdownload', size: 10, purpose: 'assignment' });
    expect(exe.status).toBe(415);
    const big = await post(t, '/api/files', { name: 'b.pdf', mime: 'application/pdf', size: 16 * 1024 * 1024, purpose: 'assignment' });
    expect(big.status).toBe(415);
    const ok = await upload(t, PDF, 'application/pdf', 'assignment');
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('ready');
  });
});

describe('notlar ve değerlendirmeler (AS-8 kısmi)', () => {
  it('özel not öğrenci/veli API yanıtlarına ve bildirimlere girmez; paylaşılan not girer', async () => {
    const t = await register(ctx);
    await upgrade(ctx, t, 5);
    const { student: s, account: st } = await studentWithAccount(ctx, t, 'Ece');
    const parent = await register(ctx, 'member', 'Veli');
    await linkAccount(ctx, t, s.id, parent, 'guardian');

    const priv = await post(t, '/api/notes', { studentId: s.id, body: 'GİZLİ: logaritmada taban aralığını karıştırıyor' });
    expect(priv.body.visibility).toBe('private'); // güvenli varsayılan
    await post(t, '/api/notes', { studentId: s.id, body: 'Öğrenciye: harika ilerleme', visibility: 'student' }).expect(201);
    await post(t, '/api/notes', { studentId: s.id, body: 'Aileye: düzenli çalışıyor', visibility: 'student_guardian' }).expect(201);

    const stNotes = JSON.stringify((await get(st, '/api/portal/notes')).body);
    const pNotes = JSON.stringify((await get(parent, '/api/portal/notes')).body);
    expect(stNotes).not.toContain('GİZLİ');
    expect(stNotes).toContain('harika ilerleme');
    expect(stNotes).toContain('düzenli çalışıyor');
    expect(pNotes).not.toContain('GİZLİ');
    expect(pNotes).not.toContain('harika ilerleme');
    expect(pNotes).toContain('düzenli çalışıyor');
    const notifs = JSON.stringify((await get(st, '/api/notifications')).body) + JSON.stringify((await get(parent, '/api/notifications')).body);
    expect(notifs).not.toContain('GİZLİ');
    expect(notifs).not.toContain('harika');
    // Öğretmen tümünü görür
    expect((await get(t, `/api/students/${s.id}/notes`)).body).toHaveLength(3);
    // Öğrenci not uçlarına erişemez
    expect((await post(st, '/api/notes', { studentId: s.id, body: 'x' })).status).toBe(403);
  });

  it('gelişim grafiği yalnızca yeterli gerçek veriyle', async () => {
    const t = await register(ctx);
    const s = (await post(t, '/api/students', { displayName: 'A' })).body;
    await post(t, '/api/assessments', { studentId: s.id, title: 'Deneme 1', date: '2026-10-01', score: 60, maxScore: 100 }).expect(201);
    await post(t, '/api/assessments', { studentId: s.id, title: 'Sözlü', date: '2026-10-05' }).expect(201); // sayısal değil
    await post(t, '/api/assessments', { studentId: s.id, title: 'Deneme 2', date: '2026-10-10', score: 35, maxScore: 50 }).expect(201);
    let p = (await get(t, `/api/students/${s.id}/progress`)).body;
    expect(p.enoughData).toBe(false);
    expect(p.points.map((x: { value: number }) => x.value)).toEqual([60, 70]);
    await post(t, '/api/assessments', { studentId: s.id, title: 'Deneme 3', date: '2026-10-20', score: 80, maxScore: 100 }).expect(201);
    p = (await get(t, `/api/students/${s.id}/progress`)).body;
    expect(p.enoughData).toBe(true);
  });
});

describe('ödev, teslim ve geri bildirim (AS-1, AS-5, AS-8, AS-9)', () => {
  it('hesabı olmayan öğrenciye ödev; taslak öğrencide görünmez; öğrenci bağlanınca kendi ödevini görür, teslim edilmiş sayılmaz', async () => {
    const t = await register(ctx);
    const s = (await post(t, '/api/students', { displayName: 'Hesapsız' })).body;
    const draft = await post(t, '/api/assignments', { title: 'Taslak ödev', studentIds: [s.id] });
    expect(draft.status).toBe(201);
    expect(draft.body.status).toBe('draft');
    const pub = await post(t, '/api/assignments', { title: 'Yayımlı ödev', studentIds: [s.id], publish: true });
    expect(pub.body.recipients[0]).toMatchObject({ status: 'assigned', late: false });
    const acc = await register(ctx, 'member');
    await linkAccount(ctx, t, s.id, acc);
    const list = (await get(acc, '/api/portal/assignments')).body;
    expect(list.map((a: { title: string }) => a.title)).toEqual(['Yayımlı ödev']);
    expect(list[0].status).toBe('assigned');
    expect((await get(acc, `/api/portal/assignments/${draft.body.id}`)).status).toBe(404);
  });

  it('grup ödevinde her öğrencinin teslimi ayrı; öğrenciler birbirinin teslimini göremez', async () => {
    const t = await register(ctx);
    await upgrade(ctx, t, 5);
    const a = await studentWithAccount(ctx, t, 'Ayşe');
    const b = await studentWithAccount(ctx, t, 'Burak');
    const g = (await post(t, '/api/groups', { name: 'LGS', studentIds: [a.student.id, b.student.id] })).body;
    const hw = (await post(t, '/api/assignments', { title: '20 problem', groupId: g.id, dueAt: '2030-01-01T20:59:00Z', publish: true })).body;
    expect(hw.recipients).toHaveLength(2);

    const file = await upload(a.account, PNG, 'image/png', 'submission', a.student.id);
    expect(file.status).toBe(200);
    const sub = await post(a.account, `/api/portal/assignments/${hw.id}/submissions`, { studentId: a.student.id, text: 'AYŞE CEVAPLARI', fileIds: [file.fileId] });
    expect(sub.status).toBe(201);
    expect(sub.body).toMatchObject({ version: 1, status: 'submitted', late: false });

    const detail = (await get(t, `/api/assignments/${hw.id}`)).body;
    const st = Object.fromEntries(detail.recipients.map((r: { displayName: string; status: string }) => [r.displayName, r.status]));
    expect(st).toEqual({ Ayşe: 'submitted', Burak: 'assigned' });

    // Burak, Ayşe'nin teslimini ve dosyasını göremez
    const bView = JSON.stringify((await get(b.account, `/api/portal/assignments/${hw.id}`)).body);
    expect(bView).not.toContain('AYŞE CEVAPLARI');
    expect((await get(b.account, `/api/files/${file.fileId}/url`)).status).toBe(404);
    // Burak, Ayşe'nin dosyasını kendi teslimine ekleyemez
    expect((await post(b.account, `/api/portal/assignments/${hw.id}/submissions`, { studentId: b.student.id, fileIds: [file.fileId] })).status).toBe(415);
    // Burak, Ayşe adına teslim yapamaz
    expect((await post(b.account, `/api/portal/assignments/${hw.id}/submissions`, { studentId: a.student.id, text: 'x' })).status).toBe(404);
    // Ayşe kendi dosyasını indirebilir, öğretmen de
    expect((await get(a.account, `/api/files/${file.fileId}/url`)).status).toBe(200);
    expect((await get(t, `/api/files/${file.fileId}/url`)).status).toBe(200);
  });

  it('PDF teslim → yeniden teslim isteği → ikinci sürüm → inceleme; incelenmiş ödeve teslim yapılamaz', async () => {
    const t = await register(ctx);
    const { student: s, account: st } = await studentWithAccount(ctx, t, 'Deniz');
    const hw = (await post(t, '/api/assignments', { title: 'Logaritma', studentIds: [s.id], publish: true })).body;
    const recipientId = hw.recipients[0].id;
    expect((await post(t, `/api/recipients/${recipientId}/review`, { feedback: 'erken' })).status).toBe(409);

    const pdf = await upload(st, PDF, 'application/pdf', 'submission', s.id);
    await post(st, `/api/portal/assignments/${hw.id}/submissions`, { studentId: s.id, fileIds: [pdf.fileId] }).expect(201);
    const r1 = await post(t, `/api/recipients/${recipientId}/review`, { feedback: '3. soruyu tekrar çöz', requestResubmit: true });
    expect(r1.body.status).toBe('resubmit_requested');
    const v2 = await post(st, `/api/portal/assignments/${hw.id}/submissions`, { studentId: s.id, text: 'Düzelttim' });
    expect(v2.body.version).toBe(2);
    const r2 = await post(t, `/api/recipients/${recipientId}/review`, { feedback: 'Tebrikler', score: 95 });
    expect(r2.body).toMatchObject({ status: 'reviewed', score: 95 });
    expect((await post(st, `/api/portal/assignments/${hw.id}/submissions`, { studentId: s.id, text: 'v3' })).status).toBe(409);

    const view = (await get(st, `/api/portal/assignments/${hw.id}`)).body;
    expect(view.submissions.map((x: { version: number }) => x.version)).toEqual([2, 1]);
    expect(view.feedback.map((f: { feedback: string }) => f.feedback)).toEqual(['Tebrikler', '3. soruyu tekrar çöz']);
    const notifTypes = (await get(st, '/api/notifications')).body.items.map((n: { type: string }) => n.type);
    expect(notifTypes).toEqual(expect.arrayContaining(['assignment.published', 'assignment.resubmit_requested', 'assignment.reviewed']));
  });

  it('veli ödev durumunu görür ama teslim edemez ve teslim içeriğini görmez', async () => {
    const t = await register(ctx);
    const { student: s, account: st } = await studentWithAccount(ctx, t, 'Kaan');
    const parent = await register(ctx, 'member');
    await linkAccount(ctx, t, s.id, parent, 'guardian', true);
    const hw = (await post(t, '/api/assignments', { title: 'Okuma', studentIds: [s.id], publish: true })).body;
    await post(st, `/api/portal/assignments/${hw.id}/submissions`, { studentId: s.id, text: 'ÖĞRENCİ METNİ' }).expect(201);
    const pv = (await get(parent, `/api/portal/assignments/${hw.id}`)).body;
    expect(pv.status).toBe('submitted');
    expect(pv.canSubmit).toBe(false);
    expect(JSON.stringify(pv)).not.toContain('ÖĞRENCİ METNİ');
    expect((await post(parent, `/api/portal/assignments/${hw.id}/submissions`, { studentId: s.id, text: 'veli' })).status).toBe(403);
  });

  it('gizli cevap anahtarı API yanıtında ve dosya URL’sinde sızmaz; "inceleme sonrası" kuralı çalışır', async () => {
    const t = await register(ctx);
    const { student: s, account: st } = await studentWithAccount(ctx, t, 'Mina');
    const key = await upload(t, PDF, 'application/pdf', 'answer_key');
    const q = await upload(t, PNG, 'image/png', 'assignment');
    const hw = (
      await post(t, '/api/assignments', {
        title: 'Test',
        studentIds: [s.id],
        publish: true,
        fileIds: [q.fileId],
        answerKeyText: 'CEVAP: 1-B 2-C',
        answerKeyFileIds: [key.fileId],
        answerKeyVisibility: 'after_review',
      })
    ).body;
    let view = (await get(st, `/api/portal/assignments/${hw.id}`)).body;
    expect(JSON.stringify(view)).not.toContain('CEVAP');
    expect(view.answerKey).toBeNull();
    expect(view.files.map((f: { id: string }) => f.id)).toEqual([q.fileId]);
    expect((await get(st, `/api/files/${key.fileId}/url`)).status).toBe(404);
    expect((await get(st, `/api/files/${q.fileId}/url`)).status).toBe(200);

    await post(st, `/api/portal/assignments/${hw.id}/submissions`, { studentId: s.id, text: 'bitti' }).expect(201);
    await post(t, `/api/recipients/${hw.recipients[0].id}/review`, { feedback: 'ok' }).expect(200);
    view = (await get(st, `/api/portal/assignments/${hw.id}`)).body;
    expect(view.answerKey).toEqual({ text: 'CEVAP: 1-B 2-C' });
    expect((await get(st, `/api/files/${key.fileId}/url`)).status).toBe(200);
  });

  it('son tarih yoksa gecikme yok; geçmiş son tarihte gecikme türetilir', async () => {
    const t = await register(ctx);
    const { student: s, account: st } = await studentWithAccount(ctx, t, 'Ali');
    const noDue = (await post(t, '/api/assignments', { title: 'Süresiz', studentIds: [s.id], publish: true })).body;
    const pastDue = (await post(t, '/api/assignments', { title: 'Geçmiş', studentIds: [s.id], publish: true, dueAt: '2020-01-01T00:00:00Z' })).body;
    const list = (await get(st, '/api/portal/assignments')).body;
    const late = Object.fromEntries(list.map((a: { title: string; late: boolean }) => [a.title, a.late]));
    expect(late).toEqual({ Süresiz: false, Geçmiş: true });
    const sub = await post(st, `/api/portal/assignments/${pastDue.id}/submissions`, { studentId: s.id, text: 'geç' });
    expect(sub.body.late).toBe(true);
    expect(noDue.dueAt).toBeNull();
  });

  it('başka öğretmenin ödevine/dosyasına erişilemez', async () => {
    const t1 = await register(ctx);
    const t2 = await register(ctx);
    const s = (await post(t1, '/api/students', { displayName: 'X' })).body;
    const f = await upload(t1, PDF, 'application/pdf', 'assignment');
    const hw = (await post(t1, '/api/assignments', { title: 'Y', studentIds: [s.id], fileIds: [f.fileId] })).body;
    expect((await get(t2, `/api/assignments/${hw.id}`)).status).toBe(404);
    expect((await get(t2, `/api/files/${f.fileId}/url`)).status).toBe(404);
    const s2 = (await post(t2, '/api/students', { displayName: 'Z' })).body;
    expect((await post(t2, '/api/assignments', { title: 'çal', studentIds: [s2.id], fileIds: [f.fileId] })).status).toBe(415);
    expect((await post(t2, `/api/recipients/${hw.recipients[0].id}/review`, { feedback: 'x' })).status).toBe(404);
  });
});
