import { ArrowRight, CalendarDays, Flame, Medal, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'

const premium = {
  bg: '#0F1114',
  surface: '#171A20',
  surfaceAlt: '#111419',
  border: 'rgba(214, 217, 224, 0.14)',
  text: '#F5F7FA',
  textSoft: '#C7CDD6',
  textMuted: '#8B94A3',
  silver: '#D6D9E0',
  teal: '#5EEAD4',
  gold: '#CDAA6B',
  silverGradient: 'linear-gradient(135deg, #F1F4F8 0%, #C7CDD6 100%)',
}

const shellCardStyle = {
  border: `1px solid ${premium.border}`,
  background: premium.surface,
  boxShadow: '0 18px 60px rgba(0,0,0,0.22)',
}

const sectionTitleStyle = {
  margin: 0,
  color: premium.text,
  fontSize: 30,
  lineHeight: 1,
}

function surfaceStyle({ cut = false, padding = 22, background = premium.surface, border = `1px solid ${premium.border}`, shadow = shellCardStyle.boxShadow } = {}) {
  return {
    ...shellCardStyle,
    border,
    background,
    padding,
    boxShadow: shadow,
    overflow: 'hidden',
    ...(cut ? {} : { borderRadius: 6 }),
  }
}

export function HomeHero({
  isMobile,
  session,
  totalCompetitions,
  openCount,
  activeCount,
  panelHref,
}) {
  const heroState = 'Plataforma en vivo'

  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.45fr) minmax(300px, 0.75fr)',
        gap: 18,
        marginBottom: 22,
      }}
    >
      <div
        className="fr-cut-card"
        style={{
          ...surfaceStyle({
            cut: true,
            padding: isMobile ? 22 : 28,
            background: `
              linear-gradient(135deg, rgba(94,234,212,0.12) 0%, rgba(214,217,224,0.08) 36%, rgba(205,170,107,0.10) 100%),
              radial-gradient(circle at 14% 18%, rgba(94,234,212,0.20), transparent 22%),
              radial-gradient(circle at 84% 24%, rgba(214,217,224,0.14), transparent 18%),
              radial-gradient(circle at 68% 76%, rgba(205,170,107,0.16), transparent 20%),
              #0F1114
            `,
          }),
          minHeight: isMobile ? 320 : 400,
          display: 'grid',
          alignContent: 'space-between',
          gap: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 999,
              background: 'rgba(9,11,14,0.62)',
              border: `1px solid ${premium.border}`,
              color: premium.teal,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
            }}
          >
            {heroState}
          </span>
          <span style={{ color: premium.textSoft, fontSize: 13, fontWeight: 600 }}>
            {totalCompetitions} eventos visibles
          </span>
        </div>

        <div style={{ maxWidth: 720 }}>
          <div style={{ color: premium.silver, fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            FinalRep
          </div>
          <h1 style={{ margin: '12px 0 12px', color: premium.text, fontSize: 'clamp(34px, 6vw, 68px)', lineHeight: 0.94 }}>
            La plataforma donde la competencia se siente viva desde el primer score.
          </h1>
          <p style={{ margin: 0, color: premium.textSoft, fontSize: 16, lineHeight: 1.7, maxWidth: 620 }}>
            Configura formatos, publica resultados en tiempo real y mantén el leaderboard en movimiento con una experiencia pensada para eventos serios.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
              gap: 10,
              marginTop: 18,
              maxWidth: 760,
            }}
          >
            <BrandSignal
              label="Configuracion total"
              value="Categorias, bloques y reglas bajo control."
            />
            <BrandSignal
              label="Resultados directos"
              value="Carga inmediata para no romper el ritmo del evento."
            />
            <BrandSignal
              label="Leaderboard vivo"
              value="La tabla cambia cuando la competencia cambia."
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link
              to="/leaderboard"
              style={{
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                borderRadius: 6,
                background: premium.silverGradient,
                color: premium.bg,
                fontWeight: 800,
              }}
            >
              Ver leaderboard
              <ArrowRight size={16} />
            </Link>
            <Link
              to={panelHref}
              style={{
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                borderRadius: 6,
                border: `1px solid ${premium.border}`,
                background: 'rgba(9,11,14,0.56)',
                color: premium.text,
                fontWeight: 700,
              }}
            >
              {session ? 'Ir a mi panel' : 'Ingresar'}
            </Link>
          </div>

          <div style={{ display: 'grid', gap: 4, minWidth: 240 }}>
            <div style={{ color: premium.text, fontSize: 18, fontWeight: 800 }}>FinalRep</div>
            <div style={{ color: premium.textSoft, fontSize: 13, lineHeight: 1.5 }}>
              Plataforma premium para operar, seguir y escalar competencias.
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        <StatPanel value={openCount} label="eventos abiertos" tone={premium.teal} />
        <StatPanel value={activeCount} label="leaderboards en vivo" tone={premium.silver} />
        <StatPanel value={Math.max(totalCompetitions - openCount, 0)} label="cierres por seguir" tone={premium.gold} />
      </div>
    </section>
  )
}

