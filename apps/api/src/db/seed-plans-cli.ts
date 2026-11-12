import { loadEnvFile } from '../env-file';
import { createDb, createPool } from './db';
import { seedPlans } from './seed-plans';

/** Yalnızca zorunlu paket verisi (canlı ortamda da güvenli; demo hesap oluşturmaz). */
async function main() {
  loadEnvFile();
  const pool = createPool(process.env.DATABASE_URL!);
  try {
    await seedPlans(createDb(pool));
    console.log('Paketler hazır.');
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
