import { DateTime } from 'luxon';

export const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul';

export const fmtRange = (s: string, e: string, zone: string) =>
  `${DateTime.fromISO(s, { zone }).setLocale('tr').toFormat('d LLL ccc HH:mm')}–${DateTime.fromISO(e, { zone }).toFormat('HH:mm')}`;
export const fmtTime = (s: string, zone: string) => DateTime.fromISO(s, { zone }).toFormat('HH:mm');
export const fmtDateTime = (s: string | null | undefined, zone?: string) => (s ? DateTime.fromISO(s, zone ? { zone } : {}).setLocale('tr').toFormat('d LLLL yyyy HH:mm') : '—');
export const fmtDate = (s: string | null | undefined) => (s ? DateTime.fromISO(s).setLocale('tr').toFormat('d LLLL yyyy') : '—');
export const relative = (s: string) => DateTime.fromISO(s).setLocale('tr').toRelative() ?? '';
export const dayTitle = (d: DateTime) => d.setLocale('tr').toFormat('d LLLL cccc');
