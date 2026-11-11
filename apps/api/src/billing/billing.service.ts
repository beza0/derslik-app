import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { ErrorCode } from '@derslik/shared';
import { CONFIG, type AppConfig } from '../config';
import { DB, PgError, pgErrorCode, type Db } from '../db/db';
import { auditLog, checkoutSession, paymentEvent, plan, planVersion, subscription, workspace } from '../db/schema';
import { type TeacherCtx } from '../common/access.service';
import { AppError, notFound } from '../common/errors';
import { hmacSha256, randomToken, safeEqual } from '../common/crypto';
import { EntitlementsService } from './entitlements.service';

export interface SandboxEvent {
  id: string;
  type: 'subscription.activated' | 'subscription.renewed' | 'subscription.canceled' | 'subscription.expired' | 'payment.failed';
  workspaceId: string;
  planVersionId?: string;
  checkoutId?: string;
  periodEnd?: string;
}

/**
 * Abonelik hakları YALNIZCA doğrulanmış sağlayıcı olaylarıyla değişir. İstemcinin "ödeme başarılı"
 * demesi hiçbir hak açmaz. Olaylar (provider, event_id) ile tekilleştirilir: aynı olay ikinci kez gelirse
 * hiçbir şey değişmez.
 *
 * İlk sağlayıcı `sandbox`: gerçek para çekmez; imzalı webhook akışını gerçek sağlayıcıyla aynı kodla sınar.
 * iyzico / App Store / Google Play adaptörleri bu arayüze eklenecek (hesap bilgileri bekleniyor).
 */
