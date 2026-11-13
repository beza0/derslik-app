import { DateTime } from 'luxon';
import type { AiProvider, Block, ChatMessage, CompletionResult } from './provider';
import { BRAND } from '@derslik/shared';
import { normalizeName } from './tools';

/**
 * ÜCRETSİZ KURAL TABANLI ASİSTAN — dil modeli değildir, dış servise veri göndermez.
 * Öğretmenin Türkçe komutunu kalıplarla çözer ve AI asistanın KULLANDIĞI AYNI araçları çağırır;
 * böylece önizleme/onay, kota dışı güvenlik ve yetki denetimleri aynen geçerlidir.
 * Durumsuzdur: her adımda sohbet geçmişinden komutu ve o komuttan sonra gelen araç sonuçlarını yeniden okur.
 */

export interface Ref {
  date: string; // YYYY-MM-DD
  pos: number;
  source: boolean; // "yarınki", "bugünkü": taşınacak/iptal edilecek dersin tarihi
}
export interface WeekRange {
  from: string;
  to: string;
}
export interface TimeRef {
  time: string; // HH:mm
  pos: number;
}
export interface Parsed {
  norm: string;
  dates: Ref[];
  until?: string;
  week?: WeekRange;
  times: TimeRef[];
  durationMin?: number;
  weekly: boolean;
  weekdays: number[];
  count?: number;
  weeks?: number;
  nextWeek: boolean;
}

const WEEKDAYS: [string, number][] = [
  ['pazartesi', 1],
  ['sali', 2],
  ['carsamba', 3],
  ['persembe', 4],
  ['cumartesi', 6],
  ['cuma', 5],
  ['pazar', 7],
];
const MONTHS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
const NUMBERS: Record<string, number> = { bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, onbir: 11, oniki: 12 };
/** Gün adlarından sonra gelebilecek Türkçe ekler ("cumaya", "salıları", "perşembe günü"...). */
const DAY_SUFFIX = /^(|y?[aei]|y?[ıi]|n?in|ki|ku|dan|den|da|de|lari|leri|ları|lar|ler|ndan|nden|nda|nde)$/;

