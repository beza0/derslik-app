import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { matchName, parse } from '../src/ai/rules';
import { register, startApp, upgrade, type Account, type TestCtx } from './helpers';

// 12 Kasım 2026 Perşembe
const today = DateTime.fromISO('2026-11-12', { zone: 'Europe/Istanbul' });

describe('Kural tabanlı asistan: Türkçe komut çözümleme', () => {
  it('tek ders: tarih, saat, süre', () => {
    const p = parse("Elif'e yarın 17:00'de 60 dk ders ekle", today);
    expect(p.dates.map((d) => d.date)).toEqual(['2026-11-13']);
    expect(p.times.map((x) => x.time)).toEqual(['17:00']);
    expect(p.durationMin).toBe(60);
    expect(p.weekly).toBe(false);
  });

  it('haftalık seri: sayıyla yazılmış hafta, birer saat, gelecek hafta', () => {
    const p = parse("Elif'e gelecek haftadan başlayarak dört hafta boyunca salı ve perşembe 18.00'de birer saat ders ekle.", today);
    expect(p.weekly).toBe(true);
    expect(p.weekdays).toEqual([2, 4]);
    expect(p.weeks).toBe(4);
    expect(p.durationMin).toBe(60);
    expect(p.times.map((x) => x.time)).toEqual(['18:00']);
    expect(p.dates.map((d) => d.date)).toEqual(['2026-11-17', '2026-11-19']);
  });

  it('taşıma: "yarınki" kaynak, diğer gün hedef', () => {
    const p = parse("Elif'in yarınki dersini cuma 16:00'ya taşı", today);
    expect(p.dates).toMatchObject([
      { date: '2026-11-13', source: true },
      { date: '2026-11-13', source: false },
    ]);
    expect(p.times.map((x) => x.time)).toEqual(['16:00']);
  });

  it('saat ve tarih biçimleri', () => {
    expect(parse("saat 3'te", today).times[0]!.time).toBe('15:00');
    expect(parse("17'ye", today).times[0]!.time).toBe('17:00');
    expect(parse('14 kasım', today).dates[0]!.date).toBe('2026-11-14');
    expect(parse('10 ocak', today).dates[0]!.date).toBe('2027-01-10');
    expect(parse('20/11/2026', today).dates[0]!.date).toBe('2026-11-20');
    expect(parse('cumaya kadar', today).until).toBe('2026-11-13');
    expect(parse('bir buçuk saat', today).durationMin).toBe(90);
    expect(parse('haftaya pazartesi', today).dates[0]!.date).toBe('2026-11-16');
  });

  it('ad eşleştirme: ekli ilk ad, tam ad önceliği, gün adına benzeyen isim', () => {
    const items = ['Ali Kaya', 'Ali Demir', 'Elif Demir', 'Salih'].map((displayName, i) => ({ id: String(i), displayName }));
    expect(matchName('aliye ders', items)).toMatchObject({ kind: 'many' });
    expect(matchName('ali kaya ya ders', items)).toMatchObject({ kind: 'one', item: { displayName: 'Ali Kaya' } });
    expect(matchName('sali gunu elif e ders', items)).toMatchObject({ kind: 'one', item: { displayName: 'Elif Demir' } });
  });
});

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await startApp({ AI_PROVIDER: 'rules' });
});
afterAll(async () => ctx.close());

const post = (a: Account, url: string, body: object = {}) => ctx.http().post(url).set(a.auth).send(body);
const get = (a: Account, url: string) => ctx.http().get(url).set(a.auth);

