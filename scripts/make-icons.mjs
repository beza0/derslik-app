// Bağımlılıksız PNG simge üretici (ana ekran / mağaza simgeleri için). Kullanım: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname } from 'node:path';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };

function icon(size, { rounded = true } = {}) {
  const px = Buffer.alloc(size * (size * 4 + 1));
  const r = rounded ? size * 0.22 : 0;
  const bg = [15, 118, 110], fg = [255, 255, 255], accent = [153, 246, 228];
  for (let y = 0; y < size; y++) {
    px[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      // köşe yuvarlama
      const cx = Math.min(Math.max(x, r), size - r), cy = Math.min(Math.max(y, r), size - r);
      const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      let col = bg, a = inside ? 255 : 0;
      // "D" harfi: sol dikey + yarım halka
      const t = 0.075;
      const left = u > 0.29 && u < 0.29 + t && v > 0.27 && v < 0.73;
      const top = v > 0.27 && v < 0.27 + t && u > 0.29 && u < 0.53;
      const bot = v > 0.73 - t && v < 0.73 && u > 0.29 && u < 0.53;
      const d = Math.hypot(u - 0.53, v - 0.5);
      const arc = u >= 0.53 && d < 0.23 && d > 0.23 - t;
      if (inside && (left || top || bot || arc)) col = fg;
      const line = (yy, len) => v > yy - 0.022 && v < yy + 0.022 && u > 0.41 && u < 0.41 + len;
      if (inside && (line(0.41, 0.12) || line(0.5, 0.17) || line(0.59, 0.1))) col = accent;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(px)), chunk('IEND', Buffer.alloc(0))]);
}

const out = (p, b) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, b); };
out('apps/web/public/icon-192.png', icon(192));
out('apps/web/public/icon-512.png', icon(512));
out('apps/mobile/assets/icon.png', icon(1024, { rounded: false }));
out('apps/mobile/assets/adaptive-icon.png', icon(1024, { rounded: false }));
out('apps/mobile/assets/splash-icon.png', icon(512));
console.log('simgeler üretildi');
