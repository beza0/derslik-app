import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, types } from 'pg';
import * as schema from './schema';

// `date` tipini string olarak bırak (saat dilimi kayması olmasın).
types.setTypeParser(1082, (v) => v);

export type Db = NodePgDatabase<typeof schema>;
/** Transaction içinde ya da dışında kullanılabilen sorgu nesnesi. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0] | Db;

export const DB = Symbol('DB');
export const PG_POOL = Symbol('PG_POOL');

export function createPool(url: string, max = 10): Pool {
  // Bulut PostgreSQL: TLS sertifika doğrulaması açık. Sağlayıcının kök sertifikası sistemde yoksa
  // DATABASE_CA_CERT (PEM) ile verilir. Yerel geliştirmede TLS yok.
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // Ortam değişkeninde tek satır olarak saklanan PEM'deki "\n" dizilerini gerçek satır sonuna çevir.
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');
  return new Pool({ connectionString: url, max, ssl: local ? undefined : ca ? { ca } : true });
}

export function createDb(pool: Pool): Db {
  return drizzle(pool, { schema });
}

/** PostgreSQL hata kodları. */
export const PgError = {
  UNIQUE_VIOLATION: '23505',
  EXCLUSION_VIOLATION: '23P01',
  FOREIGN_KEY_VIOLATION: '23503',
  SERIALIZATION_FAILURE: '40001',
} as const;

export function pgErrorCode(err: unknown): string | undefined {
  let e: unknown = err;
  // Drizzle hataları asıl pg hatasını `cause` içinde taşıyabilir.
  for (let i = 0; i < 3 && e; i++) {
    if (typeof e === 'object' && e !== null && 'code' in e && typeof (e as { code: unknown }).code === 'string') {
      return (e as { code: string }).code;
    }
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

export function pgConstraint(err: unknown): string | undefined {
  let e: unknown = err;
  for (let i = 0; i < 3 && e; i++) {
    if (typeof e === 'object' && e !== null && 'constraint' in e) {
      return (e as { constraint?: string }).constraint;
    }
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}
