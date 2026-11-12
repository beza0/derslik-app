import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { InvitePreviewDto } from '@derslik/shared';
import { api, errorMessage } from '../../api';
import { useAuth } from '../../auth';
import { Field } from '../../ui';
import { AuthCard } from './AuthPages';

/**
 * Davet kabulü: önce davetin kime ait olduğu gösterilir (yanlış kişiye bağlanmayı fark ettirmek için),
 * sonra mevcut hesapla veya yeni hesap açarak kabul edilir. Kayıtlar yeniden oluşturulmaz.
 */
export function AcceptInvite() {
  const { code: param } = useParams();
  const { me, reload, setMode } = useAuth();
  const nav = useNavigate();
  const [code, setCode] = useState(param ?? '');
  const [preview, setPreview] = useState<InvitePreviewDto | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<'new' | 'login'>('new');
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  const check = async (c: string) => {
    setErr(null);
    try {
      setPreview(await api.post<InvitePreviewDto>('/invites/preview', { code: c }));
    } catch (x) {
      setPreview(null);
      setErr(errorMessage(x));
    }
  };
  useEffect(() => {
    if (param) void check(param);
  }, [param]);

  const accept = async () => {
    await api.post('/invites/accept', { code });
    await reload();
    setMode('portal');
    nav('/');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (!me) {
        if (account === 'new') await api.register({ ...form, role: 'member' });
        else await api.login(form.email, form.password);
      }
      await accept();
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Daveti kabul et" footer={!me && <Link to="/login">Girişe dön</Link>}>
      {!preview ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void check(code);
          }}
        >
          <Field label="Davet kodu" hint="Öğretmeninizin paylaştığı kod (ör. ABCD-EFGH-…)" htmlFor="code">
            <input id="code" className="input" value={code} onChange={(e) => setCode(e.target.value)} required autoCapitalize="characters" />
          </Field>
          {err && <div className="alert danger" role="alert">{err}</div>}
          <button className="btn primary">Devam</button>
        </form>
      ) : (
        <form className="stack" onSubmit={submit}>
          <div className="alert info">
            <strong>{preview.teacherName}</strong> sizi <strong>{preview.studentDisplayName}</strong> kaydına{' '}
            {preview.kind === 'student' ? 'öğrenci olarak' : 'veli olarak'} davet ediyor.
            <div className="small muted">Bu siz değilseniz kabul etmeyin ve öğretmeninize bildirin.</div>
          </div>
          {me ? (
            <p className="muted" style={{ margin: 0 }}>
              <strong>{me.user.email}</strong> hesabıyla kabul edeceksiniz.
            </p>
          ) : (
            <>
              <div className="row">
                <button type="button" className={`btn sm ${account === 'new' ? 'primary' : ''}`} onClick={() => setAccount('new')}>Yeni hesap</button>
                <button type="button" className={`btn sm ${account === 'login' ? 'primary' : ''}`} onClick={() => setAccount('login')}>Hesabım var</button>
              </div>
              {account === 'new' && (
                <Field label="Adınız" htmlFor="an">
                  <input id="an" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
              )}
              <Field label="E-posta" htmlFor="ae">
                <input id="ae" className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Parola" hint={account === 'new' ? 'En az 10 karakter' : undefined} htmlFor="ap">
                <input id="ap" className="input" type="password" minLength={account === 'new' ? 10 : 1} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </Field>
            </>
          )}
          {err && <div className="alert danger" role="alert">{err}</div>}
          <button className="btn primary" disabled={busy}>{busy ? 'Bağlanıyor…' : 'Kabul et ve bağlan'}</button>
        </form>
      )}
    </AuthCard>
  );
}
