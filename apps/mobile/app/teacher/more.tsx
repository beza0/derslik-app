import { router } from 'expo-router';
import { Card, ListItem, Screen } from '../../src/ui';

export default function More() {
  const items: [string, string][] = [
    ['Ödevler', '/assignments'],
    ['Gruplar', '/groups'],
    ['İptal ve erteleme talepleri', '/requests'],
    ['Bildirimler', '/notifications'],
    ['Abonelik', '/billing'],
    ['Ayarlar', '/settings'],
  ];
  return (
    <Screen title="Diğer">
      <Card>
        {items.map(([label, href]) => (
          <ListItem key={href} title={label} onPress={() => router.push(href as never)} right={<></>} />
        ))}
      </Card>
    </Screen>
  );
}
