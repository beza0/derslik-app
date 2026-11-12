import { useState } from 'react';
import { Share } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t, type InviteDto, type LessonDto, type NoteDto, type StudentDto, type Visibility } from '@derslik/shared';
import { api, API_URL, errorMessage } from '../../src/api';
import { useAuth } from '../../src/auth';
import { fmtDateTime, fmtRange } from '../../src/format';
import { Alert, Badge, Button, Card, H2, Input, ListItem, Loading, ErrorView, Q, Row, Screen, Segmented, T } from '../../src/ui';

type Tab = 'lessons' | 'notes' | 'links';

export default function StudentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const zone = me!.contexts.teacher!.timezone;
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('lessons');
  const s = useQuery({ queryKey: ['student', id], queryFn: () => api.get<StudentDto>(`/students/${id}`) });
  const archive = useMutation({
    mutationFn: (to: 'archive' | 'unarchive') => api.post(`/students/${id}/${to}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['student', id] });
      void qc.invalidateQueries({ queryKey: ['students'] });
    },
  });
  if (s.isLoading) return <Loading />;
  if (s.error) return <ErrorView error={s.error} />;
  const st = s.data!;
  return (
    <Screen>
      <Stack.Screen options={{ title: st.displayName }} />
      <Row>
        {st.status === 'archived' ? <Badge tone="warn">Arşivde</Badge> : <Badge tone="info">Aktif</Badge>}
        {st.hasAccount ? <Badge tone="ok">Hesap bağlı</Badge> : <Badge>Hesap yok</Badge>}
        {[st.level, st.subject, st.goal].filter(Boolean).map((x) => <Badge key={x}>{x}</Badge>)}
      </Row>
      <Row>
        {st.status === 'active' && <Button small kind="primary" title="+ Ders" onPress={() => router.push(`/new-lesson?studentId=${st.id}`)} />}
        <Button small title={st.status === 'active' ? 'Arşivle' : 'Arşivden çıkar'} onPress={() => archive.mutate(st.status === 'active' ? 'archive' : 'unarchive')} />
      </Row>
      {archive.error && <Alert tone="danger">{errorMessage(archive.error)}</Alert>}
      <Segmented value={tab} onChange={setTab} options={[{ id: 'lessons', label: 'Dersler' }, { id: 'notes', label: 'Notlar' }, { id: 'links', label: 'Davet' }]} />
      {tab === 'lessons' && <Lessons id={st.id} zone={zone} />}
      {tab === 'notes' && <Notes id={st.id} active={st.status === 'active'} />}
      {tab === 'links' && <Links student={st} />}
    </Screen>
  );
}

function Lessons({ id, zone }: { id: string; zone: string }) {
  const up = useQuery({ queryKey: ['lessons', id, 'upcoming'], queryFn: () => api.get<LessonDto[]>(`/students/${id}/lessons?when=upcoming`) });
  const past = useQuery({ queryKey: ['lessons', id, 'past'], queryFn: () => api.get<LessonDto[]>(`/students/${id}/lessons?when=past`) });
  return (
    <>
      {([['Yaklaşan', up], ['Geçmiş', past]] as const).map(([title, q]) => (
        <Card key={title}>
          <H2>{title}</H2>
          <Q q={q} empty={(d) => d.length === 0 && 'Ders yok'}>
            {(d) => d.map((l) => <ListItem key={l.id} title={fmtRange(l.startsAt, l.endsAt, zone)} subtitle={l.topicsCovered ?? undefined} onPress={() => router.push(`/lesson/${l.id}`)} right={<Badge tone={l.status === 'done' ? 'ok' : l.status === 'cancelled' ? 'danger' : 'info'}>{t(`status.${l.status}`)}</Badge>} />)}
          </Q>
        </Card>
      ))}
    </>
  );
}

function Notes({ id, active }: { id: string; active: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notes', id], queryFn: () => api.get<NoteDto[]>(`/students/${id}/notes`) });
  const [body, setBody] = useState('');
  const [vis, setVis] = useState<Visibility>('private');
  const add = useMutation({
    mutationFn: () => api.post('/notes', { studentId: id, body, visibility: vis }),
    onSuccess: () => {
      setBody('');
      setVis('private');
      void qc.invalidateQueries({ queryKey: ['notes', id] });
    },
  });
  return (
    <>
      {active && (
        <Card>
          <Input label="Yeni not" value={body} onChangeText={setBody} multiline />
          <Segmented value={vis} onChange={setVis} options={[{ id: 'private', label: 'Yalnızca ben' }, { id: 'student', label: 'Öğrenci' }, { id: 'student_guardian', label: '+ Veli' }]} />
          {add.error && <Alert tone="danger">{errorMessage(add.error)}</Alert>}
          <Button kind="primary" title="Kaydet" onPress={() => add.mutate()} disabled={!body.trim() || add.isPending} />
        </Card>
      )}
      <Card>
        <Q q={q} empty={(d) => d.length === 0 && 'Not yok'}>
          {(d) => d.map((n) => <ListItem key={n.id} title={n.body} subtitle={fmtDateTime(n.createdAt)} right={<Badge tone={n.visibility === 'private' ? undefined : 'info'}>{t(`vis.${n.visibility}`)}</Badge>} />)}
        </Q>
      </Card>
    </>
  );
}

function Links({ student }: { student: StudentDto }) {
  const [created, setCreated] = useState<InviteDto | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const make = async (kind: 'student' | 'guardian') => {
    setErr(null);
    try {
      setCreated(await api.post<InviteDto>(`/students/${student.id}/invites`, { kind, ttlDays: 7 }));
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  return (
    <Card>
      <T muted>Davet kodunu kendiniz paylaşın; uygulama otomatik mesaj göndermez. Kod 7 gün geçerli ve tek kullanımlıktır.</T>
      {!student.hasAccount && <Button title="Öğrenci daveti oluştur" onPress={() => make('student')} disabled={student.status !== 'active'} />}
      <Button title="Veli daveti oluştur" onPress={() => make('guardian')} disabled={student.status !== 'active'} />
      {err && <Alert tone="danger">{err}</Alert>}
      {created && (
        <>
          <Alert tone="ok">Kod: {created.code}</Alert>
          <Button kind="primary" title="Paylaş" onPress={() => Share.share({ message: `Dersio daveti: ${created.code}\n${API_URL}/invite/${created.code}` })} />
        </>
      )}
    </Card>
  );
}
