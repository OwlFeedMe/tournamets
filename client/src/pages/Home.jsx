import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, Flame, Medal, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
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

function truncate(text, max = 140) {
  const value = (text || '').trim()
  if (!value) return 'Revisa detalles del evento, sigue el leaderboard y encuentra una competencia para ti.'
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
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

function cardVisualStyle(competition, index) {
  if (competition.imagen_url) {
    return {
      backgroundImage: `linear-gradient(180deg, rgba(13,15,18,0.12), rgba(13,15,18,0.58)), url("${competition.imagen_url}")`,
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

function CompetitionCard({ competition, index }) {
  const status = getCompetitionState(competition)
  const enrollmentStart = formatDate(competition.enrollment_start)
  const enrollmentEnd = formatDate(competition.enrollment_end)

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
          ...cardVisualStyle(competition, index),
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
        {!competition.imagen_url && (
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
            {enrollmentStart || enrollmentEnd
              ? `${enrollmentStart || 'Ahora'}${enrollmentEnd ? ` - ${enrollmentEnd}` : ''}`
              : 'Fechas por confirmar'}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#F5F7FA', fontSize: 12 }}>
            <Medal size={14} color="#D4A537" />
            Leaderboard publico
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link
            to={`/leaderboard/${competition.id}`}
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
            Ver leaderboard
            <ArrowRight size={16} />
          </Link>
          <Link
            to="/login"
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              padding: '11px 16px',
              borderRadius: 14,
              border: '1px solid #252A33',
              color: '#F5F7FA',
              fontWeight: 700,
            }}
          >
            Quiero participar
          </Link>
        </div>
      </div>
    </article>
  )
}

export default function Home() {
  const { session } = useAuth()
  const [competitions, setCompetitions] = useState([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    let active = true
    api.get('/competitions')
      .then(({ data }) => {
        if (!active) return
        setCompetitions(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!active) return
        setCompetitions([])
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const featuredCompetitions = useMemo(() => {
    return [...competitions]
      .sort((a, b) => {
        const stateDiff = getCompetitionState(a).weight - getCompetitionState(b).weight
        if (stateDiff !== 0) return stateDiff
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      })
      .slice(0, 6)
  }, [competitions])

  return (
    <div style={{ minHeight: '100vh', background: pageBg, color: '#F5F7FA' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 18px 72px' }}>
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
              Abre una competencia, revisa su estado y entra al leaderboard en segundos.
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
                <CompetitionCard key={competition.id} competition={competition} index={index} />
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
