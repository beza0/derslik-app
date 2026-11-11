import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import {
  ErrorCode,
  type CalendarQuery,
  type CancelLessonInput,
  type CompleteLessonInput,
  type CreateLessonInput,
  type LessonDto,
  type UpdateLessonInput,
} from '@derslik/shared';
import { DB, PgError, pgErrorCode, type Db, type Tx } from '../db/db';
import { lesson, lessonParticipant, lessonSeries, student, studentAccountLink, studentGroup, workspace } from '../db/schema';
import { AccessService, type TeacherCtx } from '../common/access.service';
import { AppError, notFound } from '../common/errors';
import { GroupsService } from '../groups/groups.service';
import { NotificationsService } from '../notifications/notifications.service';
import { addDays, expandWeekly, formatRange, single, utcToLocal, type Occurrence, type WeeklyRule } from './recurrence';

type LessonRow = typeof lesson.$inferSelect;
type SeriesRow = typeof lessonSeries.$inferSelect;

export interface LessonWarning {
  studentId: string;
  displayName: string;
  /** Yalnızca yerel tarihler; diğer dersin öğretmeni, konusu, yeri gösterilmez. */
  dates: string[];
}

export interface LessonMutationResult {
  lessons: LessonDto[];
  seriesId: string | null;
  warnings: LessonWarning[];
}

const MAX_CALENDAR_DAYS = 100;

function conflictError(conflicts: { startsAt: Date; endsAt: Date; withLessonId: string | null }[]) {
  return new AppError(ErrorCode.LESSON_CONFLICT, 'Seçilen saatlerde başka bir dersiniz var; hiçbir değişiklik kaydedilmedi', {
    conflicts: conflicts.map((c) => ({ startsAt: c.startsAt.toISOString(), endsAt: c.endsAt.toISOString(), withLessonId: c.withLessonId })),
  });
}

