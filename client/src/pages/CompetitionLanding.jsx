import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, Globe, Instagram, MapPin, Medal, MessageCircle, Phone, ShieldCheck, Users, Youtube } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/axios'
import { getHomePath, useAuth } from '../context/AuthContext'
import { COMPETITION_PAGE_MAX_WIDTH } from '../utils/competitionLayout'
import { getReadableTextColor, hexToRgba, resolveCompetitionTheme } from '../utils/competitionTheme'

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

function enrollmentButtonState(competition, sessionRole, enrollmentState) {
  if (!sessionRole) return { label: 'Quiero participar', disabled: false }
  if (sessionRole !== 'user') return { label: 'Ir a mi panel', disabled: false }
  if (enrollmentState === 'confirmado') return { label: 'Ya inscrito', disabled: true }
  if (enrollmentState === 'pendiente') return { label: 'Solicitud enviada', disabled: true }
  if (enrollmentState === 'rechazado') {
    if (!competition?.enrollment_open) return { label: 'Inscripciones cerradas', disabled: true }
    return { label: 'Reintentar solicitud', disabled: false }
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
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    justifySelf: 'start',
    width: 'fit-content',
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

export default function CompetitionLanding() {
  const { competitionId } = useParams()
  const { session, role, participantId } = useAuth()
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [myEnrollmentState, setMyEnrollmentState] = useState('')
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const [detailTab, setDetailTab] = useState('overview')
  const [expandedCategoryKey, setExpandedCategoryKey] = useState('')

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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
    if (!session || role !== 'user' || !participantId) {
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
  }, [session, role, participantId, competitionId])

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
  const phases = useMemo(() => payload?.phases || [], [payload])
  const scheduleItems = useMemo(
    () => resolveScheduleItemsWithPhases(parseScheduleItems(competition?.schedule_items), phases),
    [competition, phases]
  )
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
  const detailTabs = [
    { id: 'overview', label: 'Resumen' },
    { id: 'schedule', label: 'Calendario' },
    { id: 'phases', label: 'Fases' },
    { id: 'categories', label: 'Categorias' },
  ]
  const overviewText = (competition?.general_info_text || competition?.descripcion || '').trim()
  const registerHref = competition ? `/competitions/${competition.id}/register` : '/login'
  const scheduleHref = competition ? `/competitions/${competition.id}/schedule` : '/login'
  const myScheduleHref = competition ? `/competitions/${competition.id}/my-schedule` : '/login'
  const canSeeMySchedule = !!(session && role === 'user' && myEnrollmentState === 'confirmado')
  const enrollmentButton = enrollmentButtonState(competition, role, myEnrollmentState)
  const secondaryCtaHref = !session ? '/login' : role === 'user' ? registerHref : getHomePath(role)
  const secondaryCtaLabel = enrollmentButton.label

  return (
    <div style={{ minHeight: '100vh', background: pageBg, color: theme.text }}>
      <div style={{ maxWidth: COMPETITION_PAGE_MAX_WIDTH, margin: '0 auto', padding: isMobile ? '16px 14px 56px' : '24px 24px 72px' }}>
        {loading ? (
          <div style={{ color: theme.textSecondary, fontSize: 14 }}>Cargando competencia...</div>
        ) : error ? (
          <div style={{ borderRadius: 22, padding: 24, background: hexToRgba(theme.surface, 0.94), border: `1px solid ${theme.border}`, color: theme.text }}>
            {error}
          </div>
        ) : competition ? (
          <>
            <section
              style={{
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 28,
                border: `1px solid ${hexToRgba(theme.border, 0.96)}`,
                background: bannerUrl
                  ? `linear-gradient(180deg, ${hexToRgba(theme.background, 0.18)}, ${hexToRgba(theme.background, 0.82)}), url("${bannerUrl}") center/cover`
                  : `linear-gradient(135deg, ${hexToRgba(theme.primary, 0.22)}, ${hexToRgba(theme.accent, 0.12)} 55%, ${hexToRgba(theme.surface, 0.98)} 100%)`,
                padding: isMobile ? '20px 18px 22px' : 'clamp(24px, 5vw, 48px)',
                boxShadow: '0 20px 70px rgba(0,0,0,0.28)',
                marginBottom: 18,
              }}
            >
              <div style={{ maxWidth: 760 }}>
                {profileImageUrl ? (
                  <div style={{
                    width: isMobile ? 84 : 96,
                    height: isMobile ? 84 : 96,
                    borderRadius: 24,
                    background: `${theme.background} url("${profileImageUrl}") center/cover no-repeat`,
                    border: '1px solid rgba(245,247,250,0.18)',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.24)',
                    marginBottom: 16,
                  }} />
                ) : null}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 999,
                    background: hexToRgba(theme.background, 0.7),
                    border: `1px solid ${status.tone}66`,
                    color: theme.text,
                    fontSize: 12,
                    fontWeight: 800,
                    marginBottom: 16,
                    flexWrap: 'wrap',
                  }}
                >
                  <ShieldCheck size={14} color={status.tone} />
                  {status.label}
                </span>
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
                <h1 style={{ margin: 0, fontSize: isMobile ? 34 : 'clamp(34px, 6vw, 64px)', lineHeight: 0.94, wordBreak: 'break-word' }}>
                  {competition.nombre}
                </h1>
                <p style={{ margin: '14px 0 0', maxWidth: 680, color: theme.text, fontSize: isMobile ? 14 : 16, lineHeight: 1.7 }}>
                  {(competition.descripcion || '').trim() || 'Esta competencia ya tiene pagina publica. Aqui podras revisar su panorama general y entrar al leaderboard.'}
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                  <a
                    href={`/leaderboard/${competition.id}`}
                    style={{
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '12px 16px',
                      borderRadius: 14,
                      background: `linear-gradient(135deg, ${theme.primary} 0%, ${hexToRgba(theme.primary, 0.72)} 100%)`,
                      color: primaryTextColor,
                      fontWeight: 800,
                    }}
                  >
                    Ver leaderboard
                    <ArrowRight size={16} />
                  </a>
                  <Link
                    to={scheduleHref}
                    style={{
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '12px 16px',
                      borderRadius: 14,
                      border: `1px solid ${hexToRgba(theme.accent, 0.22)}`,
                      background: hexToRgba(theme.background, 0.58),
                      color: theme.text,
                      fontWeight: 700,
                    }}
                  >
                    Ver cronograma
                  </Link>
                  {canSeeMySchedule ? (
                    <Link
                      to={myScheduleHref}
                      style={{
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '12px 16px',
                        borderRadius: 14,
                        border: `1px solid ${hexToRgba(theme.primary, 0.28)}`,
                        background: 'rgba(13,15,18,0.58)',
                        color: '#F5F7FA',
                        fontWeight: 700,
                      }}
                    >
                      Mi cronograma
                    </Link>
                  ) : null}
                  <Link
                    to={secondaryCtaHref}
                    style={{
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '12px 16px',
                      borderRadius: 14,
                      border: `1px solid ${theme.border}`,
                      background: !enrollmentButton.disabled ? hexToRgba(theme.background, 0.36) : hexToRgba(theme.background, 0.62),
                      color: theme.text,
                      fontWeight: 700,
                      pointerEvents: enrollmentButton.disabled ? 'none' : 'auto',
                      opacity: enrollmentButton.disabled ? 0.65 : 1,
                    }}
                  >
                    {secondaryCtaLabel}
                  </Link>
                </div>
              </div>
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 18 }}>
              <div style={{ borderRadius: 20, border: `1px solid ${theme.border}`, background: theme.surface, padding: 18 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: theme.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                  <MapPin size={14} />
                  Lugar
                </div>
                <div style={{ marginTop: 10, fontSize: isMobile ? 20 : 22, fontWeight: 800, lineHeight: 1.25, wordBreak: 'break-word' }}>{competition.lugar || 'Por confirmar'}</div>
              </div>
              <div style={{ borderRadius: 20, border: `1px solid ${theme.border}`, background: theme.surface, padding: 18 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: theme.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                  <CalendarDays size={14} />
                  Fechas
                </div>
                <div style={{ marginTop: 10, fontSize: isMobile ? 16 : 18, fontWeight: 800, lineHeight: 1.45 }}>
                  {formatDateRange(competition.competition_start || competition.enrollment_start, competition.competition_end || competition.enrollment_end)}
                </div>
              </div>
              <div style={{ borderRadius: 20, border: `1px solid ${theme.border}`, background: theme.surface, padding: 18 }}>
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
              <div style={{ borderRadius: 20, border: `1px solid ${theme.border}`, background: theme.surface, padding: 18 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: theme.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                  <Phone size={14} />
                  Contacto
                </div>
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  {competition.contact_phone ? (
                    <span style={contactChipStyle}>
                      <Phone size={13} color={theme.accent} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {competition.contact_phone}
                      </span>
                    </span>
                  ) : null}
                  {competition.website_url ? (
                    <a href={competition.website_url} target="_blank" rel="noreferrer" style={contactChipStyle}>
                      <Globe size={13} color={theme.accent} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {competition.website_url}
                      </span>
                    </a>
                  ) : null}
                  {socialLinks.length ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {socialLinks.slice(0, 2).map((item) => {
                        const Icon = socialIconForLabel(item.label, item.url)
                        return (
                          <a
                            key={`main-contact-${item.id || `${item.label}-${item.url}`}`}
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              ...contactChipStyle,
                            }}
                          >
                            <Icon size={13} color={theme.accent} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.label || item.url}
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

            <section style={{ display: 'grid', gap: 18 }}>
              <div style={{ borderRadius: 24, border: `1px solid ${theme.border}`, background: theme.surface, padding: isMobile ? 18 : 22 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                  {detailTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setDetailTab(tab.id)}
                      style={{
                        border: '1px solid',
                        borderColor: detailTab === tab.id ? hexToRgba(theme.primary, 0.35) : theme.border,
                        background: detailTab === tab.id ? `linear-gradient(135deg, ${hexToRgba(theme.primary, 0.16)}, ${hexToRgba(theme.accent, 0.08)})` : hexToRgba(theme.background, 0.62),
                        color: detailTab === tab.id ? theme.text : theme.textSecondary,
                        borderRadius: 999,
                        padding: '10px 14px',
                        fontSize: 13,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {detailTab === 'overview' ? (
                  <div>
                    <div style={{ color: theme.accent, fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                      Resumen
                    </div>
                    <h2 style={{ margin: '8px 0 0', fontSize: isMobile ? 24 : 28, lineHeight: 1.05 }}>Informacion general</h2>
                    <div style={{ marginTop: 14, color: theme.text, fontSize: 15, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                      {overviewText || 'Todavia no hay informacion general publicada para esta competencia.'}
                    </div>
                  </div>
                ) : null}

                {detailTab === 'schedule' ? (
                  <div>
                    <div style={{ color: theme.accent, fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                      Calendario
                    </div>
                    <h2 style={{ margin: '8px 0 0', fontSize: isMobile ? 24 : 28, lineHeight: 1.05 }}>Fechas clave</h2>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                      <Link
                        to={scheduleHref}
                        style={{
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '10px 14px',
                          borderRadius: 12,
                          border: `1px solid ${hexToRgba(theme.accent, 0.22)}`,
                          background: hexToRgba(theme.background, 0.58),
                          color: theme.text,
                          fontWeight: 700,
                        }}
                      >
                        Abrir cronograma completo
                      </Link>
                  {canSeeMySchedule ? (
                        <Link
                          to={myScheduleHref}
                          style={{
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '10px 14px',
                            borderRadius: 12,
                            border: `1px solid ${hexToRgba(theme.primary, 0.24)}`,
                            background: hexToRgba(theme.background, 0.58),
                            color: theme.text,
                            fontWeight: 700,
                          }}
                        >
                          Ver mi cronograma
                        </Link>
                      ) : null}
                    </div>
                    <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                      {scheduleItems.length ? scheduleItems.map((item) => (
                        <div key={item.id} style={{ borderRadius: 18, border: `1px solid ${theme.border}`, background: hexToRgba(theme.background, 0.58), padding: isMobile ? 14 : 16 }}>
                          {item.linked_phase_name ? (
                            <div style={{ color: theme.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                              Fase enlazada: {item.linked_phase_name}
                            </div>
                          ) : null}
                          <div style={{ color: theme.text, fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>{item.label || 'Fecha'}</div>
                          <div style={{ marginTop: 6, color: theme.text, fontSize: 14, lineHeight: 1.6 }}>
                            {formatDateRange(item.start_at, item.end_at)}
                          </div>
                          {item.note ? (
                            <div style={{ marginTop: 6, color: theme.textSecondary, fontSize: 13, lineHeight: 1.55 }}>{item.note}</div>
                          ) : null}
                        </div>
                      )) : (
                        <div style={{ color: theme.textSecondary, fontSize: 14 }}>Todavia no hay fechas clave publicadas.</div>
                      )}
                    </div>
                  </div>
                ) : null}

                {detailTab === 'phases' ? (
                  <div>
                    <div style={{ color: theme.accent, fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                      Fases
                    </div>
                    <h2 style={{ margin: '8px 0 0', fontSize: isMobile ? 24 : 28, lineHeight: 1.05 }}>Panorama de la competencia</h2>
                    <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                      {phases.length ? phases.map((phase, index) => (
                        <div key={phase.id || `${phase.nombre}-${index}`} style={{ borderRadius: 18, border: `1px solid ${theme.border}`, background: hexToRgba(theme.background, 0.58), padding: isMobile ? 14 : 16 }}>
                          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: 12, alignItems: isMobile ? 'stretch' : 'start', flexWrap: 'wrap' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                <span style={{ color: theme.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>{phaseFormatLabel(phase)}</span>
                                <span style={{ padding: '4px 8px', borderRadius: 999, background: (phase.modality || 'individual') === 'teams' ? hexToRgba(theme.primary, 0.12) : hexToRgba(theme.accent, 0.12), border: `1px solid ${(phase.modality || 'individual') === 'teams' ? hexToRgba(theme.primary, 0.24) : hexToRgba(theme.accent, 0.24)}`, color: theme.text, fontSize: 11, fontWeight: 700 }}>
                                  {modalityLabel(phase.modality || 'individual')}
                                </span>
                              </div>
                              <div style={{ color: '#F5F7FA', fontSize: isMobile ? 16 : 17, fontWeight: 800, lineHeight: 1.25, wordBreak: 'break-word' }}>{phase.nombre}</div>
                              {(phase.start_at || phase.end_at) ? (
                                <div style={{ marginTop: 6, color: theme.text, fontSize: 13, lineHeight: 1.55 }}>
                                  {formatDateRange(phase.start_at, phase.end_at)}
                                </div>
                              ) : null}
                              {phase.descripcion ? (
                                <div style={{ marginTop: 6, color: theme.textSecondary, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{phase.descripcion}</div>
                              ) : null}
                              {(phase.activities || []).length ? (
                                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                                  {(phase.activities || []).map((activity, activityIndex) => (
                                    <div
                                      key={`${phase.id || phase.nombre}-activity-${activityIndex}`}
                                      style={{
                                        borderRadius: 14,
                                        border: `1px solid ${hexToRgba(theme.accent, 0.18)}`,
                                        background: hexToRgba(theme.accent, 0.08),
                                        padding: '10px 12px',
                                      }}
                                    >
                                      <div style={{ color: '#D9FFFA', fontSize: 13, fontWeight: 700 }}>
                                        {activity.nombre || `Actividad ${activityIndex + 1}`}
                                      </div>
                                      {activity.descripcion ? (
                                        <div style={{ marginTop: 4, color: theme.textSecondary, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                                          {activity.descripcion}
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <span style={{ padding: '6px 10px', borderRadius: 999, background: hexToRgba(theme.primary, 0.12), border: `1px solid ${hexToRgba(theme.primary, 0.25)}`, color: theme.text, fontSize: 12, fontWeight: 700, alignSelf: isMobile ? 'flex-start' : 'auto' }}>
                              {phaseStateLabel(phase.estado)}
                            </span>
                          </div>
                        </div>
                      )) : (
                        <div style={{ color: theme.textSecondary, fontSize: 14 }}>Todavia no hay fases publicadas para esta competencia.</div>
                      )}
                    </div>
                  </div>
                ) : null}

                {detailTab === 'categories' ? (
                  <div>
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
                              return (
                                <button
                                  key={category.id}
                                  type="button"
                                  onClick={() => setExpandedCategoryKey(prev => (prev === categoryKey ? '' : categoryKey))}
                                  style={{
                                    padding: '12px 14px',
                                    borderRadius: 18,
                                    background: 'rgba(13,15,18,0.62)',
                                    border: `1px solid ${theme.border}`,
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    color: 'inherit',
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 800 }}>
                                      {category.nombre}
                                    </div>
                                    <span style={{ padding: '5px 8px', borderRadius: 999, background: modality === 'teams' ? hexToRgba(theme.primary, 0.12) : hexToRgba(theme.accent, 0.12), border: `1px solid ${modality === 'teams' ? hexToRgba(theme.primary, 0.24) : hexToRgba(theme.accent, 0.24)}`, color: theme.text, fontSize: 11, fontWeight: 700 }}>
                                      {modalityLabel(modality)}
                                    </span>
                                  </div>
                                  {isExpanded && category.descripcion ? (
                                    <div style={{ marginTop: 8, color: theme.textSecondary, fontSize: 13, lineHeight: 1.55 }}>
                                      {category.descripcion}
                                    </div>
                                  ) : null}
                                </button>
                              )
                            })}
                          </div>
                        )) : (
                        <div style={{ color: theme.textSecondary, fontSize: 14 }}>Sin categorias definidas.</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <div style={{ borderRadius: 24, border: `1px solid ${theme.border}`, background: `linear-gradient(135deg, ${hexToRgba(theme.primary, 0.12)}, ${hexToRgba(theme.surface, 0.96)})`, padding: isMobile ? 18 : 22 }}>
                <div style={{ color: '#F5F7FA', fontSize: isMobile ? 22 : 24, fontWeight: 800, lineHeight: 1.1 }}>
                  Sigue el rendimiento en tiempo real.
                </div>
                <div style={{ marginTop: 10, color: theme.text, fontSize: 14, lineHeight: 1.6 }}>
                  Revisa posiciones, puntajes y movimientos del ranking desde el leaderboard publico de esta competencia.
                </div>
                <a
                  href={`/leaderboard/${competition.id}`}
                  style={{
                    marginTop: 18,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px 16px',
                    borderRadius: 14,
                    background: `linear-gradient(135deg, ${theme.primary} 0%, ${hexToRgba(theme.primary, 0.72)} 100%)`,
                    color: primaryTextColor,
                    fontWeight: 800,
                    width: isMobile ? '100%' : 'auto',
                    justifyContent: 'center',
                  }}
                >
                  Ver leaderboard
                  <ArrowRight size={16} />
                </a>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}