function BrandSignal({ label, value }) {
  return (
    <div
      style={{
        border: `1px solid ${premium.border}`,
        background: 'rgba(9,11,14,0.42)',
        padding: '12px 14px',
        borderRadius: 6,
        display: 'grid',
        gap: 6,
      }}
    >
      <div style={{ color: premium.gold, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ color: premium.text, fontSize: 13, lineHeight: 1.5, fontWeight: 600 }}>
        {value}
      </div>
    </div>
  )
}

function StatPanel({ value, label, tone }) {
  return (
    <div className="fr-cut-card" style={{ ...surfaceStyle({ cut: true, padding: 18, background: premium.surface }), display: 'grid', gap: 8 }}>
      <div style={{ color: tone, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1 }}>{label}</div>
      <div style={{ color: premium.text, fontSize: 34, fontWeight: 800, lineHeight: 0.95 }}>{String(value).padStart(2, '0')}</div>
    </div>
  )
}

export function CommandStrip({ items, isMobile }) {
  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
        gap: 14,
        marginBottom: 22,
      }}
    >
      {items.map((item) => (
        <div key={item.label} style={{ ...surfaceStyle({ padding: 18, background: item.background, shadow: 'none' }), display: 'grid', gap: 8 }}>
          <div style={{ color: item.tone, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1 }}>{item.label}</div>
          <div style={{ color: premium.text, fontSize: 20, fontWeight: 800, lineHeight: 1.15 }}>{item.value}</div>
          <div style={{ color: premium.textSoft, fontSize: 13, lineHeight: 1.55 }}>{item.copy}</div>
        </div>
      ))}
    </section>
  )
}

export function CompetitionSectionHeader({ totalVisible, query }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'end', flexWrap: 'wrap', marginBottom: 16 }}>
      <div>
        <h2 style={sectionTitleStyle}>Competiciones activas</h2>
        <p style={{ margin: '8px 0 0', color: premium.textSoft, fontSize: 14, lineHeight: 1.6 }}>
          {query ? `${totalVisible} resultados.` : 'Elige evento, registra resultados y sigue el avance en vivo.'}
        </p>
      </div>
      <div style={{ color: premium.textMuted, fontSize: 13, fontWeight: 700 }}>
        Ordenadas por estado y fecha
      </div>
    </div>
  )
}

export function CompetitionSearch({ value, onChange }) {
  return (
    <div className="fr-cut-card" style={{ ...surfaceStyle({ cut: true, padding: 0, background: premium.surface, shadow: 'none' }), marginBottom: 18 }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar por nombre, ciudad o descripcion"
        style={{
          width: '100%',
          border: 'none',
          background: 'transparent',
          color: premium.text,
          padding: '15px 16px',
          fontSize: 14,
          outline: 'none',
        }}
      />
    </div>
  )
}

export function CompetitionGrid({ competitions, isMobile, renderCard }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
        gap: 18,
      }}
    >
      {competitions.map((competition, index) => (
        <div key={competition.id} style={{ minWidth: 0 }}>
          {renderCard(competition, index)}
        </div>
      ))}
    </div>
  )
}

