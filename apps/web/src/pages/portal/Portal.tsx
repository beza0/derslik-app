import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { BookOpen, FileText, StickyNote } from 'lucide-react';
import type { AssessmentDto, NoteDto, RecipientStatus } from '@derslik/shared';
import { api, errorMessage } from '../../api';
import { useAuth } from '../../auth';
import { t } from '../../i18n';
import { fmtDate, fmtDateTime, fmtRange, tz } from '../../format';
import { Empty, ErrorBox, Field, Modal, PageHeader, Q, Spinner, StatusBadge, useToast } from '../../ui';
import { CalendarView } from '../teacher/Calendar';
import { FilePicker, recTone } from '../teacher/Assignments';
import { ProgressChart } from '../teacher/StudentProfile';

interface PortalLesson {
  id: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: 'scheduled' | 'done' | 'cancelled';
  targetName: string;
  title: string | null;
  mode: 'online' | 'in_person';
  meetingUrl: string | null;
  location: string | null;
  teacherName: string;
  forStudentId: string;
  forStudentName: string;
}
interface PortalAssignmentItem {
  id: string;
  recipientId: string;
  studentId: string;
  teacherName: string;
  title: string;
  dueAt: string | null;
  status: RecipientStatus;
  late: boolean;
}

/** Veli birden fazla çocuk izleyebilir; öğrenci kendi kaydını görür. */
function useChildren() {
  const { me } = useAuth();
  const c = me!.contexts;
  const own = c.studentLinks.map((l) => ({ studentId: l.studentId, label: `Ben (${l.teacherName})` }));
  const kids = c.guardianLinks.map((l) => ({ studentId: l.studentId, label: `${l.studentName} (${l.teacherName})` }));
  return [...own, ...kids];
}

function ChildPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const children = useChildren();
  if (children.length < 2) return null;
  return (
    <select className="input" style={{ width: 'auto' }} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Kimin bilgileri">
      <option value="">Tümü</option>
      {children.map((c) => <option key={c.studentId + c.label} value={c.studentId}>{c.label}</option>)}
    </select>
  );
}

const isGuardianOnly = (me: ReturnType<typeof useAuth>['me']) => me!.contexts.studentLinks.length === 0;

export function PortalToday() {
  const { me } = useAuth();
  const zone = tz();
  const start = DateTime.now().setZone(zone).startOf('day');
  const lessons = useQuery({ queryKey: ['portal', 'cal', 'week'], queryFn: () => api.get<PortalLesson[]>(`/portal/calendar?from=${encodeURIComponent(start.toISO()!)}&to=${encodeURIComponent(start.plus({ days: 7 }).toISO()!)}`) });
  const hw = useQuery({ queryKey: ['portal', 'assignments'], queryFn: () => api.get<PortalAssignmentItem[]>('/portal/assignments') });
  const open = hw.data?.filter((a) => a.status === 'assigned' || a.status === 'resubmit_requested') ?? [];
  return (
    <>
      <PageHeader title={`Merhaba ${me!.user.name.split(' ')[0]}`} subtitle={start.setLocale('tr').toFormat('d LLLL cccc')} />
      <div className="grid grid-2">
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Bu hafta</h2>
          <Q q={lessons} empty={(d) => d.length === 0 && <Empty title="Bu hafta ders yok" />}>
            {(d) => (
              <div className="list">
                {d.map((l) => (
                  <Link key={l.id + l.forStudentId} to={`/lessons/${l.id}`} className="list-item" style={{ color: 'inherit' }}>
                    <div className="grow">
                      <div className="title">{fmtRange(l.startsAt, l.endsAt, zone)}</div>
                      <div className="small muted">{l.teacherName}{isGuardianOnly(me) ? ` · ${l.forStudentName}` : ''}{l.title ? ` · ${l.title}` : ''}</div>
                    </div>
                    <StatusBadge tone={l.status === 'cancelled' ? 'danger' : l.status === 'done' ? 'ok' : 'info'}>{t(`status.${l.status}`)}</StatusBadge>
                  </Link>
                ))}
              </div>
            )}
          </Q>
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Bekleyen ödevler</h2>
          <Q q={hw} empty={() => open.length === 0 && <Empty title="Bekleyen ödev yok" icon={<BookOpen size={36} />} />}>
            {() => (
              <div className="list">
                {open.map((a) => (
                  <Link key={a.recipientId} to={`/assignments/${a.id}?studentId=${a.studentId}`} className="list-item" style={{ color: 'inherit' }}>
                    <div className="grow">
                      <div className="title">{a.title}</div>
                      <div className="small muted">{a.teacherName} · Son tarih: {fmtDateTime(a.dueAt)}</div>
                    </div>
                    {a.late && <StatusBadge tone="danger">Gecikmiş</StatusBadge>}
                  </Link>
                ))}
              </div>
            )}
          </Q>
        </div>
      </div>
    </>
  );
}

