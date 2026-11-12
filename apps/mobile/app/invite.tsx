import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import type { InvitePreviewDto } from '@derslik/shared';
import { api, errorMessage } from '../src/api';
import { useAuth } from '../src/auth';
import { Alert, Button, Card, Input, Screen, Segmented, T } from '../src/ui';

/** Önce davetin kime ait olduğu gösterilir; sonra mevcut ya da yeni hesapla kabul edilir. */
export default function Invite() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { me, reload, setMode } = useAuth();
  const [code, setCode] = useState(params.code ?? '');
  const [preview, setPreview] = useState<InvitePreviewDto | null>(null);
  const [acc, setAcc] = useState<'new' | 'login'>('new');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setErr(null);
    try {
      setPreview(await api.post<InvitePreviewDto>('/invites/preview', { code }));
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const accept = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (!me) {
        if (acc === 'new') await api.register({ ...f, email: f.email.trim(), role: 'member' });
        else await api.login(f.email.trim(), f.password);
      }
      await api.post('/invites/accept', { code });
      await reload();
      setMode('portal');
      router.replace('/');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {!preview ? (
        <Card>
          <Input label="Davet kodu" value={code} onChangeText={setCode} autoCapitalize="characters" hint="Öğretmeninizin paylaştığı kod" />
          {err && <Alert tone="danger">{err}</Alert>}
          <Button kind="primary" title="Devam" onPress={check} disabled={code.trim().length < 8} />
        </Card>
      ) : (
        <Card>
          <Alert>
            {preview.teacherName} sizi {preview.studentDisplayName} kaydına {preview.kind === 'student' ? 'öğrenci' : 'veli'} olarak davet ediyor. Bu siz değilseniz kabul etmeyin.
          </Alert>
          {me ? (
            <T>{me.user.email} hesabıyla kabul edeceksiniz.</T>
          ) : (
            <>
              <Segmented value={acc} onChange={setAcc} options={[{ id: 'new', label: 'Yeni hesap' }, { id: 'login', label: 'Hesabım var' }]} />
              {acc === 'new' && <Input label="Adınız" value={f.name} onChangeText={(name) => setF({ ...f, name })} />}
              <Input label="E-posta" value={f.email} onChangeText={(email) => setF({ ...f, email })} autoCapitalize="none" keyboardType="email-address" />
              <Input label="Parola" value={f.password} onChangeText={(password) => setF({ ...f, password })} secureTextEntry hint={acc === 'new' ? 'En az 10 karakter' : undefined} />
            </>
          )}
          {err && <Alert tone="danger">{err}</Alert>}
          <Button kind="primary" title={busy ? 'Bağlanıyor…' : 'Kabul et ve bağlan'} onPress={accept} disabled={busy} />
        </Card>
      )}
    </Screen>
  );
}
