import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import type { GroupInput, GroupMembershipChange } from '@derslik/shared';
import { DB, type Db, type Tx } from '../db/db';
import {
  assignment,
  assignmentRecipient,
  groupMembership,
  lesson,
  lessonParticipant,
  student,
  studentGroup,
} from '../db/schema';
import { type TeacherCtx } from '../common/access.service';
import { AppError, notFound } from '../common/errors';
import { ErrorCode } from '@derslik/shared';
import { formatRange } from '../lessons/recurrence';

@Injectable()
export class GroupsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async ownGroup(t: TeacherCtx, groupId: string, tx: Tx = this.db) {
    const [g] = await tx
      .select()
      .from(studentGroup)
      .where(and(eq(studentGroup.id, groupId), eq(studentGroup.workspaceId, t.workspaceId)));
    if (!g) throw notFound('Grup');
    return g;
  }

  /** Verilen öğrenci kimliklerinin tamamı bu çalışma alanına ait ve aktif olmalı. */
  private async assertOwnActiveStudents(t: TeacherCtx, ids: string[], tx: Tx) {
    if (ids.length === 0) return;
    const rows = await tx
      .select({ id: student.id, status: student.status })
      .from(student)
      .where(and(eq(student.workspaceId, t.workspaceId), inArray(student.id, ids)));
    if (rows.length !== new Set(ids).size) throw notFound('Öğrenci');
    if (rows.some((r) => r.status !== 'active')) {
      throw new AppError(ErrorCode.STUDENT_ARCHIVED, 'Arşivdeki öğrenci gruba eklenemez');
    }
  }

  async activeMemberIds(groupId: string, tx: Tx = this.db): Promise<string[]> {
    const rows = await tx
      .select({ id: groupMembership.studentId })
      .from(groupMembership)
      .innerJoin(student, eq(student.id, groupMembership.studentId))
      .where(and(eq(groupMembership.groupId, groupId), isNull(groupMembership.leftAt), eq(student.status, 'active')));
    return rows.map((r) => r.id);
  }

  async create(t: TeacherCtx, input: GroupInput, existingTx?: Tx) {
    const run = async (tx: Tx) => {
      await this.assertOwnActiveStudents(t, input.studentIds, tx);
      const [g] = await tx
        .insert(studentGroup)
        .values({ workspaceId: t.workspaceId, name: input.name, description: input.description ?? null })
        .returning();
      if (input.studentIds.length) {
        await tx.insert(groupMembership).values([...new Set(input.studentIds)].map((studentId) => ({ groupId: g!.id, studentId })));
      }
      return this.detail(t, g!.id, tx);
    };
    return existingTx ? run(existingTx) : this.db.transaction(run);
  }

  async list(t: TeacherCtx, includeArchived = false) {
    return this.db
      .select({
        id: studentGroup.id,
        name: studentGroup.name,
        description: studentGroup.description,
        archivedAt: studentGroup.archivedAt,
        memberCount: sql<number>`(SELECT count(*)::int FROM group_membership gm JOIN student s ON s.id = gm.student_id
          WHERE gm.group_id = ${studentGroup.id} AND gm.left_at IS NULL AND s.status = 'active')`,
      })
      .from(studentGroup)
      .where(and(eq(studentGroup.workspaceId, t.workspaceId), includeArchived ? undefined : isNull(studentGroup.archivedAt)))
      .orderBy(asc(studentGroup.name));
  }

  async detail(t: TeacherCtx, groupId: string, tx: Tx = this.db) {
    const g = await this.ownGroup(t, groupId, tx);
    const members = await tx
      .select({ studentId: student.id, displayName: student.displayName, status: student.status, joinedAt: groupMembership.joinedAt })
      .from(groupMembership)
      .innerJoin(student, eq(student.id, groupMembership.studentId))
      .where(and(eq(groupMembership.groupId, groupId), isNull(groupMembership.leftAt)))
      .orderBy(asc(student.displayName));
    return { id: g.id, name: g.name, description: g.description, archivedAt: g.archivedAt, members };
  }

  async update(t: TeacherCtx, groupId: string, patch: { name?: string; description?: string | null }) {
    await this.ownGroup(t, groupId);
    await this.db.update(studentGroup).set(patch).where(eq(studentGroup.id, groupId));
    return this.detail(t, groupId);
  }

  async setArchived(t: TeacherCtx, groupId: string, archived: boolean) {
    await this.ownGroup(t, groupId);
    await this.db.update(studentGroup).set({ archivedAt: archived ? new Date() : null }).where(eq(studentGroup.id, groupId));
    return this.detail(t, groupId);
  }

  /**
   * Üyelik değişikliğinin gelecek derslere ve açık ödevlere etkisi. Geçmiş katılımlar asla değişmez.
   * Hiçbir şey yazmaz; öğretmen sonucu görüp `apply` ile açıkça seçer.
   */
  async previewMembership(t: TeacherCtx, groupId: string, change: GroupMembershipChange, tx: Tx = this.db) {
    await this.ownGroup(t, groupId, tx);
    await this.assertOwnActiveStudents(t, change.add, tx);
    const now = new Date();
    const futureLessons = await tx
      .select({ id: lesson.id, startsAt: lesson.startsAt, endsAt: lesson.endsAt, timezone: lesson.timezone })
      .from(lesson)
      .where(and(eq(lesson.groupId, groupId), eq(lesson.status, 'scheduled'), gt(lesson.startsAt, now)))
      .orderBy(asc(lesson.startsAt));
    const openAssignments = await tx
      .select({ id: assignment.id, title: assignment.title, dueAt: assignment.dueAt })
      .from(assignment)
      .where(
        and(
          eq(assignment.groupId, groupId),
          eq(assignment.status, 'published'),
          or(isNull(assignment.dueAt), gt(assignment.dueAt, now)),
        ),
      );
    // Çıkarılan öğrencinin teslim yaptığı ödevler korunur; yalnızca "atandı" durumundakiler kaldırılabilir.
    const removableRecipients = change.remove.length && openAssignments.length
      ? await tx
          .select({ assignmentId: assignmentRecipient.assignmentId, studentId: assignmentRecipient.studentId, status: assignmentRecipient.status })
          .from(assignmentRecipient)
          .where(and(inArray(assignmentRecipient.assignmentId, openAssignments.map((a) => a.id)), inArray(assignmentRecipient.studentId, change.remove)))
      : [];
    return {
      add: change.add,
      remove: change.remove,
      futureLessons: futureLessons.map((l) => ({ id: l.id, when: formatRange(l.startsAt, l.endsAt, l.timezone) })),
      openAssignments: openAssignments.map((a) => ({ id: a.id, title: a.title, dueAt: a.dueAt?.toISOString() ?? null })),
      keptBecauseSubmitted: removableRecipients.filter((r) => r.status !== 'assigned').length,
    };
  }

  async applyMembership(t: TeacherCtx, groupId: string, change: GroupMembershipChange) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM student_group WHERE id = ${groupId} FOR UPDATE`);
      const preview = await this.previewMembership(t, groupId, change, tx);
      const current = new Set(await this.activeMemberIds(groupId, tx));
      const toAdd = [...new Set(change.add)].filter((id) => !current.has(id));
      const toRemove = [...new Set(change.remove)].filter((id) => current.has(id));
      if (toAdd.length) await tx.insert(groupMembership).values(toAdd.map((studentId) => ({ groupId, studentId })));
      if (toRemove.length) {
        await tx
          .update(groupMembership)
          .set({ leftAt: new Date() })
          .where(and(eq(groupMembership.groupId, groupId), inArray(groupMembership.studentId, toRemove), isNull(groupMembership.leftAt)));
      }
      const lessonIds = preview.futureLessons.map((l) => l.id);
      if (change.applyToFutureLessons && lessonIds.length) {
        if (toAdd.length) {
          await tx
            .insert(lessonParticipant)
            .values(lessonIds.flatMap((lessonId) => toAdd.map((studentId) => ({ lessonId, studentId }))))
            .onConflictDoNothing();
        }
        if (toRemove.length) {
          await tx
            .delete(lessonParticipant)
            .where(and(inArray(lessonParticipant.lessonId, lessonIds), inArray(lessonParticipant.studentId, toRemove)));
        }
      }
      const assignmentIds = preview.openAssignments.map((a) => a.id);
      if (change.applyToOpenAssignments && assignmentIds.length) {
        if (toAdd.length) {
          await tx
            .insert(assignmentRecipient)
            .values(assignmentIds.flatMap((assignmentId) => toAdd.map((studentId) => ({ assignmentId, studentId }))))
            .onConflictDoNothing();
        }
        if (toRemove.length) {
          await tx
            .delete(assignmentRecipient)
            .where(
              and(
                inArray(assignmentRecipient.assignmentId, assignmentIds),
                inArray(assignmentRecipient.studentId, toRemove),
                eq(assignmentRecipient.status, 'assigned'),
              ),
            );
        }
      }
      return {
        added: toAdd.length,
        removed: toRemove.length,
        lessonsUpdated: change.applyToFutureLessons ? lessonIds.length : 0,
        assignmentsUpdated: change.applyToOpenAssignments ? assignmentIds.length : 0,
        group: await this.detail(t, groupId, tx),
      };
    });
  }
}
