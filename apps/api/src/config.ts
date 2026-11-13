import { z } from 'zod';

const Env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(3000),
    DATABASE_URL: z.string().min(1),
    /** En az 32 karakter rastgele değer. */
    JWT_SECRET: z.string().min(32),
    /** Web uygulamasının adresi (davet bağlantıları, e-posta linkleri, CORS). */
    APP_URL: z.url().default('http://localhost:5173'),
    CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:8081'),
    AI_PROVIDER: z.enum(['fake', 'anthropic', 'rules', 'disabled']).default('fake'),
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_MODEL: z.string().default('claude-opus-5-5'),
    PAYMENT_PROVIDER: z.enum(['sandbox', 'disabled']).default('sandbox'),
    /** Canlı demo ortamında sandbox'a açıkça izin verir (arayüzde "TEST MODU" gösterilir). */
    ALLOW_SANDBOX_IN_PRODUCTION: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    PAYMENT_WEBHOOK_SECRET: z.string().min(16).default('dev-only-sandbox-webhook-secret'),
    STORAGE_DIR: z.string().default('.uploads'),
    STORAGE_DRIVER: z.enum(['local', 'supabase', 'db']).default('local'),
    /** Tek dosya üst sınırı; sunucusuz barındırmada istek gövdesi sınırına göre düşürülür. */
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().max(15 * 1024 * 1024).default(15 * 1024 * 1024),
    STORAGE_BUCKET: z.string().default('derslik-private'),
    SUPABASE_URL: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    /** API'nin dışarıdan erişilen adresi (yerel dosya bağlantıları için). */
    API_PUBLIC_URL: z.string().default('http://localhost:3000'),
    /** Zamanlanmış işleri (hatırlatmalar) tetikleyen dış çağrının sırrı. */
    CRON_SECRET: z.string().min(16).optional(),
    MAIL_MODE: z.enum(['console', 'file']).default('console'),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.AI_PROVIDER === 'fake') {
        ctx.addIssue({ code: 'custom', message: 'Üretimde AI_PROVIDER=fake kullanılamaz', path: ['AI_PROVIDER'] });
      }
      if (env.PAYMENT_PROVIDER === 'sandbox' && !env.ALLOW_SANDBOX_IN_PRODUCTION) {
        ctx.addIssue({ code: 'custom', message: 'Üretimde sandbox ödeme sağlayıcısı kullanılamaz', path: ['PAYMENT_PROVIDER'] });
      }
      if (!env.COOKIE_SECURE) {
        ctx.addIssue({ code: 'custom', message: 'Üretimde COOKIE_SECURE=true olmalı', path: ['COOKIE_SECURE'] });
      }
    }
    if (env.STORAGE_DRIVER === 'supabase' && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
      ctx.addIssue({ code: 'custom', message: 'Supabase depolama için SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli', path: ['STORAGE_DRIVER'] });
    }
    if (env.AI_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({ code: 'custom', message: 'ANTHROPIC_API_KEY gerekli', path: ['ANTHROPIC_API_KEY'] });
    }
  });

export type AppConfig = z.infer<typeof Env>;

export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  // Vercel'de alan adı otomatik gelir: ayrıca girilmemişse uygulama/API adresi ve CORS buradan türetilir.
  const host = source.VERCEL_PROJECT_PRODUCTION_URL;
  if (host) {
    const origin = `https://${host}`;
    source = { APP_URL: origin, API_PUBLIC_URL: origin, CORS_ORIGINS: origin, ...source };
  }
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Ortam değişkenleri geçersiz:\n${issues}`);
  }
  return parsed.data;
}

export const CONFIG = Symbol('CONFIG');
