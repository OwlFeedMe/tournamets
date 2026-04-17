import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, ChevronDown, ChevronRight, ChevronUp, Globe, Info, Instagram, MapPin, Medal, MessageCircle, Phone, ShieldCheck, Users, Youtube } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api/axios'
import { getHomePath, useAuth } from '../context/AuthContext'
import { COMPETITION_PAGE_MAX_WIDTH } from '../utils/competitionLayout'
import { getReadableTextColor, hexToRgba, resolveCompetitionTheme } from '../utils/competitionTheme'
import { getMissingParticipantProfileFields } from '../utils/participantProfile'

function buildPageBackground(theme) {
  return `radial-gradient(circle at top, ${hexToRgba(theme.primary, 0.18)}, transparent 28%), radial-gradient(circle at 85% 20%, ${hexToRgba(theme.accent, 0.12)}, transparent 24%), ${theme.background}`
}

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function formatDateRange(start, end) {
  const startLabel = formatDate(start)
  const endLabel = formatDate(end)
  if (!startLabel && !endLabel) return 'Fechas por confirmar'
  if (!startLabel) return `Hasta ${endLabel}`
  if (!endLabel) return `Desde ${startLabel}`
  return `${startLabel} - ${endLabel}`
}

function normalizeEnrollmentPrice(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.round(parsed))
}

function calculateEnrollmentPricing(basePrice, feeRate = 0.05) {
  const organizerPrice = normalizeEnrollmentPrice(basePrice)
  const platformFee = Math.round(organizerPrice * feeRate)
  return {
    organizerPrice,
    platformFee,
    totalPrice: organizerPrice + platformFee,
  }
}

function formatCop(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function splitCategoryDescription(raw) {
  const text = String(raw || '').trim()
  if (!text) return { shortDescription: '', longDescription: '' }
  const parts = text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean)
  if (parts.length <= 1) {
    return { shortDescription: text, longDescription: '' }
  }
  return {
    shortDescription: parts[0],
    longDescription: parts.slice(1).join('\n\n'),
  }
}

function parseLandingSections(raw) {
  if (!raw) return null
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const normalizeItems = (items) => (Array.isArray(items) ? items : [])
      .map((item, idx) => ({
        id: String(item?.id || `item_${idx + 1}`),
        title: String(item?.title || '').trim(),
        body: String(item?.body || '').trim(),
      }))
      .filter(item => item.title || item.body)
    return {
      experience: {
        title: String(parsed?.experience?.title || '').trim(),
        intro: String(parsed?.experience?.intro || '').trim(),
        items: normalizeItems(parsed?.experience?.items),
      },
      format: {
        title: String(parsed?.format?.title || '').trim(),
        items: normalizeItems(parsed?.format?.items),
      },
      highlights: {
        title: String(parsed?.highlights?.title || '').trim(),
        items: normalizeItems(parsed?.highlights?.items),
      },
    }
  } catch {
    return null
  }
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
        phase_id: item?.phase_id != null ? String(item.phase_id) : '',
        use_phase_dates: Number(item?.use_phase_dates || 0),
        start_at: item?.start_at || null,
        end_at: item?.end_at || null,
        note: String(item?.note || '').trim(),
      }))
      .filter(item => item.label || item.start_at || item.end_at || item.note || item.phase_id)
  } catch {
    return []
  }
}

function resolveScheduleItemsWithPhases(items, phases) {
  const phaseMap = new Map((phases || []).map(phase => [String(phase.id), phase]))
  return (items || []).map(item => {
    const linkedPhase = item.phase_id ? phaseMap.get(String(item.phase_id)) : null
    if (!linkedPhase || !item.use_phase_dates) {
      return { ...item, linked_phase_name: linkedPhase?.nombre || '' }
    }
    return {
      ...item,
      start_at: linkedPhase.start_at || item.start_at || null,
      end_at: linkedPhase.end_at || item.end_at || null,
      linked_phase_name: linkedPhase.nombre || '',
    }
  })
}

