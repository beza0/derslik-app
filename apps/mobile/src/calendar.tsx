import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { t } from '@derslik/shared';
import { Badge, Button, Card, Empty, ListItem, Q, Row, Segmented, T } from './ui';
import { dayTitle, fmtTime } from './format';

export interface CalItem {
  id: string;
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'done' | 'cancelled';
  label: string;
  sub?: string;
}

/** Telefonda kolay okunur günlük/haftalık liste görünümü. */
export function MobileCalendar({ zone, queryKey, load, onOpen }: { zone: string; queryKey: unknown[]; load: (from: string, to: string) => Promise<CalItem[]>; onOpen: (id: string) => void }) {
  const [view, setView] = useState<'day' | 'week'>('day');
  const [anchor, setAnchor] = useState<DateTime>(DateTime.now().setZone(zone).startOf('day'));
  const from = view === 'day' ? anchor : anchor.startOf('week');
  const to = from.plus(view === 'day' ? { days: 1 } : { weeks: 1 });
  const q = useQuery({ queryKey: [...queryKey, view, from.toISO()], queryFn: () => load(from.toISO()!, to.toISO()!) });
  const days = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const l of q.data ?? []) {
      const k = DateTime.fromISO(l.startsAt).setZone(zone).toISODate()!;
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    return [...m.entries()];
  }, [q.data, zone]);
  const step = view === 'day' ? { days: 1 } : { weeks: 1 };
  return (
    <View style={{ gap: 12 }}>
      <Segmented value={view} onChange={setView} options={[{ id: 'day', label: 'Gün' }, { id: 'week', label: 'Hafta' }]} />
      <Row>
        <Button small title="‹" onPress={() => setAnchor(anchor.minus(step))} />
        <Button small title="Bugün" onPress={() => setAnchor(DateTime.now().setZone(zone).startOf('day'))} />
        <Button small title="›" onPress={() => setAnchor(anchor.plus(step))} />
        <T bold>{view === 'day' ? dayTitle(anchor) : `${from.setLocale('tr').toFormat('d LLL')} – ${to.minus({ days: 1 }).setLocale('tr').toFormat('d LLL')}`}</T>
      </Row>
      <Q q={q} empty={(d) => d.length === 0 && 'Ders yok'}>
        {() => (
          <View style={{ gap: 12 }}>
            {days.map(([day, items]) => (
              <Card key={day}>
                {view === 'week' && <T bold>{dayTitle(DateTime.fromISO(day))}</T>}
                {items.map((l) => (
                  <ListItem
                    key={l.id}
                    title={`${fmtTime(l.startsAt, zone)}–${fmtTime(l.endsAt, zone)}  ${l.label}`}
                    subtitle={l.sub}
                    onPress={() => onOpen(l.id)}
                    right={<Badge tone={l.status === 'done' ? 'ok' : l.status === 'cancelled' ? 'danger' : 'info'}>{t(`status.${l.status}`)}</Badge>}
                  />
                ))}
              </Card>
            ))}
          </View>
        )}
      </Q>
      {q.data?.length === 0 && <Empty title="" />}
    </View>
  );
}
