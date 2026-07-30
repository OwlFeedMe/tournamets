import { useState } from 'react'
import { ArrowLeft, CalendarDays, MapPin, Plus, Trophy } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { APP_CONTENT_MAX_WIDTH } from '../utils/competitionLayout'

const inputStyle = {
  width: '100%',
  border: '1px solid #252A33',
  borderRadius: 10,
  background: '#0D0F12',
  color: '#F5F7FA',
  padding: '12px 13px',
  font: 'inherit',
  outline: 'none',
}

function toLocalDateTime(value, endOfDay = false) {
  if (!value) return null
  return `${value}T${endOfDay ? '23:59:59' : '00:00:00'}`
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'grid', gap: 7 }}>
      <span style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 800 }}>{label}</span>
      {children}
      {hint ? <span style={{ color: '#6B7280', fontSize: 11, lineHeight: 1.45 }}>{hint}</span> : null}
    </label>
  )
}

export default function CreateCompetitionPage() {
  const navigate = useNavigate()
  const { refreshSession } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState({
    nombre: '',
    descripcion: '',
    lugar: '',
    competition_start: '',
    competition_end: '',
  })

  const update = (field, value) => setDraft((current) => ({ ...current, [field]: value }))

  const submit = async (event) => {
    event.preventDefault()
    const nombre = draft.nombre.trim()
    if (!nombre) {
      setError('Escribe el nombre de la competencia.')
      return
    }
    if (draft.competition_start && draft.competition_end && draft.competition_end < draft.competition_start) {
      setError('La fecha final debe ser igual o posterior a la fecha de inicio.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const { data: competition } = await api.post('/competitions', {
        nombre,
        descripcion: draft.descripcion.trim() || null,
        lugar: draft.lugar.trim() || null,
        timezone: 'America/Bogota',
        competition_start: toLocalDateTime(draft.competition_start),
        competition_end: toLocalDateTime(draft.competition_end, true),
        activa: 0,
      })
      await refreshSession({ force: true })
      navigate(`/admin?competition=${competition.id}`, { replace: true })
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail
        || requestError.message
        || 'No pudimos crear el borrador. Intenta de nuevo.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ minHeight: '100%', background: '#0D0F12', color: '#F5F7FA' }}>
      <div style={{ maxWidth: Math.min(APP_CONTENT_MAX_WIDTH, 920), margin: '0 auto', padding: '24px 16px 40px' }}>
        <Link
          to="/profile"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#AAB2C0', textDecoration: 'none', fontSize: 13, fontWeight: 750 }}
        >
          <ArrowLeft size={16} />
          Volver al perfil
        </Link>

        <section style={{ marginTop: 18, overflow: 'hidden', border: '1px solid #252A33', borderRadius: 14, background: '#171B21' }}>
          <header style={{ padding: '24px clamp(18px, 4vw, 34px)', background: 'linear-gradient(135deg, rgba(255,107,0,0.24) 0%, rgba(23,27,33,0.98) 58%, rgba(0,194,168,0.10) 100%)', borderBottom: '1px solid #252A33' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)', color: '#0D0F12' }}>
              <Trophy size={22} />
            </div>
            <div style={{ color: '#FFB36F', marginTop: 18, fontSize: 11, fontWeight: 900, letterSpacing: 1.1, textTransform: 'uppercase' }}>Organiza en FinalRep</div>
            <h1 style={{ margin: '6px 0 0', fontSize: 'clamp(28px, 5vw, 44px)', lineHeight: 1 }}>Crea tu competencia</h1>
            <p style={{ maxWidth: 650, margin: '10px 0 0', color: '#AAB2C0', fontSize: 14, lineHeight: 1.6 }}>
              Empieza con la informacion esencial. Crearemos un borrador privado para que configures categorias, inscripciones y workouts a tu ritmo.
            </p>
          </header>

          <form onSubmit={submit} style={{ padding: 'clamp(18px, 4vw, 34px)', display: 'grid', gap: 18 }}>
            {error ? (
              <div role="alert" style={{ border: '1px solid rgba(239,68,68,0.48)', borderRadius: 10, background: 'rgba(239,68,68,0.10)', color: '#FCA5A5', padding: '11px 13px', fontSize: 13 }}>
                {error}
              </div>
            ) : null}

            <Field label="Nombre de la competencia">
              <input
                autoFocus
                maxLength={160}
                placeholder="Ej. FinalRep Challenge Medellin"
                value={draft.nombre}
                onChange={(event) => update('nombre', event.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="Descripcion" hint="Puedes ampliarla y agregar imagenes desde el panel.">
              <textarea
                rows={4}
                maxLength={1200}
                placeholder="Cuenta brevemente que tipo de competencia vas a organizar."
                value={draft.descripcion}
                onChange={(event) => update('descripcion', event.target.value)}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }}
              />
            </Field>

            <Field label="Lugar">
              <div style={{ position: 'relative' }}>
                <MapPin size={17} color="#6B7280" style={{ position: 'absolute', left: 13, top: 13, pointerEvents: 'none' }} />
                <input
                  maxLength={220}
                  placeholder="Ciudad, box o sede"
                  value={draft.lugar}
                  onChange={(event) => update('lugar', event.target.value)}
                  style={{ ...inputStyle, paddingLeft: 40 }}
                />
              </div>
            </Field>

            <div className="fr-create-competition-dates" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Fecha de inicio">
                <div style={{ position: 'relative' }}>
                  <CalendarDays size={17} color="#6B7280" style={{ position: 'absolute', left: 13, top: 13, pointerEvents: 'none' }} />
                  <input
                    type="date"
                    value={draft.competition_start}
                    onChange={(event) => update('competition_start', event.target.value)}
                    style={{ ...inputStyle, paddingLeft: 40, colorScheme: 'dark' }}
                  />
                </div>
              </Field>
              <Field label="Fecha final">
                <input
                  type="date"
                  min={draft.competition_start || undefined}
                  value={draft.competition_end}
                  onChange={(event) => update('competition_end', event.target.value)}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </Field>
            </div>

            <div style={{ borderTop: '1px solid #252A33', paddingTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ color: '#6B7280', fontSize: 12 }}>El borrador no sera visible para otros usuarios.</span>
              <button
                type="submit"
                disabled={busy}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 0, borderRadius: 10, background: busy ? '#9A4A12' : '#FF6B00', color: '#F5F7FA', padding: '12px 17px', fontWeight: 850, cursor: busy ? 'wait' : 'pointer' }}
              >
                <Plus size={17} />
                {busy ? 'Creando borrador...' : 'Crear borrador'}
              </button>
            </div>
          </form>
        </section>
      </div>
      <style>{`
        @media (max-width: 620px) {
          .fr-create-competition-dates {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  )
}
