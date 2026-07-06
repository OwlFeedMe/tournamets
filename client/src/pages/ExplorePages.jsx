import { useEffect, useMemo, useState } from 'react'
import { Bell, CalendarDays, CheckCircle2, ChevronRight, Clock3, Flame, Lock, MapPin, Medal, QrCode, Trash2, TrendingDown, TrendingUp, Trophy, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../api/axios'
import { SkeletonCardGrid, SkeletonList } from '../components/layout/Skeleton'
import {
  filterCompetitionsByQuery,
  formatCompetitionDate,
  formatCompetitionWindow,
  resolveCompetitionAsset,
  truncate,
} from '../components/home/homeModel'
import { useAuth } from '../context/AuthContext'
import { APP_CONTENT_MAX_WIDTH } from '../utils/competitionLayout'
import {
  readSpectatorFollows,
  subscribeSpectatorFollows,
  unfollowAthlete,
} from '../utils/spectatorFollow'
import { fetchFollowSummary } from '../utils/followSummary'

const pageStyle = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at top, rgba(214,217,224,0.10), transparent 26%), radial-gradient(circle at bottom right, rgba(94,234,212,0.08), transparent 24%), #0D0F12',
  color: '#F5F7FA',
}

function competitionMonogram(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
  if (!parts.length) return 'FR'
  return parts.map((part) => part[0]?.toUpperCase() || '').join('')
}

function SearchInput({ value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          borderRadius: 16,
          border: '1px solid #252A33',
          background: '#171B21',
          color: '#F5F7FA',
          padding: '14px 16px',
          fontSize: 14,
          outline: 'none',
        }}
      />
    </div>
  )
}

