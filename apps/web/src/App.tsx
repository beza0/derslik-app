import { Navigate, NavLink, Route, Routes } from 'react-router';
import { useAuth } from './auth';
import { Shell, items } from './Shell';
import { Spinner, PageHeader } from './ui';
import { Login, Register, ForgotPassword, ResetPassword, VerifyEmail } from './pages/auth/AuthPages';
import { AcceptInvite } from './pages/auth/AcceptInvite';
import { NoContext } from './pages/auth/NoContext';
import { Today } from './pages/teacher/Today';
import { CalendarPage } from './pages/teacher/Calendar';
import { Students } from './pages/teacher/Students';
import { StudentProfile } from './pages/teacher/StudentProfile';
import { Groups, GroupDetail } from './pages/teacher/Groups';
import { LessonDetail } from './pages/teacher/LessonDetail';
import { Assignments, AssignmentDetail, NewAssignment } from './pages/teacher/Assignments';
import { Materials } from './pages/teacher/Materials';
import { Assistant } from './pages/teacher/Assistant';
import { Requests } from './pages/teacher/Requests';
import { Billing, SandboxCheckout } from './pages/teacher/Billing';
import { Settings } from './pages/Settings';
import { Notifications } from './pages/Notifications';
import { PortalToday, PortalCalendar, PortalAssignments, PortalAssignment, PortalNotes, PortalLesson } from './pages/portal/Portal';
import { AdminHome } from './pages/admin/Admin';

function More() {
  const { mode } = useAuth();
  return (
    <>
      <PageHeader title="Diğer" />
      <div className="card list">
        {items(mode!, 0)
          .filter((i) => i.to !== '/more')
          .map((i) => (
            <NavLink key={i.to} to={i.to} className="list-item">
              {i.icon}
              <span className="grow title">{i.label}</span>
            </NavLink>
          ))}
      </div>
    </>
  );
}

export function App() {
  const { me, loading, mode } = useAuth();
  if (loading) return <Spinner />;

  if (!me) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/invite/:code?" element={<AcceptInvite />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const common = (
    <>
      <Route path="/notifications" element={<Notifications />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/more" element={<More />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/register" element={<Navigate to="/" replace />} />
    </>
  );

  return (
    <Routes>
      <Route path="/invite/:code?" element={<AcceptInvite />} />
      {!mode && <Route path="*" element={<NoContext />} />}
      {mode && (
        <Route element={<Shell />}>
          {mode === 'teacher' && (
            <>
              <Route index element={<Today />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/students" element={<Students />} />
              <Route path="/students/:id" element={<StudentProfile />} />
              <Route path="/groups" element={<Groups />} />
              <Route path="/groups/:id" element={<GroupDetail />} />
              <Route path="/lessons/:id" element={<LessonDetail />} />
              <Route path="/assignments" element={<Assignments />} />
              <Route path="/assignments/new" element={<NewAssignment />} />
              <Route path="/assignments/:id" element={<AssignmentDetail />} />
              <Route path="/materials" element={<Materials />} />
              <Route path="/assistant" element={<Assistant />} />
              <Route path="/requests" element={<Requests />} />
              <Route path="/requests/:id" element={<Requests />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/billing/sandbox/:id" element={<SandboxCheckout />} />
            </>
          )}
          {mode === 'portal' && (
            <>
              <Route index element={<PortalToday />} />
              <Route path="/calendar" element={<PortalCalendar />} />
              <Route path="/lessons/:id" element={<PortalLesson />} />
              <Route path="/assignments" element={<PortalAssignments />} />
              <Route path="/assignments/:id" element={<PortalAssignment />} />
              <Route path="/notes" element={<PortalNotes />} />
              <Route path="/assessments" element={<PortalNotes />} />
            </>
          )}
          {mode === 'admin' && <Route index element={<AdminHome />} />}
          {common}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  );
}
