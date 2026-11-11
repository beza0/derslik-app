import { eq } from 'drizzle-orm';
import type { Db } from './db';
import { plan, planVersion } from './schema';

/**
 * Zorunlu referans verisi: ücretsiz plan (1 aktif öğrenci) ve satışa kapalı örnek "Pro (taslak)".
 * Fiyatlar BİLİNÇLİ OLARAK boş: kesin fiyatlar yönetim panelinden girilecek.
 */
export async function seedPlans(db: Db): Promise<void> {
  const ensure = async (code: string, name: string, isFree: boolean, isPublic: boolean, limit: number, quota: number) => {
    let [p] = await db.select().from(plan).where(eq(plan.code, code));
    if (!p) [p] = await db.insert(plan).values({ code, name, isFree, isPublic }).returning();
    const [v] = await db.select().from(planVersion).where(eq(planVersion.planId, p!.id));
    if (!v) {
      await db.insert(planVersion).values({ planId: p!.id, version: 1, activeStudentLimit: limit, aiMonthlyQuota: quota, priceMinor: null });
    }
  };
  await ensure('free', 'Ücretsiz', true, true, 1, 30);
  await ensure('pro_draft', 'Pro (taslak — fiyat belirlenmedi)', false, false, 30, 1000);
}
