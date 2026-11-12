import { useState } from 'react';
import { Linking } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { t } from '@derslik/shared';
import { api, errorMessage } from '../../src/api';
import { deviceZone, fmtRange } from '../../src/format';
import type { PortalLesson } from '../../src/portal';
import { Alert, Badge, Button, Card, ErrorView, Input, Loading, Row, Screen, Segmented, T } from '../../src/ui';

/** Öğrenci/veli ders detayı ve iptal/erteleme talebi (öğretmen onayına kadar takvim değişmez). */
export default function PortalLessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['portal', 'lesson', id], queryFn: () => api.get<PortalLesson>(`/portal/lessons/${id}`) });
  const [kind, setKind] = useState<'reschedule' | 'cancel'>('reschedule');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} />;
  const l = q.data!;
  const future = l.status === 'scheduled' && new Date(l.startsAt) > new Date();
  const send = async () => {
    try {
      await api.post(`/portal/lessons/${l.id}/change-requests`, { studentId: l.forStudentId, kind, message: message || undefined });
      setState({ tone: 'ok', text: 'Talebiniz öğretmene iletildi.' });
    } catch (e) {
      setState({ tone: 'danger', text: errorMessage(e) });
    }
  };
  return (
    <Screen>
      <Stack.Screen options={{ title: l.title ?? l.targetName }} />
      <Card>
        <T bold>{fmtRange(l.startsAt, l.endsAt, deviceZone())}</T>
        <T>{l.teacherName}</T>
        <Row>
          <Badge tone={l.status === 'cancelled' ? 'danger' : l.status === 'done' ? 'ok' : 'info'}>{t(`status.${l.status}`)}</Badge>
          <Badge>{l.mode === 'online' ? 'Online' : 'Yüz yüze'}</Badge>
        </Row>
        {l.location && <T>{l.location}</T>}
        {l.meetingUrl && <Button kind="primary" title="Derse katıl" onPress={() => Linking.openURL(l.meetingUrl!)} />}
      </Card>
      {future && (
        <Card>
          <Segmented value={kind} onChange={setKind} options={[{ id: 'reschedule', label: 'Erteleme iste' }, { id: 'cancel', label: 'İptal iste' }]} />
          <Input label="Mesaj (isteğe bağlı)" value={message} onChangeText={setMessage} multiline />
          <T muted size={13}>Talep, öğretmen onaylayana kadar takvimi değiştirmez.</T>
          {state && <Alert tone={state.tone}>{state.text}</Alert>}
          <Button kind="primary" title="Gönder" onPress={send} />
        </Card>
      )}
    </Screen>
  );
}
