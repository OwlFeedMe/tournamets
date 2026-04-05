import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { getHomePath, useAuth } from '../context/AuthContext'

export default function Login() {
  const navigate = useNavigate()
  const { persistSession } = useAuth()
  const [form, setForm] = useState({ cedula: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', form)
      persistSession(data)
      navigate(getHomePath(data.role), { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al iniciar sesion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell auth-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20, background: 'radial-gradient(circle at top, rgba(255,107,0,0.14), transparent 32%), #0D0F12' }}>
      <div className="auth-card-wrap" style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 42, fontWeight: 800, color: '#FF6B00', letterSpacing: '0.8px' }}>
            FinalRep
          </h1>
          <p style={{ color: '#AAB2C0', marginTop: 6, fontSize: 14 }}>Ingresa con tu cedula</p>
        </div>

        <div className="card" style={{ background: '#171B21', borderColor: '#252A33' }}>
          <form onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label>ID / Cedula</label>
              <input
                type="text"
                placeholder="Tu cedula o ID de admin"
                value={form.cedula}
                onChange={(e) => setForm({ ...form, cedula: e.target.value })}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Contrasena</label>
              <input
                type="password"
                placeholder="Tu contrasena"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <span style={{ fontSize: 11, color: '#AAB2C0', marginTop: 4, display: 'block' }}>
                Usuarios creados desde participantes conservan por defecto la contrasena de su cedula hasta que se cambie en backend.
              </span>
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px' }} disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#AAB2C0' }}>
          ¿No tienes cuenta? <Link to="/register" style={{ color: '#FF6B00' }}>Registrarte</Link>
        </p>

        <p style={{ textAlign: 'center', marginTop: 8, fontSize: 13, color: '#AAB2C0' }}>
          <a href="/" style={{ color: '#FF6B00' }}>Volver al inicio</a>
        </p>
      </div>
    </div>
  )
}
