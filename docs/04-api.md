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

## Sıradaki modüller 🚧
Gruplar (`/groups`), takvim (`/lessons`, `/calendar`), talepler (`/change-requests`), notlar (`/notes`), değerlendirmeler (`/assessments`), ödevler (`/assignments`, `/submissions`), dosyalar (`/files`), materyaller (`/materials`), bildirimler (`/notifications`), AI (`/ai/messages`, `/ai/actions/:id`), öğrenci/veli görünümü (`/portal/*`), yönetim (`/admin/*`).
