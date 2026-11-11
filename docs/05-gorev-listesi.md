# Görev Listesi

Güncelleme: 2026-11-13. ✅ bitti · 🔄 devam · ⬜ bekliyor · ⛔ dış engel

## Faz A — Analiz
- ✅ Ürün gereksinimleri, rol-yetki matrisi, iş kuralları, kabul senaryoları (`01`)
- ✅ Karar kaydı, varsayımlar, açık sorular (`02`)
- ✅ Ortam incelemesi (Node 22.19, git; Docker/gh yok; Android SDK + emülatör var; iOS yerelde yok)
- ⛔ Figma: `/mcp` yetkilendirmesi bekleniyor
- ✅ GitHub bağlandı (Git Credential Manager)

## Faz B — Mimari
- ✅ Monorepo (npm workspaces), ortak şema paketi
- ✅ Veri modeli + migration (`03`, `apps/api/migrations/0001_init.sql`)
- ✅ API sözleşmesi taslağı (`04`)
- ⬜ Bilgi mimarisi ve ekran akışları, tasarım sistemi (token'lar) — web iskeletiyle birlikte

## Faz C — Geliştirme
- ✅ Kimlik: kayıt, giriş, refresh rotation + çalıntı token tespiti, çıkış, e-posta doğrulama, parola sıfırlama
- ✅ Çalışma alanı ayrımı (AccessService), aktif öğrenci limiti (satır kilidi)
- ✅ Öğrenci CRUD, arşiv, kalıcı silme, toplu ekleme
- ✅ Davet: öğrenci/veli, yenileme, iptal, önizleme, idempotent kabul, bağlantı düzeltme, grup toplu davet
- ✅ Gruplar + üyelik değişikliği önizlemesi (gelecek ders/açık ödev seçimli)
- ✅ Takvim: tekil/haftalık seri, "yalnızca bu / bu ve sonraki", çakışma (DB kısıtı), saat dilimi + yaz saati testleri
- ✅ Ders tamamlama, yoklama, iptal/erteleme talepleri; öğrenci/veli takvim portalı
- ✅ Notlar, değerlendirmeler, görünürlük; öğrenci/veli portal API'si
- ✅ Ödevler, cevap anahtarı, teslim sürümleri, geri bildirim; dosya depolama (yerel + Supabase)
- 🔄 Bildirim merkezi + ders hatırlatmaları ✅ (ödev olayları ödev modülüyle)
- 🔄 AI araçları (SDK kuruldu, model claude-opus-5-5; modül yazılacak), önizleme/onay, kota, fake + Anthropic sağlayıcı, belge okuma, ses (istemci)
- ✅ Abonelik: sandbox sağlayıcı, imzalı webhook, plan sürümleri, limit üstü durum
- ✅ Yönetim paneli API + destek erişimi
- ⬜ Web uygulaması (öğretmen, öğrenci, veli, yönetim)
- ⬜ Mobil uygulama (Expo; öğretmen, öğrenci, veli)

## Faz D — Doğrulama
- ✅ API testleri: AS-2, AS-3, AS-4, AS-5 (ders kısmı), AS-6, AS-7; AS-1 ve AS-8 kısmi — 51 test, gerçek PostgreSQL
- ⬜ Diğer kabul senaryoları, web e2e, Android emülatör doğrulaması

## Faz E — GitHub ve kurulum
- ✅ GitHub: https://github.com/beza0/derslik-app (public)
- ⛔ Uzak repo + push + CI (yetki bekleniyor)
