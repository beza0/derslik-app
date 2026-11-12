import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { api, errorMessage } from '../src/api';
import { useAuth } from '../src/auth';
import { Alert, Badge, Button, Card, Input, Q, Row, Screen, T } from '../src/ui';

interface Req {
  id: string;
  kind: 'cancel' | 'reschedule';
  status: string;
  message: string | null;
  proposedStartsAt: string | null;
  studentName: string;
  requesterRole: 'student' | 'guardian';
  when: string;
}

/** Talepler takvimi değiştirmez; onay/ret öğretmenindir. */
export default function Requests() {
  const { me } = useAuth();
  const zone = me!.contexts.teacher!.timezone;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['requests', 'pending'], queryFn: () => api.get<Req[]>('/change-requests?status=pending') });
  const [editing, setEditing] = useState<{ id: string; date: string; time: string } | null>(null);
  const decide = useMutation({
    mutationFn: (b: { id: string; decision: 'approve' | 'reject'; newDate?: string; newStartTime?: string }) => api.post(`/change-requests/${b.id}/decide`, b),
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['requests'] });
      void qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
  return (
    <Screen>
      {decide.error && <Alert tone="danger">{errorMessage(decide.error)}</Alert>}
      <Q q={q} empty={(d) => d.length === 0 && 'Bekleyen talep yok'}>
        {(d) =>
          d.map((r) => (
            <Card key={r.id}>
              <T bold>{r.studentName} — {r.kind === 'cancel' ? 'iptal' : 'erteleme'}</T>
              <T muted size={13}>Ders: {r.when} · {r.requesterRole === 'guardian' ? 'Veli' : 'Öğrenci'}</T>
              {r.message && <T>“{r.message}”</T>}
              {editing?.id === r.id ? (
                <>
                  <Input label="Yeni tarih (YYYY-AA-GG)" value={editing.date} onChangeText={(date) => setEditing({ ...editing, date })} />
                  <Input label="Yeni saat (SS:DD)" value={editing.time} onChangeText={(time) => setEditing({ ...editing, time })} />
                  <Button kind="primary" title="Onayla ve taşı" onPress={() => decide.mutate({ id: r.id, decision: 'approve', newDate: editing.date, newStartTime: editing.time })} />
                </>
              ) : (
                <Row>
                  <Button small title="Reddet" onPress={() => decide.mutate({ id: r.id, decision: 'reject' })} />
                  <Button
                    small
                    kind="primary"
                    title="Onayla"
                    onPress={() => {
                      if (r.kind === 'cancel') return decide.mutate({ id: r.id, decision: 'approve' });
                      const p = r.proposedStartsAt ? DateTime.fromISO(r.proposedStartsAt).setZone(zone) : DateTime.now().setZone(zone).plus({ days: 1 });
                      setEditing({ id: r.id, date: p.toISODate()!, time: p.toFormat('HH:mm') });
                    }}
                  />
                  <Badge tone="info">Bekliyor</Badge>
                </Row>
              )}
            </Card>
          ))
        }
      </Q>
    </Screen>
  );
}
