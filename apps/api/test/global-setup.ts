import EmbeddedPostgres from 'embedded-postgres';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';
import { createDb, createPool } from '../src/db/db';
import { runMigrations } from '../src/db/migrator';
import { seedPlans } from '../src/db/seed-plans';

/**
 * Testler gerçek PostgreSQL üzerinde çalışır (exclusion constraint, satır kilitleri, eşzamanlılık).
 * TEST_DATABASE_URL verilirse o kullanılır (CI'da Docker servisi); yoksa geçici embedded PostgreSQL başlatılır.
 */
export default async function setup(project: TestProject) {
  let url = process.env.TEST_DATABASE_URL;
  let pg: EmbeddedPostgres | undefined;
  if (!url) {
    const port = 54329;
    const dir = join(__dirname, '..', '..', '..', '.pgdata-test');
    rmSync(dir, { recursive: true, force: true });
    pg = new EmbeddedPostgres({
      databaseDir: dir,
      user: 'test',
      password: 'test',
      port,
      persistent: false,
      initdbFlags: ['--locale=C', '--encoding=UTF8'],
      onLog: () => {},
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('derslik_test');
    url = `postgres://test:test@localhost:${port}/derslik_test`;
  }
  const pool = createPool(url);
  await runMigrations(pool);
  await seedPlans(createDb(pool));
  await pool.end();
  project.provide('databaseUrl', url);

  return async () => {
    await pg?.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
