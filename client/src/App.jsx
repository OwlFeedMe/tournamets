import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import AdminDashboard from './pages/AdminDashboard'
import ParticipantProfile from './pages/ParticipantProfile'
import Leaderboard from './pages/Leaderboard'

function PrivateRoute({ children, role }) {
  const token = localStorage.getItem('token')
  const storedRole = localStorage.getItem('role')
  if (!token) return <Navigate to="/login" replace />
  if (role && storedRole !== role) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/leaderboard/:competitionId" element={<Leaderboard />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route
          path="/admin/*"
          element={
            <PrivateRoute role="admin">
              <AdminDashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <PrivateRoute role="participant">
              <ParticipantProfile />
            </PrivateRoute>
          }
        />
        <Route path="/" element={<Navigate to="/leaderboard" replace />} />
        <Route path="*" element={<Navigate to="/leaderboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
