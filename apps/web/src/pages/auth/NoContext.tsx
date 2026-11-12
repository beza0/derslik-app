import { Link } from 'react-router';
import { useAuth } from '../../auth';
import { AuthCard } from './AuthPages';

/** Hesap var ama henüz hiçbir öğretmene bağlı değil. */
export function NoContext() {
  const { logout, me } = useAuth();
  return (
    <AuthCard title="Hoş geldiniz" footer={<button className="btn ghost sm" onClick={logout}>Çıkış yap</button>}>
      <p style={{ margin: 0 }}>
        <strong>{me?.user.email}</strong> hesabı henüz bir öğretmene bağlı değil. Öğretmeninizin gönderdiği davet koduyla bağlanabilirsiniz.
      </p>
      <Link to="/invite" className="btn primary">Davet kodunu gir</Link>
    </AuthCard>
  );
}
