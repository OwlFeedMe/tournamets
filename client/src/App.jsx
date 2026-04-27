import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, getHomePath, useAuth } from './context/AuthContext'
import { AuthenticatedShell } from './components/layout/AuthenticatedShell'

const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const CompetitionEnrollmentPage = lazy(() => import('./pages/CompetitionEnrollmentPage'))
const CompetitionLanding = lazy(() => import('./pages/CompetitionLanding'))
const CompetitionPublicRosterPage = lazy(() => import('./pages/CompetitionPublicRosterPage'))
const CompetitionPaymentResultPage = lazy(() => import('./pages/CompetitionPaymentResultPage'))
const CompetitionTicketsPage = lazy(() => import('./pages/CompetitionTicketsPage'))
const CompetitionTicketsPaymentResultPage = lazy(() => import('./pages/CompetitionTicketsPaymentResultPage'))
const CompetitionSchedule = lazy(() => import('./pages/CompetitionSchedule'))
const CompetitionVariants = lazy(() => import('./pages/CompetitionVariants'))
const EventsPage = lazy(() => import('./pages/ExplorePages').then((module) => ({ default: module.EventsPage })))
const HomeVariants = lazy(() => import('./pages/HomeVariants'))
const Leaderboard = lazy(() => import('./pages/Leaderboard'))
const JudgeHub = lazy(() => import('./pages/JudgeHub'))
const Login = lazy(() => import('./pages/Login'))
const MyEventsPage = lazy(() => import('./pages/ExplorePages').then((module) => ({ default: module.MyEventsPage })))
const NotificationsPage = lazy(() => import('./pages/ExplorePages').then((module) => ({ default: module.NotificationsPage })))
const CompetitionInvitationEnrollPage = lazy(() => import('./pages/CompetitionInvitationEnrollPage'))
const ParticipantProfile = lazy(() => import('./pages/ParticipantProfile'))

function AppFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#0D0F12',
        color: '#F5F7FA',
      }}
    >
      Cargando...
    </div>
  )
}

function PublicRoute({ children }) {
  const { session, ready } = useAuth()
  if (!ready) return null
  if (session) return <Navigate to={getHomePath(session.role)} replace />
  return children
}

function RequireSession() {
  const { session, ready } = useAuth()
  if (!ready) return null
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}

function RoleGate({ allowedRoles, children }) {
  const { session, ready, canAccess } = useAuth()
  if (!ready) return null
  if (!session) return <Navigate to="/login" replace />
  if (allowedRoles.length && !canAccess(allowedRoles)) {
    return <Navigate to={getHomePath(session.role)} replace />
  }
  return children
}

function NotFoundRedirect() {
  const { session, ready } = useAuth()
  if (!ready) return null
  return <Navigate to={session ? getHomePath(session.role) : '/'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<AppFallback />}>
          <Routes>
            <Route element={<AuthenticatedShell />}>
              <Route path="/" element={<HomeVariants variant={1} />} />
              <Route path="/home1" element={<HomeVariants variant={1} />} />
              <Route path="/competition1" element={<CompetitionVariants variant={1} />} />
              <Route path="/competition2" element={<CompetitionVariants variant={2} />} />
              <Route path="/competition3" element={<CompetitionVariants variant={3} />} />
              <Route path="/competition4" element={<CompetitionVariants variant={4} />} />
              <Route path="/competition5" element={<CompetitionVariants variant={5} />} />
              <Route path="/competitions/:competitionId" element={<CompetitionLanding />} />
              <Route path="/competitions/:competitionId/inscritos" element={<CompetitionPublicRosterPage />} />
              <Route path="/competitions/:competitionId/schedule" element={<CompetitionSchedule scope="public" />} />
              <Route path="/competitions/:competitionId/register" element={<CompetitionEnrollmentPage />} />
              <Route path="/competitions/:competitionId/payment-result" element={<CompetitionPaymentResultPage />} />
              <Route path="/competitions/:competitionId/tickets" element={<CompetitionTicketsPage />} />
              <Route path="/competitions/:competitionId/tickets/payment-result" element={<CompetitionTicketsPaymentResultPage />} />
              <Route path="/competitions/:competitionId/invitation/:invitationId" element={<CompetitionInvitationEnrollPage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/leaderboard/:competitionId" element={<Leaderboard />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <Login />
                  </PublicRoute>
                }
              />
            </Route>

            <Route element={<RequireSession />}>
              <Route element={<AuthenticatedShell />}>
                <Route
                  path="/profile"
                  element={
                    <RoleGate allowedRoles={['user', 'admin']}>
                      <ParticipantProfile />
                    </RoleGate>
                  }
                />
                <Route
                  path="/competitions/:competitionId/my-schedule"
                  element={
                    <RoleGate allowedRoles={['user', 'admin']}>
                      <CompetitionSchedule scope="personal" />
                    </RoleGate>
                  }
                />
                <Route
                  path="/my-events"
                  element={
                    <RoleGate allowedRoles={['user', 'admin']}>
                      <MyEventsPage />
                    </RoleGate>
                  }
                />
                <Route
                  path="/judge"
                  element={
                    <RoleGate allowedRoles={['judge', 'admin']}>
                      <JudgeHub />
                    </RoleGate>
                  }
                />
                <Route
                  path="/judge/*"
                  element={
                    <RoleGate allowedRoles={['judge', 'admin']}>
                      <JudgeHub />
                    </RoleGate>
                  }
                />
                <Route
                  path="/organizer"
                  element={
                    <RoleGate allowedRoles={['organizer', 'admin']}>
                      <AdminDashboard />
                    </RoleGate>
                  }
                />
                <Route
                  path="/organizer/*"
                  element={
                    <RoleGate allowedRoles={['organizer', 'admin']}>
                      <AdminDashboard />
                    </RoleGate>
                  }
                />
                <Route
                  path="/admin/*"
                  element={
                    <RoleGate allowedRoles={['admin']}>
                      <AdminDashboard />
                    </RoleGate>
                  }
                />
              </Route>
            </Route>

            <Route path="*" element={<NotFoundRedirect />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
