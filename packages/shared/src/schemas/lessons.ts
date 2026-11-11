import { z } from 'zod';
import { IsoDateTime, LocalDate, LocalTime, SafeUrl, TimeZone } from './common';

export const LessonMode = z.enum(['online', 'in_person']);
export type LessonMode = z.infer<typeof LessonMode>;
export const LessonStatus = z.enum(['scheduled', 'done', 'cancelled']);
export type LessonStatus = z.infer<typeof LessonStatus>;
export const Attendance = z.enum(['unknown', 'present', 'absent']);
export type Attendance = z.infer<typeof Attendance>;

/** ISO hafta günü: 1 = Pazartesi … 7 = Pazar. */
export const Weekday = z.number().int().min(1).max(7);

export const RecurrenceInput = z
  .object({
    weekdays: z.array(Weekday).min(1).max(7),
    untilDate: LocalDate.optional(),
    count: z.number().int().min(1).max(200).optional(),
  })
  .refine((r) => Boolean(r.untilDate) !== Boolean(r.count), {
    message: 'Bitiş tarihi veya tekrar adedinden yalnızca biri verilmeli',
  });
export type RecurrenceInput = z.infer<typeof RecurrenceInput>;

const details = {
  title: z.string().trim().max(150).optional().nullable(),
  location: z.string().trim().max(300).optional().nullable(),
  meetingUrl: SafeUrl.optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
};

export const CreateLessonInput = z
  .object({
    studentId: z.uuid().optional(),
    groupId: z.uuid().optional(),
    ...details,
    mode: LessonMode.default('in_person'),
    /** Yerel tarih ve saat; saat dilimiyle birlikte yorumlanır. Seride ilk gün. */
    date: LocalDate,
    startTime: LocalTime,
    durationMin: z.number().int().min(5).max(600),
    timezone: TimeZone.optional(),
    recurrence: RecurrenceInput.optional(),
  })
  .refine((v) => Boolean(v.studentId) !== Boolean(v.groupId), {
    message: 'Ders bir öğrenciye veya bir gruba ait olmalı',
  });
export type CreateLessonInput = z.infer<typeof CreateLessonInput>;

export const EditScope = z.enum(['this', 'this_and_following']);
export type EditScope = z.infer<typeof EditScope>;

export const UpdateLessonInput = z.object({
  scope: EditScope.default('this'),
  /** Yalnızca "this" kapsamında: dersin yeni yerel tarihi. */
  date: LocalDate.optional(),
  startTime: LocalTime.optional(),
  durationMin: z.number().int().min(5).max(600).optional(),
  /** Yalnızca "this_and_following": haftanın günleri. */
  weekdays: z.array(Weekday).min(1).max(7).optional(),
  ...details,
  mode: LessonMode.optional(),
});
export type UpdateLessonInput = z.infer<typeof UpdateLessonInput>;

export const CancelLessonInput = z.object({
  scope: EditScope.default('this'),
  reason: z.string().trim().max(500).optional(),
});
export type CancelLessonInput = z.infer<typeof CancelLessonInput>;

export const CompleteLessonInput = z.object({
  topicsCovered: z.string().trim().max(4000).optional().nullable(),
  nextPlan: z.string().trim().max(4000).optional().nullable(),
  attendance: z
    .array(z.object({ studentId: z.uuid(), attendance: Attendance }))
    .max(200)
    .default([]),
});
export type CompleteLessonInput = z.infer<typeof CompleteLessonInput>;

export const CalendarQuery = z.object({
  from: IsoDateTime,
  to: IsoDateTime,
  studentId: z.uuid().optional(),
  groupId: z.uuid().optional(),
  status: LessonStatus.optional(),
});
export type CalendarQuery = z.infer<typeof CalendarQuery>;

export const ChangeRequestInput = z.object({
  kind: z.enum(['cancel', 'reschedule']),
  message: z.string().trim().max(1000).optional(),
  proposedStartsAt: IsoDateTime.optional(),
});
export type ChangeRequestInput = z.infer<typeof ChangeRequestInput>;

export const DecideChangeRequestInput = z.object({
  decision: z.enum(['approve', 'reject']),
  /** Erteleme onayında yeni yerel tarih/saat (öğretmen değiştirebilir). */
  newDate: LocalDate.optional(),
  newStartTime: LocalTime.optional(),
  response: z.string().trim().max(1000).optional(),
});
export type DecideChangeRequestInput = z.infer<typeof DecideChangeRequestInput>;

export interface LessonParticipantDto {
  studentId: string;
  displayName: string;
  attendance: Attendance;
}

export interface LessonDto {
  id: string;
  seriesId: string | null;
  studentId: string | null;
  groupId: string | null;
  targetName: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  mode: LessonMode;
  location: string | null;
  meetingUrl: string | null;
  status: LessonStatus;
  isException: boolean;
  /** Öğrenci/veli takviminde birden çok öğretmen olabilir. */
  teacherName?: string;
  /** Yalnızca öğretmen görünümünde. */
  note?: string | null;
  topicsCovered?: string | null;
  nextPlan?: string | null;
  participants?: LessonParticipantDto[];
}

export interface LessonConflictDetail {
  conflicts: { startsAt: string; endsAt: string; withLessonId: string | null }[];
}
