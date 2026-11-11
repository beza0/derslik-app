import { createHash, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Kriptografik rastgele base32 dizgi (her karakter 5 bit). */
export function randomBase32(chars: number): string {
  const bytes = randomBytes(chars);
  let out = '';
  for (let i = 0; i < chars; i++) out += B32[bytes[i]! & 31];
  return out;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacSha256(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
