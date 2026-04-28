import { Dumbbell, MapPin, Search, ShieldCheck, Users, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'

const OWNERSHIP_LABELS = {
  verified: { label: 'Verificado', color: '#5eead4' },
  claimed: { label: 'Reclamado', color: '#cdaa6b' },
  claim_pending: { label: 'En revisión', color: '#8b94a3' },
  unclaimed: { label: 'No reclamado', color: '#8b94a3' },
}

function GymCard({ gym, onClick }) {
  const ownership = OWNERSHIP_LABELS[gym.ownership_status] || OWNERSHIP_LABELS.unclaimed

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        background: '#171a20',
        border: '1px solid var(--oa-border)',
        borderRadius: 16,
        padding: 0,
        cursor: 'pointer',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(214,217,224,0.28)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--oa-border)')}
    >
      {/* Cover */}
      <div
        style={{
          height: 80,
          background: gym.cover_image_url
            ? `url(${gym.cover_image_url}) center/cover no-repeat`
            : 'linear-gradient(135deg, #1e2229 0%, #252b35 100%)',
          position: 'relative',
        }}
      >
      </div>

      {/* Content */}
      <div style={{ padding: '12px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {/* Logo */}
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              border: '1px solid var(--oa-border)',
              background: gym.logo_url
                ? `url(${gym.logo_url}) center/cover no-repeat`
                : '#252b35',
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
              marginTop: -28,
              position: 'relative',
              zIndex: 1,
            }}
          >
            {!gym.logo_url && <Dumbbell size={20} color="var(--oa-text-muted)" />}
          </div>

          <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'var(--oa-text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {gym.display_name}
              </span>
              {gym.verification_badge && <ShieldCheck size={14} color="#5eead4" />}
            </div>

            {(gym.city || gym.country) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 2,
                  color: 'var(--oa-text-muted)',
                  fontSize: 12,
                }}
              >
                <MapPin size={11} />
                <span>
                  {[gym.city, gym.country].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
          </div>
        </div>

        {gym.short_description && (
          <p
            style={{
              fontSize: 12,
              color: 'var(--oa-text-secondary)',
              marginTop: 10,
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {gym.short_description}
          </p>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Users size={12} color="var(--oa-text-muted)" />
            <span style={{ fontSize: 12, color: 'var(--oa-text-muted)' }}>
              {gym.athlete_count ?? gym.approved_members ?? 0} atletas
            </span>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: ownership.color,
              padding: '2px 8px',
              borderRadius: 999,
              border: `1px solid ${ownership.color}33`,
              background: `${ownership.color}11`,
            }}
          >
            {ownership.label}
          </span>
        </div>
      </div>
    </button>
  )
}

export default function GymsPage() {
  const navigate = useNavigate()
  const { session } = useAuth()

  const [gyms, setGyms] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const [q, setQ] = useState('')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [ownershipFilter, setOwnershipFilter] = useState('')

  const offsetRef = useRef(0)
  const LIMIT = 24

  const fetchGyms = useCallback(
    async ({ reset = false } = {}) => {
      const newOffset = reset ? 0 : offsetRef.current
      if (reset) setLoading(true)
      else setLoadingMore(true)

      try {
        const params = new URLSearchParams({ limit: LIMIT, offset: newOffset })
        if (q) params.set('q', q)
        if (country) params.set('country', country)
        if (city) params.set('city', city)
        if (ownershipFilter) params.set('ownership_status', ownershipFilter)

        const { data } = await api.get(`/gyms?${params}`)
        if (reset) {
          setGyms(data.items)
          offsetRef.current = data.items.length
        } else {
          setGyms((prev) => [...prev, ...data.items])
          offsetRef.current += data.items.length
        }
        setTotal(data.total)
      } catch {
        if (reset) setGyms([])
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [q, country, city, ownershipFilter],
  )

  useEffect(() => {
    const t = setTimeout(() => fetchGyms({ reset: true }), 250)
    return () => clearTimeout(t)
  }, [fetchGyms])

  const hasMore = gyms.length < total

  return (
    <div style={{ minHeight: '100vh', background: '#0d0f12', paddingBottom: 120 }}>
      {/* Header */}
      <div
        style={{
          padding: '32px 20px 0',
          maxWidth: 900,
          margin: '0 auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Dumbbell size={22} color="var(--oa-accent)" />
          <h1
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: 'var(--oa-text)',
              margin: 0,
              fontFamily: 'Bebas Neue, sans-serif',
              letterSpacing: 1,
            }}
          >
            Gyms
          </h1>
        </div>
        <p style={{ fontSize: 14, color: 'var(--oa-text-muted)', margin: '0 0 20px' }}>
          Directorio de boxes y gyms de la comunidad
        </p>

        {/* Search & filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#171a20',
              border: '1px solid var(--oa-border)',
              borderRadius: 14,
              padding: '10px 14px',
            }}
          >
            <Search size={16} color="var(--oa-text-muted)" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar gym..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--oa-text)',
                fontSize: 14,
              }}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--oa-text-muted)', display: 'flex' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="País"
              style={{
                flex: 1,
                minWidth: 100,
                background: '#171a20',
                border: '1px solid var(--oa-border)',
                borderRadius: 10,
                padding: '8px 12px',
                color: 'var(--oa-text)',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ciudad"
              style={{
                flex: 1,
                minWidth: 100,
                background: '#171a20',
                border: '1px solid var(--oa-border)',
                borderRadius: 10,
                padding: '8px 12px',
                color: 'var(--oa-text)',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <select
              value={ownershipFilter}
              onChange={(e) => setOwnershipFilter(e.target.value)}
              style={{
                background: '#171a20',
                border: '1px solid var(--oa-border)',
                borderRadius: 10,
                padding: '8px 12px',
                color: ownershipFilter ? 'var(--oa-text)' : 'var(--oa-text-muted)',
                fontSize: 13,
                outline: 'none',
              }}
            >
              <option value="">Estado ownership</option>
              <option value="verified">Verificado</option>
              <option value="claimed">Reclamado</option>
              <option value="unclaimed">No reclamado</option>
            </select>
          </div>
        </div>

        {/* CTA suggest gym */}
        {session && (
          <button
            type="button"
            onClick={() => navigate('/gyms/suggest')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 10,
              border: '1px solid var(--oa-border)',
              background: 'transparent',
              color: 'var(--oa-text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: 20,
            }}
          >
            <Dumbbell size={14} />
            Sugerir gym nuevo
          </button>
        )}
      </div>

      {/* Grid */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--oa-text-muted)', padding: '60px 0', fontSize: 14 }}>
            Cargando gyms...
          </div>
        ) : gyms.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: 'var(--oa-text-muted)',
            }}
          >
            <Dumbbell size={40} color="var(--oa-border)" style={{ margin: '0 auto 16px' }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--oa-text-secondary)', marginBottom: 4 }}>
              No se encontraron gyms
            </p>
            <p style={{ fontSize: 13 }}>Intenta con otros filtros o sugiere un gym nuevo</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 12, color: 'var(--oa-text-muted)', marginBottom: 16 }}>
              {total} gym{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 14,
              }}
            >
              {gyms.map((gym) => (
                <GymCard
                  key={gym.id}
                  gym={gym}
                  onClick={() => navigate(`/gyms/${gym.slug}`)}
                />
              ))}
            </div>

            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: 28 }}>
                <button
                  type="button"
                  onClick={() => fetchGyms()}
                  disabled={loadingMore}
                  style={{
                    padding: '10px 28px',
                    borderRadius: 12,
                    border: '1px solid var(--oa-border)',
                    background: 'transparent',
                    color: 'var(--oa-text-secondary)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: loadingMore ? 'default' : 'pointer',
                  }}
                >
                  {loadingMore ? 'Cargando...' : 'Ver más'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