@Injectable()
export class LessonsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly access: AccessService,
    private readonly groups: GroupsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────── Yardımcılar ─────────────

  private async resolveTarget(t: TeacherCtx, target: { studentId?: string | null; groupId?: string | null }, tx: Tx) {
    if (target.studentId) {
      const s = await this.access.ownActiveStudent(t, target.studentId, tx);
      return { studentId: s.id, groupId: null, participantIds: [s.id] };
    }
    const g = await this.groups.ownGroup(t, target.groupId!, tx);
    if (g.archivedAt) throw new AppError(ErrorCode.CONFLICT, 'Arşivdeki gruba ders eklenemez');
    return { studentId: null, groupId: g.id, participantIds: await this.groups.activeMemberIds(g.id, tx) };
  }

  async ownLesson(t: TeacherCtx, id: string, tx: Tx = this.db): Promise<LessonRow> {
    const [row] = await tx.select().from(lesson).where(and(eq(lesson.id, id), eq(lesson.workspaceId, t.workspaceId)));
    if (!row) throw notFound('Ders');
    return row;
  }

  /** Aynı öğretmenin iptal edilmemiş dersleriyle çakışmaları bulur ([) aralık; arka arkaya dersler çakışmaz). */
  private async findConflicts(tx: Tx, workspaceId: string, occ: Occurrence[], excludeIds: string[] = []) {
    if (occ.length === 0) return [];
    const starts = occ.map((o) => o.startsAt.toISOString());
    const ends = occ.map((o) => o.endsAt.toISOString());
    const existing = await tx.execute<{ id: string; starts_at: Date; ends_at: Date }>(sql`
      SELECT l.id, l.starts_at, l.ends_at FROM lesson l
      WHERE l.workspace_id = ${workspaceId} AND l.status <> 'cancelled'
        AND NOT (l.id = ANY(${sql.param(excludeIds)}::uuid[]))
        AND EXISTS (
          SELECT 1 FROM unnest(${sql.param(starts)}::timestamptz[], ${sql.param(ends)}::timestamptz[]) AS r(s, e)
          WHERE tstzrange(l.starts_at, l.ends_at, '[)') && tstzrange(r.s, r.e, '[)')
        )`);
    const out: { startsAt: Date; endsAt: Date; withLessonId: string | null }[] = [];
    for (const o of occ) {
      for (const e of existing.rows) {
        if (new Date(e.starts_at) < o.endsAt && new Date(e.ends_at) > o.startsAt) {
          out.push({ startsAt: o.startsAt, endsAt: o.endsAt, withLessonId: e.id });
        }
      }
    }
    // Yeni oturumların kendi arasında çakışması (çok uzun süreli günlük seriler).
    const sorted = [...occ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.startsAt < sorted[i - 1]!.endsAt) out.push({ startsAt: sorted[i]!.startsAt, endsAt: sorted[i]!.endsAt, withLessonId: null });
    }
    return out;
  }

  /**
   * Öğrencinin hesabı bağlıysa başka öğretmenlerdeki derslerle çakışma uyarısı (engellemez).
   * Diğer dersin hiçbir ayrıntısı döndürülmez.
   */
  private async crossTeacherWarnings(tx: Tx, workspaceId: string, participantIds: string[], occ: Occurrence[], timezone: string): Promise<LessonWarning[]> {
    if (participantIds.length === 0 || occ.length === 0) return [];
    const starts = occ.map((o) => o.startsAt.toISOString());
    const ends = occ.map((o) => o.endsAt.toISOString());
    const rows = await tx.execute<{ student_id: string; display_name: string; s: Date }>(sql`
      SELECT mine.student_id, st.display_name, r.s
      FROM student_account_link mine
      JOIN student st ON st.id = mine.student_id
      JOIN student_account_link other ON other.user_id = mine.user_id AND other.workspace_id <> ${workspaceId}
      JOIN lesson_participant lp ON lp.student_id = other.student_id
      JOIN lesson l ON l.id = lp.lesson_id AND l.status <> 'cancelled'
      JOIN unnest(${sql.param(starts)}::timestamptz[], ${sql.param(ends)}::timestamptz[]) AS r(s, e)
        ON tstzrange(l.starts_at, l.ends_at, '[)') && tstzrange(r.s, r.e, '[)')
      WHERE mine.student_id = ANY(${sql.param(participantIds)}::uuid[]) AND mine.workspace_id = ${workspaceId}`);
    const byStudent = new Map<string, LessonWarning>();
    for (const r of rows.rows) {
      const w = byStudent.get(r.student_id) ?? { studentId: r.student_id, displayName: r.display_name, dates: [] };
      const d = utcToLocal(new Date(r.s), timezone).date;
      if (!w.dates.includes(d)) w.dates.push(d);
      byStudent.set(r.student_id, w);
    }
    return [...byStudent.values()].map((w) => ({ ...w, dates: w.dates.sort() }));
  }

  private async insertLessons(
    tx: Tx,
    base: Omit<typeof lesson.$inferInsert, 'startsAt' | 'endsAt'>,
    occ: Occurrence[],
    participantIds: string[],
  ): Promise<LessonRow[]> {
    if (occ.length === 0) return [];
    let rows: LessonRow[];
    try {
      rows = await tx
        .insert(lesson)
        .values(occ.map((o) => ({ ...base, startsAt: o.startsAt, endsAt: o.endsAt })))
        .returning();
    } catch (err) {
      // Ön kontrolden sonra eşzamanlı bir kayıt araya girdiyse veritabanı kısıtı yakalar.
      if (pgErrorCode(err) === PgError.EXCLUSION_VIOLATION) throw conflictError([]);
      throw err;
    }
    if (participantIds.length) {
      await tx.insert(lessonParticipant).values(rows.flatMap((l) => participantIds.map((studentId) => ({ lessonId: l.id, studentId }))));
    }
    return rows;
  }

  private async participantsOf(tx: Tx, lessonIds: string[]) {
    if (lessonIds.length === 0) return new Map<string, { studentId: string; displayName: string; attendance: 'unknown' | 'present' | 'absent' }[]>();
    const rows = await tx
      .select({ lessonId: lessonParticipant.lessonId, studentId: student.id, displayName: student.displayName, attendance: lessonParticipant.attendance })
      .from(lessonParticipant)
      .innerJoin(student, eq(student.id, lessonParticipant.studentId))
      .where(inArray(lessonParticipant.lessonId, lessonIds))
      .orderBy(asc(student.displayName));
    const map = new Map<string, { studentId: string; displayName: string; attendance: 'unknown' | 'present' | 'absent' }[]>();
    for (const r of rows) {
      const list = map.get(r.lessonId) ?? [];
      list.push({ studentId: r.studentId, displayName: r.displayName, attendance: r.attendance });
      map.set(r.lessonId, list);
    }
    return map;
  }

  async toTeacherDtos(rows: LessonRow[], tx: Tx = this.db): Promise<LessonDto[]> {
    if (rows.length === 0) return [];
    const studentIds = [...new Set(rows.map((r) => r.studentId).filter(Boolean) as string[])];
    const groupIds = [...new Set(rows.map((r) => r.groupId).filter(Boolean) as string[])];
    const names = new Map<string, string>();
    if (studentIds.length) {
      for (const s of await tx.select({ id: student.id, n: student.displayName }).from(student).where(inArray(student.id, studentIds))) names.set(s.id, s.n);
    }
    if (groupIds.length) {
      for (const g of await tx.select({ id: studentGroup.id, n: studentGroup.name }).from(studentGroup).where(inArray(studentGroup.id, groupIds))) names.set(g.id, g.n);
    }
    const parts = await this.participantsOf(tx, rows.map((r) => r.id));
    return rows.map((r) => ({
      id: r.id,
      seriesId: r.seriesId,
      studentId: r.studentId,
      groupId: r.groupId,
      targetName: names.get((r.studentId ?? r.groupId)!) ?? '',
      title: r.title,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      timezone: r.timezone,
      mode: r.mode,
      location: r.location,
      meetingUrl: r.meetingUrl,
      status: r.status,
      isException: r.isException,
      note: r.note,
      topicsCovered: r.topicsCovered,
      nextPlan: r.nextPlan,
      participants: parts.get(r.id) ?? [],
    }));
  }

  private async notifyParticipants(
    tx: Tx,
    t: TeacherCtx,
    participantIds: string[],
    type: 'created' | 'updated' | 'cancelled',
    ref: { id: string; startsAt: Date; endsAt: Date; timezone: string; count?: number },
    dedupe: string,
  ) {
    const users = await this.notifications.recipientsForStudents(tx, participantIds);
    const [ws] = await tx.select({ name: workspace.displayName }).from(workspace).where(eq(workspace.id, t.workspaceId));
    await this.notifications.notify(tx, users, {
      workspaceId: t.workspaceId,
      category: 'lesson',
      type: `lesson.${type}`,
      titleKey: `notif.lesson.${type}`,
      params: {
        teacher: ws?.name ?? '',
        when: formatRange(ref.startsAt, ref.endsAt, ref.timezone),
        ...(ref.count && ref.count > 1 ? { count: String(ref.count) } : {}),
      },
      link: `/lessons/${ref.id}`,
      dedupeKey: dedupe,
    });
  }

  // ───────────── Oluşturma ─────────────

  async create(t: TeacherCtx, input: CreateLessonInput, existingTx?: Tx): Promise<LessonMutationResult> {
    const run = async (tx: Tx): Promise<LessonMutationResult> => {
      const target = await this.resolveTarget(t, input, tx);
      const timezone = input.timezone ?? t.timezone;
      const details = {
        title: input.title ?? null,
        mode: input.mode,
        location: input.location ?? null,
        meetingUrl: input.meetingUrl ?? null,
        note: input.note ?? null,
      };
      let seriesId: string | null = null;
      let occ: Occurrence[];
      if (input.recurrence) {
        const rule: WeeklyRule = {
          weekdays: [...new Set(input.recurrence.weekdays)],
          localStartTime: input.startTime,
          durationMin: input.durationMin,
          timezone,
          startsOn: input.date,
          untilDate: input.recurrence.untilDate ?? null,
          count: input.recurrence.count ?? null,
        };
        occ = expandWeekly(rule);
        if (occ.length === 0) throw new AppError(ErrorCode.VALIDATION, 'Seçilen tarih aralığında ders günü yok');
        const [s] = await tx
          .insert(lessonSeries)
          .values({
            workspaceId: t.workspaceId,
            studentId: target.studentId,
            groupId: target.groupId,
            weekdays: rule.weekdays,
            localStartTime: rule.localStartTime,
            durationMin: rule.durationMin,
            timezone,
            startsOn: rule.startsOn,
            untilDate: rule.untilDate ?? null,
            occurrenceCount: rule.count ?? null,
            ...details,
          })
          .returning({ id: lessonSeries.id });
        seriesId = s!.id;
      } else {
        occ = [single(input.date, input.startTime, input.durationMin, timezone)];
      }
      const conflicts = await this.findConflicts(tx, t.workspaceId, occ);
      if (conflicts.length) throw conflictError(conflicts);
      const warnings = await this.crossTeacherWarnings(tx, t.workspaceId, target.participantIds, occ, timezone);
      const rows = await this.insertLessons(
        tx,
        { workspaceId: t.workspaceId, seriesId, studentId: target.studentId, groupId: target.groupId, timezone, ...details },
        occ,
        target.participantIds,
      );
      const first = rows[0]!;
      await this.notifyParticipants(tx, t, target.participantIds, 'created', { ...first, count: rows.length }, `lesson.created:${seriesId ?? first.id}`);
      return { lessons: await this.toTeacherDtos(rows, tx), seriesId, warnings };
    };
    return existingTx ? run(existingTx) : this.db.transaction(run);
  }

  // ───────────── Düzenleme ─────────────

  async update(t: TeacherCtx, id: string, input: UpdateLessonInput, existingTx?: Tx): Promise<LessonMutationResult> {
    const run = async (tx: Tx) => {
      await tx.execute(sql`SELECT id FROM lesson WHERE id = ${id} AND workspace_id = ${t.workspaceId} FOR UPDATE`);
      const current = await this.ownLesson(t, id, tx);
      if (input.scope === 'this_and_following') return this.updateFollowing(t, current, input, tx);
      return this.updateOne(t, current, input, tx);
    };
    return existingTx ? run(existingTx) : this.db.transaction(run);
  }

  private async updateOne(t: TeacherCtx, cur: LessonRow, input: UpdateLessonInput, tx: Tx): Promise<LessonMutationResult> {
    const timeChange = input.date !== undefined || input.startTime !== undefined || input.durationMin !== undefined;
    if (timeChange && cur.status !== 'scheduled') {
      throw new AppError(ErrorCode.CONFLICT, 'Yalnızca planlanmış dersin zamanı değiştirilebilir');
    }
    const local = utcToLocal(cur.startsAt, cur.timezone);
    const duration = input.durationMin ?? Math.round((cur.endsAt.getTime() - cur.startsAt.getTime()) / 60_000);
    const occ = single(input.date ?? local.date, input.startTime ?? local.time, duration, cur.timezone);
    const parts = (await this.participantsOf(tx, [cur.id])).get(cur.id) ?? [];
    let warnings: LessonWarning[] = [];
    if (timeChange) {
      const conflicts = await this.findConflicts(tx, t.workspaceId, [occ], [cur.id]);
      if (conflicts.length) throw conflictError(conflicts);
      warnings = await this.crossTeacherWarnings(tx, t.workspaceId, parts.map((p) => p.studentId), [occ], cur.timezone);
    }
    const patch: Partial<typeof lesson.$inferInsert> = { updatedAt: new Date() };
    for (const k of ['title', 'location', 'meetingUrl', 'note', 'mode'] as const) {
      if (input[k] !== undefined) (patch as Record<string, unknown>)[k] = input[k];
    }
    if (timeChange) {
      patch.startsAt = occ.startsAt;
      patch.endsAt = occ.endsAt;
    }
    if (cur.seriesId && (timeChange || Object.keys(patch).length > 1)) patch.isException = true;
    let row: LessonRow;
    try {
      [row] = (await tx.update(lesson).set(patch).where(eq(lesson.id, cur.id)).returning()) as [LessonRow];
    } catch (err) {
      if (pgErrorCode(err) === PgError.EXCLUSION_VIOLATION) throw conflictError([]);
      throw err;
    }
    if (timeChange && (row.startsAt.getTime() !== cur.startsAt.getTime() || row.endsAt.getTime() !== cur.endsAt.getTime())) {
      await this.notifyParticipants(tx, t, parts.map((p) => p.studentId), 'updated', row, `lesson.updated:${row.id}:${row.startsAt.toISOString()}`);
    }
    return { lessons: await this.toTeacherDtos([row], tx), seriesId: row.seriesId, warnings };
  }

  /**
   * "Bu ve sonraki dersler": seri bu dersin yerel tarihinde ikiye bölünür. Bu dersten itibaren planlı,
   * tekil düzenlenmemiş oturumlar yeni kurala göre yeniden üretilir. Yapılmış/iptal/geçmiş dersler ve
   * tekil düzenlenmiş (istisna) dersler korunur; istisnaların tarihleri yeni seride atlanır.
   * Herhangi bir çakışmada hiçbir şey kaydedilmez.
   */
  private async updateFollowing(t: TeacherCtx, cur: LessonRow, input: UpdateLessonInput, tx: Tx): Promise<LessonMutationResult> {
    if (!cur.seriesId) return this.updateOne(t, cur, { ...input, scope: 'this' }, tx);
    if (input.date !== undefined) {
      throw new AppError(ErrorCode.VALIDATION, 'Seri düzenlemesinde tarih yerine haftanın günleri değiştirilir');
    }
    const [series] = (await tx.select().from(lessonSeries).where(eq(lessonSeries.id, cur.seriesId))) as [SeriesRow];
    const fromLocal = utcToLocal(cur.startsAt, series.timezone).date;

    const tail = await tx
      .select()
      .from(lesson)
      .where(and(eq(lesson.seriesId, series.id), gte(lesson.startsAt, cur.startsAt)));
    const replace = tail.filter((l) => l.status === 'scheduled' && (!l.isException || l.id === cur.id));
    const keep = tail.filter((l) => !replace.includes(l));
    const skipDates = new Set(keep.map((l) => utcToLocal(l.startsAt, series.timezone).date));

    const oldRule: WeeklyRule = {
      weekdays: series.weekdays,
      localStartTime: series.localStartTime.slice(0, 5),
      durationMin: series.durationMin,
      timezone: series.timezone,
      startsOn: series.startsOn,
      untilDate: series.untilDate,
      count: series.occurrenceCount,
    };
    let remainingCount: number | null = null;
    if (series.occurrenceCount) {
      const before = fromLocal > series.startsOn ? expandWeekly({ ...oldRule, untilDate: addDays(fromLocal, -1), count: null }).length : 0;
      remainingCount = Math.max(series.occurrenceCount - before, 0);
    }
    const newRule: WeeklyRule = {
      weekdays: input.weekdays ? [...new Set(input.weekdays)] : series.weekdays,
      localStartTime: input.startTime ?? oldRule.localStartTime,
      durationMin: input.durationMin ?? series.durationMin,
      timezone: series.timezone,
      startsOn: fromLocal,
      untilDate: remainingCount === null ? series.untilDate : null,
      count: remainingCount,
    };
    const details = {
      title: input.title !== undefined ? input.title : series.title,
      mode: input.mode ?? series.mode,
      location: input.location !== undefined ? input.location : series.location,
      meetingUrl: input.meetingUrl !== undefined ? input.meetingUrl : series.meetingUrl,
      note: input.note !== undefined ? input.note : series.note,
    };

    // Eski seri bu tarihten önce biter (sayım yerine tarih).
    await tx.update(lessonSeries).set({ untilDate: addDays(fromLocal, -1), occurrenceCount: null }).where(eq(lessonSeries.id, series.id));
    const [newSeries] = await tx
      .insert(lessonSeries)
      .values({
        workspaceId: t.workspaceId,
        studentId: series.studentId,
        groupId: series.groupId,
        weekdays: newRule.weekdays,
        localStartTime: newRule.localStartTime,
        durationMin: newRule.durationMin,
        timezone: series.timezone,
        startsOn: newRule.startsOn,
        untilDate: newRule.untilDate ?? null,
        occurrenceCount: newRule.count ?? null,
        previousSeriesId: series.id,
        ...details,
      })
      .returning({ id: lessonSeries.id });

    // Mevcut katılımcılar: düzenlenen dersin katılımcıları (grup üyeliği önizlemesiyle ayrıca yönetilir).
    const participantIds = ((await this.participantsOf(tx, [cur.id])).get(cur.id) ?? []).map((p) => p.studentId);
    const replaceIds = replace.map((l) => l.id);
    // Sayıyla sınırlı seride korunan dersler (istisna/yapılmış/iptal) kalan oturum hakkından düşer;
    // böylece seri toplamı değişmez. Tarihle sınırlı seride bitiş tarihi belirleyicidir.
    const occ =
      remainingCount === null
        ? expandWeekly(newRule, skipDates)
        : expandWeekly({ ...newRule, count: null, untilDate: null }, skipDates).slice(0, Math.max(remainingCount - keep.length, 0));
    const conflicts = await this.findConflicts(tx, t.workspaceId, occ, replaceIds);
    if (conflicts.length) throw conflictError(conflicts);
    if (replaceIds.length) await tx.delete(lesson).where(inArray(lesson.id, replaceIds));
    const rows = await this.insertLessons(
      tx,
      {
        workspaceId: t.workspaceId,
        seriesId: newSeries!.id,
        studentId: series.studentId,
        groupId: series.groupId,
        timezone: series.timezone,
        ...details,
      },
      occ,
      participantIds,
    );
    const warnings = await this.crossTeacherWarnings(tx, t.workspaceId, participantIds, occ, series.timezone);
    if (rows[0]) {
      await this.notifyParticipants(tx, t, participantIds, 'updated', { ...rows[0], count: rows.length }, `series.updated:${newSeries!.id}`);
    }
    return { lessons: await this.toTeacherDtos(rows, tx), seriesId: newSeries!.id, warnings };
  }

  // ───────────── İptal ve tamamlama ─────────────

  async cancel(t: TeacherCtx, id: string, input: CancelLessonInput, existingTx?: Tx): Promise<{ cancelled: number }> {
    const run = async (tx: Tx) => {
      const cur = await this.ownLesson(t, id, tx);
      if (cur.status !== 'scheduled') throw new AppError(ErrorCode.CONFLICT, 'Yalnızca planlanmış ders iptal edilebilir');
      let targets: LessonRow[] = [cur];
      if (input.scope === 'this_and_following' && cur.seriesId) {
        targets = await tx
          .select()
          .from(lesson)
          .where(and(eq(lesson.seriesId, cur.seriesId), gte(lesson.startsAt, cur.startsAt), eq(lesson.status, 'scheduled')));
        const [s] = await tx.select().from(lessonSeries).where(eq(lessonSeries.id, cur.seriesId));
        await tx
          .update(lessonSeries)
          .set({ untilDate: addDays(utcToLocal(cur.startsAt, s!.timezone).date, -1), occurrenceCount: null })
          .where(eq(lessonSeries.id, cur.seriesId));
      }
      const ids = targets.map((l) => l.id);
      await tx
        .update(lesson)
        .set({ status: 'cancelled', cancelReason: input.reason ?? null, updatedAt: new Date() })
        .where(inArray(lesson.id, ids));
      const parts = await this.participantsOf(tx, [cur.id]);
      await this.notifyParticipants(
        tx,
        t,
        (parts.get(cur.id) ?? []).map((p) => p.studentId),
        'cancelled',
        { ...cur, count: ids.length },
        `lesson.cancelled:${cur.id}:${input.scope}`,
      );
      return { cancelled: ids.length };
    };
    return existingTx ? run(existingTx) : this.db.transaction(run);
  }

  async complete(t: TeacherCtx, id: string, input: CompleteLessonInput): Promise<LessonDto> {
    return this.db.transaction(async (tx) => {
      const cur = await this.ownLesson(t, id, tx);
      if (cur.status === 'cancelled') throw new AppError(ErrorCode.CONFLICT, 'İptal edilen ders tamamlanamaz');
      const [row] = await tx
        .update(lesson)
        .set({
          status: 'done',
          completedAt: cur.completedAt ?? new Date(),
          topicsCovered: input.topicsCovered ?? cur.topicsCovered,
          nextPlan: input.nextPlan ?? cur.nextPlan,
          updatedAt: new Date(),
        })
        .where(eq(lesson.id, id))
        .returning();
      for (const a of input.attendance) {
        await tx
          .update(lessonParticipant)
          .set({ attendance: a.attendance })
          .where(and(eq(lessonParticipant.lessonId, id), eq(lessonParticipant.studentId, a.studentId)));
      }
      return (await this.toTeacherDtos([row!], tx))[0]!;
    });
  }

  /** Yoklama tek tek de güncellenebilir (ders tamamlanmadan). */
  async setAttendance(t: TeacherCtx, id: string, studentId: string, attendance: 'unknown' | 'present' | 'absent') {
    await this.ownLesson(t, id);
    const [row] = await this.db
      .update(lessonParticipant)
      .set({ attendance })
      .where(and(eq(lessonParticipant.lessonId, id), eq(lessonParticipant.studentId, studentId)))
      .returning();
    if (!row) throw notFound('Katılımcı');
  }

  // ───────────── Okuma ─────────────

  async get(t: TeacherCtx, id: string): Promise<LessonDto> {
    return (await this.toTeacherDtos([await this.ownLesson(t, id)]))[0]!;
  }

  async calendar(t: TeacherCtx, q: CalendarQuery): Promise<LessonDto[]> {
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (to <= from || to.getTime() - from.getTime() > MAX_CALENDAR_DAYS * 864e5) {
      throw new AppError(ErrorCode.VALIDATION, `Tarih aralığı en fazla ${MAX_CALENDAR_DAYS} gün olabilir`);
    }
    let studentFilter: ReturnType<typeof sql> | undefined;
    if (q.studentId) {
      studentFilter = sql`EXISTS (SELECT 1 FROM lesson_participant lp WHERE lp.lesson_id = ${lesson.id} AND lp.student_id = ${q.studentId})`;
    }
    const rows = await this.db
      .select()
      .from(lesson)
      .where(
        and(
          eq(lesson.workspaceId, t.workspaceId),
          lt(lesson.startsAt, to),
          sql`${lesson.endsAt} > ${from}`,
          q.groupId ? eq(lesson.groupId, q.groupId) : undefined,
          q.status ? eq(lesson.status, q.status) : undefined,
          studentFilter,
        ),
      )
      .orderBy(asc(lesson.startsAt))
      .limit(2000);
    return this.toTeacherDtos(rows);
  }

  /** Öğrencinin geçmiş ve yaklaşan dersleri (profil sekmesi). */
  async forStudent(t: TeacherCtx, studentId: string, which: 'upcoming' | 'past', limit = 50): Promise<LessonDto[]> {
    await this.access.ownStudent(t, studentId);
    const now = new Date();
    const rows = await this.db
      .select({ l: lesson })
      .from(lesson)
      .innerJoin(lessonParticipant, eq(lessonParticipant.lessonId, lesson.id))
      .where(
        and(
          eq(lesson.workspaceId, t.workspaceId),
          eq(lessonParticipant.studentId, studentId),
          which === 'upcoming' ? gte(lesson.startsAt, now) : lt(lesson.startsAt, now),
          which === 'upcoming' ? ne(lesson.status, 'cancelled') : undefined,
        ),
      )
      .orderBy(which === 'upcoming' ? asc(lesson.startsAt) : sql`${lesson.startsAt} DESC`)
      .limit(limit);
    return this.toTeacherDtos(rows.map((r) => r.l));
  }

  /** Bağlı öğrenci kaydı hesapları (test ve portal yardımcıları için). */
  async linkedUserIds(studentIds: string[]) {
    if (!studentIds.length) return [];
    return (await this.db.select({ id: studentAccountLink.userId }).from(studentAccountLink).where(inArray(studentAccountLink.studentId, studentIds))).map((r) => r.id);
  }
}
