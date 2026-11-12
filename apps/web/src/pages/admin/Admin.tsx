import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../api';
import { fmtDateTime } from '../../format';
import { Field, Modal, PageHeader, Q, StatusBadge, Tabs, useToast } from '../../ui';

interface Stats {
  users: number;
  teachers: number;
  studentAccounts: number;
  guardianAccounts: number;
  activeStudentRecords: number;
  lessonsNext7Days: number;
  subscriptions: { status: string; n: number }[];
  aiThisMonth: { requests: number; cost: number };
  errors24h: number;
}
interface PlanRow {
  id: string;
  code: string;
  name: string;
  isPublic: boolean;
  isFree: boolean;
  versions: { id: string; version: number; activeStudentLimit: number; aiMonthlyQuota: number; priceMinor: number | null; currency: string; period: string; isCurrent: boolean }[];
}

/** Yönetim paneli: kullanım, kullanıcılar, paketler, hatalar. Öğrenci içeriği burada yoktur. */
export function AdminHome() {
  const [tab, setTab] = useState<'stats' | 'users' | 'plans' | 'errors' | 'audit'>('stats');
  return (
    <>
      <PageHeader title="Yönetim" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'stats', label: 'Özet' }, { id: 'users', label: 'Kullanıcılar' }, { id: 'plans', label: 'Paketler' }, { id: 'errors', label: 'Hatalar' }, { id: 'audit', label: 'Denetim' }]} />
      {tab === 'stats' && <StatsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'plans' && <PlansTab />}
      {tab === 'errors' && <ErrorsTab />}
      {tab === 'audit' && <AuditTab />}
    </>
  );
}

