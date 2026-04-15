import { useEffect, useMemo, useState } from 'react'
import { Bell, CalendarDays, ChevronRight, Flame, Lock, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { APP_CONTENT_MAX_WIDTH } from '../utils/competitionLayout'

const pageStyle = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at top, rgba(255,107,0,0.16), transparent 26%), radial-gradient(circle at bottom right, rgba(0,194,168,0.08), transparent 24%), #0D0F12',
  color: '#F5F7FA',
}

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(date)
}

function truncate(text, max = 120) {
  const value = (text || '').trim()
  if (!value) return 'Consulta los detalles del evento y sigue su avance desde el leaderboard.'
  return value.length > max ? `${value.slice(0, max - 1)}...` : value
}

function resolveCompetitionAsset(competition, asset) {
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

function competitionSearchText(competition) {
  return [
    competition?.nombre,
    competition?.descripcion,
    competition?.general_info_text,
    competition?.lugar,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function filterCompetitionsByQuery(items, query) {
  const value = String(query || '').trim().toLowerCase()
  if (!value) return items
  return (items || []).filter((competition) => competitionSearchText(competition).includes(value))
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
        border: '1px solid rgba(255,107,0,0.22)',
        background: 'linear-gradient(135deg, rgba(255,107,0,0.15), rgba(255,154,61,0.06) 42%, rgba(23,27,33,0.94) 100%)',
        marginBottom: 18,
      }}
    >
      <div style={{ color: '#00C2A8', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2 }}>{kicker}</div>
      <h1 style={{ margin: '10px 0 8px', fontSize: 'clamp(30px, 6vw, 52px)', lineHeight: 0.98 }}>{title}</h1>
      <p style={{ margin: 0, color: '#AAB2C0', fontSize: 15, lineHeight: 1.7 }}>{text}</p>
    </section>
  )
}

