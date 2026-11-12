import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { BRAND } from '@derslik/shared';
import { api, errorMessage } from '../../api';
import { useAuth } from '../../auth';
import { tz } from '../../format';
import { Field } from '../../ui';

export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card stack">
        <div className="brand" style={{ justifyContent: 'center' }}>
          <img src="/icon.svg" alt="" />
          {BRAND.name}
        </div>
        <div className="card stack">
          <h1>{title}</h1>
          {children}
        </div>
        {footer && <div className="small muted" style={{ textAlign: 'center' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Login() {
  const { reload } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.login(email, password);
      await reload();
      nav('/');
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthCard
      title="Giriş yap"
      footer={
        <>
          Öğretmen misiniz? <Link to="/register">Ücretsiz hesap açın</Link> · Davet kodunuz mu var? <Link to="/invite">Daveti kabul edin</Link>
        </>
      }
    >
      <form className="stack" onSubmit={submit}>
        <Field label="E-posta" htmlFor="email">
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Parola" htmlFor="password">
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {err && <div className="alert danger" role="alert">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>
        <Link to="/forgot-password" className="small">Parolamı unuttum</Link>
      </form>
    </AuthCard>
  );
}

/** Kısa başlangıç akışı: hesap → (isteğe bağlı) ilk öğrenci. Uzun anket yok. */
export function Register() {
  const { reload } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ name: '', email: '', password: '', timezone: tz() });
  const [student, setStudent] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.register({ ...form, role: 'teacher' });
      setStep(2);
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  };
  const finish = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    try {
      if (student.trim()) await api.post('/students', { displayName: student.trim() });
      await reload();
      nav('/');
    } catch (x) {
      setErr(errorMessage(x));
      setBusy(false);
    }
  };

  if (step === 2)
    return (
      <AuthCard title="İlk öğrencinizi ekleyin">
        <form className="stack" onSubmit={finish}>
          <p className="muted" style={{ margin: 0 }}>Yalnızca ad yeterli. Öğrencinin hesap açması gerekmez; ders, not ve ödevleri hemen oluşturabilirsiniz.</p>
          <Field label="Öğrenci adı" htmlFor="st">
            <input id="st" className="input" value={student} onChange={(e) => setStudent(e.target.value)} placeholder="Örn. Elif" autoFocus />
          </Field>
          {err && <div className="alert danger">{err}</div>}
          <div className="row between">
            <button type="button" className="btn ghost" onClick={() => { setStudent(''); void finish(); }}>Şimdilik atla</button>
            <button className="btn primary" disabled={busy || !student.trim()}>Ekle ve başla</button>
          </div>
        </form>
      </AuthCard>
    );

  return (
    <AuthCard title="Öğretmen hesabı açın" footer={<>Zaten hesabınız var mı? <Link to="/login">Giriş yapın</Link></>}>
      <form className="stack" onSubmit={submit}>
        <Field label="Adınız" htmlFor="n">
          <input id="n" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
        </Field>
        <Field label="E-posta" htmlFor="e">
          <input id="e" className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
        </Field>
        <Field label="Parola" hint="En az 10 karakter" htmlFor="p">
          <input id="p" className="input" type="password" minLength={10} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
        </Field>
        <Field label="Saat dilimi" htmlFor="tz">
          <input id="tz" className="input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
        </Field>
        {err && <div className="alert danger" role="alert">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Hesap açılıyor…' : 'Ücretsiz başla'}</button>
        <p className="small muted" style={{ margin: 0 }}>Ücretsiz planda 1 aktif öğrenci ve sınırlı AI kullanımı vardır. Kart bilgisi istenmez.</p>
      </form>
    </AuthCard>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <AuthCard title="Parola sıfırlama" footer={<Link to="/login">Girişe dön</Link>}>
      {sent ? (
        <div className="alert ok">Bu e-postaya kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi.</div>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            await api.post('/auth/request-password-reset', { email }).catch(() => undefined);
            setSent(true);
          }}
        >
          <Field label="E-posta" htmlFor="fe">
            <input id="fe" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <button className="btn primary">Bağlantı gönder</button>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'form' | 'ok' | string>('form');
  return (
    <AuthCard title="Yeni parola" footer={<Link to="/login">Girişe dön</Link>}>
      {state === 'ok' ? (
        <div className="alert ok">Parolanız değiştirildi. Tüm cihazlardaki oturumlar kapatıldı; yeniden giriş yapın.</div>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.post('/auth/reset-password', { token: params.get('token') ?? '', password });
              setState('ok');
            } catch (x) {
              setState(errorMessage(x));
            }
          }}
        >
          <Field label="Yeni parola" hint="En az 10 karakter" htmlFor="np">
            <input id="np" className="input" type="password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          {state !== 'form' && <div className="alert danger">{state}</div>}
          <button className="btn primary">Kaydet</button>
        </form>
      )}
    </AuthCard>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState<'wait' | 'ok' | string>('wait');
  useEffect(() => {
    api
      .post('/auth/verify-email', { token: params.get('token') ?? '' })
      .then(() => setState('ok'))
      .catch((x) => setState(errorMessage(x)));
  }, [params]);
  return (
    <AuthCard title="E-posta doğrulama" footer={<Link to="/">Devam et</Link>}>
      {state === 'wait' ? <p>Doğrulanıyor…</p> : state === 'ok' ? <div className="alert ok">E-posta adresiniz doğrulandı.</div> : <div className="alert danger">{state}</div>}
    </AuthCard>
  );
}
