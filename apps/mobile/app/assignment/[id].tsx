import { useState } from 'react';
import { Linking } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t, type RecipientStatus } from '@derslik/shared';
import { api, errorMessage } from '../../src/api';
import { fmtDateTime } from '../../src/format';
import { Alert, Badge, Button, Card, ErrorView, H2, Input, ListItem, Loading, Row, Screen, T } from '../../src/ui';

interface Detail {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  status: 'draft' | 'published';
  recipients: { id: string; displayName: string; status: RecipientStatus; late: boolean; lastSubmittedAt: string | null }[];
}
interface RecipientView {
  submissions: { id: string; version: number; text: string | null; submittedAt: string; files: { id: string; name: string }[] }[];
}

export default function AssignmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['assignment', id], queryFn: () => api.get<Detail>(`/assignments/${id}`) });
  const [reviewing, setReviewing] = useState<string | null>(null);
  const publish = useMutation({ mutationFn: () => api.post(`/assignments/${id}/publish`), onSuccess: () => void qc.invalidateQueries({ queryKey: ['assignment', id] }) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} />;
  const a = q.data!;
  return (
    <Screen>
      <Stack.Screen options={{ title: a.title }} />
      <Card>
        <T>Son tarih: {fmtDateTime(a.dueAt)}</T>
        {a.description && <T>{a.description}</T>}
        {a.status === 'draft' ? (
          <>
            <Badge tone="warn">Taslak — öğrenciler görmez</Badge>
            <Button kind="primary" title="Yayımla" onPress={() => publish.mutate()} />
          </>
        ) : (
          <Badge tone="info">Yayında</Badge>
        )}
      </Card>
      <Card>
        <H2>Öğrenciler</H2>
        {a.recipients.map((r) => (
          <ListItem
            key={r.id}
            title={r.displayName}
            subtitle={r.lastSubmittedAt ? `Teslim: ${fmtDateTime(r.lastSubmittedAt)}${r.late ? ' · Gecikmiş' : ''}` : 'Teslim yok'}
            onPress={r.status !== 'assigned' ? () => setReviewing(r.id) : undefined}
            right={<Badge tone={r.status === 'reviewed' ? 'ok' : r.status === 'submitted' ? 'info' : r.status === 'resubmit_requested' ? 'warn' : undefined}>{t(`rec.${r.status}`)}</Badge>}
          />
        ))}
      </Card>
      {reviewing && <Review recipientId={reviewing} onDone={() => { setReviewing(null); void qc.invalidateQueries({ queryKey: ['assignment', id] }); }} />}
    </Screen>
  );
}

function Review({ recipientId, onDone }: { recipientId: string; onDone: () => void }) {
  const q = useQuery({ queryKey: ['recipient', recipientId], queryFn: () => api.get<RecipientView>(`/recipients/${recipientId}`) });
  const [feedback, setFeedback] = useState('');
  const [score, setScore] = useState('');
  const m = useMutation({ mutationFn: (requestResubmit: boolean) => api.post(`/recipients/${recipientId}/review`, { feedback: feedback || null, score: score ? Number(score) : null, requestResubmit }), onSuccess: onDone });
  const open = async (fileId: string) => Linking.openURL((await api.get<{ url: string }>(`/files/${fileId}/url`)).url);
  return (
    <Card>
      <H2>Teslimi incele</H2>
      {q.data?.submissions.map((s) => (
        <Card key={s.id}>
          <T muted size={13}>Sürüm {s.version} · {fmtDateTime(s.submittedAt)}</T>
          {s.text && <T>{s.text}</T>}
          <Row>{s.files.map((f) => <Button key={f.id} small title={`📎 ${f.name}`} onPress={() => open(f.id)} />)}</Row>
        </Card>
      ))}
      <Input label="Geri bildirim" value={feedback} onChangeText={setFeedback} multiline />
      <Input label="Puan (isteğe bağlı)" value={score} onChangeText={setScore} keyboardType="numeric" />
      {m.error && <Alert tone="danger">{errorMessage(m.error)}</Alert>}
      <Row>
        <Button title="Yeniden teslim iste" onPress={() => m.mutate(true)} />
        <Button kind="primary" title="İncelendi" onPress={() => m.mutate(false)} />
      </Row>
    </Card>
  );
}