export function PortalCalendar() {
  const nav = useNavigate();
  const [studentId, setStudentId] = useState('');
  return (
    <>
      <PageHeader title="Takvim" subtitle="Tüm öğretmenlerinizin dersleri" />
      <CalendarView
        zone={tz()}
        queryKey={['portal', 'cal', studentId]}
        onOpen={(id) => nav(`/lessons/${id}`)}
        load={async (from, to) => {
          const ls = await api.get<PortalLesson[]>(`/portal/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${studentId ? `&studentId=${studentId}` : ''}`);
          return ls.map((l) => ({ id: l.id, startsAt: l.startsAt, endsAt: l.endsAt, status: l.status, label: l.teacherName, sub: l.title ?? l.targetName }));
        }}
        toolbarExtra={<ChildPicker value={studentId} onChange={setStudentId} />}
      />
    </>
  );
}

export function PortalLesson() {
  const { id } = useParams();
  const { me } = useAuth();
  const toast = useToast();
  const q = useQuery({ queryKey: ['portal', 'lesson', id], queryFn: () => api.get<PortalLesson>(`/portal/lessons/${id}`) });
  const [req, setReq] = useState<'cancel' | 'reschedule' | null>(null);
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const l = q.data!;
  const canRequest = me!.contexts.studentLinks.some((x) => x.studentId === l.forStudentId) || true;
  const future = l.status === 'scheduled' && new Date(l.startsAt) > new Date();
  return (
    <>
      <PageHeader title={l.title ?? l.targetName} subtitle={`${fmtRange(l.startsAt, l.endsAt, tz())} · ${l.teacherName}`} />
      <div className="card stack">
        <StatusBadge tone={l.status === 'cancelled' ? 'danger' : l.status === 'done' ? 'ok' : 'info'}>{t(`status.${l.status}`)}</StatusBadge>
        <div>{l.mode === 'online' ? 'Online' : 'Yüz yüze'}{l.location ? ` · ${l.location}` : ''}</div>
        {l.meetingUrl && <a href={l.meetingUrl} target="_blank" rel="noopener noreferrer">Derse katıl</a>}
        {future && canRequest && (
          <div className="row">
            <button className="btn" onClick={() => setReq('reschedule')}>Erteleme iste</button>
            <button className="btn danger" onClick={() => setReq('cancel')}>İptal iste</button>
          </div>
        )}
        <div className="small muted">Talepler öğretmen onaylayana kadar takvimi değiştirmez.</div>
      </div>
      {req && (
        <RequestModal
          kind={req}
          onClose={() => setReq(null)}
          onSend={async (body) => {
            await api.post(`/portal/lessons/${l.id}/change-requests`, { studentId: l.forStudentId, kind: req, ...body });
            setReq(null);
            toast('Talebiniz öğretmene iletildi');
          }}
        />
      )}
    </>
  );
}

function RequestModal({ kind, onClose, onSend }: { kind: 'cancel' | 'reschedule'; onClose: () => void; onSend: (b: { message?: string; proposedStartsAt?: string }) => Promise<void> }) {
  const [message, setMessage] = useState('');
  const [when, setWhen] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={kind === 'cancel' ? 'İptal talebi' : 'Erteleme talebi'} onClose={onClose}>
      <div className="stack">
        {kind === 'reschedule' && <Field label="Önerdiğiniz zaman (isteğe bağlı)" htmlFor="pw"><input id="pw" type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>}
        <Field label="Mesaj (isteğe bağlı)" htmlFor="pm"><textarea id="pm" className="input" value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
        {err && <div className="alert danger">{err}</div>}
        <button className="btn primary" onClick={() => onSend({ message: message || undefined, proposedStartsAt: when ? new Date(when).toISOString() : undefined }).catch((e) => setErr(errorMessage(e)))}>Gönder</button>
      </div>
    </Modal>
  );
}