function parseDateValue(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getNextMilestone(items) {
  const now = new Date()
  return (items || [])
    .map(item => ({ ...item, parsedStart: parseDateValue(item.start_at), parsedEnd: parseDateValue(item.end_at) }))
    .filter(item => item.parsedStart || item.parsedEnd)
    .sort((a, b) => {
      const aTime = (a.parsedStart || a.parsedEnd)?.getTime?.() || 0
      const bTime = (b.parsedStart || b.parsedEnd)?.getTime?.() || 0
      return aTime - bTime
    })
    .find(item => {
      const end = item.parsedEnd || item.parsedStart
      return end && end.getTime() >= now.getTime()
    }) || null
}

function getStatusLabel(competition, theme) {
  if (competition?.enrollment_open) return { label: 'Inscripciones abiertas', tone: theme.accent }
  if (competition?.activa) return { label: 'Competencia activa', tone: theme.primary }
  return { label: 'Proximamente', tone: theme.textSecondary }
}

function getCompetitionMode(config) {
  const individual = !!config?.individual_enabled
  const teams = !!config?.team_enabled
  if (individual && teams) return { id: 'mixed', label: 'Individual + Equipos' }
  if (teams) return { id: 'teams', label: 'Por equipos' }
  return { id: 'individual', label: 'Individual' }
}

function enrollmentButtonState(competition, isAthlete, enrollmentState) {
  if (!isAthlete) return { label: 'Quiero participar', disabled: false }
  if (enrollmentState === 'confirmado') return { label: 'Ya inscrito', disabled: true }
  if (enrollmentState === 'pendiente') return { label: 'Inscripcion en proceso', disabled: true }
  if (enrollmentState === 'rechazado') {
    if (!competition?.enrollment_open) return { label: 'Inscripciones cerradas', disabled: true }
    return { label: 'Reintentar inscripcion', disabled: false }
  }
  if (!competition?.enrollment_open) return { label: 'Inscripciones cerradas', disabled: true }
  return { label: 'Inscribirme ahora', disabled: false }
}

function modalityLabel(modality) {
  return modality === 'teams' ? 'Equipos' : 'Individual'
}

function phaseStateLabel(state) {
  if (state === 'finalizada') return 'Finalizada'
  if (state === 'en_progreso') return 'En progreso'
  return 'Pendiente'
}

function phaseFormatLabel(phase) {
  const activityCount = Array.isArray(phase?.activities) && phase.activities.length ? phase.activities.length : 1
  return activityCount === 1 ? '1 actividad' : `${activityCount} actividades`
}

function socialIconForLabel(label = '', url = '') {
  const value = `${label} ${url}`.toLowerCase()
  if (value.includes('instagram')) return Instagram
  if (value.includes('whatsapp') || value.includes('wa.me')) return MessageCircle
  if (value.includes('youtube') || value.includes('youtu.be')) return Youtube
  return Globe
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

function getContactChipStyle(theme) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    justifySelf: 'stretch',
    width: '100%',
    minWidth: 0,
    padding: '8px 10px',
    borderRadius: 999,
    background: hexToRgba(theme.background, 0.62),
    border: `1px solid ${theme.border}`,
    color: theme.text,
    fontSize: 12,
    fontWeight: 700,
    textDecoration: 'none',
    maxWidth: '100%',
  }
}

function InterestNotificationModal({ open, onClose, onSubmit, email, onEmailChange, busy, theme }) {
  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(0,0,0,0.76)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'calc(18px + env(safe-area-inset-top, 0px)) 12px calc(18px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div
        className="fr-cut-card"
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '100%',
          overflow: 'hidden',
          border: `1px solid ${theme.border}`,
          background: '#171B21',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '18px 20px',
            borderBottom: `1px solid ${theme.border}`,
            background: '#171B21',
          }}
        >
          <div>
            <div style={{ color: theme.text, fontSize: 18, fontWeight: 800 }}>Activa el aviso</div>
            <div style={{ marginTop: 6, color: theme.textSecondary, fontSize: 13, lineHeight: 1.5 }}>
              Te escribiremos cuando abran las inscripciones.
            </div>
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            Cerrar
          </button>
        </div>
        <form onSubmit={onSubmit} style={{ padding: 20, overflowY: 'auto', display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={{ color: theme.text, fontSize: 13, fontWeight: 700 }}>Correo</span>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="tuemail@correo.com"
              autoComplete="email"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '12px 16px',
              borderRadius: 6,
              border: 'none',
              background: 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)',
              color: '#0D0F12',
              fontWeight: 800,
              width: '100%',
            }}
          >
            {busy ? 'Guardando...' : 'Guardar aviso'}
          </button>
        </form>
      </div>
    </div>
  )
}

