import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { MeResponse } from '@derslik/shared';
import { api, queryClient } from './api';

export type Mode = 'teacher' | 'portal' | 'admin';

interface AuthState {
  me: MeResponse | null;
  loading: boolean;
  mode: Mode | null;
  setMode: (m: Mode) => void;
  reload: () => Promise<MeResponse | null>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as never);

function defaultMode(me: MeResponse): Mode | null {
  if (me.contexts.teacher) return 'teacher';
  if (me.contexts.studentLinks.length || me.contexts.guardianLinks.length) return 'portal';
  if (me.contexts.admin) return 'admin';
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setModeState] = useState<Mode | null>(null);

  const reload = useCallback(async () => {
    try {
      const m = await api.get<MeResponse>('/me');
      setMe(m);
      const saved = localStorage.getItem('derslik.mode') as Mode | null;
      const allowed = (x: Mode | null) =>
        x === 'teacher' ? !!m.contexts.teacher : x === 'admin' ? m.contexts.admin : x === 'portal' ? m.contexts.studentLinks.length + m.contexts.guardianLinks.length > 0 : false;
      setModeState(allowed(saved) ? saved : defaultMode(m));
      return m;
    } catch {
      setMe(null);
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (await api.restore()) await reload();
      setLoading(false);
    })();
    const lost = () => {
      setMe(null);
      queryClient.clear();
    };
    window.addEventListener('derslik:session-lost', lost);
    return () => window.removeEventListener('derslik:session-lost', lost);
  }, [reload]);

  const setMode = (m: Mode) => {
    try {
      localStorage.setItem('derslik.mode', m);
    } catch {
      /* depolama kapalı olabilir */
    }
    setModeState(m);
    queryClient.clear();
  };

  const logout = async () => {
    await api.logout();
    queryClient.clear();
    setMe(null);
  };

  return <Ctx.Provider value={{ me, loading, mode, setMode, reload, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