function useCompetitions() {
  const [competitions, setCompetitions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    api.get('/competitions?scope=public')
      .then(({ data }) => {
        if (!mounted) return
        setCompetitions(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!mounted) return
        setCompetitions([])
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  return { competitions, loading }
}

function TopBlock({ kicker, title, text }) {
  return (
    <section
      style={{
        borderRadius: 26,
        padding: '24px 20px',
        border: '1px solid var(--oa-border)',
        background: 'linear-gradient(135deg, rgba(214,217,224,0.10), rgba(94,234,212,0.08) 42%, rgba(23,27,33,0.94) 100%)',
        marginBottom: 18,
      }}
    >
      <div style={{ color: 'var(--oa-accent)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2 }}>{kicker}</div>
      <h1 style={{ margin: '10px 0 8px', fontSize: 'clamp(30px, 6vw, 52px)', lineHeight: 0.98 }}>{title}</h1>
      <p style={{ margin: 0, color: '#AAB2C0', fontSize: 15, lineHeight: 1.7 }}>{text}</p>
    </section>
  )
}

function enrollmentBadge(status) {
  if (status === 'confirmado') return { label: 'Confirmado', color: '#22C55E', border: 'rgba(34,197,94,0.28)', background: 'rgba(34,197,94,0.12)' }
  if (status === 'pago_en_verificacion') return { label: 'Pago en verificacion', color: '#F59E0B', border: 'rgba(245,158,11,0.28)', background: 'rgba(245,158,11,0.12)' }
  if (status === 'pendiente') return { label: 'En proceso', color: '#F59E0B', border: 'rgba(245,158,11,0.28)', background: 'rgba(245,158,11,0.12)' }
  if (status === 'rechazado') return { label: 'Rechazado', color: '#FF453A', border: 'rgba(255,69,58,0.28)', background: 'rgba(255,69,58,0.12)' }
  return { label: status || 'Sin registro', color: '#AAB2C0', border: 'rgba(170,178,192,0.22)', background: 'rgba(170,178,192,0.08)' }
}

function enrollmentStatusCopy(competition) {
  const status = String(competition?.enrollment_estado || '').trim().toLowerCase()
  const paymentStatus = String(competition?.payment_status || '').trim().toLowerCase()
  if (status === 'pago_en_verificacion') {
    if (paymentStatus === 'approved') return 'Pago confirmado. Estamos activando tu inscripcion en esta competencia.'
    return 'Estamos validando tu pago con Bold. Tu cupo se activara cuando quede confirmado.'
  }
  if (status === 'confirmado') return 'Tu cupo ya esta activo en esta competencia.'
  if (status === 'rechazado') return 'Tu ultimo intento no fue aprobado. Puedes revisar el estado desde la competencia.'
  return ''
}

function CheckinQrModal({ open, onClose, loading, payload, error, competitionName }) {
  if (!open) return null
  return (
    <>
      <button
        type="button"
        aria-label="Cerrar QR"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, border: 'none', background: 'rgba(0,0,0,0.62)', zIndex: 89 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="QR de check-in"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 90,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 'calc(14px + env(safe-area-inset-top, 0px)) 12px calc(14px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div style={{ width: 'min(100%, 520px)', maxHeight: '95dvh', borderRadius: 22, border: '1px solid #252A33', background: '#171B21', boxShadow: '0 24px 80px rgba(0,0,0,0.42)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: '1px solid #252A33', background: 'rgba(23,27,33,0.97)' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, color: '#F5F7FA' }}>Mi QR de check-in</div>
              <div style={{ marginTop: 4, fontSize: 12, color: '#AAB2C0' }}>{competitionName || 'Competencia'}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid #252A33', background: '#0D0F12', color: '#F5F7FA', display: 'grid', placeItems: 'center', padding: 0 }}
            >
              <X size={18} />
            </button>
          </div>
          <div style={{ overflowY: 'auto', padding: 18, display: 'grid', gap: 14 }}>
            {loading ? <div style={{ color: '#AAB2C0' }}>Cargando QR...</div> : null}
            {!loading && error ? <div style={{ color: '#EF4444' }}>{error}</div> : null}
            {!loading && !error && payload ? (
              <>
                <div style={{ borderRadius: 16, background: '#0D0F12', border: '1px solid #252A33', padding: 16, display: 'grid', placeItems: 'center' }}>
                  {payload.qr_image_data_url ? <img src={payload.qr_image_data_url} alt="QR de check-in" style={{ width: '100%', maxWidth: 320, borderRadius: 12, background: '#F5F7FA', padding: 8 }} /> : null}
                </div>
                <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.55)', padding: 14, display: 'grid', gap: 8 }}>
                  <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 700 }}>Codigo de respaldo: <span style={{ color: '#00C2A8' }}>{payload.short_code || '--'}</span></div>
                  <div style={{ color: '#AAB2C0', fontSize: 13 }}>Estado: {payload.check_in_used ? 'Check-in ya usado' : 'Disponible para check-in'}</div>
                  {payload.check_in_used_at ? <div style={{ color: '#AAB2C0', fontSize: 13 }}>Uso registrado: {formatCompetitionDate(payload.check_in_used_at)}</div> : null}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}

export function EventsPage() {
  const { competitions, loading } = useCompetitions()
  const [query, setQuery] = useState('')
  const filteredCompetitions = useMemo(() => filterCompetitionsByQuery(competitions, query), [competitions, query])

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: '24px 18px 140px' }}>
        <TopBlock
          kicker="Eventos"
          title="Eventos para seguir, compartir y competir."
          text="Revisa las competencias visibles, mira sus fechas principales y entra al leaderboard de cada una."
        />
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar competencia por nombre, lugar o descripcion" />

        {loading ? <SkeletonCardGrid count={4} minWidth={260} /> : null}
        {!loading && !competitions.length ? <div style={{ color: '#AAB2C0' }}>Todavia no hay eventos publicados.</div> : null}
        {!loading && !!competitions.length && !filteredCompetitions.length ? <div style={{ color: '#AAB2C0' }}>No hay competencias que coincidan con tu busqueda.</div> : null}

        <div style={{ display: 'grid', gap: 14 }}>
          {filteredCompetitions.map((competition) => {
            const profileImageUrl = resolveCompetitionAsset(competition, 'profile')

            return (
              <article key={competition.id} style={{ borderRadius: 22, border: '1px solid #252A33', background: '#171B21', padding: 18 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      width: 88,
                      minWidth: 88,
                      height: 88,
                      borderRadius: 20,
                      overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: profileImageUrl
                        ? `#0D0F12 url("${profileImageUrl}") center/cover no-repeat`
                        : 'linear-gradient(135deg, rgba(214,217,224,0.18), rgba(94,234,212,0.18))',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {!profileImageUrl ? <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: 1 }}>{competitionMonogram(competition.nombre)}</span> : null}
                  </div>

                  <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 22, fontWeight: 800 }}>{competition.nombre}</div>
                        <div style={{ color: '#AAB2C0', marginTop: 8, lineHeight: 1.6 }}>{truncate(competition.descripcion)}</div>
                      </div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: competition.enrollment_open ? '#22C55E' : 'var(--oa-primary)', fontWeight: 700, fontSize: 12 }}>
                        <Flame size={14} />
                        {competition.enrollment_open ? 'Abierta' : 'Visible'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14, color: '#AAB2C0', fontSize: 13 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <CalendarDays size={14} color="var(--oa-accent)" />
                        {formatCompetitionWindow(competition, { includeYear: false, fallback: 'Fechas de competencia por confirmar' })}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <MapPin size={14} color="var(--oa-primary)" />
                        {competition.lugar || 'Lugar por confirmar'}
                      </span>
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <Link to={`/competitions/${competition.id}`} style={{ color: 'var(--oa-primary)', textDecoration: 'none', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        Ver competencia
                        <ChevronRight size={16} />
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function WorkoutsPage() {
  const { competitions, loading } = useCompetitions()
  const [phaseMap, setPhaseMap] = useState({})

  useEffect(() => {
    if (!competitions.length) return
    let mounted = true
    Promise.all(
      competitions.slice(0, 6).map(async (competition) => {
        try {
          const { data } = await api.get(`/competitions/${competition.id}/phases`)
          return [competition.id, Array.isArray(data) ? data : []]
        } catch {
          return [competition.id, []]
        }
      })
    ).then((entries) => {
      if (!mounted) return
      setPhaseMap(Object.fromEntries(entries))
    })
    return () => {
      mounted = false
    }
  }, [competitions])

  const cards = useMemo(() => competitions.slice(0, 6), [competitions])

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: '24px 18px 140px' }}>
        <TopBlock
          kicker="Workouts"
          title="Una capa para mostrar pruebas, eventos y el tipo de reto que viene."
          text="Explora los workouts publicados para entender el formato del reto y lo que viene en cada evento."
        />

        {loading ? <SkeletonList count={4} /> : null}

        <div style={{ display: 'grid', gap: 14 }}>
          {cards.map((competition) => {
            const phases = phaseMap[competition.id] || []
            return (
              <article key={competition.id} style={{ borderRadius: 22, border: '1px solid #252A33', background: '#171B21', padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{competition.nombre}</div>
                    <div style={{ color: '#AAB2C0', marginTop: 6 }}>Consulta las pruebas cargadas para esta competencia.</div>
                  </div>
                  <Dumbbell size={20} color="#D6D9E0" />
                </div>

                {phases.length ? (
                  <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
                    {phases.slice(0, 3).map((phase, index) => (
                      <div key={phase.id || `${competition.id}-${index}`} style={{ borderRadius: 16, background: 'rgba(13,15,18,0.55)', border: '1px solid rgba(37,42,51,0.9)', padding: 14 }}>
                        <div style={{ fontSize: 14, color: '#5EEAD4', fontWeight: 800 }}>
                          {(phase.phase_format || 'activity') === 'wod' ? `WOD ${index + 1}` : `Actividad ${index + 1}`}
                        </div>
                        <div style={{ marginTop: 4, fontWeight: 700 }}>{phase.nombre}</div>
                        <div style={{ marginTop: 6, color: '#AAB2C0', fontSize: 13, lineHeight: 1.5 }}>{truncate(phase.descripcion, 90)}</div>
                        {Array.isArray(phase.activities) && phase.activities.length > 1 ? (
                          <div style={{ marginTop: 8, color: '#D7DEE8', fontSize: 12, lineHeight: 1.5 }}>
                    {phase.activities.map((activity) => activity?.nombre).filter(Boolean).join(' • ')}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ marginTop: 14, color: '#AAB2C0', fontSize: 13 }}>
                    Esta competencia todavia no tiene workouts publicados.
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function MyEventsPage() {
  const { userId } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrError, setQrError] = useState('')
  const [qrPayload, setQrPayload] = useState(null)
  const [qrCompetitionName, setQrCompetitionName] = useState('')

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    document.body.classList.toggle('fr-modal-open', qrModalOpen)
    return () => document.body.classList.remove('fr-modal-open')
  }, [qrModalOpen])

  const openQrModal = async (competition) => {
    setQrModalOpen(true)
    setQrCompetitionName(competition?.nombre || '')
    setQrLoading(true)
    setQrError('')
    setQrPayload(null)
    try {
      const { data } = await api.get(`/competitions/${competition.id}/my-checkin-qr`)
      setQrPayload(data || null)
    } catch (err) {
      setQrError(err.response?.data?.detail || 'No se pudo cargar tu QR ahora.')
    } finally {
      setQrLoading(false)
    }
  }

  useEffect(() => {
    if (!userId) {
      setItems([])
      setLoading(false)
      return
    }

    let mounted = true
    setLoading(true)
      api.get(`/users/${userId}/competitions`)
      .then(({ data }) => {
        if (!mounted) return
        setItems(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!mounted) return
        setItems([])
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [userId])

  const filteredItems = useMemo(() => filterCompetitionsByQuery(items, query), [items, query])

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: '24px 18px 140px' }}>
        <TopBlock
          kicker="Mis eventos"
          title="Tus inscripciones y eventos en un solo lugar."
          text="Consulta en que competencias estas inscrito, revisa tu estado y entra rapido al detalle o al leaderboard."
        />
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar en tus competencias" />

        {loading ? <SkeletonList count={4} /> : null}
        {!loading && !items.length ? <div style={{ color: '#AAB2C0' }}>Todavia no tienes eventos asociados a tu cuenta.</div> : null}
        {!loading && !!items.length && !filteredItems.length ? <div style={{ color: '#AAB2C0' }}>No hay competencias que coincidan con tu busqueda.</div> : null}

        <div style={{ display: 'grid', gap: 14 }}>
          {filteredItems.map((competition) => {
            const profileImageUrl = resolveCompetitionAsset(competition, 'profile')
            const badge = enrollmentBadge(competition.enrollment_estado)
            const statusCopy = enrollmentStatusCopy(competition)

            return (
              <article key={competition.id} style={{ borderRadius: 22, border: '1px solid #252A33', background: '#171B21', padding: 18 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      width: 88,
                      minWidth: 88,
                      height: 88,
                      borderRadius: 20,
                      overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: profileImageUrl
                        ? `#0D0F12 url("${profileImageUrl}") center/cover no-repeat`
                        : 'linear-gradient(135deg, rgba(214,217,224,0.26), rgba(94,234,212,0.18))',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {!profileImageUrl ? <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: 1 }}>{competitionMonogram(competition.nombre)}</span> : null}
                  </div>

                  <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 22, fontWeight: 800 }}>{competition.nombre}</div>
                        <div style={{ color: '#AAB2C0', marginTop: 8, lineHeight: 1.6 }}>{truncate(competition.descripcion)}</div>
                        {statusCopy ? <div style={{ color: '#D7DEE8', marginTop: 8, lineHeight: 1.6, fontSize: 13 }}>{statusCopy}</div> : null}
                      </div>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontWeight: 800,
                          fontSize: 12,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                          background: badge.background,
                          borderRadius: 999,
                          padding: '8px 12px',
                        }}
                      >
                        <CalendarDays size={14} />
                        {badge.label}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14, color: '#AAB2C0', fontSize: 13 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <CalendarDays size={14} color="#5EEAD4" />
                        {formatCompetitionWindow(competition, { includeYear: false, fallback: 'Fechas de competencia por confirmar' })}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <MapPin size={14} color="var(--oa-primary)" />
                        {competition.lugar || 'Lugar por confirmar'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14 }}>
                      <Link to={`/competitions/${competition.id}`} style={{ color: '#F1F4F8', textDecoration: 'none', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        Ver competencia
                        <ChevronRight size={16} />
                      </Link>
                      <Link to={`/leaderboard/${competition.id}`} style={{ color: '#5EEAD4', textDecoration: 'none', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        Ver leaderboard
                        <ChevronRight size={16} />
                      </Link>
                      {competition.enrollment_estado === 'confirmado' ? (
                        <button
                          type="button"
                          onClick={() => openQrModal(competition)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            borderRadius: 999,
                            border: '1px solid rgba(255,107,0,0.42)',
                            background: 'rgba(255,107,0,0.14)',
                            color: '#FFD8BC',
                            fontWeight: 800,
                            fontSize: 13,
                            padding: '8px 12px',
                          }}
                        >
                          <QrCode size={15} />
                          Ver mi QR
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
      <CheckinQrModal
        open={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        loading={qrLoading}
        payload={qrPayload}
        error={qrError}
        competitionName={qrCompetitionName}
      />
    </div>
  )
}

function formatNotificationTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function findNextScheduledHeat(schedule, athleteId) {
  const now = Date.now()
  return (schedule?.items || [])
    .map((item) => {
      const participant = (item.participants || []).find((entry) => String(entry.user_id ?? entry.id) === String(athleteId))
      if (!participant) return null
      const startMs = Date.parse(item.start_at || '')
      return {
        heatLabel: item.heat_label || `Heat ${item.heat_number || ''}`.trim(),
        phaseName: item.phase_name || 'Workout',
        startAt: item.start_at || '',
        lane: participant.lane_number || participant.lane || '',
        location: [item.location_name, item.location_detail].filter(Boolean).join(' · '),
        sortTime: Number.isFinite(startMs) ? startMs : Number.MAX_SAFE_INTEGER,
      }
    })
    .filter(Boolean)
    .filter((item) => item.sortTime >= now || !item.startAt)
    .sort((a, b) => a.sortTime - b.sortTime)[0] || null
}

function formatHeatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function followStatus(snapshot) {
  if (!snapshot) return { label: 'Pendiente', tone: '#6B7280', icon: Clock3 }
  if (snapshot.rank && snapshot.rank <= 3) return { label: 'Zona podio', tone: '#D4A537', icon: Medal }
  if (snapshot.resultsCount > 0) return { label: 'En competencia', tone: '#00C2A8', icon: CheckCircle2 }
  return { label: 'Sin resultados', tone: '#6B7280', icon: Clock3 }
}

function bestFollowWorkout(snapshot) {
  const rows = (snapshot?.phaseResults || []).filter((item) => item.rank != null)
  if (!rows.length) return null
  return [...rows].sort((a, b) => Number(a.rank) - Number(b.rank))[0]
}

function changeTone(change) {
  if (change?.type === 'rank_up') return { color: '#00C2A8', icon: TrendingUp }
  if (change?.type === 'rank_down') return { color: '#F59E0B', icon: TrendingDown }
  if (change?.type === 'new_result') return { color: '#FF6B00', icon: Flame }
  return { color: '#6B7280', icon: Bell }
}

function FollowDetailCard({ follow, detail, onUnfollow }) {
  const snapshot = detail?.snapshot || null
  const nextHeat = detail?.nextHeat || null
  const bestWorkout = bestFollowWorkout(snapshot)
  const completed = Number(snapshot?.resultsCount || 0)
  const total = Math.max(completed, Number(snapshot?.phaseResults?.length || 0))
  const progressPct = total ? Math.min(100, Math.round((completed / total) * 100)) : 0
  const status = followStatus(snapshot)
  const StatusIcon = status.icon
  const latestChange = detail?.latestChange || null
  const latestTone = changeTone(latestChange)
  const ChangeIcon = latestTone.icon
  const username = detail?.username || follow.username

  return (
    <article style={{ border: '1px solid #252A33', background: '#0D0F12', borderRadius: 16, padding: 14, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: '#F5F7FA', fontWeight: 900, overflowWrap: 'anywhere' }}>{detail?.athleteName || follow.athleteName}</div>
          <div style={{ marginTop: 3, color: '#AAB2C0', fontSize: 12, overflowWrap: 'anywhere' }}>
            {detail?.competitionName || follow.competitionName}{(detail?.category || follow.category) ? ` · ${detail?.category || follow.category}` : ''}
          </div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: status.tone, border: `1px solid ${status.tone}42`, background: `${status.tone}18`, borderRadius: 999, padding: '6px 9px', fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap' }}>
          <StatusIcon size={12} />
          {status.label}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <div style={{ border: '1px solid #252A33', borderRadius: 10, padding: '9px 10px', background: '#171B21' }}>
          <div style={{ color: '#6B7280', fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>Puesto</div>
          <div style={{ color: snapshot?.rank ? '#FF9A3D' : '#6B7280', fontSize: 20, fontWeight: 900 }}>#{snapshot?.rank ?? '-'}</div>
        </div>
        <div style={{ border: '1px solid #252A33', borderRadius: 10, padding: '9px 10px', background: '#171B21' }}>
          <div style={{ color: '#6B7280', fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>Puntos</div>
          <div style={{ color: '#00C2A8', fontSize: 20, fontWeight: 900 }}>{snapshot?.totalPoints ?? '-'}</div>
        </div>
        <div style={{ border: '1px solid #252A33', borderRadius: 10, padding: '9px 10px', background: '#171B21' }}>
          <div style={{ color: '#6B7280', fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>WODs</div>
          <div style={{ color: '#F5F7FA', fontSize: 20, fontWeight: 900 }}>{total ? `${completed}/${total}` : '-'}</div>
        </div>
      </div>

      {total ? (
        <div style={{ height: 7, borderRadius: 999, background: 'rgba(245,247,250,0.10)', overflow: 'hidden' }}>
          <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)' }} />
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ border: `1px solid ${latestTone.color}33`, background: `${latestTone.color}12`, borderRadius: 10, padding: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: latestTone.color, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
            <ChangeIcon size={13} />
            Ultimo cambio
          </div>
          <div style={{ color: '#AAB2C0', fontSize: 12, lineHeight: 1.45, marginTop: 5 }}>
            {latestChange ? `${latestChange.title}. ${latestChange.body}` : 'Sin cambios nuevos desde la ultima revision.'}
          </div>
        </div>
        <div style={{ border: '1px solid #252A33', background: '#171B21', borderRadius: 10, padding: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#00C2A8', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
            <Clock3 size={13} />
            Proximo heat
          </div>
          <div style={{ color: '#AAB2C0', fontSize: 12, lineHeight: 1.45, marginTop: 5 }}>
            {nextHeat
              ? `${nextHeat.phaseName} · ${nextHeat.heatLabel}${nextHeat.lane ? ` · Lane ${nextHeat.lane}` : ''}${nextHeat.startAt ? ` · ${formatHeatTime(nextHeat.startAt)}` : ''}`
              : 'Sin heat publicado por ahora.'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', color: '#6B7280', fontSize: 12 }}>
        {bestWorkout ? <span>Mejor WOD: {bestWorkout.phaseName} #{bestWorkout.rank}</span> : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Link to={`/leaderboard/${follow.competitionId}`} style={{ color: '#FF9A3D', textDecoration: 'none', fontSize: 12, fontWeight: 900 }}>Leaderboard</Link>
        {username ? <Link to={`/a/${username}`} style={{ color: '#00C2A8', textDecoration: 'none', fontSize: 12, fontWeight: 900 }}>Perfil</Link> : null}
        <button type="button" aria-label="Dejar de seguir" onClick={() => onUnfollow(follow)} style={{ marginLeft: 'auto', width: 34, height: 34, borderRadius: 9, border: '1px solid #252A33', background: '#171B21', color: '#AAB2C0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 0, cursor: 'pointer' }}>
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  )
}

export function NotificationsPage() {
  const { session, displayName } = useAuth()
  const [spectatorFollows, setSpectatorFollows] = useState(() => readSpectatorFollows())
  const [spectatorFeed, setSpectatorFeed] = useState([])
  const [appNotifications, setAppNotifications] = useState([])
  const [detailsByKey, setDetailsByKey] = useState({})
  const [checking, setChecking] = useState(false)

  useEffect(() => subscribeSpectatorFollows(setSpectatorFollows), [])

  useEffect(() => {
    if (!session) {
      setAppNotifications([])
      return
    }
    let active = true
    api.get('/me/notifications')
      .then(({ data }) => {
        if (!active) return
        setAppNotifications(Array.isArray(data?.items) ? data.items : [])
      })
      .catch(() => {
        if (active) setAppNotifications([])
      })
    return () => {
      active = false
    }
  }, [session])

  useEffect(() => {
    if (!spectatorFollows.length) {
      setSpectatorFeed([])
      setDetailsByKey({})
      setChecking(false)
      return undefined
    }
    let active = true
    const refresh = async () => {
      setChecking(true)
      try {
        const { detailsByKey: nextDetails, activity } = await fetchFollowSummary(spectatorFollows)
        if (!active) return
        setDetailsByKey(nextDetails)
        setSpectatorFeed(activity)
      } catch {
        if (!active) return
        setDetailsByKey({})
        setSpectatorFeed([])
      } finally {
        if (active) setChecking(false)
      }
    }
    refresh()
    const timer = window.setInterval(refresh, 30000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [spectatorFollows])

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: '24px 18px 140px' }}>
        <TopBlock
          kicker="Notificaciones"
          title="Seguimiento de atletas y actividad reciente."
          text="Mira cambios de puesto, puntos y resultados de los atletas que sigues en este navegador."
        />

        <section style={{ display: 'grid', gap: 14 }}>
          <article style={{ borderRadius: 22, border: '1px solid #252A33', background: '#171B21', padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Trophy size={18} color="#FF6B00" />
                <div style={{ fontWeight: 900 }}>Atletas seguidos</div>
              </div>
              <div style={{ color: checking ? '#00C2A8' : '#6B7280', fontSize: 12, fontWeight: 800 }}>
                {checking ? 'Actualizando' : `${spectatorFollows.length} activos`}
              </div>
            </div>
            {!spectatorFollows.length ? (
              <div style={{ marginTop: 12, color: '#AAB2C0', lineHeight: 1.6 }}>
                Entra a una competencia, abre inscritos o leaderboard y toca Seguir en el atleta.
              </div>
            ) : (
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
                {spectatorFollows.map((follow) => (
                  <FollowDetailCard
                    key={`${follow.competitionId}:${follow.athleteId}`}
                    follow={follow}
                    detail={detailsByKey[`${follow.competitionId}:${follow.athleteId}`]}
                    onUnfollow={(item) => setSpectatorFollows(unfollowAthlete(item.competitionId, item.athleteId))}
                  />
                ))}
              </div>
            )}
          </article>

          <article style={{ borderRadius: 22, border: '1px solid #252A33', background: '#171B21', padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Bell size={18} color="#00C2A8" />
              <div style={{ fontWeight: 900 }}>Actividad detectada</div>
            </div>
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {spectatorFeed.length ? spectatorFeed.map((item) => (
                <div key={item.id} style={{ border: '1px solid rgba(0,194,168,0.22)', background: 'rgba(0,194,168,0.08)', borderRadius: 12, padding: 12 }}>
                  <div style={{ color: '#F5F7FA', fontWeight: 900 }}>{item.title}</div>
                  <div style={{ marginTop: 4, color: '#AAB2C0', fontSize: 13, lineHeight: 1.45 }}>{item.body}</div>
                  <div style={{ marginTop: 8, color: '#6B7280', fontSize: 12 }}>{item.competitionName} · {formatNotificationTime(item.createdAt)}</div>
                </div>
              )) : (
                <div style={{ color: '#AAB2C0', lineHeight: 1.6 }}>
                  {spectatorFollows.length ? 'Sin cambios nuevos desde la ultima revision.' : 'Sigue atletas para ver actividad aqui.'}
                </div>
              )}
            </div>
          </article>

          <article style={{ borderRadius: 22, border: '1px solid #252A33', background: '#171B21', padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Bell size={18} color="#D6D9E0" />
              <div style={{ fontWeight: 800 }}>{session ? `Avisos para ${displayName || 'tu cuenta'}` : 'Novedades y acceso personal'}</div>
            </div>
            {session && appNotifications.length ? (
              <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                {appNotifications.slice(0, 10).map((item) => (
                  <div key={item.id} style={{ border: `1px solid ${item.read_at ? '#252A33' : 'rgba(255,107,0,0.34)'}`, background: item.read_at ? 'rgba(13,15,18,0.5)' : 'rgba(255,107,0,0.08)', borderRadius: 12, padding: 12 }}>
                    <div style={{ color: '#F5F7FA', fontWeight: 900 }}>{item.title}</div>
                    <div style={{ marginTop: 4, color: '#AAB2C0', fontSize: 13, lineHeight: 1.45 }}>{item.body}</div>
                    {item.action_url ? (
                      <a href={item.action_url} style={{ display: 'inline-flex', marginTop: 8, color: '#FF9A3D', fontSize: 12, fontWeight: 900, textDecoration: 'none' }}>Ver leaderboard</a>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 10, color: '#AAB2C0', lineHeight: 1.6 }}>
                {session ? 'Sin avisos nuevos de tu cuenta.' : 'Ingresa para recibir avisos de tus competencias.'}
              </div>
            )}
          </article>

          {!session ? (
            <article style={{ borderRadius: 22, border: '1px solid rgba(214,217,224,0.24)', background: 'rgba(23,27,33,0.94)', padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Lock size={18} color="#5EEAD4" />
                <div style={{ fontWeight: 800 }}>Ingresa para desbloquear notificaciones personalizadas</div>
              </div>
              <div style={{ marginTop: 10 }}>
                <Link to="/login" style={{ textDecoration: 'none', color: '#F1F4F8', fontWeight: 800 }}>
                  Ir a ingresar
                </Link>
              </div>
            </article>
          ) : null}
        </section>
      </div>
    </div>
  )
}
