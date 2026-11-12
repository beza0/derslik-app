import { Redirect, router } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '../src/auth';
import { Button, Card, Loading, Screen, T } from '../src/ui';

export default function Index() {
  const { me, loading, mode, logout } = useAuth();
  if (loading) return <View style={{ flex: 1, justifyContent: 'center' }}><Loading /></View>;
  if (!me) return <Redirect href="/login" />;
  if (mode === 'teacher') return <Redirect href="/teacher" />;
  if (mode === 'portal') return <Redirect href="/portal" />;
  return (
    <Screen title="Hoş geldiniz">
      <Card>
        <T>{me.user.email} hesabı henüz bir öğretmene bağlı değil. Öğretmeninizin gönderdiği davet koduyla bağlanabilirsiniz.</T>
        <Button kind="primary" title="Davet kodunu gir" onPress={() => router.push('/invite')} />
        <Button title="Çıkış yap" onPress={logout} />
      </Card>
    </Screen>
  );
}
