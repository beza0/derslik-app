# Karar Kaydı, Varsayımlar ve Açık Sorular

> Durum etiketleri: **KESİN** (gereksinim dokümanında kesin), **ONAYLI** (kullanıcı onayladı), **VARSAYIM** (makul karar; kullanıcı değiştirebilir), **AÇIK** (kullanıcı kararı bekleniyor).

## Ürün kararları

| # | Karar | Durum | Gerekçe / not |
|---|---|---|---|
| P1 | Çalışma adı **Derslik**. Ad tek yerden değiştirilir (`packages/shared/src/brand.ts`). | ONAYLI (çalışma adı) | Nihai ad ve marka tescil kontrolü açık. Öneriler: Derslik, Defterim, Dersio, Rehber Defter, Notik. |
| P2 | İlk dil Türkçe; tüm metinler i18n anahtarlarıyla. | ONAYLI | |
| P3 | Veli ödevi öğrenci adına **teslim edemez**. | ONAYLI | Teslimin öğrencinin kendi işi olduğunu korur. |
| P4 | Veli iptal/erteleme talebi yalnızca öğretmen o veli bağlantısı için `canRequestChanges` izni verirse oluşturabilir. Varsayılan kapalı. | ONAYLI | |
| P5 | Öğrencinin başka öğretmenle çakışması **engellemez, uyarır**. Uyarı yalnızca "bu saatte başka bir dersi var" bilgisini verir; öğretmen, konu, yer gösterilmez. | ONAYLI | Öğretmenler arası veri izolasyonu. Uyarı yalnızca öğrenci hesabı bağlıysa hesaplanabilir. |
| P6 | Yeni serbest gözlem notu varsayılanı: **öğretmene özel**. | KESİN | |
| P7 | Grup üyeliği değişince: geçmiş katılım değişmez; gelecek ders/ödevlere ekleme/çıkarma, öğretmenin açık seçimiyle (önizleme + onay). | KESİN (önerilen başlangıç kabul edildi) | |
| P8 | Arşivli öğrenci: geçmiş görüntülenir, yeni ders/ödev/not **oluşturulamaz**; önce arşivden çıkarmak gerekir (limit kontrolüne tabi). | VARSAYIM | Ücretsiz planın arşiv üzerinden dolanılmasını engeller. |
| P9 | Limit üstü durumda (plan düşürme/süre sonu): mevcut tüm veriler görüntülenir, arşivleme serbest; yeni öğrenci ekleme ve arşivden çıkarma engelli; **aktif öğrencilere yeni ders/ödev eklenmesi engellenmez** ancak üstte kalıcı uyarı gösterilir ve 14 gün sonra yeni kayıt oluşturma yalnızca ilk N (plan limiti) aktif öğrenci için açık kalır. | VARSAYIM | Öğretmenin günlük işini aniden kesmemek ve ücretsiz planın dolanılmasını engellemek arasında denge. |
| P10 | Davet geçerlilik süresi varsayılan 7 gün; yenilenebilir; tek kullanımlık. | VARSAYIM | |
| P11 | Ders hatırlatması varsayılan 60 dk önce, kullanıcı kapatabilir. | VARSAYIM | Yalnızca uygulama içi bildirim. |
| P12 | Kalıcı öğrenci silme: öğrenci kaydı ve ona ait not, değerlendirme, ödev alıcı kaydı, teslim ve dosyalar silinir. Grup dersinde katılımcı kaydı silinir, ders kalır. 1:1 dersler silinir. Hesap bağlantıları kopar; öğrenci hesabı silinmez. | VARSAYIM | Açık onay ve öğrenci adını yazarak doğrulama ister. |
| P14 | "Bu ve sonraki" seri düzenlemesi: tekil düzenlenmiş, yapılmış ve iptal edilmiş dersler korunur. Adetle sınırlı seride korunan dersler kalan oturum hakkından düşer (seri toplamı değişmez); tarihle sınırlı seride bitiş tarihi geçerlidir. Değiştirilen dersler silinip yeniden üretilir; bunlara bağlı bekleyen talepler kapanır. | VARSAYIM | Öngörülebilir toplam ders sayısı. |
| P15 | Seri düzenlemesinde tarih değil haftanın günleri değişir; tek dersin tarihi "yalnızca bu" ile değişir. | VARSAYIM | |
| P16 | İşlenen konu ve sonraki ders planı öğretmene özeldir; öğrenciyle paylaşım not/değerlendirme görünürlüğüyle yapılır. | VARSAYIM | Varsayılan güvenli. |
| P13 | Aynı kişinin birden fazla rolü: `user` tek, rol yetkileri bağlantılardan türetilir (`teacher_workspace` sahibi → öğretmen; `student_link` → öğrenci; `guardian_link` → veli; `is_admin` bayrağı → yönetici). İstemci "aktif bağlam" seçer. İlk sürüm UI'ı tek bağlamla açılır. | VARSAYIM | Genişletilebilir, karmaşık değil. |

