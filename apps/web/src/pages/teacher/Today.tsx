import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { CalendarPlus, UserPlus } from 'lucide-react';
import type { EntitlementDto, LessonDto } from '@derslik/shared';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { t } from '../../i18n';
import { fmtTime } from '../../format';
import { Empty, PageHeader, Q, StatusBadge } from '../../ui';
import { LessonForm } from './LessonForm';

export function Today() {
  const { me } = useAuth();
  const zone = me!.contexts.teacher!.timezone;
  const [adding, setAdding] = useState(false);
  const start = DateTime.now().setZone(zone).startOf('day');
  const lessons = useQuery({
    queryKey: ['calendar', 'today'],
    queryFn: () => api.get<LessonDto[]>(`/calendar?from=${encodeURIComponent(start.toISO()!)}&to=${encodeURIComponent(start.plus({ days: 2 }).toISO()!)}`),
  });
  const requests = useQuery({ queryKey: ['requests', 'pending'], queryFn: () => api.get<unknown[]>('/change-requests?status=pending') });
  const homework = useQuery({ queryKey: ['assignments'], queryFn: () => api.get<{ id: string; title: string; counts: { submitted: number } }[]>('/assignments') });
  const ent = useQuery({ queryKey: ['entitlement'], queryFn: () => api.get<EntitlementDto>('/billing/entitlement') });

  const today = lessons.data?.filter((l) => DateTime.fromISO(l.startsAt).setZone(zone).hasSame(start, 'day')) ?? [];
  const tomorrow = lessons.data?.filter((l) => !DateTime.fromISO(l.startsAt).setZone(zone).hasSame(start, 'day')) ?? [];
  const toReview = homework.data?.reduce((n, a) => n + a.counts.submitted, 0) ?? 0;

  const LessonList = ({ items }: { items: LessonDto[] }) =>
    items.length === 0 ? (
      <Empty title="Ders yok" />
    ) : (
      <div className="list">
        {items.map((l) => (
          <Link key={l.id} to={`/lessons/${l.id}`} className="list-item" style={{ color: 'inherit' }}>
            <div style={{ fontWeight: 700, width: 54 }}>{fmtTime(l.startsAt, zone)}</div>
            <div className="grow">
              <div className="title">{l.targetName}</div>
              <div className="small muted">{l.title ?? (l.mode === 'online' ? 'Online' : 'Yüz yüze')}</div>
            </div>
            <StatusBadge tone={l.status === 'done' ? 'ok' : l.status === 'cancelled' ? 'danger' : 'info'}>{t(`status.${l.status}`)}</StatusBadge>
          </Link>
        ))}
      </div>
    );

  return (
    <>
      <PageHeader
        title={`Merhaba ${me!.user.name.split(' ')[0]}`}
        subtitle={start.setLocale('tr').toFormat('d LLLL cccc')}
        actions={
          <>
            <Link to="/students?new=1" className="btn"><UserPlus size={18} /> Öğrenci</Link>
            <button className="btn primary" onClick={() => setAdding(true)}><CalendarPlus size={18} /> Ders ekle</button>
          </>
        }
      />
      {ent.data?.overLimit && (
        <div className="alert warn" style={{ marginBottom: 12 }}>
          Aktif öğrenci sayınız ({ent.data.activeStudentCount}) paket sınırını ({ent.data.activeStudentLimit}) aşıyor. Verileriniz korunuyor; yeni öğrenci eklemek için bazı öğrencileri arşivleyin veya <Link to="/billing">paketinizi yükseltin</Link>.
        </div>
      )}
      <div className="grid grid-2">
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Bugünkü dersler</h2>
          <Q q={lessons}>{() => <LessonList items={today} />}</Q>
        </div>
        <div className="stack">
          <div className="card">
            <h2 style={{ marginBottom: 8 }}>Yarın</h2>
            <Q q={lessons}>{() => <LessonList items={tomorrow} />}</Q>
          </div>
          <div className="card row between">
            <div>
              <h3>Bekleyen işler</h3>
              <div className="small muted">
                {requests.data?.length ?? 0} talep · {toReview} incelenecek teslim
              </div>
            </div>
            <div className="row">
              <Link to="/requests" className="btn sm">Talepler</Link>
              <Link to="/assignments" className="btn sm">Ödevler</Link>
            </div>
          </div>
        </div>
      </div>
      {adding && <LessonForm onClose={() => setAdding(false)} />}
    </>
  );
}
