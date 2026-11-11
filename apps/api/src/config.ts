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
    AI_PROVIDER: z.enum(['fake', 'anthropic', 'disabled']).default('fake'),
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_MODEL: z.string().default('claude-sonnet-5-5'),
    PAYMENT_PROVIDER: z.enum(['sandbox']).default('sandbox'),
    PAYMENT_WEBHOOK_SECRET: z.string().min(16).default('dev-only-sandbox-webhook-secret'),
    STORAGE_DIR: z.string().default('.uploads'),
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
      if (env.PAYMENT_PROVIDER === 'sandbox') {
        ctx.addIssue({ code: 'custom', message: 'Üretimde sandbox ödeme sağlayıcısı kullanılamaz', path: ['PAYMENT_PROVIDER'] });
      }
      if (!env.COOKIE_SECURE) {
        ctx.addIssue({ code: 'custom', message: 'Üretimde COOKIE_SECURE=true olmalı', path: ['COOKIE_SECURE'] });
      }
    }
    if (env.AI_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({ code: 'custom', message: 'ANTHROPIC_API_KEY gerekli', path: ['ANTHROPIC_API_KEY'] });
    }
  });

export type AppConfig = z.infer<typeof Env>;

export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Ortam değişkenleri geçersiz:\n${issues}`);
  }
  return parsed.data;
}

export const CONFIG = Symbol('CONFIG');