export function PortalAssignments() {
  const [studentId, setStudentId] = useState('');
  const q = useQuery({ queryKey: ['portal', 'assignments', studentId], queryFn: () => api.get<PortalAssignmentItem[]>(`/portal/assignments${studentId ? `?studentId=${studentId}` : ''}`) });
  return (
    <>
      <PageHeader title="Ödevler" actions={<ChildPicker value={studentId} onChange={setStudentId} />} />
      <div className="card">
        <Q q={q} empty={(d) => d.length === 0 && <Empty title="Ödev yok" icon={<BookOpen size={36} />} />}>
          {(d) => (
            <div className="list">
              {d.map((a) => (
                <Link key={a.recipientId} to={`/assignments/${a.id}?studentId=${a.studentId}`} className="list-item" style={{ color: 'inherit' }}>
                  <div className="grow">
                    <div className="title">{a.title}</div>
                    <div className="small muted">{a.teacherName} · Son tarih: {fmtDateTime(a.dueAt)}</div>
                  </div>
                  {a.late && <StatusBadge tone="danger">Gecikmiş</StatusBadge>}
                  <StatusBadge tone={recTone(a.status)}>{t(`rec.${a.status}`)}</StatusBadge>
                </Link>
              ))}
            </div>
          )}
        </Q>
      </div>
    </>
  );
}

interface PortalAssignmentDetail {
  id: string;
  studentId: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  links: string[];
  status: RecipientStatus;
  late: boolean;
  canSubmit: boolean;
  files: { id: string; name: string; isAnswerKey: boolean }[];
  answerKey: { text: string | null } | null;
  submissions: { id: string; version: number; text: string | null; submittedAt: string; files: { id: string; name: string }[] }[];
  feedback: { id: string; feedback: string | null; score: number | null; requestedResubmit: boolean; createdAt: string }[];
}

