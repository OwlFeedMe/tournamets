import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, X } from 'lucide-react'
import api from '../api/axios'
import { getHomePath, useAuth } from '../context/AuthContext'
import { loadCountries } from '../utils/locations'

const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TEXT_ONLY_REGEX = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]+$/
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/

function getApiErrorMessage(err, fallback) {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail) && detail.length) {
    return detail.map((item) => {
      const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : ''
      const fieldLabelMap = {
        nombre: 'Nombre',
        apellido: 'Apellido',
        email: 'Email',
        celular: 'Celular',
        genero: 'Genero',
        password: 'Contrasena',
        cedula: 'Correo o usuario',
      }
      const label = fieldLabelMap[field] || field
      const msg = item?.msg || item?.message || ''

      if (msg === 'Field required') {
        return label ? `${label} es obligatorio` : 'Falta un campo obligatorio'
      }

      return label && msg ? `${label}: ${msg}` : msg
    }).filter(Boolean).join(', ') || fallback
  }
  if (typeof err?.message === 'string' && err.message.trim() && err.message !== 'Network Error') {
    return err.message
  }
  return fallback
}

function getRegisterValidationError(form) {
  if (!TEXT_ONLY_REGEX.test(form.nombre.trim())) {
    return 'El nombre solo puede tener letras y espacios'
  }

  if (!TEXT_ONLY_REGEX.test(form.apellido.trim())) {
    return 'El apellido solo puede tener letras y espacios'
  }

  if (!form.email.trim()) {
    return 'El correo es obligatorio'
  }

  if (!BASIC_EMAIL_REGEX.test(form.email.trim())) {
    return 'Ingresa un email valido'
  }

  if (form.celular.trim() && !/^\d+$/.test(form.celular.trim())) {
    return 'El celular debe contener solo numeros'
  }

  if (!['M', 'F', 'Otro'].includes(form.genero)) {
    return 'Selecciona un genero valido'
  }

  if (!STRONG_PASSWORD_REGEX.test(form.password)) {
    return 'La contrasena debe tener minimo 8 caracteres, mayuscula, minuscula, numero y caracter especial'
  }

  if (form.password !== form.confirmPassword) {
    return 'Las contrasenas no coinciden'
  }

  return ''
}

function RegisterModal({ open, onClose, onRegistered }) {
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    email: '',
    celularCountry: 'CO',
    celularCountryName: 'Colombia',
    celularDialCode: '57',
    celular: '',
    genero: 'M',
    password: '',
    confirmPassword: '',
  })
  const [countries, setCountries] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    loadCountries()
      .then((items) => {
        setCountries(items)
        const defaultCountry = items.find((item) => item.code === 'CO') || items[0]
        if (!defaultCountry) return
        setForm((current) => ({
          ...current,
          celularCountry: current.celularCountry || defaultCountry.code,
          celularCountryName: current.celularCountryName || defaultCountry.name,
          celularDialCode: current.celularDialCode || defaultCountry.phoneCode,
        }))
      })
      .catch(() => setCountries([]))
  }, [])

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

    const validationError = getRegisterValidationError(form)
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      const payload = {
        nombre: form.nombre,
        apellido: form.apellido,
        email: form.email,
        celular: form.celular ? `${form.celularDialCode}${form.celular}` : '',
        genero: form.genero,
        password: form.password,
      }
      const { data } = await api.post('/auth/register', payload)
      onRegistered(data)
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo crear la cuenta. Verifica si el correo ya esta registrado.'))
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Nombre</label>
              <input
                value={form.nombre}
                onChange={(e) => { const v = e.target.value.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]/g, ''); setForm((prev) => ({ ...prev, nombre: v })) }}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Apellido</label>
              <input
                value={form.apellido}
                onChange={(e) => { const v = e.target.value.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]/g, ''); setForm((prev) => ({ ...prev, apellido: v })) }}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => { const v = e.target.value; setForm((prev) => ({ ...prev, email: v })) }}
              placeholder="correo@dominio.com"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Pais e indicativo</label>
              <select
                value={form.celularCountry}
                onChange={(e) => {
                  const selectedCountry = countries.find((item) => item.code === e.target.value)
                  const code = e.target.value
                  setForm((prev) => ({
                    ...prev,
                    celularCountry: code,
                    celularCountryName: selectedCountry?.name || '',
                    celularDialCode: selectedCountry?.phoneCode || '',
                  }))
                }}
              >
                {countries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name} {country.phoneCode ? `(+${country.phoneCode})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Celular</label>
              <input
                value={form.celular}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setForm((prev) => ({ ...prev, celular: v })) }}
                inputMode="numeric"
                pattern="\d*"
                placeholder="3001234567"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <div className="form-group">
              <label>Genero</label>
              <select value={form.genero} onChange={(e) => { const v = e.target.value; setForm((prev) => ({ ...prev, genero: v })) }}>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Contrasena</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => { const v = e.target.value; setForm((prev) => ({ ...prev, password: v })) }}
                required
                style={{ paddingRight: 48 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Ocultar contrasena' : 'Ver contrasena'}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#AAB2C0',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <small style={{ color: '#AAB2C0', display: 'block', marginTop: 6 }}>
              Minimo 8 caracteres, con mayuscula, minuscula, numero y caracter especial.
            </small>
          </div>

          <div className="form-group">
            <label>Confirmar contrasena</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={(e) => { const v = e.target.value; setForm((prev) => ({ ...prev, confirmPassword: v })) }}
                required
                style={{ paddingRight: 48 }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((current) => !current)}
                aria-label={showConfirmPassword ? 'Ocultar contrasena' : 'Ver contrasena'}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#AAB2C0',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
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
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', {
        cedula: form.email,
        password: form.password,
      })
      persistSession(data)
      navigate(getHomePath(data.role), { replace: true })
    } catch (err) {
      setError(getApiErrorMessage(err, 'No pudimos iniciar sesion con esas credenciales'))
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
          <p style={{ color: '#AAB2C0', marginTop: 6, fontSize: 14 }}>Inicia sesion con tu correo o usuario administrativo</p>
        </div>

        <div className="card" style={{ background: '#171B21', borderColor: '#252A33' }}>
          <form onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label>Correo o usuario</label>
              <input
                type="text"
                placeholder="tu@correo.com o organizer"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                autoFocus
                autoComplete="username"
                inputMode="email"
                spellCheck={false}
              />
            </div>

            <div className="form-group">
              <label>Contrasena</label>
              <input
                type="password"
                placeholder="Escribe tu contrasena"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                autoComplete="current-password"
              />
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px', marginBottom: 10 }} disabled={loading}>
              {loading ? 'Iniciando sesion...' : 'Iniciar sesion'}
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
