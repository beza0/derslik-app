import { DateTime } from 'luxon';

export interface Occurrence {
  /** Dersin yerel tarihi (YYYY-MM-DD), dersin saat diliminde. */
  localDate: string;
  startsAt: Date;
  endsAt: Date;
}

export interface WeeklyRule {
  weekdays: number[]; // ISO 1..7
  localStartTime: string; // HH:mm
  durationMin: number;
  timezone: string;
  startsOn: string; // YYYY-MM-DD (ilk aday gün)
  untilDate?: string | null;
  count?: number | null;
}

/** En fazla bu kadar oturum; daha uzun seriler parçalı oluşturulmalı. */
export const MAX_OCCURRENCES = 200;
/** Bitiş tarihi olan serilerde en fazla bu kadar gün ileri. */
export const MAX_SPAN_DAYS = 400;

/**
 * Yerel tarih + yerel saat → UTC. Saat dilimi yerel saati korur: yaz/kış saati geçişinde
 * 18:00 dersi yine yerel 18:00'dir (UTC karşılığı değişir). İleri sarma boşluğundaki saatler
 * Luxon tarafından ileri kaydırılır.
 */
export function localToUtc(localDate: string, localTime: string, timezone: string): Date {
  const dt = DateTime.fromISO(`${localDate}T${localTime}`, { zone: timezone });
  if (!dt.isValid) throw new Error(`Geçersiz tarih/saat: ${localDate} ${localTime} ${timezone}`);
  return dt.toJSDate();
}

export function utcToLocal(d: Date, timezone: string): { date: string; time: string; weekday: number } {
  const dt = DateTime.fromJSDate(d, { zone: timezone });
  return { date: dt.toISODate()!, time: dt.toFormat('HH:mm'), weekday: dt.weekday };
}

export function single(localDate: string, localTime: string, durationMin: number, timezone: string): Occurrence {
  const startsAt = localToUtc(localDate, localTime, timezone);
  return { localDate, startsAt, endsAt: new Date(startsAt.getTime() + durationMin * 60_000) };
}

/** Haftalık kuralı somut oturumlara açar. `skipDates` verilen yerel tarihler atlanır (ama sayıma girer). */
export function expandWeekly(rule: WeeklyRule, skipDates: Set<string> = new Set()): Occurrence[] {
  const days = new Set(rule.weekdays);
  if (days.size === 0) return [];
  let cursor = DateTime.fromISO(rule.startsOn, { zone: rule.timezone }).startOf('day');
  const until = rule.untilDate
    ? DateTime.fromISO(rule.untilDate, { zone: rule.timezone }).startOf('day')
    : cursor.plus({ days: MAX_SPAN_DAYS });
  const hardStop = cursor.plus({ days: MAX_SPAN_DAYS });
  const max = Math.min(rule.count ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  const out: Occurrence[] = [];
  let produced = 0;
  while (cursor <= until && cursor <= hardStop && produced < max) {
    if (days.has(cursor.weekday)) {
      produced++;
      const localDate = cursor.toISODate()!;
      if (!skipDates.has(localDate)) out.push(single(localDate, rule.localStartTime, rule.durationMin, rule.timezone));
    }
    cursor = cursor.plus({ days: 1 });
  }
  return out;
}

export function addDays(localDate: string, n: number): string {
  return DateTime.fromISO(localDate).plus({ days: n }).toISODate()!;
}

/** Kullanıcıya gösterilecek açık tarih: "18 Kasım 2026 Çarşamba 18:00–19:00". */
export function formatRange(startsAt: Date, endsAt: Date, timezone: string, locale = 'tr'): string {
  const s = DateTime.fromJSDate(startsAt, { zone: timezone }).setLocale(locale);
  const e = DateTime.fromJSDate(endsAt, { zone: timezone }).setLocale(locale);
  return `${s.toFormat('d LLLL yyyy cccc HH:mm')}–${e.toFormat('HH:mm')}`;
}
