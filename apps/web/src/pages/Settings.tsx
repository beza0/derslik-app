import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { useAuth, type Mode } from '../auth';
import { Field, PageHeader, StatusBadge, useToast } from '../ui';

const CATS: Record<string, string> = { lesson: 'Ders değişiklikleri', reminder: 'Hatırlatmalar', assignment: 'Ödevler', feedback: 'Geri bildirim ve paylaşılan notlar', request: 'Talepler', system: 'Sistem' };

export function Settings() {
  const { me, mode, setMode, reload, logout } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(me!.user.name);
  const [timezone, setTimezone] = useState(me!.contexts.teacher?.timezone ?? '');
  const prefs = useQuery({ queryKey: ['prefs'], queryFn: () => api.get<{ category: string; enabled: boolean; locked: boolean }[]>('/notifications/prefs') });
  const support = useQuery({ queryKey: ['support'], enabled: mode === 'teacher', queryFn: () => api.get<{ id: string; reason: string; status: string; expiresAt: string | null }[]>('/support-access') });
  const save = useMutation({
    mutationFn: () => api.patch('/me', { name, ...(me!.contexts.teacher && timezone ? { timezone } : {}) }),
    onSuccess: () => {
      void reload();
      toast('Kaydedildi');
    },
    onError: (e) => toast(errorMessage(e)),
  });
  const modes: { id: Mode; label: string; ok: boolean }[] = [
    { id: 'teacher', label: 'Öğretmen', ok: !!me!.contexts.teacher },
    { id: 'portal', label: 'Öğrenci / veli', ok: me!.contexts.studentLinks.length + me!.contexts.guardianLinks.length > 0 },
    { id: 'admin', label: 'Yönetim', ok: me!.contexts.admin },
  ];
  return (
    <>
      <PageHeader title="Ayarlar" />
      <div className="grid grid-2">
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <h2>Hesap</h2>
          <div className="small muted">{me!.user.email} {me!.user.emailVerified ? <StatusBadge tone="ok">Doğrulandı</StatusBadge> : <StatusBadge tone="warn">Doğrulanmadı</StatusBadge>}</div>
          {!me!.user.emailVerified && <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={async () => { await api.post('/auth/resend-verification'); toast('Doğrulama e-postası gönderildi'); }}>Doğrulama e-postasını tekrar gönder</button>}
          <Field label="Ad" htmlFor="sn"><input id="sn" className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          {me!.contexts.teacher && <Field label="Saat dilimi" hint="Ders saatleri bu saat diliminde gösterilir" htmlFor="stz"><input id="stz" className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} /></Field>}
          <button className="btn primary" style={{ alignSelf: 'flex-start' }}>Kaydet</button>
          {modes.filter((m) => m.ok).length > 1 && (
            <div className="stack">
              <strong>Görünüm</strong>
              <div className="row">{modes.filter((m) => m.ok).map((m) => <button type="button" key={m.id} className={`btn sm ${mode === m.id ? 'primary' : ''}`} onClick={() => setMode(m.id)}>{m.label}</button>)}</div>
            </div>
          )}
          <div className="row">
            <Link to="/invite" className="btn sm">Davet kodu gir</Link>
            <button type="button" className="btn sm danger" onClick={logout}>Çıkış yap</button>
          </div>
        </form>
        <div className="stack">
          <div className="card stack">
            <h2>Bildirim tercihleri</h2>
            {prefs.data?.map((p) => (
              <label key={p.category} className="row between">
                <span>{CATS[p.category]}</span>
                <input type="checkbox" checked={p.enabled} disabled={p.locked} onChange={async (e) => { await api.put('/notifications/prefs', { category: p.category, enabled: e.target.checked }); void qc.invalidateQueries({ queryKey: ['prefs'] }); }} />
              </label>
            ))}
          </div>
          {mode === 'portal' && <PortalLinks />}
          {mode === 'teacher' && (
            <div className="card stack">
              <h2>Destek erişim talepleri</h2>
              <p className="small muted" style={{ margin: 0 }}>Yöneticiler öğrenci içeriğinizi göremez. Destek için yalnızca sizin onayınızla, süreli ve sayısal özet düzeyinde erişim açılır.</p>
              {support.data?.length === 0 && <span className="small muted">Talep yok.</span>}
              {support.data?.map((g) => (
                <div key={g.id} className="row between">
                  <span className="small">{g.reason} <StatusBadge>{g.status}</StatusBadge></span>
                  {g.status === 'requested' && (
                    <span className="row">
                      <button className="btn sm" onClick={async () => { await api.post(`/support-access/${g.id}/decide`, { decision: 'deny' }); void support.refetch(); }}>Reddet</button>
                      <button className="btn sm primary" onClick={async () => { await api.post(`/support-access/${g.id}/decide`, { decision: 'approve', hours: 24 }); void support.refetch(); }}>24 saat onayla</button>
                    </span>
                  )}
                  {g.status === 'approved' && <button className="btn sm" onClick={async () => { await api.post(`/support-access/${g.id}/decide`, { decision: 'revoke' }); void support.refetch(); }}>Kaldır</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function PortalLinks() {
  const { me, reload } = useAuth();
  const toast = useToast();
  const links = [
    ...me!.contexts.studentLinks.map((l) => ({ studentId: l.studentId, label: `${l.teacherName} (öğrenci)` })),
    ...me!.contexts.guardianLinks.map((l) => ({ studentId: l.studentId, label: `${l.studentName} — ${l.teacherName} (veli)` })),
  ];
  return (
    <div className="card stack">
      <h2>Öğretmen bağlantılarım</h2>
      {links.map((l) => (
        <div key={l.studentId + l.label} className="row between">
          <span>{l.label}</span>
          <button className="btn sm" onClick={async () => { if (!confirm('Bu bağlantı kaldırılsın mı? Öğretmenin kayıtları silinmez.')) return; await api.del(`/me/links/${l.studentId}`); await reload(); toast('Bağlantı kaldırıldı'); }}>Bağlantıyı kaldır</button>
        </div>
      ))}
    </div>
  );
}
