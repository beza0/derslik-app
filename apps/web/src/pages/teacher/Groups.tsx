import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Copy, Plus, UsersRound } from 'lucide-react';
import type { StudentDto } from '@derslik/shared';
import { api, errorMessage } from '../../api';
import { Avatar, Empty, Field, Modal, PageHeader, Q, Spinner, ErrorBox, useToast } from '../../ui';
import { LessonForm } from './LessonForm';

interface GroupDetailDto {
  id: string;
  name: string;
  description: string | null;
  members: { studentId: string; displayName: string }[];
}

export function Groups() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['groups'], queryFn: () => api.get<{ id: string; name: string; memberCount: number }[]>('/groups') });
  const students = useQuery({ queryKey: ['students', 'active'], queryFn: () => api.get<StudentDto[]>('/students') });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const create = useMutation({
    mutationFn: () => api.post('/groups', { name, studentIds: sel }),
    onSuccess: () => {
      setOpen(false);
      setName('');
      setSel([]);
      void qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });
  return (
    <>
      <PageHeader title="Gruplar" subtitle="Bir öğrenci birden fazla grupta olabilir; paket sınırında bir kez sayılır." actions={<button className="btn primary" onClick={() => setOpen(true)}><Plus size={18} /> Grup</button>} />
      <div className="card">
        <Q q={q} empty={(d) => d.length === 0 && <Empty title="Henüz grup yok" icon={<UsersRound size={36} />} />}>
          {(d) => (
            <div className="list">
              {d.map((g) => (
                <Link key={g.id} to={`/groups/${g.id}`} className="list-item" style={{ color: 'inherit' }}>
                  <Avatar id={g.id} name={g.name} />
                  <div className="grow title">{g.name}</div>
                  <span className="badge">{g.memberCount} öğrenci</span>
                </Link>
              ))}
            </div>
          )}
        </Q>
      </div>
      {open && (
        <Modal title="Yeni grup" onClose={() => setOpen(false)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <Field label="Grup adı" htmlFor="gn"><input id="gn" className="input" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <fieldset className="stack" style={{ border: 0, padding: 0 }}>
              <legend className="small muted">Öğrenciler</legend>
              {students.data?.map((s) => (
                <label key={s.id} className="row"><input type="checkbox" checked={sel.includes(s.id)} onChange={(e) => setSel(e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id))} /> {s.displayName}</label>
              ))}
            </fieldset>
            {create.error && <div className="alert danger">{errorMessage(create.error)}</div>}
            <button className="btn primary" disabled={create.isPending}>Oluştur</button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function GroupDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const g = useQuery({ queryKey: ['group', id], queryFn: () => api.get<GroupDetailDto>(`/groups/${id}`) });
  const students = useQuery({ queryKey: ['students', 'active'], queryFn: () => api.get<StudentDto[]>('/students') });
  const [adding, setAdding] = useState(false);
  const [change, setChange] = useState<{ add: string[]; remove: string[] } | null>(null);
  const [invites, setInvites] = useState<{ displayName: string; invite: { code: string } | null; skipped?: string }[] | null>(null);

  if (g.isLoading) return <Spinner />;
  if (g.error) return <ErrorBox error={g.error} />;
  const grp = g.data!;
  const memberIds = new Set(grp.members.map((m) => m.studentId));

  return (
    <>
      <PageHeader
        title={grp.name}
        subtitle={`${grp.members.length} öğrenci`}
        actions={
          <>
            <button className="btn" onClick={async () => setInvites(await api.post(`/groups/${grp.id}/invites`, { ttlDays: 7 }))}><Copy size={18} /> Toplu davet</button>
            <button className="btn primary" onClick={() => setAdding(true)}><CalendarPlus size={18} /> Grup dersi</button>
          </>
        }
      />
      <div className="card">
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2>Üyeler</h2>
          <button className="btn sm" onClick={() => setChange({ add: [], remove: [] })}>Üyeleri düzenle</button>
        </div>
        <div className="list">
          {grp.members.map((m) => (
            <Link key={m.studentId} to={`/students/${m.studentId}`} className="list-item" style={{ color: 'inherit' }}>
              <Avatar id={m.studentId} name={m.displayName} />
              <div className="grow title">{m.displayName}</div>
            </Link>
          ))}
        </div>
      </div>
      {adding && <LessonForm onClose={() => setAdding(false)} preset={{ groupId: grp.id }} />}
      {change && (
        <MembershipModal
          groupId={grp.id}
          students={students.data ?? []}
          memberIds={memberIds}
          onClose={() => setChange(null)}
          onDone={() => {
            setChange(null);
            void qc.invalidateQueries({ queryKey: ['group', id] });
            void qc.invalidateQueries({ queryKey: ['groups'] });
            toast('Üyelik güncellendi');
          }}
        />
      )}
      {invites && (
        <Modal title="Grup davetleri" onClose={() => setInvites(null)}>
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>Her öğrenci için ayrı, 7 gün geçerli davet. Kendiniz paylaşın; otomatik mesaj gönderilmez.</p>
            <textarea
              className="input"
              readOnly
              style={{ minHeight: 160 }}
              value={invites.map((i) => (i.invite ? `${i.displayName}: ${window.location.origin}/invite/${i.invite.code}` : `${i.displayName}: hesabı zaten bağlı`)).join('\n')}
            />
            <button className="btn primary" onClick={async () => { await navigator.clipboard.writeText(invites.map((i) => (i.invite ? `${i.displayName}: ${window.location.origin}/invite/${i.invite.code}` : '')).filter(Boolean).join('\n')); toast('Kopyalandı'); }}>Tümünü kopyala</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function MembershipModal({ groupId, students, memberIds, onClose, onDone }: { groupId: string; students: StudentDto[]; memberIds: Set<string>; onClose: () => void; onDone: () => void }) {
  const [sel, setSel] = useState(new Set(memberIds));
  const add = [...sel].filter((x) => !memberIds.has(x));
  const remove = [...memberIds].filter((x) => !sel.has(x));
  const [preview, setPreview] = useState<{ futureLessons: { when: string }[]; openAssignments: { title: string }[]; keptBecauseSubmitted: number } | null>(null);
  const [applyLessons, setApplyLessons] = useState(true);
  const [applyHw, setApplyHw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="Üyeleri düzenle" onClose={onClose}>
      <div className="stack">
        {!preview ? (
          <>
            {students.map((s) => (
              <label key={s.id} className="row"><input type="checkbox" checked={sel.has(s.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(s.id); else n.delete(s.id); setSel(n); }} /> {s.displayName}</label>
            ))}
            <button className="btn primary" disabled={!add.length && !remove.length} onClick={async () => { try { setPreview(await api.post(`/groups/${groupId}/members/preview`, { add, remove })); } catch (e) { setErr(errorMessage(e)); } }}>Etkisini göster</button>
          </>
        ) : (
          <>
            <div className="alert info">{add.length} öğrenci eklenecek, {remove.length} öğrenci çıkarılacak. Geçmiş dersler ve katılımlar değişmez.</div>
            <label className="row"><input type="checkbox" checked={applyLessons} onChange={(e) => setApplyLessons(e.target.checked)} /> Gelecek {preview.futureLessons.length} grup dersine de uygula</label>
            <label className="row"><input type="checkbox" checked={applyHw} onChange={(e) => setApplyHw(e.target.checked)} /> Açık {preview.openAssignments.length} ödeve de uygula{preview.keptBecauseSubmitted ? ` (teslim yapılmış ${preview.keptBecauseSubmitted} kayıt korunur)` : ''}</label>
            <button className="btn primary" onClick={async () => { try { await api.post(`/groups/${groupId}/members`, { add, remove, applyToFutureLessons: applyLessons, applyToOpenAssignments: applyHw }); onDone(); } catch (e) { setErr(errorMessage(e)); } }}>Onayla</button>
          </>
        )}
        {err && <div className="alert danger">{err}</div>}
      </div>
    </Modal>
  );
}
