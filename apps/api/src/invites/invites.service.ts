import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  ErrorCode,
  normalizeInviteCode,
  type CreateInviteInput,
  type InviteDto,
  type InvitePreviewDto,
} from '@derslik/shared';
import { DB, PgError, pgErrorCode, type Db } from '../db/db';
import { groupMembership, guardianLink, invite, student, studentAccountLink, studentGroup, workspace } from '../db/schema';
import { AccessService, type TeacherCtx } from '../common/access.service';
import { AppError, notFound } from '../common/errors';
import { randomBase32, sha256 } from '../common/crypto';

/** 26 base32 karakter ≈ 130 bit. Okunurluk için 4'lü gruplar: ABCD-EFGH-… */
const CODE_LEN = 26;

function formatCode(raw: string): string {
  return raw.match(/.{1,4}/g)!.join('-');
}

type InviteRow = typeof invite.$inferSelect;

function statusOf(i: InviteRow, now = new Date()): InviteDto['status'] {
  if (i.acceptedAt) return 'accepted';
  if (i.revokedAt) return 'revoked';
  if (i.expiresAt <= now) return 'expired';
  return 'pending';
}

function toDto(i: InviteRow, code?: string): InviteDto {
  return {
    id: i.id,
    studentId: i.studentId,
    kind: i.kind,
    status: statusOf(i),
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
    ...(code ? { code } : {}),
  };
}

const invalid = () => new AppError(ErrorCode.INVITE_INVALID, 'Davet geçersiz, iptal edilmiş veya süresi dolmuş');

