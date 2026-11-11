# Derslik — Ürün Gereksinimleri (çalışma adı)

## 1. Ürün özeti
Bağımsız özel ders öğretmenlerinin öğrenci, grup, takvim, not, ödev ve gelişim değerlendirmelerini tek yerden yönettiği; web, iOS ve Android'de çalışan bir uygulama. Öğretmen her işi ekranlardan veya yalnızca kendisine açık AI asistanla (yazılı/sesli) yapabilir. Öğrenci ve veli yalnızca öğretmenin davetiyle mevcut kayda bağlanır ve yalnızca kendisiyle paylaşılanı görür. Öğretmen öğrencisi hesap açmadan uygulamayı tam kullanabilir. Ürün bir pazaryeri değildir.

Kapsam: Web + iOS + Android + yönetim paneli (web). Branş/sınıf/sınav sınırlaması yok; bu alanlar isteğe bağlı.

## 2. Roller ve yetki matrisi

Kısaltmalar: **Ö** öğretmen (kendi çalışma alanı), **S** öğrenci (bağlı olduğu kayıt), **V** veli (bağlı olduğu öğrenci), **Y** sistem yöneticisi. ✓ izinli, ✗ izinsiz, ◐ koşullu.

| İşlem / veri | Ö | S | V | Y |
|---|---|---|---|---|
| Öğrenci kaydı oluşturma/düzenleme/arşiv/silme | ✓ | ✗ | ✗ | ✗ |
| Öğrenci listesi | ✓ (kendi alanı) | ✗ | ✗ | ✗ (yalnızca sayılar) |
| Grup yönetimi | ✓ | ✗ (yalnızca üye olduğu grubun adı) | ✗ | ✗ |
| Diğer grup üyelerinin bilgileri | ✓ | ✗ | ✗ | ✗ |
| Ders oluşturma/taşıma/iptal | ✓ | ✗ | ✗ | ✗ |
| Ders görüntüleme | ✓ | ✓ (katılımcı olduğu) | ✓ (çocuğunun) | ✗ |
| İptal/erteleme talebi oluşturma | ✗ | ✓ | ◐ (`canRequestChanges` izni) | ✗ |
| Talebi onaylama/reddetme | ✓ | ✗ | ✗ | ✗ |
| Not: öğretmene özel | ✓ | ✗ | ✗ | ✗ |
| Not: öğrenciyle paylaşılan | ✓ | ✓ | ✗ | ✗ |
| Not: öğrenci + veli | ✓ | ✓ | ✓ | ✗ |
| Ödev oluşturma/yayımlama | ✓ | ✗ | ✗ | ✗ |
| Taslak ödev | ✓ | ✗ | ✗ | ✗ |
| Yayımlanmış ödev | ✓ | ✓ (alıcıysa) | ✓ (durum) | ✗ |
| Ödev teslimi | ✗ | ✓ | ✗ | ✗ |
| Cevap anahtarı | ✓ | ◐ (görünürlük kuralı) | ◐ (öğrenciyle aynı kural) | ✗ |
| Teslim geri bildirimi | ✓ yazar | ✓ okur | ✓ okur (paylaşılan) | ✗ |
| Değerlendirme | ✓ | ◐ (görünürlük) | ◐ (görünürlük) | ✗ |
| Materyal arşivi | ✓ | ◐ (atanan materyal) | ✗ | ✗ |
| AI asistan | ✓ | ✗ | ✗ | ✗ |
| Davet üretme/iptal | ✓ | ✗ | ✗ | ✗ |
| Bağlantı kaldırma | ✓ | ✓ (kendi bağlantısı) | ✓ (kendi bağlantısı) | ✗ |
| Abonelik | ✓ (kendi) | ✗ | ✗ | ✓ (durum, plan) |
| Paket/limit/kota ayarları | ✗ | ✗ | ✗ | ✓ |
| Kullanıcı hesabı durumu (askıya alma) | ✗ | ✗ | ✗ | ✓ |
| Hassas öğrenci içeriği | ✓ | ✗ | ✗ | ◐ yalnızca öğretmenin süreli onayıyla, gerekçeli, salt-okunur, denetim kaydı |

İlkeler:
- Her öğretmenin verisi kendi çalışma alanında (`workspace`). Aynı kişi iki öğretmene bağlıysa iki ayrı öğrenci kaydı vardır; öğretmenler birbirinin kaydını göremez.
- İstemciden gelen öğretmen/çalışma alanı kimliğine güvenilmez; kimlik oturumdan türetilir.
- Öğrenci ve veli tarafında hiçbir AI ucu yoktur (rota bile kayıtlı değildir, yetki katmanında ayrıca engellenir).