export function HomeCompetitionCard({
  competition,
  isMobile,
  isAthlete,
  enrollmentState,
  onParticipate,
  getButtonState,
}) {
  const status = competition.status
  const cta = getButtonState(competition.raw, isAthlete, enrollmentState)
  const competitionHref = `/competitions/${competition.id}`

  return (
    <article
      className="fr-cut-card"
      style={{
        ...surfaceStyle({ cut: true, padding: 0, background: premium.surface }),
        height: '100%',
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
      }}
    >
      <Link
        to={competitionHref}
        aria-label={`Ver competencia ${competition.nombre}`}
        style={{
          position: 'relative',
          display: 'block',
          width: '100%',
          aspectRatio: '16 / 9',
          minWidth: 0,
          background: '#0D0F12',
          overflow: 'hidden',
          textDecoration: 'none',
        }}
      >
        {competition.bannerUrl ? (
          <img
            src={competition.bannerUrl}
            alt={competition.nombre}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              display: 'block',
              objectFit: 'cover',
              objectPosition: 'center center',
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: competition.bannerStyle,
              backgroundSize: 'cover',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat',
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            right: 16,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
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
              color: premium.text,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            <Flame size={14} color={status.tone} />
            {status.label}
          </span>

          <div />
        </div>
      </Link>

      <div style={{ padding: isMobile ? 16 : 22, display: 'grid', gridTemplateRows: 'auto auto 1fr auto', gap: isMobile ? 14 : 16 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <Link
            to={competitionHref}
            style={{ textDecoration: 'none', color: premium.text }}
          >
            <h3 style={{ margin: 0, color: 'inherit', fontSize: isMobile ? 21 : 24, lineHeight: 1.1, overflowWrap: 'anywhere' }}>{competition.nombre}</h3>
          </Link>
          <p style={{ margin: 0, color: premium.textSoft, fontSize: isMobile ? 13 : 14, lineHeight: 1.6 }}>
            {competition.description}
          </p>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: premium.text, fontSize: 12, minWidth: 0 }}>
            <CalendarDays size={14} color={premium.teal} />
            Inscripciones: {competition.enrollmentStartLabel}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: premium.text, fontSize: 12, minWidth: 0 }}>
            <Trophy size={14} color={premium.gold} />
            Competencia: {competition.competitionDateLabel}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <Link
            to={competitionHref}
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '11px 16px',
              borderRadius: 6,
              background: premium.silverGradient,
              color: premium.bg,
              fontWeight: 800,
              minWidth: 0,
              minHeight: 44,
              textAlign: 'center',
            }}
          >
            Ver competencia
            <ArrowRight size={16} />
          </Link>
          <Link
            to={`/leaderboard/${competition.id}`}
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '11px 16px',
              borderRadius: 6,
              border: `1px solid ${premium.border}`,
              background: 'transparent',
              color: premium.text,
              fontWeight: 700,
              minWidth: 0,
              minHeight: 44,
              textAlign: 'center',
            }}
          >
            Ver leaderboard
          </Link>
          <button
            type="button"
            onClick={() => onParticipate(competition.raw)}
            disabled={cta.disabled}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '11px 16px',
              borderRadius: 6,
              border: cta.tone === 'secondary' ? `1px solid ${premium.border}` : '1px solid rgba(245,247,250,0.12)',
              background: cta.tone === 'muted' ? 'rgba(13,15,18,0.6)' : 'transparent',
              color: cta.tone === 'muted' ? premium.textMuted : premium.text,
              fontWeight: 700,
              cursor: cta.disabled ? 'not-allowed' : 'pointer',
              opacity: cta.disabled ? 0.9 : 1,
              minWidth: 0,
              minHeight: 44,
              textAlign: 'center',
            }}
          >
            {cta.label}
          </button>
        </div>
      </div>
    </article>
  )
}

export function HomeEmptyState({ hasCompetitions }) {
  return (
    <div
      className="fr-cut-card"
      style={{
        ...surfaceStyle({ cut: true, padding: 24, background: 'rgba(23,27,33,0.94)', shadow: 'none' }),
        color: premium.textSoft,
      }}
    >
      {hasCompetitions ? 'No hay resultados para esa busqueda.' : 'Aun no hay competencias visibles. Vuelve pronto para nuevas aperturas y rankings.'}
    </div>
  )
}