@Injectable()
export class InvitesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly access: AccessService,
  ) {}

  /** Yeni davet üretir. Aynı öğrenci ve türdeki bekleyen eski davetler iptal edilir (yenileme). */
  async create(t: TeacherCtx, studentId: string, input: CreateInviteInput): Promise<InviteDto> {
    return this.db.transaction(async (tx) => {
      const s = await this.access.ownActiveStudent(t, studentId, tx);
      if (input.kind === 'student') {
        const [linked] = await tx.select({ id: studentAccountLink.id }).from(studentAccountLink).where(eq(studentAccountLink.studentId, s.id));
        if (linked) throw new AppError(ErrorCode.ALREADY_LINKED, 'Bu öğrenci kaydı zaten bir hesaba bağlı; önce bağlantıyı kaldırın');
      }
      await tx
        .update(invite)
        .set({ revokedAt: new Date() })
        .where(and(eq(invite.studentId, s.id), eq(invite.kind, input.kind), isNull(invite.acceptedAt), isNull(invite.revokedAt)));
      const raw = randomBase32(CODE_LEN);
      const [row] = await tx
        .insert(invite)
        .values({
          workspaceId: t.workspaceId,
          studentId: s.id,
          kind: input.kind,
          codeHash: sha256(raw),
          canRequestChanges: input.kind === 'guardian' ? input.canRequestChanges : false,
          expiresAt: new Date(Date.now() + input.ttlDays * 24 * 3600 * 1000),
        })
        .returning();
      return toDto(row!, formatCode(raw));
    });
  }

  /** Grup üyeleri için toplu öğrenci daveti. Hesabı zaten bağlı olanlar atlanır. Dış mesaj gönderilmez. */
  async createForGroup(t: TeacherCtx, groupId: string, ttlDays: number) {
    const [g] = await this.db
      .select({ id: studentGroup.id })
      .from(studentGroup)
      .where(and(eq(studentGroup.id, groupId), eq(studentGroup.workspaceId, t.workspaceId)));
    if (!g) throw notFound('Grup');
    const members = await this.db
      .select({ id: student.id, name: student.displayName, linked: studentAccountLink.id })
      .from(groupMembership)
      .innerJoin(student, eq(student.id, groupMembership.studentId))
      .leftJoin(studentAccountLink, eq(studentAccountLink.studentId, student.id))
      .where(and(eq(groupMembership.groupId, groupId), isNull(groupMembership.leftAt), eq(student.status, 'active')));
    const result: { studentId: string; displayName: string; invite: InviteDto | null; skipped?: 'already_linked' }[] = [];
    for (const m of members) {
      if (m.linked) {
        result.push({ studentId: m.id, displayName: m.name, invite: null, skipped: 'already_linked' });
        continue;
      }
      result.push({ studentId: m.id, displayName: m.name, invite: await this.create(t, m.id, { kind: 'student', ttlDays, canRequestChanges: false }) });
    }
    return result;
  }

  async list(t: TeacherCtx, studentId: string): Promise<InviteDto[]> {
    await this.access.ownStudent(t, studentId);
    const rows = await this.db.select().from(invite).where(eq(invite.studentId, studentId)).orderBy(desc(invite.createdAt)).limit(50);
    return rows.map((r) => toDto(r));
  }

  async revoke(t: TeacherCtx, inviteId: string): Promise<void> {
    const [row] = await this.db
      .update(invite)
      .set({ revokedAt: new Date() })
      .where(and(eq(invite.id, inviteId), eq(invite.workspaceId, t.workspaceId), isNull(invite.acceptedAt)))
      .returning({ id: invite.id });
    if (!row) throw notFound('Davet');
  }

  private async findByCode(code: string) {
    const normalized = normalizeInviteCode(code);
    if (normalized.length !== CODE_LEN) return undefined;
    const [row] = await this.db.select().from(invite).where(eq(invite.codeHash, sha256(normalized)));
    return row;
  }

  /**
   * Kabul öncesi önizleme: öğretmen adı ve öğrenci adı gösterilir ki yanlış davet fark edilsin.
   * Yalnızca geçerli davet için döner; geçersiz kodda ayrıntı verilmez.
   */
  async preview(code: string): Promise<InvitePreviewDto> {
    const row = await this.findByCode(code);
    if (!row || statusOf(row) !== 'pending') throw invalid();
    const [info] = await this.db
      .select({ teacherName: workspace.displayName, studentName: student.displayName })
      .from(student)
      .innerJoin(workspace, eq(workspace.id, student.workspaceId))
      .where(eq(student.id, row.studentId));
    return {
      kind: row.kind,
      teacherName: info!.teacherName,
      studentDisplayName: info!.studentName,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  /**
   * Daveti kabul eder. Davet satırı kilitlenir; aynı kullanıcının tekrar kabulü idempotenttir
   * (ikinci bağlantı oluşmaz). Başka kullanıcının kullandığı davet reddedilir.
   */
  async accept(userId: string, code: string) {
    const normalized = normalizeInviteCode(code);
    if (normalized.length !== CODE_LEN) throw invalid();
    try {
      return await this.db.transaction(async (tx) => {
        const locked = await tx.execute<{ id: string }>(sql`SELECT id FROM invite WHERE code_hash = ${sha256(normalized)} FOR UPDATE`);
        const id = locked.rows[0]?.id;
        if (!id) throw invalid();
        const [row] = await tx.select().from(invite).where(eq(invite.id, id));
        const inv = row!;
        const result = { studentId: inv.studentId, workspaceId: inv.workspaceId, kind: inv.kind };

        if (inv.acceptedAt) {
          if (inv.acceptedBy === userId) return { ...result, alreadyAccepted: true };
          throw invalid();
        }
        if (statusOf(inv) !== 'pending') throw invalid();

        const [ws] = await tx.select({ owner: workspace.ownerUserId }).from(workspace).where(eq(workspace.id, inv.workspaceId));
        if (ws?.owner === userId) throw new AppError(ErrorCode.FORBIDDEN, 'Kendi davetinizi kabul edemezsiniz');

        if (inv.kind === 'student') {
          const existing = await tx
            .select({ studentId: studentAccountLink.studentId, userId: studentAccountLink.userId })
            .from(studentAccountLink)
            .where(sql`${studentAccountLink.studentId} = ${inv.studentId} OR (${studentAccountLink.userId} = ${userId} AND ${studentAccountLink.workspaceId} = ${inv.workspaceId})`);
          const same = existing.find((e) => e.studentId === inv.studentId && e.userId === userId);
          if (!same) {
            if (existing.some((e) => e.studentId === inv.studentId)) {
              throw new AppError(ErrorCode.ALREADY_LINKED, 'Bu öğrenci kaydı başka bir hesaba bağlı');
            }
            if (existing.some((e) => e.userId === userId)) {
              throw new AppError(ErrorCode.ALREADY_LINKED, 'Hesabınız bu öğretmende zaten başka bir öğrenci kaydına bağlı');
            }
            await tx.insert(studentAccountLink).values({ studentId: inv.studentId, workspaceId: inv.workspaceId, userId });
          }
        } else {
          await tx
            .insert(guardianLink)
            .values({ studentId: inv.studentId, workspaceId: inv.workspaceId, userId, canRequestChanges: inv.canRequestChanges })
            .onConflictDoNothing();
        }
        await tx.update(invite).set({ acceptedAt: new Date(), acceptedBy: userId }).where(eq(invite.id, inv.id));
        return { ...result, alreadyAccepted: false };
      });
    } catch (err) {
      if (pgErrorCode(err) === PgError.UNIQUE_VIOLATION) {
        throw new AppError(ErrorCode.ALREADY_LINKED, 'Bu bağlantı zaten mevcut');
      }
      throw err;
    }
  }

  /** Öğrenci/veli kendi bağlantısını kaldırır (yanlış hesapla kabul düzeltmesi). */
  async leave(userId: string, studentId: string): Promise<void> {
    await this.db.delete(studentAccountLink).where(and(eq(studentAccountLink.userId, userId), eq(studentAccountLink.studentId, studentId)));
    await this.db.delete(guardianLink).where(and(eq(guardianLink.userId, userId), eq(guardianLink.studentId, studentId)));
  }

  /** Test yardımcıları ve yönetim için: süresi geçen davetleri sayar. */
  async pendingCount(studentIds: string[]) {
    if (!studentIds.length) return 0;
    const rows = await this.db.select({ id: invite.id }).from(invite).where(and(inArray(invite.studentId, studentIds), isNull(invite.acceptedAt), isNull(invite.revokedAt)));
    return rows.length;
  }
}
