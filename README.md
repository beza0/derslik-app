# Derslik (çalışma adı)

Bağımsız özel ders öğretmenleri için öğrenci, grup, takvim, not, ödev ve AI asistan uygulaması. Web + iOS + Android.

> Durum: çalışan ilk sürüm (API + web + Android). Ödeme test modunda; AI, API anahtarı girilene kadar kapalı. Ne bittiği ve ne kaldığı: [docs/05-gorev-listesi.md](docs/05-gorev-listesi.md).

## Dokümanlar
- [Ürün gereksinimleri, rol-yetki matrisi, kabul senaryoları](docs/01-urun-gereksinimleri.md)
- [Karar kaydı, varsayımlar, açık sorular](docs/02-karar-kaydi.md)
- [Veri modeli](docs/03-veri-modeli.md)
- [API sözleşmesi](docs/04-api.md)

## Yapı
```
apps/api        NestJS + Drizzle + PostgreSQL (REST, /api)
apps/web        React + Vite (öğretmen, öğrenci/veli, yönetim; telefona eklenebilir PWA)
apps/mobile     Expo SDK 58 / React Native (öğretmen, öğrenci/veli)
packages/shared Ortak zod şemaları, tipler, hata kodları, API istemcisi, Türkçe metinler
api/index.js    Vercel sunucusuz giriş noktası
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

## Web uygulaması (yerel)
```bash
npm run dev:api
```
```bash
npm run dev:web
```
Web: http://localhost:5173 (API isteklerini localhost:3000'e yönlendirir).

## Mobil uygulama
Geliştirme (bilgisayarın yerel ağ adresiyle; sesli komut için geliştirme derlemesi gerekir):
```bash
cd apps/mobile && npx expo start
```
Android APK:
```bash
cd apps/mobile && npx expo prebuild --platform android --clean && cd android && ./gradlew assembleRelease
```
Çıktı: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`. Windows'ta `JAVA_HOME` olarak Android Studio'nun `jbr` klasörü kullanılabilir. Yayın adresi `app.json > extra.apiUrl` (geliştirmede `EXPO_PUBLIC_API_URL`).
Not: Bu APK Expo şablonunun hata ayıklama imzasıyla imzalanır; Google Play'e yüklemek için ayrı yükleme anahtarı oluşturulmalıdır.

## Canlıya alma (Vercel + Supabase, ücretsiz katmanlar)
- Tek Vercel projesi: web (statik) + `/api/*` sunucusuz fonksiyon (`vercel.json`).
- Veritabanı: Supabase PostgreSQL. Tüm tablolarda RLS açık; Supabase Data API'den erişim kapalı (migration 0005).
- Sırlar `apps/api/.env.production.local` dosyasında (repoya girmez). `DATABASE_URL` = Supabase *Transaction pooler* adresi.
```bash
npm run db:migrate:prod -w @derslik/api
```
```bash
npm run db:seed-plans:prod -w @derslik/api
```
```bash
node scripts/vercel-env.mjs
```
```bash
npx vercel deploy --prod
```
- Hatırlatmalar: Supabase pg_cron + pg_net 5 dakikada bir `/api/internal/cron/reminders` çağırır (sır Supabase Vault'ta üretilir).
- Dosyalar sunucusuz kurulumda veritabanında tutulur (tek dosya en fazla ~4 MB). 15 MB için `STORAGE_DRIVER=supabase` + servis anahtarı.

## Bilinen sınırlamalar
- iOS bu Windows makinesinde derlenemez/simüle edilemez; App Store için yıllık ücretli Apple Developer hesabı gerekir. Ücretsiz seçenek: web uygulamasını iPhone Safari'de "Ana Ekrana Ekle".
- Ödeme yalnızca test (sandbox) modunda; iyzico / App Store / Google Play bağlantıları hesap bilgileri gelince.
- AI asistan canlıda `ANTHROPIC_API_KEY` girilene kadar kapalıdır; uygulamanın geri kalanı çalışır.
- Hız sınırı sunucusuz örnek başına bellekte tutulur (dağıtık değil).
- Mobilde dosyalı ödev oluşturma, cevap anahtarı ve grup üyelik önizlemesi yok (webde var). Yönetim paneli yalnızca web.
- Veri dışa aktarma (JSON/CSV) henüz yok.
- Teknik e-postalar geliştirmede konsola yazılır; üretim e-posta sağlayıcısı seçilmedi.
- Hukuki metinler (KVKK, gizlilik) taslaktır; hukuki inceleme gerekir.
