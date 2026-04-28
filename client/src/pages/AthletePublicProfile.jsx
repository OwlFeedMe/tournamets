import { Copy, MapPin, Medal, ShieldCheck, Trophy, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api/axios'
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

function statCard(label, value, accent = '#FF6B00') {
  return (
    <div
      className="fr-cut-card"
      style={{
        padding: 18,
        background: '#171B21',
        border: '1px solid #252A33',
      }}
    >
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
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function phaseMetricValue(result) {
  const value = result?.marca
  if (value == null) return '-'
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

export default function AthletePublicProfile() {
  const { username } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

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
    document.title = profile?.meta?.title || `${profile.display_name} · FinalRep`
    const description = profile?.meta?.description || ''
    let meta = document.querySelector('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', description)
  }, [profile])

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
    return <div style={{ minHeight: '100dvh', background: '#0D0F12' }} />
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
                  {profile.age ? <span style={{ padding: '4px 9px', borderRadius: 999, background: 'rgba(9,11,14,0.42)', border: '1px solid rgba(245,247,250,0.18)', fontSize: 12 }}>{profile.age} años</span> : null}
                </div>
              </div>
              <button type="button" onClick={handleCopy} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(245,247,250,0.18)', background: copied ? 'rgba(0,194,168,0.18)' : 'rgba(9,11,14,0.48)', color: '#F5F7FA', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
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
          {statCard('Puntos', profile.stats?.total_points ?? 0)}
          {statCard('Eventos', profile.stats?.competitions_count ?? 0, '#00C2A8')}
          {statCard('Resultados', profile.stats?.results_count ?? 0, '#F5F7FA')}
          {statCard('Top 3', profile.stats?.top_three_finishes ?? 0, '#D4A537')}
        </div>

        <div className="fr-cut-card" style={{ padding: 20, background: '#171B21', border: '1px solid #252A33' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Trophy size={16} color="#FF6B00" />
            <div style={{ fontSize: 14, fontWeight: 800 }}>Resultados recientes</div>
          </div>
          {!profile.results?.length ? (
            <div style={{ color: '#AAB2C0', lineHeight: 1.6 }}>Aun no hay resultados publicos para este atleta.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {profile.results.map((item) => (
                <div key={item.id} style={{ borderRadius: 14, border: '1px solid #252A33', background: '#0F1318', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 220, flex: 1 }}>
                    <div style={{ fontWeight: 700, color: '#F5F7FA' }}>{item.competition_slug ? <Link to={`/competitions/${item.competition_slug}`} style={{ color: '#F5F7FA', textDecoration: 'none' }}>{item.competition_name}</Link> : item.competition_name}</div>
                    <div style={{ marginTop: 4, color: '#AAB2C0', fontSize: 13 }}>{item.phase_name || 'Resultado general'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#6B7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Posicion</div>
                      <div style={{ color: '#F5F7FA', fontWeight: 800 }}>{item.posicion ? `#${item.posicion}` : '-'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#6B7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Puntos</div>
                      <div style={{ color: '#FF6B00', fontWeight: 800 }}>{item.puntos ?? 0}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#6B7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{phaseMetricLabel(item)}</div>
                      <div style={{ color: '#00C2A8', fontWeight: 800 }}>{phaseMetricValue(item)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 16, color: '#6B7280', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Medal size={13} />
          FinalRep athlete card
        </div>
      </div>
    </div>
  )
}
