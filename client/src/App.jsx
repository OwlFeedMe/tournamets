import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import AdminDashboard from './pages/AdminDashboard'
import { EventsPage, NotificationsPage, WorkoutsPage } from './pages/ExplorePages'
import Home from './pages/Home'
import Leaderboard from './pages/Leaderboard'
import Login from './pages/Login'
import ParticipantProfile from './pages/ParticipantProfile'
import { AuthProvider, getHomePath, useAuth } from './context/AuthContext'
import { AuthenticatedShell } from './components/layout/AuthenticatedShell'

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
        <Routes>
          <Route element={<AuthenticatedShell />}>
            <Route path="/" element={<Home />} />
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
      </AuthProvider>
    </BrowserRouter>
  )
}
