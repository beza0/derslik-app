import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StudentDto } from '@derslik/shared';
import { api, errorMessage } from '../src/api';
import { fmtDateTime } from '../src/format';
import { Alert, Badge, Button, Card, Input, ListItem, Q, Row, Screen, T } from '../src/ui';

interface Item {
  id: string;
  title: string;
  status: 'draft' | 'published';
  dueAt: string | null;
  counts: { total: number; submitted: number; reviewed: number };
}

export default function Assignments() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['assignments'], queryFn: () => api.get<Item[]>('/assignments') });
  const students = useQuery({ queryKey: ['students', 'active'], queryFn: () => api.get<StudentDto[]>('/students') });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const create = useMutation({
    mutationFn: (publish: boolean) => api.post<{ id: string }>('/assignments', { title, description: desc || null, studentIds: sel, publish }),
    onSuccess: (a) => {
      setOpen(false);
      setTitle('');
      setDesc('');
      setSel([]);
      void qc.invalidateQueries({ queryKey: ['assignments'] });
      router.push(`/assignment/${a.id}`);
    },
  });
  return (
    <Screen right={<Button small kind="primary" title="+ Ödev" onPress={() => setOpen(!open)} />} title=" ">
      {open && (
        <Card>
          <Input label="Başlık" value={title} onChangeText={setTitle} />
          <Input label="Açıklama" value={desc} onChangeText={setDesc} multiline />
          <T bold>Öğrenciler</T>
          <Row>{students.data?.map((s) => <Button key={s.id} small kind={sel.includes(s.id) ? 'primary' : 'default'} title={s.displayName} onPress={() => setSel(sel.includes(s.id) ? sel.filter((x) => x !== s.id) : [...sel, s.id])} />)}</Row>
          <T muted size={13}>Dosya, cevap anahtarı ve grup ödevi için web uygulamasını kullanabilirsiniz.</T>
          {create.error && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
          <Row>
            <Button title="Taslak" onPress={() => create.mutate(false)} disabled={!title || sel.length === 0} />
            <Button kind="primary" title="Yayımla" onPress={() => create.mutate(true)} disabled={!title || sel.length === 0} />
          </Row>
        </Card>
      )}
      <Card>
        <Q q={q} empty={(d) => d.length === 0 && 'Ödev yok'}>
          {(d) =>
            d.map((a) => (
              <ListItem
                key={a.id}
                title={a.title}
                subtitle={`Son tarih: ${fmtDateTime(a.dueAt)} · ${a.counts.submitted} incelenecek`}
                onPress={() => router.push(`/assignment/${a.id}`)}
                right={<Badge tone={a.status === 'draft' ? 'warn' : 'info'}>{a.status === 'draft' ? 'Taslak' : 'Yayında'}</Badge>}
              />
            ))
          }
        </Q>
      </Card>
    </Screen>
  );
}
