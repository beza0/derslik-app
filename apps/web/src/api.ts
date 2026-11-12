import { ApiError, createApiClient } from '@derslik/shared';
import { QueryClient } from '@tanstack/react-query';

/** Aynı kökenden çalışır (geliştirmede Vite proxy, yayında aynı alan adı). */
export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  client: 'web',
  onSessionLost: () => window.dispatchEvent(new Event('derslik:session-lost')),
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Beklenmeyen bir hata oluştu';
}

/** Çift tıklama/yeniden denemede aynı işlemin iki kez gönderilmesini engeller. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
