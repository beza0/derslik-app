import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type EntitlementDto, type StudentDto } from '@derslik/shared';
import { api, errorMessage } from '../../src/api';
import { Alert, Badge, Button, Card, Input, ListItem, Q, Screen, Segmented, T } from '../../src/ui';

export default function Students() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const q = useQuery({ queryKey: ['students', status], queryFn: () => api.get<StudentDto[]>(`/students?status=${status}`) });
  const ent = useQuery({ queryKey: ['entitlement'], queryFn: () => api.get<EntitlementDto>('/billing/entitlement') });
  const add = useMutation({
    mutationFn: () => api.post('/students', { displayName: name.trim() }),
    onSuccess: () => {
      setName('');
      setAdding(false);
      void qc.invalidateQueries({ queryKey: ['students'] });
      void qc.invalidateQueries({ queryKey: ['entitlement'] });
    },
  });
  const limit = add.error instanceof ApiError && add.error.code === 'PLAN_LIMIT_REACHED';
  const items = (q.data ?? []).filter((s) => s.displayName.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')));
  return (
    <Screen title="Öğrenciler" right={<Button small kind="primary" title="+ Ekle" onPress={() => setAdding(!adding)} />}>
      {ent.data && <T muted>{ent.data.activeStudentCount} / {ent.data.activeStudentLimit} aktif öğrenci · {ent.data.planName}</T>}
      {adding && (
        <Card>
          <Input label="Öğrenci adı" value={name} onChangeText={setName} placeholder="Yalnızca ad yeterli" />
          {limit ? <Alert tone="warn">Paketinizin aktif öğrenci sınırına ulaştınız; öğrenci eklenmedi. Bir öğrenciyi arşivleyin veya paketinizi web'den yükseltin.</Alert> : add.error && <Alert tone="danger">{errorMessage(add.error)}</Alert>}
          <Button kind="primary" title="Kaydet" onPress={() => add.mutate()} disabled={!name.trim() || add.isPending} />
        </Card>
      )}
      <Segmented value={status} onChange={setStatus} options={[{ id: 'active', label: 'Aktif' }, { id: 'archived', label: 'Arşiv' }]} />
      <Input label="Ara" value={search} onChangeText={setSearch} />
      <Card>
        <Q q={q} empty={(d) => d.length === 0 && 'Öğrenci yok'}>
          {() =>
            items.map((s) => (
              <ListItem
                key={s.id}
                title={s.displayName}
                subtitle={[s.level, s.subject, s.goal].filter(Boolean).join(' · ') || undefined}
                onPress={() => router.push(`/student/${s.id}`)}
                right={s.hasAccount ? <Badge tone="ok">Hesap bağlı</Badge> : <Badge>Hesap yok</Badge>}
              />
            ))
          }
        </Q>
      </Card>
    </Screen>
  );
}
