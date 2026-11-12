import { router } from 'expo-router';
import { api } from '../../src/api';
import { MobileCalendar } from '../../src/calendar';
import { deviceZone } from '../../src/format';
import type { PortalLesson } from '../../src/portal';
import { Screen, T } from '../../src/ui';

/** Tüm öğretmenlerin dersleri tek takvimde. */
export default function PortalCalendar() {
  return (
    <Screen title="Takvim">
      <T muted size={13}>Tüm öğretmenlerinizin dersleri</T>
      <MobileCalendar
        zone={deviceZone()}
        queryKey={['portal', 'cal']}
        onOpen={(id) => router.push(`/plesson/${id}`)}
        load={async (from, to) =>
          (await api.get<PortalLesson[]>(`/portal/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).map((l) => ({
            id: l.id,
            startsAt: l.startsAt,
            endsAt: l.endsAt,
            status: l.status,
            label: l.teacherName,
            sub: l.title ?? l.targetName,
          }))
        }
      />
    </Screen>
  );
}
