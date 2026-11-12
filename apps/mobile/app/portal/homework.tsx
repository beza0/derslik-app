import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { t } from '@derslik/shared';
import { api } from '../../src/api';
import { fmtDateTime } from '../../src/format';
import { recTone, type PortalAssignmentItem } from '../../src/portal';
import { Badge, Card, ListItem, Q, Row, Screen } from '../../src/ui';

export default function Homework() {
  const q = useQuery({ queryKey: ['portal', 'assignments'], queryFn: () => api.get<PortalAssignmentItem[]>('/portal/assignments') });
  return (
    <Screen title="Ödevler">
      <Card>
        <Q q={q} empty={(d) => d.length === 0 && 'Ödev yok'}>
          {(d) =>
            d.map((a) => (
              <ListItem
                key={a.recipientId}
                title={a.title}
                subtitle={`${a.teacherName} · Son tarih: ${fmtDateTime(a.dueAt)}`}
                onPress={() => router.push(`/hw/${a.id}?studentId=${a.studentId}`)}
                right={
                  <Row>
                    {a.late && <Badge tone="danger">Gecikmiş</Badge>}
                    <Badge tone={recTone(a.status)}>{t(`rec.${a.status}`)}</Badge>
                  </Row>
                }
              />
            ))
          }
        </Q>
      </Card>
    </Screen>
  );
}
