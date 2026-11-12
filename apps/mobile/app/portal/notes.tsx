import { useQuery } from '@tanstack/react-query';
import type { AssessmentDto, NoteDto } from '@derslik/shared';
import { api } from '../../src/api';
import { fmtDate } from '../../src/format';
import { Alert, Card, H2, ListItem, Q, Screen } from '../../src/ui';

interface Group {
  studentId: string;
  items: AssessmentDto[];
  progress: { enoughData: boolean; minPoints: number; points: { date: string; value: number; unit: 'percent' | 'raw' }[] };
}

/** Yalnızca paylaşılan notlar ve değerlendirmeler; öğretmene özel olanlar API yanıtında hiç yoktur. */
export default function Notes() {
  const notes = useQuery({ queryKey: ['portal', 'notes'], queryFn: () => api.get<NoteDto[]>('/portal/notes') });
  const assessments = useQuery({ queryKey: ['portal', 'assessments'], queryFn: () => api.get<Group[]>('/portal/assessments') });
  return (
    <Screen title="Notlar">
      <Card>
        <H2>Paylaşılan notlar</H2>
        <Q q={notes} empty={(d) => d.length === 0 && 'Paylaşılan not yok'}>{(d) => d.map((n) => <ListItem key={n.id} title={n.body} subtitle={fmtDate(n.createdAt)} />)}</Q>
      </Card>
      <Q q={assessments}>
        {(d) =>
          d.map((g) => (
            <Card key={g.studentId}>
              <H2>Değerlendirmeler</H2>
              {!g.progress.enoughData && <Alert>Gelişim eğilimi için en az {g.progress.minPoints} sayısal değerlendirme gerekir.</Alert>}
              {g.progress.enoughData && <Alert tone="ok">Son puanlar: {g.progress.points.slice(-5).map((p) => `${p.value}${p.unit === 'percent' ? '%' : ''}`).join(' → ')}</Alert>}
              {g.items.map((a) => <ListItem key={a.id} title={a.title} subtitle={`${fmtDate(a.date)}${a.feedback ? ` · ${a.feedback}` : ''}`} right={a.score !== null ? <H2>{`${a.score}${a.maxScore ? `/${a.maxScore}` : ''}`}</H2> : undefined} />)}
            </Card>
          ))
        }
      </Q>
    </Screen>
  );
}
