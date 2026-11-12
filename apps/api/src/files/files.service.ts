import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { ErrorCode, FILE_LIMITS } from '@derslik/shared';
import { DB, type Db, type Tx } from '../db/db';
import { fileObject, type FilePurpose } from '../db/schema';
import { AccessService } from '../common/access.service';
import { AppError, forbidden, notFound } from '../common/errors';
import { randomToken } from '../common/crypto';
import { STORAGE, sniffMime, type StorageDriver } from './storage';
import { CONFIG, type AppConfig } from '../config';

const DOWNLOAD_TTL = 5 * 60;

export interface CreateUploadInput {
  name: string;
  mime: string;
  size: number;
  purpose: FilePurpose;
}

/**
 * Dosya yaşam döngüsü: kayıt (pending) → istemci doğrudan yükler → `complete` ile sunucu boyut ve içerik
 * imzasını doğrular → ready. Yalnızca "ready" dosyalar ödev/teslim/materyale bağlanabilir.
 * İndirme yetkisi her istekte `canView` ile hesaplanır.
 */
@Injectable()
export class FilesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(STORAGE) private readonly storage: StorageDriver,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly access: AccessService,
  ) {}

  private validate(input: CreateUploadInput) {
    if (!(FILE_LIMITS.allowedMime as readonly string[]).includes(input.mime)) {
      throw new AppError(ErrorCode.FILE_REJECTED, 'Yalnızca fotoğraf (JPG, PNG, WEBP, HEIC) ve PDF yüklenebilir');
    }
    const max = Math.min(FILE_LIMITS.maxBytes, this.config.UPLOAD_MAX_BYTES);
    if (input.size <= 0 || input.size > max) {
      throw new AppError(ErrorCode.FILE_REJECTED, `Dosya en fazla ${Math.floor((max / 1024 / 1024) * 10) / 10} MB olabilir`);
    }
  }

  /** Öğretmen kendi çalışma alanına; öğrenci yalnızca bağlı olduğu kayıt için teslim dosyası yükler. */
  async createUpload(userId: string, input: CreateUploadInput, studentId?: string) {
    this.validate(input);
    let workspaceId: string;
    if (studentId) {
      const v = await this.access.viewerFor(userId, studentId);
      if (v.role !== 'student' || input.purpose !== 'submission') throw forbidden();
      workspaceId = v.workspaceId;
    } else {
      const t = await this.access.teacher(userId);
      if (input.purpose === 'submission') throw forbidden();
      workspaceId = t.workspaceId;
    }
    const ext = input.mime === 'application/pdf' ? 'pdf' : input.mime.split('/')[1];
    const key = `${workspaceId}/${input.purpose}/${randomToken(18)}.${ext}`;
    const [row] = await this.db
      .insert(fileObject)
      .values({
        workspaceId,
        uploadedBy: userId,
        storageKey: key,
        originalName: input.name.slice(0, 200),
        mime: input.mime,
        sizeBytes: input.size,
        purpose: input.purpose,
      })
      .returning();
    const upload = await this.storage.createUploadUrl(key, input.mime);
    return { fileId: row!.id, upload };
  }

  async complete(userId: string, fileId: string) {
    const [f] = await this.db.select().from(fileObject).where(and(eq(fileObject.id, fileId), eq(fileObject.uploadedBy, userId)));
    if (!f) throw notFound('Dosya');
    if (f.status === 'ready') return this.dto(f);
    const probe = await this.storage.probe(f.storageKey, 16);
    if (!probe) throw new AppError(ErrorCode.FILE_REJECTED, 'Dosya yüklenmemiş');
    const sniffed = sniffMime(probe.head);
    const ok = probe.size === f.sizeBytes && probe.size <= FILE_LIMITS.maxBytes && sniffed === f.mime;
    if (!ok) {
      await this.storage.remove(f.storageKey);
      await this.db.update(fileObject).set({ status: 'rejected' }).where(eq(fileObject.id, f.id));
      throw new AppError(ErrorCode.FILE_REJECTED, 'Dosya içeriği bildirilen türle veya boyutla uyuşmuyor');
    }
    const [row] = await this.db.update(fileObject).set({ status: 'ready', readyAt: new Date() }).where(eq(fileObject.id, f.id)).returning();
    return this.dto(row!);
  }

  dto(f: typeof fileObject.$inferSelect) {
    return { id: f.id, name: f.originalName, mime: f.mime, size: f.sizeBytes, purpose: f.purpose, status: f.status, createdAt: f.createdAt.toISOString() };
  }

  /** Ödev/teslime eklenecek dosyalar: hazır, aynı çalışma alanında, beklenen amaçta ve (öğrenci için) kendi yüklediği. */
  async assertAttachable(tx: Tx, ids: string[], workspaceId: string, purposes: FilePurpose[], uploadedBy?: string) {
    if (ids.length === 0) return;
    const rows = await tx
      .select({ id: fileObject.id, status: fileObject.status, purpose: fileObject.purpose, by: fileObject.uploadedBy })
      .from(fileObject)
      .where(and(inArray(fileObject.id, ids), eq(fileObject.workspaceId, workspaceId)));
    const okRows = rows.filter((r) => r.status === 'ready' && purposes.includes(r.purpose) && (!uploadedBy || r.by === uploadedBy));
    if (okRows.length !== new Set(ids).size) throw new AppError(ErrorCode.FILE_REJECTED, 'Eklenen dosyalardan biri kullanılamıyor');
  }

  /**
   * Görme yetkisi. Öğretmen: kendi çalışma alanındaki her dosya. Öğrenci/veli: yayımlanmış ödevin eki
   * (alıcıysa); cevap anahtarı yalnızca görünürlük kuralı izin veriyorsa; teslim dosyası yalnızca öğrencinin kendisi.
   */
  async canView(userId: string, fileId: string): Promise<typeof fileObject.$inferSelect> {
    const [f] = await this.db.select().from(fileObject).where(eq(fileObject.id, fileId));
    if (!f || f.status !== 'ready') throw notFound('Dosya');
    const [ws] = await this.db.execute<{ owner: string }>(sql`SELECT owner_user_id AS owner FROM workspace WHERE id = ${f.workspaceId}`).then((r) => r.rows);
    if (ws?.owner === userId) return f;

    const viewers = (await this.access.viewerStudents(userId)).filter((v) => v.workspaceId === f.workspaceId);
    if (viewers.length === 0) throw notFound('Dosya');
    const studentIds = viewers.filter((v) => v.role === 'student').map((v) => v.studentId);
    const anyIds = viewers.map((v) => v.studentId);

    if (f.purpose === 'assignment' || f.purpose === 'answer_key') {
      const rows = await this.db.execute<{ status: string; ak: string; at: Date | null; isKey: boolean }>(sql`
        SELECT ar.status, a.answer_key_visibility AS ak, a.answer_key_visible_at AS at, af.is_answer_key AS "isKey"
        FROM assignment_file af
        JOIN assignment a ON a.id = af.assignment_id AND a.status = 'published'
        JOIN assignment_recipient ar ON ar.assignment_id = a.id
        WHERE af.file_id = ${f.id} AND ar.student_id = ANY(${sql.param(anyIds)}::uuid[])`);
      const allowed = rows.rows.some((r) => !r.isKey || answerKeyVisible(r.ak, r.at, r.status));
      if (allowed) return f;
    }
    if (f.purpose === 'submission' && studentIds.length) {
      const rows = await this.db.execute(sql`
        SELECT 1 FROM submission_file sf
        JOIN submission s ON s.id = sf.submission_id
        JOIN assignment_recipient ar ON ar.id = s.recipient_id
        WHERE sf.file_id = ${f.id} AND ar.student_id = ANY(${sql.param(studentIds)}::uuid[]) LIMIT 1`);
      if (rows.rows.length) return f;
    }
    throw notFound('Dosya');
  }

  async downloadUrl(userId: string, fileId: string) {
    const f = await this.canView(userId, fileId);
    return { url: await this.storage.signedDownloadUrl(f.storageKey, DOWNLOAD_TTL, f.originalName), expiresIn: DOWNLOAD_TTL, mime: f.mime, name: f.originalName };
  }
}

export function answerKeyVisible(visibility: string, visibleAt: Date | null, recipientStatus: string, now = new Date()): boolean {
  if (visibility === 'after_review') return recipientStatus === 'reviewed';
  if (visibility === 'at_date') return Boolean(visibleAt && new Date(visibleAt) <= now);
  return false;
}
