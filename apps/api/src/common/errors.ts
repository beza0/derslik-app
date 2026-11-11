import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Optional,
} from '@nestjs/common';
import { ErrorCode, type ApiErrorBody } from '@derslik/shared';
import type { Request, Response } from 'express';
import { DB, type Db } from '../db/db';
import { appError } from '../db/schema';
import { ZodError } from 'zod';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  EMAIL_TAKEN: 409,
  INVALID_CREDENTIALS: 401,
  EMAIL_NOT_VERIFIED: 403,
  TOKEN_INVALID: 400,
  PLAN_LIMIT_REACHED: 402,
  STUDENT_ARCHIVED: 409,
  INVITE_INVALID: 410,
  INVITE_WRONG_ROLE: 409,
  ALREADY_LINKED: 409,
  LESSON_CONFLICT: 409,
  IDEMPOTENCY_MISMATCH: 422,
  AI_DISABLED: 503,
  AI_QUOTA_EXCEEDED: 402,
  AI_ACTION_STALE: 409,
  FILE_REJECTED: 415,
  PAYMENT_INVALID: 400,
  INTERNAL: 500,
};

/** Uygulama hatası: makine-okunur kod + kullanıcıya gösterilebilir mesaj. Özel veri içermemeli. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
  get status(): number {
    return STATUS[this.code];
  }
}

export const notFound = (what = 'Kayıt') => new AppError(ErrorCode.NOT_FOUND, `${what} bulunamadı`);
export const forbidden = (msg = 'Bu işlem için yetkiniz yok') => new AppError(ErrorCode.FORBIDDEN, msg);

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');
  constructor(@Optional() @Inject(DB) private readonly db?: Db) {}

  /** Yalnızca teknik bilgi: hata adı ve rota şablonu. İstek gövdesi, parametre değerleri veya kullanıcı verisi yazılmaz. */
  private record(host: ArgumentsHost, err: Error | undefined) {
    if (!this.db) return;
    const req = host.switchToHttp().getRequest<Request & { route?: { path?: string } }>();
    const route = `${req.method} ${req.route?.path ?? 'unknown'}`;
    this.db
      .insert(appError)
      .values({ code: err?.name ?? 'Error', route, message: (err?.message ?? '').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[e-posta]').slice(0, 300) })
      .catch(() => {});
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ApiErrorBody;

    if (exception instanceof AppError) {
      status = exception.status;
      body = { error: { code: exception.code, message: exception.message, details: exception.details } };
    } else if (exception instanceof ZodError) {
      status = 400;
      body = {
        error: {
          code: ErrorCode.VALIDATION,
          message: 'Gönderilen bilgiler geçersiz',
          details: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const code =
        status === 401
          ? ErrorCode.UNAUTHENTICATED
          : status === 403
            ? ErrorCode.FORBIDDEN
            : status === 404
              ? ErrorCode.NOT_FOUND
              : status === 429
                ? ErrorCode.RATE_LIMITED
                : ErrorCode.VALIDATION;
      const msg = status === 429 ? 'Çok fazla istek; lütfen biraz bekleyin' : status === 404 ? 'Bulunamadı' : exception.message;
      body = { error: { code, message: msg } };
    } else {
      // Ayrıntı yalnızca sunucu günlüğüne; istemciye genel mesaj. Günlüğe istek gövdesi yazılmaz.
      const err = exception as Error;
      this.logger.error(`${err?.name ?? 'Error'}: ${err?.message ?? String(exception)}`, err?.stack);
      if (process.env.DEBUG_ERRORS) console.error(exception);
      this.record(host, err);
      body = { error: { code: ErrorCode.INTERNAL, message: 'Beklenmeyen bir hata oluştu' } };
    }
    res.status(status).json(body);
  }
}
