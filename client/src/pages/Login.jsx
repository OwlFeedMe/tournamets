import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, X } from 'lucide-react'
import api from '../api/axios'
import { getHomePath, useAuth } from '../context/AuthContext'

function RegisterModal({ open, onClose, onRegistered }) {
  const [form, setForm] = useState({
    cedula: '',
    nombre: '',
    apellido: '',
    email: '',
    celular: '',
    genero: 'M',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    const event = new CustomEvent('finalrep:overlay-visibility', { detail: { open: true } })
    window.dispatchEvent(event)
    return () => {
      window.dispatchEvent(new CustomEvent('finalrep:overlay-visibility', { detail: { open: false } }))
    }
  }, [open])

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('Las contrasenas no coinciden')
      return
    }

    setLoading(true)
    try {
      const payload = {
        cedula: form.cedula,
        nombre: form.nombre,
        apellido: form.apellido,
        email: form.email,
        celular: form.celular,
        genero: form.genero,
        password: form.password,
      }
      const { data } = await api.post('/auth/register', payload)
      onRegistered(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo crear la cuenta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar registro"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.68)',
          border: 'none',
          zIndex: 79,
        }}
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'calc(20px + env(safe-area-inset-top, 0px)) 12px calc(20px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Registro"
          style={{
            width: '100%',
            maxWidth: 420,
            borderRadius: 28,
            border: '1px solid #252A33',
            background: '#171B21',
            padding: '18px 16px 18px',
            maxHeight: '100%',
            overflowY: 'auto',
            boxShadow: '0 24px 80px rgba(0,0,0,0.42)',
          }}
        >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeft size={16} />
            Volver
          </button>
          <div style={{ color: '#F4F7FB', fontWeight: 800, fontSize: 16 }}>Crear cuenta</div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#AAB2C0', display: 'grid', placeItems: 'center' }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-error">{error}</div>}

          <div className="form-group">
            <label>Cedula</label>
            <input value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} required autoFocus />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Nombre</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Apellido</label>
              <input value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} required />
            </div>
          </div>

          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Celular</label>
              <input value={form.celular} onChange={(e) => setForm({ ...form, celular: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Genero</label>
              <select value={form.genero} onChange={(e) => setForm({ ...form, genero: e.target.value })}>
                <option value="M">M</option>
                <option value="F">F</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Contrasena</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>

          <div className="form-group">
            <label>Confirmar contrasena</label>
            <input type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required />
          </div>

          <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px' }} disabled={loading}>
            {loading ? 'Creando cuenta...' : 'Registrarme'}
          </button>
        </form>
        </div>
      </div>
    </>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const { persistSession } = useAuth()
  const [form, setForm] = useState({ cedula: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)

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

  const handleRegistered = (data) => {
    persistSession(data)
    navigate(getHomePath(data.role), { replace: true })
  }

  return (
    <div className="app-shell auth-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100%', padding: '20px 20px 8px', background: 'radial-gradient(circle at top, rgba(255,107,0,0.14), transparent 32%), transparent' }}>
      <div className="auth-card-wrap" style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
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
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px', marginBottom: 10 }} disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>

            <button type="button" className="btn-secondary" style={{ width: '100%', padding: '12px' }} onClick={() => setRegisterOpen(true)}>
              Crear cuenta
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: '#AAB2C0' }}>
          <Link to="/" style={{ color: '#FF6B00' }}>Volver al inicio</Link>
        </p>
      </div>

      <RegisterModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onRegistered={handleRegistered}
      />
    </div>
  )
}
