import {
  AlertTriangle,
  ArrowLeft,
  Dumbbell,
  ExternalLink,
  Instagram,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { COMPETITION_PAGE_MAX_WIDTH } from '../utils/competitionLayout'

const OWNERSHIP_LABELS = {
  verified: { label: 'Verificado', color: '#5eead4' },
  claimed: { label: 'Reclamado', color: '#cdaa6b' },
  claim_pending: { label: 'En revisión', color: '#8b94a3' },
  unclaimed: { label: 'Sin dueño', color: '#8b94a3' },
}

const STAFF_ROLE_LABELS = {
  owner: 'Dueño',
  manager: 'Manager',
  coach: 'Coach',
  staff: 'Staff',
}

function getInitials(value) {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
  if (!parts.length) return 'GY'
  return parts.map((part) => part[0]?.toUpperCase() || '').join('')
}

function buildRosterGradient(index = 0) {
  const gradients = [
    'linear-gradient(145deg, rgba(255,107,0,0.30) 0%, rgba(13,15,18,0.95) 72%)',
    'linear-gradient(145deg, rgba(0,194,168,0.26) 0%, rgba(13,15,18,0.95) 72%)',
    'linear-gradient(145deg, rgba(214,217,224,0.18) 0%, rgba(13,15,18,0.95) 72%)',
  ]
  return gradients[index % gradients.length]
}

const ROSTER_STATUS_META = {
  approved: { label: 'Oficial', color: '#5EEAD4', border: 'rgba(94,234,212,0.28)', background: 'rgba(94,234,212,0.12)' },
}

function buildAthleteProfilePath(username) {
  const value = String(username || '').trim()
  return value ? `/a/${value}` : ''
}

function ProfileNameLink({ username, children, style }) {
  const profilePath = buildAthleteProfilePath(username)
  if (!profilePath) return children
  return (
    <Link
      to={profilePath}
      style={{
        color: 'inherit',
        textDecoration: 'none',
        borderBottom: '1px solid rgba(255,107,0,0.45)',
        transition: 'border-color 0.18s ease, color 0.18s ease',
        ...style,
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.color = '#FF9A3D'
        event.currentTarget.style.borderBottomColor = '#FF9A3D'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.color = 'inherit'
        event.currentTarget.style.borderBottomColor = 'rgba(255,107,0,0.45)'
      }}
    >
      {children}
    </Link>
  )
}

function GymAthleteCard({ athlete, index }) {
  const statusMeta = athlete.status === 'approved' ? ROSTER_STATUS_META.approved : null
  const displayName = athlete.display_name || 'Atleta'
  const subtitle = athlete.categoria || 'Atleta'

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: '#0F1118',
        border: '1px solid #252A33',
        borderRadius: 12,
        color: '#F5F7FA',
        boxShadow: '0 10px 28px rgba(0,0,0,0.24)',
      }}
    >
      <div
        style={{
          width: '100%',
          aspectRatio: '3 / 3.5',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: athlete.profile_photo_url
            ? `linear-gradient(0deg, rgba(8,9,13,0.72), rgba(8,9,13,0.18)), url("${athlete.profile_photo_url}") center/cover`
            : buildRosterGradient(index),
        }}
      >
        <div style={{ position: 'absolute', top: 0, right: 0, width: 64, height: 64, background: 'linear-gradient(225deg, rgba(245,247,250,0.16) 0%, transparent 65%)' }} />
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 2, background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, padding: '3px 7px', fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.52)' }}>
          #{String(index + 1).padStart(3, '0')}
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(8,9,13,0.94) 0%, transparent 55%)', opacity: 0.5 }} />
        {!athlete.profile_photo_url && (
          <div style={{ position: 'relative', zIndex: 1, fontFamily: '"Bebas Neue", sans-serif', fontSize: 78, letterSpacing: '0.02em', opacity: 0.24, color: '#F5F7FA', textShadow: '0 4px 24px rgba(0,0,0,0.8)' }}>
            {getInitials(displayName)}
          </div>
        )}
      </div>
      <div style={{ padding: '14px 14px 16px' }}>
        <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 26, lineHeight: 1.02, letterSpacing: '0.04em', marginBottom: 8, overflowWrap: 'anywhere' }}>
          <ProfileNameLink username={athlete.username}>{displayName}</ProfileNameLink>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <div style={{ width: 6, height: 6, borderRadius: 999, background: '#6B7280', flexShrink: 0 }} />
          <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
            {subtitle}
          </div>
          {statusMeta && (
            <>
              <div style={{ width: 1, height: 10, background: '#252A33' }} />
              <div style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: 4, border: `1px solid ${statusMeta.border}`, background: statusMeta.background, color: statusMeta.color, fontFamily: '"Barlow Condensed", sans-serif', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {statusMeta.label}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionCard({ title, children }) {
  return (
    <section
      className="fr-cut-card"
      style={{
        marginBottom: 28,
        padding: 22,
        background: '#171B21',
        border: '1px solid #252A33',
      }}
    >
      <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--oa-text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 14px' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function AffiliationModal({ gymId, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isPrimary, setIsPrimary] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      await api.post(`/gyms/${gymId}/memberships`, { is_primary: isPrimary })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al enviar la solicitud')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 100,
        display: 'grid',
        placeItems: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#171a20',
          border: '1px solid var(--oa-border)',
          borderRadius: 20,
          padding: 28,
          maxWidth: 380,
          width: '100%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--oa-text)', margin: '0 0 8px' }}>
          Solicitar afiliación
        </h3>
        <p style={{ fontSize: 13, color: 'var(--oa-text-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
          Tu solicitud quedará pendiente hasta que el gym la apruebe.
        </p>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 20 }}>
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: 'var(--oa-accent)' }}
          />
          <span style={{ fontSize: 13, color: 'var(--oa-text-secondary)' }}>
            Marcar como mi gym principal
          </span>
        </label>

        {error && (
          <p style={{ fontSize: 13, color: 'var(--oa-error)', marginBottom: 14 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 12,
              border: '1px solid var(--oa-border)',
              background: 'transparent',
              color: 'var(--oa-text-secondary)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 12,
              border: 'none',
              background: 'var(--oa-accent)',
              color: '#0d0f12',
              fontSize: 14,
              fontWeight: 800,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Enviando...' : 'Solicitar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ClaimModal({ gymId, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [evidenceType, setEvidenceType] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [notes, setNotes] = useState('')

  const handleSubmit = async () => {
    if (!evidenceType) { setError('Selecciona un tipo de evidencia'); return }
    setLoading(true)
    setError('')
    try {
      await api.post(`/gyms/${gymId}/claims`, {
        role_requested: 'owner',
        evidence_type: evidenceType,
        evidence_url: evidenceUrl || null,
        notes: notes || null,
      })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al enviar el claim')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 100,
        display: 'grid',
        placeItems: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#171a20',
          border: '1px solid var(--oa-border)',
          borderRadius: 20,
          padding: 28,
          maxWidth: 420,
          width: '100%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--oa-text)', margin: '0 0 8px' }}>
          Reclamar este gym
        </h3>
        <p style={{ fontSize: 13, color: 'var(--oa-text-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
          Necesitamos verificar que eres el dueño o manager. El equipo revisará tu solicitud.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <select
            value={evidenceType}
            onChange={(e) => setEvidenceType(e.target.value)}
            style={{
              background: '#0d0f12',
              border: '1px solid var(--oa-border)',
              borderRadius: 10,
              padding: '10px 12px',
              color: evidenceType ? 'var(--oa-text)' : 'var(--oa-text-muted)',
              fontSize: 13,
              outline: 'none',
            }}
          >
            <option value="">Tipo de evidencia</option>
            <option value="instagram_dm">DM desde Instagram oficial</option>
            <option value="email_domain">Correo del dominio oficial</option>
            <option value="document">Documento comercial</option>
            <option value="manual">Validación manual (contactar admin)</option>
          </select>

          <input
            value={evidenceUrl}
            onChange={(e) => setEvidenceUrl(e.target.value)}
            placeholder="URL de evidencia (opcional)"
            style={{
              background: '#0d0f12',
              border: '1px solid var(--oa-border)',
              borderRadius: 10,
              padding: '10px 12px',
              color: 'var(--oa-text)',
              fontSize: 13,
              outline: 'none',
            }}
          />

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas adicionales (opcional)"
            rows={3}
            style={{
              background: '#0d0f12',
              border: '1px solid var(--oa-border)',
              borderRadius: 10,
              padding: '10px 12px',
              color: 'var(--oa-text)',
              fontSize: 13,
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {error && (
          <p style={{ fontSize: 13, color: 'var(--oa-error)', marginBottom: 14 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 12,
              border: '1px solid var(--oa-border)',
              background: 'transparent',
              color: 'var(--oa-text-secondary)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 12,
              border: 'none',
              background: '#cdaa6b',
              color: '#0d0f12',
              fontSize: 14,
              fontWeight: 800,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Enviando...' : 'Enviar claim'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReportModal({ gymId, onClose }) {
  const [category, setCategory] = useState('wrong_info')
  const [details, setDetails] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      await api.post(`/gyms/${gymId}/reports`, { category, details: details.trim() || null })
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo enviar el reporte')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button type="button" aria-label="Cerrar" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.68)', border: 'none', zIndex: 79 }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(20px + env(safe-area-inset-top, 0px)) 12px calc(20px + env(safe-area-inset-bottom, 0px))' }}>
        <div role="dialog" aria-modal="true" style={{ width: '100%', maxWidth: 400, borderRadius: 22, border: '1px solid #252A33', background: '#171B21', padding: '18px 16px', boxShadow: '0 24px 80px rgba(0,0,0,0.42)', maxHeight: '100%', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 15, color: '#F5F7FA' }}>
              <AlertTriangle size={16} color="#cdaa6b" /> Reportar información
            </div>
            <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#AAB2C0', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <X size={18} />
            </button>
          </div>

          {done ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ color: '#22c55e', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>✓ Reporte enviado</div>
              <p style={{ color: '#AAB2C0', fontSize: 13, lineHeight: 1.55 }}>El equipo de FinalRep revisará la información. Gracias por ayudar a mantener el directorio actualizado.</p>
              <button type="button" className="btn-secondary btn-sm" onClick={onClose} style={{ marginTop: 16 }}>Cerrar</button>
            </div>
          ) : (
            <>
              {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
              <div className="form-group">
                <label>Tipo de problema</label>
                <select value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="wrong_info">Información incorrecta</option>
                  <option value="closed">Gym cerrado</option>
                  <option value="duplicate">Gym duplicado</option>
                  <option value="other">Otro</option>
                </select>
              </div>
              <div className="form-group">
                <label>Detalles (opcional)</label>
                <textarea
                  rows={3}
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  placeholder="Describe el problema con más detalle..."
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={loading}>Cancelar</button>
                <button type="button" className="btn-primary btn-sm" onClick={handleSubmit} disabled={loading}>
                  {loading ? 'Enviando...' : 'Enviar reporte'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export default function GymPublicProfile() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()

  const [gym, setGym] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [showAffiliationModal, setShowAffiliationModal] = useState(false)
  const [showClaimModal, setShowClaimModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [affiliationSuccess, setAffiliationSuccess] = useState(false)
  const [claimSuccess, setClaimSuccess] = useState(false)
  const [isManager, setIsManager] = useState(false)

  useEffect(() => {
    if (!session) return
    api.get('/me/managed-gyms')
      .then(({ data }) => {
        if (gym && data.some((g) => g.id === gym.id)) setIsManager(true)
      })
      .catch(() => {})
  }, [session, gym])

  useEffect(() => {
    let active = true
    setLoading(true)
    api
      .get(`/gyms/${slug}`)
      .then(({ data }) => {
        if (!active) return
        setGym(data)
      })
      .catch((err) => {
        if (!active) return
        if (err.response?.status === 404) setNotFound(true)
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => { active = false }
  }, [slug])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0f12', display: 'grid', placeItems: 'center', color: 'var(--oa-text-muted)', fontSize: 14 }}>
        Cargando...
      </div>
    )
  }

  if (notFound || !gym) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0f12', display: 'grid', placeItems: 'center', padding: 20 }}>
        <div style={{ textAlign: 'center' }}>
          <Dumbbell size={40} color="var(--oa-border)" style={{ margin: '0 auto 16px' }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--oa-text-secondary)' }}>Gym no encontrado</p>
          <button
            type="button"
            onClick={() => navigate('/gyms')}
            style={{
              marginTop: 16,
              padding: '8px 20px',
              borderRadius: 10,
              border: '1px solid var(--oa-border)',
              background: 'transparent',
              color: 'var(--oa-text-secondary)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Volver al directorio
          </button>
        </div>
      </div>
    )
  }

  const ownership = OWNERSHIP_LABELS[gym.ownership_status] || OWNERSHIP_LABELS.unclaimed
  const athleteCount = gym.athlete_count ?? gym.member_counts?.approved ?? 0
  const rosterTitle = gym.roster_scope === 'official' ? 'Roster oficial' : 'Atletas del gym'
  const gymInitials = getInitials(gym.display_name)
  const canAffiliate = session && !affiliationSuccess
  const canClaim =
    session &&
    !claimSuccess &&
    gym.ownership_status !== 'verified' &&
    gym.ownership_status !== 'claimed'

  return (
    <div style={{ minHeight: '100vh', background: '#0d0f12', paddingBottom: 120 }}>
      <div style={{ maxWidth: COMPETITION_PAGE_MAX_WIDTH, margin: '0 auto', padding: '24px 24px 72px' }}>
        <section
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 28,
            border: '1px solid rgba(37,42,51,0.96)',
            background: gym.cover_image_url
              ? `linear-gradient(180deg, rgba(13,15,18,0.20), rgba(13,15,18,0.84)), url("${gym.cover_image_url}") center/cover`
              : 'linear-gradient(135deg, rgba(214,217,224,0.22), rgba(94,234,212,0.12) 55%, rgba(23,27,33,0.98) 100%)',
            padding: '24px 18px 22px',
            boxShadow: '0 20px 70px rgba(0,0,0,0.28)',
            marginBottom: 18,
          }}
        >
          <div style={{ maxWidth: 860 }}>
          <button
            type="button"
            onClick={() => navigate('/gyms')}
            style={{
              width: 38,
              height: 38,
              padding: 0,
              borderRadius: 999,
              border: '1px solid #252A33',
              background: 'rgba(9,11,14,0.72)',
              color: '#F5F7FA',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              appearance: 'none',
              WebkitAppearance: 'none',
              lineHeight: 0,
              fontSize: 0,
              outline: 'none',
              boxShadow: 'none',
              marginBottom: 18,
            }}
          >
            <ArrowLeft size={16} />
          </button>

          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 24,
              background: gym.logo_url
                ? `#0D0F12 url("${gym.logo_url}") center/cover no-repeat`
                : 'linear-gradient(135deg, rgba(255,107,0,0.26), rgba(0,194,168,0.16))',
              border: '1px solid rgba(245,247,250,0.18)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.24)',
              marginBottom: 16,
              display: 'grid',
              placeItems: 'center',
              color: '#F5F7FA',
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: 34,
              letterSpacing: '0.04em',
            }}
          >
            {gym.logo_url ? null : gymInitials}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 999,
                background: 'rgba(9,11,14,0.7)',
                border: `1px solid ${ownership.color}44`,
                color: '#F5F7FA',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {ownership.label}
            </span>
            {(gym.city || gym.country) && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 999,
                  background: 'rgba(9,11,14,0.62)',
                  border: '1px solid #252A33',
                  color: '#F5F7FA',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                <MapPin size={14} color="#5EEAD4" />
                {[gym.city, gym.country].filter(Boolean).join(', ')}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1
              style={{
                fontFamily: '"Bebas Neue", sans-serif',
                fontSize: 'clamp(34px, 6vw, 60px)',
                lineHeight: 0.95,
                letterSpacing: '0.04em',
                color: '#F5F7FA',
                margin: 0,
              }}
            >
              {gym.display_name}
            </h1>
            {gym.verification_badge && <ShieldCheck size={18} color="#5eead4" />}
          </div>

          {gym.short_description && (
            <p
              style={{
                color: '#D7DEE8',
                fontSize: 14,
                lineHeight: 1.6,
                margin: '10px 0 0',
                maxWidth: 560,
              }}
            >
              {gym.short_description}
            </p>
          )}
          </div>
        </section>

        {/* Stats row */}
        <div
          className="fr-cut-card"
          style={{
            display: 'flex',
            gap: 20,
            padding: '18px 20px',
            border: '1px solid #252A33',
            background: '#171B21',
            marginBottom: 24,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--oa-text)' }}>{athleteCount}</div>
            <div style={{ fontSize: 11, color: 'var(--oa-text-muted)', marginTop: 2 }}>Atletas</div>
          </div>
          {gym.founded_year && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--oa-text)' }}>{gym.founded_year}</div>
              <div style={{ fontSize: 11, color: 'var(--oa-text-muted)', marginTop: 2 }}>Fundado</div>
            </div>
          )}
          {gym.locations?.length > 1 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--oa-text)' }}>{gym.locations.length}</div>
              <div style={{ fontSize: 11, color: 'var(--oa-text-muted)', marginTop: 2 }}>Sedes</div>
            </div>
          )}
        </div>

        {/* Description */}
        {(gym.short_description || gym.full_description) && (
          <div className="fr-cut-card" style={{ marginBottom: 28, padding: 22, background: '#171B21', border: '1px solid #252A33' }}>
            <p style={{ fontSize: 14, color: 'var(--oa-text-secondary)', lineHeight: 1.65, margin: 0 }}>
              {gym.full_description || gym.short_description}
            </p>
          </div>
        )}

        {gym.roster_scope !== 'official' && athleteCount > 0 && (
          <div
            style={{
              marginBottom: 20,
              padding: '12px 14px',
              borderRadius: 14,
              border: '1px solid #252A33',
              background: '#171B21',
              color: '#AAB2C0',
              fontSize: 12,
              lineHeight: 1.55,
            }}
          >
            Este gym todavía no tiene dueño verificado. Por ahora mostramos atletas vinculados desde su perfil.
          </div>
        )}

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
          {(isManager || session?.role === 'admin') && (
            <button
              type="button"
              onClick={() => navigate(`/gyms/${slug}/manage`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 12,
                border: '1px solid rgba(214,217,224,0.28)',
                background: 'rgba(214,217,224,0.08)',
                color: 'var(--oa-text)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Settings size={15} /> Administrar gym
            </button>
          )}
          {canAffiliate && (
            <button
              type="button"
              onClick={() => setShowAffiliationModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 20px',
                borderRadius: 12,
                border: 'none',
                background: 'var(--oa-accent)',
                color: '#0d0f12',
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              <Users size={15} />
              Solicitar afiliación
            </button>
          )}
          {affiliationSuccess && (
            <span style={{ fontSize: 13, color: 'var(--oa-accent)', padding: '10px 0', fontWeight: 600 }}>
              ✓ Solicitud enviada
            </span>
          )}
          {canClaim && (
            <button
              type="button"
              onClick={() => setShowClaimModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: 12,
                border: '1px solid var(--oa-border)',
                background: 'transparent',
                color: 'var(--oa-text-secondary)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <ShieldCheck size={15} />
              Reclamar gym
            </button>
          )}
          {claimSuccess && (
            <span style={{ fontSize: 13, color: '#cdaa6b', padding: '10px 0', fontWeight: 600 }}>
              ✓ Claim enviado, pendiente de revisión
            </span>
          )}
          {session && (
            <button
              type="button"
              onClick={() => setShowReportModal(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--oa-text-muted)',
                fontSize: 12,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 0',
                marginTop: 4,
              }}
            >
              <AlertTriangle size={12} /> Reportar información incorrecta
            </button>
          )}
        </div>

        {/* Staff */}
        {gym.staff?.length > 0 && (
          <SectionCard title="Staff">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {gym.staff.map((s) => (
                <div
                  key={s.user_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: '#171a20',
                    border: '1px solid var(--oa-border)',
                    borderRadius: 12,
                    padding: '8px 12px',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: s.profile_photo_url
                        ? `url(${s.profile_photo_url}) center/cover no-repeat`
                        : '#252b35',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--oa-text)' }}>
                      <ProfileNameLink username={s.username}>{s.display_name}</ProfileNameLink>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--oa-text-muted)' }}>
                      {STAFF_ROLE_LABELS[s.role] || s.role}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Roster */}
        {gym.roster?.length > 0 && (
          <SectionCard title={`${rosterTitle} (${athleteCount})`}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 16,
              }}
            >
              {gym.roster.map((m, index) => (
                <GymAthleteCard key={m.user_id} athlete={m} index={index} />
              ))}
            </div>
          </SectionCard>
        )}

        {/* Contact & links */}
        {(gym.website_url || gym.instagram_url || gym.whatsapp_url || gym.contact_email || gym.contact_phone) && (
          <SectionCard title="Contacto">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {gym.website_url && (
                <a
                  href={gym.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--oa-accent)', fontSize: 13, textDecoration: 'none' }}
                >
                  <ExternalLink size={14} /> {gym.website_url.replace(/^https?:\/\//, '')}
                </a>
              )}
              {gym.instagram_url && (
                <a
                  href={gym.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--oa-text-secondary)', fontSize: 13, textDecoration: 'none' }}
                >
                  <Instagram size={14} /> Instagram
                </a>
              )}
              {gym.whatsapp_url && (
                <a
                  href={gym.whatsapp_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#25d366', fontSize: 13, textDecoration: 'none' }}
                >
                  <MessageCircle size={14} /> WhatsApp
                </a>
              )}
              {gym.contact_email && (
                <a
                  href={`mailto:${gym.contact_email}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--oa-text-secondary)', fontSize: 13, textDecoration: 'none' }}
                >
                  <Mail size={14} /> {gym.contact_email}
                </a>
              )}
              {gym.contact_phone && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--oa-text-secondary)', fontSize: 13 }}>
                  <Phone size={14} /> {gym.contact_phone}
                </span>
              )}
            </div>
          </SectionCard>
        )}

        {/* Locations */}
        {gym.locations?.length > 0 && (
          <SectionCard title="Sedes">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {gym.locations.map((loc) => (
                <div
                  key={loc.id}
                  style={{
                    background: '#171a20',
                    border: '1px solid var(--oa-border)',
                    borderRadius: 12,
                    padding: '12px 16px',
                  }}
                >
                  {loc.name && (
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--oa-text)', marginBottom: 4 }}>
                      {loc.name} {loc.is_primary && <span style={{ fontSize: 11, color: 'var(--oa-text-muted)' }}>(Principal)</span>}
                    </div>
                  )}
                  {(loc.city || loc.country) && (
                    <div style={{ fontSize: 12, color: 'var(--oa-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={11} />
                      {[loc.address_line, loc.city, loc.country].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {loc.schedule_summary && (
                    <div style={{ fontSize: 12, color: 'var(--oa-text-secondary)', marginTop: 6 }}>{loc.schedule_summary}</div>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        )}
      </div>

      {/* Modals */}
      {showAffiliationModal && (
        <AffiliationModal
          gymId={gym.id}
          onClose={() => setShowAffiliationModal(false)}
          onSuccess={() => { setShowAffiliationModal(false); setAffiliationSuccess(true) }}
        />
      )}
      {showClaimModal && (
        <ClaimModal
          gymId={gym.id}
          onClose={() => setShowClaimModal(false)}
          onSuccess={() => { setShowClaimModal(false); setClaimSuccess(true) }}
        />
      )}
      {showReportModal && (
        <ReportModal
          gymId={gym.id}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  )
}
