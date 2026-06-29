import { CalendarDays, ChevronRight, Copy, MapPin, Medal, ShieldCheck, Trophy, UserRound, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api/axios'
import { SkeletonBlock, SkeletonList, SkeletonMetricGrid } from '../components/layout/Skeleton'
import { APP_CONTENT_MAX_WIDTH } from '../utils/competitionLayout'

const COVER_PRESET_BACKGROUNDS = {
  ember: 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)',
  carbon: 'linear-gradient(135deg, #090B0E 0%, #171B21 52%, #252A33 100%)',
  surge: 'linear-gradient(135deg, #00C2A8 0%, #0D0F12 100%)',
  ignite: 'linear-gradient(135deg, #FF6B00 0%, #171B21 58%, #0D0F12 100%)',
  podium: 'linear-gradient(135deg, #D4A537 0%, #A16207 42%, #090B0E 100%)',
}

function resolveCoverBackground(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return COVER_PRESET_BACKGROUNDS[normalized] || COVER_PRESET_BACKGROUNDS.ember
}

function StatCard({ label, value, accent = '#FF6B00' }) {
  return (
    <div className="fr-cut-card" style={{ padding: 18, background: '#171B21', border: '1px solid #252A33' }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#6B7280' }}>{label}</div>
      <div style={{ marginTop: 8, fontFamily: '"Bebas Neue", monospace', fontSize: 38, lineHeight: 1, color: accent }}>{value}</div>
    </div>
  )
}

function normalizeMeasurementMethod(value) {
  return String(value || '').trim().toLowerCase()
}

function phaseMetricLabel(result) {
  const method = normalizeMeasurementMethod(result?.measurement_method)
  if (method === 'for_time' || method === 'tiempo_hms') return 'Tiempo'
  if (method === 'metros') return 'Metros'
  if (method === 'amrap' || method === 'emom' || method === 'repeticiones') return 'Reps'
  if (method === 'rm' || method === 'kilogramos' || method === 'gramos' || method === 'libras') return 'Peso'
  if (method === 'posicion') return 'Posicion'
  return 'Resultado'
}

function formatSecondsToHMS(totalSeconds) {
  const n = Number(totalSeconds)
  if (!Number.isFinite(n)) return '-'
  const secs = Math.max(0, Math.floor(n))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function phaseMetricValue(result) {
  const value = result?.marca
  if (value == null) return ''
  const method = normalizeMeasurementMethod(result?.measurement_method)
  if (method === 'for_time' || method === 'tiempo_hms') return formatSecondsToHMS(value)
  if (method === 'metros') return `${value} m`
  if (method === 'amrap' || method === 'emom' || method === 'repeticiones') return `${value} reps`
  if (method === 'rm' || method === 'kilogramos') return `${value} kg`
  if (method === 'gramos') return `${value} g`
  if (method === 'libras') return `${value} lb`
  if (method === 'posicion') return `#${value}`
  return String(value)
}

function formatEventDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function enrollmentLabel(status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'confirmado') return 'Inscrito'
  if (normalized === 'pago_en_verificacion') return 'Pago en revision'
  if (normalized === 'pendiente') return 'En proceso'
  if (normalized === 'rechazado') return 'Rechazado'
  return 'Sin resultados'
}

function eventSummary(event) {
  const count = Number(event?.results_count || event?.results?.length || 0)
  if (count > 0) return `${count} resultado${count === 1 ? '' : 's'}`
  const status = String(event?.enrollment_status || '').trim().toLowerCase()
  if (status === 'confirmado') return 'Solo inscrito'
  return enrollmentLabel(status)
}

function normalizeEvents(profile) {
  if (Array.isArray(profile?.events) && profile.events.length) return profile.events
  if (!Array.isArray(profile?.results) || !profile.results.length) return []
  const grouped = new Map()
  profile.results.forEach((result) => {
    const id = result.competition_id
    if (!grouped.has(id)) {
      grouped.set(id, {
        id,
        name: result.competition_name || 'Evento',
        slug: result.competition_slug,
        start_at: result.competition_start,
        location: result.competition_location,
        results: [],
      })
    }
    grouped.get(id).results.push(result)
  })
  return Array.from(grouped.values()).map((event) => ({
    ...event,
    results_count: event.results.length,
    total_points: event.results.reduce((sum, item) => sum + Number(item.puntos || 0), 0) || null,
  }))
}

function EventDetailModal({ event, onClose }) {
  useEffect(() => {
    if (!event) return undefined
    document.body.classList.add('fr-modal-open')
    window.dispatchEvent(new CustomEvent('finalrep:overlay-visibility', { detail: { open: true } }))
    return () => {
      document.body.classList.remove('fr-modal-open')
      window.dispatchEvent(new CustomEvent('finalrep:overlay-visibility', { detail: { open: false } }))
    }
  }, [event])

  if (!event) return null
  const results = Array.isArray(event.results) ? event.results : []

  return (
    <div role="dialog" aria-modal="true" aria-label={`Detalle de ${event.name}`} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(14px + env(safe-area-inset-top, 0px)) 12px calc(14px + env(safe-area-inset-bottom, 0px))' }}>
      <div style={{ width: '100%', maxWidth: 700, maxHeight: 'calc(100dvh - 28px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#171B21', border: '1px solid #252A33', borderRadius: 8, boxShadow: '0 28px 90px rgba(0,0,0,0.46)' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, padding: '16px 18px', borderBottom: '1px solid #252A33', background: 'rgba(23,27,33,0.98)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#6B7280', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>{eventSummary(event)}</div>
            <div style={{ color: '#F5F7FA', fontSize: 20, fontWeight: 900, marginTop: 5, overflowWrap: 'anywhere' }}>{event.name}</div>
            <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {event.category ? <span>{event.category}</span> : null}
              {formatEventDate(event.start_at) ? <span>{formatEventDate(event.start_at)}</span> : null}
              {event.location ? <span>{event.location}</span> : null}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar detalle" style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid #252A33', background: '#090B0E', color: '#F5F7FA', display: 'grid', placeItems: 'center', padding: 0, flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: 18, display: 'grid', gap: 12 }}>
          {!results.length ? (
            <div style={{ border: '1px solid #252A33', background: '#0D0F12', borderRadius: 8, padding: 16, color: '#AAB2C0', lineHeight: 1.6 }}>
              {event.enrollment_status === 'confirmado' ? 'Inscripcion registrada. Aun no hay resultados publicados.' : enrollmentLabel(event.enrollment_status)}
            </div>
          ) : results.map((result) => {
            const metric = phaseMetricValue(result)
            const hasPoints = result.puntos != null && Number(result.puntos) > 0
            return (
              <div key={result.id} style={{ border: '1px solid #252A33', background: '#0D0F12', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#F5F7FA', fontWeight: 850 }}>{result.phase_name || 'Resultado general'}</div>
                    {result.created_at ? <div style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>{formatEventDate(result.created_at)}</div> : null}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {result.posicion ? <span style={{ padding: '6px 9px', borderRadius: 999, background: 'rgba(212,165,55,0.12)', border: '1px solid rgba(212,165,55,0.26)', color: '#D4A537', fontSize: 12, fontWeight: 850 }}>#{result.posicion}</span> : null}
                    {hasPoints ? <span style={{ padding: '6px 9px', borderRadius: 999, background: 'rgba(255,107,0,0.12)', border: '1px solid rgba(255,107,0,0.26)', color: '#FF9A3D', fontSize: 12, fontWeight: 850 }}>{result.puntos} pts</span> : null}
                    {metric ? <span style={{ padding: '6px 9px', borderRadius: 999, background: 'rgba(0,194,168,0.12)', border: '1px solid rgba(0,194,168,0.26)', color: '#00C2A8', fontSize: 12, fontWeight: 850 }}>{phaseMetricLabel(result)}: {metric}</span> : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function AthletePublicProfile() {
  const { username } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)

  useEffect(() => {
    let active = true
    setError('')
    setProfile(null)
    api.get(`/users/public/${username}`)
      .then(({ data }) => {
        if (!active) return
        setProfile(data)
        if (data?.canonical_path && data.canonical_path !== `/a/${username}`) {
          navigate(data.canonical_path, { replace: true })
        }
      })
      .catch((err) => {
        if (!active) return
        setError(err.response?.data?.detail || 'No se pudo cargar el perfil')
      })
    return () => { active = false }
  }, [navigate, username])

  useEffect(() => {
    if (!profile) return
    document.title = profile?.meta?.title || `${profile.display_name} - FinalRep`
    const description = profile?.meta?.description || ''
    let meta = document.querySelector('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', description)
  }, [profile])

  const events = useMemo(() => normalizeEvents(profile), [profile])

  const stats = useMemo(() => {
    if (!profile) return []
    const items = [{ label: 'Eventos', value: profile.stats?.competitions_count ?? events.length, accent: '#00C2A8' }]
    if (Number(profile.stats?.total_points || 0) > 0) items.unshift({ label: 'Puntos', value: profile.stats.total_points, accent: '#FF6B00' })
    if (Number(profile.stats?.results_count || 0) > 0) items.push({ label: 'Resultados', value: profile.stats.results_count, accent: '#F5F7FA' })
    if (Number(profile.stats?.top_three_finishes || 0) > 0) items.push({ label: 'Top 3', value: profile.stats.top_three_finishes, accent: '#D4A537' })
    return items
  }, [events.length, profile])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  if (error) {
    return (
      <div style={{ minHeight: '100dvh', background: '#0D0F12', color: '#F5F7FA' }}>
        <div style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: '48px 20px' }}>
          <div className="fr-cut-card" style={{ padding: 24, background: '#171B21', border: '1px solid #252A33' }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Perfil no disponible</div>
            <div style={{ marginTop: 10, color: '#AAB2C0', lineHeight: 1.6 }}>{error}</div>
          </div>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div style={{ minHeight: '100dvh', background: '#0D0F12', color: '#F5F7FA' }}>
        <div style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: '20px 12px 40px' }}>
          <div className="fr-cut-card" style={{ overflow: 'hidden', border: '1px solid #252A33', background: '#171B21', marginBottom: 18 }}>
            <SkeletonBlock height={220} radius={0} />
            <div style={{ padding: 22 }}>
              <SkeletonBlock width="42%" height={42} radius={8} />
              <SkeletonBlock width="24%" height={14} radius={999} style={{ marginTop: 12 }} />
            </div>
          </div>
          <SkeletonMetricGrid count={4} minWidth={170} />
          <div className="fr-cut-card" style={{ marginTop: 18, padding: 20, background: '#171B21', border: '1px solid #252A33' }}>
            <SkeletonList count={3} />
          </div>
        </div>
      </div>
    )
  }

  const coverBackground = resolveCoverBackground(profile.cover_url)

  return (
    <div style={{ minHeight: '100dvh', background: '#0D0F12', color: '#F5F7FA' }}>
      <div style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: '20px 12px 40px' }}>
        <div className="fr-cut-card" style={{ overflow: 'hidden', border: '1px solid #252A33', background: '#171B21', marginBottom: 18 }}>
          <div style={{ minHeight: 220, background: coverBackground, padding: 24, display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', width: '100%', flexWrap: 'wrap' }}>
              <div style={{ width: 92, height: 92, borderRadius: '50%', border: '3px solid rgba(245,247,250,0.24)', background: 'rgba(13,15,18,0.5)', overflow: 'hidden', display: 'grid', placeItems: 'center', fontSize: 34, fontWeight: 800 }}>
                {profile.avatar_url ? <img src={profile.avatar_url} alt={profile.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserRound size={40} />}
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontFamily: '"Bebas Neue", monospace', fontSize: 42, lineHeight: 1, letterSpacing: '0.03em' }}>{profile.display_name}</div>
                  {profile.verified_athlete ? <ShieldCheck size={18} color="#00C2A8" /> : null}
                </div>
                <div style={{ marginTop: 6, color: '#D7DEE8', fontSize: 14, fontWeight: 700 }}>@{profile.username}</div>
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {profile.categoria ? <span style={{ padding: '4px 9px', borderRadius: 999, background: 'rgba(9,11,14,0.42)', border: '1px solid rgba(245,247,250,0.18)', fontSize: 12 }}>{profile.categoria}</span> : null}
                  {profile.gym?.display_name ? <Link to={`/gyms/${profile.gym.slug}`} style={{ padding: '4px 9px', borderRadius: 999, background: 'rgba(9,11,14,0.42)', border: '1px solid rgba(245,247,250,0.18)', fontSize: 12, color: '#F5F7FA', textDecoration: 'none' }}>{profile.gym.display_name}</Link> : null}
                  {profile.city ? <span style={{ padding: '4px 9px', borderRadius: 999, background: 'rgba(9,11,14,0.42)', border: '1px solid rgba(245,247,250,0.18)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}><MapPin size={12} /> {profile.city}</span> : null}
                  {profile.age ? <span style={{ padding: '4px 9px', borderRadius: 999, background: 'rgba(9,11,14,0.42)', border: '1px solid rgba(245,247,250,0.18)', fontSize: 12 }}>{profile.age} anos</span> : null}
                </div>
              </div>
              <button type="button" onClick={handleCopy} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(245,247,250,0.18)', background: copied ? 'rgba(0,194,168,0.18)' : 'rgba(9,11,14,0.48)', color: '#F5F7FA', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <Copy size={14} />
                {copied ? 'Copiado' : 'Compartir perfil'}
              </button>
            </div>
          </div>
          {profile.bio ? (
            <div style={{ padding: '18px 22px 22px', color: '#D7DEE8', lineHeight: 1.65, borderTop: '1px solid #252A33' }}>
              {profile.bio}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 18 }}>
          {stats.map((item) => <StatCard key={item.label} label={item.label} value={item.value} accent={item.accent} />)}
        </div>

        <div className="fr-cut-card" style={{ padding: 20, background: '#171B21', border: '1px solid #252A33' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Trophy size={16} color="#FF6B00" />
            <div style={{ fontSize: 14, fontWeight: 800 }}>Eventos</div>
          </div>
          {!events.length ? (
            <div style={{ color: '#AAB2C0', lineHeight: 1.6 }}>Aun no hay eventos publicos para este atleta.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {events.map((event) => {
                const resultCount = Number(event.results_count || event.results?.length || 0)
                return (
                  <button key={event.id} type="button" onClick={() => setSelectedEvent(event)} style={{ textAlign: 'left', borderRadius: 8, border: '1px solid #252A33', background: '#0F1318', color: '#F5F7FA', padding: 0, overflow: 'hidden', display: 'grid', minHeight: 188 }}>
                    <div style={{ height: 5, background: resultCount > 0 ? 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)' : '#252A33' }} />
                    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 900, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{event.name}</div>
                          {event.category ? <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 5 }}>{event.category}</div> : null}
                        </div>
                        <ChevronRight size={18} color="#AAB2C0" style={{ flexShrink: 0 }} />
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <span style={{ padding: '5px 8px', borderRadius: 999, background: 'rgba(0,194,168,0.12)', border: '1px solid rgba(0,194,168,0.22)', color: '#B9FFF4', fontSize: 12, fontWeight: 800 }}>{eventSummary(event)}</span>
                        {event.start_at ? <span style={{ padding: '5px 8px', borderRadius: 999, background: 'rgba(170,178,192,0.10)', border: '1px solid rgba(170,178,192,0.18)', color: '#D7DEE8', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}><CalendarDays size={12} /> {formatEventDate(event.start_at)}</span> : null}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: event.total_points || event.best_position ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: 8 }}>
                        {event.total_points ? (
                          <div style={{ border: '1px solid #252A33', borderRadius: 8, background: '#090B0E', padding: '9px 10px' }}>
                            <div style={{ color: '#6B7280', fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>Puntos</div>
                            <div style={{ color: '#FF9A3D', fontSize: 18, fontWeight: 900, marginTop: 2 }}>{event.total_points}</div>
                          </div>
                        ) : null}
                        {event.best_position ? (
                          <div style={{ border: '1px solid #252A33', borderRadius: 8, background: '#090B0E', padding: '9px 10px' }}>
                            <div style={{ color: '#6B7280', fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>Mejor puesto</div>
                            <div style={{ color: '#D4A537', fontSize: 18, fontWeight: 900, marginTop: 2 }}>#{event.best_position}</div>
                          </div>
                        ) : null}
                        {!event.total_points && !event.best_position ? (
                          <div style={{ border: '1px solid #252A33', borderRadius: 8, background: '#090B0E', padding: '10px', color: '#AAB2C0', fontSize: 12, lineHeight: 1.45 }}>
                            {resultCount ? 'Resultados registrados sin puntuacion publica.' : 'Inscripcion registrada.'}
                          </div>
                        ) : null}
                      </div>

                      {event.location ? <div style={{ color: '#6B7280', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><MapPin size={12} /> {event.location}</div> : null}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ marginTop: 16, color: '#6B7280', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Medal size={13} />
          FinalRep
        </div>
      </div>
      <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  )
}
