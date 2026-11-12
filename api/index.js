// Vercel sunucusuz fonksiyonu: tüm /api/* istekleri derlenmiş NestJS uygulamasına gider.
module.exports = require('../apps/api/dist/serverless.js').default;