## 3. Fonksiyonel gereksinimler

### FR-1 Hesap ve oturum
- E-posta + parola ile kayıt, e-posta doğrulama, giriş, çıkış, şifre sıfırlama.
- Öğretmen kayıt sırasında rol olarak "öğretmen" seçer → çalışma alanı ve ücretsiz plan oluşur.
- Öğrenci/veli hesapları davet kabul akışında açılır (veya mevcut hesapla giriş).
- Sosyal giriş ve telefon doğrulaması ilk sürümde yok.

### FR-2 Başlangıç akışı (öğretmen)
- En fazla 2 adım: (1) ad + saat dilimi (varsayılan Europe/Istanbul), (2) ilk öğrencinin adı (atlanabilir).

### FR-3 Öğrenci yönetimi
- Zorunlu alan yalnızca ad. İsteğe bağlı: soyad/görünen ad, seviye/sınıf, hedef/sınav, branş, iletişim notu, renk.
- Arşivleme/arşivden çıkarma; kalıcı silme ayrı ve açık işlem.
- Profil sekmeleri: Genel (yaklaşan dersler), Dersler (geçmiş), Ödevler, Notlar, Değerlendirmeler, Materyaller, Bağlantılar (davet/hesap/veli).

### FR-4 Davet
- Öğrenci daveti ve veli daveti ayrı; ikisi de belirli öğrenci kaydına bağlı.
- Kod + bağlantı; süreli (varsayılan 7 gün), yenilenebilir, iptal edilebilir, tek kullanım.
- Kabul: giriş yapılmış hesap ya da yeni hesap. Aynı hesabın tekrar kabulü bağlantıyı çoğaltmaz.
- Düzeltme: öğretmen bağlantıyı kaldırıp yeni davet üretebilir; öğrenci/veli kendi bağlantısını kaldırabilir. Bir öğrenci kaydı aynı anda en fazla bir öğrenci hesabına bağlanır; bir hesap aynı çalışma alanında en fazla bir öğrenci kaydına bağlanır.
- Grup için toplu davet üretimi; kopyalanabilir liste. Otomatik dış mesaj yok.

### FR-5 Gruplar
- Ad + üyeler. Üyelik geçmişi (`joined_at`, `left_at`).
- Grup dersi tek ders kaydı + katılımcı kayıtları. Grup ödevi tek ödev + alıcı kayıtları.
- Üyelik değişikliğinde gelecek ders/ödev etkisi önizleme ile seçilir.

### FR-6 Takvim ve dersler
- Görünümler: web gün/hafta/ay; mobil gün/hafta. Filtre: öğrenci, grup, durum.
- Ders alanları: öğrenci veya grup, başlık, tarih/saat, süre, saat dilimi, online/yüz yüze, konum veya görüşme bağlantısı (yalnızca https), not, tekrar kuralı.
- Haftalık tekrar: gün(ler), başlangıç, bitiş tarihi veya adet.
- Düzenleme kapsamı: yalnızca bu ders / bu ve sonraki dersler. Tamamlanmış veya geçmiş dersler seri değişikliğinden etkilenmez.
- Çakışma: aynı çalışma alanında iptal edilmemiş dersler örtüşemez (sunucu + veritabanı kısıtı). Bitiş = başlangıç çakışma değildir.
- Seri oluşturma/düzenleme tek işlem: herhangi bir oturum çakışırsa hiçbiri kaydedilmez, çakışan tarihler listelenir.
- Durumlar: planlandı / yapıldı / iptal. Katılımcı yoklaması: bilinmiyor / katıldı / katılmadı.
- Dersi tamamlama: işlenen konu, sonraki ders planı, hızlı ödev ekleme.
- Talepler: öğrenci (ve izinliyse veli) iptal veya erteleme talebi (önerilen zaman isteğe bağlı) oluşturur; öğretmen onaylar/reddeder. Onaya kadar takvim değişmez.

### FR-7 Notlar ve değerlendirmeler
- Not türleri: gözlem, ders özeti, güçlü/zayıf alan (konu etiketiyle). Görünürlük: özel / öğrenci / öğrenci+veli. Varsayılan özel.
- Değerlendirme: başlık, tarih, isteğe bağlı sayısal puan (+ maksimum), konu, serbest metin, görünürlük.
- Gelişim grafiği yalnızca en az 3 sayısal kayıt varsa; aksi halde "henüz yeterli veri yok".

