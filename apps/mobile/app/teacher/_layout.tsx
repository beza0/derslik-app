import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { useTheme } from '../../src/ui';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;

export default function TeacherTabs() {
  const c = useTheme();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.primary, tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border }, tabBarLabelStyle: { fontSize: 11 } }}>
      <Tabs.Screen name="index" options={{ title: 'Bugün', tabBarIcon: icon('⌂') }} />
      <Tabs.Screen name="calendar" options={{ title: 'Takvim', tabBarIcon: icon('▦') }} />
      <Tabs.Screen name="students" options={{ title: 'Öğrenciler', tabBarIcon: icon('☺') }} />
      <Tabs.Screen name="assistant" options={{ title: 'Asistan', tabBarIcon: icon('✦') }} />
      <Tabs.Screen name="more" options={{ title: 'Diğer', tabBarIcon: icon('⋯') }} />
    </Tabs>
  );
}
