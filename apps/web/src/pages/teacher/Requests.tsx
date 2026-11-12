import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { api, errorMessage } from '../../api';
import { useAuth } from '../../auth';
import { fmtDateTime } from '../../format';
import { Empty, Field, Modal, PageHeader, Q, StatusBadge, Tabs, useToast } from '../../ui';
import { DateTime } from 'luxon';

interface Req {
  id: string;
  kind: 'cancel' | 'reschedule';
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  message: string | null;
  proposedStartsAt: string | null;
  response: string | null;
  createdAt: string;
  lessonId: string;
  studentName: string;
  requesterName: string;
  requesterRole: 'student' | 'guardian';
  when: string;
}

/** Talepler takvimi değiştirmez; karar öğretmenindir. */
export function Requests() {
  const { me } = useAuth();
  const zone = me!.contexts.teacher!.timezone;
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<'pending' | 'all'>('pending');
  const q = useQuery({ queryKey: ['requests', status], queryFn: () => api.get<Req[]>(`/change-requests${status === 'pending' ? '?status=pending' : ''}`) });
  const [approving, setApproving] = useState<Req | null>(null);
  const decide = useMutation({
    mutationFn: (x: { id: string; decision: 'approve' | 'reject'; newDate?: string; newStartTime?: string }) => api.post(`/change-requests/${x.id}/decide`, x),
    onSuccess: () => {
      setApproving(null);
      void qc.invalidateQueries({ queryKey: ['requests'] });
      void qc.invalidateQueries({ queryKey: ['calendar'] });
      toast('Karar kaydedildi; talep sahibine bildirildi');
    },
    onError: (e) => toast(errorMessage(e)),
  });
  return (
    <>
      <PageHeader title="İptal ve erteleme talepleri" />
      <Tabs tabs={[{ id: 'pending', label: 'Bekleyen' }, { id: 'all', label: 'Tümü' }]} value={status} onChange={setStatus} />
      <div className="card">
        <Q q={q} empty={(d) => d.length === 0 && <Empty title="Talep yok" icon={<Inbox size={36} />} />}>
          {(d) => (
            <div className="list">
              {d.map((r) => (
                <div key={r.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div className="title">{r.studentName} — {r.kind === 'cancel' ? 'iptal' : 'erteleme'} talebi</div>
                    <div className="small muted">Ders: {r.when} · {r.requesterRole === 'guardian' ? `Veli: ${r.requesterName}` : 'Öğrenci'}</div>
                    {r.proposedStartsAt && <div className="small">Önerilen zaman: {fmtDateTime(r.proposedStartsAt, zone)}</div>}
                    {r.message && <div className="small">“{r.message}”</div>}
                  </div>
                  {r.status === 'pending' ? (
                    <div className="row">
                      <button className="btn sm" onClick={() => decide.mutate({ id: r.id, decision: 'reject' })}>Reddet</button>
                      <button className="btn sm primary" onClick={() => (r.kind === 'cancel' ? decide.mutate({ id: r.id, decision: 'approve' }) : setApproving(r))}>Onayla</button>
                    </div>
                  ) : (
                    <StatusBadge tone={r.status === 'approved' ? 'ok' : undefined}>{{ approved: 'Onaylandı', rejected: 'Reddedildi', withdrawn: 'Geri çekildi', pending: '' }[r.status]}</StatusBadge>
                  )}
                </div>
              ))}
            </div>
          )}
        </Q>
      </div>
      {approving && <Approve req={approving} zone={zone} onClose={() => setApproving(null)} onSave={(newDate, newStartTime) => decide.mutate({ id: approving.id, decision: 'approve', newDate, newStartTime })} />}
    </>
  );
}

function Approve({ req, zone, onClose, onSave }: { req: Req; zone: string; onClose: () => void; onSave: (d: string, t: string) => void }) {
  const p = req.proposedStartsAt ? DateTime.fromISO(req.proposedStartsAt).setZone(zone) : DateTime.now().setZone(zone).plus({ days: 1 });
  const [date, setDate] = useState(p.toISODate()!);
  const [time, setTime] = useState(p.toFormat('HH:mm'));
  return (
    <Modal title="Ertelemeyi onayla" onClose={onClose}>
      <div className="stack">
        <div className="grid grid-2">
          <Field label="Yeni tarih" htmlFor="nd"><input id="nd" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Yeni saat" htmlFor="nt"><input id="nt" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>
        <div className="small muted">Çakışma varsa onay kaydedilmez ve talep beklemede kalır.</div>
        <button className="btn primary" onClick={() => onSave(date, time)}>Onayla ve taşı</button>
      </div>
    </Modal>
  );
}
