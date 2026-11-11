import { describe, expect, it } from 'vitest';
import { expandWeekly, formatRange, localToUtc, utcToLocal } from './recurrence';

describe('tekrar kuralı ve saat dilimi', () => {
  it('İstanbul saati UTC+3 olarak saklanır', () => {
    expect(localToUtc('2026-11-17', '18:00', 'Europe/Istanbul').toISOString()).toBe('2026-11-17T15:00:00.000Z');
  });

  it('salı-perşembe 4 hafta = 8 ders, ilk gün haftanın gününe göre seçilir', () => {
    // 2026-11-16 Pazartesi → ilk ders 17 Kasım Salı
    const occ = expandWeekly({ weekdays: [2, 4], localStartTime: '18:00', durationMin: 60, timezone: 'Europe/Istanbul', startsOn: '2026-11-16', count: 8 });
    expect(occ).toHaveLength(8);
    expect(occ[0]!.localDate).toBe('2026-11-17');
    expect(occ[1]!.localDate).toBe('2026-11-19');
    expect(occ.at(-1)!.localDate).toBe('2026-12-10');
    expect(occ.every((o) => o.endsAt.getTime() - o.startsAt.getTime() === 3600_000)).toBe(true);
  });

  it('bitiş tarihi dahil edilir', () => {
    const occ = expandWeekly({ weekdays: [3], localStartTime: '10:00', durationMin: 45, timezone: 'Europe/Istanbul', startsOn: '2026-11-18', untilDate: '2026-12-02' });
    expect(occ.map((o) => o.localDate)).toEqual(['2026-11-18', '2026-11-25', '2026-12-02']);
  });

  it('yaz saati geçişinde yerel saat korunur, UTC değişir (Europe/Berlin)', () => {
    // Berlin 2027-03-28'de yaz saatine geçer.
    const occ = expandWeekly({ weekdays: [5], localStartTime: '18:00', durationMin: 60, timezone: 'Europe/Berlin', startsOn: '2027-03-19', count: 3 });
    expect(occ.map((o) => utcToLocal(o.startsAt, 'Europe/Berlin').time)).toEqual(['18:00', '18:00', '18:00']);
    expect(occ[0]!.startsAt.toISOString()).toBe('2027-03-19T17:00:00.000Z'); // UTC+1
    expect(occ[2]!.startsAt.toISOString()).toBe('2027-04-02T16:00:00.000Z'); // UTC+2
  });

  it('kış saatine geçişte de süre ve yerel saat doğru (America/New_York)', () => {
    // New York 2026-11-01'de kış saatine geçer.
    const occ = expandWeekly({ weekdays: [7], localStartTime: '01:30', durationMin: 60, timezone: 'America/New_York', startsOn: '2026-10-25', count: 2 });
    expect(occ.map((o) => utcToLocal(o.startsAt, 'America/New_York').time)).toEqual(['01:30', '01:30']);
    expect(occ.every((o) => o.endsAt.getTime() - o.startsAt.getTime() === 3600_000)).toBe(true);
  });

  it('atlanan tarihler sayıma girer ama üretilmez', () => {
    const occ = expandWeekly(
      { weekdays: [1], localStartTime: '09:00', durationMin: 60, timezone: 'Europe/Istanbul', startsOn: '2026-11-16', count: 3 },
      new Set(['2026-11-23']),
    );
    expect(occ.map((o) => o.localDate)).toEqual(['2026-11-16', '2026-11-30']);
  });

  it('Türkçe açık tarih biçimi', () => {
    const s = localToUtc('2026-11-18', '18:00', 'Europe/Istanbul');
    expect(formatRange(s, new Date(s.getTime() + 3600_000), 'Europe/Istanbul')).toBe('18 Kasım 2026 Çarşamba 18:00–19:00');
  });
});
