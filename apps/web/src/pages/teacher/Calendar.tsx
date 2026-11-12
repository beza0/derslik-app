import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import type { LessonDto, StudentDto } from '@derslik/shared';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { t } from '../../i18n';
import { fmtTime } from '../../format';
import { Empty, ErrorBox, PageHeader, Spinner, StatusBadge } from '../../ui';
import { LessonForm } from './LessonForm';

type View = 'day' | 'week' | 'month';
const START_HOUR = 7;
const END_HOUR = 23;
const HOUR_PX = 48;

export interface CalLesson {
  id: string;
  startsAt: string;
  endsAt: string;
  status: LessonDto['status'];
  label: string;
  sub?: string;
}

function range(view: View, anchor: DateTime) {
  if (view === 'day') return { from: anchor.startOf('day'), to: anchor.startOf('day').plus({ days: 1 }) };
  if (view === 'week') return { from: anchor.startOf('week'), to: anchor.startOf('week').plus({ weeks: 1 }) };
  const from = anchor.startOf('month').startOf('week');
  return { from, to: from.plus({ weeks: 6 }) };
}

/** Öğretmen ve portal takvimlerinin ortak görünümü. Telefonda varsayılan günlük liste. */
export function CalendarView({
  zone,
  load,
  queryKey,
  onOpen,
  toolbarExtra,
  allowMonth = true,
}: {
  zone: string;
  load: (from: string, to: string) => Promise<CalLesson[]>;
  queryKey: unknown[];
  onOpen: (id: string) => void;
  toolbarExtra?: React.ReactNode;
  allowMonth?: boolean;
}) {
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches;
  const [view, setView] = useState<View>(narrow ? 'day' : 'week');
  const [anchor, setAnchor] = useState<DateTime>(DateTime.now().setZone(zone).setLocale('tr'));
  const { from, to } = range(view, anchor);
  const q = useQuery({ queryKey: [...queryKey, view, from.toISO()], queryFn: () => load(from.toISO()!, to.toISO()!) });
  const step = view === 'day' ? { days: 1 } : view === 'week' ? { weeks: 1 } : { months: 1 };
  const title =
    view === 'day' ? anchor.toFormat('d LLLL yyyy, cccc') : view === 'week' ? `${from.toFormat('d LLL')} – ${to.minus({ days: 1 }).toFormat('d LLL yyyy')}` : anchor.toFormat('LLLL yyyy');

  const byDay = useMemo(() => {
    const m = new Map<string, CalLesson[]>();
    for (const l of q.data ?? []) {
      const k = DateTime.fromISO(l.startsAt).setZone(zone).toISODate()!;
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    return m;
  }, [q.data, zone]);

  const today = DateTime.now().setZone(zone).toISODate();

  return (
    <>
      <div className="cal-toolbar">
        <button className="btn sm" aria-label="Önceki" onClick={() => setAnchor(anchor.minus(step))}><ChevronLeft size={18} /></button>
        <button className="btn sm" onClick={() => setAnchor(DateTime.now().setZone(zone).setLocale('tr'))}>Bugün</button>
        <button className="btn sm" aria-label="Sonraki" onClick={() => setAnchor(anchor.plus(step))}><ChevronRight size={18} /></button>
        <strong style={{ marginRight: 'auto' }}>{title}</strong>
        <div className="row" role="group" aria-label="Görünüm">
          {(['day', 'week', ...(allowMonth ? ['month'] : [])] as View[]).map((v) => (
            <button key={v} className={`btn sm ${view === v ? 'primary' : ''}`} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'day' ? 'Gün' : v === 'week' ? 'Hafta' : 'Ay'}
            </button>
          ))}
        </div>
        {toolbarExtra}
      </div>
      {q.isLoading && <Spinner />}
      {q.error && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
      {q.data && view === 'day' && (
        <div className="card">
          {(byDay.get(anchor.toISODate()!) ?? []).length === 0 ? (
            <Empty title="Bu gün ders yok" />
          ) : (
            <div className="list">
              {byDay.get(anchor.toISODate()!)!.map((l) => (
                <button key={l.id} className="list-item btn ghost" style={{ justifyContent: 'flex-start', textAlign: 'left', borderRadius: 0 }} onClick={() => onOpen(l.id)}>
                  <div style={{ fontWeight: 700, width: 92 }}>{fmtTime(l.startsAt, zone)}–{fmtTime(l.endsAt, zone)}</div>
                  <div className="grow">
                    <div className="title">{l.label}</div>
                    {l.sub && <div className="small muted">{l.sub}</div>}
                  </div>
                  <StatusBadge tone={l.status === 'done' ? 'ok' : l.status === 'cancelled' ? 'danger' : 'info'}>{t(`status.${l.status}`)}</StatusBadge>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {q.data && view === 'week' && (
        <div style={{ overflowX: 'auto' }}>
          <div className="week" style={{ minWidth: 720 }}>
            <div />
            {Array.from({ length: 7 }, (_, i) => from.plus({ days: i })).map((d) => (
              <div key={d.toISODate()} className={`week-head ${d.toISODate() === today ? 'today' : ''}`}>
                {d.toFormat('ccc d')}
              </div>
            ))}
            <div>
              {Array.from({ length: END_HOUR - START_HOUR }, (_, h) => (
                <div key={h} className="hour-label">{String(START_HOUR + h).padStart(2, '0')}:00</div>
              ))}
            </div>
            {Array.from({ length: 7 }, (_, i) => from.plus({ days: i })).map((d) => (
              <div key={d.toISODate()} className="week-col">
                {Array.from({ length: END_HOUR - START_HOUR }, (_, h) => (
                  <div key={h} className="hour-cell" />
                ))}
                {(byDay.get(d.toISODate()!) ?? []).map((l) => {
                  const s = DateTime.fromISO(l.startsAt).setZone(zone);
                  const e = DateTime.fromISO(l.endsAt).setZone(zone);
                  const top = Math.max(0, (s.hour + s.minute / 60 - START_HOUR) * HOUR_PX);
                  const height = Math.max(22, e.diff(s, 'minutes').minutes * (HOUR_PX / 60) - 2);
                  return (
                    <button key={l.id} className={`event ${l.status}`} style={{ top, height, textAlign: 'left', border: 0 }} onClick={() => onOpen(l.id)} title={`${l.label} ${s.toFormat('HH:mm')}`}>
                      <strong>{s.toFormat('HH:mm')}</strong> {l.label}
                      {l.status === 'cancelled' && <span className="sr-only"> (iptal)</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      {q.data && view === 'month' && (
        <div className="month">
          {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => (
            <div key={d} className="month-cell" style={{ minHeight: 0, fontWeight: 700 }}>{d}</div>
          ))}
          {Array.from({ length: 42 }, (_, i) => from.plus({ days: i })).map((d) => (
            <div key={d.toISODate()} className={`month-cell ${d.month !== anchor.month ? 'other' : ''}`}>
              <div className="d" style={d.toISODate() === today ? { color: 'var(--primary)' } : undefined}>{d.day}</div>
              {(byDay.get(d.toISODate()!) ?? []).slice(0, 3).map((l) => (
                <button key={l.id} className="chip" style={{ border: 0, width: '100%', textAlign: 'left', textDecoration: l.status === 'cancelled' ? 'line-through' : undefined }} onClick={() => onOpen(l.id)}>
                  {fmtTime(l.startsAt, zone)} {l.label}
                </button>
              ))}
              {(byDay.get(d.toISODate()!)?.length ?? 0) > 3 && (
                <button className="btn ghost sm" onClick={() => { setAnchor(d); setView('day'); }}>+{byDay.get(d.toISODate()!)!.length - 3} daha</button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function CalendarPage() {
  const { me } = useAuth();
  const nav = useNavigate();
  const zone = me!.contexts.teacher!.timezone;
  const [adding, setAdding] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [status, setStatus] = useState('');
  const students = useQuery({ queryKey: ['students', 'active'], queryFn: () => api.get<StudentDto[]>('/students') });
  return (
    <>
      <PageHeader title="Takvim" actions={<button className="btn primary" onClick={() => setAdding(true)}><CalendarPlus size={18} /> Ders ekle</button>} />
      <CalendarView
        zone={zone}
        queryKey={['calendar', studentId, status]}
        onOpen={(id) => nav(`/lessons/${id}`)}
        load={async (from, to) => {
          const qs = new URLSearchParams({ from, to, ...(studentId ? { studentId } : {}), ...(status ? { status } : {}) });
          const ls = await api.get<LessonDto[]>(`/calendar?${qs}`);
          return ls.map((l) => ({ id: l.id, startsAt: l.startsAt, endsAt: l.endsAt, status: l.status, label: l.targetName, sub: l.title ?? undefined }));
        }}
        toolbarExtra={
          <>
            <select className="input" style={{ width: 160, minHeight: 32 }} value={studentId} onChange={(e) => setStudentId(e.target.value)} aria-label="Öğrenci filtresi">
              <option value="">Tüm öğrenciler</option>
              {students.data?.map((s) => (
                <option key={s.id} value={s.id}>{s.displayName}</option>
              ))}
            </select>
            <select className="input" style={{ width: 130, minHeight: 32 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Durum filtresi">
              <option value="">Tüm durumlar</option>
              <option value="scheduled">Planlandı</option>
              <option value="done">Yapıldı</option>
              <option value="cancelled">İptal</option>
            </select>
          </>
        }
      />
      {adding && <LessonForm onClose={() => setAdding(false)} />}
    </>
  );
}
