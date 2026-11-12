import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { MeResponse } from '@derslik/shared';
import { api, queryClient, setSessionLostHandler } from './api';

export type Mode = 'teacher' | 'portal';

interface AuthState {
  me: MeResponse | null;
  loading: boolean;
  mode: Mode | null;
  setMode: (m: Mode) => void;
  reload: () => Promise<MeResponse | null>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as never);

/** Yönetim paneli yalnızca web'dedir; mobil öğretmen ve öğrenci/veli bağlamlarını açar. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const m = await api.get<MeResponse>('/me');
      setMe(m);
      setMode((cur) => {
        const portal = m.contexts.studentLinks.length + m.contexts.guardianLinks.length > 0;
        if (cur === 'teacher' && m.contexts.teacher) return cur;
        if (cur === 'portal' && portal) return cur;
        return m.contexts.teacher ? 'teacher' : portal ? 'portal' : null;
      });
      return m;
    } catch {
      setMe(null);
      return null;
    }
  }, []);

  useEffect(() => {
    setSessionLostHandler(() => {
      setMe(null);
      queryClient.clear();
    });
    (async () => {
      if (await api.restore()) await reload();
      setLoading(false);
    })();
  }, [reload]);

  const logout = async () => {
    await api.logout();
    queryClient.clear();
    setMe(null);
  };

  return (
    <Ctx.Provider value={{ me, loading, mode, setMode: (m) => { queryClient.clear(); setMode(m); }, reload, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
