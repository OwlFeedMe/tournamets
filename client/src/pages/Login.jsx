import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

export default function Login() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ cedula: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', form)
      localStorage.setItem('token', data.access_token)
      localStorage.setItem('role', data.role)
      localStorage.setItem('nombre', data.nombre || '')
      if (data.participant_id) localStorage.setItem('participant_id', data.participant_id)

      if (data.role === 'admin') navigate('/admin')
      else navigate('/profile')
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell auth-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20 }}>
      <div className="auth-card-wrap" style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 38, fontWeight: 800, color: '#284017', letterSpacing: '0.5px' }}>
            🏆 Loyalty Race
          </h1>
          <p style={{ color: '#647063', marginTop: 6, fontSize: 14 }}>Ingresa con tu cédula</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label>ID / Cédula</label>
              <input
                type="text"
                placeholder="Tu cédula o ID de admin"
                value={form.cedula}
                onChange={(e) => setForm({ ...form, cedula: e.target.value })}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Contraseña</label>
              <input
                type="password"
                placeholder="Tu contraseña"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <span style={{ fontSize: 11, color: '#647063', marginTop: 4, display: 'block' }}>
                Participantes: tu contraseña es tu cédula
              </span>
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px' }} disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#647063' }}>
          ← <a href="/leaderboard" style={{ color: '#284017' }}>Volver al leaderboard</a>
        </p>
      </div>
    </div>
  )
}
