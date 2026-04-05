import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, Flame, Medal, Trophy } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { getHomePath, useAuth } from '../context/AuthContext'

const pageBg =
  'radial-gradient(circle at top, rgba(255,107,0,0.18), transparent 28%), radial-gradient(circle at 85% 20%, rgba(0,194,168,0.12), transparent 24%), #0D0F12'

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function resolveCompetitionAsset(competition, asset, isMobile = false) {
  if (!competition) return ''
  const profile = competition.profile_image_url || ''
  const banner = competition.banner_image_url || ''
  const desktop = competition.banner_desktop_url || ''
  const mobile = competition.banner_mobile_url || ''
  const legacy = competition.imagen_url || ''
  if (asset === 'profile') return profile || legacy
  if (asset === 'banner') return banner || desktop || mobile || legacy
  return legacy
}

function parseScheduleItems(raw) {
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item, idx) => ({
        id: String(item?.id || `date_${idx + 1}`),
        label: String(item?.label || '').trim(),
        kind: String(item?.kind || 'custom').trim().toLowerCase() || 'custom',
        start_at: item?.start_at || null,
        end_at: item?.end_at || null,
        note: String(item?.note || '').trim(),
      }))
      .filter(item => item.label || item.start_at || item.end_at || item.note)
  } catch {
    return []
  }
}

function scheduleSummary(competition) {
  const items = parseScheduleItems(competition?.schedule_items)
  if (items.length) {
    const main = items.slice(0, 2).map(item => {
      const start = formatDate(item.start_at)
      const end = formatDate(item.end_at)
      if (start && end && start !== end) return `${item.label || 'Fecha'}: ${start} - ${end}`
      return `${item.label || 'Fecha'}: ${start || end || 'Por confirmar'}`
    })
    return main.join(' | ')
  }
  const competitionStart = formatDate(competition?.competition_start)
  const competitionEnd = formatDate(competition?.competition_end)
  if (competitionStart || competitionEnd) {
    return competitionStart && competitionEnd
      ? `${competitionStart} - ${competitionEnd}`
      : (competitionStart || competitionEnd)
  }
  const enrollmentStart = formatDate(competition?.enrollment_start)
  const enrollmentEnd = formatDate(competition?.enrollment_end)
  return enrollmentStart || enrollmentEnd
    ? `${enrollmentStart || 'Ahora'}${enrollmentEnd ? ` - ${enrollmentEnd}` : ''}`
    : 'Fechas por confirmar'
}

function truncate(text, max = 140) {
  const value = (text || '').trim()
  if (!value) return 'Revisa detalles del evento, sigue el leaderboard y encuentra una competencia para ti.'
  return value.length > max ? `${value.slice(0, max - 1)}...` : value
}

function getCompetitionState(competition) {
  const now = Date.now()
  const start = competition.enrollment_start ? Date.parse(competition.enrollment_start) : null
  const end = competition.enrollment_end ? Date.parse(competition.enrollment_end) : null

  if (competition.enrollment_open) {
    return { label: 'Inscripciones abiertas', tone: '#22C55E', weight: 0 }
  }
  if (competition.activa) {
    return { label: 'Activa', tone: '#FF6B00', weight: 1 }
  }
  if (start && start > now) {
    return { label: 'Proximamente', tone: '#00C2A8', weight: 2 }
  }
  if (end && end > now) {
    return { label: 'Cierre cercano', tone: '#F59E0B', weight: 3 }
  }
  return { label: 'Borrador', tone: '#6B7280', weight: 4 }
}

