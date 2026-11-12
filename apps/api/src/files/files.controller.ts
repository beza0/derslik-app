import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Req, Res } from '@nestjs/common';
import { FILE_LIMITS, ErrorCode } from '@derslik/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentUser, Public, type AuthUser } from '../common/auth';
import { AppError } from '../common/errors';
import { Zod } from '../common/zod';
import { FilesService } from './files.service';
import { LocalStorage, STORAGE, type StorageDriver } from './storage';

const Uuid = new ParseUUIDPipe({ version: '4' });
const UploadInput = z.object({
  name: z.string().trim().min(1).max(200),
  mime: z.string().max(100),
  size: z.number().int().positive(),
  purpose: z.enum(['assignment', 'answer_key', 'submission', 'material', 'ai_input']),
  /** Öğrenci teslimi için: hangi öğrenci kaydı adına. */
  studentId: z.uuid().optional(),
});

@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    @Inject(STORAGE) private readonly storage: StorageDriver,
  ) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new Zod(UploadInput)) body: z.infer<typeof UploadInput>) {
    const { studentId, ...input } = body;
    return this.files.createUpload(u.id, input, studentId);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.files.complete(u.id, id);
  }

  @Get(':id/url')
  url(@CurrentUser() u: AuthUser, @Param('id', Uuid) id: string) {
    return this.files.downloadUrl(u.id, id);
  }

  /** Yalnızca yerel geliştirme sürücüsü: imzalı yükleme. */
  @Public()
  @Put('local/:token')
  @HttpCode(204)
  async localUpload(@Param('token') token: string, @Req() req: Request) {
    if (!(this.storage instanceof LocalStorage)) throw new AppError(ErrorCode.NOT_FOUND, 'Bulunamadı');
    const v = this.storage.verify(token, 'up');
    if (!v) throw new AppError(ErrorCode.FORBIDDEN, 'Bağlantı geçersiz veya süresi dolmuş');
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const c of req as AsyncIterable<Buffer>) {
      total += c.length;
      if (total > FILE_LIMITS.maxBytes) throw new AppError(ErrorCode.FILE_REJECTED, 'Dosya çok büyük');
      chunks.push(c);
    }
    await this.storage.put(v.key, Buffer.concat(chunks));
  }

  /** Yerel/veritabanı sürücüsü: imzalı indirme. */
  @Public()
  @Get('local/:token')
  async localDownload(@Param('token') token: string, @Res() res: Response) {
    if (!(this.storage instanceof LocalStorage)) throw new AppError(ErrorCode.NOT_FOUND, 'Bulunamadı');
    const v = this.storage.verify(token, 'down');
    if (!v) throw new AppError(ErrorCode.FORBIDDEN, 'Bağlantı geçersiz veya süresi dolmuş');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${v.extra}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(await this.storage.read(v.key));
  }
}