function StatsTab() {
  const q = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api.get<Stats>('/admin/stats') });
  return (
    <Q q={q}>
      {(s) => (
        <div className="grid grid-3">
          {[
            ['Kullanıcı', s.users],
            ['Öğretmen', s.teachers],
            ['Öğrenci hesabı', s.studentAccounts],
            ['Veli hesabı', s.guardianAccounts],
            ['Aktif öğrenci kaydı', s.activeStudentRecords],
            ['7 gün içindeki ders', s.lessonsNext7Days],
            ['AI isteği (bu ay)', s.aiThisMonth.requests],
            ['AI maliyeti (bu ay, tahmini)', `$${(Number(s.aiThisMonth.cost) / 1e6).toFixed(2)}`],
            ['Hata (24 saat)', s.errors24h],
          ].map(([k, v]) => (
            <div key={k} className="card">
              <div className="small muted">{k}</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{v}</div>
            </div>
          ))}
          <div className="card">
            <div className="small muted">Abonelikler</div>
            {s.subscriptions.map((x) => <div key={x.status}>{x.status}: {x.n}</div>)}
          </div>
        </div>
      )}
    </Q>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const users = useQuery({ queryKey: ['admin', 'users', q], queryFn: () => api.get<{ id: string; email: string; name: string; status: string; isAdmin: boolean; workspaceId: string | null; planName: string | null; subscriptionStatus: string | null; createdAt: string }[]>(`/admin/users?q=${encodeURIComponent(q)}`) });
  const [access, setAccess] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  return (
    <div className="card">
      <input className="input" style={{ maxWidth: 320, marginBottom: 12 }} placeholder="E-posta veya ad ara" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Kullanıcı ara" />
      <Q q={users}>
        {(d) => (
          <div className="list">
            {d.map((u) => (
              <div key={u.id} className="list-item">
                <div className="grow">
                  <div className="title">{u.name} {u.isAdmin && <StatusBadge tone="info">Yönetici</StatusBadge>}</div>
                  <div className="small muted">{u.email} · {u.workspaceId ? `Öğretmen · ${u.planName} (${u.subscriptionStatus})` : 'Öğrenci/veli'} · {fmtDateTime(u.createdAt)}</div>
                </div>
                <StatusBadge tone={u.status === 'active' ? 'ok' : 'danger'}>{u.status === 'active' ? 'Aktif' : 'Askıda'}</StatusBadge>
                {u.workspaceId && <button className="btn sm" onClick={() => setAccess(u.workspaceId)}>Destek erişimi iste</button>}
                <button className="btn sm" onClick={async () => { try { await api.post(`/admin/users/${u.id}/status`, { status: u.status === 'active' ? 'suspended' : 'active' }); void qc.invalidateQueries({ queryKey: ['admin', 'users'] }); } catch (e) { toast(errorMessage(e)); } }}>{u.status === 'active' ? 'Askıya al' : 'Etkinleştir'}</button>
              </div>
            ))}
          </div>
        )}
      </Q>
      {access && (
        <Modal title="Destek erişimi iste" onClose={() => setAccess(null)}>
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>Öğretmen onaylarsa süreli ve yalnızca sayısal özet erişimi açılır. Her görüntüleme denetim kaydına yazılır.</p>
            <Field label="Gerekçe (en az 10 karakter)" htmlFor="rs"><textarea id="rs" className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <button className="btn primary" disabled={reason.trim().length < 10} onClick={async () => { await api.post(`/admin/workspaces/${access}/support-access`, { reason }); setAccess(null); setReason(''); toast('Talep öğretmene iletildi'); }}>Gönder</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PlansTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'plans'], queryFn: () => api.get<PlanRow[]>('/admin/plans') });
  const [editing, setEditing] = useState<PlanRow | 'new' | null>(null);
  const [f, setF] = useState({ code: '', name: '', isPublic: true, limit: 10, quota: 200, price: '', currency: 'TRY', period: 'monthly', applyExisting: false });
  const save = useMutation({
    mutationFn: async () => {
      const version = { activeStudentLimit: f.limit, aiMonthlyQuota: f.quota, priceMinor: f.price === '' ? null : Math.round(Number(f.price) * 100), currency: f.currency, period: f.period, applyToExistingSubscribers: f.applyExisting };
      if (editing === 'new') return api.post('/admin/plans', { code: f.code, name: f.name, isPublic: f.isPublic, version });
      await api.patch(`/admin/plans/${(editing as PlanRow).id}`, { name: f.name, isPublic: f.isPublic });
      return api.post(`/admin/plans/${(editing as PlanRow).id}/versions`, version);
    },
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'plans'] });
      toast('Paket kaydedildi');
    },
    onError: (e) => toast(errorMessage(e)),
  });
  const openEdit = (p: PlanRow) => {
    const v = p.versions.find((x) => x.isCurrent)!;
    setF({ code: p.code, name: p.name, isPublic: p.isPublic, limit: v.activeStudentLimit, quota: v.aiMonthlyQuota, price: v.priceMinor === null ? '' : String(v.priceMinor / 100), currency: v.currency, period: v.period, applyExisting: false });
    setEditing(p);
  };
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}><button className="btn primary" onClick={() => { setF({ ...f, code: '', name: '' }); setEditing('new'); }}>Yeni paket</button></div>
      <Q q={q}>
        {(d) => (
          <div className="grid grid-3">
            {d.map((p) => {
              const v = p.versions.find((x) => x.isCurrent);
              return (
                <div key={p.id} className="card stack">
                  <div className="row between"><h3>{p.name}</h3><StatusBadge tone={p.isPublic ? 'ok' : undefined}>{p.isPublic ? 'Satışta' : 'Gizli'}</StatusBadge></div>
                  <div className="small muted">{p.code} · sürüm {v?.version}</div>
                  <div>{v?.activeStudentLimit} öğrenci · {v?.aiMonthlyQuota} AI/ay</div>
                  <div>{v?.priceMinor === null ? 'Fiyat belirlenmedi' : `${(v!.priceMinor! / 100).toFixed(2)} ${v?.currency} / ${v?.period === 'monthly' ? 'ay' : 'yıl'}`}</div>
                  <button className="btn sm" onClick={() => openEdit(p)}>Düzenle (yeni sürüm)</button>
                </div>
              );
            })}
          </div>
        )}
      </Q>
      {editing && (
        <Modal title={editing === 'new' ? 'Yeni paket' : 'Paketi düzenle'} onClose={() => setEditing(null)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            {editing === 'new' && <Field label="Kod" hint="küçük harf, rakam, - _" htmlFor="pc"><input id="pc" className="input" required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>}
            <Field label="Ad" htmlFor="pn"><input id="pn" className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <div className="grid grid-2">
              <Field label="Aktif öğrenci limiti" htmlFor="pl"><input id="pl" type="number" min={1} className="input" value={f.limit} onChange={(e) => setF({ ...f, limit: Number(e.target.value) })} /></Field>
              <Field label="Aylık AI kotası" htmlFor="pq"><input id="pq" type="number" min={0} className="input" value={f.quota} onChange={(e) => setF({ ...f, quota: Number(e.target.value) })} /></Field>
              <Field label="Fiyat (boş = belirlenmedi)" htmlFor="pp"><input id="pp" type="number" step="0.01" min={0} className="input" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
              <Field label="Dönem" htmlFor="pd"><select id="pd" className="input" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })}><option value="monthly">Aylık</option><option value="yearly">Yıllık</option></select></Field>
            </div>
            <label className="row"><input type="checkbox" checked={f.isPublic} onChange={(e) => setF({ ...f, isPublic: e.target.checked })} /> Satışta</label>
            {editing !== 'new' && <label className="row"><input type="checkbox" checked={f.applyExisting} onChange={(e) => setF({ ...f, applyExisting: e.target.checked })} /> Mevcut abonelere de uygula (aksi halde yalnızca yeni satın alımlar)</label>}
            <button className="btn primary" disabled={save.isPending}>Kaydet</button>
          </form>
        </Modal>
      )}
    </>
  );
}

function ErrorsTab() {
  const q = useQuery({ queryKey: ['admin', 'errors'], queryFn: () => api.get<{ id: number; code: string; route: string; message: string; createdAt: string }[]>('/admin/errors') });
  return (
    <div className="card">
      <Q q={q} empty={(d) => d.length === 0 && <span className="muted">Kayıtlı hata yok.</span>}>
        {(d) => <div className="list">{d.map((e) => <div key={e.id} className="list-item"><div className="grow"><div className="title">{e.code} — {e.route}</div><div className="small muted">{e.message}</div></div><span className="small muted">{fmtDateTime(e.createdAt)}</span></div>)}</div>}
      </Q>
    </div>
  );
}

function AuditTab() {
  const q = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => api.get<{ id: number; action: string; target: string | null; createdAt: string }[]>('/admin/audit') });
  return (
    <div className="card">
      <Q q={q}>{(d) => <div className="list">{d.map((a) => <div key={a.id} className="list-item"><div className="grow">{a.action} <span className="small muted">{a.target}</span></div><span className="small muted">{fmtDateTime(a.createdAt)}</span></div>)}</div>}</Q>
    </div>
  );
}
