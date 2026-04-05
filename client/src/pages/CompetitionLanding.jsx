import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Globe, Instagram, MapPin, Medal, MessageCircle, Phone, ShieldCheck, Users, Youtube } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/axios'

const pageBg =
  'radial-gradient(circle at top, rgba(255,107,0,0.18), transparent 28%), radial-gradient(circle at 85% 20%, rgba(0,194,168,0.12), transparent 24%), #0D0F12'

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
        start_at: item?.start_at || null,
        end_at: item?.end_at || null,
        note: String(item?.note || '').trim(),
      }))
      .filter(item => item.label || item.start_at || item.end_at || item.note)
  } catch {
    return []
  }
}

function getStatusLabel(competition) {
  if (competition?.enrollment_open) return { label: 'Inscripciones abiertas', tone: '#00C2A8' }
  if (competition?.activa) return { label: 'Competencia activa', tone: '#FF6B00' }
  return { label: 'Proximamente', tone: '#AAB2C0' }
}

function phaseStateLabel(state) {
  if (state === 'finalizada') return 'Finalizada'
  if (state === 'en_progreso') return 'En progreso'
  return 'Pendiente'
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

export default function CompetitionLanding() {
  const { competitionId } = useParams()
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))

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

  const competition = payload?.competition || null
  const categories = useMemo(() => payload?.categories || [], [payload])
  const phases = useMemo(() => payload?.phases || [], [payload])
  const scheduleItems = useMemo(() => parseScheduleItems(competition?.schedule_items), [competition])
  const stats = payload?.stats || {}
  const status = getStatusLabel(competition)
  const socialLinks = useMemo(() => {
    try {
      const parsed = typeof competition?.social_links === 'string' ? JSON.parse(competition.social_links) : (competition?.social_links || [])
      return Array.isArray(parsed) ? parsed.filter(item => item?.label || item?.url) : []
    } catch {
      return []
    }
  }, [competition])
  const bannerUrl = resolveCompetitionAsset(competition, 'banner')
  const profileImageUrl = resolveCompetitionAsset(competition, 'profile')

  return (
    <div style={{ minHeight: '100vh', background: pageBg, color: '#F5F7FA' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? '16px 14px 56px' : '24px 18px 72px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
          <Link
            to="/"
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #252A33',
              color: '#F5F7FA',
              background: 'rgba(13,15,18,0.4)',
              width: isMobile ? '100%' : 'auto',
              justifyContent: 'center',
            }}
          >
            <ArrowLeft size={16} />
            Volver
          </Link>
          {competition && (
            <a
              href={`/leaderboard/${competition.id}`}
              style={{
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                borderRadius: 14,
                background: 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)',
                color: '#0D0F12',
                fontWeight: 800,
                width: isMobile ? '100%' : 'auto',
                justifyContent: 'center',
              }}
            >
              Ver leaderboard
              <ArrowRight size={16} />
            </a>
          )}
        </div>

        {loading ? (
          <div style={{ color: '#AAB2C0', fontSize: 14 }}>Cargando competencia...</div>
        ) : error ? (
          <div style={{ borderRadius: 22, padding: 24, background: 'rgba(23,27,33,0.94)', border: '1px solid #252A33', color: '#F5F7FA' }}>
            {error}
          </div>
        ) : competition ? (
          <>
            <section
              style={{
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 28,
                border: '1px solid rgba(37,42,51,0.96)',
                background: bannerUrl
                  ? `linear-gradient(180deg, rgba(13,15,18,0.18), rgba(13,15,18,0.82)), url("${bannerUrl}") center/cover`
                  : 'linear-gradient(135deg, rgba(255,107,0,0.22), rgba(0,194,168,0.12) 55%, rgba(23,27,33,0.98) 100%)',
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
                    background: `#0D0F12 url("${profileImageUrl}") center/cover no-repeat`,
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
                    background: 'rgba(9,11,14,0.7)',
                    border: `1px solid ${status.tone}66`,
                    color: '#F5F7FA',
                    fontSize: 12,
                    fontWeight: 800,
                    marginBottom: 16,
                    flexWrap: 'wrap',
                  }}
                >
                  <ShieldCheck size={14} color={status.tone} />
                  {status.label}
                </span>
                <h1 style={{ margin: 0, fontSize: isMobile ? 34 : 'clamp(34px, 6vw, 64px)', lineHeight: 0.94, wordBreak: 'break-word' }}>
                  {competition.nombre}
                </h1>
                <p style={{ margin: '14px 0 0', maxWidth: 680, color: '#D7DEE8', fontSize: isMobile ? 14 : 16, lineHeight: 1.7 }}>
                  {(competition.descripcion || '').trim() || 'Esta competencia ya tiene pagina publica. Aqui podras revisar su panorama general y entrar al leaderboard.'}
                </p>
              </div>
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
              <div style={{ borderRadius: 20, border: '1px solid #252A33', background: '#171B21', padding: 18 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#00C2A8', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                  <MapPin size={14} />
                  Lugar
                </div>
                <div style={{ marginTop: 10, fontSize: isMobile ? 20 : 22, fontWeight: 800, lineHeight: 1.25, wordBreak: 'break-word' }}>{competition.lugar || 'Por confirmar'}</div>
              </div>
              <div style={{ borderRadius: 20, border: '1px solid #252A33', background: '#171B21', padding: 18 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#00C2A8', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                  <CalendarDays size={14} />
                  Fechas
                </div>
                <div style={{ marginTop: 10, fontSize: isMobile ? 16 : 18, fontWeight: 800, lineHeight: 1.45 }}>
                  {formatDateRange(competition.competition_start || competition.enrollment_start, competition.competition_end || competition.enrollment_end)}
                </div>
              </div>
              <div style={{ borderRadius: 20, border: '1px solid #252A33', background: '#171B21', padding: 18 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#00C2A8', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                  <Users size={14} />
                  Inscritos
                </div>
                <div style={{ marginTop: 10, fontSize: 32, fontWeight: 800 }}>{stats.inscritos_confirmados || 0}</div>
                <div style={{ marginTop: 6, color: '#AAB2C0', fontSize: 13 }}>
                  {stats.solicitudes_pendientes || 0} solicitudes pendientes
                </div>
              </div>
              <div style={{ borderRadius: 20, border: '1px solid #252A33', background: '#171B21', padding: 18 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#00C2A8', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                  <Medal size={14} />
                  Estructura
                </div>
                <div style={{ marginTop: 10, fontSize: 18, fontWeight: 800, lineHeight: 1.35 }}>
                  {stats.categorias_total || 0} categorias
                </div>
                <div style={{ marginTop: 6, color: '#AAB2C0', fontSize: 13 }}>
                  {stats.fases_total || 0} fases configuradas
                </div>
              </div>
            </section>

            {(competition.contact_phone || competition.website_url || socialLinks.length) ? (
              <section style={{ marginBottom: 18 }}>
                <div style={{ borderRadius: 24, border: '1px solid #252A33', background: '#171B21', padding: isMobile ? 18 : 22 }}>
                  <div style={{ color: '#00C2A8', fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                    Contacto
                  </div>
                  <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                    {competition.contact_phone ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#F5F7FA', fontSize: 14, flexWrap: 'wrap' }}>
                        <Phone size={14} color="#00C2A8" />
                        <span>{competition.contact_phone}</span>
                      </div>
                    ) : null}
                    {competition.website_url ? (
                      <a href={competition.website_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#F5F7FA', fontSize: 14, textDecoration: 'none' }}>
                        <Globe size={14} color="#00C2A8" />
                        <span>{competition.website_url}</span>
                      </a>
                    ) : null}
                    {socialLinks.length ? (
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {socialLinks.map((item) => (
                          (() => {
                            const Icon = socialIconForLabel(item.label, item.url)
                            return (
                              <a key={item.id || `${item.label}-${item.url}`} href={item.url} target="_blank" rel="noreferrer" style={{ padding: '10px 14px', borderRadius: 999, background: 'rgba(13,15,18,0.62)', border: '1px solid #252A33', color: '#F5F7FA', fontSize: 13, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <Icon size={14} color="#00C2A8" />
                                <span>{item.label || item.url}</span>
                              </a>
                            )
                          })()
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}

            <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 0.95fr) minmax(280px, 0.65fr)', gap: 18 }}>
              <div style={{ borderRadius: 24, border: '1px solid #252A33', background: '#171B21', padding: isMobile ? 18 : 22 }}>
                <div style={{ marginBottom: 18 }}>
                  <div style={{ color: '#00C2A8', fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                    Agenda
                  </div>
                  <h2 style={{ margin: '8px 0 0', fontSize: isMobile ? 24 : 28, lineHeight: 1.05 }}>Fechas clave</h2>
                </div>
                {scheduleItems.length ? (
                  <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
                    {scheduleItems.map((item) => (
                      <div key={item.id} style={{ borderRadius: 18, border: '1px solid #252A33', background: 'rgba(13,15,18,0.58)', padding: isMobile ? 14 : 16 }}>
                        <div style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>{item.label || 'Fecha'}</div>
                        <div style={{ marginTop: 6, color: '#D7DEE8', fontSize: 14, lineHeight: 1.6 }}>
                          {formatDateRange(item.start_at, item.end_at)}
                        </div>
                        {item.note ? (
                          <div style={{ marginTop: 6, color: '#AAB2C0', fontSize: 13, lineHeight: 1.55 }}>{item.note}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: '#00C2A8', fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                    Fases
                  </div>
                  <h2 style={{ margin: '8px 0 0', fontSize: isMobile ? 24 : 28, lineHeight: 1.05 }}>Panorama de la competencia</h2>
                </div>
                {phases.length ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {phases.map((phase, index) => (
                      <div key={phase.id || `${phase.nombre}-${index}`} style={{ borderRadius: 18, border: '1px solid #252A33', background: 'rgba(13,15,18,0.58)', padding: isMobile ? 14 : 16 }}>
                        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: 12, alignItems: isMobile ? 'stretch' : 'start', flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: '#F5F7FA', fontSize: isMobile ? 16 : 17, fontWeight: 800, lineHeight: 1.25, wordBreak: 'break-word' }}>{phase.nombre}</div>
                            {phase.descripcion ? (
                              <div style={{ marginTop: 6, color: '#AAB2C0', fontSize: 14, lineHeight: 1.6 }}>{phase.descripcion}</div>
                            ) : null}
                          </div>
                          <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(255,107,0,0.12)', border: '1px solid rgba(255,107,0,0.25)', color: '#FFD0AE', fontSize: 12, fontWeight: 700, alignSelf: isMobile ? 'flex-start' : 'auto' }}>
                            {phaseStateLabel(phase.estado)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: '#AAB2C0', fontSize: 14 }}>Todavia no hay fases publicadas para esta competencia.</div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
                <div style={{ borderRadius: 24, border: '1px solid #252A33', background: '#171B21', padding: isMobile ? 18 : 22 }}>
                  <div style={{ color: '#00C2A8', fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                    Categorias
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                    {categories.length ? categories.map((category) => (
                      <span key={category.id} style={{ padding: '10px 14px', borderRadius: 999, background: 'rgba(13,15,18,0.62)', border: '1px solid #252A33', color: '#F5F7FA', fontSize: 13, fontWeight: 700 }}>
                        {category.nombre}
                      </span>
                    )) : (
                      <span style={{ color: '#AAB2C0', fontSize: 14 }}>Sin categorias definidas.</span>
                    )}
                  </div>
                </div>

                <div style={{ borderRadius: 24, border: '1px solid #252A33', background: 'linear-gradient(135deg, rgba(255,107,0,0.12), rgba(23,27,33,0.96))', padding: isMobile ? 18 : 22 }}>
                  <div style={{ color: '#F5F7FA', fontSize: isMobile ? 22 : 24, fontWeight: 800, lineHeight: 1.1 }}>
                    Sigue el rendimiento en tiempo real.
                  </div>
                  <div style={{ marginTop: 10, color: '#D7DEE8', fontSize: 14, lineHeight: 1.6 }}>
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
                      background: 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)',
                      color: '#0D0F12',
                      fontWeight: 800,
                      width: isMobile ? '100%' : 'auto',
                      justifyContent: 'center',
                    }}
                  >
                    Ver leaderboard
                    <ArrowRight size={16} />
                  </a>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}
