import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { ApiError, t, type Attendance, type LessonDto } from '@derslik/shared';
import { api, errorMessage } from '../../src/api';
import { fmtRange } from '../../src/format';
import { Alert, Badge, Button, Card, ErrorView, H2, Input, Loading, Row, Screen, Segmented, T } from '../../src/ui';

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['lesson', id], queryFn: () => api.get<LessonDto>(`/lessons/${id}`) });
  const [topics, setTopics] = useState('');
  const [nextPlan, setNextPlan] = useState('');
  const [att, setAtt] = useState<Record<string, Attendance>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [moving, setMoving] = useState(false);
  const [scope, setScope] = useState<'this' | 'this_and_following'>('this');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  useEffect(() => {
    if (!q.data) return;
    setTopics(q.data.topicsCovered ?? '');
    setNextPlan(q.data.nextPlan ?? '');
    setAtt(Object.fromEntries((q.data.participants ?? []).map((p) => [p.studentId, p.attendance])));
    const s = DateTime.fromISO(q.data.startsAt).setZone(q.data.timezone);
    setDate(s.toISODate()!);
    setTime(s.toFormat('HH:mm'));
  }, [q.data]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['lesson', id] });
    void qc.invalidateQueries({ queryKey: ['calendar'] });
  };
  const complete = useMutation({
    mutationFn: () => api.post(`/lessons/${id}/complete`, { topicsCovered: topics || null, nextPlan: nextPlan || null, attendance: Object.entries(att).map(([studentId, attendance]) => ({ studentId, attendance })) }),
    onSuccess: () => {
      refresh();
      setMsg({ tone: 'ok', text: 'Ders kaydedildi' });
    },
    onError: (e) => setMsg({ tone: 'danger', text: errorMessage(e) }),
  });
  const move = useMutation({
    mutationFn: () => api.patch(`/lessons/${id}`, scope === 'this' ? { scope, date, startTime: time } : { scope, startTime: time }),
    onSuccess: () => {
      setMoving(false);
      refresh();
      setMsg({ tone: 'ok', text: 'Ders güncellendi' });
    },
    onError: (e) => setMsg({ tone: 'danger', text: e instanceof ApiError && e.code === 'LESSON_CONFLICT' ? 'Bu saatte başka dersiniz var; hiçbir değişiklik kaydedilmedi.' : errorMessage(e) }),
  });
  const cancel = useMutation({
    mutationFn: () => api.post(`/lessons/${id}/cancel`, { scope }),
    onSuccess: () => {
      refresh();
      setMsg({ tone: 'ok', text: 'Ders iptal edildi' });
    },
  });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} />;
  const l = q.data!;
  return (
    <Screen>
      <Stack.Screen options={{ title: l.targetName }} />
      <Card>
        <T bold>{fmtRange(l.startsAt, l.endsAt, l.timezone)}</T>
        <Row>
          <Badge tone={l.status === 'done' ? 'ok' : l.status === 'cancelled' ? 'danger' : 'info'}>{t(`status.${l.status}`)}</Badge>
          {l.seriesId && <Badge>Seri</Badge>}
          <Badge>{l.mode === 'online' ? 'Online' : 'Yüz yüze'}</Badge>
        </Row>
        {l.location && <T>{l.location}</T>}
        {l.meetingUrl && <Button small title="Görüşme bağlantısını aç" onPress={() => Linking.openURL(l.meetingUrl!)} />}
      </Card>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {l.status === 'scheduled' && (
        <Card>
          {l.seriesId && <Segmented value={scope} onChange={setScope} options={[{ id: 'this', label: 'Yalnızca bu' }, { id: 'this_and_following', label: 'Bu ve sonrakiler' }]} />}
          {moving ? (
            <>
              {scope === 'this' && <Input label="Tarih (YYYY-AA-GG)" value={date} onChangeText={setDate} />}
              <Input label="Saat (SS:DD)" value={time} onChangeText={setTime} />
              <Button kind="primary" title="Kaydet" onPress={() => move.mutate()} disabled={move.isPending} />
            </>
          ) : (
            <Row>
              <Button small title="Taşı" onPress={() => setMoving(true)} />
              <Button small kind="danger" title="İptal et" onPress={() => cancel.mutate()} />
            </Row>
          )}
        </Card>
      )}
      {l.status !== 'cancelled' && (
        <Card>
          <H2>{l.status === 'done' ? 'Ders kaydı' : 'Dersi tamamla'}</H2>
          {(l.participants ?? []).map((p) => (
            <Row key={p.studentId}>
              <T style={{ flex: 1 }}>{p.displayName}</T>
              <Button small kind={att[p.studentId] === 'present' ? 'primary' : 'default'} title="Katıldı" onPress={() => setAtt({ ...att, [p.studentId]: 'present' })} />
              <Button small kind={att[p.studentId] === 'absent' ? 'primary' : 'default'} title="Katılmadı" onPress={() => setAtt({ ...att, [p.studentId]: 'absent' })} />
            </Row>
          ))}
          <Input label="İşlenen konu" value={topics} onChangeText={setTopics} multiline />
          <Input label="Sonraki ders planı" value={nextPlan} onChangeText={setNextPlan} multiline />
          <Button kind="primary" title={l.status === 'done' ? 'Güncelle' : 'Tamamlandı olarak kaydet'} onPress={() => complete.mutate()} disabled={complete.isPending} />
        </Card>
      )}
    </Screen>
  );
}
