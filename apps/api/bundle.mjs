// Vercel fonksiyonu için API'yi tek CommonJS dosyasında paketler. NestJS 12 yalnızca ESM;
// Vercel'in fonksiyon yükleyicisi ESM paketlerini require() ile açamadığı için bağımlılıklar pakete gömülür.
import { build } from 'esbuild';

await build({
  entryPoints: ['dist/serverless.js'],
  outfile: 'dist/bundle/index.cjs', // ../../certs yolu dist/db ile aynı derinlikte kalır
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  keepNames: true,
  logLevel: 'warning',
  external: [
    '@node-rs/argon2', // yerel (native) modül, CommonJS
    'pg-native',
    // NestJS'in isteğe bağlı paketleri: kurulu değiller, Nest yokluklarını yakalar.
    '@nestjs/microservices',
    '@nestjs/microservices/*',
    '@nestjs/websockets',
    '@nestjs/websockets/*',
    '@nestjs/platform-socket.io',
    '@fastify/*',
    'class-transformer',
    'class-transformer/*',
    'class-validator',
  ],
});
