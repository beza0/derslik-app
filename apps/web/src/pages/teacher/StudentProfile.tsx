import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, CalendarPlus, Copy, Lock, Trash2, Users } from 'lucide-react';
import type { AssessmentDto, InviteDto, LessonDto, NoteDto, StudentDto, Visibility } from '@derslik/shared';
import { api, errorMessage } from '../../api';
import { useAuth } from '../../auth';
import { t } from '../../i18n';
import { fmtDate, fmtDateTime, fmtRange } from '../../format';
import { Avatar, Empty, ErrorBox, Field, Modal, PageHeader, Q, Spinner, StatusBadge, Tabs, useToast } from '../../ui';
import { LessonForm } from './LessonForm';

type Tab = 'overview' | 'lessons' | 'homework' | 'notes' | 'assessments' | 'links';

export function StudentProfile() {
  const { id } = useParams();
  const { me } = useAuth();
  const zone = me!.contexts.teacher!.timezone;
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const s = useQuery({ queryKey: ['student', id], queryFn: () => api.get<StudentDto & { groups: { id: string; name: string }[] }>(`/students/${id}`) });

  const archive = useMutation({
    mutationFn: (to: 'archive' | 'unarchive') => api.post(`/students/${id}/${to}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['student', id] });
      void qc.invalidateQueries({ queryKey: ['students'] });
      void qc.invalidateQueries({ queryKey: ['entitlement'] });
    },
    onError: (e) => toast(errorMessage(e)),
  });

  if (s.isLoading) return <Spinner />;
  if (s.error) return <ErrorBox error={s.error} onRetry={() => s.refetch()} />;
  const st = s.data!;

  return (
    <>
      <PageHeader
        title={st.displayName}
        subtitle={
          <span className="row">
            <Avatar id={st.id} name={st.displayName} size={24} />
            {[st.level, st.subject, st.goal].filter(Boolean).join(' · ') || 'Ek bilgi yok'}
            {st.status === 'archived' && <StatusBadge tone="warn">Arşivde</StatusBadge>}
            {st.groups.map((g) => (
              <Link key={g.id} to={`/groups/${g.id}`} className="badge info"><Users size={12} /> {g.name}</Link>
            ))}
          </span>
        }
        actions={
          <>
            {st.status === 'active' ? (
              <>
                <button className="btn primary" onClick={() => setAdding(true)}><CalendarPlus size={18} /> Ders</button>
                <button className="btn" onClick={() => archive.mutate('archive')}><Archive size={18} /> Arşivle</button>
              </>
            ) : (
              <button className="btn" onClick={() => archive.mutate('unarchive')}><ArchiveRestore size={18} /> Arşivden çıkar</button>
            )}
            <button className="btn danger" onClick={() => setDeleting(true)} aria-label="Kalıcı sil"><Trash2 size={18} /></button>
          </>
        }
      />
      {st.status === 'archived' && <div className="alert warn" style={{ marginBottom: 12 }}>Arşivdeki öğrencinin geçmişi korunur; yeni ders, not veya ödev için önce arşivden çıkarın.</div>}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Genel' },
          { id: 'lessons', label: 'Ders geçmişi' },
          { id: 'homework', label: 'Ödevler' },
          { id: 'notes', label: 'Notlar' },
          { id: 'assessments', label: 'Değerlendirmeler' },
          { id: 'links', label: 'Hesap ve veli' },
        ]}
      />
      {tab === 'overview' && <LessonsTab id={st.id} zone={zone} which="upcoming" />}
      {tab === 'lessons' && <LessonsTab id={st.id} zone={zone} which="past" />}
      {tab === 'homework' && <HomeworkTab id={st.id} />}
      {tab === 'notes' && <NotesTab id={st.id} active={st.status === 'active'} />}
      {tab === 'assessments' && <AssessmentsTab id={st.id} active={st.status === 'active'} />}
      {tab === 'links' && <LinksTab student={st} />}
      {adding && <LessonForm onClose={() => setAdding(false)} preset={{ studentId: st.id }} />}
      {deleting && (
        <DeleteStudent
          name={st.displayName}
          onClose={() => setDeleting(false)}
          onDelete={async (confirmName) => {
            await api.post(`/students/${st.id}/delete`, { confirmName });
            void qc.invalidateQueries({ queryKey: ['students'] });
            toast('Öğrenci kalıcı olarak silindi');
            nav('/students');
          }}
        />
      )}
    </>
  );
}

function DeleteStudent({ name, onClose, onDelete }: { name: string; onClose: () => void; onDelete: (n: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="Öğrenciyi kalıcı sil" onClose={onClose}>
      <div className="stack">
        <div className="alert danger">
          Bu işlem geri alınamaz. Öğrencinin notları, değerlendirmeleri, ödev teslimleri, birebir dersleri ve bağlantıları silinir. Grup dersleri kalır. Yalnızca geçmişi saklamak istiyorsanız arşivleyin.
        </div>
        <Field label={`Onaylamak için "${name}" yazın`} htmlFor="cn">
          <input id="cn" className="input" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        {err && <div className="alert danger">{err}</div>}
        <div className="row between">
          <button className="btn" onClick={onClose}>Vazgeç</button>
          <button className="btn danger" disabled={value.trim() !== name.trim()} onClick={() => onDelete(value).catch((e) => setErr(errorMessage(e)))}>Kalıcı sil</button>
        </div>
      </div>
    </Modal>
  );
}

function LessonsTab({ id, zone, which }: { id: string; zone: string; which: 'upcoming' | 'past' }) {
  const q = useQuery({ queryKey: ['lessons', id, which], queryFn: () => api.get<LessonDto[]>(`/students/${id}/lessons?when=${which}`) });
  return (
    <div className="card">
      <h2 style={{ marginBottom: 8 }}>{which === 'upcoming' ? 'Yaklaşan dersler' : 'Geçmiş dersler'}</h2>
      <Q q={q} empty={(d) => d.length === 0 && <Empty title="Ders yok" />}>
        {(d) => (
          <div className="list">
            {d.map((l) => (
              <Link key={l.id} to={`/lessons/${l.id}`} className="list-item" style={{ color: 'inherit' }}>
                <div className="grow">
                  <div className="title">{fmtRange(l.startsAt, l.endsAt, zone)}</div>
                  {l.topicsCovered && <div className="small muted">İşlenen: {l.topicsCovered}</div>}
                </div>
                <StatusBadge tone={l.status === 'done' ? 'ok' : l.status === 'cancelled' ? 'danger' : 'info'}>{t(`status.${l.status}`)}</StatusBadge>
              </Link>
            ))}
          </div>
        )}
      </Q>
    </div>
  );
}

function HomeworkTab({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['assignments', { studentId: id }], queryFn: () => api.get<{ id: string; title: string; status: string; dueAt: string | null }[]>(`/assignments?studentId=${id}`) });
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2>Ödevler</h2>
        <Link to={`/assignments/new?studentId=${id}`} className="btn sm">Ödev ver</Link>
      </div>
      <Q q={q} empty={(d) => d.length === 0 && <Empty title="Ödev yok" />}>
        {(d) => (
          <div className="list">
            {d.map((a) => (
              <Link key={a.id} to={`/assignments/${a.id}`} className="list-item" style={{ color: 'inherit' }}>
                <div className="grow">
                  <div className="title">{a.title}</div>
                  <div className="small muted">Son tarih: {fmtDateTime(a.dueAt)}</div>
                </div>
                <StatusBadge tone={a.status === 'draft' ? 'warn' : 'info'}>{a.status === 'draft' ? 'Taslak' : 'Yayımlandı'}</StatusBadge>
              </Link>
            ))}
          </div>
        )}
      </Q>
    </div>
  );
}

export function VisibilityBadge({ v }: { v: Visibility }) {
  return v === 'private' ? (
    <StatusBadge><Lock size={12} aria-hidden /> {t('vis.private')}</StatusBadge>
  ) : (
    <StatusBadge tone="info">{t(`vis.${v}`)}</StatusBadge>
  );
}

function NotesTab({ id, active }: { id: string; active: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notes', id], queryFn: () => api.get<NoteDto[]>(`/students/${id}/notes`) });
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const add = useMutation({
    mutationFn: () => api.post('/notes', { studentId: id, body, visibility }),
    onSuccess: () => {
      setBody('');
      setVisibility('private');
      void qc.invalidateQueries({ queryKey: ['notes', id] });
    },
  });
  const change = useMutation({
    mutationFn: (x: { id: string; visibility: Visibility }) => api.patch(`/notes/${x.id}`, { visibility: x.visibility }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notes', id] }),
  });
  return (
    <div className="stack">
      {active && (
        <form
          className="card stack"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Field label="Yeni not" htmlFor="nb">
            <textarea id="nb" className="input" required value={body} onChange={(e) => setBody(e.target.value)} placeholder="Gözlem, ders özeti, güçlü/zayıf yön…" />
          </Field>
          <div className="row between">
            <select className="input" style={{ width: 'auto' }} value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)} aria-label="Kimler görebilir">
              <option value="private">{t('vis.private')}</option>
              <option value="student">{t('vis.student')}</option>
              <option value="student_guardian">{t('vis.student_guardian')}</option>
            </select>
            <button className="btn primary" disabled={add.isPending}>Kaydet</button>
          </div>
          {add.error && <div className="alert danger">{errorMessage(add.error)}</div>}
        </form>
      )}
      <div className="card">
        <Q q={q} empty={(d) => d.length === 0 && <Empty title="Not yok" />}>
          {(d) => (
            <div className="list">
              {d.map((n) => (
                <div key={n.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
                    <div className="small muted">{fmtDateTime(n.createdAt)}</div>
                  </div>
                  <div className="stack" style={{ alignItems: 'flex-end' }}>
                    <VisibilityBadge v={n.visibility} />
                    <select className="input" style={{ minHeight: 30, padding: '2px 6px', fontSize: 12, width: 'auto' }} value={n.visibility} onChange={(e) => change.mutate({ id: n.id, visibility: e.target.value as Visibility })} aria-label="Görünürlüğü değiştir">
                      <option value="private">{t('vis.private')}</option>
                      <option value="student">{t('vis.student')}</option>
                      <option value="student_guardian">{t('vis.student_guardian')}</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Q>
      </div>
    </div>
  );
}

export function ProgressChart({ points, enough, min }: { points: { date: string; value: number; title: string; unit: 'percent' | 'raw' }[]; enough: boolean; min: number }) {
  if (!enough) return <div className="alert info">Gelişim grafiği için en az {min} sayısal değerlendirme gerekiyor. Şu an {points.length} kayıt var; eğilim gösterilmiyor.</div>;
  const w = 600;
  const h = 180;
  const max = Math.max(...points.map((p) => p.value), points[0]!.unit === 'percent' ? 100 : 1);
  const x = (i: number) => 30 + (i * (w - 50)) / Math.max(points.length - 1, 1);
  const y = (v: number) => h - 24 - (v / max) * (h - 40);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Değerlendirme puanları grafiği">
      <polyline fill="none" stroke="var(--primary)" strokeWidth="2.5" points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="4" fill="var(--primary)" />
          <text x={x(i)} y={y(p.value) - 8} fontSize="11" textAnchor="middle" fill="var(--text)">{p.value}{p.unit === 'percent' ? '%' : ''}</text>
          <text x={x(i)} y={h - 6} fontSize="10" textAnchor="middle" fill="var(--text-2)">{p.date.slice(5)}</text>
        </g>
      ))}
    </svg>
  );
}

function AssessmentsTab({ id, active }: { id: string; active: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['assessments', id], queryFn: () => api.get<AssessmentDto[]>(`/students/${id}/assessments`) });
  const p = useQuery({ queryKey: ['progress', id], queryFn: () => api.get<{ enoughData: boolean; minPoints: number; points: { date: string; value: number; title: string; unit: 'percent' | 'raw' }[] }>(`/students/${id}/progress`) });
  const [f, setF] = useState({ title: '', date: new Date().toISOString().slice(0, 10), score: '', maxScore: '', feedback: '', visibility: 'private' as Visibility });
  const add = useMutation({
    mutationFn: () =>
      api.post('/assessments', {
        studentId: id,
        title: f.title,
        date: f.date,
        score: f.score === '' ? null : Number(f.score),
        maxScore: f.maxScore === '' ? null : Number(f.maxScore),
        feedback: f.feedback || null,
        visibility: f.visibility,
      }),
    onSuccess: () => {
      setF({ ...f, title: '', score: '', maxScore: '', feedback: '' });
      void qc.invalidateQueries({ queryKey: ['assessments', id] });
      void qc.invalidateQueries({ queryKey: ['progress', id] });
    },
  });
  return (
    <div className="stack">
      <div className="card">
        <h2 style={{ marginBottom: 8 }}>Gelişim</h2>
        {p.data && <ProgressChart points={p.data.points} enough={p.data.enoughData} min={p.data.minPoints} />}
      </div>
      {active && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <div className="grid grid-3">
            <Field label="Başlık" htmlFor="at"><input id="at" className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Deneme sınavı" /></Field>
            <Field label="Tarih" htmlFor="ad"><input id="ad" type="date" className="input" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Puan / en yüksek (isteğe bağlı)" htmlFor="as">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input id="as" type="number" className="input" value={f.score} onChange={(e) => setF({ ...f, score: e.target.value })} />
                <input type="number" className="input" aria-label="En yüksek puan" value={f.maxScore} onChange={(e) => setF({ ...f, maxScore: e.target.value })} />
              </div>
            </Field>
          </div>
          <Field label="Geri bildirim" htmlFor="af"><textarea id="af" className="input" value={f.feedback} onChange={(e) => setF({ ...f, feedback: e.target.value })} /></Field>
          <div className="row between">
            <select className="input" style={{ width: 'auto' }} value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value as Visibility })} aria-label="Kimler görebilir">
              <option value="private">{t('vis.private')}</option>
              <option value="student">{t('vis.student')}</option>
              <option value="student_guardian">{t('vis.student_guardian')}</option>
            </select>
            <button className="btn primary" disabled={add.isPending}>Ekle</button>
          </div>
        </form>
      )}
      <div className="card">
        <Q q={q} empty={(d) => d.length === 0 && <Empty title="Değerlendirme yok" />}>
          {(d) => (
            <div className="list">
              {d.map((a) => (
                <div key={a.id} className="list-item">
                  <div className="grow">
                    <div className="title">{a.title}</div>
                    <div className="small muted">{fmtDate(a.date)}{a.feedback ? ` · ${a.feedback}` : ''}</div>
                  </div>
                  {a.score !== null && <strong>{a.score}{a.maxScore ? ` / ${a.maxScore}` : ''}</strong>}
                  <VisibilityBadge v={a.visibility} />
                </div>
              ))}
            </div>
          )}
        </Q>
      </div>
    </div>
  );
}

function LinksTab({ student }: { student: StudentDto }) {
  const qc = useQueryClient();
  const toast = useToast();
  const invites = useQuery({ queryKey: ['invites', student.id], queryFn: () => api.get<InviteDto[]>(`/students/${student.id}/invites`) });
  const guardians = useQuery({ queryKey: ['guardians', student.id], queryFn: () => api.get<{ id: string; name: string; canRequestChanges: boolean }[]>(`/students/${student.id}/guardians`) });
  const [created, setCreated] = useState<InviteDto | null>(null);
  const create = useMutation({
    mutationFn: (x: { kind: 'student' | 'guardian'; canRequestChanges?: boolean }) => api.post<InviteDto>(`/students/${student.id}/invites`, { ttlDays: 7, ...x }),
    onSuccess: (i) => {
      setCreated(i);
      void qc.invalidateQueries({ queryKey: ['invites', student.id] });
    },
    onError: (e) => toast(errorMessage(e)),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['invites', student.id] });
    void qc.invalidateQueries({ queryKey: ['guardians', student.id] });
    void qc.invalidateQueries({ queryKey: ['student', student.id] });
  };
  const link = created ? `${window.location.origin}/invite/${created.code}` : '';

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Öğrenci hesabı</h2>
        {student.hasAccount ? (
          <div className="row between">
            <StatusBadge tone="ok">Hesap bağlı</StatusBadge>
            <button className="btn sm danger" onClick={async () => { await api.del(`/students/${student.id}/account-link`); refresh(); toast('Bağlantı kaldırıldı'); }}>Bağlantıyı kaldır</button>
          </div>
        ) : (
          <div className="row between">
            <span className="muted small">Öğrencinin hesap açması zorunlu değil. Bağlanmak isterse davet gönderin.</span>
            <button className="btn sm primary" onClick={() => create.mutate({ kind: 'student' })} disabled={student.status !== 'active'}>Öğrenci daveti oluştur</button>
          </div>
        )}
      </div>
      <div className="card stack">
        <div className="row between">
          <h2>Veliler</h2>
          <div className="row">
            <button className="btn sm" onClick={() => create.mutate({ kind: 'guardian', canRequestChanges: false })} disabled={student.status !== 'active'}>Veli daveti</button>
            <button className="btn sm" onClick={() => create.mutate({ kind: 'guardian', canRequestChanges: true })} disabled={student.status !== 'active'}>Talep izinli veli daveti</button>
          </div>
        </div>
        <Q q={guardians} empty={(d) => d.length === 0 && <span className="muted small">Bağlı veli yok.</span>}>
          {(d) => (
            <div className="list">
              {d.map((g) => (
                <div key={g.id} className="list-item">
                  <div className="grow title">{g.name}</div>
                  <label className="row small">
                    <input type="checkbox" checked={g.canRequestChanges} onChange={async (e) => { await api.patch(`/students/${student.id}/guardians/${g.id}`, { canRequestChanges: e.target.checked }); refresh(); }} />
                    İptal/erteleme talebi gönderebilir
                  </label>
                  <button className="btn sm danger" onClick={async () => { await api.del(`/students/${student.id}/guardians/${g.id}`); refresh(); }}>Kaldır</button>
                </div>
              ))}
            </div>
          )}
        </Q>
      </div>
      <div className="card">
        <h2 style={{ marginBottom: 8 }}>Davetler</h2>
        <Q q={invites} empty={(d) => d.length === 0 && <span className="muted small">Davet yok.</span>}>
          {(d) => (
            <div className="list">
              {d.map((i) => (
                <div key={i.id} className="list-item">
                  <div className="grow">
                    <div className="title">{i.kind === 'student' ? 'Öğrenci daveti' : 'Veli daveti'}</div>
                    <div className="small muted">Son geçerlilik: {fmtDateTime(i.expiresAt)}</div>
                  </div>
                  <StatusBadge tone={i.status === 'pending' ? 'info' : i.status === 'accepted' ? 'ok' : undefined}>
                    {{ pending: 'Bekliyor', accepted: 'Kabul edildi', revoked: 'İptal', expired: 'Süresi doldu' }[i.status]}
                  </StatusBadge>
                  {i.status === 'pending' && <button className="btn sm" onClick={async () => { await api.del(`/invites/${i.id}`); refresh(); }}>İptal et</button>}
                </div>
              ))}
            </div>
          )}
        </Q>
      </div>
      {created && (
        <Modal title="Davet oluşturuldu" onClose={() => setCreated(null)}>
          <div className="stack">
            <p style={{ margin: 0 }}>Kodu veya bağlantıyı kendiniz paylaşın (WhatsApp, e-posta…). Uygulama otomatik mesaj göndermez. Kod 7 gün geçerli ve tek kullanımlık; bu pencere kapandıktan sonra tekrar gösterilmez.</p>
            <Field label="Davet kodu"><input className="input" readOnly value={created.code} onFocus={(e) => e.target.select()} /></Field>
            <Field label="Bağlantı"><input className="input" readOnly value={link} onFocus={(e) => e.target.select()} /></Field>
            <button className="btn primary" onClick={async () => { await navigator.clipboard.writeText(link); toast('Bağlantı kopyalandı'); }}><Copy size={16} /> Bağlantıyı kopyala</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
