// apps/api/.env.production.local içindeki sırları Vercel'e (production) aktarır. Değerler ekrana yazılmaz;
// `vercel env add` komutuna stdin ile verilir. Önce: npx vercel login && npx vercel link
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const file = readFileSync(new URL('../apps/api/.env.production.local', import.meta.url), 'utf8');
const secrets = Object.fromEntries(
  file.split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
delete secrets.DB_APP_PASSWORD;
// Hatırlatma sırrı Supabase Vault'ta (derslik_cron_secret) üretilir; API oradan okur.
delete secrets.CRON_SECRET;
if (!secrets.DATABASE_URL) {
  console.error('DATABASE_URL eksik: Supabase "Transaction pooler" bağlantı adresini dosyaya ekleyin.');
  process.exit(1);
}
const config = {
  NODE_ENV: 'production',
  COOKIE_SECURE: 'true',
  AI_PROVIDER: secrets.ANTHROPIC_API_KEY ? 'anthropic' : 'disabled',
  PAYMENT_PROVIDER: 'sandbox',
  ALLOW_SANDBOX_IN_PRODUCTION: 'true',
  STORAGE_DRIVER: 'db',
  UPLOAD_MAX_BYTES: '4000000',
  MAIL_MODE: 'console',
};
const all = { ...config, ...secrets };
for (const [name, value] of Object.entries(all)) {
  spawnSync('npx', ['vercel', 'env', 'rm', name, 'production', '--yes'], { stdio: 'ignore', shell: true });
  const r = spawnSync('npx', ['vercel', 'env', 'add', name, 'production'], { input: value, stdio: ['pipe', 'ignore', 'inherit'], shell: true });
  console.log(`${name}: ${r.status === 0 ? 'eklendi' : 'HATA'}`);
}
