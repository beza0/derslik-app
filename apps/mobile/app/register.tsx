import { useState } from 'react';
import { router } from 'expo-router';
import { api, errorMessage } from '../src/api';
import { useAuth } from '../src/auth';
import { Alert, Button, Card, Input, Screen, T } from '../src/ui';

/** Kısa başlangıç: hesap → (isteğe bağlı) ilk öğrenci. */
export default function Register() {
  const { reload } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [student, setStudent] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul';

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.register({ ...f, email: f.email.trim(), role: 'teacher', timezone });
      setStep(2);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const finish = async (skip: boolean) => {
    setBusy(true);
    try {
      if (!skip && student.trim()) await api.post('/students', { displayName: student.trim() });
      await reload();
      router.replace('/');
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };

  if (step === 2)
    return (
      <Screen title="İlk öğrenciniz">
        <T muted>Yalnızca ad yeterli. Öğrencinin hesap açması gerekmez.</T>
        <Card>
          <Input label="Öğrenci adı" value={student} onChangeText={setStudent} placeholder="Örn. Elif" />
          {err && <Alert tone="danger">{err}</Alert>}
          <Button kind="primary" title="Ekle ve başla" onPress={() => finish(false)} disabled={busy || !student.trim()} />
          <Button title="Şimdilik atla" onPress={() => finish(true)} disabled={busy} />
        </Card>
      </Screen>
    );
  return (
    <Screen>
      <Card>
        <Input label="Adınız" value={f.name} onChangeText={(name) => setF({ ...f, name })} autoComplete="name" />
        <Input label="E-posta" value={f.email} onChangeText={(email) => setF({ ...f, email })} autoCapitalize="none" keyboardType="email-address" />
        <Input label="Parola" hint="En az 10 karakter" value={f.password} onChangeText={(password) => setF({ ...f, password })} secureTextEntry autoComplete="new-password" />
        <T muted size={13}>Saat dilimi: {timezone}</T>
        {err && <Alert tone="danger">{err}</Alert>}
        <Button kind="primary" title={busy ? 'Hesap açılıyor…' : 'Ücretsiz başla'} onPress={create} disabled={busy || !f.name || !f.email || f.password.length < 10} />
        <T muted size={13}>Ücretsiz planda 1 aktif öğrenci ve sınırlı AI kullanımı vardır.</T>
      </Card>
    </Screen>
  );
}
