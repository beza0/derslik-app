# Görev Listesi

Güncelleme: 2026-11-12. ✅ bitti · 🔄 devam · ⬜ bekliyor · ⛔ dış engel

## Faz A — Analiz
- ✅ Ürün gereksinimleri, rol-yetki matrisi, iş kuralları, kabul senaryoları (`01`)
- ✅ Karar kaydı, varsayımlar, açık sorular (`02`)
- ✅ Ortam incelemesi
- ⛔ Figma: `/mcp` yetkilendirmesi bekleniyor (tasarım çalışan arayüzde yürütüldü)

## Faz B — Mimari
- ✅ Monorepo (npm workspaces), ortak şema + API istemcisi + i18n paketi
- ✅ Veri modeli + migration'lar (`03`, `apps/api/migrations/0001–0005`)
- ✅ API sözleşmesi (`04`)
- ✅ Tasarım sistemi (CSS token'ları, açık/koyu tema; mobilde aynı palet)

## Faz C — Geliştirme
- ✅ Kimlik, oturum, e-posta doğrulama, parola sıfırlama
- ✅ Çalışma alanı ayrımı, aktif öğrenci limiti (satır kilidi)
- ✅ Öğrenci, davet, grup, takvim/seri, talepler, bildirimler, hatırlatmalar
- ✅ Notlar, değerlendirmeler, görünürlük; öğrenci/veli portalı
- ✅ Ödev, cevap anahtarı, teslim sürümleri, geri bildirim; dosya depolama (yerel / veritabanı / Supabase)
- ✅ AI asistan: araçlar, önizleme/onay, kota, Anthropic + etiketli test sağlayıcısı, belge okuma, ses (istemci)
- ✅ Abonelik: sandbox sağlayıcı, imzalı webhook, sürümlü paketler, limit üstü durum
- ✅ Yönetim paneli + destek erişimi
- ✅ Web uygulaması (öğretmen, öğrenci, veli, yönetim) — tarayıcıda doğrulandı
- ✅ Mobil uygulama (Expo; öğretmen, öğrenci, veli) — tip denetimi geçti
- ⬜ Veri dışa aktarma (JSON/CSV)
- ⬜ Mobilde dosyalı ödev oluşturma, grup üyelik önizlemesi
- ⛔ Gerçek ödeme sağlayıcıları (iyzico, App Store, Google Play) — hesaplar bekleniyor
- ⛔ Üretim e-posta sağlayıcısı — hesap bekleniyor

## Faz D — Doğrulama
- ✅ API: 84 entegrasyon/birim testi, gerçek PostgreSQL (AS-1…AS-14)
- ✅ Web: tarayıcıda giriş, takvim, ders ekleme, AI önizleme/onay, öğrenci portalı, telefon görünümü
- ✅ Android APK derlemesi (EAS, preview profili)
- ⬜ Android emülatörde uçtan uca deneme
- ⛔ iOS: Windows'ta derlenemez (Apple hesabı ve macOS/EAS gerekir)

## Faz E — GitHub ve kurulum
- ✅ GitHub: https://github.com/beza0/derslik-app
- ✅ Supabase projesi (derslik, Frankfurt) oluşturuldu
- ✅ Vercel projesi (derslik) oluşturuldu
- ✅ Ürün adı: Dersio (kod içi paket adları `@derslik/*` olarak kaldı)
- ✅ Canlı: https://dersio-app.vercel.app (Vercel, Frankfurt) + Supabase PostgreSQL; migration'lar ve paketler yüklendi
- ✅ Hatırlatma cron'u (Supabase pg_cron + Vault sırrı) çalışıyor
- ✅ Expo projesi: @beyzaacar/dersio
- ✅ Ücretsiz kural tabanlı asistan canlıda (`AI_PROVIDER=rules`); 6 yeni test (84 test)
