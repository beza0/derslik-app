import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { t, type EntitlementDto, type LessonDto } from '@derslik/shared';
import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { fmtTime } from '../../src/format';
import { Alert, Badge, Button, Card, H2, ListItem, Q, Row, Screen, T } from '../../src/ui';

export default function TeacherToday() {
  const { me } = useAuth();
  const zone = me!.contexts.teacher!.timezone;
  const start = DateTime.now().setZone(zone).startOf('day');
  const lessons = useQuery({
    queryKey: ['calendar', 'today'],
    queryFn: () => api.get<LessonDto[]>(`/calendar?from=${encodeURIComponent(start.toISO()!)}&to=${encodeURIComponent(start.plus({ days: 2 }).toISO()!)}`),
  });
  const requests = useQuery({ queryKey: ['requests', 'pending'], queryFn: () => api.get<unknown[]>('/change-requests?status=pending') });
  const ent = useQuery({ queryKey: ['entitlement'], queryFn: () => api.get<EntitlementDto>('/billing/entitlement') });
  const unread = useQuery({ queryKey: ['unread'], queryFn: () => api.get<{ count: number }>('/notifications/unread-count') });

  const list = (which: 'today' | 'tomorrow') =>
    (lessons.data ?? []).filter((l) => DateTime.fromISO(l.startsAt).setZone(zone).hasSame(which === 'today' ? start : start.plus({ days: 1 }), 'day'));

  return (
    <Screen title={`Merhaba ${me!.user.name.split(' ')[0]}`} right={<Button small title={`🔔 ${unread.data?.count ?? 0}`} onPress={() => router.push('/notifications')} />}>
      <T muted>{start.setLocale('tr').toFormat('d LLLL cccc')}</T>
      {ent.data?.overLimit && <Alert tone="warn">Aktif öğrenci sayınız paket sınırını aşıyor. Verileriniz korunuyor; yeni öğrenci eklemek için arşivleyin veya paketinizi yükseltin.</Alert>}
      <Row>
        <Button kind="primary" title="+ Ders" onPress={() => router.push('/new-lesson')} />
        <Button title="Ödevler" onPress={() => router.push('/assignments')} />
        <Button title={`Talepler (${requests.data?.length ?? 0})`} onPress={() => router.push('/requests')} />
      </Row>
      {(['today', 'tomorrow'] as const).map((w) => (
        <Card key={w}>
          <H2>{w === 'today' ? 'Bugün' : 'Yarın'}</H2>
          <Q q={lessons} empty={() => list(w).length === 0 && 'Ders yok'}>
            {() =>
              list(w).map((l) => (
                <ListItem
                  key={l.id}
                  title={`${fmtTime(l.startsAt, zone)}  ${l.targetName}`}
                  subtitle={l.title ?? (l.mode === 'online' ? 'Online' : 'Yüz yüze')}
                  onPress={() => router.push(`/lesson/${l.id}`)}
                  right={<Badge tone={l.status === 'done' ? 'ok' : l.status === 'cancelled' ? 'danger' : 'info'}>{t(`status.${l.status}`)}</Badge>}
                />
              ))
            }
          </Q>
        </Card>
      ))}
    </Screen>
  );
}
