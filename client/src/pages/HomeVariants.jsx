import { useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import api from '../api/axios'
import {
  CommandStrip,
  CompetitionGrid,
  CompetitionSearch,
  CompetitionSectionHeader,
  HomeCompetitionCard,
  HomeEmptyState,
} from '../components/home/HomeSections'
import {
  buildCommandItems,
  buttonStateForCompetition,
  filterCompetitionsByQuery,
  getCompetitionState,
  homePageBg,
  mapCompetitionViewModel,
} from '../components/home/homeModel'
import { getHomePath, useAuth } from '../context/AuthContext'
import { APP_CONTENT_MAX_WIDTH } from '../utils/competitionLayout'
import { getCompetitionEnrollmentNavigationTarget } from '../utils/enrollmentNavigation'

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

function signalStyle() {
  return {
    borderTop: `1px solid ${premium.border}`,
    paddingTop: 14,
    display: 'grid',
    gap: 4,
  }
}

function SharedTopMeta({ totalCompetitions, openCount, activeCount }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <TopMetric value={totalCompetitions} label="eventos visibles" tone={premium.teal} />
      <TopMetric value={openCount} label="eventos abiertos" tone={premium.silver} />
      <TopMetric value={activeCount} label="ranking activo" tone={premium.gold} />
    </div>
  )
}

