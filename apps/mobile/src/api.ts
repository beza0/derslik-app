import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { ApiError, createApiClient } from '@derslik/shared';
import { QueryClient } from '@tanstack/react-query';

const KEY = 'derslik.refresh';

/** Yayın adresi app.json > extra.apiUrl; geliştirmede EXPO_PUBLIC_API_URL ile değiştirilebilir. */
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string);

let onLost: () => void = () => {};
export const setSessionLostHandler = (fn: () => void) => {
  onLost = fn;
};

/** Refresh token yalnızca cihazın güvenli deposunda (Keychain / Keystore) tutulur. */
export const api = createApiClient({
  baseUrl: API_URL,
  client: 'mobile',
  loadRefreshToken: () => SecureStore.getItemAsync(KEY),
  saveRefreshToken: async (t) => {
    if (t) await SecureStore.setItemAsync(KEY, t);
    else await SecureStore.deleteItemAsync(KEY);
  },
  onSessionLost: () => onLost(),
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2 },
    mutations: { retry: false },
  },
});

export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : 'Beklenmeyen bir hata oluştu');
