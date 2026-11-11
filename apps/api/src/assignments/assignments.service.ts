import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  ErrorCode,
  isLate,
  type AssignmentInput,
  type AssignmentUpdate,
  type ReviewInput,
  type SubmissionInput,
} from '@derslik/shared';
import { DB, type Db, type Tx } from '../db/db';
import {
  assignment,
  assignmentFeedback,
  assignmentFile,
  assignmentRecipient,
  fileObject,
  material,
  student,
  submission,
  submissionFile,
  workspace,
} from '../db/schema';
import { AccessService, type TeacherCtx } from '../common/access.service';
import { AppError, forbidden, notFound } from '../common/errors';
import { FilesService, answerKeyVisible } from '../files/files.service';
import { GroupsService } from '../groups/groups.service';
import { NotificationsService } from '../notifications/notifications.service';

type AssignmentRow = typeof assignment.$inferSelect;

@Injectable()
export class AssignmentsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly access: AccessService,
    private readonly groups: GroupsService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
  ) {}

  async ownAssignment(t: TeacherCtx, id: string, tx: Tx = this.db): Promise<AssignmentRow> {
    const [a] = await tx.select().from(assignment).where(and(eq(assignment.id, id), eq(assignment.workspaceId, t.workspaceId)));
    if (!a) throw notFound('Ödev');
    return a;
  }

  private async filesOf(tx: Tx, assignmentId: string) {
    return tx
      .select({ id: fileObject.id, name: fileObject.originalName, mime: fileObject.mime, size: fileObject.sizeBytes, isAnswerKey: assignmentFile.isAnswerKey })
      .from(assignmentFile)
      .innerJoin(fileObject, eq(fileObject.id, assignmentFile.fileId))
      .where(eq(assignmentFile.assignmentId, assignmentId));
  }

  private async notifyRecipients(tx: Tx, t: TeacherCtx, a: AssignmentRow, studentIds: string[], type: 'published' | 'updated') {
    const users = await this.notifications.recipientsForStudents(tx, studentIds);
    const [ws] = await tx.select({ name: workspace.displayName }).from(workspace).where(eq(workspace.id, t.workspaceId));
    await this.notifications.notify(tx, users, {
      workspaceId: t.workspaceId,
      category: 'assignment',
      type: `assignment.${type}`,
      titleKey: `notif.assignment.${type}`,
      params: { teacher: ws?.name ?? '', title: a.title },
      link: `/assignments/${a.id}`,
      dedupeKey: `assignment.${type}:${a.id}:${type === 'updated' ? (a.dueAt?.toISOString() ?? 'none') + a.updatedAt.getTime() : ''}`,
    });
  }

  async create(t: TeacherCtx, input: AssignmentInput, existingTx?: Tx) {
    const run = async (tx: Tx) => {
      const ids = new Set(input.studentIds);
      for (const id of input.studentIds) await this.access.ownActiveStudent(t, id, tx);
      if (input.groupId) {
        const g = await this.groups.ownGroup(t, input.groupId, tx);
        for (const id of await this.groups.activeMemberIds(g.id, tx)) ids.add(id);
      }
      if (ids.size === 0) throw new AppError(ErrorCode.VALIDATION, 'Ödevi alacak aktif öğrenci yok');
      await this.files.assertAttachable(tx, input.fileIds, t.workspaceId, ['assignment', 'material']);
      await this.files.assertAttachable(tx, input.answerKeyFileIds, t.workspaceId, ['answer_key']);
      const now = new Date();
      const [a] = await tx
        .insert(assignment)
        .values({
          workspaceId: t.workspaceId,
          groupId: input.groupId ?? null,
          title: input.title,
          description: input.description ?? null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          links: input.links,
          status: input.publish ? 'published' : 'draft',
          publishedAt: input.publish ? now : null,
          answerKeyText: input.answerKeyText ?? null,
          answerKeyVisibility: input.answerKeyVisibility,
          answerKeyVisibleAt: input.answerKeyVisibleAt ? new Date(input.answerKeyVisibleAt) : null,
        })
        .returning();
      await tx.insert(assignmentRecipient).values([...ids].map((studentId) => ({ assignmentId: a!.id, studentId })));
      const fileRows = [
        ...input.fileIds.map((fileId) => ({ assignmentId: a!.id, fileId, isAnswerKey: false })),
        ...input.answerKeyFileIds.map((fileId) => ({ assignmentId: a!.id, fileId, isAnswerKey: true })),
      ];
      if (fileRows.length) await tx.insert(assignmentFile).values(fileRows);
      if (a!.status === 'published') await this.notifyRecipients(tx, t, a!, [...ids], 'published');
      return this.detail(t, a!.id, tx);
    };
    return existingTx ? run(existingTx) : this.db.transaction(run);
  }

  async update(t: TeacherCtx, id: string, patch: AssignmentUpdate) {
    return this.db.transaction(async (tx) => {
      const cur = await this.ownAssignment(t, id, tx);
      const set: Partial<typeof assignment.$inferInsert> = { updatedAt: new Date() };
      for (const k of ['title', 'description', 'links', 'answerKeyText', 'answerKeyVisibility'] as const) {
        if (patch[k] !== undefined) (set as Record<string, unknown>)[k] = patch[k];
      }
      if (patch.dueAt !== undefined) set.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
      if (patch.answerKeyVisibleAt !== undefined) set.answerKeyVisibleAt = patch.answerKeyVisibleAt ? new Date(patch.answerKeyVisibleAt) : null;
      const vis = (set.answerKeyVisibility ?? cur.answerKeyVisibility) as string;
      const at = set.answerKeyVisibleAt !== undefined ? set.answerKeyVisibleAt : cur.answerKeyVisibleAt;
      if (vis === 'at_date' && !at) throw new AppError(ErrorCode.VALIDATION, 'Belirli tarihte görünürlük için tarih gerekli');
      if (patch.fileIds) {
        await this.files.assertAttachable(tx, patch.fileIds, t.workspaceId, ['assignment', 'material']);
        await tx.delete(assignmentFile).where(and(eq(assignmentFile.assignmentId, id), eq(assignmentFile.isAnswerKey, false)));
        if (patch.fileIds.length) await tx.insert(assignmentFile).values(patch.fileIds.map((fileId) => ({ assignmentId: id, fileId, isAnswerKey: false })));
      }
      if (patch.answerKeyFileIds) {
        await this.files.assertAttachable(tx, patch.answerKeyFileIds, t.workspaceId, ['answer_key']);
        await tx.delete(assignmentFile).where(and(eq(assignmentFile.assignmentId, id), eq(assignmentFile.isAnswerKey, true)));
        if (patch.answerKeyFileIds.length) await tx.insert(assignmentFile).values(patch.answerKeyFileIds.map((fileId) => ({ assignmentId: id, fileId, isAnswerKey: true })));
      }
      const [a] = await tx.update(assignment).set(set).where(eq(assignment.id, id)).returning();
      const visibleChange = ['title', 'description', 'dueAt', 'links', 'fileIds'].some((k) => (patch as Record<string, unknown>)[k] !== undefined);
      if (a!.status === 'published' && visibleChange) {
        const recips = await tx.select({ s: assignmentRecipient.studentId }).from(assignmentRecipient).where(eq(assignmentRecipient.assignmentId, id));
        await this.notifyRecipients(tx, t, a!, recips.map((r) => r.s), 'updated');
      }
      return this.detail(t, id, tx);
    });
  }

  async publish(t: TeacherCtx, id: string, existingTx?: Tx) {
    const run = async (tx: Tx) => {
      const a = await this.ownAssignment(t, id, tx);
      if (a.status === 'published') return this.detail(t, id, tx);
      const [row] = await tx.update(assignment).set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() }).where(eq(assignment.id, id)).returning();
      const recips = await tx.select({ s: assignmentRecipient.studentId }).from(assignmentRecipient).where(eq(assignmentRecipient.assignmentId, id));
      await this.notifyRecipients(tx, t, row!, recips.map((r) => r.s), 'published');
      return this.detail(t, id, tx);
    };
    return existingTx ? run(existingTx) : this.db.transaction(run);
  }

  async remove(t: TeacherCtx, id: string) {
    await this.ownAssignment(t, id);
    await this.db.delete(assignment).where(eq(assignment.id, id));
  }

  async list(t: TeacherCtx, filter: { studentId?: string; status?: 'draft' | 'published' }) {
    const rows = await this.db
      .select({
        a: assignment,
        total: sql<number>`(SELECT count(*)::int FROM assignment_recipient r WHERE r.assignment_id = ${assignment.id})`,
        submitted: sql<number>`(SELECT count(*)::int FROM assignment_recipient r WHERE r.assignment_id = ${assignment.id} AND r.status IN ('submitted'))`,
        reviewed: sql<number>`(SELECT count(*)::int FROM assignment_recipient r WHERE r.assignment_id = ${assignment.id} AND r.status = 'reviewed')`,
      })
      .from(assignment)
      .where(
        and(
          eq(assignment.workspaceId, t.workspaceId),
          filter.status ? eq(assignment.status, filter.status) : undefined,
          filter.studentId
            ? sql`EXISTS (SELECT 1 FROM assignment_recipient r WHERE r.assignment_id = ${assignment.id} AND r.student_id = ${filter.studentId})`
            : undefined,
        ),
      )
      .orderBy(desc(assignment.createdAt))
      .limit(300);
    return rows.map((r) => ({
      id: r.a.id,
      title: r.a.title,
      status: r.a.status,
      dueAt: r.a.dueAt?.toISOString() ?? null,
      groupId: r.a.groupId,
      counts: { total: r.total, submitted: r.submitted, reviewed: r.reviewed },
      createdAt: r.a.createdAt.toISOString(),
    }));
  }

  async detail(t: TeacherCtx, id: string, tx: Tx = this.db) {
    const a = await this.ownAssignment(t, id, tx);
    const recipients = await tx
      .select({ r: assignmentRecipient, name: student.displayName })
      .from(assignmentRecipient)
      .innerJoin(student, eq(student.id, assignmentRecipient.studentId))
      .where(eq(assignmentRecipient.assignmentId, id))
      .orderBy(student.displayName);
    const dueIso = a.dueAt?.toISOString() ?? null;
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      dueAt: dueIso,
      links: a.links,
      status: a.status,
      groupId: a.groupId,
      publishedAt: a.publishedAt?.toISOString() ?? null,
      answerKeyText: a.answerKeyText,
      answerKeyVisibility: a.answerKeyVisibility,
      answerKeyVisibleAt: a.answerKeyVisibleAt?.toISOString() ?? null,
      files: await this.filesOf(tx, a.id),
      recipients: recipients.map(({ r, name }) => ({
        id: r.id,
        studentId: r.studentId,
        displayName: name,
        status: r.status,
        score: r.score,
        lastSubmittedAt: r.lastSubmittedAt?.toISOString() ?? null,
        late: isLate(dueIso, r.lastSubmittedAt?.toISOString() ?? null),
      })),
    };
  }

  private async submissionsOf(tx: Tx, recipientId: string) {
    const subs = await tx.select().from(submission).where(eq(submission.recipientId, recipientId)).orderBy(desc(submission.version));
    const files = subs.length
      ? await tx
          .select({ submissionId: submissionFile.submissionId, id: fileObject.id, name: fileObject.originalName, mime: fileObject.mime, size: fileObject.sizeBytes })
          .from(submissionFile)
          .innerJoin(fileObject, eq(fileObject.id, submissionFile.fileId))
          .where(inArray(submissionFile.submissionId, subs.map((s) => s.id)))
      : [];
    const feedback = await tx.select().from(assignmentFeedback).where(eq(assignmentFeedback.recipientId, recipientId)).orderBy(desc(assignmentFeedback.createdAt));
    return {
      submissions: subs.map((s) => ({
        id: s.id,
        version: s.version,
        text: s.text,
        submittedAt: s.submittedAt.toISOString(),
        files: files.filter((f) => f.submissionId === s.id).map(({ submissionId: _s, ...f }) => f),
      })),
      feedback: feedback.map((f) => ({
        id: f.id,
        submissionId: f.submissionId,
        feedback: f.feedback,
        score: f.score,
        requestedResubmit: f.requestedResubmit,
        createdAt: f.createdAt.toISOString(),
      })),
    };
  }

  async recipientDetail(t: TeacherCtx, recipientId: string) {
    const [r] = await this.db
      .select({ r: assignmentRecipient })
      .from(assignmentRecipient)
      .innerJoin(assignment, eq(assignment.id, assignmentRecipient.assignmentId))
      .where(and(eq(assignmentRecipient.id, recipientId), eq(assignment.workspaceId, t.workspaceId)));
    if (!r) throw notFound('Teslim');
    return { recipient: r.r, ...(await this.submissionsOf(this.db, recipientId)) };
  }

  /** Öğretmen incelemesi: geri bildirim, isteğe bağlı puan, yeniden teslim isteği. */
  async review(t: TeacherCtx, recipientId: string, input: ReviewInput) {
    return this.db.transaction(async (tx) => {
      const locked = await tx.execute<{ id: string }>(sql`
        SELECT r.id FROM assignment_recipient r JOIN assignment a ON a.id = r.assignment_id
        WHERE r.id = ${recipientId} AND a.workspace_id = ${t.workspaceId} FOR UPDATE OF r`);
      if (!locked.rows[0]) throw notFound('Teslim');
      const [r] = await tx.select().from(assignmentRecipient).where(eq(assignmentRecipient.id, recipientId));
      if (r!.status === 'assigned') throw new AppError(ErrorCode.CONFLICT, 'Henüz teslim yapılmadı');
      const [latest] = await tx.select().from(submission).where(eq(submission.recipientId, recipientId)).orderBy(desc(submission.version)).limit(1);
      await tx.insert(assignmentFeedback).values({
        recipientId,
        submissionId: latest?.id ?? null,
        feedback: input.feedback ?? null,
        score: input.score ?? null,
        requestedResubmit: input.requestResubmit,
      });
      const status = input.requestResubmit ? 'resubmit_requested' : 'reviewed';
      const [row] = await tx
        .update(assignmentRecipient)
        .set({ status, reviewedAt: new Date(), score: input.score ?? r!.score })
        .where(eq(assignmentRecipient.id, recipientId))
        .returning();
      const users = await this.notifications.recipientsForStudents(tx, [r!.studentId]);
      await this.notifications.notify(tx, users, {
        workspaceId: t.workspaceId,
        category: 'feedback',
        type: input.requestResubmit ? 'assignment.resubmit_requested' : 'assignment.reviewed',
        titleKey: input.requestResubmit ? 'notif.assignment.resubmit' : 'notif.assignment.reviewed',
        params: {},
        link: `/assignments/${r!.assignmentId}`,
        dedupeKey: `assignment.review:${recipientId}:${latest?.version ?? 0}:${status}`,
      });
      return row!;
    });
  }

  // ───────────── Öğrenci/veli ─────────────

  /** Görüntüleyenin yayımlanmış ödevleri; taslaklar asla dönmez. */
  async portalList(userId: string, studentId?: string) {
    const viewers = (await this.access.viewerStudents(userId)).filter((v) => !studentId || v.studentId === studentId);
    if (viewers.length === 0) return [];
    const rows = await this.db
      .select({ a: assignment, r: assignmentRecipient, teacher: workspace.displayName })
      .from(assignmentRecipient)
      .innerJoin(assignment, and(eq(assignment.id, assignmentRecipient.assignmentId), eq(assignment.status, 'published')))
      .innerJoin(workspace, eq(workspace.id, assignment.workspaceId))
      .where(inArray(assignmentRecipient.studentId, viewers.map((v) => v.studentId)))
      .orderBy(sql`${assignment.dueAt} ASC NULLS LAST`)
      .limit(300);
    return rows.map(({ a, r, teacher }) => ({
      id: a.id,
      recipientId: r.id,
      studentId: r.studentId,
      teacherName: teacher,
      title: a.title,
      dueAt: a.dueAt?.toISOString() ?? null,
      status: r.status,
      late: isLate(a.dueAt?.toISOString() ?? null, r.lastSubmittedAt?.toISOString() ?? null),
    }));
  }

  private async portalRecipient(userId: string, assignmentId: string, studentId?: string) {
    const viewers = (await this.access.viewerStudents(userId)).filter((v) => !studentId || v.studentId === studentId);
    if (viewers.length === 0) throw notFound('Ödev');
    const [row] = await this.db
      .select({ a: assignment, r: assignmentRecipient })
      .from(assignmentRecipient)
      .innerJoin(assignment, and(eq(assignment.id, assignmentRecipient.assignmentId), eq(assignment.status, 'published')))
      .where(and(eq(assignment.id, assignmentId), inArray(assignmentRecipient.studentId, viewers.map((v) => v.studentId))))
      .limit(1);
    if (!row) throw notFound('Ödev');
    const viewer = viewers.find((v) => v.studentId === row.r.studentId)!;
    return { ...row, viewer };
  }

  /** Cevap anahtarı yalnızca görünürlük kuralı izin veriyorsa yanıta GİRER (arayüzde gizlemek yeterli değil). */
  async portalDetail(userId: string, assignmentId: string, studentId?: string) {
    const { a, r, viewer } = await this.portalRecipient(userId, assignmentId, studentId);
    const keyVisible = answerKeyVisible(a.answerKeyVisibility, a.answerKeyVisibleAt, r.status);
    const files = (await this.filesOf(this.db, a.id)).filter((f) => !f.isAnswerKey || keyVisible);
    const history = await this.submissionsOf(this.db, r.id);
    return {
      id: a.id,
      recipientId: r.id,
      studentId: r.studentId,
      title: a.title,
      description: a.description,
      dueAt: a.dueAt?.toISOString() ?? null,
      links: a.links,
      status: r.status,
      late: isLate(a.dueAt?.toISOString() ?? null, r.lastSubmittedAt?.toISOString() ?? null),
      canSubmit: viewer.role === 'student' && r.status !== 'reviewed',
      files: files.map(({ isAnswerKey, ...f }) => ({ ...f, isAnswerKey })),
      answerKey: keyVisible ? { text: a.answerKeyText } : null,
      // Veli teslim dosyalarını değil yalnızca durum ve geri bildirimi görür.
      submissions: viewer.role === 'student' ? history.submissions : history.submissions.map((s) => ({ ...s, text: null, files: [] })),
      feedback: history.feedback,
    };
  }

  /** Yalnızca öğrencinin kendisi teslim eder (veli edemez). Her teslim yeni sürümdür. */
  async submit(userId: string, assignmentId: string, studentId: string, input: SubmissionInput) {
    return this.db.transaction(async (tx) => {
      const { a, r, viewer } = await this.portalRecipient(userId, assignmentId, studentId);
      if (viewer.role !== 'student') throw forbidden('Ödevi yalnızca öğrenci teslim edebilir');
      await tx.execute(sql`SELECT id FROM assignment_recipient WHERE id = ${r.id} FOR UPDATE`);
      const [cur] = await tx.select().from(assignmentRecipient).where(eq(assignmentRecipient.id, r.id));
      if (cur!.status === 'reviewed') throw new AppError(ErrorCode.CONFLICT, 'Ödev incelendi; öğretmen yeniden teslim istemedikçe yeni teslim yapılamaz');
      await this.files.assertAttachable(tx, input.fileIds, a.workspaceId, ['submission'], userId);
      const [{ next }] = (await tx.execute<{ next: number }>(sql`SELECT coalesce(max(version), 0) + 1 AS next FROM submission WHERE recipient_id = ${r.id}`)).rows as [{ next: number }];
      const [s] = await tx.insert(submission).values({ recipientId: r.id, version: next, text: input.text ?? null, submittedBy: userId }).returning();
      if (input.fileIds.length) await tx.insert(submissionFile).values(input.fileIds.map((fileId) => ({ submissionId: s!.id, fileId })));
      const now = new Date();
      await tx.update(assignmentRecipient).set({ status: 'submitted', lastSubmittedAt: now }).where(eq(assignmentRecipient.id, r.id));
      const [ws] = await tx.select({ owner: workspace.ownerUserId }).from(workspace).where(eq(workspace.id, a.workspaceId));
      const [st] = await tx.select({ n: student.displayName }).from(student).where(eq(student.id, r.studentId));
      await this.notifications.notify(tx, [ws!.owner], {
        workspaceId: a.workspaceId,
        category: 'assignment',
        type: 'assignment.submitted',
        titleKey: 'notif.assignment.submitted',
        params: { student: st!.n, title: a.title },
        link: `/assignments/${a.id}`,
        dedupeKey: `assignment.submitted:${r.id}:${next}`,
      });
      return { submissionId: s!.id, version: next, status: 'submitted' as const, late: isLate(a.dueAt?.toISOString() ?? null, now.toISOString()) };
    });
  }

  // ───────────── Materyaller ─────────────

  async listMaterials(t: TeacherCtx) {
    return this.db.select().from(material).where(eq(material.workspaceId, t.workspaceId)).orderBy(desc(material.createdAt)).limit(500);
  }

  async createMaterial(t: TeacherCtx, input: { title: string; description?: string | null; url?: string | null; fileId?: string | null; tags: string[] }) {
    return this.db.transaction(async (tx) => {
      if (input.fileId) await this.files.assertAttachable(tx, [input.fileId], t.workspaceId, ['material', 'assignment']);
      const [row] = await tx.insert(material).values({ ...input, workspaceId: t.workspaceId }).returning();
      return row!;
    });
  }

  async deleteMaterial(t: TeacherCtx, id: string) {
    const [row] = await this.db.delete(material).where(and(eq(material.id, id), eq(material.workspaceId, t.workspaceId))).returning({ id: material.id });
    if (!row) throw notFound('Materyal');
  }

  /** Bu hafta eksik ödevi olanlar vb. sorular için (AI okuma aracı). */
  async openRecipients(t: TeacherCtx) {
    return this.db
      .select({ assignmentId: assignment.id, title: assignment.title, dueAt: assignment.dueAt, studentId: student.id, displayName: student.displayName, status: assignmentRecipient.status })
      .from(assignmentRecipient)
      .innerJoin(assignment, and(eq(assignment.id, assignmentRecipient.assignmentId), eq(assignment.status, 'published')))
      .innerJoin(student, eq(student.id, assignmentRecipient.studentId))
      .where(and(eq(assignment.workspaceId, t.workspaceId), inArray(assignmentRecipient.status, ['assigned', 'resubmit_requested']), isNull(student.archivedAt)));
  }
}
