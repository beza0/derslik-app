import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, sql } from 'drizzle-orm';
import { ErrorCode, type EntitlementDto } from '@derslik/shared';
import { DB, type Db, type Tx } from '../db/db';
import { plan, planVersion, student, subscription, usageCounter, workspace } from '../db/schema';
import { AppError } from '../common/errors';

export interface Limits {
  planCode: string;
  planName: string;
  activeStudentLimit: number;
  aiMonthlyQuota: number;
  status: EntitlementDto['subscriptionStatus'];
  currentPeriodEnd: Date | null;
}

export function currentPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 7); // YYYY-MM (UTC)
}

@Injectable()
export class EntitlementsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Ücretsiz planın güncel sürümü. */
  async freePlanVersion(tx: Tx = this.db) {
    const [row] = await tx
      .select({ id: planVersion.id })
      .from(planVersion)
      .innerJoin(plan, eq(plan.id, planVersion.planId))
      .where(and(eq(plan.isFree, true), eq(planVersion.isCurrent, true)))
      .limit(1);
    if (!row) throw new Error('Ücretsiz plan tanımlı değil (seed çalıştırıldı mı?)');
    return row.id;
  }

  /**
   * Çalışma alanının geçerli limitleri. Ücretli abonelik süresi dolmuş/iptal edilmişse
   * ücretsiz plan limitleri geçerlidir; veriler silinmez.
   */
  async limits(workspaceId: string, tx: Tx = this.db, now = new Date()): Promise<Limits> {
    const [sub] = await tx
      .select({
        status: subscription.status,
        periodEnd: subscription.currentPeriodEnd,
        planCode: plan.code,
        planName: plan.name,
        limit: planVersion.activeStudentLimit,
        quota: planVersion.aiMonthlyQuota,
      })
      .from(subscription)
      .innerJoin(planVersion, eq(planVersion.id, subscription.planVersionId))
      .innerJoin(plan, eq(plan.id, planVersion.planId))
      .where(eq(subscription.workspaceId, workspaceId))
      .limit(1);

    const paidValid =
      sub &&
      (sub.status === 'active' || sub.status === 'past_due' || sub.status === 'canceled') &&
      sub.periodEnd !== null &&
      sub.periodEnd > now;
    if (sub && (sub.status === 'free' || paidValid)) {
      return {
        planCode: sub.planCode,
        planName: sub.planName,
        activeStudentLimit: sub.limit,
        aiMonthlyQuota: sub.quota,
        status: sub.status,
        currentPeriodEnd: sub.periodEnd,
      };
    }
    const [free] = await tx
      .select({ code: plan.code, name: plan.name, limit: planVersion.activeStudentLimit, quota: planVersion.aiMonthlyQuota })
      .from(planVersion)
      .innerJoin(plan, eq(plan.id, planVersion.planId))
      .where(and(eq(plan.isFree, true), eq(planVersion.isCurrent, true)))
      .limit(1);
    if (!free) throw new Error('Ücretsiz plan tanımlı değil');
    return {
      planCode: free.code,
      planName: free.name,
      activeStudentLimit: free.limit,
      aiMonthlyQuota: free.quota,
      status: sub ? 'expired' : 'free',
      currentPeriodEnd: sub?.periodEnd ?? null,
    };
  }

  async activeStudentCount(workspaceId: string, tx: Tx = this.db): Promise<number> {
    const [row] = await tx
      .select({ n: count() })
      .from(student)
      .where(and(eq(student.workspaceId, workspaceId), eq(student.status, 'active')));
    return Number(row?.n ?? 0);
  }

  /**
   * Aktif öğrenci sayısını `adding` kadar artırmadan önce çağrılır. Çalışma alanı satırını kilitler;
   * böylece eşzamanlı eklemeler sırayla değerlendirilir ve limit aşılamaz. Mutlaka transaction içinde çağrılmalı.
   */
  async assertCanActivate(tx: Tx, workspaceId: string, adding: number): Promise<void> {
    await tx.execute(sql`SELECT id FROM ${workspace} WHERE ${workspace.id} = ${workspaceId} FOR UPDATE`);
    const limits = await this.limits(workspaceId, tx);
    const current = await this.activeStudentCount(workspaceId, tx);
    if (current + adding > limits.activeStudentLimit) {
      throw new AppError(ErrorCode.PLAN_LIMIT_REACHED, 'Paketinizin aktif öğrenci sınırına ulaştınız', {
        limit: limits.activeStudentLimit,
        current,
        requested: adding,
        planCode: limits.planCode,
      });
    }
  }

  async entitlement(workspaceId: string): Promise<EntitlementDto> {
    const limits = await this.limits(workspaceId);
    const activeStudentCount = await this.activeStudentCount(workspaceId);
    const [usage] = await this.db
      .select({ value: usageCounter.value })
      .from(usageCounter)
      .where(
        and(
          eq(usageCounter.workspaceId, workspaceId),
          eq(usageCounter.metric, 'ai_request'),
          eq(usageCounter.period, currentPeriod()),
        ),
      );
    return {
      planCode: limits.planCode,
      planName: limits.planName,
      activeStudentLimit: limits.activeStudentLimit,
      activeStudentCount,
      overLimit: activeStudentCount > limits.activeStudentLimit,
      aiMonthlyQuota: limits.aiMonthlyQuota,
      aiUsedThisPeriod: usage?.value ?? 0,
      subscriptionStatus: limits.status,
      currentPeriodEnd: limits.currentPeriodEnd?.toISOString() ?? null,
    };
  }
}
