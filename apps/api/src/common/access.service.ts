import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Db, type Tx } from '../db/db';
import { appUser, guardianLink, student, studentAccountLink, workspace } from '../db/schema';
import { AppError, forbidden, notFound } from './errors';
import { ErrorCode } from '@derslik/shared';

export interface TeacherCtx {
  userId: string;
  workspaceId: string;
  timezone: string;
}

export type ViewerRole = 'teacher' | 'student' | 'guardian';

export interface StudentViewer {
  role: 'student' | 'guardian';
  userId: string;
  studentId: string;
  workspaceId: string;
  canRequestChanges: boolean;
}

/**
 * Tüm veri sahipliği kararlarının tek yeri. Kimlik her zaman oturumdan gelir;
 * istemcinin gönderdiği workspace/öğretmen kimliği hiçbir zaman kullanılmaz.
 */
@Injectable()
export class AccessService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Kullanıcının öğretmen çalışma alanı; yoksa 403. */
  async teacher(userId: string, tx: Tx = this.db): Promise<TeacherCtx> {
    const [row] = await tx
      .select({ id: workspace.id, timezone: workspace.timezone, status: appUser.status })
      .from(workspace)
      .innerJoin(appUser, eq(appUser.id, workspace.ownerUserId))
      .where(eq(workspace.ownerUserId, userId))
      .limit(1);
    if (!row) throw forbidden('Bu işlem yalnızca öğretmen hesabıyla yapılabilir');
    if (row.status !== 'active') throw forbidden('Hesap askıya alınmış');
    return { userId, workspaceId: row.id, timezone: row.timezone };
  }

  /** Öğretmenin kendi çalışma alanındaki öğrenci kaydı; başka alandaysa 404 (varlığı sızdırılmaz). */
  async ownStudent(t: TeacherCtx, studentId: string, tx: Tx = this.db) {
    const [row] = await tx
      .select()
      .from(student)
      .where(and(eq(student.id, studentId), eq(student.workspaceId, t.workspaceId)))
      .limit(1);
    if (!row) throw notFound('Öğrenci');
    return row;
  }

  /** Yeni ders/ödev/not için öğrencinin aktif olması gerekir. */
  async ownActiveStudent(t: TeacherCtx, studentId: string, tx: Tx = this.db) {
    const row = await this.ownStudent(t, studentId, tx);
    if (row.status !== 'active') {
      throw new AppError(ErrorCode.STUDENT_ARCHIVED, 'Arşivdeki öğrenci için yeni kayıt oluşturulamaz; önce arşivden çıkarın');
    }
    return row;
  }

  /** Öğrenci veya veli olarak, verilen öğrenci kaydını görme yetkisi. */
  async viewerFor(userId: string, studentId: string, tx: Tx = this.db): Promise<StudentViewer> {
    const [own] = await tx
      .select({ workspaceId: studentAccountLink.workspaceId })
      .from(studentAccountLink)
      .where(and(eq(studentAccountLink.userId, userId), eq(studentAccountLink.studentId, studentId)))
      .limit(1);
    if (own) return { role: 'student', userId, studentId, workspaceId: own.workspaceId, canRequestChanges: true };
    const [g] = await tx
      .select({ workspaceId: guardianLink.workspaceId, can: guardianLink.canRequestChanges })
      .from(guardianLink)
      .where(and(eq(guardianLink.userId, userId), eq(guardianLink.studentId, studentId)))
      .limit(1);
    if (g) return { role: 'guardian', userId, studentId, workspaceId: g.workspaceId, canRequestChanges: g.can };
    throw notFound('Kayıt');
  }

  /** Kullanıcının öğrenci ve veli olarak bağlı olduğu tüm öğrenci kayıtları. */
  async viewerStudents(userId: string, tx: Tx = this.db): Promise<StudentViewer[]> {
    const own = await tx
      .select({ studentId: studentAccountLink.studentId, workspaceId: studentAccountLink.workspaceId })
      .from(studentAccountLink)
      .where(eq(studentAccountLink.userId, userId));
    const g = await tx
      .select({ studentId: guardianLink.studentId, workspaceId: guardianLink.workspaceId, can: guardianLink.canRequestChanges })
      .from(guardianLink)
      .where(eq(guardianLink.userId, userId));
    return [
      ...own.map((o) => ({ role: 'student' as const, userId, studentId: o.studentId, workspaceId: o.workspaceId, canRequestChanges: true })),
      ...g.map((o) => ({ role: 'guardian' as const, userId, studentId: o.studentId, workspaceId: o.workspaceId, canRequestChanges: o.can })),
    ];
  }
}
