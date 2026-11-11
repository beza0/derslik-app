# Derslik (çalışma adı)

Bağımsız özel ders öğretmenleri için öğrenci, grup, takvim, not, ödev ve AI asistan uygulaması. Web + iOS + Android.

> Durum: erken geliştirme. Ne bittiği ve ne kaldığı için bkz. [docs/05-gorev-listesi.md](docs/05-gorev-listesi.md).

## Dokümanlar
- [Ürün gereksinimleri, rol-yetki matrisi, kabul senaryoları](docs/01-urun-gereksinimleri.md)
- [Karar kaydı, varsayımlar, açık sorular](docs/02-karar-kaydi.md)
- [Veri modeli](docs/03-veri-modeli.md)
- [API sözleşmesi](docs/04-api.md)

## Yapı
```
apps/api        NestJS + Drizzle + PostgreSQL (REST, /api)
apps/web        React + Vite (hazırlanıyor)
apps/mobile     Expo / React Native (hazırlanıyor)
packages/shared Ortak zod şemaları, tipler, hata kodları
```

## Gereksinimler
- Node.js 22 (öneri: 22.22+ — NestJS CLI şablon paketi bunu istiyor; 22.19 ile çalışıyor ama uyarı veriyor)
- PostgreSQL 16+: Docker **veya** Docker olmadan `npm run db:local`

## Kurulum
```bash
npm install
npm run build:shared
cp apps/api/.env.example apps/api/.env   # JWT_SECRET'ı değiştirin
```

Veritabanı (birini seçin):
```bash
docker compose up -d db        # Docker varsa
npm run db:local               # Docker yoksa: gerçek PostgreSQL binary'si, veri ./.pgdata
```

Migration ve demo verisi:
```bash
npm run db:migrate
npm run db:seed
```

API:
```bash
npm run dev:api                # http://localhost:3000/api
```

## Demo hesaplar (yalnızca geliştirme)
Parola: `demo-parola-123`
| E-posta | Rol |
|---|---|
| ogretmen@demo.derslik.test | Öğretmen (3 öğrenci, taslak Pro plan) |
| ogrenci@demo.derslik.test | Öğrenci (Elif Demir kaydına bağlı) |
| veli@demo.derslik.test | Veli (Elif Demir) |
| admin@demo.derslik.test | Sistem yöneticisi |

## Testler
```bash
npm test                       # tüm workspace'ler
npm test -w @derslik/api       # API entegrasyon testleri
```
API testleri gerçek PostgreSQL üzerinde çalışır: `TEST_DATABASE_URL` verilmezse geçici bir embedded PostgreSQL (port 54329) başlatılır.

## AI ve ödeme (test kurulumu)
- `AI_PROVIDER=fake`: deterministik, açıkça etiketli geliştirme sağlayıcısı. Üretimde başlatma reddedilir.
- `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`: gerçek Claude API. Anahtar yalnızca API sunucusunda.
- `PAYMENT_PROVIDER=sandbox`: imzalı webhook ve sunucu doğrulamalı test akışı. Gerçek sağlayıcılar (iyzico, App Store, Google Play) hesap bilgileri gelince.

## Bilinen sınırlamalar
- iOS bu Windows makinesinde derlenemez/simüle edilemez; Expo Go (fiziksel cihaz) veya EAS Build (Apple Developer hesabı) gerekir.
- Teknik e-postalar geliştirmede konsola yazılır; üretim e-posta sağlayıcısı seçilmedi.
- Hukuki metinler (KVKK, gizlilik) taslaktır; hukuki inceleme gerekir.