function enrollmentBadge(status) {
  if (status === 'confirmado') return { label: 'Confirmado', color: '#22C55E', border: 'rgba(34,197,94,0.28)', background: 'rgba(34,197,94,0.12)' }
  if (status === 'pendiente') return { label: 'En proceso', color: '#F59E0B', border: 'rgba(245,158,11,0.28)', background: 'rgba(245,158,11,0.12)' }
  if (status === 'rechazado') return { label: 'Rechazado', color: '#FF453A', border: 'rgba(255,69,58,0.28)', background: 'rgba(255,69,58,0.12)' }
  return { label: status || 'Sin registro', color: '#AAB2C0', border: 'rgba(170,178,192,0.22)', background: 'rgba(170,178,192,0.08)' }
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

        {loading ? <div style={{ color: '#AAB2C0' }}>Cargando eventos...</div> : null}
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
                        : 'linear-gradient(135deg, rgba(255,107,0,0.26), rgba(0,194,168,0.18))',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {!profileImageUrl ? <Trophy size={26} color="#F5F7FA" /> : null}
                  </div>

                  <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 22, fontWeight: 800 }}>{competition.nombre}</div>
                        <div style={{ color: '#AAB2C0', marginTop: 8, lineHeight: 1.6 }}>{truncate(competition.descripcion)}</div>
                      </div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: competition.enrollment_open ? '#22C55E' : '#FF6B00', fontWeight: 700, fontSize: 12 }}>
                        <Flame size={14} />
                        {competition.enrollment_open ? 'Abierta' : 'Visible'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14, color: '#AAB2C0', fontSize: 13 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <CalendarDays size={14} color="#00C2A8" />
                        {formatDate(competition.enrollment_start) || 'Sin fecha de inicio'}{competition.enrollment_end ? ` - ${formatDate(competition.enrollment_end)}` : ''}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Trophy size={14} color="#D4A537" />
                        Pagina publica
                      </span>
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <Link to={`/competitions/${competition.id}`} style={{ color: '#FF9A3D', textDecoration: 'none', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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

        {loading ? <div style={{ color: '#AAB2C0' }}>Cargando workouts...</div> : null}

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
                  <Dumbbell size={20} color="#FF6B00" />
                </div>

                {phases.length ? (
                  <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
                    {phases.slice(0, 3).map((phase, index) => (
                      <div key={phase.id || `${competition.id}-${index}`} style={{ borderRadius: 16, background: 'rgba(13,15,18,0.55)', border: '1px solid rgba(37,42,51,0.9)', padding: 14 }}>
                        <div style={{ fontSize: 14, color: '#00C2A8', fontWeight: 800 }}>
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
  const { participantId } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!participantId) {
      setItems([])
      setLoading(false)
      return
    }

    let mounted = true
    setLoading(true)
    api.get(`/participants/${participantId}/competitions`)
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
  }, [participantId])

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

        {loading ? <div style={{ color: '#AAB2C0' }}>Cargando tus eventos...</div> : null}
        {!loading && !items.length ? <div style={{ color: '#AAB2C0' }}>Todavia no tienes eventos asociados a tu cuenta.</div> : null}
        {!loading && !!items.length && !filteredItems.length ? <div style={{ color: '#AAB2C0' }}>No hay competencias que coincidan con tu busqueda.</div> : null}

        <div style={{ display: 'grid', gap: 14 }}>
          {filteredItems.map((competition) => {
            const profileImageUrl = resolveCompetitionAsset(competition, 'profile')
            const badge = enrollmentBadge(competition.enrollment_estado)

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
                        : 'linear-gradient(135deg, rgba(255,107,0,0.26), rgba(0,194,168,0.18))',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {!profileImageUrl ? <Trophy size={26} color="#F5F7FA" /> : null}
                  </div>

                  <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 22, fontWeight: 800 }}>{competition.nombre}</div>
                        <div style={{ color: '#AAB2C0', marginTop: 8, lineHeight: 1.6 }}>{truncate(competition.descripcion)}</div>
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
                        <CalendarDays size={14} color="#00C2A8" />
                        {formatDate(competition.enrollment_start) || 'Sin fecha de inicio'}
                        {competition.enrollment_end ? ` - ${formatDate(competition.enrollment_end)}` : ''}
                      </span>
                      {competition.enrollment_categoria ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Trophy size={14} color="#D4A537" />
                          Categoria: {competition.enrollment_categoria}
                        </span>
                      ) : null}
                    </div>

                    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14 }}>
                      <Link to={`/competitions/${competition.id}`} style={{ color: '#FF9A3D', textDecoration: 'none', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        Ver competencia
                        <ChevronRight size={16} />
                      </Link>
                      <Link to={`/leaderboard/${competition.id}`} style={{ color: '#00C2A8', textDecoration: 'none', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        Ver leaderboard
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

export function NotificationsPage() {
  const { session, displayName } = useAuth()

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: '24px 18px 140px' }}>
        <TopBlock
          kicker="Notificaciones"
          title="Avisos clave de competencias y actividad reciente."
          text="Encuentra novedades importantes, aperturas, cambios de evento y actualizaciones relacionadas con tu cuenta o con los eventos visibles."
        />

        <section style={{ display: 'grid', gap: 14 }}>
          <article style={{ borderRadius: 22, border: '1px solid #252A33', background: '#171B21', padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Bell size={18} color="#FF6B00" />
              <div style={{ fontWeight: 800 }}>{session ? `Avisos para ${displayName || 'tu cuenta'}` : 'Novedades y acceso personal'}</div>
            </div>
            <div style={{ marginTop: 10, color: '#AAB2C0', lineHeight: 1.6 }}>
              {session
                ? 'Revisa aperturas de eventos, recordatorios de evento, movimientos del leaderboard y mensajes relacionados con tu participacion.'
                : 'Consulta novedades generales e ingresa para ver alertas personalizadas de tus competencias.'}
            </div>
          </article>

          {!session ? (
            <article style={{ borderRadius: 22, border: '1px solid rgba(255,107,0,0.24)', background: 'rgba(23,27,33,0.94)', padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Lock size={18} color="#00C2A8" />
                <div style={{ fontWeight: 800 }}>Ingresa para desbloquear notificaciones personalizadas</div>
              </div>
              <div style={{ marginTop: 10 }}>
                <Link to="/login" style={{ textDecoration: 'none', color: '#FF9A3D', fontWeight: 800 }}>
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
