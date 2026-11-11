// Docker olmadan yerel PostgreSQL: npm `embedded-postgres` paketindeki gerçek PostgreSQL binary'sini çalıştırır.
// Yalnızca geliştirme içindir. Veri: ./.pgdata  Bağlantı: postgres://derslik:derslik_dev_only@localhost:5432/derslik
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, '.pgdata');
const port = Number(process.env.PGPORT ?? 5432);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'derslik',
  password: 'derslik_dev_only',
  port,
  persistent: true,
  // Windows'ta Türkçe sistem yerel ayarı ASCII dışı karakter içerdiği için initdb reddediyor.
  initdbFlags: ['--locale=C', '--encoding=UTF8'],
  onLog: () => {},
});

const fresh = !existsSync(join(dataDir, 'PG_VERSION'));
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase('derslik');
console.log(`PostgreSQL hazır: postgres://derslik:derslik_dev_only@localhost:${port}/derslik  (durdurmak için Ctrl+C)`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
