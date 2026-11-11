import { loadEnvFile } from './env-file';
import { loadConfig } from './config';
import { createPool } from './db/db';
import { createApp } from './bootstrap';

async function main() {
  loadEnvFile();
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL);
  const app = await createApp(config, pool);
  await app.listen(config.PORT);
  console.log(`API: http://localhost:${config.PORT}/api  (AI: ${config.AI_PROVIDER}, ödeme: ${config.PAYMENT_PROVIDER})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
