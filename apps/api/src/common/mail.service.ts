import { Inject, Injectable, Logger } from '@nestjs/common';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, type AppConfig } from '../config';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Teknik e-postalar (doğrulama, şifre sıfırlama). Bildirim merkezinden ayrıdır.
 * Geliştirmede konsola veya `.mail/` klasörüne yazar; üretim sağlayıcısı (SES/Resend/Postmark) AÇIK karardır.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  /** Testlerin son gönderilen e-postaları okuyabilmesi için. */
  readonly outbox: OutgoingMail[] = [];

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  async send(mail: OutgoingMail): Promise<void> {
    if (this.config.NODE_ENV === 'test') {
      this.outbox.push(mail);
      return;
    }
    if (this.config.MAIL_MODE === 'file') {
      const dir = join(process.cwd(), '.mail');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${Date.now()}-${mail.subject.replace(/\W+/g, '_')}.txt`), `To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}`);
      return;
    }
    this.logger.log(`[geliştirme e-postası] ${mail.subject}\n${mail.text}`);
  }
}
