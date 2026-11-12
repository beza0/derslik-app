import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '../src/api';
import { AuthProvider } from '../src/auth';
import { useTheme } from '../src/ui';

function Nav() {
  const c = useTheme();
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.surface },
          headerTintColor: c.text,
          contentStyle: { backgroundColor: c.bg },
          headerBackTitle: 'Geri',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ title: 'Öğretmen hesabı' }} />
        <Stack.Screen name="invite" options={{ title: 'Daveti kabul et' }} />
        <Stack.Screen name="teacher" options={{ headerShown: false }} />
        <Stack.Screen name="portal" options={{ headerShown: false }} />
        <Stack.Screen name="student/[id]" options={{ title: 'Öğrenci' }} />
        <Stack.Screen name="lesson/[id]" options={{ title: 'Ders' }} />
        <Stack.Screen name="new-lesson" options={{ title: 'Ders ekle', presentation: 'modal' }} />
        <Stack.Screen name="assignments" options={{ title: 'Ödevler' }} />
        <Stack.Screen name="assignment/[id]" options={{ title: 'Ödev' }} />
        <Stack.Screen name="hw/[id]" options={{ title: 'Ödev' }} />
        <Stack.Screen name="plesson/[id]" options={{ title: 'Ders' }} />
        <Stack.Screen name="notifications" options={{ title: 'Bildirimler' }} />
        <Stack.Screen name="requests" options={{ title: 'Talepler' }} />
        <Stack.Screen name="groups" options={{ title: 'Gruplar' }} />
        <Stack.Screen name="billing" options={{ title: 'Abonelik' }} />
        <Stack.Screen name="settings" options={{ title: 'Ayarlar' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Nav />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
