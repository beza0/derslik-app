/** Metinler tek yerde; yeni dil eklemek için aynı anahtarlarla yeni sözlük eklenir. */
const tr = {
  'nav.today': 'Bugün',
  'nav.calendar': 'Takvim',
  'nav.students': 'Öğrenciler',
  'nav.groups': 'Gruplar',
  'nav.assignments': 'Ödevler',
  'nav.materials': 'Materyaller',
  'nav.assistant': 'Asistan',
  'nav.requests': 'Talepler',
  'nav.notifications': 'Bildirimler',
  'nav.settings': 'Ayarlar',
  'nav.billing': 'Abonelik',
  'nav.notes': 'Notlar',
  'nav.links': 'Öğretmenlerim',
  'nav.admin': 'Yönetim',
  'nav.more': 'Diğer',
  'status.scheduled': 'Planlandı',
  'status.done': 'Yapıldı',
  'status.cancelled': 'İptal',
  'att.unknown': 'Bilinmiyor',
  'att.present': 'Katıldı',
  'att.absent': 'Katılmadı',
  'rec.assigned': 'Atandı',
  'rec.submitted': 'Teslim edildi',
  'rec.reviewed': 'İncelendi',
  'rec.resubmit_requested': 'Yeniden teslim istendi',
  'vis.private': 'Yalnızca ben',
  'vis.student': 'Öğrenciyle paylaşılan',
  'vis.student_guardian': 'Öğrenci ve veliyle paylaşılan',
  'notif.lesson.created': '{teacher}: yeni ders — {when}',
  'notif.lesson.updated': '{teacher}: ders zamanı değişti — {when}',
  'notif.lesson.cancelled': '{teacher}: ders iptal edildi — {when}',
  'notif.lesson.reminder': 'Yaklaşan ders — {when}',
  'notif.request.created.cancel': '{student} iptal talebi gönderdi — {when}',
  'notif.request.created.reschedule': '{student} erteleme talebi gönderdi — {when}',
  'notif.request.approved': 'Talebiniz onaylandı',
  'notif.request.rejected': 'Talebiniz reddedildi',
  'notif.assignment.published': '{teacher}: yeni ödev — {title}',
  'notif.assignment.updated': '{teacher}: ödev güncellendi — {title}',
  'notif.assignment.submitted': '{student} ödev teslim etti — {title}',
  'notif.assignment.reviewed': 'Ödevin incelendi',
  'notif.assignment.resubmit': 'Ödevin için yeniden teslim istendi',
  'notif.assignment.dueSoon': 'Son tarih yaklaşıyor — {title}',
  'notif.note.shared': 'Seninle yeni bir not paylaşıldı',
  'notif.assessment.shared': 'Yeni bir değerlendirme paylaşıldı',
} as const;

export type MessageKey = keyof typeof tr;
const dict: Record<string, string> = tr;

export function t(key: string, params: Record<string, string> = {}): string {
  const s = dict[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '');
}