### FR-8 Ödev ve materyal
- Ödev: başlık, açıklama, isteğe bağlı son tarih, ekler (dosya/fotoğraf/bağlantı), alıcılar (öğrenci(ler) veya grup), cevap anahtarı (metin/dosya) + görünürlük (gizli / inceleme sonrası / belirli tarihte).
- Ödev durumu: taslak / yayımlandı. Alıcı durumu: atandı / teslim edildi / incelendi / yeniden teslim istendi. Gecikme türetilir.
- Teslim: metin + fotoğraf/PDF; her teslim yeni sürüm. Geri bildirim + isteğe bağlı puan + yeniden teslim isteği.
- Materyal arşivi: öğretmene özel; ödeve veya öğrenciye eklenebilir.
- Dosya limitleri: tek dosya 15 MB; görsel (jpg, png, webp, heic) ve PDF; içerik türü sunucuda imza ile doğrulanır.

### FR-9 AI asistan (yalnızca öğretmen)
- Gereksinim dokümanı §9'daki 7 yetenek, araç tabanlı.
- Önizleme/onay kuralları ve idempotency (bkz. iş kuralları BR-AI).

### FR-10 Bildirimler (uygulama içi)
- Olaylar: ders oluşturuldu/değişti/iptal, hatırlatma, ödev yayımlandı/güncellendi, son tarih yaklaşıyor (24 saat), geri bildirim, talep oluşturuldu/sonuçlandı.
- Okundu/okunmadı; olay başına tekil anahtar (`dedupe_key`); kategori bazlı tercih.

### FR-11 Abonelik
- Plan seçimi, sandbox ödeme, sunucu doğrulaması, hak (entitlement) yönetimi, iptal, süre sonu, plan düşürme.

### FR-12 Yönetim paneli
- Kullanıcılar (arama, durum), planlar (sürümlü), kotalar, sistem ayarları, toplu kullanım, hatalar, abonelik durumları, destek erişim talepleri ve denetim kaydı.

### FR-13 Veri hakları
- Öğretmen: öğrenci verisini dışa aktarma (JSON/CSV), kalıcı silme. Kullanıcı: kendi hesabını silme (öğretmen ise çalışma alanı 30 gün sonra silinir, öncesinde dışa aktarma önerilir).
- Minimum veri: öğrenci için yalnızca ad zorunlu; doğum tarihi istenmez.

## 4. İş kuralları

**BR-LIM (limitler)**
1. Aktif öğrenci = çalışma alanındaki `status = active` öğrenci kayıtları. Hesap bağlı olması gerekmez. Gruplar sayıyı artırmaz.
2. Ekleme, arşivden çıkarma, toplu ekleme ve AI ekleme aynı servis fonksiyonundan geçer; çalışma alanı satırı kilitlenir.
3. Limit aşımında işlem uygulanmaz; `PLAN_LIMIT_REACHED` hatası + plan seçenekleri.
4. Arşivli öğrenciye yeni ders/ödev/not oluşturulamaz.

**BR-CAL (takvim)**
1. Saklama: `timestamptz` (UTC) + dersin IANA saat dilimi. Seri kuralı yerel saatle.
2. Çakışma `[başlangıç, bitiş)` aralığıyla; iptal edilen ders hariç.
3. "Bu ve sonraki" düzenlemesi: seri ikiye bölünür; yalnızca seçilen tarihten itibaren, durumu `planlandı` ve başlangıcı gelecekte olan dersler yeniden üretilir.
4. Tekil olarak düzenlenmiş (`is_exception`) dersler seri düzenlemesinde korunur ve önizlemede gösterilir.
5. Ders, katılımcılardan biri gelmediğinde iptal olmaz.

**BR-VIS (görünürlük)**
1. Öğrenci/veli API yanıtları ayrı DTO'larla üretilir; özel alanlar (öğretmen notu, cevap anahtarı, diğer üyeler) modelde hiç bulunmaz.
2. Bildirim metinleri özel içerik taşımaz (ör. "Yeni bir notun var" + bağlantı).
3. Dosya indirme her seferinde yetki kontrolüyle; URL'ler kısa ömürlü ve kullanıcıya bağlı.

