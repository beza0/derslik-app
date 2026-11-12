import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { ApiError, type Attendance, type LessonDto } from '@derslik/shared';
import { api, errorMessage } from '../../api';
import { t } from '../../i18n';
import { fmtRange } from '../../format';
import { ErrorBox, Field, Modal, PageHeader, Spinner, StatusBadge, useToast } from '../../ui';

export function LessonDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['lesson', id], queryFn: () => api.get<LessonDto>(`/lessons/${id}`) });
  const [topics, setTopics] = useState('');
  const [nextPlan, setNextPlan] = useState('');
  const [att, setAtt] = useState<Record<string, Attendance>>({});
  const [moving, setMoving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (q.data) {
      setTopics(q.data.topicsCovered ?? '');
      setNextPlan(q.data.nextPlan ?? '');
      setAtt(Object.fromEntries((q.data.participants ?? []).map((p) => [p.studentId, p.attendance])));
    }
  }, [q.data]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['lesson', id] });
    void qc.invalidateQueries({ queryKey: ['calendar'] });
  };
  const complete = useMutation({
    mutationFn: () => api.post(`/lessons/${id}/complete`, { topicsCovered: topics || null, nextPlan: nextPlan || null, attendance: Object.entries(att).map(([studentId, attendance]) => ({ studentId, attendance })) }),
    onSuccess: () => {
      refresh();
      toast('Ders kaydedildi');
    },
    onError: (e) => toast(errorMessage(e)),
  });

  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const l = q.data!;
  const target = l.studentId ? `/students/${l.studentId}` : `/groups/${l.groupId}`;

  return (
    <>
      <PageHeader
        title={l.targetName}
        subtitle={<span className="row">{fmtRange(l.startsAt, l.endsAt, l.timezone)} <StatusBadge tone={l.status === 'done' ? 'ok' : l.status === 'cancelled' ? 'danger' : 'info'}>{t(`status.${l.status}`)}</StatusBadge>{l.seriesId && <StatusBadge>Seri</StatusBadge>}</span>}
        actions={
          l.status === 'scheduled' && (
            <>
              <button className="btn" onClick={() => setMoving(true)}>Taşı</button>
              <button className="btn danger" onClick={() => setCancelling(true)}>İptal et</button>
            </>
          )
        }
      />
      <div className="grid grid-2">
        <div className="card stack">
          <dl className="kv">
            <dt>Kime</dt><dd><Link to={target}>{l.targetName}</Link></dd>
            <dt>Tür</dt><dd>{l.mode === 'online' ? 'Online' : 'Yüz yüze'}</dd>
            {l.meetingUrl && (<><dt>Bağlantı</dt><dd><a href={l.meetingUrl} target="_blank" rel="noopener noreferrer">{l.meetingUrl}</a></dd></>)}
            {l.location && (<><dt>Konum</dt><dd>{l.location}</dd></>)}
            {l.note && (<><dt>Not</dt><dd>{l.note}</dd></>)}
          </dl>
        </div>
        {l.status !== 'cancelled' && (
          <form className="card stack" onSubmit={(e) => { e.preventDefault(); complete.mutate(); }}>
            <h2>{l.status === 'done' ? 'Ders kaydı' : 'Dersi tamamla'}</h2>
            {(l.participants ?? []).length > 0 && (
              <div className="stack">
                {(l.participants ?? []).map((p) => (
                  <div key={p.studentId} className="row between">
                    <span>{p.displayName}</span>
                    <div className="row" role="group" aria-label={`${p.displayName} yoklama`}>
                      {(['present', 'absent'] as const).map((a) => (
                        <button type="button" key={a} aria-pressed={att[p.studentId] === a} className={`btn sm ${att[p.studentId] === a ? 'primary' : ''}`} onClick={() => setAtt({ ...att, [p.studentId]: a })}>
                          {t(`att.${a}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Field label="İşlenen konu" htmlFor="tc"><textarea id="tc" className="input" value={topics} onChange={(e) => setTopics(e.target.value)} /></Field>
            <Field label="Sonraki ders planı" htmlFor="np"><textarea id="np" className="input" value={nextPlan} onChange={(e) => setNextPlan(e.target.value)} /></Field>
            <div className="row between">
              <Link className="btn" to={`/assignments/new?${l.studentId ? `studentId=${l.studentId}` : `groupId=${l.groupId}`}`}>Ödev ekle</Link>
              <button className="btn primary" disabled={complete.isPending}>{l.status === 'done' ? 'Güncelle' : 'Tamamlandı olarak kaydet'}</button>
            </div>
          </form>
        )}
      </div>
      {moving && <MoveLesson lesson={l} onClose={() => setMoving(false)} onDone={() => { setMoving(false); refresh(); toast('Ders güncellendi'); }} />}
      {cancelling && <CancelLesson lesson={l} onClose={() => setCancelling(false)} onDone={() => { setCancelling(false); refresh(); toast('Ders iptal edildi'); }} />}
    </>
  );
}

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function MoveLesson({ lesson, onClose, onDone }: { lesson: LessonDto; onClose: () => void; onDone: () => void }) {
  const s = DateTime.fromISO(lesson.startsAt).setZone(lesson.timezone);
  const [scope, setScope] = useState<'this' | 'this_and_following'>('this');
  const [date, setDate] = useState(s.toISODate()!);
  const [time, setTime] = useState(s.toFormat('HH:mm'));
  const [dur, setDur] = useState(Math.round(DateTime.fromISO(lesson.endsAt).diff(DateTime.fromISO(lesson.startsAt), 'minutes').minutes));
  const [weekdays, setWeekdays] = useState<number[]>([s.weekday]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.patch(`/lessons/${lesson.id}`, scope === 'this' ? { scope, date, startTime: time, durationMin: dur } : { scope, weekdays, startTime: time, durationMin: dur });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError && e.code === 'LESSON_CONFLICT' ? 'Seçilen zamanda başka dersiniz var; hiçbir değişiklik kaydedilmedi.' : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Dersi taşı" onClose={onClose}>
      <div className="stack">
        {lesson.seriesId && (
          <div className="row">
            <label className="row"><input type="radio" checked={scope === 'this'} onChange={() => setScope('this')} /> Yalnızca bu ders</label>
            <label className="row"><input type="radio" checked={scope === 'this_and_following'} onChange={() => setScope('this_and_following')} /> Bu ve sonraki dersler</label>
          </div>
        )}
        {scope === 'this' ? (
          <Field label="Tarih" htmlFor="md"><input id="md" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        ) : (
          <div className="row" role="group" aria-label="Günler">
            {DAYS.map((d, i) => (
              <button type="button" key={d} aria-pressed={weekdays.includes(i + 1)} className={`btn sm ${weekdays.includes(i + 1) ? 'primary' : ''}`} onClick={() => setWeekdays(weekdays.includes(i + 1) ? weekdays.filter((x) => x !== i + 1) : [...weekdays, i + 1].sort())}>{d}</button>
            ))}
          </div>
        )}
        <div className="grid grid-2">
          <Field label="Saat" htmlFor="mt"><input id="mt" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label="Süre (dk)" htmlFor="mdu"><input id="mdu" type="number" className="input" value={dur} min={5} step={5} onChange={(e) => setDur(Number(e.target.value))} /></Field>
        </div>
        {scope === 'this_and_following' && <div className="small muted">Yapılmış, iptal edilmiş ve tek tek değiştirilmiş dersler korunur.</div>}
        {err && <div className="alert danger" role="alert">{err}</div>}
        <button className="btn primary" onClick={save} disabled={busy}>Kaydet</button>
      </div>
    </Modal>
  );
}

function CancelLesson({ lesson, onClose, onDone }: { lesson: LessonDto; onClose: () => void; onDone: () => void }) {
  const [scope, setScope] = useState<'this' | 'this_and_following'>('this');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Dersi iptal et" onClose={onClose}>
      <div className="stack">
        {lesson.seriesId && (
          <div className="row">
            <label className="row"><input type="radio" checked={scope === 'this'} onChange={() => setScope('this')} /> Yalnızca bu ders</label>
            <label className="row"><input type="radio" checked={scope === 'this_and_following'} onChange={() => setScope('this_and_following')} /> Bu ve sonraki dersler</label>
          </div>
        )}
        <Field label="Neden (isteğe bağlı)" htmlFor="cr"><input id="cr" className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="small muted">Bağlı öğrenci ve velilere uygulama içi bildirim gider.</div>
        <button className="btn danger" disabled={busy} onClick={async () => { setBusy(true); await api.post(`/lessons/${lesson.id}/cancel`, { scope, reason: reason || undefined }); onDone(); }}>İptal et</button>
      </div>
    </Modal>
  );
}
