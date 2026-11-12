import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from './config';
import { createPool } from './db/db';
import { createApp } from './bootstrap';

/**
 * Sunucusuz giriş noktası (Vercel). Uygulama örneği soğuk başlangıçta bir kez kurulur ve sıcak
 * çağrılarda yeniden kullanılır. Veritabanı havuzu küçük tutulur (bağlantı havuzlayıcı arkasında).
 */
type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let ready: Promise<Handler> | null = null;

async function init(): Promise<Handler> {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL, 3);
  const app = await createApp(config, pool);
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= init().catch((err: unknown) => {
    ready = null;
    throw err;
  });
  const h = await ready;
  h(req, res);
}
