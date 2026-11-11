/**
 * Geliştirme seed'i: paketler + demo hesaplar. YALNIZCA geliştirme içindir; üretimde çalışmayı reddeder.
 * Demo parolası herkes için aynıdır ve README'de yazılıdır.
 */
import { hash } from '@node-rs/argon2';
import { eq, sql } from 'drizzle-orm';
import { loadEnvFile } from '../env-file';
import { createDb, createPool } from './db';
import { runMigrations } from './migrator';
import { seedPlans } from './seed-plans';
import { appUser, guardianLink, plan, planVersion, student, studentAccountLink, subscription, workspace } from './schema';

const DEMO_PASSWORD = 'demo-parola-123';

async function main() {
  loadEnvFile();
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seed üretimde çalıştırılamaz');
  const pool = createPool(process.env.DATABASE_URL!);
  const db = createDb(pool);
  try {
    await runMigrations(pool);
    await seedPlans(db);

    const passwordHash = await hash(DEMO_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
    const user = async (email: string, name: string, isAdmin = false) => {
      const [existing] = await db.select().from(appUser).where(sql`lower(${appUser.email}) = ${email}`);
      if (existing) return existing.id;
      const [u] = await db.insert(appUser).values({ email, name, passwordHash, isAdmin, emailVerifiedAt: new Date() }).returning();
      return u!.id;
    };

    const teacherId = await user('ogretmen@demo.derslik.test', 'Demo Öğretmen');
    const studentUserId = await user('ogrenci@demo.derslik.test', 'Demo Öğrenci');
    const parentUserId = await user('veli@demo.derslik.test', 'Demo Veli');
    await user('admin@demo.derslik.test', 'Demo Yönetici', true);

    let [ws] = await db.select().from(workspace).where(eq(workspace.ownerUserId, teacherId));
    if (!ws) {
      [ws] = await db.insert(workspace).values({ ownerUserId: teacherId, displayName: 'Demo Öğretmen' }).returning();
      // Demo öğretmen birkaç öğrenci görebilsin diye satışa kapalı taslak plana bağlanır.
      const [pro] = await db
        .select({ id: planVersion.id })
        .from(planVersion)
        .innerJoin(plan, eq(plan.id, planVersion.planId))
        .where(eq(plan.code, 'pro_draft'));
      await db.insert(subscription).values({
        workspaceId: ws!.id,
        planVersionId: pro!.id,
        status: 'active',
        provider: 'sandbox',
        currentPeriodEnd: new Date(Date.now() + 365 * 864e5),
      });
      const rows = await db
        .insert(student)
        .values([
          { workspaceId: ws!.id, displayName: 'Elif Demir', level: '8. sınıf', goal: 'LGS', subject: 'Matematik' },
          { workspaceId: ws!.id, displayName: 'Ali Kaya', level: '11. sınıf', subject: 'Matematik' },
          { workspaceId: ws!.id, displayName: 'Ece Yılmaz', level: '12. sınıf', goal: 'YKS', subject: 'Matematik' },
        ])
        .returning();
      await db.insert(studentAccountLink).values({ studentId: rows[0]!.id, workspaceId: ws!.id, userId: studentUserId });
      await db.insert(guardianLink).values({ studentId: rows[0]!.id, workspaceId: ws!.id, userId: parentUserId });
    }
    console.log(`Demo hazır. Parola (tüm demo hesaplar): ${DEMO_PASSWORD}`);
    console.log('ogretmen@demo.derslik.test, ogrenci@demo.derslik.test, veli@demo.derslik.test, admin@demo.derslik.test');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
