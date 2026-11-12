import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, Users } from 'lucide-react';
import { ApiError, type EntitlementDto, type StudentDto } from '@derslik/shared';
import { api } from '../../api';
import { Avatar, Empty, Field, Modal, PageHeader, Q, StatusBadge, Tabs, useToast } from '../../ui';

export function Students() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const [q, setQ] = useState('');
  const students = useQuery({ queryKey: ['students', status], queryFn: () => api.get<StudentDto[]>(`/students?status=${status}`) });
  const ent = useQuery({ queryKey: ['entitlement'], queryFn: () => api.get<EntitlementDto>('/billing/entitlement') });
  const adding = params.get('new') === '1';
  const filtered = (students.data ?? []).filter((s) => s.displayName.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')));

  return (
    <>
      <PageHeader
        title="Öğrenciler"
        subtitle={ent.data && `${ent.data.activeStudentCount} / ${ent.data.activeStudentLimit} aktif öğrenci (${ent.data.planName})`}
        actions={<button className="btn primary" onClick={() => setParams({ new: '1' })}><UserPlus size={18} /> Öğrenci ekle</button>}
      />
      <Tabs tabs={[{ id: 'active', label: 'Aktif' }, { id: 'archived', label: 'Arşiv' }]} value={status} onChange={setStatus} />
      <div className="row" style={{ marginBottom: 12 }}>
        <Search size={18} aria-hidden />
        <input className="input" style={{ maxWidth: 320 }} placeholder="Ara" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Öğrenci ara" />
      </div>
      <div className="card">
        <Q q={students} empty={(d) => d.length === 0 && <Empty title={status === 'active' ? 'Henüz öğrenci yok' : 'Arşivde öğrenci yok'} icon={<Users size={36} />}>Yalnızca adla ekleyebilirsiniz.</Empty>}>
          {() => (
            <div className="list">
              {filtered.map((s) => (
                <Link key={s.id} to={`/students/${s.id}`} className="list-item" style={{ color: 'inherit' }}>
                  <Avatar id={s.id} name={s.displayName} />
                  <div className="grow">
                    <div className="title">{s.displayName}</div>
                    <div className="small muted">{[s.level, s.subject, s.goal].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                  {s.hasAccount ? <StatusBadge tone="ok">Hesap bağlı</StatusBadge> : <StatusBadge>Hesap yok</StatusBadge>}
                  {s.guardianCount > 0 && <StatusBadge tone="info" >{s.guardianCount} veli</StatusBadge>}
                </Link>
              ))}
            </div>
          )}
        </Q>
      </div>
      {adding && <AddStudent onClose={() => setParams({})} />}
    </>
  );
}

export function AddStudent({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ displayName: '', level: '', subject: '', goal: '' });
  const m = useMutation({
    mutationFn: () => api.post<StudentDto>('/students', { displayName: form.displayName, level: form.level || null, subject: form.subject || null, goal: form.goal || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['students'] });
      void qc.invalidateQueries({ queryKey: ['entitlement'] });
      toast('Öğrenci eklendi');
      onClose();
    },
  });
  const limit = m.error instanceof ApiError && m.error.code === 'PLAN_LIMIT_REACHED';
  return (
    <Modal title="Öğrenci ekle" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Ad" htmlFor="sn">
          <input id="sn" className="input" required autoFocus value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        </Field>
        <details>
          <summary className="small muted" style={{ cursor: 'pointer' }}>İsteğe bağlı bilgiler</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <Field label="Sınıf / seviye" htmlFor="sl"><input id="sl" className="input" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} /></Field>
            <Field label="Branş" htmlFor="ss"><input id="ss" className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
            <Field label="Hedef / sınav" htmlFor="sg"><input id="sg" className="input" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} /></Field>
          </div>
        </details>
        {limit ? (
          <div className="alert warn">
            Paketinizin aktif öğrenci sınırına ulaştınız. Öğrenci eklenmedi. <Link to="/billing">Paketleri görün</Link> veya bir öğrenciyi arşivleyin.
          </div>
        ) : (
          m.error && <div className="alert danger">{(m.error as Error).message}</div>
        )}
        <div className="row between">
          <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
          <button className="btn primary" disabled={m.isPending}>Ekle</button>
        </div>
      </form>
    </Modal>
  );
}