**BR-AI**
1. Okuma ve taslak üretme doğrudan. Kesin hedefli öğretmene özel not doğrudan kaydedilir + geri al.
2. Takvim değişikliği, yeni ders/seri, bağlantı değişikliği, ödev yayımlama, görünürlük değişikliği, silme, bildirim üreten işlemler → önizleme + onay.
3. Onayda işlem yeniden doğrulanır; sonuç önizlemeden farklıysa uygulanmaz, yeni önizleme döner.
4. Çok işlemli komut: birleşik önizleme, tek transaction.
5. Belirsiz isim → seçim; eksik saat/süre → kısa soru. Göreli tarihler öğretmenin saat diliminde çözülür ve açık tarih gösterilir.
6. Kota aşımı → AI işlemi reddedilir, manuel akış etkilenmez.

## 5. Kullanıcı hikâyeleri ve kabul kriterleri

Kabul senaryoları gereksinim dokümanındaki §15 listesiyle birebir eşlenir (AS-1 … AS-14). Her senaryonun otomatik testi `apps/api/test` altında `AS-x` etiketiyle bulunur.

| Kod | Hikâye | Kabul kriteri (özet) |
|---|---|---|
| AS-1 | Öğretmen olarak hesap açıp tek öğrencimi ücretsiz ekleyip ders/not/ödev yönetmek istiyorum. | Kayıt → çalışma alanı + ücretsiz plan; yalnızca adla öğrenci; hesapsız öğrenciye ders/not/ödev. |
| AS-2 | Öğrenci olarak davetle mevcut kayda bağlanmak istiyorum. | Kabul sonrası yeni öğrenci kaydı oluşmaz; tekrar kabul tek bağlantı; süresi dolmuş/iptal davet `INVITE_INVALID`. |
| AS-3 | İki öğretmenim olsun ama verileri karışmasın. | İki bağlantı; öğretmen A, B'nin kayıt kimliğiyle istek atınca 404. |
| AS-4 | Limit dolanılamasın. | Ekleme/toplu/arşivden çıkarma/AI aynı limit; 10 eşzamanlı istekten en fazla limit kadarı başarılı. |
| AS-5 | Grup dersi tek görünsün, yoklama/teslim ayrı olsun. | Takvimde 1 kayıt; katılımcı bazlı yoklama; alıcı bazlı teslim. |
| AS-6 | Seri ve tek ders ayrı düzenlensin. | "Yalnızca bu" ve "bu ve sonraki"; tamamlanmış dersler değişmez; çakışan seri hiç kaydedilmez. |
| AS-7 | Erteleme talebi öğretmen onayına kadar takvimi değiştirmesin. | Talep sonrası ders zamanı aynı; onayla değişir. |
| AS-8 | Özel not ve gizli cevap anahtarı sızmasın. | Öğrenci/veli API yanıtı, dosya erişimi ve bildirimlerde yok. |
| AS-9 | Fotoğraf/PDF teslim, geri bildirim, yeniden teslim. | Sürümlü teslim; durum geçişleri. |
| AS-10 | AI belirsizliği sorsun, önizleme göstersin, onay tek işlem üretsin. | Onaydan önce takvim aynı; iki onay → bir işlem. |
| AS-11 | Onay beklerken değişen veri yeniden doğrulansın; AI arızası manuel akışı bozmasın. | Yeni çakışma → onay reddi; AI sağlayıcı hatasında ders CRUD çalışır. |
| AS-12 | Abonelik test ortamında, sunucu doğrulamalı. | İstemci "başarılı" demesi hak açmaz; imzasız webhook reddedilir; tekrar olay tek hak. |
| AS-13 | Abonelik bitince veri silinmesin. | Limit üstü durum bayrağı; görüntüleme/arşivleme açık. |
| AS-14 | Web ve mobil aynı veriyi görsün; öğrencide AI kapalı. | Aynı API; öğrenci token'ıyla tüm AI uçları 403. |

## 6. Kapsam dışı
Öğrenci bulma/pazaryeri; öğrenciden ders ücreti tahsilatı, borç/alacak, ders paketi bakiyesi, fatura; yerleşik görüntülü görüşme; takvim sağlayıcılarıyla çift yönlü senkronizasyon; mobil push, SMS, WhatsApp; öğrenci/veli AI erişimi; öğretmenler arası ortak materyal kütüphanesi; çevrimdışı düzenleme senkronizasyonu; grup için herkese açık sınırsız kayıt linki; sosyal giriş ve telefon doğrulaması (ilk sürüm).
