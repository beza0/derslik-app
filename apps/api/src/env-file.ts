import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** `apps/api/.env` dosyası varsa yükler (Node 22 yerleşik `process.loadEnvFile`). Mevcut değişkenleri ezmez. */
export function loadEnvFile(path = join(__dirname, '..', '.env')): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
