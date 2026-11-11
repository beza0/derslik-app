import { z } from 'zod';

export const BillingPeriod = z.enum(['monthly', 'yearly']);

export const PlanVersionInput = z.object({
  activeStudentLimit: z.number().int().min(1).max(10000),
  aiMonthlyQuota: z.number().int().min(0).max(1000000),
  /** Kuruş cinsinden; null = fiyat belirlenmedi (satışa kapalı). */
  priceMinor: z.number().int().min(0).nullable(),
  currency: z.string().length(3).default('TRY'),
  period: BillingPeriod.default('monthly'),
  applyToExistingSubscribers: z.boolean().default(false),
});

export const PlanInput = z.object({
  code: z.string().regex(/^[a-z0-9_-]{2,40}$/),
  name: z.string().trim().min(1).max(80),
  isPublic: z.boolean().default(false),
  version: PlanVersionInput,
});

export const CheckoutInput = z.object({ planVersionId: z.uuid() });

export type SubscriptionStatus = 'free' | 'active' | 'canceled' | 'past_due' | 'expired';

export interface EntitlementDto {
  planCode: string;
  planName: string;
  activeStudentLimit: number;
  activeStudentCount: number;
  overLimit: boolean;
  aiMonthlyQuota: number;
  aiUsedThisPeriod: number;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: string | null;
}
