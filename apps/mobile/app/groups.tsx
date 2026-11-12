import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StudentDto } from '@derslik/shared';
import { api, errorMessage } from '../src/api';
import { Alert, Badge, Button, Card, Input, ListItem, Q, Row, Screen, T } from '../src/ui';

export default function Groups() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['groups'], queryFn: () => api.get<{ id: string; name: string; memberCount: number }[]>('/groups') });
  const students = useQuery({ queryKey: ['students', 'active'], queryFn: () => api.get<StudentDto[]>('/students') });
  const [name, setName] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const create = useMutation({
    mutationFn: () => api.post('/groups', { name, studentIds: sel }),
    onSuccess: () => {
      setName('');
      setSel([]);
      void qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });
  return (
    <Screen>
      <Card>
        <Input label="Yeni grup adı" value={name} onChangeText={setName} />
        <Row>{students.data?.map((s) => <Button key={s.id} small kind={sel.includes(s.id) ? 'primary' : 'default'} title={s.displayName} onPress={() => setSel(sel.includes(s.id) ? sel.filter((x) => x !== s.id) : [...sel, s.id])} />)}</Row>
        {create.error && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
        <Button kind="primary" title="Grup oluştur" onPress={() => create.mutate()} disabled={!name.trim()} />
        <T muted size={13}>Üyelik değişikliği önizlemesi ve toplu davet web uygulamasında.</T>
      </Card>
      <Card>
        <Q q={q} empty={(d) => d.length === 0 && 'Grup yok'}>
          {(d) => d.map((g) => <ListItem key={g.id} title={g.name} right={<Badge>{g.memberCount} öğrenci</Badge>} onPress={() => router.push(`/new-lesson`)} />)}
        </Q>
      </Card>
    </Screen>
  );
}