describe('Kural tabanlı asistan: uçtan uca (gerçek veritabanı)', () => {
  it('ders ekler, listeler, taşır, iptal eder; belirsiz adda seçim ister; not ve özet; kota düşmez', async () => {
    const t = await register(ctx, 'teacher', 'Kural Hoca');
    await upgrade(ctx, t, 10);
    const elif = (await post(t, '/api/students', { displayName: 'Elif Demir' })).body;
    const aliKaya = (await post(t, '/api/students', { displayName: 'Ali Kaya' })).body;
    await post(t, '/api/students', { displayName: 'Ali Demir' });
    let conversationId: string | undefined;
    const ask = async (text: string) => {
      const r = await post(t, '/api/ai/messages', { text, conversationId });
      expect(r.status).toBe(200);
      conversationId = r.body.conversationId;
      return r.body;
    };
    const confirm = async (id: string) => (await post(t, `/api/ai/actions/${id}/decide`, { decision: 'confirm' })).body;

    expect((await get(t, '/api/ai/status')).body).toEqual({ mode: 'rules' });
    const tz = 'Europe/Istanbul';
    const tomorrow = DateTime.now().setZone(tz).plus({ days: 1 });
    const dayRange = `from=${encodeURIComponent(tomorrow.startOf('day').toUTC().toISO()!)}&to=${encodeURIComponent(tomorrow.endOf('day').toUTC().toISO()!)}`;

    // Ders ekle → önizleme, onaydan önce takvim boş
    const add = await ask("Elif'e yarın 17:00'de 60 dk ders ekle");
    expect(add.actions).toHaveLength(1);
    expect(add.actions[0].preview[0]).toMatchObject({ kind: 'create', entity: 'lesson', who: 'Elif Demir' });
    expect(add.actions[0].preview[0].when).toContain('17:00–18:00');
    expect(add.text).toContain('onayınıza');
    expect((await get(t, `/api/calendar?${dayRange}`)).body).toHaveLength(0);
    expect((await confirm(add.actions[0].id)).status).toBe('applied');

    // Takvim
    const cal = await ask('yarın derslerim');
    expect(cal.text).toContain('17:00–18:00 Elif Demir');

    // Taşı
    const move = await ask("Elif'in yarınki dersini 18:30'a taşı");
    expect(move.actions[0].tool).toBe('move_lesson');
    expect(move.actions[0].preview[0].summary).toContain('18:30');
    expect((await confirm(move.actions[0].id)).status).toBe('applied');

    // Belirsiz ad → seçim → seçimle devam
    const amb = await ask("Ali'ye yarın 10:00'da ders ekle");
    expect(amb.actions).toHaveLength(0);
    expect(amb.choices[0].options.map((o: { label: string }) => o.label).sort()).toEqual(['Ali Demir', 'Ali Kaya']);
    const picked = await ask(`Ali Kaya (id: ${aliKaya.id})`);
    expect(picked.actions[0].preview[0]).toMatchObject({ entity: 'lesson', who: 'Ali Kaya' });
    expect(picked.actions[0].preview[0].when).toContain('10:00–11:00');

    // Özel not (doğrudan, geri alınabilir) ve özet
    const note = await ask('Elif için not: kesirlerde zorlanıyor');
    expect(note.undoable).toHaveLength(1);
    expect(note.text).toContain('özel');
    const ov = await ask("Elif'in durumu");
    expect(ov.text).toContain('Elif Demir');
    expect(ov.text).toContain('🔒 kesirlerde zorlanıyor');

    // İptal
    const cancel = await ask("Elif'in yarınki dersini iptal et");
    expect(cancel.actions[0].tool).toBe('cancel_lesson');
    expect((await confirm(cancel.actions[0].id)).status).toBe('applied');

    // Haftalık seri
    const series = await ask("Elif'e her salı ve perşembe 20:00'de 1 saat ders ekle, 2 hafta");
    expect(series.actions[0].preview[0].summary).toContain('4 derslik seri');

    // Okuma komutları ve yardım
    expect((await ask('ödevini teslim etmeyenler')).text).toContain('Bekleyen ödev yok');
    expect((await ask('yarın boş saatlerim')).text).toContain('Boş zamanlarınız');
    expect((await ask('merhaba')).text).toContain('Anladığım komutlar');

    // Maliyetsiz: aylık AI kotasından düşmez
    const usage = await ctx.pool.query(`SELECT count(*)::int AS n FROM usage_counter WHERE metric = 'ai_request' AND workspace_id = (SELECT workspace_id FROM student WHERE id = $1)`, [elif.id]);
    expect(usage.rows[0].n).toBe(0);
  });
});
