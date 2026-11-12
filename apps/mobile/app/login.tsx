import { useState } from 'react';
import { router } from 'expo-router';
import { api, errorMessage } from '../src/api';
import { useAuth } from '../src/auth';
import { Alert, Button, Card, Input, Screen, T } from '../src/ui';

export default function Login() {
  const { reload } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.login(email.trim(), password);
      await reload();
      router.replace('/');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen title="Derslik">
      <T muted>Özel derslerin tek defteri</T>
      <Card>
        <Input label="E-posta" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Input label="Parola" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
        {err && <Alert tone="danger">{err}</Alert>}
        <Button kind="primary" title={busy ? 'Giriş yapılıyor…' : 'Giriş yap'} onPress={submit} disabled={busy || !email || !password} />
      </Card>
      <Button title="Öğretmen olarak ücretsiz hesap aç" onPress={() => router.push('/register')} />
      <Button title="Davet kodum var" onPress={() => router.push('/invite')} />
    </Screen>
  );
}
