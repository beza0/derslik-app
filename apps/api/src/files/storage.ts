import { mkdirSync, existsSync, statSync, openSync, readSync, closeSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Pool } from 'pg';
import type { AppConfig } from '../config';
import { hmacSha256, safeEqual } from '../common/crypto';

/**
 * Özel erişimli nesne depolama. İstemci dosyayı doğrudan depolamaya yükler (sunucusuz ortamda gövde
 * limiti nedeniyle API'den geçmez); indirme her zaman yetki kontrolünden sonra kısa ömürlü imzalı URL ile.
 */
export interface StorageDriver {
  createUploadUrl(key: string, mime: string): Promise<{ url: string; method: 'PUT' | 'POST'; headers: Record<string, string> }>;
  /** Nesnenin boyutu ve ilk baytları; yoksa null. */
  probe(key: string, bytes: number): Promise<{ size: number; head: Buffer } | null>;
  signedDownloadUrl(key: string, ttlSeconds: number, filename: string): Promise<string>;
  remove(key: string): Promise<void>;
  /** Tüm içerik (AI belge okuma için; boyut yüklemede sınırlandı). */
  read(key: string): Promise<Buffer>;
}

/** Geliştirme sürücüsü: diske yazar; yükleme/indirme API'deki imzalı uçlarla. */
export class LocalStorage implements StorageDriver {
  private readonly root: string;
  constructor(protected readonly config: AppConfig) {
    this.root = resolve(config.STORAGE_DIR);
  }

  private token(action: 'up' | 'down', key: string, ttlSeconds: number, extra = ''): string {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = `${action}|${key}|${exp}|${extra}`;
    return Buffer.from(`${payload}|${hmacSha256(this.config.JWT_SECRET, payload)}`).toString('base64url');
  }

  verify(token: string, action: 'up' | 'down'): { key: string; extra: string } | null {
    let raw: string;
    try {
      raw = Buffer.from(token, 'base64url').toString();
    } catch {
      return null;
    }
    const parts = raw.split('|');
    if (parts.length !== 5) return null;
    const [a, key, exp, extra, sig] = parts as [string, string, string, string, string];
    const payload = `${a}|${key}|${exp}|${extra}`;
    if (a !== action || !safeEqual(sig, hmacSha256(this.config.JWT_SECRET, payload))) return null;
    if (Number(exp) < Date.now() / 1000) return null;
    if (key.includes('..')) return null;
    return { key, extra };
  }

  path(key: string): string {
    const p = resolve(join(this.root, key));
    if (!p.startsWith(this.root)) throw new Error('invalid key');
    return p;
  }

  async createUploadUrl(key: string) {
    return {
      url: `${this.config.API_PUBLIC_URL}/api/files/local/${this.token('up', key, 15 * 60)}`,
      method: 'PUT' as const,
      headers: {},
    };
  }

  write(key: string): string {
    const p = this.path(key);
    mkdirSync(dirname(p), { recursive: true });
    return p;
  }

  async probe(key: string, bytes: number): Promise<{ size: number; head: Buffer } | null> {
    const p = this.path(key);
    if (!existsSync(p)) return null;
    const size = statSync(p).size;
    const fd = openSync(p, 'r');
    const head = Buffer.alloc(Math.min(bytes, size));
    readSync(fd, head, 0, head.length, 0);
    closeSync(fd);
    return { size, head };
  }

  async signedDownloadUrl(key: string, ttlSeconds: number, filename: string) {
    return `${this.config.API_PUBLIC_URL}/api/files/local/${this.token('down', key, ttlSeconds, encodeURIComponent(filename))}`;
  }

  async remove(key: string) {
    rmSync(this.path(key), { force: true });
  }

  async read(key: string): Promise<Buffer> {
    return readFileSync(this.path(key));
  }

  async put(key: string, data: Buffer) {
    writeFileSync(this.write(key), data);
  }
}

