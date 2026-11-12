import { DateTime } from 'luxon';

export const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul';

export function fmtRange(startIso: string, endIso: string, zone: string) {
  const s = DateTime.fromISO(startIso, { zone }).setLocale('tr');
  const e = DateTime.fromISO(endIso, { zone }).setLocale('tr');
  return `${s.toFormat('d LLL ccc HH:mm')}–${e.toFormat('HH:mm')}`;
}

export function fmtTime(iso: string, zone: string) {
  return DateTime.fromISO(iso, { zone }).toFormat('HH:mm');
}

export function fmtDate(iso: string | null | undefined, zone?: string) {
  if (!iso) return '—';
  return DateTime.fromISO(iso, zone ? { zone } : {}).setLocale('tr').toFormat('d LLLL yyyy');
}

export function fmtDateTime(iso: string | null | undefined, zone?: string) {
  if (!iso) return '—';
  return DateTime.fromISO(iso, zone ? { zone } : {}).setLocale('tr').toFormat('d LLLL yyyy HH:mm');
}

export function relative(iso: string) {
  return DateTime.fromISO(iso).setLocale('tr').toRelative() ?? '';
}

const COLORS = ['#0f766e', '#7c3aed', '#c2410c', '#0369a1', '#be185d', '#4d7c0f', '#a16207', '#4338ca'];
export function colorFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length]!;
}
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toLocaleUpperCase('tr'))
    .join('');
}
