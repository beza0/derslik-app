import { router } from 'expo-router';
import type { LessonDto } from '@derslik/shared';
import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { MobileCalendar } from '../../src/calendar';
import { Button, Screen } from '../../src/ui';

export default function TeacherCalendar() {
  const { me } = useAuth();
  const zone = me!.contexts.teacher!.timezone;
  return (
    <Screen title="Takvim" right={<Button small kind="primary" title="+ Ders" onPress={() => router.push('/new-lesson')} />}>
      <MobileCalendar
        zone={zone}
        queryKey={['calendar']}
        onOpen={(id) => router.push(`/lesson/${id}`)}
        load={async (from, to) =>
          (await api.get<LessonDto[]>(`/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).map((l) => ({
            id: l.id,
            startsAt: l.startsAt,
            endsAt: l.endsAt,
            status: l.status,
            label: l.targetName,
            sub: l.title ?? undefined,
          }))
        }
      />
    </Screen>
  );
}
