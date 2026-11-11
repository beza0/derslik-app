import { loadEnvFile } from '../env-file';
import { createPool } from './db';
import { runMigrations } from './migrator';

async function main() {
  loadEnvFile();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL tanımlı değil (.env dosyasını kontrol edin)');
  const pool = createPool(url);
  try {
    const applied = await runMigrations(pool, undefined, console.log);
    console.log(applied.length ? `${applied.length} migration uygulandı.` : 'Veritabanı güncel.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
