# API Sözleşmesi

Taban: `/api`. Kimlik: `Authorization: Bearer <accessToken>` (15 dk). Hatalar her zaman:

```json
{ "error": { "code": "PLAN_LIMIT_REACHED", "message": "…", "details": { } } }
```

Kodlar: `packages/shared/src/errors.ts`. Girdi şemaları: `packages/shared/src/schemas/*` (web, mobil ve API aynı zod şemalarını kullanır).

Durum: ✅ uygulandı ve testli · 🚧 sıradaki

## Kimlik ✅
| Yöntem | Yol | Not |
|---|---|---|
| POST | `/auth/register` | `RegisterInput`. `role: teacher` çalışma alanı + ücretsiz plan açar. Mobil `X-Client: mobile` ile refresh token'ı gövdede alır; web HttpOnly çerez (`dl_rt`, path `/api/auth`). |
| POST | `/auth/login` | Yanlış e-posta/parola aynı hata (`INVALID_CREDENTIALS`). |
| POST | `/auth/refresh` | Token döndürme; kullanılmış token tekrar gelirse kullanıcının tüm oturumları kapanır. Çerezle çağrıda Origin kontrolü. |
| POST | `/auth/logout` | Oturumu kapatır; erişim token'ı da hemen geçersizleşir. |
| POST | `/auth/verify-email`, `/auth/resend-verification` | Tek kullanımlık, 48 saat. |
| POST | `/auth/request-password-reset`, `/auth/reset-password` | Hesap olsun olmasın 204; sıfırlama tüm oturumları kapatır. |
| GET/PATCH | `/me` | Kullanıcı + bağlamlar (öğretmen / öğrenci bağlantıları / veli bağlantıları / yönetici). |

## Öğrenciler ✅ (öğretmen)
| Yöntem | Yol | Not |
|---|---|---|
| GET | `/students?status=active\|archived&q=` | |
| POST | `/students` | Yalnızca `displayName` zorunlu. Limit kontrolü. |
| POST | `/students/bulk` | Hepsi ya da hiçbiri; isteğe bağlı `groupId`. |
| GET/PATCH | `/students/:id` | Başka çalışma alanındaki kimlik → 404. |
| POST | `/students/:id/archive`, `/students/:id/unarchive` | Arşivden çıkarma limite tabi. |
| POST | `/students/:id/delete` | `{ confirmName }` — kalıcı, denetim kaydına yazılır. |
| DELETE | `/students/:id/account-link` | Yanlış hesap düzeltmesi. |
| GET/PATCH/DELETE | `/students/:id/guardians[/:linkId]` | Veli izinleri (`canRequestChanges`). |

## Davetler ✅
| Yöntem | Yol | Not |
|---|---|---|
| POST/GET | `/students/:id/invites` | `{ kind: student\|guardian, ttlDays, canRequestChanges }`. Ham kod yalnızca oluşturma yanıtında. Yeni davet eskisini iptal eder. |
| POST | `/groups/:id/invites` | Grup üyelerine ayrı davetler (dış mesaj yok). |
| DELETE | `/invites/:id` | İptal. |
| POST | `/invites/preview` | Kimliksiz; öğretmen ve öğrenci adı. |
| POST | `/invites/accept` | Idempotent; eşzamanlı kabul tek bağlantı. |
| DELETE | `/me/links/:studentId` | Öğrenci/veli kendi bağlantısını kaldırır. |

## Abonelik
| GET | `/billing/entitlement` ✅ | Plan, limit, aktif sayı, limit üstü, AI kotası. |
|---|---|---|
| POST | `/billing/checkout`, `/billing/webhooks/:provider` 🚧 | Sandbox sağlayıcı, imza doğrulama, idempotent olaylar. |

## Gruplar ✅
| GET/POST |  | Oluşturma üyelerle; arşivli gruplar . |
|---|---|---|
| GET/PATCH |  | Üyeler dahil. |
| POST | ,  | |
| POST |  | Hiçbir şey yazmaz: etkilenecek gelecek dersler ve açık ödevler. |
| POST |  | . Geçmiş katılım değişmez; teslim yapılmış ödev kaydı silinmez. |

## Takvim ✅ (öğretmen)
| GET |  | En fazla 100 günlük aralık. |
|---|---|---|
| POST |  | Tek ders veya . Tek işlem: bir oturum çakışırsa hiçbiri kaydedilmez (, çakışan tarihler ). Yanıt : öğrencinin başka öğretmenle çakışan tarihleri (ayrıntısız, engellemez). |
| GET/PATCH |  | . |
| POST |  |  ile. İptal edilen ders çakışma kontrolünde yer tutmaz. |
| POST |  | İşlenen konu, sonraki plan, katılımcı bazlı yoklama. |
| PUT |  | |
| GET |  | Profil sekmesi. |

## Talepler ✅
| GET |  | Öğretmen. |
|---|---|---|
| POST |  | ; erteleme onayı çakışma kontrollü, başarısızsa talep beklemede kalır. |

## Öğrenci/veli portalı ✅
| GET |  | Birden çok öğretmenin dersleri birlikte; öğretmen notu, işlenen konu, diğer grup üyeleri modelde yok. |
|---|---|---|
| GET |  | |
| POST |  | . Veli için  gerekir. |
| GET | , POST  | |

## Bildirimler ✅
| GET |  | Sayfalı. Metinler i18n anahtarı + parametre; özel içerik yok. |
|---|---|---|
| GET |  | |
| POST |  |  veya  |
| GET/PUT |  | Kategori bazlı;  kapatılamaz. |

Hatırlatmalar: her 5 dakikada 60 dk içindeki dersler;  ile tek sefer.

## Sıradaki modüller 🚧
Notlar (), değerlendirmeler (), ödevler (, ), dosyalar (), materyaller (), AI (, ), abonelik ödeme akışı, yönetim ().
