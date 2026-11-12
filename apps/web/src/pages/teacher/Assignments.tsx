import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, FileText, Paperclip, Plus } from 'lucide-react';
import { FILE_LIMITS, type RecipientStatus, type StudentDto } from '@derslik/shared';
import { api, errorMessage } from '../../api';
import { t } from '../../i18n';
import { fmtDateTime } from '../../format';
import { Empty, ErrorBox, Field, Modal, PageHeader, Q, Spinner, StatusBadge, useToast } from '../../ui';

interface ListItem {
  id: string;
  title: string;
  status: 'draft' | 'published';
  dueAt: string | null;
  counts: { total: number; submitted: number; reviewed: number };
}

interface Detail {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  links: string[];
  status: 'draft' | 'published';
  answerKeyText: string | null;
  answerKeyVisibility: 'hidden' | 'after_review' | 'at_date';
  answerKeyVisibleAt: string | null;
  files: { id: string; name: string; mime: string; size: number; isAnswerKey: boolean }[];
  recipients: { id: string; studentId: string; displayName: string; status: RecipientStatus; score: number | null; lastSubmittedAt: string | null; late: boolean }[];
}

export const recTone = (s: RecipientStatus) => (s === 'reviewed' ? 'ok' : s === 'submitted' ? 'info' : s === 'resubmit_requested' ? 'warn' : undefined);

export function Assignments() {
  const q = useQuery({ queryKey: ['assignments'], queryFn: () => api.get<ListItem[]>('/assignments') });
  return (
    <>
      <PageHeader title="Ödevler" actions={<Link to="/assignments/new" className="btn primary"><Plus size={18} /> Ödev ver</Link>} />
      <div className="card">
        <Q q={q} empty={(d) => d.length === 0 && <Empty title="Henüz ödev yok" icon={<ClipboardList size={36} />} />}>
          {(d) => (
            <div className="list">
              {d.map((a) => (
                <Link key={a.id} to={`/assignments/${a.id}`} className="list-item" style={{ color: 'inherit' }}>
                  <div className="grow">
                    <div className="title">{a.title}</div>
                    <div className="small muted">Son tarih: {fmtDateTime(a.dueAt)} · {a.counts.submitted} incelenecek · {a.counts.reviewed}/{a.counts.total} incelendi</div>
                  </div>
                  <StatusBadge tone={a.status === 'draft' ? 'warn' : 'info'}>{a.status === 'draft' ? 'Taslak' : 'Yayımlandı'}</StatusBadge>
                </Link>
              ))}
            </div>
          )}
        </Q>
      </div>
    </>
  );
}

