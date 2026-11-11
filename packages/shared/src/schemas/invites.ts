import { z } from 'zod';

export const InviteKind = z.enum(['student', 'guardian']);
export type InviteKind = z.infer<typeof InviteKind>;

export const CreateInviteInput = z.object({
  kind: InviteKind,
  /** Gün cinsinden geçerlilik, 1-30. */
  ttlDays: z.number().int().min(1).max(30).default(7),
  /** Veli için: iptal/erteleme talebi oluşturabilir mi? */
  canRequestChanges: z.boolean().default(false),
});
export type CreateInviteInput = z.infer<typeof CreateInviteInput>;

export const AcceptInviteInput = z.object({ code: z.string().trim().min(8).max(64) });

export interface InviteDto {
  id: string;
  studentId: string;
  kind: InviteKind;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
  createdAt: string;
  /** Ham kod yalnızca oluşturma yanıtında döner; sonra okunamaz. */
  code?: string;
}

export interface InvitePreviewDto {
  kind: InviteKind;
  teacherName: string;
  studentDisplayName: string;
  expiresAt: string;
}

/** Davet kodunu karşılaştırma biçimine getirir: büyük harf, base32 dışı karakterler atılır. */
export function normalizeInviteCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z2-7]/g, '');
}
