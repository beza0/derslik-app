import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { ErrorCode, type LessonDto } from '@derslik/shared';
import { DB, type Db } from '../db/db';
import { lesson, lessonParticipant, student, studentGroup, workspace } from '../db/schema';
import { AccessService } from '../common/access.service';
import { AppError, notFound } from '../common/errors';

/**
 * Öğrenci ve veli görünümü. Her yanıt AYRI bir DTO ile üretilir: öğretmen notu, işlenen konu,
 * sonraki ders planı ve diğer grup üyeleri modelde hiç bulunmaz.
 */
export interface PortalLessonDto extends Omit<LessonDto, 'note' | 'topicsCovered' | 'nextPlan' | 'participants'> {
  teacherName: string;
  /** Bu dersin hangi öğrenci kaydı için gösterildiği (veli birden fazla çocuk izleyebilir). */
  forStudentId: string;
  forStudentName: string;
}

@Injectable()
export class PortalService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly access: AccessService,
  ) {}

  /** Görüntüleyenin bağlı olduğu öğrenci kayıtları; `studentId` verilirse yalnızca o (yetki kontrollü). */
  private async scope(userId: string, studentId?: string) {
    const all = await this.access.viewerStudents(userId);
    if (all.length === 0) throw new AppError(ErrorCode.FORBIDDEN, 'Bağlı bir öğrenci kaydı yok');
    if (studentId) {
      const one = all.filter((v) => v.studentId === studentId);
      if (one.length === 0) throw notFound('Kayıt');
      return one;
    }
    return all;
  }

  async calendar(userId: string, from: Date, to: Date, studentId?: string): Promise<PortalLessonDto[]> {
    if (to <= from || to.getTime() - from.getTime() > 100 * 864e5) {
      throw new AppError(ErrorCode.VALIDATION, 'Tarih aralığı en fazla 100 gün olabilir');
    }
    const viewers = await this.scope(userId, studentId);
    const ids = [...new Set(viewers.map((v) => v.studentId))];
    const rows = await this.db
      .select({
        l: lesson,
        forStudentId: lessonParticipant.studentId,
        forStudentName: student.displayName,
        teacherName: workspace.displayName,
        groupName: studentGroup.name,
      })
      .from(lessonParticipant)
      .innerJoin(lesson, eq(lesson.id, lessonParticipant.lessonId))
      .innerJoin(student, eq(student.id, lessonParticipant.studentId))
      .innerJoin(workspace, eq(workspace.id, lesson.workspaceId))
      .leftJoin(studentGroup, eq(studentGroup.id, lesson.groupId))
      .where(and(inArray(lessonParticipant.studentId, ids), lt(lesson.startsAt, to), sql`${lesson.endsAt} > ${from}`))
      .orderBy(asc(lesson.startsAt))
      .limit(2000);
    return rows.map((r) => this.toDto(r));
  }

  async lesson(userId: string, lessonId: string): Promise<PortalLessonDto> {
    const viewers = await this.scope(userId);
    const ids = viewers.map((v) => v.studentId);
    const [r] = await this.db
      .select({
        l: lesson,
        forStudentId: lessonParticipant.studentId,
        forStudentName: student.displayName,
        teacherName: workspace.displayName,
        groupName: studentGroup.name,
      })
      .from(lessonParticipant)
      .innerJoin(lesson, eq(lesson.id, lessonParticipant.lessonId))
      .innerJoin(student, eq(student.id, lessonParticipant.studentId))
      .innerJoin(workspace, eq(workspace.id, lesson.workspaceId))
      .leftJoin(studentGroup, eq(studentGroup.id, lesson.groupId))
      .where(and(eq(lesson.id, lessonId), inArray(lessonParticipant.studentId, ids)))
      .limit(1);
    if (!r) throw notFound('Ders');
    return this.toDto(r);
  }

  private toDto(r: {
    l: typeof lesson.$inferSelect;
    forStudentId: string;
    forStudentName: string;
    teacherName: string;
    groupName: string | null;
  }): PortalLessonDto {
    const l = r.l;
    return {
      id: l.id,
      seriesId: l.seriesId,
      studentId: l.studentId,
      groupId: l.groupId,
      targetName: r.groupName ?? r.forStudentName,
      title: l.title,
      startsAt: l.startsAt.toISOString(),
      endsAt: l.endsAt.toISOString(),
      timezone: l.timezone,
      mode: l.mode,
      location: l.location,
      meetingUrl: l.meetingUrl,
      status: l.status,
      isException: l.isException,
      teacherName: r.teacherName,
      forStudentId: r.forStudentId,
      forStudentName: r.forStudentName,
    };
  }
}