export function FilePicker({ purpose, studentId, onUploaded, label = 'Dosya ekle' }: { purpose: string; studentId?: string; onUploaded: (f: { id: string; name: string }) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="stack">
      <label className="btn sm" style={{ alignSelf: 'flex-start' }}>
        <Paperclip size={16} /> {busy ? 'Yükleniyor…' : label}
        <input
          type="file"
          hidden
          accept={FILE_LIMITS.allowedMime.join(',')}
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setErr(null);
            if (file.size > FILE_LIMITS.maxBytes) return setErr('Dosya en fazla 15 MB olabilir');
            setBusy(true);
            try {
              const f = await api.uploadFile({ name: file.name, type: file.type, size: file.size, body: file }, purpose, studentId);
              onUploaded(f);
            } catch (x) {
              setErr(errorMessage(x));
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {err && <div className="alert danger small">{err}</div>}
    </div>
  );
}

export function NewAssignment() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const students = useQuery({ queryKey: ['students', 'active'], queryFn: () => api.get<StudentDto[]>('/students') });
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => api.get<{ id: string; name: string }[]>('/groups') });
  const [f, setF] = useState({
    title: '',
    description: '',
    due: '',
    groupId: params.get('groupId') ?? '',
    studentIds: params.get('studentId') ? [params.get('studentId')!] : ([] as string[]),
    link: '',
    answerKeyText: '',
    answerKeyVisibility: 'hidden' as Detail['answerKeyVisibility'],
    answerKeyVisibleAt: '',
  });
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [keyFiles, setKeyFiles] = useState<{ id: string; name: string }[]>([]);
  const m = useMutation({
    mutationFn: (publish: boolean) =>
      api.post<{ id: string }>('/assignments', {
        title: f.title,
        description: f.description || null,
        dueAt: f.due ? new Date(f.due).toISOString() : null,
        groupId: f.groupId || null,
        studentIds: f.studentIds,
        links: f.link ? [f.link] : [],
        fileIds: files.map((x) => x.id),
        answerKeyText: f.answerKeyText || null,
        answerKeyFileIds: keyFiles.map((x) => x.id),
        answerKeyVisibility: f.answerKeyVisibility,
        answerKeyVisibleAt: f.answerKeyVisibility === 'at_date' && f.answerKeyVisibleAt ? new Date(f.answerKeyVisibleAt).toISOString() : null,
        publish,
      }),
    onSuccess: (a, publish) => {
      void qc.invalidateQueries({ queryKey: ['assignments'] });
      toast(publish ? 'Ödev yayımlandı' : 'Taslak kaydedildi');
      nav(`/assignments/${a.id}`);
    },
  });
  const submit = (e: FormEvent) => e.preventDefault();
  return (
    <>
      <PageHeader title="Ödev ver" />
      <form className="card stack" onSubmit={submit}>
        <Field label="Başlık" htmlFor="t"><input id="t" className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Açıklama" htmlFor="d"><textarea id="d" className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid grid-2">
          <Field label="Grup" htmlFor="g">
            <select id="g" className="input" value={f.groupId} onChange={(e) => setF({ ...f, groupId: e.target.value })}>
              <option value="">—</option>
              {groups.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
          <Field label="Son tarih (isteğe bağlı)" hint="Son tarih yoksa gecikme hesaplanmaz" htmlFor="du"><input id="du" type="datetime-local" className="input" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
        </div>
        <fieldset style={{ border: 0, padding: 0 }}>
          <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Öğrenciler</legend>
          <div className="row">
            {students.data?.map((s) => (
              <label key={s.id} className="badge" style={{ cursor: 'pointer', padding: '6px 10px' }}>
                <input type="checkbox" checked={f.studentIds.includes(s.id)} onChange={(e) => setF({ ...f, studentIds: e.target.checked ? [...f.studentIds, s.id] : f.studentIds.filter((x) => x !== s.id) })} /> {s.displayName}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Bağlantı (isteğe bağlı)" htmlFor="l"><input id="l" type="url" pattern="https://.*" className="input" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} /></Field>
        <div className="stack">
          <strong className="small">Dosyalar ve fotoğraflar</strong>
          {files.map((x) => <span key={x.id} className="badge"><FileText size={12} /> {x.name}</span>)}
          <FilePicker purpose="assignment" onUploaded={(x) => setFiles([...files, x])} />
        </div>
        <details className="card" style={{ boxShadow: 'none' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Cevap anahtarı (ayrı ve erişim kontrollü)</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <Field label="Cevaplar" htmlFor="ak"><textarea id="ak" className="input" value={f.answerKeyText} onChange={(e) => setF({ ...f, answerKeyText: e.target.value })} /></Field>
            {keyFiles.map((x) => <span key={x.id} className="badge"><FileText size={12} /> {x.name}</span>)}
            <FilePicker purpose="answer_key" label="Cevap dosyası ekle" onUploaded={(x) => setKeyFiles([...keyFiles, x])} />
            <Field label="Öğrenci ne zaman görsün?" htmlFor="akv">
              <select id="akv" className="input" value={f.answerKeyVisibility} onChange={(e) => setF({ ...f, answerKeyVisibility: e.target.value as Detail['answerKeyVisibility'] })}>
                <option value="hidden">Gizli</option>
                <option value="after_review">Ödevi incelendikten sonra</option>
                <option value="at_date">Belirli tarihte</option>
              </select>
            </Field>
            {f.answerKeyVisibility === 'at_date' && <input type="datetime-local" className="input" aria-label="Görünür olacağı tarih" value={f.answerKeyVisibleAt} onChange={(e) => setF({ ...f, answerKeyVisibleAt: e.target.value })} />}
          </div>
        </details>
        {m.error && <div className="alert danger">{errorMessage(m.error)}</div>}
        <div className="row between">
          <button type="button" className="btn" disabled={m.isPending || !f.title} onClick={() => m.mutate(false)}>Taslak kaydet</button>
          <button type="button" className="btn primary" disabled={m.isPending || !f.title || (!f.groupId && f.studentIds.length === 0)} onClick={() => m.mutate(true)}>Yayımla</button>
        </div>
      </form>
    </>
  );
}

export function AssignmentDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['assignment', id], queryFn: () => api.get<Detail>(`/assignments/${id}`) });
  const [reviewing, setReviewing] = useState<string | null>(null);
  const publish = useMutation({
    mutationFn: () => api.post(`/assignments/${id}/publish`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignment', id] });
      void qc.invalidateQueries({ queryKey: ['assignments'] });
      toast('Ödev yayımlandı; öğrencilere bildirim gitti');
    },
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const a = q.data!;
  return (
    <>
      <PageHeader
        title={a.title}
        subtitle={<span className="row">Son tarih: {fmtDateTime(a.dueAt)} <StatusBadge tone={a.status === 'draft' ? 'warn' : 'info'}>{a.status === 'draft' ? 'Taslak — öğrenciler görmez' : 'Yayımlandı'}</StatusBadge></span>}
        actions={a.status === 'draft' && <button className="btn primary" onClick={() => publish.mutate()} disabled={publish.isPending}>Yayımla</button>}
      />
      <div className="grid grid-2">
        <div className="card stack">
          {a.description && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{a.description}</p>}
          {a.links.map((l) => <a key={l} href={l} target="_blank" rel="noopener noreferrer">{l}</a>)}
          <div className="row">
            {a.files.map((f) => (
              <button key={f.id} className="badge" style={{ border: 0, cursor: 'pointer' }} onClick={async () => window.open((await api.get<{ url: string }>(`/files/${f.id}/url`)).url, '_blank', 'noopener')}>
                <FileText size={12} /> {f.name}{f.isAnswerKey ? ' (cevap anahtarı)' : ''}
              </button>
            ))}
          </div>
          {a.answerKeyText && (
            <details>
              <summary>Cevap anahtarı — {{ hidden: 'öğrenciye gizli', after_review: 'incelemeden sonra görünür', at_date: `görünür: ${fmtDateTime(a.answerKeyVisibleAt)}` }[a.answerKeyVisibility]}</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{a.answerKeyText}</pre>
            </details>
          )}
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Öğrenciler</h2>
          <div className="list">
            {a.recipients.map((r) => (
              <div key={r.id} className="list-item">
                <div className="grow">
                  <div className="title">{r.displayName}</div>
                  <div className="small muted">{r.lastSubmittedAt ? `Teslim: ${fmtDateTime(r.lastSubmittedAt)}` : 'Teslim yok'}{r.score !== null ? ` · Puan: ${r.score}` : ''}</div>
                </div>
                {r.late && <StatusBadge tone="danger">Gecikmiş</StatusBadge>}
                <StatusBadge tone={recTone(r.status)}>{t(`rec.${r.status}`)}</StatusBadge>
                {r.status !== 'assigned' && <button className="btn sm" onClick={() => setReviewing(r.id)}>İncele</button>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {reviewing && <Review recipientId={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); void qc.invalidateQueries({ queryKey: ['assignment', id] }); toast('Geri bildirim kaydedildi'); }} />}
    </>
  );
}

function Review({ recipientId, onClose, onDone }: { recipientId: string; onClose: () => void; onDone: () => void }) {
  const q = useQuery({
    queryKey: ['recipient', recipientId],
    queryFn: () => api.get<{ submissions: { id: string; version: number; text: string | null; submittedAt: string; files: { id: string; name: string }[] }[]; feedback: { id: string; feedback: string | null; score: number | null; requestedResubmit: boolean; createdAt: string }[] }>(`/recipients/${recipientId}`),
  });
  const [feedback, setFeedback] = useState('');
  const [score, setScore] = useState('');
  const m = useMutation({
    mutationFn: (requestResubmit: boolean) => api.post(`/recipients/${recipientId}/review`, { feedback: feedback || null, score: score === '' ? null : Number(score), requestResubmit }),
    onSuccess: onDone,
  });
  return (
    <Modal title="Teslimi incele" onClose={onClose}>
      <Q q={q}>
        {(d) => (
          <div className="stack">
            {d.submissions.map((s) => (
              <div key={s.id} className="card" style={{ boxShadow: 'none' }}>
                <div className="small muted">Sürüm {s.version} · {fmtDateTime(s.submittedAt)}</div>
                {s.text && <p style={{ whiteSpace: 'pre-wrap' }}>{s.text}</p>}
                <div className="row">
                  {s.files.map((f) => (
                    <button key={f.id} className="badge" style={{ border: 0, cursor: 'pointer' }} onClick={async () => window.open((await api.get<{ url: string }>(`/files/${f.id}/url`)).url, '_blank', 'noopener')}><FileText size={12} /> {f.name}</button>
                  ))}
                </div>
              </div>
            ))}
            {d.feedback.length > 0 && (
              <div className="small muted">Önceki geri bildirimler: {d.feedback.map((f) => f.feedback).filter(Boolean).join(' · ')}</div>
            )}
            <Field label="Geri bildirim" htmlFor="fb"><textarea id="fb" className="input" value={feedback} onChange={(e) => setFeedback(e.target.value)} /></Field>
            <Field label="Puan (isteğe bağlı)" htmlFor="sc"><input id="sc" type="number" className="input" value={score} onChange={(e) => setScore(e.target.value)} /></Field>
            {m.error && <div className="alert danger">{errorMessage(m.error)}</div>}
            <div className="row between">
              <button className="btn" onClick={() => m.mutate(true)} disabled={m.isPending}>Yeniden teslim iste</button>
              <button className="btn primary" onClick={() => m.mutate(false)} disabled={m.isPending}>İncelendi</button>
            </div>
          </div>
        )}
      </Q>
    </Modal>
  );
}
