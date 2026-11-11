import { z } from 'zod';
import { LocalDate, Visibility } from './common';

export const NoteKind = z.enum(['observation', 'lesson_summary', 'strength', 'weakness']);
export type NoteKind = z.infer<typeof NoteKind>;

export const NoteInput = z.object({
  studentId: z.uuid(),
  lessonId: z.uuid().optional().nullable(),
  kind: NoteKind.default('observation'),
  topic: z.string().trim().max(150).optional().nullable(),
  body: z.string().trim().min(1).max(8000),
  /** Güvenli varsayılan: öğretmene özel. */
  visibility: Visibility.default('private'),
});
export type NoteInput = z.infer<typeof NoteInput>;
export const NoteUpdate = NoteInput.omit({ studentId: true }).partial();
export type NoteUpdate = z.infer<typeof NoteUpdate>;

export const AssessmentInput = z.object({
  studentId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  date: LocalDate,
  topic: z.string().trim().max(150).optional().nullable(),
  score: z.number().min(0).max(100000).optional().nullable(),
  maxScore: z.number().positive().max(100000).optional().nullable(),
  feedback: z.string().trim().max(8000).optional().nullable(),
  visibility: Visibility.default('private'),
});
export type AssessmentInput = z.infer<typeof AssessmentInput>;

export interface NoteDto {
  id: string;
  studentId: string;
  lessonId: string | null;
  kind: NoteKind;
  topic: string | null;
  body: string;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentDto {
  id: string;
  studentId: string;
  title: string;
  date: string;
  topic: string | null;
  score: number | null;
  maxScore: number | null;
  feedback: string | null;
  visibility: Visibility;
  createdAt: string;
}

/** Grafik için en az bu kadar sayısal kayıt gerekir; altında "yeterli veri yok" gösterilir. */
export const MIN_POINTS_FOR_TREND = 3;
