import { Controller, Headers, HttpCode, Inject, Post } from '@nestjs/common';
import { ErrorCode } from '@derslik/shared';
import { Public } from '../common/auth';
import { AppError } from '../common/errors';
import { safeEqual } from '../common/crypto';
import { CONFIG, type AppConfig } from '../config';
import { RemindersService } from './reminders.service';

/**
 * Sunucusuz ortamda zamanlayıcı olmadığından hatırlatmalar dışarıdan (Supabase pg_cron + pg_net) tetiklenir.
 * Yalnızca `x-cron-secret` doğruysa çalışır; işlem idempotenttir.
 */
@Controller('internal/cron')
export class CronController {
  constructor(
    private readonly reminders: RemindersService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('reminders')
  @HttpCode(200)
  async run(@Headers('x-cron-secret') secret?: string) {
    if (!this.config.CRON_SECRET || !secret || !safeEqual(secret, this.config.CRON_SECRET)) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Yetkisiz');
    }
    return { sent: await this.reminders.run() };
  }
}
