import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EntitlementDto } from '@derslik/shared';
import { api, errorMessage } from '../../api';
import { fmtDate } from '../../format';
import { PageHeader, Q, StatusBadge, useToast } from '../../ui';

interface Plans {
  testMode: boolean;
  paymentsEnabled: boolean;
  plans: { planVersionId: string; code: string; name: string; isFree: boolean; activeStudentLimit: number; aiMonthlyQuota: number; priceMinor: number | null; currency: string; period: string; purchasable: boolean }[];
}

const money = (minor: number, cur: string) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: cur }).format(minor / 100);

export function Billing() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const ent = useQuery({ queryKey: ['entitlement'], queryFn: () => api.get<EntitlementDto>('/billing/entitlement') });
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api.get<Plans>('/billing/plans') });
  const checkout = useMutation({
    mutationFn: (planVersionId: string) => api.post<{ checkoutId: string }>('/billing/checkout', { planVersionId }),
    onSuccess: (c) => nav(`/billing/sandbox/${c.checkoutId}`),
    onError: (e) => toast(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: () => api.post('/billing/cancel'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['entitlement'] }),
  });
  return (
    <>
      <PageHeader title="Abonelik" />
      {plans.data?.testMode && <div className="alert warn" style={{ marginBottom: 12 }}>TEST MODU: Ödemeler gerçek değildir, karttan para çekilmez.</div>}
      <Q q={ent}>
        {(e) => (
          <div className="card stack">
            <div className="row between">
              <h2>{e.planName}</h2>
              <StatusBadge tone={e.subscriptionStatus === 'active' ? 'ok' : e.subscriptionStatus === 'free' ? 'info' : 'warn'}>
                {{ free: 'Ücretsiz', active: 'Aktif', canceled: 'İptal edildi (dönem sonuna kadar geçerli)', past_due: 'Ödeme bekleniyor', expired: 'Süresi doldu' }[e.subscriptionStatus]}
              </StatusBadge>
            </div>
            <dl className="kv">
              <dt>Aktif öğrenci</dt><dd>{e.activeStudentCount} / {e.activeStudentLimit}</dd>
              <dt>AI kullanımı (bu ay)</dt><dd>{e.aiUsedThisPeriod} / {e.aiMonthlyQuota}</dd>
              {e.currentPeriodEnd && (<><dt>Dönem sonu</dt><dd>{fmtDate(e.currentPeriodEnd)}</dd></>)}
            </dl>
            {e.overLimit && <div className="alert warn">Limit üstü: verileriniz silinmez; görüntüleme ve arşivleme açık, yeni öğrenci ekleme kapalı.</div>}
            {e.subscriptionStatus === 'active' && <button className="btn danger" style={{ alignSelf: 'flex-start' }} onClick={() => cancel.mutate()}>Aboneliği iptal et</button>}
          </div>
        )}
      </Q>
      <h2 style={{ margin: '20px 0 10px' }}>Paketler</h2>
      <Q q={plans}>
        {(p) => (
          <div className="grid grid-3">
            {p.plans.map((pl) => (
              <div key={pl.planVersionId} className="card stack">
                <h3>{pl.name}</h3>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{pl.isFree ? 'Ücretsiz' : pl.priceMinor === null ? 'Fiyat belirlenmedi' : `${money(pl.priceMinor, pl.currency)} / ${pl.period === 'monthly' ? 'ay' : 'yıl'}`}</div>
                <div className="small muted">{pl.activeStudentLimit} aktif öğrenci · ayda {pl.aiMonthlyQuota} AI işlemi</div>
                {pl.purchasable && <button className="btn primary" disabled={!p.paymentsEnabled || checkout.isPending} onClick={() => checkout.mutate(pl.planVersionId)}>Satın al</button>}
              </div>
            ))}
          </div>
        )}
      </Q>
    </>
  );
}

/** Sandbox ödeme ekranı (gerçek sağlayıcının yerine). Hak, sunucu imzalı olayı doğrulayınca açılır. */
export function SandboxCheckout() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pay = async (outcome: 'success' | 'fail') => {
    setBusy(true);
    try {
      await api.post(`/billing/sandbox/${id}/pay`, { outcome });
      await qc.invalidateQueries({ queryKey: ['entitlement'] });
      nav('/billing');
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <div className="card stack" style={{ maxWidth: 480 }}>
      <div className="alert warn">TEST ÖDEME EKRANI — gerçek para çekilmez.</div>
      <p style={{ margin: 0 }}>Gerçek ödeme sağlayıcısı bağlandığında bu adım sağlayıcının güvenli ödeme sayfasında olacak.</p>
      {err && <div className="alert danger">{err}</div>}
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={() => pay('success')}>Test ödemesini tamamla</button>
        <button className="btn" disabled={busy} onClick={() => pay('fail')}>Başarısız ödeme dene</button>
      </div>
    </div>
  );
}
