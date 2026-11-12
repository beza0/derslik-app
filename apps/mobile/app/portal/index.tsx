import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { t } from '@derslik/shared';
import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { deviceZone, fmtDateTime, fmtRange } from '../../src/format';
import type { PortalAssignmentItem, PortalLesson } from '../../src/portal';
import { Badge, Button, Card, H2, ListItem, Q, Screen, T } from '../../src/ui';

export default function PortalToday() {
  const { me } = useAuth();
  const zone = deviceZone();
  const start = DateTime.now().setZone(zone).startOf('day');
  const lessons = useQuery({ queryKey: ['portal', 'week'], queryFn: () => api.get<PortalLesson[]>(`/portal/calendar?from=${encodeURIComponent(start.toISO()!)}&to=${encodeURIComponent(start.plus({ days: 7 }).toISO()!)}`) });
  const hw = useQuery({ queryKey: ['portal', 'assignments'], queryFn: () => api.get<PortalAssignmentItem[]>('/portal/assignments') });
  const unread = useQuery({ queryKey: ['unread'], queryFn: () => api.get<{ count: number }>('/notifications/unread-count') });
  const guardianOnly = me!.contexts.studentLinks.length === 0;
  const open = (hw.data ?? []).filter((a) => a.status === 'assigned' || a.status === 'resubmit_requested');
  return (
    <Screen title={`Merhaba ${me!.user.name.split(' ')[0]}`} right={<Button small title={`🔔 ${unread.data?.count ?? 0}`} onPress={() => router.push('/notifications')} />}>
      <T muted>{start.setLocale('tr').toFormat('d LLLL cccc')}</T>
      <Card>
        <H2>Bu hafta</H2>
        <Q q={lessons} empty={(d) => d.length === 0 && 'Bu hafta ders yok'}>
          {(d) =>
            d.map((l) => (
              <ListItem
                key={l.id + l.forStudentId}
                title={fmtRange(l.startsAt, l.endsAt, zone)}
                subtitle={`${l.teacherName}${guardianOnly ? ` · ${l.forStudentName}` : ''}`}
                onPress={() => router.push(`/plesson/${l.id}`)}
                right={<Badge tone={l.status === 'cancelled' ? 'danger' : l.status === 'done' ? 'ok' : 'info'}>{t(`status.${l.status}`)}</Badge>}
              />
            ))
          }
        </Q>
      </Card>
      <Card>
        <H2>Bekleyen ödevler</H2>
        <Q q={hw} empty={() => open.length === 0 && 'Bekleyen ödev yok'}>
          {() => open.map((a) => <ListItem key={a.recipientId} title={a.title} subtitle={`${a.teacherName} · Son tarih: ${fmtDateTime(a.dueAt)}`} onPress={() => router.push(`/hw/${a.id}?studentId=${a.studentId}`)} right={a.late ? <Badge tone="danger">Gecikmiş</Badge> : undefined} />)}
        </Q>
      </Card>
    </Screen>
  );
}
