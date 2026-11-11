import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { ErrorCode, type ChangeRequestInput, type DecideChangeRequestInput } from '@derslik/shared';
import { DB, PgError, pgErrorCode, type Db } from '../db/db';
import { appUser, changeRequest, lesson, lessonParticipant, student, workspace } from '../db/schema';
import { AccessService, type TeacherCtx } from '../common/access.service';
import { AppError, notFound } from '../common/errors';
import { NotificationsService } from '../notifications/notifications.service';
import { LessonsService } from './lessons.service';
import { formatRange, utcToLocal } from './recurrence';

@Injectable()
export class ChangeRequestsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly access: AccessService,
    private readonly lessons: LessonsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Öğrenci veya (izinliyse) veli talep oluşturur. Takvim DEĞİŞMEZ; karar öğretmenindir.
   */
  async create(userId: string, lessonId: string, studentId: string, input: ChangeRequestInput) {
    const viewer = await this.access.viewerFor(userId, studentId);
    if (!viewer.canRequestChanges) throw new AppError(ErrorCode.FORBIDDEN, 'Öğretmeniniz bu bağlantı için talep iznini açmamış');
    const [row] = await this.db
      .select({ l: lesson })
      .from(lesson)
      .innerJoin(lessonParticipant, and(eq(lessonParticipant.lessonId, lesson.id), eq(lessonParticipant.studentId, studentId)))
      .where(eq(lesson.id, lessonId));
    if (!row) throw notFound('Ders');
    const l = row.l;
    if (l.status !== 'scheduled' || l.startsAt <= new Date()) {
      throw new AppError(ErrorCode.CONFLICT, 'Yalnızca gelecekteki planlı dersler için talep oluşturulabilir');
    }
    if (input.kind === 'cancel' && input.proposedStartsAt) {
      throw new AppError(ErrorCode.VALIDATION, 'İptal talebinde yeni zaman önerilmez');
    }
    try {
      return await this.db.transaction(async (tx) => {
        const [cr] = await tx
          .insert(changeRequest)
          .values({
            workspaceId: l.workspaceId,
            lessonId: l.id,
            studentId,
            requestedBy: userId,
            kind: input.kind,
            message: input.message ?? null,
            proposedStartsAt: input.proposedStartsAt ? new Date(input.proposedStartsAt) : null,
          })
          .returning();
        const [ws] = await tx.select({ owner: workspace.ownerUserId }).from(workspace).where(eq(workspace.id, l.workspaceId));
        const [s] = await tx.select({ n: student.displayName }).from(student).where(eq(student.id, studentId));
        await this.notifications.notify(tx, [ws!.owner], {
          workspaceId: l.workspaceId,
          category: 'request',
          type: 'request.created',
          titleKey: `notif.request.created.${input.kind}`,
          params: { student: s!.n, when: formatRange(l.startsAt, l.endsAt, l.timezone) },
          link: `/requests/${cr!.id}`,
          dedupeKey: `request.created:${cr!.id}`,
        });
        return cr!;
      });
    } catch (err) {
      if (pgErrorCode(err) === PgError.UNIQUE_VIOLATION) {
        throw new AppError(ErrorCode.CONFLICT, 'Bu ders için bekleyen bir talebiniz zaten var');
      }
      throw err;
    }
  }

  async listForTeacher(t: TeacherCtx, status?: 'pending' | 'approved' | 'rejected' | 'withdrawn') {
    const rows = await this.db
      .select({
        id: changeRequest.id,
        kind: changeRequest.kind,
        status: changeRequest.status,
        message: changeRequest.message,
        proposedStartsAt: changeRequest.proposedStartsAt,
        response: changeRequest.response,
        createdAt: changeRequest.createdAt,
        lessonId: lesson.id,
        lessonStartsAt: lesson.startsAt,
        lessonEndsAt: lesson.endsAt,
        timezone: lesson.timezone,
        studentId: student.id,
        studentName: student.displayName,
        requesterName: appUser.name,
        requesterRole: sql<'student' | 'guardian'>`CASE WHEN EXISTS (SELECT 1 FROM guardian_link g WHERE g.user_id = ${changeRequest.requestedBy} AND g.student_id = ${changeRequest.studentId}) THEN 'guardian' ELSE 'student' END`,
      })
      .from(changeRequest)
      .innerJoin(lesson, eq(lesson.id, changeRequest.lessonId))
      .innerJoin(student, eq(student.id, changeRequest.studentId))
      .innerJoin(appUser, eq(appUser.id, changeRequest.requestedBy))
      .where(and(eq(changeRequest.workspaceId, t.workspaceId), status ? eq(changeRequest.status, status) : undefined))
      .orderBy(desc(changeRequest.createdAt))
      .limit(200);
    return rows.map((r) => ({ ...r, when: formatRange(r.lessonStartsAt, r.lessonEndsAt, r.timezone) }));
  }

  async listForUser(userId: string) {
    return this.db
      .select({
        id: changeRequest.id,
        lessonId: changeRequest.lessonId,
        studentId: changeRequest.studentId,
        kind: changeRequest.kind,
        status: changeRequest.status,
        message: changeRequest.message,
        proposedStartsAt: changeRequest.proposedStartsAt,
        response: changeRequest.response,
        createdAt: changeRequest.createdAt,
      })
      .from(changeRequest)
      .where(eq(changeRequest.requestedBy, userId))
      .orderBy(desc(changeRequest.createdAt))
      .limit(100);
  }

  async withdraw(userId: string, id: string) {
    const [row] = await this.db
      .update(changeRequest)
      .set({ status: 'withdrawn', decidedAt: new Date() })
      .where(and(eq(changeRequest.id, id), eq(changeRequest.requestedBy, userId), eq(changeRequest.status, 'pending')))
      .returning({ id: changeRequest.id });
    if (!row) throw notFound('Talep');
  }

  /** Öğretmen kararı. Onayda takvim değişikliği ders kurallarıyla (çakışma dahil) aynı transaction'da yapılır. */
  async decide(t: TeacherCtx, id: string, input: DecideChangeRequestInput) {
    return this.db.transaction(async (tx) => {
      const locked = await tx.execute<{ id: string }>(sql`SELECT id FROM change_request WHERE id = ${id} AND workspace_id = ${t.workspaceId} FOR UPDATE`);
      if (!locked.rows[0]) throw notFound('Talep');
      const [cr] = await tx.select().from(changeRequest).where(eq(changeRequest.id, id));
      if (cr!.status !== 'pending') throw new AppError(ErrorCode.CONFLICT, 'Bu talep zaten sonuçlandırılmış');

      if (input.decision === 'approve') {
        const l = await this.lessons.ownLesson(t, cr!.lessonId, tx);
        if (l.status !== 'scheduled') throw new AppError(ErrorCode.CONFLICT, 'Ders artık planlı durumda değil');
        if (cr!.kind === 'cancel') {
          await this.lessons.cancel(t, l.id, { scope: 'this', reason: input.response }, tx);
        } else {
          let date = input.newDate;
          let time = input.newStartTime;
          if ((!date || !time) && cr!.proposedStartsAt) {
            const local = utcToLocal(cr!.proposedStartsAt, l.timezone);
            date ??= local.date;
            time ??= local.time;
          }
          if (!date || !time) throw new AppError(ErrorCode.VALIDATION, 'Erteleme onayı için yeni tarih ve saat gerekli');
          await this.lessons.update(t, l.id, { scope: 'this', date, startTime: time }, tx);
        }
      }
      const status = input.decision === 'approve' ? 'approved' : 'rejected';
      const [updated] = await tx
        .update(changeRequest)
        .set({ status, response: input.response ?? null, decidedAt: new Date() })
        .where(eq(changeRequest.id, id))
        .returning();
      await this.notifications.notify(tx, [cr!.requestedBy], {
        workspaceId: t.workspaceId,
        category: 'request',
        type: `request.${status}`,
        titleKey: `notif.request.${status}`,
        params: {},
        link: `/lessons/${cr!.lessonId}`,
        dedupeKey: `request.decided:${id}`,
      });
      return updated!;
    });
  }
}
