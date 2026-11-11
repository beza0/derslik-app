import { z } from 'zod';

export const Id = z.uuid();
export type Id = z.infer<typeof Id>;

/** ISO 8601 zaman damgası (saat dilimi ofsetli). */
export const IsoDateTime = z.iso.datetime({ offset: true });
/** YYYY-MM-DD yerel tarih. */
export const LocalDate = z.iso.date();
/** HH:mm yerel saat. */
export const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:mm biçiminde olmalı');

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const TimeZone = z.string().min(1).max(64).refine(isValidTimeZone, { message: 'Geçersiz saat dilimi' });

export const DEFAULT_TIMEZONE = 'Europe/Istanbul';

/** Yalnızca https görüşme/konum bağlantıları kabul edilir. */
export const SafeUrl = z.url({ protocol: /^https$/ }).max(2000);

export const Visibility = z.enum(['private', 'student', 'student_guardian']);
export type Visibility = z.infer<typeof Visibility>;

export const PageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type PageQuery = z.infer<typeof PageQuery>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Kullanıcının o an hangi bağlamda çalıştığı. */
export const RoleContext = z.enum(['teacher', 'student', 'guardian', 'admin']);
export type RoleContext = z.infer<typeof RoleContext>;
