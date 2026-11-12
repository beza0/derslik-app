import type { ApiErrorBody, ErrorCode } from './errors';
import type { AuthTokens } from './schemas/auth';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'NETWORK',
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface ApiClientOptions {
  /** Örn. "https://derslik.vercel.app" veya "" (aynı köken). Sonuna /api eklenir. */
  baseUrl: string;
  client: 'web' | 'mobile';
  /** Mobil: refresh token güvenli depodan okunur/yazılır. Web: HttpOnly çerez kullanılır, gerekmez. */
  loadRefreshToken?: () => Promise<string | null>;
  saveRefreshToken?: (token: string | null) => Promise<void>;
  /** Oturum tamamen düştüğünde (yenilenemedi) çağrılır. */
  onSessionLost?: () => void;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Web ve mobilin ortak API istemcisi. Erişim token'ı yalnızca bellekte tutulur; 401'de bir kez
 * yenileme denenir. Eşzamanlı istekler tek bir yenileme işlemini paylaşır.
 */
export function createApiClient(opts: ApiClientOptions) {
  let accessToken: string | null = null;
  let refreshing: Promise<boolean> | null = null;
  const base = `${opts.baseUrl.replace(/\/$/, '')}/api`;

  async function raw(method: Method, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { Accept: 'application/json', ...headers };
    if (opts.client === 'mobile') h['X-Client'] = 'mobile';
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    try {
      return await fetch(`${base}${path}`, {
        method,
        headers: h,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: opts.client === 'web' ? 'include' : 'omit',
      });
    } catch {
      throw new ApiError(0, 'NETWORK', 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.');
    }
  }

  async function parse<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const data = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const e = (data as ApiErrorBody | undefined)?.error;
      throw new ApiError(res.status, e?.code ?? ('INTERNAL' as ErrorCode), e?.message ?? 'Beklenmeyen bir hata oluştu', e?.details);
    }
    return data as T;
  }

  async function applyTokens(t: AuthTokens) {
    accessToken = t.accessToken;
    if (opts.client === 'mobile' && t.refreshToken) await opts.saveRefreshToken?.(t.refreshToken);
  }

  async function doRefresh(): Promise<boolean> {
    try {
      const refreshToken = opts.client === 'mobile' ? await opts.loadRefreshToken?.() : undefined;
      if (opts.client === 'mobile' && !refreshToken) return false;
      const res = await raw('POST', '/auth/refresh', refreshToken ? { refreshToken } : {});
      if (!res.ok) {
        accessToken = null;
        if (res.status === 401 && opts.client === 'mobile') await opts.saveRefreshToken?.(null);
        return false;
      }
      await applyTokens((await res.json()) as AuthTokens);
      return true;
    } catch {
      return false;
    }
  }

  function refresh(): Promise<boolean> {
    refreshing ??= doRefresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function request<T>(method: Method, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    let res = await raw(method, path, body, headers);
    if (res.status === 401 && !path.startsWith('/auth/')) {
      if (await refresh()) res = await raw(method, path, body, headers);
      else opts.onSessionLost?.();
    }
    return parse<T>(res);
  }

  return {
    request,
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body: unknown = {}, headers?: Record<string, string>) => request<T>('POST', path, body, headers),
    patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
    put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
    del: <T = void>(path: string) => request<T>('DELETE', path),
    /** Uygulama açılışında: kayıtlı oturum varsa erişim token'ı alır. */
    restore: () => refresh(),
    hasSession: () => accessToken !== null,
    async login(email: string, password: string) {
      await applyTokens(await parse<AuthTokens>(await raw('POST', '/auth/login', { email, password })));
    },
    async register(input: { email: string; password: string; name: string; role: 'teacher' | 'member'; timezone?: string }) {
      await applyTokens(await parse<AuthTokens>(await raw('POST', '/auth/register', input)));
    },
    async logout() {
      const refreshToken = opts.client === 'mobile' ? await opts.loadRefreshToken?.() : undefined;
      await raw('POST', '/auth/logout', refreshToken ? { refreshToken } : {}).catch(() => undefined);
      accessToken = null;
      if (opts.client === 'mobile') await opts.saveRefreshToken?.(null);
    },
    /** Dosyayı imzalı URL'ye yükler ve sunucuda doğrulatır. */
    async uploadFile(file: { name: string; type: string; size: number; body: Blob | ArrayBuffer }, purpose: string, studentId?: string) {
      const created = await request<{ fileId: string; upload: { url: string; method: string; headers: Record<string, string> } }>('POST', '/files', {
        name: file.name,
        mime: file.type,
        size: file.size,
        purpose,
        studentId,
      });
      const put = await fetch(created.upload.url, { method: created.upload.method, headers: created.upload.headers, body: file.body });
      if (!put.ok) throw new ApiError(put.status, 'FILE_REJECTED' as ErrorCode, 'Dosya yüklenemedi');
      return request<{ id: string; name: string; mime: string; size: number }>('POST', `/files/${created.fileId}/complete`, {});
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
