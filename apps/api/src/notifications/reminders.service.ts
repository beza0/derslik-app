import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { CONFIG, type AppConfig } from '../config';
import { DB, type Db } from '../db/db';
import { formatRange } from '../lessons/recurrence';
import { NotificationsService } from './notifications.service';

const REMINDER_MINUTES = 60;
const INTERVAL_MS = 5 * 60_000;

/**
 * Zamanlanmış uygulama içi hatırlatmalar (push yok). Her 5 dakikada yaklaşan dersleri tarar.
 * `dedupe_key` sayesinde birden fazla API örneği çalışsa da her olay bir kez bildirilir.
 */
@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Reminders');
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    if (this.config.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      this.run().catch((e: Error) => this.logger.error(`Hatırlatma çalıştırılamadı: ${e.message}`));
    }, INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(now = new Date()): Promise<number> {
    let sent = 0;
    const until = new Date(now.getTime() + REMINDER_MINUTES * 60_000);
    const lessons = await this.db.execute<{ id: string; workspace_id: string; starts_at: Date; ends_at: Date; timezone: string; owner: string; teacher: string }>(sql`
      SELECT l.id, l.workspace_id, l.starts_at, l.ends_at, l.timezone, w.owner_user_id AS owner, w.display_name AS teacher
      FROM lesson l JOIN workspace w ON w.id = l.workspace_id
      WHERE l.status = 'scheduled' AND l.starts_at > ${now} AND l.starts_at <= ${until}`);
    for (const l of lessons.rows) {
      const parts = await this.db.execute<{ student_id: string }>(sql`SELECT student_id FROM lesson_participant WHERE lesson_id = ${l.id}`);
      const users = await this.notifications.recipientsForStudents(this.db, parts.rows.map((p) => p.student_id));
      await this.notifications.notify(this.db, [l.owner, ...users], {
        workspaceId: l.workspace_id,
        category: 'reminder',
        type: 'lesson.reminder',
        titleKey: 'notif.lesson.reminder',
        params: { teacher: l.teacher, when: formatRange(new Date(l.starts_at), new Date(l.ends_at), l.timezone) },
        link: `/lessons/${l.id}`,
        dedupeKey: `lesson.reminder:${l.id}:${new Date(l.starts_at).toISOString()}`,
      });
      sent++;
    }
    return sent;
  }
}