export function PortalAssignment() {
  const { id } = useParams();
  const studentId = new URLSearchParams(window.location.search).get('studentId') ?? '';
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['portal', 'assignment', id, studentId], queryFn: () => api.get<PortalAssignmentDetail>(`/portal/assignments/${id}${studentId ? `?studentId=${studentId}` : ''}`) });
  const [text, setText] = useState('');
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const submit = useMutation({
    mutationFn: () => api.post(`/portal/assignments/${id}/submissions`, { studentId: q.data!.studentId, text: text || null, fileIds: files.map((f) => f.id) }),
    onSuccess: () => {
      setText('');
      setFiles([]);
      void qc.invalidateQueries({ queryKey: ['portal'] });
      toast('Teslim edildi');
    },
  });
  const open = async (fileId: string) => window.open((await api.get<{ url: string }>(`/files/${fileId}/url`)).url, '_blank', 'noopener');
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const a = q.data!;
  return (
    <>
      <PageHeader title={a.title} subtitle={<span className="row">Son tarih: {fmtDateTime(a.dueAt)} <StatusBadge tone={recTone(a.status)}>{t(`rec.${a.status}`)}</StatusBadge>{a.late && <StatusBadge tone="danger">Gecikmiş</StatusBadge>}</span>} />
      <div className="grid grid-2">
        <div className="card stack">
          {a.description && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{a.description}</p>}
          {a.links.map((l) => <a key={l} href={l} target="_blank" rel="noopener noreferrer">{l}</a>)}
          <div className="row">{a.files.map((f) => <button key={f.id} className="badge" style={{ border: 0, cursor: 'pointer' }} onClick={() => open(f.id)}><FileText size={12} /> {f.name}{f.isAnswerKey ? ' (cevap anahtarı)' : ''}</button>)}</div>
          {a.answerKey?.text && <details open><summary>Cevap anahtarı</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{a.answerKey.text}</pre></details>}
          {a.feedback.length > 0 && (
            <div className="stack">
              <h3>Geri bildirim</h3>
              {a.feedback.map((f) => <div key={f.id} className="alert info">{f.feedback ?? '—'}{f.score !== null ? ` · Puan: ${f.score}` : ''}{f.requestedResubmit ? ' · Yeniden teslim istendi' : ''}</div>)}
            </div>
          )}
        </div>
        <div className="stack">
          {a.canSubmit && (
            <form className="card stack" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
              <h2>Teslim et</h2>
              <Field label="Cevabın" htmlFor="st"><textarea id="st" className="input" value={text} onChange={(e) => setText(e.target.value)} /></Field>
              <div className="row">{files.map((f) => <span key={f.id} className="badge"><FileText size={12} /> {f.name}</span>)}</div>
              <FilePicker purpose="submission" studentId={a.studentId} label="Fotoğraf veya PDF ekle" onUploaded={(f) => setFiles([...files, f])} />
              {submit.error && <div className="alert danger">{errorMessage(submit.error)}</div>}
              <button className="btn primary" disabled={submit.isPending || (!text.trim() && files.length === 0)}>{a.submissions.length ? 'Yeni sürüm teslim et' : 'Teslim et'}</button>
            </form>
          )}
          <div className="card">
            <h2 style={{ marginBottom: 8 }}>Teslimler</h2>
            {a.submissions.length === 0 ? <Empty title="Henüz teslim yok" /> : (
              <div className="list">
                {a.submissions.map((s) => (
                  <div key={s.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                    <div className="grow">
                      <div className="small muted">Sürüm {s.version} · {fmtDateTime(s.submittedAt)}</div>
                      {s.text && <div style={{ whiteSpace: 'pre-wrap' }}>{s.text}</div>}
                      <div className="row">{s.files.map((f) => <button key={f.id} className="badge" style={{ border: 0, cursor: 'pointer' }} onClick={() => open(f.id)}><FileText size={12} /> {f.name}</button>)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function PortalNotes() {
  const [studentId, setStudentId] = useState('');
  const notes = useQuery({ queryKey: ['portal', 'notes', studentId], queryFn: () => api.get<NoteDto[]>(`/portal/notes${studentId ? `?studentId=${studentId}` : ''}`) });
  const assessments = useQuery({
    queryKey: ['portal', 'assessments', studentId],
    queryFn: () => api.get<{ studentId: string; items: AssessmentDto[]; progress: { enoughData: boolean; minPoints: number; points: { date: string; value: number; title: string; unit: 'percent' | 'raw' }[] } }[]>(`/portal/assessments${studentId ? `?studentId=${studentId}` : ''}`),
  });
  return (
    <>
      <PageHeader title="Notlar ve değerlendirmeler" subtitle="Yalnızca sizinle paylaşılanlar" actions={<ChildPicker value={studentId} onChange={setStudentId} />} />
      <div className="grid grid-2">
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Notlar</h2>
          <Q q={notes} empty={(d) => d.length === 0 && <Empty title="Paylaşılan not yok" icon={<StickyNote size={36} />} />}>
            {(d) => (
              <div className="list">
                {d.map((n) => (
                  <div key={n.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                    <div className="grow">
                      <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
                      <div className="small muted">{fmtDate(n.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Q>
        </div>
        <div className="stack">
          <Q q={assessments}>
            {(d) =>
              d.map((g) => (
                <div key={g.studentId} className="card stack">
                  <h2>Değerlendirmeler</h2>
                  <ProgressChart points={g.progress.points} enough={g.progress.enoughData} min={g.progress.minPoints} />
                  {g.items.map((a) => (
                    <div key={a.id} className="row between">
                      <span>{a.title} <span className="small muted">{fmtDate(a.date)}</span>{a.feedback ? <div className="small">{a.feedback}</div> : null}</span>
                      {a.score !== null && <strong>{a.score}{a.maxScore ? ` / ${a.maxScore}` : ''}</strong>}
                    </div>
                  ))}
                  {g.items.length === 0 && <span className="muted small">Paylaşılan değerlendirme yok.</span>}
                </div>
              ))
            }
          </Q>
        </div>
      </div>
    </>
  );
}