function PhasesbyDay({ phases, categories, theme, hexToRgba, isMobile }) {
  const [selectedCatId, setSelectedCatId] = useState({})

  function getBaseActivities(phase) {
    return (phase.activities || []).filter((activity) => !activity._cat)
  }

  function getWodForCategory(phase, catId) {
    if (!catId) return null
    return (phase.activities || []).find((activity) => String(activity._cat) === String(catId)) || null
  }

  if (!phases.length) {
    return (
      <div>
        <div style={{ color: theme.accent, fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>Programacion</div>
        <h2 style={{ margin: '8px 0 0', fontSize: isMobile ? 24 : 28, lineHeight: 1.05 }}>Eventos y workouts</h2>
        <div style={{ color: theme.textSecondary, fontSize: 14, marginTop: 14 }}>Todavia no hay eventos publicados para esta competencia.</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ color: theme.accent, fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>Programacion</div>
      <h2 style={{ margin: '8px 0 16px', fontSize: isMobile ? 24 : 28, lineHeight: 1.05 }}>Eventos y workouts</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {phases.map((phase) => {
          const catId = selectedCatId[phase.id] ?? null
          const baseActivities = getBaseActivities(phase)
          const hasPartB = baseActivities.length > 1
          const catOverride = catId ? getWodForCategory(phase, catId) : null
          const wodA = catOverride?.descripcion ?? baseActivities[0]?.descripcion ?? null
          const wodB = catOverride?.part_b_descripcion ?? baseActivities[1]?.descripcion ?? null

          return (
            <div key={phase.id} className="fr-cut-card" style={{ border: `1px solid ${hexToRgba(theme.primary, 0.24)}`, background: hexToRgba(theme.background, 0.58), overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: isMobile ? '12px 14px' : '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
                  <span style={{ color: '#F5F7FA', fontSize: isMobile ? 15 : 16, fontWeight: 800, lineHeight: 1.25 }}>{phase.nombre}</span>
                  {categories.length > 0 && (
                    <div style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
                      <select
                        value={catId ?? ''}
                        onChange={(event) => setSelectedCatId((prev) => ({ ...prev, [phase.id]: event.target.value === '' ? null : event.target.value }))}
                        style={{
                          appearance: 'none',
                          WebkitAppearance: 'none',
                          background: catId ? hexToRgba(theme.primary, 0.14) : hexToRgba(theme.accent, 0.1),
                          border: catId ? `1px solid ${hexToRgba(theme.primary, 0.5)}` : `1px solid ${hexToRgba(theme.accent, 0.45)}`,
                          borderRadius: 999,
                          color: catId ? '#FFD0AE' : '#D9FFFA',
                          padding: '4px 28px 4px 12px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          width: 'auto',
                        }}
                      >
                        <option value="" style={{ background: '#171B21', color: '#F5F7FA' }}>Base</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id} style={{ background: '#171B21', color: '#F5F7FA' }}>{cat.nombre}</option>
                        ))}
                      </select>
                      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'inline-flex', alignItems: 'center', color: catId ? '#FFD0AE' : '#D9FFFA' }}>
                        <ChevronDown size={12} />
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ padding: isMobile ? '0 14px 14px' : '0 18px 18px', display: 'grid', gap: 12 }}>
                {wodA ? (
                  <div style={{ borderRadius: 12, border: `1px solid ${hexToRgba(theme.accent, 0.2)}`, background: hexToRgba(theme.accent, 0.06), padding: '10px 14px' }}>
                    {hasPartB ? <div style={{ fontSize: 11, fontWeight: 800, color: theme.accent, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Parte A</div> : null}
                    <div style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{wodA}</div>
                  </div>
                ) : null}

                {hasPartB && wodB ? (
                  <div style={{ borderRadius: 12, border: `1px solid ${hexToRgba(theme.primary, 0.2)}`, background: hexToRgba(theme.primary, 0.05), padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: theme.primary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Parte B</div>
                    <div style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{wodB}</div>
                  </div>
                ) : null}

                {!wodA && !wodB ? (
                  <div style={{ color: theme.textSecondary, fontSize: 13 }}>WOD por publicar.</div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
export default function CompetitionLanding() {
  const { competitionId } = useParams()
  const navigate = useNavigate()
  const { session, role, participantId, isAthlete } = useAuth()
  const [ctaBusy, setCtaBusy] = useState(false)
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [myEnrollmentState, setMyEnrollmentState] = useState('')
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const [expandedCategoryKey, setExpandedCategoryKey] = useState('')
  const [interestBusy, setInterestBusy] = useState(false)
  const [interestModalOpen, setInterestModalOpen] = useState(false)
  const [interestEmail, setInterestEmail] = useState('')
  const [interestMsg, setInterestMsg] = useState(null)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    document.body.classList.toggle('fr-modal-open', interestModalOpen)
    return () => document.body.classList.remove('fr-modal-open')
  }, [interestModalOpen])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api.get(`/competitions/${competitionId}/public`)
      .then(({ data }) => {
        if (!active) return
        setPayload(data || null)
      })
      .catch((err) => {
        if (!active) return
        setError(err.response?.data?.detail || 'No se pudo cargar la competencia')
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [competitionId])

  useEffect(() => {
    let active = true
    setMyEnrollmentState('')
    if (!session || !isAthlete || !participantId) {
      return () => {
        active = false
      }
    }
    api.get(`/participants/${participantId}/competitions`)
      .then(({ data }) => {
        if (!active) return
        const current = Array.isArray(data) ? data.find(item => String(item?.id) === String(competitionId)) : null
        setMyEnrollmentState(String(current?.enrollment_estado || '').trim().toLowerCase())
      })
      .catch(() => {
        if (!active) return
        setMyEnrollmentState('')
      })
    return () => {
      active = false
    }
  }, [competitionId, isAthlete, participantId, role, session])

  const competition = payload?.competition || null
  const theme = useMemo(() => resolveCompetitionTheme(competition), [competition])
  const pageBg = useMemo(() => buildPageBackground(theme), [theme])
  const primaryTextColor = useMemo(() => getReadableTextColor(theme.primary), [theme.primary])
  const contactChipStyle = useMemo(() => getContactChipStyle(theme), [theme])
  const categories = useMemo(() => payload?.categories || [], [payload])
  const categoriesByModality = useMemo(
    () => payload?.categories_by_modality || { individual: [], teams: [] },
    [payload]
  )
  const modalityConfig = payload?.modality_config || null
  const competitionMode = getCompetitionMode(modalityConfig)
  const phases = useMemo(
    () => (payload?.phases || []).filter(phase => Number(phase?.is_visible == null ? 1 : phase.is_visible)),
    [payload]
  )
  const scheduleItems = useMemo(
    () => resolveScheduleItemsWithPhases(parseScheduleItems(competition?.schedule_items), phases),
    [competition, phases]
  )
  const nextMilestone = useMemo(() => getNextMilestone(scheduleItems), [scheduleItems])
  const stats = payload?.stats || {}
  const status = getStatusLabel(competition, theme)
  const socialLinks = useMemo(() => {
    try {
      const parsed = typeof competition?.social_links === 'string' ? JSON.parse(competition.social_links) : (competition?.social_links || [])
      return Array.isArray(parsed) ? parsed.filter(item => item?.label || item?.url) : []
    } catch {
      return []
    }
  }, [competition])
  const hasContactInfo = !!(competition?.contact_phone || competition?.website_url || socialLinks.length)
  const bannerUrl = resolveCompetitionAsset(competition, 'banner')
  const profileImageUrl = resolveCompetitionAsset(competition, 'profile')
  const platformFeeRate = Number(competition?.platform_fee_rate || 0.05)
  const categoryPricingSummary = useMemo(() => {
    const valid = categories
      .map(category => ({
        category,
        pricing: calculateEnrollmentPricing(category?.enrollment_price, platformFeeRate),
      }))
      .filter(item => item.pricing.organizerPrice > 0)
    if (!valid.length) return null
    const totals = valid.map(item => item.pricing.totalPrice)
    return {
      min: Math.min(...totals),
      max: Math.max(...totals),
    }
  }, [categories, platformFeeRate])
  const overviewText = (competition?.general_info_text || competition?.descripcion || '').trim()
  const registerHref = competition ? `/competitions/${competition.id}/register` : '/login'
  const scheduleHref = competition ? `/competitions/${competition.id}/schedule` : '/login'
  const myScheduleHref = competition ? `/competitions/${competition.id}/my-schedule` : '/login'
  const competitionStartDate = useMemo(
    () => parseDateValue(competition?.competition_start || competition?.enrollment_start),
    [competition]
  )
  const isUpcomingCompetition = !!(competitionStartDate && competitionStartDate.getTime() > Date.now())
  const canSeeMySchedule = !!(session && participantId && myEnrollmentState === 'confirmado')
  const enrollmentButton = enrollmentButtonState(competition, isAthlete, myEnrollmentState)
  const secondaryCtaHref = !session ? '/login' : isAthlete ? registerHref : getHomePath(role)
  const secondaryCtaLabel = enrollmentButton.label
  const engagementCta = competition?.enrollment_open
    ? { mode: 'enroll', label: secondaryCtaLabel }
    : isUpcomingCompetition
      ? { mode: 'notify_open', label: 'Notificarme cuando abra' }
      : { mode: 'notify_organizer', label: 'Notificarme de nuevos eventos' }
  const heroHighlights = [
    `${stats.fases_total || phases.length || 0} eventos`,
    `${stats.categorias_total || categories.length || 0} categorias`,
    competitionMode.label,
  ]
  const interestNotificationType = engagementCta.mode === 'notify_open' ? 'open_enrollment' : 'organizer_updates'
  const interestSuccessText = engagementCta.mode === 'notify_open'
    ? 'Aviso guardado. Te escribiremos cuando abran las inscripciones.'
    : 'Aviso guardado. Te escribiremos cuando publiquen novedades de esta competencia.'

  const handleEnrollmentClick = async () => {
    if (!session) {
      navigate(secondaryCtaHref)
      return
    }
    if (!isAthlete) {
      navigate(getHomePath(role))
      return
    }
    if (enrollmentButton.disabled || !competition?.enrollment_open) return
    setCtaBusy(true)
    try {
      const { data } = await api.get('/participants/me')
      const missingFields = getMissingParticipantProfileFields(data)
      if (missingFields.length) {
        navigate('/profile', {
          state: {
            profileRequiredForEnrollment: true,
            missingFields,
            competitionName: competition?.nombre || '',
          },
        })
        return
      }
      navigate(registerHref)
    } catch {
      navigate('/profile', {
        state: {
          profileRequiredForEnrollment: true,
          missingFields: ['perfil'],
          competitionName: competition?.nombre || '',
        },
      })
    } finally {
      setCtaBusy(false)
    }
  }

  const saveInterestNotification = async (email = '') => {
    if (!competition?.id) return
    setInterestBusy(true)
    setInterestMsg(null)
    try {
      const { data } = await api.post(`/competitions/${competition.id}/interest-notifications`, {
        email: email || undefined,
        notification_type: interestNotificationType,
      })
      setInterestMsg({
        type: 'success',
        text: data?.already_exists ? 'Ese aviso ya estaba guardado.' : interestSuccessText,
      })
      setInterestModalOpen(false)
      setInterestEmail('')
    } catch (err) {
      setInterestMsg({
        type: 'error',
        text: err.response?.data?.detail || 'No pudimos guardar el aviso.',
      })
    } finally {
      setInterestBusy(false)
    }
  }

  const handleInterestNotificationClick = async () => {
    if (session && participantId) {
      await saveInterestNotification()
      return
    }
    setInterestMsg(null)
    setInterestModalOpen(true)
  }

  const handleInterestEmailSubmit = async (event) => {
    event.preventDefault()
    await saveInterestNotification(interestEmail)
  }

  return (
    <div style={{ minHeight: '100vh', background: pageBg, color: theme.text }}>
      <div style={{ maxWidth: COMPETITION_PAGE_MAX_WIDTH, margin: '0 auto', padding: isMobile ? '16px 14px 56px' : '24px 24px 72px' }}>
        {loading ? (
          <div style={{ color: theme.textSecondary, fontSize: 14 }}>Cargando competencia...</div>
        ) : error ? (
          <div className="fr-cut-card" style={{ padding: 24, background: hexToRgba(theme.surface, 0.94), border: `1px solid ${theme.border}`, color: theme.text }}>
            {error}
          </div>
        ) : competition ? (
          <>
            <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '0.72fr 1.28fr', gap: 14, marginBottom: 18 }}>
              <div
                className="fr-cut-card"
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  minHeight: isMobile ? 280 : 520,
                  height: isMobile ? 'auto' : '100%',
                  aspectRatio: isMobile ? '1 / 1' : undefined,
                  border: `1px solid ${hexToRgba(theme.border, 0.96)}`,
                  background: profileImageUrl
                    ? `linear-gradient(180deg, ${hexToRgba(theme.background, 0.14)}, ${hexToRgba(theme.background, 0.72)}), url("${profileImageUrl}") center/cover`
                    : bannerUrl
                    ? `linear-gradient(180deg, ${hexToRgba(theme.background, 0.18)}, ${hexToRgba(theme.background, 0.82)}), url("${bannerUrl}") center/cover`
                    : `linear-gradient(135deg, ${hexToRgba(theme.primary, 0.22)}, ${hexToRgba(theme.accent, 0.12)} 55%, ${hexToRgba(theme.surface, 0.98)} 100%)`,
                  boxShadow: '0 20px 70px rgba(0,0,0,0.28)',
                }}
              >
                <div style={{ position: 'absolute', inset: 'auto 16px 16px 16px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: hexToRgba(theme.background, 0.72), border: `1px solid ${status.tone}66`, color: theme.text, fontSize: 12, fontWeight: 800 }}>
                    <ShieldCheck size={14} color={status.tone} />
                    {status.label}
                  </span>
                </div>
              </div>

              <div className="fr-cut-card" style={{ border: `1px solid ${theme.border}`, background: theme.surface, padding: isMobile ? 20 : 28, display: 'flex', flexDirection: 'column', gap: 18, minHeight: isMobile ? 'auto' : 520 }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: hexToRgba(theme.background, 0.72), border: `1px solid ${hexToRgba(theme.primary, 0.28)}`, color: theme.text, fontSize: 12, fontWeight: 800 }}>
                      <Users size={14} color={theme.primary} />
                      {competitionMode.label}
                    </span>
                    {modalityConfig?.team_enabled ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: hexToRgba(theme.background, 0.72), border: `1px solid ${hexToRgba(theme.accent, 0.28)}`, color: theme.text, fontSize: 12, fontWeight: 700 }}>
                        Equipos de {modalityConfig?.team_size || 2}
                      </span>
                    ) : null}
                  </div>
                  <h1 style={{ margin: 0, fontSize: isMobile ? 34 : 'clamp(42px, 6vw, 72px)', lineHeight: 0.92, wordBreak: 'break-word' }}>
                    {competition.nombre}
                  </h1>
                  <div className="fr-cut-card" style={{ border: `1px solid ${theme.border}`, background: hexToRgba(theme.background, 0.58), padding: isMobile ? 16 : 18, marginTop: 18 }}>
                    <div style={{ color: theme.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1 }}>Descripcion</div>
                    <div style={{ marginTop: 10, color: theme.text, fontSize: 14, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                      {overviewText || (competition.descripcion || '').trim() || 'Esta competencia ya tiene pagina publica. Aqui podras revisar su panorama general y entrar al leaderboard.'}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                    {heroHighlights.map((item) => (
                      <div key={item} className="fr-cut-card" style={{ border: `1px solid ${theme.border}`, background: hexToRgba(theme.background, 0.58), padding: 16 }}>
                        <div style={{ color: theme.textSecondary, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Dato clave</div>
                        <div style={{ marginTop: 8, color: theme.text, fontSize: 18, fontWeight: 800, lineHeight: 1.25 }}>{item}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 18 }}>
              <div className="fr-cut-card" style={{ border: `1px solid ${theme.border}`, background: theme.surface, padding: 18 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: theme.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                  <MapPin size={14} />
                  Lugar
                </div>
                <div style={{ marginTop: 10, fontSize: isMobile ? 20 : 22, fontWeight: 800, lineHeight: 1.25, wordBreak: 'break-word' }}>{competition.lugar || 'Por confirmar'}</div>
              </div>
              <div className="fr-cut-card" style={{ border: `1px solid ${theme.border}`, background: theme.surface, padding: 18 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: theme.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                  <CalendarDays size={14} />
                  Fechas
                </div>
                <div style={{ marginTop: 10, fontSize: isMobile ? 16 : 18, fontWeight: 800, lineHeight: 1.45 }}>
                  {formatDateRange(competition.competition_start || competition.enrollment_start, competition.competition_end || competition.enrollment_end)}
                </div>
              </div>
              <div className="fr-cut-card" style={{ border: `1px solid ${theme.border}`, background: theme.surface, padding: 18 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: theme.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                  <Medal size={14} />
                  Formato
                </div>
                <div style={{ marginTop: 10, fontSize: 18, fontWeight: 800, lineHeight: 1.35 }}>
                  {competitionMode.label}
                </div>
                <div style={{ marginTop: 6, color: theme.textSecondary, fontSize: 13 }}>
                  {stats.categorias_total || 0} categorias y {stats.fases_total || 0} fases
                </div>
              </div>
              <div className="fr-cut-card" style={{ border: `1px solid ${theme.border}`, background: theme.surface, padding: 18 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: theme.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                  <Phone size={14} />
                  Contacto
                </div>
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  {competition.contact_phone ? (
                    <span style={contactChipStyle} title={competition.contact_phone}>
                      <Phone size={13} color={theme.accent} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {competition.contact_phone}
                      </span>
                    </span>
                  ) : null}
                  {competition.website_url ? (
                    <a href={competition.website_url} target="_blank" rel="noreferrer" style={contactChipStyle} title={competition.website_url}>
                      <Globe size={13} color={theme.accent} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {competition.website_url}
                      </span>
                    </a>
                  ) : null}
                  {socialLinks.length ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {socialLinks.slice(0, 2).map((item) => {
                        const Icon = socialIconForLabel(item.label, item.url)
                        const chipLabel = item.label || item.url
                        return (
                          <a
                            key={`main-contact-${item.id || `${item.label}-${item.url}`}`}
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            style={contactChipStyle}
                            title={chipLabel}
                          >
                            <Icon size={13} color={theme.accent} />
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {chipLabel}
                            </span>
                          </a>
                        )
                      })}
                    </div>
                  ) : null}
                  {!competition.contact_phone && !competition.website_url ? (
                    <div style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 1.5 }}>
                      {socialLinks.length ? 'Canales sociales disponibles.' : 'Canales por confirmar'}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <section
              className="fr-cut-card"
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1.05fr 0.95fr',
                gap: 14,
                border: '1px solid rgba(212,165,55,0.18)',
                background: `linear-gradient(135deg, rgba(212,165,55,0.12) 0%, rgba(201,173,107,0.08) 24%, ${hexToRgba(theme.surface, 0.98)} 56%, ${hexToRgba(theme.background, 0.98)} 100%)`,
                boxShadow: '0 22px 70px rgba(0,0,0,0.22)',
                padding: isMobile ? 18 : 24,
                marginBottom: 18,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 18 }}>
                <div>
                  <div style={{ color: '#E8D79B', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                    Vive la competencia
                  </div>
                  <h2 style={{ margin: '8px 0 0', fontSize: isMobile ? 30 : 44, lineHeight: 0.95, maxWidth: 520 }}>
                    {engagementCta.mode === 'enroll'
                      ? 'Asegura tu lugar y sigue cada corte del evento.'
                      : engagementCta.mode === 'notify_open'
                        ? 'Activa el aviso y entra apenas se abra el registro.'
                        : 'Sigue este evento y enterate cuando este organizador publique el siguiente.'}
                  </h2>
                  <div style={{ marginTop: 14, maxWidth: 560, color: theme.textSecondary, fontSize: 15, lineHeight: 1.7 }}>
                    {engagementCta.mode === 'enroll'
                      ? 'Consulta calendario, revisa el leaderboard y entra a la competencia desde un solo bloque.'
                      : engagementCta.mode === 'notify_open'
                        ? 'Mientras llega la apertura, puedes seguir el calendario y dejar listo el aviso desde tus notificaciones.'
                        : 'Las inscripciones ya cerraron. Mantente cerca del organizer y recibe aviso cuando vuelva a publicar.'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link
                    to={scheduleHref}
                    style={{
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '12px 16px',
                      borderRadius: 6,
                      border: '1px solid rgba(212,165,55,0.24)',
                      background: 'rgba(212,165,55,0.08)',
                      color: theme.text,
                      fontWeight: 800,
                    }}
                  >
                    Ver cronograma
                  </Link>
                  <a
                    href={`/leaderboard/${competition.id}`}
                    style={{
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '12px 16px',
                      borderRadius: 6,
                      border: '1px solid rgba(212,165,55,0.18)',
                      background: hexToRgba(theme.background, 0.58),
                      color: theme.text,
                      fontWeight: 800,
                    }}
                  >
                    Ver leaderboard
                  </a>
                </div>
              </div>

              <div className="fr-cut-card" style={{ border: '1px solid rgba(212,165,55,0.22)', background: 'linear-gradient(135deg, rgba(212,165,55,0.12), rgba(201,173,107,0.07) 26%, rgba(255,255,255,0.02) 100%)', padding: isMobile ? 18 : 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ color: '#E8D79B', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                      Rango de inscripcion
                    </div>
                    <div style={{ marginTop: 8, color: '#FFF2C7', fontSize: isMobile ? 34 : 48, fontWeight: 800, lineHeight: 0.94 }}>
                      {categoryPricingSummary
                        ? (categoryPricingSummary.min === categoryPricingSummary.max
                          ? formatCop(categoryPricingSummary.min)
                          : `${formatCop(categoryPricingSummary.min)} - ${formatCop(categoryPricingSummary.max)}`)
                        : 'Por confirmar'}
                    </div>
                    <div style={{ marginTop: 8, color: '#D7C895', fontSize: 13, fontWeight: 700 }}>
                      COP / atleta
                    </div>
                  </div>
                  <div style={{ width: 44, height: 44, borderRadius: 6, background: 'rgba(212,165,55,0.14)', border: '1px solid rgba(212,165,55,0.26)', display: 'grid', placeItems: 'center', color: '#F4D97A' }}>
                    <Medal size={18} />
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
                  <div style={{ color: '#F5F7FA', fontSize: 14, lineHeight: 1.55 }}>
                    {categoryPricingSummary
                      ? 'El valor cambia segun la categoria publicada para esta competencia.'
                      : 'Los valores de inscripcion se publicaran junto con las categorias.'}
                  </div>
                  <div style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 1.55 }}>
                    {engagementCta.mode === 'enroll'
                      ? 'Si tu categoria ya esta abierta, puedes iniciar tu registro desde aqui.'
                      : engagementCta.mode === 'notify_open'
                        ? 'Activa el aviso y vuelve apenas se publique la apertura de inscripciones.'
                        : 'Activa el aviso y te enteraras cuando este organizer publique nuevas competencias.'}
                  </div>
                  {engagementCta.mode === 'enroll' ? (
                    <button
                      type="button"
                      onClick={handleEnrollmentClick}
                      disabled={enrollmentButton.disabled || ctaBusy}
                      style={{
                        marginTop: 6,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '12px 16px',
                        borderRadius: 6,
                        cursor: enrollmentButton.disabled || ctaBusy ? 'not-allowed' : 'pointer',
                        border: 'none',
                        background: 'linear-gradient(135deg, #F7E7AA 0%, #D4A537 100%)',
                        color: '#1A1407',
                        fontWeight: 800,
                        pointerEvents: enrollmentButton.disabled || ctaBusy ? 'none' : 'auto',
                        opacity: enrollmentButton.disabled ? 0.65 : 1,
                        appearance: 'none',
                        width: 'auto',
                        alignSelf: 'flex-start',
                        justifySelf: 'start',
                      }}
                    >
                      {ctaBusy ? 'Validando perfil...' : secondaryCtaLabel}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleInterestNotificationClick}
                      disabled={interestBusy}
                      style={{
                        marginTop: 6,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '12px 16px',
                        borderRadius: 6,
                        cursor: interestBusy ? 'wait' : 'pointer',
                        border: 'none',
                        background: 'linear-gradient(135deg, #F7E7AA 0%, #D4A537 100%)',
                        color: '#1A1407',
                        fontWeight: 800,
                        appearance: 'none',
                        width: 'auto',
                        alignSelf: 'flex-start',
                        justifySelf: 'start',
                        opacity: interestBusy ? 0.72 : 1,
                      }}
                    >
                      {interestBusy ? 'Guardando...' : engagementCta.label}
                    </button>
                  )}
                  {interestMsg ? (
                    <div
                      style={{
                        marginTop: 4,
                        borderRadius: 6,
                        border: `1px solid ${interestMsg.type === 'success' ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)'}`,
                        background: interestMsg.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        color: interestMsg.type === 'success' ? '#9AE6B4' : '#FCA5A5',
                        padding: '10px 12px',
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                    >
                      {interestMsg.text}
                    </div>
                  ) : null}
                  {canSeeMySchedule ? (
                    <Link
                      to={myScheduleHref}
                      style={{
                        marginTop: 6,
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '12px 16px',
                        borderRadius: 6,
                        border: `1px solid ${hexToRgba(theme.primary, 0.24)}`,
                        background: hexToRgba(theme.background, 0.52),
                        color: theme.text,
                        fontWeight: 800,
                      }}
                    >
                      Mi cronograma
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>

            <section style={{ display: 'grid', gap: 18 }}>
              {scheduleItems.length ? (
                <div className="fr-cut-card" style={{ border: `1px solid ${theme.border}`, background: theme.surface, padding: isMobile ? 18 : 22 }}>
                  <div style={{ color: theme.accent, fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                    Calendario
                  </div>
                  <h2 style={{ margin: '8px 0 0', fontSize: isMobile ? 24 : 28, lineHeight: 1.05 }}>Fechas clave</h2>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                    <Link to={scheduleHref} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 6, border: `1px solid ${hexToRgba(theme.accent, 0.22)}`, background: hexToRgba(theme.background, 0.58), color: theme.text, fontWeight: 700 }}>
                      Abrir cronograma completo
                    </Link>
                    {canSeeMySchedule ? (
                      <Link to={myScheduleHref} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 6, border: `1px solid ${hexToRgba(theme.primary, 0.24)}`, background: hexToRgba(theme.background, 0.58), color: theme.text, fontWeight: 700 }}>
                        Ver mi cronograma
                      </Link>
                    ) : null}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 14 }}>
                    {scheduleItems.map((item) => (
                      <div key={item.id} className="fr-cut-card" style={{ border: `1px solid ${theme.border}`, background: hexToRgba(theme.background, 0.58), padding: isMobile ? 14 : 16 }}>
                        {item.linked_phase_name ? <div style={{ color: theme.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>Fase enlazada: {item.linked_phase_name}</div> : null}
                        <div style={{ color: theme.text, fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>{item.label || 'Fecha'}</div>
                        <div style={{ marginTop: 6, color: theme.text, fontSize: 14, lineHeight: 1.6 }}>
                          {formatDateRange(item.start_at, item.end_at)}
                        </div>
                        {item.note ? <div style={{ marginTop: 6, color: theme.textSecondary, fontSize: 13, lineHeight: 1.55 }}>{item.note}</div> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
                <div className="fr-cut-card" style={{ border: `1px solid ${theme.border}`, background: theme.surface, padding: isMobile ? 18 : 22, height: '100%' }}>
                  <PhasesbyDay phases={phases} categories={categories} theme={theme} hexToRgba={hexToRgba} isMobile={isMobile} />
                </div>

                <div className="fr-cut-card" style={{ border: `1px solid ${theme.border}`, background: theme.surface, padding: isMobile ? 18 : 22, height: '100%' }}>
                  <div style={{ color: theme.accent, fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                    Categorias
                  </div>
                  <h2 style={{ margin: '8px 0 0', fontSize: isMobile ? 24 : 28, lineHeight: 1.05 }}>Divisiones de la competencia</h2>
                  <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                    {categories.length ? Object.entries(categoriesByModality)
                      .filter(([, items]) => Array.isArray(items) && items.length)
                      .map(([modality, items]) => (
                        <div key={`group-${modality}`} style={{ display: 'grid', gap: 8 }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: modality === 'teams' ? theme.primary : theme.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            <Users size={14} />
                            {modalityLabel(modality)}
                          </div>
                          {items.map((category) => {
                            const categoryKey = `${modality}-${category.id || category.nombre}`
                            const isExpanded = expandedCategoryKey === categoryKey
                            const pricing = calculateEnrollmentPricing(category.enrollment_price, platformFeeRate)
                            const { shortDescription, longDescription } = splitCategoryDescription(category.descripcion)
                            const hasAnyDescription = !!(shortDescription || longDescription)
                            const hasPricing = pricing.totalPrice > 0
                            const canExpand = hasAnyDescription || hasPricing
                            const CardTag = canExpand ? 'button' : 'div'
                            return (
                              <CardTag
                                key={category.id}
                                type={canExpand ? 'button' : undefined}
                                onClick={canExpand ? () => setExpandedCategoryKey(prev => (prev === categoryKey ? '' : categoryKey)) : undefined}
                                style={{ padding: isMobile ? '12px' : '13px 14px', borderRadius: 6, background: 'rgba(13,15,18,0.62)', border: `1px solid ${theme.border}`, textAlign: 'left', cursor: canExpand ? 'pointer' : 'default', color: 'inherit' }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                                    <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 800 }}>
                                      {category.nombre}
                                    </div>
                                    <span style={{ padding: '5px 8px', borderRadius: 999, background: modality === 'teams' ? hexToRgba(theme.primary, 0.12) : hexToRgba(theme.accent, 0.12), border: `1px solid ${modality === 'teams' ? hexToRgba(theme.primary, 0.24) : hexToRgba(theme.accent, 0.24)}`, color: theme.text, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                                      {modalityLabel(modality)}
                                    </span>
                                  </div>
                                  {canExpand ? (
                                    <span style={{ color: theme.textSecondary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    </span>
                                  ) : null}
                                </div>
                                {isExpanded && canExpand ? (
                                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 12, lineHeight: 1.6 }}>
                                    {hasAnyDescription ? (
                                      <div style={{ color: theme.text, fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                                        {[shortDescription, longDescription].filter(Boolean).join('\n\n')}
                                      </div>
                                    ) : null}
                                    {hasPricing ? (
                                      <div style={{ marginTop: 12, display: 'grid', gap: 4, justifyItems: 'end', textAlign: 'right' }}>
                                        <div style={{ color: '#D4A537', fontSize: 15, fontWeight: 800 }}>
                                          Inscripcion total: {formatCop(pricing.totalPrice)}
                                        </div>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'end', gap: 6, flexWrap: 'wrap' }}>
                                          <span>
                                          Base {formatCop(pricing.organizerPrice)} + plataforma {formatCop(pricing.platformFee)}
                                          </span>
                                          <span title="El total incluye la comision de plataforma aplicada al valor base de esta categoria." style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 999, border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
                                            <Info size={11} />
                                          </span>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </CardTag>
                            )
                          })}
                        </div>
                      )) : (
                      <div style={{ color: theme.textSecondary, fontSize: 14 }}>Sin categorias definidas.</div>
                    )}
                  </div>
                </div>
              </div>

            </section>
          </>
        ) : null}
      </div>
      <InterestNotificationModal
        open={interestModalOpen}
        onClose={() => {
          if (interestBusy) return
          setInterestModalOpen(false)
        }}
        onSubmit={handleInterestEmailSubmit}
        email={interestEmail}
        onEmailChange={setInterestEmail}
        busy={interestBusy}
        theme={theme}
      />
    </div>
  )
}

