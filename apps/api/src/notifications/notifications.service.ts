import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { NotificationCategory, NotificationDto } from '@derslik/shared';
import { DB, type Db, type Tx } from '../db/db';
import { guardianLink, notification, notificationPref, studentAccountLink } from '../db/schema';

export interface NotifyInput {
  workspaceId: string | null;
  category: NotificationCategory;
  /** Örn. lesson.created */
  type: string;
  /** i18n anahtarı. Parametreler özel içerik (not metni, cevap anahtarı) TAŞIMAMALI. */
  titleKey: string;
  params?: Record<string, string>;
  link: string;
  /** Aynı olay için tekrar bildirim üretmemek üzere olay anahtarı; kullanıcı başına tekil. */
  dedupeKey: string;
}

/** Kapatılamayan kategoriler. */
const ALWAYS_ON: NotificationCategory[] = ['system'];

@Injectable()
export class NotificationsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Öğrenci kayıtlarına bağlı öğrenci ve veli hesapları. */
  async recipientsForStudents(tx: Tx, studentIds: string[], opts: { guardians?: boolean } = { guardians: true }): Promise<string[]> {
    if (studentIds.length === 0) return [];
    const s = await tx.select({ userId: studentAccountLink.userId }).from(studentAccountLink).where(inArray(studentAccountLink.studentId, studentIds));
    const g = opts.guardians
      ? await tx.select({ userId: guardianLink.userId }).from(guardianLink).where(inArray(guardianLink.studentId, studentIds))
      : [];
    return [...new Set([...s, ...g].map((r) => r.userId))];
  }

  /** Bildirimleri aynı transaction içinde yazar; kayıt geri alınırsa bildirim de oluşmaz. */
  async notify(tx: Tx, userIds: string[], input: NotifyInput): Promise<void> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return;
    let targets = unique;
    if (!ALWAYS_ON.includes(input.category)) {
      const off = await tx
        .select({ userId: notificationPref.userId })
        .from(notificationPref)
        .where(and(inArray(notificationPref.userId, unique), eq(notificationPref.category, input.category), eq(notificationPref.enabled, false)));
      const offSet = new Set(off.map((o) => o.userId));
      targets = unique.filter((u) => !offSet.has(u));
    }
    if (targets.length === 0) return;
    await tx
      .insert(notification)
      .values(
        targets.map((userId) => ({
          userId,
          workspaceId: input.workspaceId,
          category: input.category,
          type: input.type,
          titleKey: input.titleKey,
          params: input.params ?? {},
          link: input.link,
          dedupeKey: input.dedupeKey,
        })),
      )
      .onConflictDoNothing();
  }

  async list(userId: string, opts: { cursor?: string; limit: number; unreadOnly?: boolean }) {
    const rows = await this.db
      .select()
      .from(notification)
      .where(
        and(
          eq(notification.userId, userId),
          opts.unreadOnly ? isNull(notification.readAt) : undefined,
          opts.cursor ? lt(notification.createdAt, new Date(opts.cursor)) : undefined,
        ),
      )
      .orderBy(desc(notification.createdAt))
      .limit(opts.limit + 1);
    const items: NotificationDto[] = rows.slice(0, opts.limit).map((n) => ({
      id: n.id,
      category: n.category as NotificationCategory,
      type: n.type,
      titleKey: n.titleKey,
      params: n.params,
      link: n.link,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
    return { items, nextCursor: rows.length > opts.limit ? items.at(-1)!.createdAt : null };
  }

  async unreadCount(userId: string): Promise<number> {
    const [r] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(notification)
      .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
    return r?.n ?? 0;
  }

  async markRead(userId: string, ids: string[] | 'all'): Promise<void> {
    await this.db
      .update(notification)
      .set({ readAt: new Date() })
      .where(and(eq(notification.userId, userId), isNull(notification.readAt), ids === 'all' ? undefined : inArray(notification.id, ids)));
  }

  async prefs(userId: string) {
    const rows = await this.db.select().from(notificationPref).where(eq(notificationPref.userId, userId));
    const map = new Map(rows.map((r) => [r.category, r.enabled]));
    return (['lesson', 'reminder', 'assignment', 'feedback', 'request', 'system'] as const).map((c) => ({
      category: c,
      enabled: ALWAYS_ON.includes(c) ? true : (map.get(c) ?? true),
      locked: ALWAYS_ON.includes(c),
    }));
  }

  async setPref(userId: string, category: NotificationCategory, enabled: boolean) {
    if (ALWAYS_ON.includes(category)) return;
    await this.db
      .insert(notificationPref)
      .values({ userId, category, enabled })
      .onConflictDoUpdate({ target: [notificationPref.userId, notificationPref.category], set: { enabled } });
  }
}
