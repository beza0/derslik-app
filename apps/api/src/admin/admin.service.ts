import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, ilike, or, sql } from 'drizzle-orm';
import { ErrorCode } from '@derslik/shared';
import { DB, type Db } from '../db/db';
import {
  adminAccessGrant,
  appError,
  appSetting,
  appUser,
  auditLog,
  plan,
  planVersion,
  session,
  subscription,
  workspace,
} from '../db/schema';
import { AppError, forbidden, notFound } from '../common/errors';
import { type TeacherCtx } from '../common/access.service';
import { currentPeriod } from '../billing/entitlements.service';

export interface PlanVersionInput {
  activeStudentLimit: number;
  aiMonthlyQuota: number;
  priceMinor: number | null;
  currency: string;
  period: 'monthly' | 'yearly';
  applyToExistingSubscribers: boolean;
}

/**
 * Yönetici işlemleri. Yönetici öğrenci içeriğine (not, ödev, teslim, ders ayrıntısı) ERİŞEMEZ.
 * Destek gerekiyorsa öğretmenin onayladığı, süreli, gerekçeli ve denetim kaydına yazılan erişim
 * yalnızca sayısal özet verir.
 */
@Injectable()
export class AdminService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async assertAdmin(userId: string) {
    const [u] = await this.db.select({ isAdmin: appUser.isAdmin, status: appUser.status }).from(appUser).where(eq(appUser.id, userId));
    if (!u?.isAdmin || u.status !== 'active') throw forbidden('Yönetici yetkisi gerekli');
  }

  private audit(actor: string, action: string, target?: string, meta: Record<string, unknown> = {}, workspaceId?: string) {
    return this.db.insert(auditLog).values({ actorUserId: actor, action, target: target ?? null, meta, workspaceId: workspaceId ?? null });
  }

  async stats() {
    const one = async (q: ReturnType<typeof sql>) => Number((await this.db.execute<{ n: number }>(q)).rows[0]?.n ?? 0);
    return {
      users: await one(sql`SELECT count(*)::int n FROM app_user WHERE status <> 'deleted'`),
      teachers: await one(sql`SELECT count(*)::int n FROM workspace`),
      studentAccounts: await one(sql`SELECT count(DISTINCT user_id)::int n FROM student_account_link`),
      guardianAccounts: await one(sql`SELECT count(DISTINCT user_id)::int n FROM guardian_link`),
      activeStudentRecords: await one(sql`SELECT count(*)::int n FROM student WHERE status = 'active'`),
      lessonsNext7Days: await one(sql`SELECT count(*)::int n FROM lesson WHERE status = 'scheduled' AND starts_at BETWEEN now() AND now() + interval '7 days'`),
      subscriptions: (await this.db.execute<{ status: string; n: number }>(sql`SELECT status, count(*)::int n FROM subscription GROUP BY status`)).rows,
      aiThisMonth: (
        await this.db.execute<{ requests: number; cost: number }>(
          sql`SELECT coalesce(sum(value),0)::int requests, coalesce(sum(cost_micro_usd),0)::bigint cost FROM usage_counter WHERE metric = 'ai_request' AND period = ${currentPeriod()}`,
        )
      ).rows[0],
      errors24h: await one(sql`SELECT count(*)::int n FROM app_error WHERE created_at > now() - interval '1 day'`),
    };
  }

  async errors(limit = 100) {
    return this.db.select().from(appError).orderBy(desc(appError.createdAt)).limit(limit);
  }

  async users(q?: string) {
    return this.db
      .select({
        id: appUser.id,
        email: appUser.email,
        name: appUser.name,
        status: appUser.status,
        isAdmin: appUser.isAdmin,
        createdAt: appUser.createdAt,
        workspaceId: workspace.id,
        subscriptionStatus: subscription.status,
        planName: plan.name,
      })
      .from(appUser)
      .leftJoin(workspace, eq(workspace.ownerUserId, appUser.id))
      .leftJoin(subscription, eq(subscription.workspaceId, workspace.id))
      .leftJoin(planVersion, eq(planVersion.id, subscription.planVersionId))
      .leftJoin(plan, eq(plan.id, planVersion.planId))
      .where(q ? or(ilike(appUser.email, `%${q}%`), ilike(appUser.name, `%${q}%`)) : undefined)
      .orderBy(desc(appUser.createdAt))
      .limit(200);
  }

  async setUserStatus(actor: string, userId: string, status: 'active' | 'suspended') {
    if (actor === userId) throw new AppError(ErrorCode.CONFLICT, 'Kendi hesabınızı askıya alamazsınız');
    const [row] = await this.db.update(appUser).set({ status, updatedAt: new Date() }).where(eq(appUser.id, userId)).returning({ id: appUser.id });
    if (!row) throw notFound('Kullanıcı');
    if (status === 'suspended') await this.db.update(session).set({ revokedAt: new Date() }).where(eq(session.userId, userId));
    await this.audit(actor, `user.${status}`, userId);
  }

  async plans() {
    const plans = await this.db.select().from(plan).orderBy(plan.createdAt);
    const versions = await this.db.select().from(planVersion).orderBy(desc(planVersion.version));
    return plans.map((p) => ({ ...p, versions: versions.filter((v) => v.planId === p.id) }));
  }

  async createPlan(actor: string, input: { code: string; name: string; isPublic: boolean; version: PlanVersionInput }) {
    return this.db.transaction(async (tx) => {
      const [p] = await tx.insert(plan).values({ code: input.code, name: input.name, isPublic: input.isPublic }).returning();
      const { applyToExistingSubscribers: _a, ...v } = input.version;
      await tx.insert(planVersion).values({ ...v, planId: p!.id, version: 1 });
      await tx.insert(auditLog).values({ actorUserId: actor, action: 'plan.create', target: p!.id });
      return p!;
    });
  }

  async updatePlan(actor: string, planId: string, patch: { name?: string; isPublic?: boolean }) {
    const [p] = await this.db.update(plan).set(patch).where(eq(plan.id, planId)).returning();
    if (!p) throw notFound('Paket');
    await this.audit(actor, 'plan.update', planId, patch);
    return p;
  }

  /**
   * Fiyat/limit değişikliği yeni sürümdür; geçmiş satın almaların şartları sessizce değişmez.
   * `applyToExistingSubscribers` yalnızca açıkça seçilirse mevcut aboneler (bir sonraki yenilemede) yeni sürüme geçer.
   */
  async addVersion(actor: string, planId: string, input: PlanVersionInput) {
    return this.db.transaction(async (tx) => {
      const [p] = await tx.select().from(plan).where(eq(plan.id, planId));
      if (!p) throw notFound('Paket');
      const [{ max }] = (await tx.execute<{ max: number }>(sql`SELECT coalesce(max(version),0)::int max FROM plan_version WHERE plan_id = ${planId}`)).rows as [{ max: number }];
      const [prev] = await tx.select().from(planVersion).where(and(eq(planVersion.planId, planId), eq(planVersion.isCurrent, true)));
      await tx.update(planVersion).set({ isCurrent: false }).where(eq(planVersion.planId, planId));
      const [v] = await tx
        .insert(planVersion)
        .values({
          planId,
          version: max + 1,
          activeStudentLimit: input.activeStudentLimit,
          aiMonthlyQuota: input.aiMonthlyQuota,
          priceMinor: input.priceMinor,
          currency: input.currency,
          period: input.period,
          applyToExisting: input.applyToExistingSubscribers,
          isCurrent: true,
        })
        .returning();
      let moved = 0;
      // Ücretsiz plan limitleri tüm ücretsiz kullanıcılara hemen uygulanır (satın alma şartı yok).
      if (prev && (p.isFree || input.applyToExistingSubscribers)) {
        const res = await tx.update(subscription).set({ planVersionId: v!.id }).where(eq(subscription.planVersionId, prev.id)).returning({ id: subscription.id });
        moved = res.length;
      }
      await tx.insert(auditLog).values({ actorUserId: actor, action: 'plan.version', target: planId, meta: { version: v!.version, moved } });
      return { version: v!, movedSubscribers: moved };
    });
  }

  async grant(actor: string, workspaceId: string, planVersionId: string, days: number) {
    const [row] = await this.db
      .update(subscription)
      .set({ planVersionId, status: 'active', provider: 'admin_grant', currentPeriodEnd: new Date(Date.now() + days * 864e5), updatedAt: new Date() })
      .where(eq(subscription.workspaceId, workspaceId))
      .returning();
    if (!row) throw notFound('Çalışma alanı');
    await this.audit(actor, 'subscription.grant', workspaceId, { planVersionId, days }, workspaceId);
    return row;
  }

  async settings() {
    return this.db.select().from(appSetting);
  }

  async setSetting(actor: string, key: string, value: unknown) {
    await this.db
      .insert(appSetting)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSetting.key, set: { value, updatedAt: new Date() } });
    await this.audit(actor, 'setting.update', key, { value });
  }

  async auditLog(limit = 200) {
    return this.db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
  }

  // ───────────── Destek erişimi ─────────────

  async requestAccess(actor: string, workspaceId: string, reason: string) {
    const [ws] = await this.db.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, workspaceId));
    if (!ws) throw notFound('Çalışma alanı');
    const [g] = await this.db.insert(adminAccessGrant).values({ workspaceId, adminUserId: actor, reason }).returning();
    await this.audit(actor, 'support.request', g!.id, { reason }, workspaceId);
    return g!;
  }

  async teacherGrants(t: TeacherCtx) {
    return this.db
      .select({ id: adminAccessGrant.id, reason: adminAccessGrant.reason, status: adminAccessGrant.status, expiresAt: adminAccessGrant.expiresAt, createdAt: adminAccessGrant.createdAt })
      .from(adminAccessGrant)
      .where(eq(adminAccessGrant.workspaceId, t.workspaceId))
      .orderBy(desc(adminAccessGrant.createdAt));
  }

  async decideGrant(t: TeacherCtx, id: string, decision: 'approve' | 'deny' | 'revoke', hours = 24) {
    const status = decision === 'approve' ? 'approved' : decision === 'deny' ? 'denied' : 'revoked';
    const [g] = await this.db
      .update(adminAccessGrant)
      .set({
        status,
        approvedAt: decision === 'approve' ? new Date() : null,
        expiresAt: decision === 'approve' ? new Date(Date.now() + Math.min(hours, 72) * 3600_000) : new Date(),
      })
      .where(and(eq(adminAccessGrant.id, id), eq(adminAccessGrant.workspaceId, t.workspaceId)))
      .returning();
    if (!g) throw notFound('Erişim talebi');
    await this.audit(t.userId, `support.${status}`, id, {}, t.workspaceId);
    return g;
  }

  /** Onaylı ve süresi dolmamış erişimle yalnızca sayısal özet (içerik yok). Her görüntüleme denetim kaydına yazılır. */
  async supportView(actor: string, workspaceId: string) {
    const [g] = await this.db
      .select()
      .from(adminAccessGrant)
      .where(and(eq(adminAccessGrant.workspaceId, workspaceId), eq(adminAccessGrant.adminUserId, actor), eq(adminAccessGrant.status, 'approved'), gt(adminAccessGrant.expiresAt, new Date())));
    if (!g) throw forbidden('Öğretmenin onayladığı geçerli bir destek erişimi yok');
    await this.audit(actor, 'support.view', g.id, {}, workspaceId);
    const r = await this.db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM student WHERE workspace_id = ${workspaceId} AND status = 'active') AS active_students,
        (SELECT count(*)::int FROM student WHERE workspace_id = ${workspaceId} AND status = 'archived') AS archived_students,
        (SELECT count(*)::int FROM student_group WHERE workspace_id = ${workspaceId}) AS groups,
        (SELECT count(*)::int FROM lesson WHERE workspace_id = ${workspaceId}) AS lessons,
        (SELECT count(*)::int FROM assignment WHERE workspace_id = ${workspaceId}) AS assignments,
        (SELECT status FROM subscription WHERE workspace_id = ${workspaceId}) AS subscription_status`);
    return { grantExpiresAt: g.expiresAt, summary: r.rows[0] };
  }
}
