import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import {
  ErrorCode,
  type BulkStudentInput,
  type StudentDto,
  type StudentInput,
  type StudentStatus,
  type StudentUpdate,
} from '@derslik/shared';
import { DB, type Db, type Tx } from '../db/db';
import {
  appUser,
  auditLog,
  groupMembership,
  guardianLink,
  lesson,
  student,
  studentAccountLink,
  studentGroup,
} from '../db/schema';
import { AccessService, type TeacherCtx } from '../common/access.service';
import { AppError, notFound } from '../common/errors';
import { EntitlementsService } from '../billing/entitlements.service';

type StudentRow = typeof student.$inferSelect;

@Injectable()
export class StudentsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly access: AccessService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private async toDtos(rows: StudentRow[], tx: Tx = this.db): Promise<StudentDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const accounts = await tx
      .select({ studentId: studentAccountLink.studentId })
      .from(studentAccountLink)
      .where(inArray(studentAccountLink.studentId, ids));
    const guardians = await tx
      .select({ studentId: guardianLink.studentId, n: sql<number>`count(*)::int` })
      .from(guardianLink)
      .where(inArray(guardianLink.studentId, ids))
      .groupBy(guardianLink.studentId);
    const hasAccount = new Set(accounts.map((a) => a.studentId));
    const gCount = new Map(guardians.map((g) => [g.studentId, g.n]));
    return rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      level: r.level,
      goal: r.goal,
      subject: r.subject,
      contactNote: r.contactNote,
      color: r.color,
      status: r.status,
      hasAccount: hasAccount.has(r.id),
      guardianCount: gCount.get(r.id) ?? 0,
      createdAt: r.createdAt.toISOString(),
      archivedAt: r.archivedAt?.toISOString() ?? null,
    }));
  }

  async list(t: TeacherCtx, status: StudentStatus, q?: string): Promise<StudentDto[]> {
    const rows = await this.db
      .select()
      .from(student)
      .where(
        and(
          eq(student.workspaceId, t.workspaceId),
          eq(student.status, status),
          q ? ilike(student.displayName, `%${q.replace(/[%_\\]/g, '\\$&')}%`) : undefined,
        ),
      )
      .orderBy(asc(student.displayName))
      .limit(500);
    return this.toDtos(rows);
  }

  async get(t: TeacherCtx, id: string): Promise<StudentDto> {
    const row = await this.access.ownStudent(t, id);
    return (await this.toDtos([row]))[0]!;
  }

  /** Tek giriş noktası: elle ekleme, toplu ekleme ve AI ekleme aynı limit kontrolünden geçer. */
  async createMany(t: TeacherCtx, inputs: StudentInput[], groupId?: string, existingTx?: Tx): Promise<StudentDto[]> {
    const run = async (tx: Tx) => {
      if (groupId) {
        const [g] = await tx
          .select({ id: studentGroup.id })
          .from(studentGroup)
          .where(and(eq(studentGroup.id, groupId), eq(studentGroup.workspaceId, t.workspaceId)));
        if (!g) throw notFound('Grup');
      }
      await this.entitlements.assertCanActivate(tx, t.workspaceId, inputs.length);
      const rows = await tx
        .insert(student)
        .values(inputs.map((i) => ({ ...i, workspaceId: t.workspaceId })))
        .returning();
      if (groupId) {
        await tx.insert(groupMembership).values(rows.map((r) => ({ groupId, studentId: r.id })));
      }
      return this.toDtos(rows, tx);
    };
    return existingTx ? run(existingTx) : this.db.transaction(run);
  }

  async create(t: TeacherCtx, input: StudentInput): Promise<StudentDto> {
    return (await this.createMany(t, [input]))[0]!;
  }

  async bulk(t: TeacherCtx, input: BulkStudentInput): Promise<StudentDto[]> {
    return this.createMany(t, input.students, input.groupId);
  }

  async update(t: TeacherCtx, id: string, patch: StudentUpdate): Promise<StudentDto> {
    await this.access.ownStudent(t, id);
    const [row] = await this.db
      .update(student)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(student.id, id), eq(student.workspaceId, t.workspaceId)))
      .returning();
    return (await this.toDtos([row!]))[0]!;
  }

  /** Arşivleme: geçmiş korunur; gelecekteki planlı 1:1 dersler iptal edilmez, öğretmen ayrıca karar verir. */
  async archive(t: TeacherCtx, id: string): Promise<StudentDto> {
    const s = await this.access.ownStudent(t, id);
    if (s.status === 'archived') return (await this.toDtos([s]))[0]!;
    const [row] = await this.db
      .update(student)
      .set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(student.id, id), eq(student.workspaceId, t.workspaceId)))
      .returning();
    return (await this.toDtos([row!]))[0]!;
  }

  async unarchive(t: TeacherCtx, id: string): Promise<StudentDto> {
    return this.db.transaction(async (tx) => {
      const s = await this.access.ownStudent(t, id, tx);
      if (s.status === 'active') return (await this.toDtos([s], tx))[0]!;
      await this.entitlements.assertCanActivate(tx, t.workspaceId, 1);
      const [row] = await tx
        .update(student)
        .set({ status: 'active', archivedAt: null, updatedAt: new Date() })
        .where(eq(student.id, id))
        .returning();
      return (await this.toDtos([row!], tx))[0]!;
    });
  }

  /**
   * Kalıcı silme (geri alınamaz). Öğrenci adının aynen yazılması istenir.
   * Cascade: not, değerlendirme, ödev alıcı/teslim, katılımcı, bağlantı, davet, 1:1 dersler.
   * Grup dersleri korunur (yalnızca katılımcı kaydı silinir).
   */
  async remove(t: TeacherCtx, id: string, confirmName: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const s = await this.access.ownStudent(t, id, tx);
      if (s.displayName.trim() !== confirmName.trim()) {
        throw new AppError(ErrorCode.VALIDATION, 'Onay için öğrencinin adını aynen yazın');
      }
      await tx.delete(lesson).where(and(eq(lesson.studentId, id), eq(lesson.workspaceId, t.workspaceId)));
      await tx.delete(student).where(eq(student.id, id));
      await tx.insert(auditLog).values({
        actorUserId: t.userId,
        workspaceId: t.workspaceId,
        action: 'student.delete',
        target: id,
      });
    });
  }

  async unlinkAccount(t: TeacherCtx, studentId: string): Promise<void> {
    await this.access.ownStudent(t, studentId);
    await this.db.delete(studentAccountLink).where(and(eq(studentAccountLink.studentId, studentId), eq(studentAccountLink.workspaceId, t.workspaceId)));
  }

  async listGuardians(t: TeacherCtx, studentId: string) {
    await this.access.ownStudent(t, studentId);
    return this.db
      .select({ id: guardianLink.id, name: appUser.name, canRequestChanges: guardianLink.canRequestChanges, createdAt: guardianLink.createdAt })
      .from(guardianLink)
      .innerJoin(appUser, eq(appUser.id, guardianLink.userId))
      .where(eq(guardianLink.studentId, studentId));
  }

  async updateGuardian(t: TeacherCtx, studentId: string, linkId: string, canRequestChanges: boolean) {
    await this.access.ownStudent(t, studentId);
    const [row] = await this.db
      .update(guardianLink)
      .set({ canRequestChanges })
      .where(and(eq(guardianLink.id, linkId), eq(guardianLink.studentId, studentId), eq(guardianLink.workspaceId, t.workspaceId)))
      .returning({ id: guardianLink.id });
    if (!row) throw notFound('Veli bağlantısı');
  }

  async removeGuardian(t: TeacherCtx, studentId: string, linkId: string) {
    await this.access.ownStudent(t, studentId);
    await this.db
      .delete(guardianLink)
      .where(and(eq(guardianLink.id, linkId), eq(guardianLink.studentId, studentId), eq(guardianLink.workspaceId, t.workspaceId)));
  }

  /** Öğrencinin aktif grup üyelikleri (profil için). */
  async groupsOf(t: TeacherCtx, studentId: string) {
    await this.access.ownStudent(t, studentId);
    return this.db
      .select({ id: studentGroup.id, name: studentGroup.name })
      .from(groupMembership)
      .innerJoin(studentGroup, eq(studentGroup.id, groupMembership.groupId))
      .where(and(eq(groupMembership.studentId, studentId), isNull(groupMembership.leftAt)));
  }
}
