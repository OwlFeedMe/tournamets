import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, getHomePath, useAuth } from './context/AuthContext'
import { AuthenticatedShell } from './components/layout/AuthenticatedShell'

const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const CompetitionEnrollmentPage = lazy(() => import('./pages/CompetitionEnrollmentPage'))
const CompetitionLanding = lazy(() => import('./pages/CompetitionLanding'))
const CompetitionSchedule = lazy(() => import('./pages/CompetitionSchedule'))
const EventsPage = lazy(() => import('./pages/ExplorePages').then((module) => ({ default: module.EventsPage })))
const Home = lazy(() => import('./pages/Home'))
const Leaderboard = lazy(() => import('./pages/Leaderboard'))
const Login = lazy(() => import('./pages/Login'))
const MyEventsPage = lazy(() => import('./pages/ExplorePages').then((module) => ({ default: module.MyEventsPage })))
const NotificationsPage = lazy(() => import('./pages/ExplorePages').then((module) => ({ default: module.NotificationsPage })))
const ParticipantProfile = lazy(() => import('./pages/ParticipantProfile'))
const WorkoutsPage = lazy(() => import('./pages/ExplorePages').then((module) => ({ default: module.WorkoutsPage })))

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
  const { session, ready } = useAuth()
  if (!ready) return null
  if (!session) return <Navigate to="/login" replace />
  if (allowedRoles.length && !allowedRoles.includes(session.role)) {
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
              <Route path="/" element={<Home />} />
              <Route path="/competitions/:competitionId" element={<CompetitionLanding />} />
              <Route path="/competitions/:competitionId/schedule" element={<CompetitionSchedule scope="public" />} />
              <Route path="/competitions/:competitionId/register" element={<CompetitionEnrollmentPage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/workouts" element={<WorkoutsPage />} />
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
                    <RoleGate allowedRoles={['user']}>
                      <ParticipantProfile />
                    </RoleGate>
                  }
                />
                <Route
                  path="/competitions/:competitionId/my-schedule"
                  element={
                    <RoleGate allowedRoles={['user']}>
                      <CompetitionSchedule scope="personal" />
                    </RoleGate>
                  }
                />
                <Route
                  path="/my-events"
                  element={
                    <RoleGate allowedRoles={['user']}>
                      <MyEventsPage />
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
