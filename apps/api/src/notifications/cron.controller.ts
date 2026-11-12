import { Controller, Headers, HttpCode, Inject, Post } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { ErrorCode } from '@derslik/shared';
import { Public } from '../common/auth';
import { AppError } from '../common/errors';
import { safeEqual } from '../common/crypto';
import { CONFIG, type AppConfig } from '../config';
import { DB, type Db } from '../db/db';
import { RemindersService } from './reminders.service';

/**
 * Sunucusuz ortamda zamanlayıcı olmadığından hatırlatmalar dışarıdan (Supabase pg_cron + pg_net) tetiklenir.
 * Sır: CRON_SECRET ortam değişkeni; yoksa Supabase Vault'taki `derslik_cron_secret` (veritabanında üretilir,
 * hiçbir insan veya dosya görmez). İşlem idempotenttir.
 */
@Controller('internal/cron')
export class CronController {
  constructor(
    private readonly reminders: RemindersService,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DB) private readonly db: Db,
  ) {}

  private async expectedSecret(): Promise<string | null> {
    if (this.config.CRON_SECRET) return this.config.CRON_SECRET;
    try {
      const r = await this.db.execute<{ s: string }>(sql`SELECT decrypted_secret AS s FROM vault.decrypted_secrets WHERE name = 'derslik_cron_secret' LIMIT 1`);
      return r.rows[0]?.s ?? null;
    } catch {
      return null;
    }
  }

  @Public()
  @Post('reminders')
  @HttpCode(200)
  async run(@Headers('x-cron-secret') secret?: string) {
    const expected = await this.expectedSecret();
    if (!expected || !secret || !safeEqual(secret, expected)) throw new AppError(ErrorCode.FORBIDDEN, 'Yetkisiz');
    return { sent: await this.reminders.run() };
  }
}
