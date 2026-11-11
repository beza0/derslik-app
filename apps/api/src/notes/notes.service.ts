import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  MIN_POINTS_FOR_TREND,
  type AssessmentDto,
  type AssessmentInput,
  type NoteDto,
  type NoteInput,
  type NoteUpdate,
  type Visibility,
} from '@derslik/shared';
import { DB, type Db, type Tx } from '../db/db';
import { assessment, lesson, note } from '../db/schema';
import { AccessService, type StudentViewer, type TeacherCtx } from '../common/access.service';
import { notFound } from '../common/errors';
import { NotificationsService } from '../notifications/notifications.service';

type NoteRow = typeof note.$inferSelect;
type AssessmentRow = typeof assessment.$inferSelect;

const toNote = (n: NoteRow): NoteDto => ({
  id: n.id,
  studentId: n.studentId,
  lessonId: n.lessonId,
  kind: n.kind,
  topic: n.topic,
  body: n.body,
  visibility: n.visibility,
  createdAt: n.createdAt.toISOString(),
  updatedAt: n.updatedAt.toISOString(),
});

const toAssessment = (a: AssessmentRow): AssessmentDto => ({
  id: a.id,
  studentId: a.studentId,
  title: a.title,
  date: a.date,
  topic: a.topic,
  score: a.score,
  maxScore: a.maxScore,
  feedback: a.feedback,
  visibility: a.visibility,
  createdAt: a.createdAt.toISOString(),
});

/** Görüntüleyen role göre görünür kılınan görünürlük değerleri. Öğretmene özel asla dahil değil. */
export function visibleFor(role: 'student' | 'guardian'): Visibility[] {
  return role === 'student' ? ['student', 'student_guardian'] : ['student_guardian'];
}

