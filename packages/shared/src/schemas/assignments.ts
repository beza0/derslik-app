import { z } from 'zod';
import { IsoDateTime, SafeUrl } from './common';

export const AnswerKeyVisibility = z.enum(['hidden', 'after_review', 'at_date']);
export type AnswerKeyVisibility = z.infer<typeof AnswerKeyVisibility>;
export const RecipientStatus = z.enum(['assigned', 'submitted', 'reviewed', 'resubmit_requested']);
export type RecipientStatus = z.infer<typeof RecipientStatus>;
export const AssignmentStatus = z.enum(['draft', 'published']);
export type AssignmentStatus = z.infer<typeof AssignmentStatus>;

const base = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(8000).optional().nullable(),
  dueAt: IsoDateTime.optional().nullable(),
  links: z.array(SafeUrl).max(10).default([]),
  fileIds: z.array(z.uuid()).max(10).default([]),
  answerKeyText: z.string().max(20000).optional().nullable(),
  answerKeyFileIds: z.array(z.uuid()).max(5).default([]),
  answerKeyVisibility: AnswerKeyVisibility.default('hidden'),
  answerKeyVisibleAt: IsoDateTime.optional().nullable(),
};

export const AssignmentInput = z
  .object({
    ...base,
    studentIds: z.array(z.uuid()).max(200).default([]),
    groupId: z.uuid().optional().nullable(),
    publish: z.boolean().default(false),
  })
  .refine((a) => a.studentIds.length > 0 || Boolean(a.groupId), {
    message: 'En az bir öğrenci veya grup seçilmeli',
  })
  .refine((a) => a.answerKeyVisibility !== 'at_date' || Boolean(a.answerKeyVisibleAt), {
    message: 'Belirli tarihte görünürlük için tarih gerekli',
  });
export type AssignmentInput = z.infer<typeof AssignmentInput>;

export const AssignmentUpdate = z.object(base).partial();
export type AssignmentUpdate = z.infer<typeof AssignmentUpdate>;

export const SubmissionInput = z
  .object({
    text: z.string().trim().max(20000).optional().nullable(),
    fileIds: z.array(z.uuid()).max(10).default([]),
  })
  .refine((s) => Boolean(s.text) || s.fileIds.length > 0, { message: 'Metin veya dosya gerekli' });
export type SubmissionInput = z.infer<typeof SubmissionInput>;

export const ReviewInput = z.object({
  feedback: z.string().trim().max(8000).optional().nullable(),
  score: z.number().min(0).max(100000).optional().nullable(),
  requestResubmit: z.boolean().default(false),
});
export type ReviewInput = z.infer<typeof ReviewInput>;

export const FILE_LIMITS = {
  maxBytes: 15 * 1024 * 1024,
  allowedMime: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] as const,
};

/** Gecikme türetilen bilgidir: son tarih yoksa asla gecikmiş sayılmaz. */
export function isLate(dueAt: string | null, submittedAt: string | null, now: Date = new Date()): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt).getTime();
  if (submittedAt) return new Date(submittedAt).getTime() > due;
  return now.getTime() > due;
}
