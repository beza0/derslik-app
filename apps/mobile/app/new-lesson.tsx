import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { ApiError, type StudentDto } from '@derslik/shared';
import { api, errorMessage } from '../src/api';
import { useAuth } from '../src/auth';
import { fmtRange } from '../src/format';
import { Alert, Button, Card, Input, Row, Screen, T } from '../src/ui';

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

/** Tek ders veya haftalık seri. Çakışma varsa hiçbir ders kaydedilmez. */
export default function NewLesson() {
  const params = useLocalSearchParams<{ studentId?: string }>();
  const { me } = useAuth();
  const zone = me!.contexts.teacher!.timezone;
  const qc = useQueryClient();
  const students = useQuery({ queryKey: ['students', 'active'], queryFn: () => api.get<StudentDto[]>('/students') });
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => api.get<{ id: string; name: string }[]>('/groups') });
  const [target, setTarget] = useState(params.studentId ? `s:${params.studentId}` : '');
  const [date, setDate] = useState(DateTime.now().setZone(zone).plus({ days: 1 }).toISODate()!);
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState('60');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [count, setCount] = useState('8');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.post('/lessons', {
        ...(target.startsWith('g:') ? { groupId: target.slice(2) } : { studentId: target.slice(2) }),
        date,
        startTime: time,
        durationMin: Number(duration),
        mode: 'in_person',
        recurrence: weekdays.length ? { weekdays, count: Number(count) } : undefined,
      });
      void qc.invalidateQueries({ queryKey: ['calendar'] });
      void qc.invalidateQueries({ queryKey: ['lessons'] });
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'LESSON_CONFLICT') {
        const list = (e.details as { conflicts: { startsAt: string; endsAt: string }[] }).conflicts.slice(0, 5).map((c) => fmtRange(c.startsAt, c.endsAt, zone));
        setErr(`Bu saatlerde başka dersiniz var; hiçbir ders kaydedilmedi:\n${list.join('\n')}`);
      } else setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <T bold>Kime</T>
        <Row>
          {students.data?.map((s) => <Button key={s.id} small kind={target === `s:${s.id}` ? 'primary' : 'default'} title={s.displayName} onPress={() => setTarget(`s:${s.id}`)} />)}
          {groups.data?.map((g) => <Button key={g.id} small kind={target === `g:${g.id}` ? 'primary' : 'default'} title={`👥 ${g.name}`} onPress={() => setTarget(`g:${g.id}`)} />)}
        </Row>
        <Input label="Tarih (YYYY-AA-GG)" value={date} onChangeText={setDate} />
        <Row>
          <Button small title="Bugün" onPress={() => setDate(DateTime.now().setZone(zone).toISODate()!)} />
          <Button small title="Yarın" onPress={() => setDate(DateTime.now().setZone(zone).plus({ days: 1 }).toISODate()!)} />
        </Row>
        <Input label="Saat (SS:DD)" value={time} onChangeText={setTime} />
        <Input label="Süre (dakika)" value={duration} onChangeText={setDuration} keyboardType="number-pad" />
        <T bold>Her hafta tekrarla (isteğe bağlı)</T>
        <Row>
          {DAYS.map((d, i) => (
            <Button key={d} small kind={weekdays.includes(i + 1) ? 'primary' : 'default'} title={d} onPress={() => setWeekdays(weekdays.includes(i + 1) ? weekdays.filter((x) => x !== i + 1) : [...weekdays, i + 1].sort())} />
          ))}
        </Row>
        {weekdays.length > 0 && <Input label="Ders sayısı" value={count} onChangeText={setCount} keyboardType="number-pad" />}
        {err && <Alert tone="danger">{err}</Alert>}
        <Button kind="primary" title={busy ? 'Kaydediliyor…' : 'Kaydet'} onPress={save} disabled={busy || !target} />
      </Card>
    </Screen>
  );
}