@Injectable()
export class BillingService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly entitlements: EntitlementsService,
  ) {}

  get enabled() {
    return this.config.PAYMENT_PROVIDER !== 'disabled';
  }

  async plans() {
    const rows = await this.db
      .select({ plan, v: planVersion })
      .from(plan)
      .innerJoin(planVersion, and(eq(planVersion.planId, plan.id), eq(planVersion.isCurrent, true)))
      .where(eq(plan.isPublic, true))
      .orderBy(asc(planVersion.activeStudentLimit));
    return {
      testMode: this.config.PAYMENT_PROVIDER === 'sandbox',
      paymentsEnabled: this.enabled,
      plans: rows.map(({ plan: p, v }) => ({
        planId: p.id,
        planVersionId: v.id,
        code: p.code,
        name: p.name,
        isFree: p.isFree,
        activeStudentLimit: v.activeStudentLimit,
        aiMonthlyQuota: v.aiMonthlyQuota,
        priceMinor: v.priceMinor,
        currency: v.currency,
        period: v.period,
        purchasable: !p.isFree && v.priceMinor !== null,
      })),
    };
  }

  /** Kullanıcı açıkça satın almayı başlatmadan hiçbir ücretli abonelik oluşmaz. */
  async checkout(t: TeacherCtx, planVersionId: string) {
    if (!this.enabled) throw new AppError(ErrorCode.PAYMENT_INVALID, 'Ödeme henüz etkin değil');
    const [v] = await this.db
      .select({ v: planVersion, p: plan })
      .from(planVersion)
      .innerJoin(plan, eq(plan.id, planVersion.planId))
      .where(eq(planVersion.id, planVersionId));
    if (!v || !v.p.isPublic || v.p.isFree || v.v.priceMinor === null || !v.v.isCurrent) {
      throw new AppError(ErrorCode.PAYMENT_INVALID, 'Bu paket satın alınamaz');
    }
    const [cs] = await this.db
      .insert(checkoutSession)
      .values({ workspaceId: t.workspaceId, planVersionId, provider: this.config.PAYMENT_PROVIDER })
      .returning();
    return {
      checkoutId: cs!.id,
      testMode: true,
      // Sandbox "ödeme sayfası" web uygulamasındaki test ekranıdır.
      checkoutUrl: `${this.config.APP_URL}/billing/sandbox/${cs!.id}`,
      amountMinor: v.v.priceMinor,
      currency: v.v.currency,
      planName: v.p.name,
    };
  }

  sign(body: string): string {
    return hmacSha256(this.config.PAYMENT_WEBHOOK_SECRET, body);
  }

  /**
   * Sandbox test ödeme sayfasındaki "Öde" düğmesi: sağlayıcı rolünü oynar ve İMZALI bir webhook olayı
   * üretip aynı doğrulama yolundan geçirir. Yalnızca checkout'un sahibi tetikleyebilir.
   */
  async sandboxPay(t: TeacherCtx, checkoutId: string, outcome: 'success' | 'fail') {
    if (this.config.PAYMENT_PROVIDER !== 'sandbox') throw new AppError(ErrorCode.NOT_FOUND, 'Bulunamadı');
    const [cs] = await this.db
      .select()
      .from(checkoutSession)
      .where(and(eq(checkoutSession.id, checkoutId), eq(checkoutSession.workspaceId, t.workspaceId)));
    if (!cs) throw notFound('Ödeme oturumu');
    const [v] = await this.db.select().from(planVersion).where(eq(planVersion.id, cs.planVersionId));
    const periodEnd = new Date(Date.now() + (v!.period === 'yearly' ? 365 : 30) * 864e5).toISOString();
    const event: SandboxEvent =
      outcome === 'success'
        ? { id: `evt_${cs.id}`, type: 'subscription.activated', workspaceId: t.workspaceId, planVersionId: cs.planVersionId, checkoutId: cs.id, periodEnd }
        : { id: `evt_fail_${randomToken(8)}`, type: 'payment.failed', workspaceId: t.workspaceId, checkoutId: cs.id };
    const body = JSON.stringify(event);
    return this.handleWebhook('sandbox', body, this.sign(body));
  }

  async handleWebhook(provider: string, rawBody: string, signature: string | undefined) {
    if (provider !== 'sandbox' || this.config.PAYMENT_PROVIDER !== 'sandbox') throw new AppError(ErrorCode.NOT_FOUND, 'Bulunamadı');
    if (!signature || !safeEqual(signature, this.sign(rawBody))) {
      throw new AppError(ErrorCode.PAYMENT_INVALID, 'İmza doğrulanamadı');
    }
    let ev: SandboxEvent;
    try {
      ev = JSON.parse(rawBody) as SandboxEvent;
    } catch {
      throw new AppError(ErrorCode.PAYMENT_INVALID, 'Geçersiz olay');
    }
    return this.db.transaction(async (tx) => {
      try {
        await tx.insert(paymentEvent).values({ provider, eventId: ev.id, type: ev.type, workspaceId: ev.workspaceId, payload: ev });
      } catch (err) {
        if (pgErrorCode(err) === PgError.UNIQUE_VIOLATION) return { duplicate: true, processed: false };
        throw err;
      }
      const [ws] = await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, ev.workspaceId));
      if (!ws) throw new AppError(ErrorCode.PAYMENT_INVALID, 'Bilinmeyen çalışma alanı');
      await tx.execute(sql`SELECT id FROM subscription WHERE workspace_id = ${ev.workspaceId} FOR UPDATE`);

      switch (ev.type) {
        case 'subscription.activated':
        case 'subscription.renewed': {
          if (!ev.planVersionId || !ev.periodEnd) throw new AppError(ErrorCode.PAYMENT_INVALID, 'Eksik olay verisi');
          await tx
            .update(subscription)
            .set({
              planVersionId: ev.planVersionId,
              status: 'active',
              provider,
              providerRef: ev.checkoutId ?? null,
              currentPeriodEnd: new Date(ev.periodEnd),
              cancelAtPeriodEnd: false,
              updatedAt: new Date(),
            })
            .where(eq(subscription.workspaceId, ev.workspaceId));
          if (ev.checkoutId) {
            await tx.update(checkoutSession).set({ status: 'completed', completedAt: new Date() }).where(eq(checkoutSession.id, ev.checkoutId));
          }
          break;
        }
        case 'subscription.canceled':
          // Dönem sonuna kadar hak devam eder; veri silinmez.
          await tx.update(subscription).set({ status: 'canceled', cancelAtPeriodEnd: true, updatedAt: new Date() }).where(eq(subscription.workspaceId, ev.workspaceId));
          break;
        case 'subscription.expired':
          await tx.update(subscription).set({ status: 'expired', updatedAt: new Date() }).where(eq(subscription.workspaceId, ev.workspaceId));
          break;
        case 'payment.failed':
          if (ev.checkoutId) await tx.update(checkoutSession).set({ status: 'failed' }).where(eq(checkoutSession.id, ev.checkoutId));
          else await tx.update(subscription).set({ status: 'past_due', updatedAt: new Date() }).where(eq(subscription.workspaceId, ev.workspaceId));
          break;
      }
      await tx.update(paymentEvent).set({ processedAt: new Date() }).where(and(eq(paymentEvent.provider, provider), eq(paymentEvent.eventId, ev.id)));
      // Limit üstü durumu işaretle (plan düşürme / süre sonu): veriler silinmez.
      const ent = await this.entitlements.limits(ev.workspaceId, tx);
      const count = await this.entitlements.activeStudentCount(ev.workspaceId, tx);
      await tx
        .update(subscription)
        .set({ overLimitSince: count > ent.activeStudentLimit ? sql`coalesce(${subscription.overLimitSince}, now())` : null })
        .where(eq(subscription.workspaceId, ev.workspaceId));
      return { duplicate: false, processed: true };
    });
  }

  /** Öğretmen iptali: sandbox'ta sağlayıcı olayı üretilir; gerçek sağlayıcıda sağlayıcıya iptal isteği gider. */
  async cancel(t: TeacherCtx) {
    const [sub] = await this.db.select().from(subscription).where(eq(subscription.workspaceId, t.workspaceId));
    if (!sub || sub.status !== 'active') throw new AppError(ErrorCode.CONFLICT, 'İptal edilecek aktif abonelik yok');
    const body = JSON.stringify({ id: `evt_cancel_${sub.id}_${sub.currentPeriodEnd?.getTime()}`, type: 'subscription.canceled', workspaceId: t.workspaceId } satisfies SandboxEvent);
    await this.handleWebhook('sandbox', body, this.sign(body));
    await this.db.insert(auditLog).values({ actorUserId: t.userId, workspaceId: t.workspaceId, action: 'subscription.cancel' });
    return this.entitlements.entitlement(t.workspaceId);
  }

  async checkoutStatus(t: TeacherCtx, id: string) {
    const [cs] = await this.db.select().from(checkoutSession).where(and(eq(checkoutSession.id, id), eq(checkoutSession.workspaceId, t.workspaceId)));
    if (!cs) throw notFound('Ödeme oturumu');
    return { id: cs.id, status: cs.status };
  }
}
