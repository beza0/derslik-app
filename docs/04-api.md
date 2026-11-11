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
| Yöntem | Yol | Not |
|---|---|---|
| GET/POST | `/groups` | Oluşturma üyelerle; arşivli gruplar için `?archived=true`. |
| GET/PATCH | `/groups/:id` | Üyeler dahil. |
| POST | `/groups/:id/archive`, `/groups/:id/unarchive` | |
| POST | `/groups/:id/members/preview` | Hiçbir şey yazmaz: etkilenecek gelecek dersler ve açık ödevler. |
| POST | `/groups/:id/members` | `{ add, remove, applyToFutureLessons, applyToOpenAssignments }`. Geçmiş katılım değişmez; teslim yapılmış ödev kaydı silinmez. |

## Takvim ✅ (öğretmen)
| Yöntem | Yol | Not |
|---|---|---|
| GET | `/calendar?from&to&studentId&groupId&status` | En fazla 100 günlük aralık. |
| POST | `/lessons` | Tek ders veya `recurrence: { weekdays, untilDate \| count }`. Tek işlem: bir oturum çakışırsa hiçbiri kaydedilmez (`LESSON_CONFLICT`, çakışan tarihler `details.conflicts`). Yanıttaki `warnings`: öğrencinin başka öğretmenle çakışan tarihleri (ayrıntısız, engellemez). |
| GET/PATCH | `/lessons/:id` | `scope: this \| this_and_following`. |
| POST | `/lessons/:id/cancel` | `scope` ile. İptal edilen ders çakışma kontrolünde yer tutmaz. |
| POST | `/lessons/:id/complete` | İşlenen konu, sonraki plan, katılımcı bazlı yoklama. |
| PUT | `/lessons/:id/attendance/:studentId` | |
| GET | `/students/:id/lessons?when=upcoming\|past` | Profil sekmesi. |

## Talepler ✅
| Yöntem | Yol | Not |
|---|---|---|
| GET | `/change-requests?status=` | Öğretmen. |
| POST | `/change-requests/:id/decide` | `approve \| reject`; erteleme onayı çakışma kontrollü, başarısızsa talep beklemede kalır. |

## Öğrenci/veli portalı ✅
| Yöntem | Yol | Not |
|---|---|---|
| GET | `/portal/calendar?from&to&studentId` | Birden çok öğretmenin dersleri birlikte; öğretmen notu, işlenen konu, diğer grup üyeleri modelde yok. |
| GET | `/portal/lessons/:id` | |
| POST | `/portal/lessons/:id/change-requests` | `{ studentId, kind, proposedStartsAt?, message? }`. Veli için `canRequestChanges` gerekir. |
| GET | `/portal/change-requests` | Kendi talepleri. |
| POST | `/portal/change-requests/:id/withdraw` | |

## Bildirimler ✅
| Yöntem | Yol | Not |
|---|---|---|
| GET | `/notifications?cursor&limit&unread` | Sayfalı. Metinler i18n anahtarı + parametre; özel içerik yok. |
| GET | `/notifications/unread-count` | |
| POST | `/notifications/read` | `{ ids }` veya `{ all: true }` |
| GET/PUT | `/notifications/prefs` | Kategori bazlı; `system` kapatılamaz. |

Hatırlatmalar: her 5 dakikada önümüzdeki 60 dakikadaki dersler taranır; `dedupe_key` ile her olay bir kez bildirilir.

## Sıradaki modüller 🚧
Notlar (`/notes`), değerlendirmeler (`/assessments`), ödevler (`/assignments`, `/submissions`), dosyalar (`/files`), materyaller (`/materials`), AI (`/ai/messages`, `/ai/actions/:id`), abonelik ödeme akışı, yönetim (`/admin/*`).
