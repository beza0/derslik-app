import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Inbox, WifiOff } from 'lucide-react';
import { colorFor, initials } from './format';
import { errorMessage } from './api';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Spinner({ label = 'Yükleniyor' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite">
      <div className="spinner" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  return (
    <div className="alert danger row between" role="alert">
      <span className="row">
        {offline && <WifiOff size={16} aria-hidden />}
        {offline ? 'Bağlantı yok. İnternet bağlantınızı kontrol edin.' : errorMessage(error)}
      </span>
      {onRetry && (
        <button className="btn sm" onClick={onRetry}>
          Tekrar dene
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox size={36} aria-hidden />}
      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      {children && <div className="small" style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

/** Sorgu durumlarını (yükleniyor/hata/boş) tek yerde ele alır. */
export function Q<T>({ q, empty, children }: { q: { isLoading: boolean; error: unknown; data: T | undefined; refetch: () => unknown }; empty?: (d: T) => boolean | ReactNode; children: (d: T) => ReactNode }) {
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  if (q.data === undefined) return null;
  if (empty) {
    const e = empty(q.data);
    if (e) return <>{e === true ? <Empty title="Henüz kayıt yok" /> : e}</>;
  }
  return <>{children(q.data)}</>;
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Avatar({ id, name, size = 36 }: { id: string; name: string; size?: number }) {
  return (
    <span className="avatar" aria-hidden style={{ background: colorFor(id), width: size, height: size, fontSize: size / 2.6 }}>
      {initials(name)}
    </span>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  const push = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className="toast">
            {i.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Durumları yalnızca renkle değil metinle de gösterir. */
export function StatusBadge({ tone, children }: { tone?: 'ok' | 'warn' | 'danger' | 'info'; children: ReactNode }) {
  return <span className={`badge ${tone ?? ''}`}>{children}</span>;
}