function HomeVariantTop({ variant, isMobile, totalCompetitions, openCount, activeCount }) {
  if (variant === 1) {
    return (
      <section style={{ padding: isMobile ? '8px 0 20px' : '18px 0 30px', marginBottom: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.3fr) minmax(280px, 0.7fr)', gap: 24 }}>
          <div>
            <h1 style={{ margin: 0, color: premium.text, fontSize: isMobile ? 'clamp(30px, 9vw, 40px)' : 'clamp(40px, 7vw, 82px)', lineHeight: isMobile ? 1.02 : 0.92, overflowWrap: 'anywhere' }}>
              FinalRep: competencia en tiempo real.
            </h1>
            <p style={{ margin: '14px 0 0', color: premium.textSoft, fontSize: isMobile ? 15 : 17, lineHeight: isMobile ? 1.65 : 1.8, maxWidth: 760 }}>
              Configura, publica resultados y mueve el ranking sin perder ritmo.
            </p>
            <div style={{ marginTop: 14, display: 'grid', gap: 6, color: premium.textSoft, fontSize: 14, lineHeight: 1.5, maxWidth: 760 }}>
              <div><strong style={{ color: premium.text }}>Control total:</strong> formatos, categorias y flujo en un solo lugar.</div>
              <div><strong style={{ color: premium.text }}>Ritmo en vivo:</strong> cada score impacta al instante.</div>
              <div><strong style={{ color: premium.text }}>Lectura clara:</strong> ranking oficial, limpio y preciso.</div>
            </div>
          </div>
          <div style={{ display: 'grid', alignContent: 'end', gap: 18 }}>
            <SharedTopMeta totalCompetitions={totalCompetitions} openCount={openCount} activeCount={activeCount} />
          </div>
        </div>
      </section>
    )
  }

  if (variant === 2) {
    return (
      <section style={{ marginBottom: 18, padding: '14px 0 8px' }}>
        <div style={{ borderTop: `1px solid ${premium.border}`, borderBottom: `1px solid ${premium.border}`, padding: '18px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.2fr) minmax(320px, 0.8fr)', gap: 24 }}>
            <div>
              <div style={{ color: premium.teal, fontSize: 12, fontWeight: 800, letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 10 }}>
                FinalRep Command
              </div>
              <h1 style={{ margin: 0, color: premium.text, fontSize: 'clamp(34px, 6vw, 62px)', lineHeight: 0.94 }}>
                Controla competencia, scoring y ranking desde un mismo pulso.
              </h1>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <MetricRow label="Config" value="Bloques, reglas y flujo listos" />
              <MetricRow label="Live" value="Resultados directos sin fricción" />
              <MetricRow label="Board" value="Clasificación actualizada al instante" />
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (variant === 3) {
    return (
      <section style={{ position: 'relative', marginBottom: 20, padding: isMobile ? '14px 0 12px' : '24px 0 18px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, color: 'rgba(214,217,224,0.06)', fontSize: isMobile ? 92 : 180, fontWeight: 800, lineHeight: 0.86, pointerEvents: 'none' }}>
          FINALREP
        </div>
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 920 }}>
          <div style={{ color: premium.gold, fontSize: 12, fontWeight: 800, letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 12 }}>
            Elite Competition Platform
          </div>
          <h1 style={{ margin: 0, color: premium.text, fontSize: 'clamp(38px, 6vw, 72px)', lineHeight: 0.95 }}>
            La plataforma premium para competir, registrar y escalar resultados en vivo.
          </h1>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 18, marginTop: 26 }}>
            <SignalColumn kicker="Configura" text="Cada formato entra con estructura y criterio." />
            <SignalColumn kicker="Publica" text="Cada score puede impactar de inmediato." />
            <SignalColumn kicker="Domina" text="Cada ranking se siente oficial y legible." />
          </div>
        </div>
      </section>
    )
  }

  if (variant === 4) {
    return (
      <section style={{ marginBottom: 22, padding: '8px 0 10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.25fr) 340px', gap: 26, alignItems: 'stretch' }}>
          <div style={{ padding: '10px 0' }}>
            <div style={{ color: premium.silver, fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>
              FinalRep
            </div>
            <h1 style={{ margin: 0, color: premium.text, fontSize: 'clamp(38px, 6vw, 70px)', lineHeight: 0.93 }}>
              Toda la competencia. Sin ruido. Sin retraso.
            </h1>
            <p style={{ margin: '16px 0 0', color: premium.textSoft, fontSize: 16, lineHeight: 1.75, maxWidth: 720 }}>
              Desde la configuración inicial hasta el cierre del leaderboard, FinalRep sostiene el ritmo operativo del evento con una presencia más seria y más premium.
            </p>
          </div>
          <aside style={{ borderLeft: isMobile ? 'none' : `1px solid ${premium.border}`, paddingLeft: isMobile ? 0 : 22, display: 'grid', gap: 16, alignContent: 'start' }}>
            <PanelDatum label="Resultados vivos" value="Carga, valida y refleja." />
            <PanelDatum label="Puntuacion directa" value="Menos fricción, más ritmo." />
            <PanelDatum label="Operacion premium" value="Listo para eventos exigentes." />
          </aside>
        </div>
      </section>
    )
  }

  if (variant === 5) {
    return (
      <section
        style={{
          marginBottom: 22,
          padding: isMobile ? '18px 16px' : '28px 24px',
          backgroundImage: `
            linear-gradient(rgba(214,217,224,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(214,217,224,0.06) 1px, transparent 1px)
          `,
          backgroundSize: '32px 32px',
          border: `1px solid ${premium.border}`,
        }}
      >
        <div style={{ maxWidth: 900 }}>
          <div style={{ color: premium.teal, fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
            FinalRep Systems
          </div>
          <h1 style={{ margin: 0, color: premium.text, fontSize: 'clamp(36px, 6vw, 64px)', lineHeight: 0.95 }}>
            Infraestructura visual para competencias que no pueden perder precisión.
          </h1>
          <p style={{ margin: '14px 0 0', color: premium.textSoft, fontSize: 16, lineHeight: 1.7 }}>
            Configuración profunda, resultados de respuesta inmediata y una lectura clara de la clasificación cuando el evento exige velocidad y control.
          </p>
        </div>
      </section>
    )
  }

  if (variant === 6) {
    return (
      <section style={{ marginBottom: 22 }}>
        <div style={{ padding: '12px 0 18px' }}>
          <div style={{ color: premium.silver, fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>
            FinalRep Broadcast
          </div>
          <h1 style={{ margin: 0, color: premium.text, fontSize: 'clamp(36px, 6vw, 66px)', lineHeight: 0.94 }}>
            El feed oficial de tu competencia empieza aquí.
          </h1>
        </div>
        <div style={{ display: isMobile ? 'grid' : 'flex', gap: 0, overflow: 'hidden', borderTop: `1px solid ${premium.border}`, borderBottom: `1px solid ${premium.border}` }}>
          <TickerItem label="Config" value="todo el formato bajo control" />
          <TickerItem label="Live" value="resultados entrando al instante" />
          <TickerItem label="Board" value="leaderboard con lectura inmediata" />
        </div>
      </section>
    )
  }

  return (
    <section style={{ position: 'relative', marginBottom: 22, minHeight: isMobile ? 300 : 360, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: '#0F1114' }} />
      <div style={{ position: 'absolute', inset: '-10% 40% 30% -10%', background: 'radial-gradient(circle, rgba(94,234,212,0.18), transparent 52%)' }} />
      <div style={{ position: 'absolute', inset: '0 0 20% 48%', background: 'radial-gradient(circle, rgba(214,217,224,0.14), transparent 48%)' }} />
      <div style={{ position: 'absolute', inset: '38% 10% -8% 58%', background: 'radial-gradient(circle, rgba(205,170,107,0.16), transparent 44%)' }} />
      <div style={{ position: 'relative', zIndex: 1, padding: isMobile ? '18px 0' : '32px 0', maxWidth: 860 }}>
        <div style={{ color: premium.gold, fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>
          FinalRep Identity
        </div>
        <h1 style={{ margin: 0, color: premium.text, fontSize: isMobile ? 'clamp(30px, 9vw, 40px)' : 'clamp(38px, 6vw, 72px)', lineHeight: isMobile ? 1.02 : 0.92, overflowWrap: 'anywhere' }}>
          Una presencia propia para eventos que quieren verse a la altura.
        </h1>
        <p style={{ margin: '14px 0 0', color: premium.textSoft, fontSize: isMobile ? 15 : 16, lineHeight: isMobile ? 1.65 : 1.78 }}>
          FinalRep no necesita apoyarse en la imagen de una sola competencia para transmitir control, nivel y tiempo real. La marca se siente antes del primer evento.
        </p>
      </div>
    </section>
  )
}

function MetricRow({ label, value }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 12, paddingBottom: 12, borderBottom: `1px solid ${premium.border}` }}>
      <div style={{ color: premium.textMuted, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1 }}>{label}</div>
      <div style={{ color: premium.text, fontSize: 15, lineHeight: 1.6, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function TopMetric({ value, label, tone }) {
  return (
    <div style={{ border: `1px solid ${premium.border}`, background: 'rgba(9,11,14,0.5)', borderRadius: 6, padding: '12px 14px', display: 'grid', gap: 6 }}>
      <div style={{ color: tone, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1 }}>{label}</div>
      <div style={{ color: premium.text, fontSize: 26, fontWeight: 800, lineHeight: 0.95 }}>{String(value).padStart(2, '0')}</div>
    </div>
  )
}

function SignalColumn({ kicker, text }) {
  return (
    <div style={signalStyle()}>
      <div style={{ color: premium.teal, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1 }}>{kicker}</div>
      <div style={{ color: premium.text, fontSize: 15, lineHeight: 1.7 }}>{text}</div>
    </div>
  )
}

function PanelDatum({ label, value }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ color: premium.textMuted, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1 }}>{label}</div>
      <div style={{ color: premium.text, fontSize: 18, fontWeight: 700, lineHeight: 1.4 }}>{value}</div>
    </div>
  )
}

function TickerItem({ label, value }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '16px 18px', borderRight: `1px solid ${premium.border}` }}>
      <div style={{ color: premium.gold, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ color: premium.text, fontSize: 15, lineHeight: 1.6, fontWeight: 700, marginTop: 6 }}>{value}</div>
    </div>
  )
}

export default function HomeVariants({ variant = 1 }) {
  const navigate = useNavigate()
  const { session, role, userId, isAthlete } = useAuth()
  const [competitions, setCompetitions] = useState([])
  const [myComps, setMyComps] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([
      api.get('/competitions?scope=public').catch(() => ({ data: [] })),
    isAthlete && userId
      ? api.get(`/users/${userId}/competitions`).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
    ])
      .then(([competitionsResponse, mineResponse]) => {
        if (!active) return
        setCompetitions(Array.isArray(competitionsResponse.data) ? competitionsResponse.data : [])
        setMyComps(Array.isArray(mineResponse.data) ? mineResponse.data : [])
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [isAthlete, userId, role])

  const enrollmentByComp = useMemo(() => {
    const map = {}
    for (const competition of myComps) {
      map[competition.id] = competition.enrollment_estado || null
    }
    return map
  }, [myComps])

  const featuredCompetitions = useMemo(() => {
    return [...competitions]
      .sort((a, b) => {
        const stateDiff = getCompetitionState(a).weight - getCompetitionState(b).weight
        if (stateDiff !== 0) return stateDiff
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      })
      .slice(0, 6)
  }, [competitions])

  const filteredCompetitions = useMemo(
    () => filterCompetitionsByQuery(featuredCompetitions, query),
    [featuredCompetitions, query]
  )

  const competitionCards = useMemo(
    () => filteredCompetitions.map((competition, index) => mapCompetitionViewModel(competition, index)),
    [filteredCompetitions]
  )

  const commandItems = useMemo(() => buildCommandItems(featuredCompetitions), [featuredCompetitions])
  const openCount = featuredCompetitions.filter(item => item.enrollment_open).length
  const activeCount = featuredCompetitions.filter(item => item.activa).length

  const handleParticipate = (competition) => {
    const target = getCompetitionEnrollmentNavigationTarget({
      session,
      isAthlete,
      role,
      competition,
      enrollmentState: enrollmentByComp[competition.id],
    })
    if (!target) return
    navigate(target)
  }

  return (
    <div style={{ minHeight: '100vh', background: homePageBg, color: premium.text }}>
      <div style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: isMobile ? '18px 14px 112px' : '24px 18px 72px' }}>
        <HomeVariantTop
          variant={variant}
          isMobile={isMobile}
          totalCompetitions={featuredCompetitions.length}
          openCount={openCount}
          activeCount={activeCount}
        />

        <CommandStrip items={commandItems} isMobile={isMobile} />

        <section>
          <CompetitionSectionHeader totalVisible={competitionCards.length} query={query} />
          <CompetitionSearch value={query} onChange={setQuery} />

          {loading ? (
            <div style={{ color: premium.textSoft, fontSize: 14 }}>Cargando competencias...</div>
          ) : competitionCards.length ? (
            <CompetitionGrid
              competitions={competitionCards}
              isMobile={isMobile}
              renderCard={(competition) => (
                <HomeCompetitionCard
                  competition={competition}
                  isMobile={isMobile}
                  isAthlete={isAthlete}
                  enrollmentState={enrollmentByComp[competition.id]}
                  onParticipate={handleParticipate}
                  getButtonState={buttonStateForCompetition}
                />
              )}
            />
          ) : (
            <HomeEmptyState hasCompetitions={featuredCompetitions.length > 0} />
          )}
        </section>
      </div>
    </div>
  )
}

