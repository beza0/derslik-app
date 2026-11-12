import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import type { NotificationDto } from '@derslik/shared';
import { api } from '../api';
import { t } from '../i18n';
import { relative } from '../format';
import { Empty, PageHeader, Q } from '../ui';

export function Notifications() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ items: NotificationDto[] }>('/notifications?limit=50') });
  const read = useMutation({
    mutationFn: (body: { ids?: string[]; all?: boolean }) => api.post('/notifications/read', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['unread'] });
    },
  });
  return (
    <>
      <PageHeader title="Bildirimler" subtitle="Uygulama içi bildirimler; uygulama kapalıyken anlık uyarı gönderilmez." actions={<button className="btn" onClick={() => read.mutate({ all: true })}>Tümünü okundu yap</button>} />
      <div className="card">
        <Q q={q} empty={(d) => d.items.length === 0 && <Empty title="Bildirim yok" icon={<Bell size={36} />} />}>
          {(d) => (
            <div className="list">
              {d.items.map((n) => (
                <Link key={n.id} to={n.link} className="list-item" style={{ color: 'inherit', fontWeight: n.readAt ? 400 : 600 }} onClick={() => !n.readAt && read.mutate({ ids: [n.id] })}>
                  {!n.readAt && <span className="badge info">Yeni</span>}
                  <div className="grow">{t(n.titleKey, n.params)}</div>
                  <span className="small muted">{relative(n.createdAt)}</span>
                </Link>
              ))}
            </div>
          )}
        </Q>
      </div>
    </>
  );
}
