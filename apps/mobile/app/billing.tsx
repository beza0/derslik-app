import { useQuery } from '@tanstack/react-query';
import type { EntitlementDto } from '@derslik/shared';
import { api } from '../src/api';
import { fmtDate } from '../src/format';
import { Alert, Card, H2, Q, Screen, T } from '../src/ui';

/**
 * Mobilde yalnızca abonelik durumu gösterilir. Mağaza kuralları gereği uygulama içinden web ödeme
 * sayfasına yönlendirme YAPILMAZ; mağaza içi satın alma, mağaza hesapları açıldığında eklenecek.
 */
export default function Billing() {
  const q = useQuery({ queryKey: ['entitlement'], queryFn: () => api.get<EntitlementDto>('/billing/entitlement') });
  return (
    <Screen>
      <Q q={q}>
        {(e) => (
          <Card>
            <H2>{e.planName}</H2>
            <T>Aktif öğrenci: {e.activeStudentCount} / {e.activeStudentLimit}</T>
            <T>AI kullanımı (bu ay): {e.aiUsedThisPeriod} / {e.aiMonthlyQuota}</T>
            {e.currentPeriodEnd && <T>Dönem sonu: {fmtDate(e.currentPeriodEnd)}</T>}
            {e.overLimit && <Alert tone="warn">Limit üstü: verileriniz korunur; yeni öğrenci ekleme kapalıdır.</Alert>}
          </Card>
        )}
      </Q>
    </Screen>
  );
}
