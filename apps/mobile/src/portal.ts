import type { RecipientStatus } from '@derslik/shared';

export interface PortalLesson {
  id: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: 'scheduled' | 'done' | 'cancelled';
  targetName: string;
  title: string | null;
  mode: 'online' | 'in_person';
  meetingUrl: string | null;
  location: string | null;
  teacherName: string;
  forStudentId: string;
  forStudentName: string;
}

export interface PortalAssignmentItem {
  id: string;
  recipientId: string;
  studentId: string;
  teacherName: string;
  title: string;
  dueAt: string | null;
  status: RecipientStatus;
  late: boolean;
}

export const recTone = (s: RecipientStatus) => (s === 'reviewed' ? 'ok' : s === 'submitted' ? 'info' : s === 'resubmit_requested' ? 'warn' : undefined);