## Abonelik ve ödeme

| # | Karar | Durum |
|---|---|---|
| S1 | Web: iyzico (Türkiye'de Stripe satıcı hesabı desteklenmiyor). Mobil: App Store / Google Play uygulama içi abonelik. Hak yönetimi tek hesapta, sunucuda (`entitlement`). | ONAYLI (öneri), resmi kaynak doğrulaması ve hesaplar AÇIK |
| S2 | Ödeme sağlayıcıları bir `PaymentProvider` arayüzü arkasında. İlk uygulanan: `sandbox` sağlayıcısı (imzalı webhook, idempotent olay işleme, sunucu doğrulaması aynı kodla test edilir). iyzico/RevenueCat adaptörleri hesap bilgileri gelince. | VARSAYIM |
| S3 | Paket fiyatları yönetim panelinde. Seed'de fiyat **yok** (fiyat alanı boş/"belirlenmedi"); yalnızca ücretsiz plan (1 aktif öğrenci, aylık 30 AI işlemi) ve örnek "Pro (taslak)" planı (limitler örnek, satışa kapalı). | VARSAYIM |
| S4 | Plan değişikliği yeni sürüm (`plan_version`) olarak tutulur; mevcut aboneler satın aldıkları sürümde kalır, yönetici açıkça "mevcut abonelere uygula" seçerse yenilemede geçer. | VARSAYIM |
| S5 | Mobil uygulamada web ödeme sayfasına yönlendiren bağlantı **yok**. Mobilde satın alma mağaza üzerinden; web'de alınan abonelik mobilde de geçerli. | VARSAYIM (mağaza kuralları doğrulanacak) |

## AI

| # | Karar | Durum |
|---|---|---|
| A1 | Sağlayıcı: Anthropic Claude API (`claude-sonnet-5-5` varsayılan; yapılandırılabilir). Anahtar yalnızca sunucuda. | ONAYLI |
| A2 | Geliştirme/test için `AI_PROVIDER=fake` — deterministik, açıkça etiketli. Üretimde `fake` ayarı başlatmayı engeller. | KESİN |
| A3 | Ses: cihazın kendi konuşma tanıma servisi (mobil: iOS/Android yerel, web: Web Speech API destekleyen tarayıcılar). Metin gönderimden önce düzenlenebilir. Desteklenmeyen tarayıcıda yalnızca yazılı giriş. | ONAYLI |
| A4 | AI yalnızca tanımlı araçları (tool) çağırır. Okuma araçları doğrudan; yazma araçları `ai_action` kaydı oluşturur (önizleme) → kullanıcı onayı → sunucu yeniden doğrular → uygular. | KESİN |

## Teknik kararlar

| # | Karar | Gerekçe |
|---|---|---|
| T1 | Monorepo: npm workspaces. `apps/api`, `apps/web`, `apps/mobile`, `packages/shared`. | Ek araç kurulumu gerekmiyor (pnpm yok). Expo npm workspaces'ı destekliyor. |
| T2 | API: NestJS 12 + Express. TypeScript **~6.0** (NestJS CLI'nin desteklediği sürüm; TS 7 native derleyici dekoratör metadata akışında risk). | Uyumluluk. |
| T3 | ORM: Drizzle ORM 0.45 + `pg`. Kritik kısıtlar (exclusion constraint, kısmi unique index) SQL migration ile. | SQL'e yakın, şeffaf; kilit ve kısıtlar açık yönetilir. |
| T4 | Veritabanı: PostgreSQL 16+ (`btree_gist` uzantısı). Yerelde iki yol: `docker compose up db` veya Docker yoksa `npm run db:local` (npm `embedded-postgres` gerçek PostgreSQL binary'si). Testler de embedded PostgreSQL kullanır. | Docker bu makinede kurulu değil; eşzamanlılık testleri gerçek PostgreSQL ister. |
| T5 | Çakışma engeli: `lesson` tablosunda `EXCLUDE USING gist (workspace_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status <> 'cancelled')`. Arka arkaya dersler çakışmaz (`[)`). | Yarış koşullarında bile veritabanı garantisi. |
| T6 | Aktif öğrenci limiti: workspace satırına `SELECT … FOR UPDATE` kilidi + sayım aynı transaction'da. | Eşzamanlı eklemeler limiti aşamaz. |
| T7 | Tekrarlayan dersler: `lesson_series` kuralı (haftalık, gün listesi, yerel saat, saat dilimi, bitiş tarihi/adet) + her oturum için somut `lesson` satırı. Yerel saat + IANA saat dilimiyle üretilir; yaz/kış saati geçişinde yerel saat korunur. | Takvim sorguları basit aralık sorgusu; düzenleme "yalnızca bu / bu ve sonraki". |
| T8 | Kimlik doğrulama: kısa ömürlü JWT access token (15 dk) + döndürülen opak refresh token (DB'de hash'li). Web: refresh token `HttpOnly; Secure; SameSite=Lax` çerezde, access token bellekte; mobil: `expo-secure-store`. Parola: argon2id. | |
| T9 | Davet kodu: 128 bit rastgele (base32, okunur gruplar), DB'de SHA-256 hash'i tutulur. | Tahmin edilemez; sızan DB'den kullanılamaz. |
| T10 | İdempotency: yazma uçları `Idempotency-Key` başlığını kabul eder; AI onayı `ai_action.id` + durum geçişiyle tek kez uygulanır. | Çift tıklama, ağ tekrarı. |
| T11 | Dosyalar: S3 uyumlu özel depolama arayüzü; yerelde disk sürücüsü. İndirme yalnızca yetki kontrollü API üzerinden kısa ömürlü imzalı URL ile. | Cevap anahtarı / özel dosya sızmaz. |
| T12 | Arka plan işleri: ilk sürümde PostgreSQL tabanlı basit iş tablosu + `@nestjs/schedule` aralıklı çalıştırıcı (hatırlatma, son tarih bildirimi). Ek altyapı (Redis vb.) yok. | Somut ihtiyaç yok. |
| T13 | Web: React 19 + Vite + React Router + TanStack Query. Mobil: Expo SDK 58 + Expo Router. Ortak: zod şemaları, tipler, API istemcisi. UI bileşenleri ortaklaştırılmaz. | |
| T14 | iOS bu Windows makinesinde derlenemez/simüle edilemez. Doğrulama: Android emülatörü; iOS için Expo Go (fiziksel cihaz) veya EAS Build (Apple Developer hesabı gerekir). | Dürüst raporlama. |

## Açık sorular (kullanıcı kararı bekleniyor)

1. Nihai ürün adı ve görsel kimlik.
2. iyzico üye işyeri hesabı, Apple Developer ve Google Play Console hesapları; paket fiyatları.
3. Anthropic API anahtarı (yalnızca `.env`'de, repoya girmez).
4. GitHub: bağlantı yeniden yetkilendirilecek veya `gh auth login`. Önerilen repo: `derslik-app` (özel).
5. Figma: `/mcp` ile yetkilendirme.
6. Teknik e-posta servisi (doğrulama/şifre sıfırlama): geliştirmede e-postalar konsola/dosyaya yazılıyor; üretim için sağlayıcı seçimi (ör. Amazon SES, Resend, Postmark).
7. KVKK aydınlatma metni ve gizlilik politikası: hukuki inceleme gerekir; uygulamadaki metinler taslaktır.