function cardVisualStyle(competition, index, bannerUrl = '') {
  if (bannerUrl) {
    return {
      backgroundImage: `linear-gradient(180deg, rgba(13,15,18,0.12), rgba(13,15,18,0.58)), url("${bannerUrl}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }

  const palettes = [
    'linear-gradient(135deg, rgba(255,107,0,0.90), rgba(255,154,61,0.55))',
    'linear-gradient(135deg, rgba(0,194,168,0.88), rgba(13,15,18,0.62))',
    'linear-gradient(135deg, rgba(22,27,33,0.96), rgba(255,107,0,0.72))',
  ]

  return { backgroundImage: palettes[index % palettes.length] }
}

function parseEnrollmentQuestions(raw) {
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item, idx) => ({
        id: String(item?.id || `q_${idx + 1}`),
        label: String(item?.label || '').trim(),
        field_type: String(item?.field_type || 'text').trim().toLowerCase() || 'text',
        required: Number(item?.required) ? 1 : 0,
        placeholder: String(item?.placeholder || '').trim(),
      }))
      .filter(item => item.label)
  } catch {
    return []
  }
}

function parseEnrollmentPaymentMethods(raw) {
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item, idx) => ({
        id: String(item?.id || `pm_${idx + 1}`),
        label: String(item?.label || '').trim(),
        account_name: String(item?.account_name || '').trim(),
        account_number: String(item?.account_number || '').trim(),
        notes: String(item?.notes || '').trim(),
      }))
      .filter(item => item.label || item.account_name || item.account_number || item.notes)
  } catch {
    return []
  }
}

function buttonStateForCompetition(competition, sessionRole, enrollmentState) {
  if (!sessionRole) return { label: 'Quiero participar', tone: 'secondary', disabled: false }
  if (sessionRole !== 'user') return { label: 'Ir a mi panel', tone: 'secondary', disabled: false }
  if (enrollmentState === 'confirmado') return { label: 'Ya inscrito', tone: 'muted', disabled: true }
  if (enrollmentState === 'pendiente') return { label: 'Solicitud enviada', tone: 'muted', disabled: true }
  if (enrollmentState === 'rechazado') {
    if (!competition.enrollment_open) return { label: 'Inscripciones cerradas', tone: 'muted', disabled: true }
    return { label: 'Reintentar solicitud', tone: 'secondary', disabled: false }
  }
  if (!competition.enrollment_open) return { label: 'Inscripciones cerradas', tone: 'muted', disabled: true }
  return { label: 'Quiero participar', tone: 'secondary', disabled: false }
}

function ParticipationRequestModal({ competition, onClose, onSubmitted }) {
  const questions = useMemo(() => parseEnrollmentQuestions(competition?.enrollment_questions), [competition])
  const paymentMethods = useMemo(() => parseEnrollmentPaymentMethods(competition?.enrollment_payment_methods), [competition])
  const [categories, setCategories] = useState([])
  const [category, setCategory] = useState('')
  const [answers, setAnswers] = useState({})
  const [uploadingQuestionId, setUploadingQuestionId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!competition) return undefined
    let active = true
    setAnswers({})
    setMsg(null)
    api.get(`/competitions/${competition.id}/categories`)
      .then(({ data }) => {
        if (!active) return
        const items = Array.isArray(data) ? data : []
        setCategories(items)
        setCategory(items[0]?.nombre || '')
      })
      .catch(() => {
        if (!active) return
        setCategories([])
        setCategory('')
      })
    return () => {
      active = false
    }
  }, [competition])

  const uploadAnswerImage = async (question, file) => {
    if (!file) return
    setMsg(null)
    setUploadingQuestionId(question.id)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post('/enrollment-answers/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setAnswers(prev => ({ ...prev, [question.id]: data?.url || '' }))
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo subir la imagen' })
    } finally {
      setUploadingQuestionId(null)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!competition) return
    setMsg(null)
    setSaving(true)
    try {
      await api.post(`/competitions/${competition.id}/enroll`, {
        categoria: category || null,
        answers: questions.map(question => ({
          question_id: question.id,
          question_label: question.label,
          question_type: question.field_type || 'text',
          answer: answers[question.id] || '',
        })),
      })
      onSubmitted()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo confirmar la participacion' })
    } finally {
      setSaving(false)
    }
  }

  if (!competition) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(20px + env(safe-area-inset-top, 0px)) 12px calc(20px + env(safe-area-inset-bottom, 0px))' }}>
      <div style={{ width: '100%', maxWidth: 640, maxHeight: '100%', overflow: 'hidden', borderRadius: 24, background: '#171B21', border: '1px solid #252A33', boxShadow: '0 24px 80px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '18px 20px', borderBottom: '1px solid #252A33' }}>
          <div>
            <div style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 20 }}>Confirmar participacion</div>
            <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>{competition.nombre}</div>
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>Cerrar</button>
        </div>
        <form onSubmit={submit} style={{ padding: 20, overflowY: 'auto', display: 'grid', gap: 14 }}>
          {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
          <div style={{ color: '#AAB2C0', fontSize: 14, lineHeight: 1.6 }}>
            {competition.enrollment_intro_text?.trim()
              ? competition.enrollment_intro_text
              : 'Completa las preguntas del organizador y confirma tu participacion en esta competencia.'}
          </div>
          {paymentMethods.length > 0 && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase' }}>Metodos de pago</div>
              {paymentMethods.map((method) => (
                <div key={method.id} style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.6)', padding: 14 }}>
                  <div style={{ color: '#F5F7FA', fontWeight: 700, fontSize: 14 }}>{method.label || 'Metodo de pago'}</div>
                  {method.account_name && <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 6 }}>Titular: <b style={{ color: '#F5F7FA' }}>{method.account_name}</b></div>}
                  {method.account_number && <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>Cuenta: <b style={{ color: '#F5F7FA' }}>{method.account_number}</b></div>}
                  {method.notes && <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 6 }}>{method.notes}</div>}
                </div>
              ))}
            </div>
          )}
          {categories.length > 0 && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Categoria</label>
              <select value={category} onChange={e => setCategory(e.target.value)}>
                {categories.map(cat => <option key={cat.id} value={cat.nombre}>{cat.nombre}</option>)}
              </select>
            </div>
          )}
          {questions.map((question) => (
            <div key={question.id} className="form-group" style={{ marginBottom: 0 }}>
              <label>{question.label}{question.required ? ' *' : ''}</label>
              {question.field_type === 'image' ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => uploadAnswerImage(question, e.target.files?.[0])}
                    required={!!question.required && !answers[question.id]}
                  />
                  <div style={{ color: '#AAB2C0', fontSize: 12 }}>
                    {uploadingQuestionId === question.id
                      ? 'Subiendo imagen...'
                      : answers[question.id]
                        ? 'Imagen cargada correctamente.'
                        : (question.placeholder || 'Sube una imagen clara y legible.')}
                  </div>
                  {answers[question.id] && (
                    <a href={answers[question.id]} target="_blank" rel="noreferrer" style={{ color: '#00C2A8', fontSize: 12 }}>
                      Ver archivo cargado
                    </a>
                  )}
                </div>
              ) : (
                <input
                  value={answers[question.id] || ''}
                  onChange={e => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                  placeholder={question.placeholder || ''}
                  required={!!question.required}
                />
              )}
            </div>
          ))}
          {!questions.length && (
            <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.6)', padding: 14, color: '#AAB2C0', fontSize: 13 }}>
              Esta competencia no tiene preguntas adicionales. Solo debes confirmar tu participacion.
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Confirmando...' : 'Confirmar participacion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CompetitionCard({ competition, index, sessionRole, enrollmentState, onParticipate }) {
  const status = getCompetitionState(competition)
  const cta = buttonStateForCompetition(competition, sessionRole, enrollmentState)
  const bannerUrl = resolveCompetitionAsset(competition, 'banner')
  const profileImageUrl = resolveCompetitionAsset(competition, 'profile')

  return (
    <article
      style={{
        borderRadius: 24,
        overflow: 'hidden',
        border: '1px solid rgba(37,42,51,0.96)',
        background: '#171B21',
        boxShadow: '0 18px 60px rgba(0,0,0,0.28)',
      }}
    >
      <div
        style={{
          height: 220,
          padding: 20,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          ...cardVisualStyle(competition, index, bannerUrl),
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            borderRadius: 999,
            background: 'rgba(9,11,14,0.72)',
            border: `1px solid ${status.tone}66`,
            color: '#F5F7FA',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <Flame size={14} color={status.tone} />
          {status.label}
        </span>
        {!profileImageUrl && (
          <div
            aria-hidden="true"
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(9,11,14,0.68)',
              border: '1px solid rgba(245,247,250,0.16)',
              color: '#F5F7FA',
              fontFamily: 'Bebas Neue, sans-serif',
              fontSize: 28,
              letterSpacing: 1,
            }}
          >
            {(competition.nombre || 'FR').slice(0, 2).toUpperCase()}
          </div>
        )}
        {profileImageUrl && (
          <div
            aria-hidden="true"
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: `#0D0F12 url("${profileImageUrl}") center/cover no-repeat`,
              border: '1px solid rgba(245,247,250,0.16)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
            }}
          />
        )}
      </div>

      <div style={{ padding: 22, display: 'grid', gap: 14 }}>
        <div>
          <h3 style={{ margin: 0, color: '#F5F7FA', fontSize: 24, lineHeight: 1.05 }}>{competition.nombre}</h3>
          <p style={{ margin: '10px 0 0', color: '#AAB2C0', fontSize: 14, lineHeight: 1.6 }}>
            {truncate(competition.descripcion)}
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {competition.activa ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#F5F7FA', fontSize: 12 }}>
              <Trophy size={14} color="#FF6B00" />
              En competencia
            </span>
          ) : null}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#F5F7FA', fontSize: 12 }}>
            <CalendarDays size={14} color="#00C2A8" />
            {scheduleSummary(competition)}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#F5F7FA', fontSize: 12 }}>
            <Medal size={14} color="#D4A537" />
            Leaderboard publico
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link
            to={`/competitions/${competition.id}`}
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 16px',
              borderRadius: 14,
              background: 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)',
              color: '#0D0F12',
              fontWeight: 800,
            }}
          >
            Ver competencia
            <ArrowRight size={16} />
          </Link>
          <Link
            to={`/leaderboard/${competition.id}`}
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 16px',
              borderRadius: 14,
              border: '1px solid #252A33',
              background: 'transparent',
              color: '#F5F7FA',
              fontWeight: 700,
            }}
          >
            Ver leaderboard
          </Link>
          <button
            type="button"
            onClick={() => onParticipate(competition)}
            disabled={cta.disabled}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '11px 16px',
              borderRadius: 14,
              border: cta.tone === 'secondary' ? '1px solid #252A33' : '1px solid rgba(245,247,250,0.12)',
              background: cta.tone === 'muted' ? 'rgba(13,15,18,0.6)' : 'transparent',
              color: cta.tone === 'muted' ? '#7E8796' : '#F5F7FA',
              fontWeight: 700,
              cursor: cta.disabled ? 'not-allowed' : 'pointer',
              opacity: cta.disabled ? 0.9 : 1,
            }}
          >
            {cta.label}
          </button>
        </div>
      </div>
    </article>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const { session, role, participantId } = useAuth()
  const [competitions, setCompetitions] = useState([])
  const [myComps, setMyComps] = useState([])
  const [requestingCompetition, setRequestingCompetition] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([
      api.get('/competitions').catch(() => ({ data: [] })),
      role === 'user' && participantId
        ? api.get(`/participants/${participantId}/competitions`).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
    ])
      .then(([competitionsResponse, mineResponse]) => {
        if (!active) return
        setCompetitions(Array.isArray(competitionsResponse.data) ? competitionsResponse.data : [])
        setMyComps(Array.isArray(mineResponse.data) ? mineResponse.data : [])
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [participantId, role])

  const enrollmentByComp = useMemo(() => {
    const map = {}
    for (const competition of myComps) {
      map[competition.id] = competition.enrollment_estado || null
    }
    return map
  }, [myComps])

  const featuredCompetitions = useMemo(() => {
    return [...competitions]
      .sort((a, b) => {
        const stateDiff = getCompetitionState(a).weight - getCompetitionState(b).weight
        if (stateDiff !== 0) return stateDiff
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      })
      .slice(0, 6)
  }, [competitions])

  const handleParticipate = (competition) => {
    if (!session) {
      navigate('/login')
      return
    }
    if (role !== 'user') {
      navigate(getHomePath(role))
      return
    }
    if (enrollmentByComp[competition.id] && enrollmentByComp[competition.id] !== 'rechazado') return
    if (!competition.enrollment_open) return
    setRequestingCompetition(competition)
  }

  const handleSubmitted = async () => {
    setRequestingCompetition(null)
    if (role === 'user' && participantId) {
      try {
        const { data } = await api.get(`/participants/${participantId}/competitions`)
        setMyComps(Array.isArray(data) ? data : [])
      } catch {
        // keep current state if refresh fails
      }
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: pageBg, color: '#F5F7FA' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 18px 72px' }}>
        {requestingCompetition && (
          <ParticipationRequestModal
            competition={requestingCompetition}
            onClose={() => setRequestingCompetition(null)}
            onSubmitted={handleSubmitted}
          />
        )}

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.3fr) minmax(280px, 0.7fr)',
            gap: 18,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              borderRadius: 28,
              padding: '28px 24px',
              background: 'linear-gradient(135deg, rgba(255,107,0,0.18), rgba(255,154,61,0.08) 45%, rgba(23,27,33,0.96) 100%)',
              border: '1px solid rgba(255,107,0,0.24)',
            }}
          >
            <div style={{ color: '#00C2A8', fontSize: 12, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase' }}>
              Competencias activas
            </div>
            <h1 style={{ margin: '10px 0 12px', fontSize: 'clamp(34px, 6vw, 64px)', lineHeight: 0.95 }}>
              Encuentra tu proximo reto.
            </h1>
            <p style={{ maxWidth: 720, margin: 0, color: '#AAB2C0', fontSize: 16, lineHeight: 1.7 }}>
              Mira los eventos disponibles, revisa fechas, conoce el formato general y entra al leaderboard de cada competencia.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
              <Link
                to="/leaderboard"
                style={{
                  textDecoration: 'none',
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(37,42,51,0.92)',
                  color: '#F5F7FA',
                  fontWeight: 700,
                  background: 'rgba(13,15,18,0.3)',
                }}
              >
                Ver leaderboard
              </Link>
              <Link
                to={session ? getHomePath(session.role) : '/login'}
                style={{
                  textDecoration: 'none',
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)',
                  color: '#0D0F12',
                  fontWeight: 800,
                }}
              >
                {session ? 'Ir a mi panel' : 'Ingresar'}
              </Link>
            </div>
          </div>

          <div
            style={{
              borderRadius: 28,
              padding: '24px 22px',
              background: 'rgba(23,27,33,0.94)',
              border: '1px solid #252A33',
              display: 'grid',
              gap: 14,
              alignContent: 'start',
            }}
          >
            <div style={{ fontSize: 12, color: '#00C2A8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2 }}>
              Acceso rapido
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>Eventos destacados y entrada directa al ranking.</div>
            <div style={{ color: '#AAB2C0', fontSize: 14, lineHeight: 1.6 }}>
              Si eres participante, el boton de cada tarjeta abre la solicitud real de inscripcion con preguntas del organizador.
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'end', marginBottom: 18, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 28 }}>Competencias actuales</h2>
              <p style={{ margin: '6px 0 0', color: '#AAB2C0', fontSize: 14 }}>
                Selecciona una competencia para ver su panorama general y seguir su leaderboard.
              </p>
            </div>
          </div>

          {loading ? (
            <div style={{ color: '#AAB2C0', fontSize: 14 }}>Cargando competencias...</div>
          ) : featuredCompetitions.length ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 18,
              }}
            >
              {featuredCompetitions.map((competition, index) => (
                <CompetitionCard
                  key={competition.id}
                  competition={competition}
                  index={index}
                  sessionRole={role}
                  enrollmentState={enrollmentByComp[competition.id]}
                  onParticipate={handleParticipate}
                />
              ))}
            </div>
          ) : (
            <div
              style={{
                borderRadius: 22,
                padding: 24,
                background: 'rgba(23,27,33,0.94)',
                border: '1px solid #252A33',
                color: '#AAB2C0',
              }}
            >
              Todavia no hay competencias visibles en este momento.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
