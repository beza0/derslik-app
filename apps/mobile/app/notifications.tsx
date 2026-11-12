import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t, type NotificationDto } from '@derslik/shared';
import { api } from '../src/api';
import { useAuth } from '../src/auth';
import { relative } from '../src/format';
import { Badge, Button, Card, ListItem, Q, Screen, T } from '../src/ui';

/** Uygulama içi bildirimler. Uygulama kapalıyken anlık uyarı gönderilmez. */
export default function Notifications() {
  const qc = useQueryClient();
  const { mode } = useAuth();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ items: NotificationDto[] }>('/notifications?limit=50') });
  const read = useMutation({
    mutationFn: (b: { ids?: string[]; all?: boolean }) => api.post('/notifications/read', b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['unread'] });
    },
  });
  const open = (n: NotificationDto) => {
    if (!n.readAt) read.mutate({ ids: [n.id] });
    const [, kind, id] = n.link.split('/');
    const portal = mode === 'portal';
    if (kind === 'lessons' && id) router.push(portal ? `/plesson/${id}` : `/lesson/${id}`);
    else if (kind === 'assignments' && id) router.push(portal ? `/hw/${id}` : `/assignment/${id}`);
    else if (kind === 'requests') router.push('/requests');
  };
  return (
    <Screen>
      <T muted size={13}>Uygulama kapalıyken anlık uyarı gönderilmez; yenilikleri burada görürsünüz.</T>
      <Button small title="Tümünü okundu yap" onPress={() => read.mutate({ all: true })} />
      <Card>
        <Q q={q} empty={(d) => d.items.length === 0 && 'Bildirim yok'}>
          {(d) => d.items.map((n) => <ListItem key={n.id} title={t(n.titleKey, n.params)} subtitle={relative(n.createdAt)} onPress={() => open(n)} right={!n.readAt ? <Badge tone="info">Yeni</Badge> : undefined} />)}
        </Q>
      </Card>
    </Screen>
  );
}
