import { z } from 'zod';

const opt = (max: number) => z.string().trim().max(max).optional().nullable();

export const StudentInput = z.object({
  displayName: z.string().trim().min(1, 'Ad gerekli').max(100),
  level: opt(100),
  goal: opt(300),
  subject: opt(100),
  contactNote: opt(500),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
});
export type StudentInput = z.infer<typeof StudentInput>;
export const StudentUpdate = StudentInput.partial();
export type StudentUpdate = z.infer<typeof StudentUpdate>;

export const BulkStudentInput = z.object({
  students: z.array(StudentInput).min(1).max(50),
  groupId: z.uuid().optional(),
});
export type BulkStudentInput = z.infer<typeof BulkStudentInput>;

export const StudentStatus = z.enum(['active', 'archived']);
export type StudentStatus = z.infer<typeof StudentStatus>;

export const StudentListQuery = z.object({
  status: StudentStatus.default('active'),
  q: z.string().trim().max(100).optional(),
});

export const DeleteStudentInput = z.object({
  /** Yanlışlıkla silmeyi önlemek için öğrencinin adı aynen yazılır. */
  confirmName: z.string().min(1),
});

export interface StudentDto {
  id: string;
  displayName: string;
  level: string | null;
  goal: string | null;
  subject: string | null;
  contactNote: string | null;
  color: string | null;
  status: StudentStatus;
  hasAccount: boolean;
  guardianCount: number;
  createdAt: string;
  archivedAt: string | null;
}
