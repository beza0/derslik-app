// Vercel sunucusuz fonksiyonu: tüm /api/* istekleri paketlenmiş NestJS uygulamasına gider
// (apps/api/bundle.mjs ile üretilir; NestJS 12 ESM olduğu için tek CommonJS dosyasına gömülür).
module.exports = require('../apps/api/dist/bundle/index.cjs').default;
