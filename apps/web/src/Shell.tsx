import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  BookOpen,
  Bot,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FolderOpen,
  Home,
  MoreHorizontal,
  Inbox,
  LogOut,
  Settings,
  Shield,
  StickyNote,
  Users,
  UsersRound,
} from 'lucide-react';
import { BRAND } from '@derslik/shared';
import { api } from './api';
import { useAuth, type Mode } from './auth';
import { t } from './i18n';

interface Item {
  to: string;
  label: string;
  icon: ReactNode;
  mobile?: boolean;
  count?: number;
}

export function items(mode: Mode, unread: number): Item[] {
  if (mode === 'teacher')
    return [
      { to: '/', label: t('nav.today'), icon: <Home size={20} />, mobile: true },
      { to: '/calendar', label: t('nav.calendar'), icon: <CalendarDays size={20} />, mobile: true },
      { to: '/students', label: t('nav.students'), icon: <Users size={20} />, mobile: true },
      { to: '/groups', label: t('nav.groups'), icon: <UsersRound size={20} /> },
      { to: '/assignments', label: t('nav.assignments'), icon: <ClipboardList size={20} /> },
      { to: '/materials', label: t('nav.materials'), icon: <FolderOpen size={20} /> },
      { to: '/assistant', label: t('nav.assistant'), icon: <Bot size={20} />, mobile: true },
      { to: '/requests', label: t('nav.requests'), icon: <Inbox size={20} /> },
      { to: '/notifications', label: t('nav.notifications'), icon: <Bell size={20} />, count: unread },
      { to: '/billing', label: t('nav.billing'), icon: <CreditCard size={20} /> },
      { to: '/settings', label: t('nav.settings'), icon: <Settings size={20} /> },
      { to: '/more', label: t('nav.more'), icon: <MoreHorizontal size={20} />, mobile: true },
    ];
  if (mode === 'portal')
    return [
      { to: '/', label: t('nav.today'), icon: <Home size={20} />, mobile: true },
      { to: '/calendar', label: t('nav.calendar'), icon: <CalendarDays size={20} />, mobile: true },
      { to: '/assignments', label: t('nav.assignments'), icon: <BookOpen size={20} />, mobile: true },
      { to: '/notes', label: t('nav.notes'), icon: <StickyNote size={20} />, mobile: true },
      { to: '/notifications', label: t('nav.notifications'), icon: <Bell size={20} />, count: unread },
      { to: '/settings', label: t('nav.settings'), icon: <Settings size={20} />, mobile: true },
    ];
  return [
    { to: '/', label: t('nav.admin'), icon: <Shield size={20} />, mobile: true },
    { to: '/settings', label: t('nav.settings'), icon: <Settings size={20} />, mobile: true },
  ];
}

export function Shell() {
  const { mode, logout, me } = useAuth();
  const unread = useQuery({
    queryKey: ['unread'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
  });
  const nav = items(mode!, unread.data?.count ?? 0);
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Ana menü">
        <div className="brand">
          <img src="/icon.svg" alt="" />
          {BRAND.name}
        </div>
        {nav.filter((i) => i.to !== '/more').map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            {i.icon}
            {i.label}
            {!!i.count && <span className="count" aria-label={`${i.count} okunmamış`}>{i.count}</span>}
          </NavLink>
        ))}
        <div style={{ marginTop: 'auto' }} className="small muted">
          <div style={{ padding: '8px 12px' }}>{me?.user.name}</div>
          <button className="nav-link btn ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={logout}>
            <LogOut size={20} /> Çıkış
          </button>
        </div>
      </aside>
      <div>
        <header className="topbar">
          <div className="brand" style={{ padding: 0 }}>
            <img src="/icon.svg" alt="" />
            {BRAND.name}
          </div>
          <NavLink to="/notifications" className="btn ghost" aria-label="Bildirimler">
            <Bell size={20} />
            {!!unread.data?.count && <span className="badge info">{unread.data.count}</span>}
          </NavLink>
        </header>
        <main className="main">
          <Outlet />
        </main>
        <nav className="bottom-nav" aria-label="Alt menü">
          {nav
            .filter((i) => i.mobile)
            .map((i) => (
              <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                {i.icon}
                {i.label}
              </NavLink>
            ))}
        </nav>
      </div>
    </div>
  );
}
