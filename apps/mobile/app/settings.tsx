import { useState } from 'react';
import { Alert as RNAlert } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../src/api';
import { useAuth } from '../src/auth';
import { Alert, Badge, Button, Card, H2, Input, ListItem, Row, Screen, T } from '../src/ui';

const CATS: Record<string, string> = { lesson: 'Ders değişiklikleri', reminder: 'Hatırlatmalar', assignment: 'Ödevler', feedback: 'Geri bildirim', request: 'Talepler', system: 'Sistem' };

export function SettingsBody() {
  const { me, mode, setMode, reload, logout } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState(me!.user.name);
  const [msg, setMsg] = useState<string | null>(null);
  const prefs = useQuery({ queryKey: ['prefs'], queryFn: () => api.get<{ category: string; enabled: boolean; locked: boolean }[]>('/notifications/prefs') });
  const portal = me!.contexts.studentLinks.length + me!.contexts.guardianLinks.length > 0;
  const links = [
    ...me!.contexts.studentLinks.map((l) => ({ studentId: l.studentId, label: `${l.teacherName} (öğrenci)` })),
    ...me!.contexts.guardianLinks.map((l) => ({ studentId: l.studentId, label: `${l.studentName} — ${l.teacherName} (veli)` })),
  ];
  return (
    <>
      <Card>
        <H2>Hesap</H2>
        <Row>
          <T>{me!.user.email}</T>
          {me!.user.emailVerified ? <Badge tone="ok">Doğrulandı</Badge> : <Badge tone="warn">Doğrulanmadı</Badge>}
        </Row>
        <Input label="Ad" value={name} onChangeText={setName} />
        <Button small title="Kaydet" onPress={async () => { try { await api.patch('/me', { name }); await reload(); setMsg('Kaydedildi'); } catch (e) { setMsg(errorMessage(e)); } }} />
        {msg && <Alert>{msg}</Alert>}
        {me!.contexts.teacher && portal && (
          <Row>
            <Button small kind={mode === 'teacher' ? 'primary' : 'default'} title="Öğretmen görünümü" onPress={() => { setMode('teacher'); router.replace('/'); }} />
            <Button small kind={mode === 'portal' ? 'primary' : 'default'} title="Öğrenci/veli görünümü" onPress={() => { setMode('portal'); router.replace('/'); }} />
          </Row>
        )}
        <Button small title="Davet kodu gir" onPress={() => router.push('/invite')} />
        <Button small kind="danger" title="Çıkış yap" onPress={async () => { await logout(); router.replace('/login'); }} />
      </Card>
      {mode === 'portal' && links.length > 0 && (
        <Card>
          <H2>Öğretmen bağlantılarım</H2>
          {links.map((l) => (
            <ListItem
              key={l.studentId + l.label}
              title={l.label}
              right={<Button small title="Kaldır" onPress={() => RNAlert.alert('Bağlantı kaldırılsın mı?', 'Öğretmenin kayıtları silinmez.', [{ text: 'Vazgeç' }, { text: 'Kaldır', style: 'destructive', onPress: async () => { await api.del(`/me/links/${l.studentId}`); await reload(); } }])} />}
            />
          ))}
        </Card>
      )}
      <Card>
        <H2>Bildirim tercihleri</H2>
        {prefs.data?.map((p) => (
          <ListItem
            key={p.category}
            title={CATS[p.category] ?? p.category}
            right={<Button small kind={p.enabled ? 'primary' : 'default'} disabled={p.locked} title={p.enabled ? 'Açık' : 'Kapalı'} onPress={async () => { await api.put('/notifications/prefs', { category: p.category, enabled: !p.enabled }); void qc.invalidateQueries({ queryKey: ['prefs'] }); }} />}
          />
        ))}
      </Card>
    </>
  );
}

export default function Settings() {
  return (
    <Screen>
      <SettingsBody />
    </Screen>
  );
}