/** Komut metnini karşılaştırma biçimine getirir: küçük harf, aksansız, kesme işaretleri boşluk. */
export function norm(s: string): string {
  let t = normalizeName(s).replace(/['’`´]/g, ' ');
  t = t.replace(/\bbir bucuk saat\w*/g, '90 dk').replace(/\b(\d+) bucuk saat\w*/g, (_m, n: string) => `${Number(n) * 60 + 30} dk`);
  t = t.replace(/\byarim saat\w*/g, '30 dk').replace(/\bbirer\b/g, '1').replace(/\bikiser\b/g, '2');
  t = t.replace(/\b(bir|iki|uc|dort|bes|alti|yedi|sekiz|dokuz|on|onbir|oniki)\s+(hafta|ders|saat|dakika|dk|gun)/g, (_m, w: string, u: string) => `${NUMBERS[w]} ${u}`);
  return t.replace(/\s+/g, ' ').trim();
}

const iso = (d: DateTime) => d.toISODate()!;
const pad = (n: number) => String(n).padStart(2, '0');

export function parse(text: string, today: DateTime): Parsed {
  const t = norm(text);
  let scan = t; // tarih eşleşmeleri saat aramasından önce boşlukla silinir
  const blank = (start: number, len: number) => (scan = scan.slice(0, start) + ' '.repeat(len) + scan.slice(start + len));
  const dates: Ref[] = [];
  let until: string | undefined;
  const nextWeek = /\b(haftaya|gelecek hafta|onumuzdeki hafta|sonraki hafta)/.test(t);
  const monday = today.startOf('week');

  const add = (d: DateTime, pos: number, word: string, len: number) => {
    const after = t.slice(pos + len, pos + len + 14);
    if (/^\s*(e|a|ye|ya)?\s*kadar/.test(after) || /^\s*kadar/.test(after)) {
      until = iso(d);
      return;
    }
    dates.push({ date: iso(d), pos, source: /(ki|ku)$/.test(word) || /^\s*gunku/.test(after) });
  };

  for (const m of t.matchAll(/(?:^|\s)((?:yarindan sonra)|(?:obur gun|ertesi gun)\w*|bugun\w*|yarin\w*)/g)) {
    const w = m[1]!;
    const pos = m.index! + m[0].length - w.length;
    const d = w.startsWith('bugun') ? today : w.startsWith('yarindan') || w.startsWith('obur') || w.startsWith('ertesi') ? today.plus({ days: 2 }) : today.plus({ days: 1 });
    add(d, pos, w, w.length);
    blank(pos, w.length);
  }
  for (const m of t.matchAll(/(?:^|\s)(pazartesi|sali|carsamba|persembe|cumartesi|cuma|pazar)(\w*)/g)) {
    if (!DAY_SUFFIX.test(m[2]!)) continue;
    const wd = WEEKDAYS.find(([n]) => n === m[1])![1];
    const pos = m.index! + m[0].length - m[1]!.length - m[2]!.length;
    const d = nextWeek ? monday.plus({ weeks: 1, days: wd - 1 }) : today.plus({ days: (wd - today.weekday + 7) % 7 });
    add(d, pos, m[1]! + m[2]!, m[1]!.length + m[2]!.length);
    blank(pos, m[1]!.length + m[2]!.length);
  }
  for (const m of t.matchAll(/(\d{1,2})\s+(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\w*(?:\s+(\d{4}))?/g)) {
    let d = DateTime.fromObject({ year: m[3] ? Number(m[3]) : today.year, month: MONTHS.indexOf(m[2]!) + 1, day: Number(m[1]) }, { zone: today.zone });
    if (!d.isValid) continue;
    if (!m[3] && d < today) d = d.plus({ years: 1 });
    add(d, m.index!, m[0].trim(), m[0].length);
    blank(m.index!, m[0].length);
  }
  for (const m of t.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b|\b(\d{1,2})\/(\d{1,2})\b/g)) {
    const day = Number(m[1] ?? m[4]);
    const month = Number(m[2] ?? m[5]);
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : today.year;
    let d = DateTime.fromObject({ year, month, day }, { zone: today.zone });
    if (!d.isValid) continue;
    if (!m[3] && d < today) d = d.plus({ years: 1 });
    add(d, m.index!, m[0], m[0].length);
    blank(m.index!, m[0].length);
  }
  dates.sort((a, b) => a.pos - b.pos);

  let week: WeekRange | undefined;
  if (/\bbu hafta/.test(t)) week = { from: iso(today), to: iso(today.endOf('week')) };
  if (nextWeek) week = { from: iso(monday.plus({ weeks: 1 })), to: iso(monday.plus({ weeks: 1 }).endOf('week')) };

  // Süre: "60 dk", "90 dakika", "1 saat", "1,5 saatlik"
  let durationMin: number | undefined;
  const dk = /\b(\d{1,3})\s*(?:dk|dakika)\w*/.exec(scan);
  const hr = /\b(\d(?:[.,]5)?)\s*saat\w*/.exec(scan);
  if (dk) durationMin = Number(dk[1]);
  else if (hr) durationMin = Math.round(Number(hr[1]!.replace(',', '.')) * 60);
  if (dk) blank(dk.index, dk[0].length);
  if (hr) blank(hr.index, hr[0].length);

  // Saat: "15:00", "15.30", "saat 15", "15'te", "17'ye"
  const times: TimeRef[] = [];
  const pushTime = (h: number, min: number, pos: number, explicitMin: boolean) => {
    if (!explicitMin && h >= 1 && h <= 7) h += 12; // "saat 3" → 15:00 (ders saatleri öğleden sonra yoğun)
    if (h > 23 || min > 59) return;
    if (!times.some((x) => x.pos === pos)) times.push({ time: `${pad(h)}:${pad(min)}`, pos });
  };
  for (const m of scan.matchAll(/\b(\d{1,2})[:.](\d{2})\b/g)) pushTime(Number(m[1]), Number(m[2]), m.index!, true);
  for (const m of scan.matchAll(/\bsaat\s+(\d{1,2})\b(?![:.]\d)/g)) pushTime(Number(m[1]), 0, m.index! + m[0].length - m[1]!.length, false);
  for (const m of scan.matchAll(/(?<![:.\d])\b(\d{1,2})\s+(?:te|de|ta|da|ye|ya|e|a|ten|den|tan|dan)\b/g)) pushTime(Number(m[1]), 0, m.index!, false);
  times.sort((a, b) => a.pos - b.pos);

  const weekly = /\bher\b|hafta boyunca|her hafta|haftalik|duzenli|tekrarla/.test(t);
  const weekdays = weekly ? [...new Set(dates.map((d) => DateTime.fromISO(d.date).weekday))] : [];
  const cnt = /\b(\d{1,3})\s*ders\b/.exec(t);
  const wks = /\b(\d{1,2})\s*hafta\b/.exec(t);
  return { norm: t, dates, until, week, times, durationMin, weekly, weekdays, count: cnt ? Number(cnt[1]) : undefined, weeks: wks ? Number(wks[1]) : undefined, nextWeek };
}

export interface Named {
  id: string;
  displayName: string;
}
export type Match = { kind: 'one'; item: Named } | { kind: 'many'; query: string; items: Named[] } | { kind: 'none' };

/** Metinde geçen öğrenci/grup adını bulur. Tam ad tek eşleşmeyi, ilk ad (ekleriyle) aday listesini verir. */
export function matchName(commandNorm: string, items: Named[]): Match {
  const hay = ` ${commandNorm} `;
  const full = items.filter((s) => {
    const n = norm(s.displayName);
    return n.length >= 2 && hay.includes(` ${n}`);
  });
  if (full.length) {
    const longest = Math.max(...full.map((s) => s.displayName.length));
    const best = full.filter((s) => s.displayName.length === longest);
    if (best.length === 1) return { kind: 'one', item: best[0]! };
    return { kind: 'many', query: best[0]!.displayName, items: best };
  }
  const first = items.filter((s) => {
    const f = norm(s.displayName).split(' ')[0]!;
    return f.length >= 3 ? new RegExp(`\\s${f}\\w{0,6}\\s`).test(hay) : hay.includes(` ${f} `);
  });
  if (first.length === 1) return { kind: 'one', item: first[0]! };
  if (first.length > 1) return { kind: 'many', query: first[0]!.displayName.split(' ')[0]!, items: first };
  return { kind: 'none' };
}

// ───────────────────────── Sohbetten durumu okuma ─────────────────────────

interface ToolOut {
  raw: string;
  json?: unknown;
  error: boolean;
}
interface State {
  command: string;
  pinned?: { id: string; label: string };
  results: Map<string, ToolOut>;
}

const textOf = (m: ChatMessage) => m.content.filter((b) => b.type === 'text').map((b) => String(b.text)).join('\n').trim();
const isUserText = (m: ChatMessage) => m.role === 'user' && !m.content.some((b) => b.type === 'tool_result') && textOf(m) !== '';
const PIN = /^(.*?)\s*\(id:\s*([0-9a-f-]{36})\)\s*$/i;

export function readState(messages: ChatMessage[]): State {
  let i = messages.length - 1;
  while (i >= 0 && !isUserText(messages[i]!)) i--;
  let command = i >= 0 ? textOf(messages[i]!) : '';
  let pinned: State['pinned'];
  const pin = PIN.exec(command);
  let from = i;
  if (pin) {
    // Seçim düğmesi: asıl komut bir önceki kullanıcı mesajıdır.
    pinned = { id: pin[2]!.toLowerCase(), label: pin[1]!.trim() };
    let j = i - 1;
    while (j >= 0 && !isUserText(messages[j]!)) j--;
    if (j >= 0) {
      command = textOf(messages[j]!);
      from = j;
    }
  }
  const names = new Map<string, string>();
  const results = new Map<string, ToolOut>();
  for (const m of messages.slice(from + 1)) {
    for (const b of m.content) {
      if (b.type === 'tool_use') names.set(String(b.id), String(b.name));
      if (b.type === 'tool_result') {
        const name = names.get(String(b.tool_use_id));
        if (!name) continue;
        const raw = String(b.content ?? '');
        let json: unknown;
        try {
          json = JSON.parse(raw);
        } catch {
          json = undefined;
        }
        results.set(name, { raw, json, error: Boolean(b.is_error) });
      }
    }
  }
  return { command, pinned, results };
}

// ───────────────────────── Planlama ─────────────────────────

type Step = { tool: string; input: Record<string, unknown> } | { text: string };
const say = (text: string): Step => ({ text });
const call = (tool: string, input: Record<string, unknown> = {}): Step => ({ tool, input });

interface CalItem {
  id: string;
  seriesId: string | null;
  who: string;
  status: string;
  when: string;
  date: string;
  start: string;
}

const fmtDay = (d: string) => DateTime.fromISO(d).setLocale('tr').toFormat('d LLLL cccc');

export const HELP = [
  `Ben ${BRAND.name} uygulamasının ücretsiz basit asistanıyım: komutlarınızı kalıplarla anlıyorum (yapay zekâ değilim, verileriniz dışarı gönderilmez).`,
  'Takvimi, notları veya ödevleri değiştiren her işlem önce önizleme olarak gelir; siz onaylamadan hiçbir şey değişmez.',
  '',
  'Anladığım komutlar:',
  '• "Bugünkü derslerim" · "Yarın programım" · "Bu hafta derslerim"',
  '• "Elif\'e yarın 17:00\'de 60 dk ders ekle"',
  '• "Elif\'e her salı ve perşembe 18:00\'de 1 saat ders ekle, 4 hafta"',
  '• "Elif\'in yarınki dersini cuma 16:00\'ya taşı"',
  '• "Elif\'in yarınki dersini iptal et"',
  '• "Gelecek hafta boş saatlerim" · "Yarın 90 dk boş zaman"',
  '• "Ödevini teslim etmeyenler"',
  '• "Elif\'in durumu" (son dersler, notlar, sınavlar, ödevler)',
  '• "Elif için not: kesirlerde zorlanıyor" (yalnızca size özel)',
  '• "Elif\'e ödev ver: Sayfa 12-14, son tarih cuma"',
  '• "Yeni öğrenci: Ali Yılmaz, Ayşe Kaya"',
].join('\n');

function finish(r: ToolOut, ok: string): Step {
  if (r.error) return say(`Yapılamadı: ${r.raw.replace(/^[A-Z_]+:\s*/, '')}`);
  return say(ok);
}

function plan(st: State, today: DateTime): Step {
  const { command, results: R } = st;
  const p = parse(command, today);
  const t = p.norm;
  const colon = command.indexOf(':');
  const head = colon >= 0 ? norm(command.slice(0, colon)) : t; // ad eşleştirmesi yalnızca komut kısmında
  const body = colon >= 0 ? command.slice(colon + 1).trim() : '';

  const students = (R.get('list_students')?.json as { students?: Named[] } | undefined)?.students;
  const groups = (R.get('list_groups')?.json as { groups?: { id: string; name: string }[] } | undefined)?.groups;

  /** Hedef öğrenci: seçimle sabitlenmiş, metinde tek eşleşen ya da belirsiz. */
  const target = (allowGroup = false): { step?: Step; student?: Named; group?: Named } => {
    if (st.pinned) {
      const s = students?.find((x) => x.id === st.pinned!.id);
      return { student: s ?? { id: st.pinned.id, displayName: st.pinned.label } };
    }
    if (!students) return { step: call('list_students') };
    const m = matchName(head, students);
    if (m.kind === 'one') return { student: m.item };
    if (m.kind === 'many') {
      if (R.has('find_students')) return { step: say(`Birden fazla öğrenci eşleşti (${m.items.map((x) => x.displayName).join(', ')}). Hangisini kastettiniz? Aşağıdan seçin.`) };
      return { step: call('find_students', { query: m.query }) };
    }
    if (allowGroup) {
      if (!groups) return { step: call('list_groups') };
      const g = matchName(head, groups.map((x) => ({ id: x.id, displayName: x.name })));
      if (g.kind === 'one') return { group: g.item };
    }
    return {};
  };

  const calendarFor = (from: string, to: string): Step | CalItem[] => {
    const r = R.get('get_calendar');
    if (!r) return call('get_calendar', { fromDate: from, toDate: to });
    if (r.error) return say(`Takvim okunamadı: ${r.raw}`);
    return r.json as CalItem[];
  };

  // ── Yardım
  if (/\b(yardim|neler yapabil|ne yapabil|komutlar|nasil kullan)/.test(t) || t === '') return say(HELP);

  // ── Yeni öğrenci
  if (/\b(yeni ogrenci|ogrenci(ler|leri|yi)? (ekle|olustur|kaydet))/.test(t)) {
    const done = R.get('create_students');
    if (done) return finish(done, 'Yeni öğrenci kayıtlarını aşağıda onayınıza sundum.');
    const rest = colon >= 0 ? body : command.replace(/^.*?(yeni\s+\S*|\S+\s+(ekle|oluştur|olustur|kaydet))\s*/iu, '');
    const names = rest.split(/,|;|\n|\s+ve\s+/).map((s) => s.trim()).filter((s) => s.length >= 2 && s.length <= 100);
    if (!names.length) return say('Öğrenci adlarını şöyle yazın: "Yeni öğrenci: Ali Yılmaz, Ayşe Kaya"');
    return call('create_students', { students: names.slice(0, 20).map((displayName) => ({ displayName })) });
  }

  // ── Not
  if (/\bnot(u|unu|lar)?\b/.test(head) && (colon >= 0 || /\bnot (ekle|al|yaz|dus|gir|kaydet|gonder|paylas)/.test(t)) && !/\bnotlari(ni)?\b/.test(head)) {
    const shared = /(paylas|gonder|bildir|ilet)/.test(head);
    const toolName = shared ? 'create_shared_note' : 'add_private_note';
    const done = R.get(toolName);
    if (done) return finish(done, shared ? 'Paylaşılan notu aşağıda onayınıza sundum.' : 'Size özel not kaydedildi (öğrenci ve veli görmez). İsterseniz geri alabilirsiniz.');
    if (!body) return say('Notu şöyle yazın: "Elif için not: kesirlerde zorlanıyor"');
    const x = target();
    if (x.step) return x.step;
    if (!x.student) return say('Notun hangi öğrenci için olduğunu bulamadım. Örnek: "Elif için not: ..."');
    if (shared) return call(toolName, { studentId: x.student.id, body, visibility: /(veli|aile|anne|baba)/.test(head) ? 'student_guardian' : 'student' });
    return call(toolName, { studentId: x.student.id, body });
  }

  // ── Ödev ver
  if (/\bodev/.test(head) && /(ver|ekle|olustur|gonder|yayinla|hazirla|ata)/.test(head) && colon >= 0) {
    const done = R.get('create_assignment');
    if (done) return finish(done, 'Ödevi aşağıda onayınıza sundum.');
    if (!body) return say('Ödevi şöyle yazın: "Elif\'e ödev ver: Sayfa 12-14, son tarih cuma"');
    const x = target(true);
    if (x.step) return x.step;
    if (!x.student && !x.group) return say('Ödevin kime verileceğini bulamadım. Örnek: "Elif\'e ödev ver: ..."');
    const due = p.until ?? p.dates.at(-1)?.date;
    const time = p.times.at(-1)?.time ?? '20:00';
    const [first, ...rest] = body.split(/\n/);
    const title = first!.replace(/,?\s*(son tarih|teslim)\b.*$/iu, '').trim().slice(0, 200) || 'Ödev';
    return call('create_assignment', {
      title,
      description: rest.join('\n').trim() || (title !== first!.trim() ? first!.trim() : undefined),
      ...(x.group ? { groupId: x.group.id } : { studentIds: [x.student!.id] }),
      dueAt: due ? DateTime.fromISO(`${due}T${time}`, { zone: today.zone }).toISO() : undefined,
      publish: /(ver|gonder|yayinla|ata)/.test(head),
    });
  }

  // ── Ders iptal / taşıma
  const isCancel = /\biptal/.test(t);
  const isMove = !isCancel && /(tasi|ertele|kaydir|degistir|\d\s+(ye|ya|e|a)\s+(al|cek)\b)/.test(t) && /ders/.test(t);
  if (isCancel || isMove) {
    const toolName = isCancel ? 'cancel_lesson' : 'move_lesson';
    const done = R.get(toolName);
    if (done) return finish(done, isCancel ? 'İptali aşağıda onayınıza sundum. Onaylarsanız öğrenci ve veliye bildirim gider.' : 'Yeni zamanı aşağıda onayınıza sundum.');
    const x = target(true);
    if (x.step) return x.step;
    const who = x.student?.displayName ?? x.group?.displayName;
    const sourceRef = p.dates.find((d) => d.source) ?? (isCancel || p.dates.length > 1 ? p.dates[0] : undefined);
    const targetRef = isMove ? p.dates.filter((d) => d !== sourceRef).at(-1) : undefined;
    const sourceTime = isCancel ? p.times[0]?.time : p.times.length > 1 ? p.times[0]!.time : undefined;
    if (!who && !sourceRef) return say('Hangi dersi kastettiğinizi bulamadım. Örnek: "Elif\'in yarınki dersini iptal et"');
    const from = sourceRef?.date ?? iso(today);
    const to = sourceRef?.date ?? iso(today.plus({ days: 60 }));
    const cal = calendarFor(from, to);
    if (!Array.isArray(cal)) return cal;
    const nowTime = DateTime.now().setZone(today.zone).toFormat('HH:mm');
    const found = cal.filter(
      (l) =>
        l.status === 'scheduled' &&
        (!who || l.who === who) &&
        (!sourceTime || l.start === sourceTime) &&
        (sourceRef || l.date > iso(today) || l.start >= nowTime),
    );
    if (!found.length) return say(`${who ? `${who} için ` : ''}${sourceRef ? fmtDay(sourceRef.date) + ' ' : 'yaklaşan '}planlanmış ders bulamadım.`);
    if (found.length > 1 && sourceRef) {
      return say(`O gün birden fazla ders var: ${found.map((l) => `${l.start} ${l.who}`).join(', ')}. Saatini de yazar mısınız?`);
    }
    const lesson = found[0]!;
    const following = /(bundan sonra|sonrakiler|hepsi|tum seri|seriyi|her hafta)/.test(t) && lesson.seriesId;
    if (isCancel) return call('cancel_lesson', { lessonId: lesson.id, scope: following ? 'this_and_following' : 'this' });
    const newTime = p.times.at(-1)?.time;
    if (!targetRef && !newTime && !p.durationMin) return say('Dersi hangi gün ve saate taşıyayım? Örnek: "...cuma 16:00\'ya taşı"');
    if (following) {
      return call('move_lesson', {
        lessonId: lesson.id,
        scope: 'this_and_following',
        ...(newTime ? { startTime: newTime } : {}),
        ...(p.durationMin ? { durationMin: p.durationMin } : {}),
        ...(targetRef ? { weekdays: [DateTime.fromISO(targetRef.date).weekday] } : {}),
      });
    }
    return call('move_lesson', {
      lessonId: lesson.id,
      scope: 'this',
      date: targetRef?.date ?? lesson.date,
      ...(newTime ? { startTime: newTime } : {}),
      ...(p.durationMin ? { durationMin: p.durationMin } : {}),
    });
  }

  // ── Ders ekle
  if (/\bders/.test(t) && /(ekle|koy|olustur|planla|ayarla|kaydet|yaz)\b|\bekle/.test(t)) {
    const done = R.get('create_lessons');
    if (done) return finish(done, 'Dersi aşağıda onayınıza sundum. Onaylamadan takvime eklenmez.');
    const x = target(true);
    if (x.step) return x.step;
    if (!x.student && !x.group) return say('Dersin hangi öğrenci veya grup için olduğunu bulamadım. Örnek: "Elif\'e yarın 17:00\'de ders ekle"');
    const time = p.times[0]?.time;
    if (!time) return say('Saatini de yazar mısınız? Örnek: "...yarın 17:00\'de ders ekle"');
    const durationMin = p.durationMin ?? 60;
    const mode = /\b(online|cevrim ?ici|uzaktan|zoom|meet)\b/.test(t) ? 'online' : 'in_person';
    const url = /https?:\/\/\S+/.exec(command)?.[0];
    const who = x.group ? { groupId: x.group.id } : { studentId: x.student!.id };
    if (p.weekly) {
      const base = p.nextWeek ? today.startOf('week').plus({ weeks: 1 }) : today;
      const weekdays = p.weekdays.length ? p.weekdays : p.dates[0] ? [DateTime.fromISO(p.dates[0].date).weekday] : [];
      if (!weekdays.length) return say('Hangi günler? Örnek: "her salı ve perşembe 18:00\'de"');
      const first = weekdays.map((wd) => base.plus({ days: (wd - base.weekday + 7) % 7 })).sort((a, b) => a.toMillis() - b.toMillis())[0]!;
      const recurrence = p.until ? { weekdays, untilDate: p.until } : { weekdays, count: p.count ?? (p.weeks ?? 8) * weekdays.length };
      return call('create_lessons', { ...who, date: iso(first), startTime: time, durationMin, mode, ...(url ? { meetingUrl: url } : {}), recurrence });
    }
    const date = p.dates[0]?.date;
    if (!date) return say('Hangi gün? Örnek: "yarın", "cuma", "14 kasım". Haftalık için "her salı" yazabilirsiniz.');
    return call('create_lessons', { ...who, date, startTime: time, durationMin, mode, ...(url ? { meetingUrl: url } : {}) });
  }

  // ── Eksik ödevler
  if (/\bodev/.test(t)) {
    const r = R.get('open_homework');
    if (!r) return call('open_homework');
    const rows = (r.json as { student: string; title: string; status: string; dueAt: string | null }[]) ?? [];
    if (!rows.length) return say('Bekleyen ödev yok; herkes teslim etmiş görünüyor.');
    const by = new Map<string, string[]>();
    for (const x of rows) {
      const due = x.dueAt ? ` (son: ${DateTime.fromISO(x.dueAt).setZone(today.zone).setLocale('tr').toFormat('d LLL HH:mm')})` : '';
      const st2 = x.status === 'revision_requested' ? ' — yeniden teslim istendi' : '';
      by.set(x.student, [...(by.get(x.student) ?? []), `${x.title}${due}${st2}`]);
    }
    return say(['Teslim bekleyen ödevler:', ...[...by].map(([s, list]) => `• ${s}: ${list.join('; ')}`)].join('\n'));
  }

  // ── Boş saatler
  if (/\b(bos|musait|uygun)\b|\bbosluk/.test(t)) {
    const r = R.get('find_free_slots');
    const range = p.dates[0] ? { from: p.dates[0].date, to: p.dates.at(-1)!.date } : (p.week ?? { from: iso(today), to: iso(today.plus({ days: 6 })) });
    if (!r) return call('find_free_slots', { fromDate: range.from, toDate: range.to, durationMin: p.durationMin ?? 60 });
    if (r.error) return say(`Boş saatler bulunamadı: ${r.raw}`);
    const free = (r.json as { free: { date: string; from: string; to: string }[] }).free;
    if (!free.length) return say('Bu aralıkta 09:00–21:00 arasında uygun boşluk yok.');
    const by = new Map<string, string[]>();
    for (const f of free) by.set(f.date, [...(by.get(f.date) ?? []), `${f.from}–${f.to}`]);
    return say([`Boş zamanlarınız (09:00–21:00, en az ${p.durationMin ?? 60} dk):`, ...[...by].map(([d, l]) => `• ${fmtDay(d)}: ${l.join(', ')}`)].join('\n'));
  }

  // ── Öğrenci durumu
  const wantsOverview = /(durum|ozet|nasil gidiyor|rapor|ilerleme|genel bakis|bilgi|notlari|son dersleri)/.test(t);
  const wantsCalendar = /\b(ders|program|takvim)/.test(t) || p.dates.length > 0 || Boolean(p.week);
  if (wantsOverview || !wantsCalendar) {
    if (!students && !st.pinned) return call('list_students');
    const x = target();
    if (x.step) return x.step;
    if (x.student) {
      const r = R.get('student_overview');
      if (!r) return call('student_overview', { studentId: x.student.id });
      if (r.error) return say(`Öğrenci bilgisi okunamadı: ${r.raw}`);
      return say(overview(r.json as Overview));
    }
    if (!wantsCalendar) return say(`Bunu anlayamadım.\n\n${HELP}`);
  }

  // ── Takvim
  if (/\bgrup/.test(t) && !/\bders/.test(t)) {
    const r = R.get('list_groups');
    if (!r) return call('list_groups');
    const gs = (r.json as { groups: { name: string }[] }).groups;
    return say(gs.length ? `Gruplarınız: ${gs.map((g) => g.name).join(', ')}` : 'Henüz grubunuz yok.');
  }
  const range = p.dates[0] ? { from: p.dates[0].date, to: p.dates.at(-1)!.date } : (p.week ?? { from: iso(today), to: iso(today) });
  const cal = calendarFor(range.from, range.to);
  if (!Array.isArray(cal)) return cal;
  const label = range.from === range.to ? fmtDay(range.from) : `${fmtDay(range.from)} – ${fmtDay(range.to)}`;
  if (!cal.length) return say(`${label}: planlanmış ders yok.`);
  const by = new Map<string, string[]>();
  for (const l of cal) {
    const end = /–(\d{2}:\d{2})/.exec(l.when)?.[1];
    by.set(l.date, [...(by.get(l.date) ?? []), `${l.start}${end ? `–${end}` : ''} ${l.who}${l.status === 'cancelled' ? ' (iptal)' : l.status === 'done' ? ' (yapıldı)' : ''}`]);
  }
  return say([`${label} — ${cal.filter((l) => l.status !== 'cancelled').length} ders:`, ...[...by].flatMap(([d, list]) => (by.size > 1 ? [`${fmtDay(d)}`, ...list.map((x) => `  • ${x}`)] : list.map((x) => `• ${x}`)))].join('\n'));
}

interface Overview {
  student: { name: string; level: string | null; goal: string | null; subject: string | null };
  notes: { kind: string; topic: string | null; body: string; visibility: string; createdAt: string }[];
  recentLessons: { when: string; status: string; topics: string | null; nextPlan: string | null }[];
  assessments: { title: string; date: string; score: string | number | null; maxScore: string | number | null; topic: string | null }[];
  openHomework: { title: string; status: string; dueAt: string | null }[];
}

function overview(o: Overview): string {
  const s = o.student;
  const out = [`${s.name}${[s.subject, s.level].filter(Boolean).length ? ` — ${[s.subject, s.level].filter(Boolean).join(', ')}` : ''}`];
  if (s.goal) out.push(`Hedef: ${s.goal}`);
  out.push('', 'Son dersler:');
  out.push(...(o.recentLessons.length ? o.recentLessons.slice(0, 4).map((l) => `• ${l.when.replace(/\s*\(.*\)$/, '')}${l.topics ? ` — ${l.topics}` : ''}`) : ['• Kayıt yok']));
  const plan = o.recentLessons.find((l) => l.nextPlan)?.nextPlan;
  if (plan) out.push(`Sonraki ders planı: ${plan}`);
  if (o.assessments.length) {
    out.push('', 'Değerlendirmeler:');
    out.push(...o.assessments.slice(0, 4).map((a) => `• ${a.title}${a.score !== null ? `: ${a.score}${a.maxScore !== null ? `/${a.maxScore}` : ''}` : ''}`));
  }
  out.push('', 'Son notlar:');
  out.push(
    ...(o.notes.length
      ? o.notes.slice(0, 4).map((n) => `• ${n.visibility === 'private' ? '🔒 ' : ''}${n.topic ? `${n.topic}: ` : ''}${n.body.replace(/<\/?veri>/g, '').slice(0, 200)}`)
      : ['• Not yok']),
  );
  out.push('', `Açık ödevler: ${o.openHomework.length ? o.openHomework.map((h) => h.title).join(', ') : 'yok'}`);
  return out.join('\n');
}

// ───────────────────────── Sağlayıcı ─────────────────────────

export class RulesProvider implements AiProvider {
  readonly name = 'rules' as const;
  constructor(private readonly clock: () => Date = () => new Date()) {}

  async complete(req: { messages: ChatMessage[]; context?: { timezone: string } }): Promise<CompletionResult> {
    const zone = req.context?.timezone ?? 'Europe/Istanbul';
    const today = DateTime.fromJSDate(this.clock(), { zone }).startOf('day');
    const usage = { inputTokens: 0, outputTokens: 0 };
    const step = plan(readState(req.messages), today);
    if ('text' in step) return { content: [{ type: 'text', text: step.text }], stopReason: 'end_turn', usage, model: 'rules' };
    const input = Object.fromEntries(Object.entries(step.input).filter(([, v]) => v !== undefined));
    const block: Block = { type: 'tool_use', id: `toolu_rules_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name: step.tool, input };
    return { content: [block], stopReason: 'tool_use', usage, model: 'rules' };
  }
}