@Injectable()
export class NotesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly access: AccessService,
    private readonly notifications: NotificationsService,
  ) {}

  private async notifyShared(tx: Tx, t: TeacherCtx, studentId: string, visibility: Visibility, kind: 'note' | 'assessment', id: string) {
    if (visibility === 'private') return;
    const users = await this.notifications.recipientsForStudents(tx, [studentId], { guardians: visibility === 'student_guardian' });
    await this.notifications.notify(tx, users, {
      workspaceId: t.workspaceId,
      category: 'feedback',
      type: `${kind}.shared`,
      titleKey: `notif.${kind}.shared`,
      params: {},
      link: kind === 'note' ? `/notes` : `/assessments`,
      dedupeKey: `${kind}.shared:${id}:${visibility}`,
    });
  }

  // ───────────── Notlar ─────────────

  async createNote(t: TeacherCtx, input: NoteInput, opts: { createdByAi?: boolean } = {}, existingTx?: Tx): Promise<NoteDto> {
    const run = async (tx: Tx) => {
      await this.access.ownActiveStudent(t, input.studentId, tx);
      if (input.lessonId) {
        const [l] = await tx.select({ id: lesson.id }).from(lesson).where(and(eq(lesson.id, input.lessonId), eq(lesson.workspaceId, t.workspaceId)));
        if (!l) throw notFound('Ders');
      }
      const [row] = await tx
        .insert(note)
        .values({ ...input, lessonId: input.lessonId ?? null, topic: input.topic ?? null, workspaceId: t.workspaceId, createdByAi: Boolean(opts.createdByAi) })
        .returning();
      await this.notifyShared(tx, t, row!.studentId, row!.visibility, 'note', row!.id);
      return toNote(row!);
    };
    return existingTx ? run(existingTx) : this.db.transaction(run);
  }

  async updateNote(t: TeacherCtx, id: string, patch: NoteUpdate): Promise<NoteDto> {
    return this.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(note).where(and(eq(note.id, id), eq(note.workspaceId, t.workspaceId)));
      if (!cur) throw notFound('Not');
      const [row] = await tx.update(note).set({ ...patch, updatedAt: new Date() }).where(eq(note.id, id)).returning();
      if (patch.visibility && patch.visibility !== cur.visibility) await this.notifyShared(tx, t, row!.studentId, row!.visibility, 'note', row!.id);
      return toNote(row!);
    });
  }

  async deleteNote(t: TeacherCtx, id: string, existingTx?: Tx) {
    const [row] = await (existingTx ?? this.db).delete(note).where(and(eq(note.id, id), eq(note.workspaceId, t.workspaceId))).returning({ id: note.id });
    if (!row) throw notFound('Not');
  }

  async listNotes(t: TeacherCtx, studentId: string, limit = 100): Promise<NoteDto[]> {
    await this.access.ownStudent(t, studentId);
    const rows = await this.db.select().from(note).where(eq(note.studentId, studentId)).orderBy(desc(note.createdAt)).limit(limit);
    return rows.map(toNote);
  }

  // ───────────── Değerlendirmeler ─────────────

  async createAssessment(t: TeacherCtx, input: AssessmentInput): Promise<AssessmentDto> {
    return this.db.transaction(async (tx) => {
      await this.access.ownActiveStudent(t, input.studentId, tx);
      const [row] = await tx
        .insert(assessment)
        .values({
          ...input,
          topic: input.topic ?? null,
          score: input.score ?? null,
          maxScore: input.maxScore ?? null,
          feedback: input.feedback ?? null,
          workspaceId: t.workspaceId,
        })
        .returning();
      await this.notifyShared(tx, t, row!.studentId, row!.visibility, 'assessment', row!.id);
      return toAssessment(row!);
    });
  }

  async updateAssessment(t: TeacherCtx, id: string, patch: Partial<AssessmentInput>): Promise<AssessmentDto> {
    return this.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(assessment).where(and(eq(assessment.id, id), eq(assessment.workspaceId, t.workspaceId)));
      if (!cur) throw notFound('Değerlendirme');
      const { studentId: _ignored, ...rest } = patch;
      const [row] = await tx.update(assessment).set(rest).where(eq(assessment.id, id)).returning();
      if (patch.visibility && patch.visibility !== cur.visibility) await this.notifyShared(tx, t, row!.studentId, row!.visibility, 'assessment', row!.id);
      return toAssessment(row!);
    });
  }

  async deleteAssessment(t: TeacherCtx, id: string) {
    const [row] = await this.db.delete(assessment).where(and(eq(assessment.id, id), eq(assessment.workspaceId, t.workspaceId))).returning({ id: assessment.id });
    if (!row) throw notFound('Değerlendirme');
  }

  async listAssessments(t: TeacherCtx, studentId: string): Promise<AssessmentDto[]> {
    await this.access.ownStudent(t, studentId);
    const rows = await this.db.select().from(assessment).where(eq(assessment.studentId, studentId)).orderBy(desc(assessment.date));
    return rows.map(toAssessment);
  }

  /**
   * Gelişim verisi yalnızca gerçek sayısal kayıtlardan. Yeterli veri yoksa eğilim üretilmez.
   * Puan maksimumla verildiyse yüzdeye çevrilir; aksi halde ham puan gösterilir.
   */
  progressFrom(rows: AssessmentRow[]) {
    const points = rows
      .filter((r) => r.score !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        date: r.date,
        title: r.title,
        topic: r.topic,
        value: r.maxScore ? Math.round((r.score! / r.maxScore) * 1000) / 10 : r.score!,
        unit: r.maxScore ? ('percent' as const) : ('raw' as const),
      }));
    return { enoughData: points.length >= MIN_POINTS_FOR_TREND, minPoints: MIN_POINTS_FOR_TREND, points };
  }

  async progress(t: TeacherCtx, studentId: string) {
    await this.access.ownStudent(t, studentId);
    return this.progressFrom(await this.db.select().from(assessment).where(eq(assessment.studentId, studentId)).orderBy(asc(assessment.date)));
  }

  // ───────────── Öğrenci/veli görünümü ─────────────

  private async viewers(userId: string, studentId?: string): Promise<StudentViewer[]> {
    const all = await this.access.viewerStudents(userId);
    return studentId ? all.filter((v) => v.studentId === studentId) : all;
  }

  async portalNotes(userId: string, studentId?: string) {
    const out: (NoteDto & { teacherVisible?: never })[] = [];
    for (const v of await this.viewers(userId, studentId)) {
      const rows = await this.db
        .select()
        .from(note)
        .where(and(eq(note.studentId, v.studentId), inArray(note.visibility, visibleFor(v.role))))
        .orderBy(desc(note.createdAt))
        .limit(200);
      out.push(...rows.map(toNote));
    }
    return out;
  }

  async portalAssessments(userId: string, studentId?: string) {
    const out: { studentId: string; items: AssessmentDto[]; progress: ReturnType<NotesService['progressFrom']> }[] = [];
    for (const v of await this.viewers(userId, studentId)) {
      const rows = await this.db
        .select()
        .from(assessment)
        .where(and(eq(assessment.studentId, v.studentId), inArray(assessment.visibility, visibleFor(v.role))))
        .orderBy(asc(assessment.date));
      out.push({ studentId: v.studentId, items: rows.map(toAssessment).reverse(), progress: this.progressFrom(rows) });
    }
    return out;
  }
}