/** Supabase Storage (özel bucket) — REST API, servis anahtarı yalnızca sunucuda. */
export class SupabaseStorage implements StorageDriver {
  private readonly base: string;
  private readonly bucket: string;
  private readonly key: string;
  constructor(config: AppConfig) {
    this.base = `${config.SUPABASE_URL!.replace(/\/$/, '')}/storage/v1`;
    this.bucket = config.STORAGE_BUCKET;
    this.key = config.SUPABASE_SERVICE_ROLE_KEY!;
  }

  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.key}`, apikey: this.key, ...extra };
  }

  private obj(key: string) {
    return `${this.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  async createUploadUrl(key: string, mime: string) {
    const res = await fetch(`${this.base}/object/upload/sign/${this.obj(key)}`, { method: 'POST', headers: this.headers() });
    if (!res.ok) throw new Error(`storage sign upload ${res.status}`);
    const body = (await res.json()) as { url: string };
    return { url: `${this.base}${body.url}`, method: 'PUT' as const, headers: { 'Content-Type': mime } };
  }

  async probe(key: string, bytes: number): Promise<{ size: number; head: Buffer } | null> {
    const res = await fetch(`${this.base}/object/authenticated/${this.obj(key)}`, {
      headers: this.headers({ Range: `bytes=0-${bytes - 1}` }),
    });
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok && res.status !== 206) throw new Error(`storage probe ${res.status}`);
    const range = res.headers.get('content-range'); // bytes 0-15/12345
    const head = Buffer.from(await res.arrayBuffer());
    const size = range ? Number(range.split('/')[1]) : Number(res.headers.get('content-length') ?? head.length);
    return { size, head: head.subarray(0, bytes) };
  }

  async signedDownloadUrl(key: string, ttlSeconds: number, filename: string) {
    const res = await fetch(`${this.base}/object/sign/${this.obj(key)}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: ttlSeconds }),
    });
    if (!res.ok) throw new Error(`storage sign download ${res.status}`);
    const body = (await res.json()) as { signedURL: string };
    return `${this.base}${body.signedURL}&download=${encodeURIComponent(filename)}`;
  }

  async read(key: string): Promise<Buffer> {
    const res = await fetch(`${this.base}/object/authenticated/${this.obj(key)}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`storage read ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async remove(key: string) {
    await fetch(`${this.base}/object/${this.obj(key)}`, { method: 'DELETE', headers: this.headers() });
  }
}

/**
 * Sunucusuz ortam için: içerik PostgreSQL'de (bytea). Yükleme/indirme API'deki imzalı uçlardan geçer;
 * bu nedenle tek dosya, barındırıcının istek gövdesi sınırıyla (Vercel ~4,5 MB) sınırlıdır.
 */
export class DbStorage extends LocalStorage {
  constructor(config: AppConfig, private readonly pool: Pool) {
    super(config);
  }
  override async put(key: string, data: Buffer) {
    await this.pool.query('INSERT INTO file_blob (storage_key, data) VALUES ($1, $2) ON CONFLICT (storage_key) DO UPDATE SET data = EXCLUDED.data', [key, data]);
  }
  override async probe(key: string, bytes: number) {
    const r = await this.pool.query<{ size: number; head: Buffer }>('SELECT octet_length(data) AS size, substring(data from 1 for $2) AS head FROM file_blob WHERE storage_key = $1', [key, bytes]);
    const row = r.rows[0];
    return row ? { size: Number(row.size), head: row.head } : null;
  }
  override async read(key: string) {
    const r = await this.pool.query<{ data: Buffer }>('SELECT data FROM file_blob WHERE storage_key = $1', [key]);
    if (!r.rows[0]) throw new Error('not found');
    return r.rows[0].data;
  }
  override async remove(key: string) {
    await this.pool.query('DELETE FROM file_blob WHERE storage_key = $1', [key]);
  }
}

export const STORAGE = Symbol('STORAGE');

export function createStorage(config: AppConfig, pool: Pool): StorageDriver {
  if (config.STORAGE_DRIVER === 'supabase') return new SupabaseStorage(config);
  if (config.STORAGE_DRIVER === 'db') return new DbStorage(config, pool);
  return new LocalStorage(config);
}

/** İçerik imzası: uzantıya/istemcinin söylediği türe güvenilmez. */
export function sniffMime(head: Buffer): string | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (head.length >= 12 && head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (head.length >= 5 && head.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (head.length >= 12 && head.subarray(4, 8).toString() === 'ftyp' && /^(heic|heix|mif1|msf1|heis|hevc)$/.test(head.subarray(8, 12).toString())) return 'image/heic';
  return null;
}
