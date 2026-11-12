import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { useTheme } from '../../src/ui';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;

/** Öğrenci/veli: AI sekmesi yoktur. */
export default function PortalTabs() {
  const c = useTheme();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.primary, tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border }, tabBarLabelStyle: { fontSize: 11 } }}>
      <Tabs.Screen name="index" options={{ title: 'Bugün', tabBarIcon: icon('⌂') }} />
      <Tabs.Screen name="calendar" options={{ title: 'Takvim', tabBarIcon: icon('▦') }} />
      <Tabs.Screen name="homework" options={{ title: 'Ödevler', tabBarIcon: icon('✎') }} />
      <Tabs.Screen name="notes" options={{ title: 'Notlar', tabBarIcon: icon('❏') }} />
      <Tabs.Screen name="me" options={{ title: 'Ben', tabBarIcon: icon('☺') }} />
    </Tabs>
  );
}
