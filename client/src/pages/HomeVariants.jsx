import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Bell, CalendarDays, CheckCircle2, Clock3, Flame, MapPin, Medal, QrCode, TrendingDown, TrendingUp, Trash2, X } from 'lucide-react'
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
  getNextPersonalHeat,
  hasCurrentOrFutureUserCompetition,
  homePageBg,
  mapCompetitionViewModel,
  normalizeUserResults,
  selectPrimaryUserCompetition,
  extractUserLeaderboardSummary,
  formatCompetitionWindow,
  resolveCompetitionAsset,
} from '../components/home/homeModel'
import { SkeletonBlock, SkeletonCardGrid, SkeletonList, SkeletonMetricGrid } from '../components/layout/Skeleton'
import { getHomePath, useAuth } from '../context/AuthContext'
import { APP_CONTENT_MAX_WIDTH } from '../utils/competitionLayout'
import { getCompetitionEnrollmentNavigationTarget } from '../utils/enrollmentNavigation'
import { formatCompetitionDateTime } from '../utils/competitionTimeZone'
import {
  readSpectatorFollows,
  readSpectatorSnapshots,
  subscribeSpectatorFollows,
  unfollowAthlete,
} from '../utils/spectatorFollow'
import { fetchFollowSummary } from '../utils/followSummary'

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

function formatDateTime(value, timeZone) {
  if (!value) return 'Por confirmar'
  return formatCompetitionDateTime(value, timeZone, {
    weekday: 'short',
    fallback: 'Por confirmar',
  })
}

function enrollmentBadge(status) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'confirmado') return { label: 'Cupo confirmado', color: '#22C55E', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.32)' }
  if (normalized === 'pago_en_verificacion') return { label: 'Pago en verificacion', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.32)' }
  if (normalized === 'pendiente') return { label: 'Inscripcion en proceso', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.32)' }
  if (normalized === 'rechazado') return { label: 'Registro rechazado', color: '#EF4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.32)' }
  return { label: 'Registro pendiente', color: premium.textSoft, bg: 'rgba(170,178,192,0.08)', border: premium.border }
}

function parseTime(value) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getCompetitionCountdown(competition, nowMs) {
  const startMs = parseTime(competition?.competition_start)

  if (startMs && startMs > nowMs) {
    return {
      targetMs: startMs,
      label: 'Arranca en',
      tone: '#FF6B00',
    }
  }

  return null
}

function hasCompetitionStarted(competition, nowMs = Date.now()) {
  const startMs = parseTime(competition?.competition_start)
  if (startMs) return startMs <= nowMs
  return Boolean(competition?.activa)
}

function splitDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return { days, hours, minutes, seconds }
}

function CountdownTile({ value, label, tone }) {
  return (
    <div style={{ minWidth: 0, border: '1px solid rgba(245,247,250,0.10)', background: 'rgba(9,11,14,0.62)', borderRadius: 6, padding: '9px 8px', textAlign: 'center' }}>
      <div style={{ color: tone, fontSize: 23, lineHeight: 1, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{String(value).padStart(2, '0')}</div>
      <div style={{ color: premium.textMuted, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 5 }}>{label}</div>
    </div>
  )
}

function CompetitionCountdown({ competition, isMobile }) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const countdown = getCompetitionCountdown(competition, nowMs)
  if (!countdown) return null

  const duration = splitDuration(countdown.targetMs - nowMs)

  return (
    <aside
      aria-label={`${countdown.label} ${duration.days} dias ${duration.hours} horas ${duration.minutes} minutos`}
      style={{
        justifySelf: isMobile ? 'stretch' : 'end',
        width: isMobile ? '100%' : 280,
        border: `1px solid ${premium.border}`,
        background: 'linear-gradient(135deg, rgba(9,11,14,0.86), rgba(23,27,33,0.76))',
        borderRadius: 8,
        padding: 14,
        boxShadow: '0 18px 42px rgba(0,0,0,0.24)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <div style={{ color: countdown.tone, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>{countdown.label}</div>
        <Clock3 size={17} color={countdown.tone} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        <CountdownTile value={duration.days} label="Dias" tone={countdown.tone} />
        <CountdownTile value={duration.hours} label="Horas" tone={countdown.tone} />
        <CountdownTile value={duration.minutes} label="Min" tone={countdown.tone} />
        <CountdownTile value={duration.seconds} label="Seg" tone={countdown.tone} />
      </div>
    </aside>
  )
}

function PersonalMetric({ label, value, tone = premium.teal }) {
  return (
    <div className="fr-cut-card" style={{ border: `1px solid ${premium.border}`, background: premium.surface, padding: 16 }}>
      <div style={{ color: tone, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ marginTop: 8, color: premium.text, fontSize: 28, lineHeight: 1, fontWeight: 800 }}>{value}</div>
    </div>
  )
}

function PersonalHomeSkeleton({ isMobile }) {
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section className="fr-cut-card" style={{ border: `1px solid ${premium.border}`, background: premium.surface, padding: isMobile ? 18 : 22 }}>
        <SkeletonBlock width={150} height={28} radius={999} />
        <SkeletonBlock width="72%" height={54} radius={10} style={{ marginTop: 18 }} />
        <SkeletonBlock width="52%" height={14} radius={999} style={{ marginTop: 14 }} />
        <div style={{ marginTop: 18 }}>
          <SkeletonMetricGrid count={3} />
        </div>
      </section>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 0.9fr) minmax(0, 1.1fr)', gap: 18 }}>
        <SkeletonList count={2} />
        <SkeletonList count={3} />
      </div>
    </div>
  )
}

function PrimaryCompetitionPanel({ competition, leaderboard, leaderboardLoading = false, onOpenQr, isMobile }) {
  const badge = enrollmentBadge(competition?.enrollment_estado)
  const banner = resolveCompetitionAsset(competition, 'banner')
  const dateLabel = formatCompetitionWindow(competition, { fallback: 'Fecha por confirmar' })
  const isConfirmed = String(competition?.enrollment_estado || '').toLowerCase() === 'confirmado'
  const competitionStarted = hasCompetitionStarted(competition)

  return (
    <section
      className="fr-cut-card"
      style={{
        border: `1px solid ${premium.border}`,
        background: banner
          ? `linear-gradient(90deg, rgba(13,15,18,0.94), rgba(13,15,18,0.74)), url("${banner}") center/cover no-repeat`
          : 'linear-gradient(135deg, rgba(255,107,0,0.16), rgba(23,27,33,0.96) 46%, rgba(0,194,168,0.10))',
        padding: 22,
        display: 'grid',
        gap: 18,
        minHeight: 330,
        alignContent: 'space-between',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) auto', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'start' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, border: `1px solid ${badge.border}`, background: badge.bg, color: badge.color, padding: '8px 12px', fontSize: 12, fontWeight: 800 }}>
              <Flame size={14} />
              {badge.label}
            </span>
            {competition?.enrollment_categoria ? (
              <span style={{ color: premium.text, border: `1px solid ${premium.border}`, background: 'rgba(9,11,14,0.72)', borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 800 }}>
                Categoria {competition.enrollment_categoria}
              </span>
            ) : null}
          </div>

          <div style={{ maxWidth: 860 }}>
            <div style={{ color: '#FF9A3D', fontSize: 12, fontWeight: 800, letterSpacing: 1.1, textTransform: 'uppercase' }}>Tu competencia</div>
            <h1 style={{ margin: '10px 0 10px', color: premium.text, fontSize: 'clamp(34px, 6vw, 64px)', lineHeight: 0.96, overflowWrap: 'anywhere' }}>
              {competition?.nombre || 'Tu proxima competencia'}
            </h1>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', color: premium.textSoft, fontSize: 14 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CalendarDays size={15} color="#00C2A8" />
                {dateLabel}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={15} color="#FF6B00" />
                {competition?.lugar || 'Lugar por confirmar'}
              </span>
            </div>
          </div>
        </div>

        {!competitionStarted ? <CompetitionCountdown competition={competition} isMobile={isMobile} /> : null}
      </div>

      {competitionStarted ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
          {leaderboardLoading ? (
            <>
              <SkeletonBlock height={76} radius={8} />
              <SkeletonBlock height={76} radius={8} />
              <SkeletonBlock height={76} radius={8} />
            </>
          ) : (
            <>
              <PersonalMetric label="Posicion" value={leaderboard?.rank ? `#${leaderboard.rank}` : '--'} tone="#FF6B00" />
              <PersonalMetric label="Puntos" value={leaderboard?.points ?? 0} tone="#00C2A8" />
              <PersonalMetric label="Pruebas" value={leaderboard?.events ?? 0} tone="#F5F7FA" />
            </>
          )}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link to={`/competitions/${competition.id}/my-schedule`} style={primaryActionStyle()}>
          Mi cronograma
          <ArrowRight size={16} />
        </Link>
        <Link to={`/leaderboard/${competition.id}`} style={secondaryActionStyle()}>
          Leaderboard completo
        </Link>
        <Link to={`/competitions/${competition.id}`} style={secondaryActionStyle()}>
          Ver competencia
        </Link>
        {isConfirmed ? (
          <button type="button" onClick={() => onOpenQr(competition)} style={{ ...secondaryActionStyle(), borderColor: 'rgba(255,107,0,0.42)', color: '#FFD8BC' }}>
            <QrCode size={16} />
            Ver mi QR
          </button>
        ) : null}
      </div>
    </section>
  )
}
function primaryActionStyle() {
  return {
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 6,
    background: 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)',
    color: '#090B0E',
    padding: '11px 16px',
    fontWeight: 800,
    border: '1px solid rgba(255,154,61,0.72)',
  }
}

function secondaryActionStyle() {
  return {
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 6,
    background: 'rgba(9,11,14,0.58)',
    color: premium.text,
    padding: '11px 16px',
    fontWeight: 800,
    border: `1px solid ${premium.border}`,
  }
}

function NextHeatPanel({ heat, timeZone }) {
  const participant = Array.isArray(heat?.participants) ? heat.participants[0] : null
  return (
    <section className="fr-cut-card" style={{ border: `1px solid ${premium.border}`, background: premium.surface, padding: 18, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
        <div>
          <div style={{ color: '#00C2A8', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Proximo heat</div>
          <h2 style={{ margin: '6px 0 0', color: premium.text, fontSize: 24, lineHeight: 1.1 }}>{heat?.heat_label || heat?.title || 'Tus heats aun no estan publicados'}</h2>
        </div>
        <Clock3 size={20} color="#FF6B00" />
      </div>
      {heat ? (
        <div style={{ display: 'grid', gap: 8, color: premium.textSoft, fontSize: 14, lineHeight: 1.55 }}>
          <div>{heat.phase_name || heat.phaseName || 'Bloque por confirmar'}</div>
          <div>{formatDateTime(heat.start_at || heat.startAt, timeZone)}{heat.end_at ? ` - ${formatDateTime(heat.end_at, timeZone)}` : ''}</div>
          {(heat.location_name || heat.locationName) ? <div>{heat.location_name || heat.locationName}</div> : null}
          {participant?.lane_number || participant?.lane ? <div style={{ color: premium.text, fontWeight: 800 }}>Lane {participant.lane_number || participant.lane}</div> : null}
        </div>
      ) : (
        <div style={{ color: premium.textSoft, fontSize: 14, lineHeight: 1.6 }}>
          Cuando el staff publique tus salidas, apareceran aqui sin que tengas que buscar en todo el cronograma.
        </div>
      )}
    </section>
  )
}

function ScorePanel({ leaderboard, results }) {
  const phaseRows = leaderboard?.phases?.length ? leaderboard.phases : []
  const rows = phaseRows.length
    ? phaseRows.slice(0, 4).map((item) => ({
      key: item.phaseId,
      name: item.phaseName,
      rank: item.rank,
      points: item.points,
      mark: item.mark,
      status: item.status,
    }))
    : results.slice(0, 4).map((item) => ({
      key: item.id,
      name: item.phaseName,
      rank: item.position,
      points: item.points,
      mark: item.mark,
      status: '',
    }))

  return (
    <section className="fr-cut-card" style={{ border: `1px solid ${premium.border}`, background: premium.surface, padding: 18, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ color: '#FF6B00', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Mi puntuacion</div>
          <h2 style={{ margin: '6px 0 0', color: premium.text, fontSize: 24, lineHeight: 1.1 }}>Asi vas en el evento</h2>
        </div>
        <Medal size={20} color="#D4A537" />
      </div>
      {rows.length ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((item) => (
            <div key={item.key} style={{ borderRadius: 6, border: `1px solid ${premium.border}`, background: 'rgba(13,15,18,0.54)', padding: 12, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: premium.text, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ marginTop: 4, color: premium.textSoft, fontSize: 12 }}>
                  Marca {item.mark ?? '--'} {item.status ? `· ${item.status}` : ''}
                </div>
              </div>
              <div style={{ color: premium.text, textAlign: 'right', fontSize: 13, fontWeight: 800 }}>
                <div>{item.rank ? `#${item.rank}` : '--'}</div>
                <div style={{ color: '#00C2A8' }}>{item.points ?? 0} pts</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: premium.textSoft, fontSize: 14, lineHeight: 1.6 }}>
          Aun no tienes scores publicados en esta competencia.
        </div>
      )}
    </section>
  )
}

function CompactEventList({ items, primaryId }) {
  const rows = (Array.isArray(items) ? items : []).filter((item) => String(item.id) !== String(primaryId)).slice(0, 3)
  if (!rows.length) return null
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0, color: premium.text, fontSize: 22 }}>Tus otras competencias</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((competition) => {
          const badge = enrollmentBadge(competition.enrollment_estado)
          return (
            <Link key={competition.id} to={`/competitions/${competition.id}`} style={{ textDecoration: 'none', borderRadius: 6, border: `1px solid ${premium.border}`, background: premium.surface, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: premium.text, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{competition.nombre}</div>
                <div style={{ color: premium.textSoft, marginTop: 4, fontSize: 12 }}>{formatCompetitionWindow(competition, { includeYear: false, fallback: 'Fecha por confirmar' })}</div>
              </div>
              <span style={{ color: badge.color, fontSize: 12, fontWeight: 800 }}>{badge.label}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function isActiveEnrollmentState(value) {
  return ['confirmado', 'pendiente', 'pago_pendiente', 'pago_en_verificacion'].includes(String(value || '').trim().toLowerCase())
}

function AvailableCompetitionsPanel({ competitions, onParticipate, enrollmentByComp, isAthlete, isMobile }) {
  const openItems = (Array.isArray(competitions) ? competitions : [])
    .filter((item) => item.enrollment_open)
    .filter((item) => !isActiveEnrollmentState(enrollmentByComp[item.id]))
    .slice(0, 4)
  const cards = openItems.map((competition, index) => mapCompetitionViewModel(competition, index))
  if (!openItems.length) return null
  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, color: premium.text, fontSize: 24 }}>Elige tu proxima competencia</h2>
        <p style={{ margin: '6px 0 0', color: premium.textSoft, fontSize: 14 }}>Estas son las inscripciones abiertas ahora.</p>
      </div>
      <CompetitionGrid
        competitions={cards}
        isMobile={isMobile}
        renderCard={(competition) => (
          <HomeCompetitionCard
            competition={competition}
            isMobile={isMobile}
            isAthlete={isAthlete}
            enrollmentState={enrollmentByComp[competition.id]}
            onParticipate={onParticipate}
            getButtonState={buttonStateForCompetition}
          />
        )}
      />
    </section>
  )
}

function QrModal({ open, loading, error, payload, competitionName, onClose }) {
  if (!open) return null
  return (
    <div role="dialog" aria-modal="true" aria-label="Mi QR de check-in" style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', padding: 16 }}>
      <button type="button" aria-label="Cerrar QR" onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.64)', border: 'none' }} />
      <div style={{ position: 'relative', width: 'min(100%, 480px)', maxHeight: '90dvh', overflow: 'hidden', borderRadius: 6, border: `1px solid ${premium.border}`, background: premium.surface, display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'sticky', top: 0, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: 16, borderBottom: `1px solid ${premium.border}`, background: premium.surface }}>
          <div>
            <div style={{ color: premium.text, fontWeight: 800 }}>Mi QR de check-in</div>
            <div style={{ color: premium.textSoft, fontSize: 12, marginTop: 4 }}>{competitionName || 'Competencia'}</div>
          </div>
          <button type="button" onClick={onClose} style={{ width: 38, height: 38, borderRadius: 6, border: `1px solid ${premium.border}`, background: '#0D0F12', color: premium.text, display: 'grid', placeItems: 'center', padding: 0 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: 18, display: 'grid', gap: 12 }}>
          {loading ? <div style={{ color: premium.textSoft }}>Cargando QR...</div> : null}
          {!loading && error ? <div style={{ color: '#EF4444' }}>{error}</div> : null}
          {!loading && payload?.qr_image_data_url ? (
            <>
              <div style={{ borderRadius: 6, background: '#0D0F12', border: `1px solid ${premium.border}`, padding: 16, display: 'grid', placeItems: 'center' }}>
                <img src={payload.qr_image_data_url} alt="QR de check-in" style={{ width: '100%', maxWidth: 320, background: '#F5F7FA', borderRadius: 6, padding: 8 }} />
              </div>
              <div style={{ color: premium.textSoft, fontSize: 13 }}>Codigo: <strong style={{ color: '#00C2A8' }}>{payload.short_code || '--'}</strong></div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function PersonalHome({
  isMobile,
  myComps,
  publicCompetitions,
  primaryCompetition,
  hasCurrentOrFuture,
  leaderboard,
  results,
  nextHeat,
  loading,
  detailsLoading,
  onOpenQr,
  onParticipate,
  enrollmentByComp,
  isAthlete,
}) {
  if (loading) {
    return <PersonalHomeSkeleton isMobile={isMobile} />
  }

  if (!primaryCompetition || !hasCurrentOrFuture) {
    return (
      <div style={{ display: 'grid', gap: 20 }}>
        <section className="fr-cut-card" style={{ border: `1px solid ${premium.border}`, background: 'linear-gradient(135deg, rgba(255,107,0,0.18), rgba(23,27,33,0.96))', padding: 22 }}>
          <div style={{ color: '#FF9A3D', fontSize: 12, fontWeight: 800, letterSpacing: 1.1, textTransform: 'uppercase' }}>Inicio</div>
          <h1 style={{ margin: '10px 0', color: premium.text, fontSize: isMobile ? 36 : 58, lineHeight: 1 }}>Elige tu proxima competencia</h1>
          <p style={{ margin: 0, color: premium.textSoft, maxWidth: 700, lineHeight: 1.6 }}>Si ya llegaste a FinalRep, lo importante es competir. Entra a una inscripcion abierta y deja tu evento listo en pocos pasos.</p>
        </section>
        <AvailableCompetitionsPanel competitions={publicCompetitions} onParticipate={onParticipate} enrollmentByComp={enrollmentByComp} isAthlete={isAthlete} isMobile={isMobile} />
        <CompactEventList items={myComps} primaryId={null} />
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <PrimaryCompetitionPanel competition={primaryCompetition} leaderboard={leaderboard} leaderboardLoading={detailsLoading} onOpenQr={onOpenQr} isMobile={isMobile} />
      {detailsLoading ? <SkeletonMetricGrid count={3} /> : null}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 0.9fr) minmax(0, 1.1fr)', gap: 18 }}>
        {detailsLoading ? <SkeletonList count={2} /> : <NextHeatPanel heat={nextHeat} timeZone={primaryCompetition?.timezone} />}
        {detailsLoading ? <SkeletonList count={3} /> : <ScorePanel leaderboard={leaderboard} results={results} />}
      </div>
      <CompactEventList items={myComps} primaryId={primaryCompetition.id} />
      <AvailableCompetitionsPanel competitions={publicCompetitions} onParticipate={onParticipate} enrollmentByComp={enrollmentByComp} isAthlete={isAthlete} isMobile={isMobile} />
    </div>
  )
}

function findNextPublicHeat(schedule, athleteId) {
  const now = Date.now()
  return (schedule?.items || [])
    .map((item) => {
      const participant = (item.participants || []).find((entry) => String(entry.user_id ?? entry.id) === String(athleteId))
      if (!participant) return null
      const startMs = Date.parse(item.start_at || '')
      return {
        phaseName: item.phase_name || 'Workout',
        heatLabel: item.heat_label || `Heat ${item.heat_number || ''}`.trim(),
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

function formatFollowHeatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function followStatus(snapshot) {
  if (!snapshot) return { label: 'Pendiente', tone: premium.textMuted, icon: Clock3 }
  if (snapshot.rank && snapshot.rank <= 3) return { label: 'Zona podio', tone: '#D4A537', icon: Medal }
  if (snapshot.resultsCount > 0) return { label: 'En competencia', tone: premium.teal, icon: CheckCircle2 }
  return { label: 'Sin resultados', tone: premium.textMuted, icon: Clock3 }
}

function bestFollowWorkout(snapshot) {
  const rows = (snapshot?.phaseResults || []).filter((item) => item.rank != null)
  if (!rows.length) return null
  return [...rows].sort((a, b) => Number(a.rank) - Number(b.rank))[0]
}

function changeTone(change) {
  if (change?.type === 'rank_up') return { color: premium.teal, icon: TrendingUp }
  if (change?.type === 'rank_down') return { color: '#F59E0B', icon: TrendingDown }
  if (change?.type === 'new_result') return { color: '#FF9A3D', icon: Flame }
  return { color: premium.textMuted, icon: Bell }
}

function SpectatorFollowPanel({ follows, detailsByKey, onUnfollow, isMobile }) {
  if (!follows.length) return null
  const snapshots = readSpectatorSnapshots()

  return (
    <section style={{ border: `1px solid ${premium.border}`, background: 'rgba(23,26,32,0.86)', borderRadius: 12, padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Bell size={17} color="#FF6B00" />
          <div style={{ color: premium.text, fontWeight: 900 }}>Atletas seguidos</div>
        </div>
        <Link to="/notifications" style={{ color: premium.teal, textDecoration: 'none', fontSize: 12, fontWeight: 900 }}>
          Ver actividad
        </Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
        {follows.slice(0, 4).map((follow) => {
          const key = `${follow.competitionId}:${follow.athleteId}`
          const detail = detailsByKey[key] || {}
          const snapshot = detail.snapshot || snapshots[key]
          const nextHeat = detail.nextHeat || null
          const bestWorkout = bestFollowWorkout(snapshot)
          const completed = Number(snapshot?.resultsCount || 0)
          const total = Math.max(completed, Number(snapshot?.phaseResults?.length || 0))
          const progressPct = total ? Math.min(100, Math.round((completed / total) * 100)) : 0
          const status = followStatus(snapshot)
          const StatusIcon = status.icon
          const latestChange = detail.latestChange || null
          const latestTone = changeTone(latestChange)
          const ChangeIcon = latestTone.icon
          return (
            <div key={key} style={{ border: '1px solid rgba(214,217,224,0.12)', background: '#0D0F12', borderRadius: 10, padding: 12, display: 'grid', gap: 11 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: premium.text, fontWeight: 900, overflowWrap: 'anywhere' }}>{follow.athleteName}</div>
                  <div style={{ color: premium.textMuted, fontSize: 12, marginTop: 3, overflowWrap: 'anywhere' }}>{follow.competitionName}</div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: status.tone, border: `1px solid ${status.tone}33`, background: `${status.tone}14`, borderRadius: 999, padding: '5px 8px', fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap' }}>
                  <StatusIcon size={12} />
                  {status.label}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                <div style={{ border: `1px solid ${premium.border}`, borderRadius: 8, padding: '8px 9px', background: '#111419' }}>
                  <div style={{ color: premium.textMuted, fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>Puesto</div>
                  <div style={{ color: snapshot?.rank ? '#FF9A3D' : premium.textMuted, fontSize: 18, fontWeight: 900, marginTop: 2 }}>#{snapshot?.rank ?? '-'}</div>
                </div>
                <div style={{ border: `1px solid ${premium.border}`, borderRadius: 8, padding: '8px 9px', background: '#111419' }}>
                  <div style={{ color: premium.textMuted, fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>Puntos</div>
                  <div style={{ color: premium.teal, fontSize: 18, fontWeight: 900, marginTop: 2 }}>{snapshot?.totalPoints ?? '-'}</div>
                </div>
                <div style={{ border: `1px solid ${premium.border}`, borderRadius: 8, padding: '8px 9px', background: '#111419' }}>
                  <div style={{ color: premium.textMuted, fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>WODs</div>
                  <div style={{ color: premium.text, fontSize: 18, fontWeight: 900, marginTop: 2 }}>{total ? `${completed}/${total}` : '-'}</div>
                </div>
              </div>

              {total ? (
                <div style={{ height: 6, borderRadius: 999, background: 'rgba(214,217,224,0.10)', overflow: 'hidden' }}>
                  <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)' }} />
                </div>
              ) : null}

              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ border: `1px solid ${latestTone.color}30`, background: `${latestTone.color}10`, borderRadius: 8, padding: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: latestTone.color, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
                    <ChangeIcon size={13} />
                    Ultimo cambio
                  </div>
                  <div style={{ color: premium.textSoft, fontSize: 12, lineHeight: 1.45, marginTop: 5 }}>
                    {latestChange ? `${latestChange.title}. ${latestChange.body}` : 'Sin cambios nuevos desde la ultima revision.'}
                  </div>
                </div>

                <div style={{ border: `1px solid ${premium.border}`, background: '#111419', borderRadius: 8, padding: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: premium.teal, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
                    <Clock3 size={13} />
                    Proximo heat
                  </div>
                  <div style={{ color: premium.textSoft, fontSize: 12, lineHeight: 1.45, marginTop: 5 }}>
                    {nextHeat
                      ? `${nextHeat.phaseName} · ${nextHeat.heatLabel}${nextHeat.lane ? ` · Lane ${nextHeat.lane}` : ''}${nextHeat.startAt ? ` · ${formatFollowHeatTime(nextHeat.startAt)}` : ''}`
                      : 'Sin heat publicado por ahora.'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', color: premium.textMuted, fontSize: 12 }}>
                  {bestWorkout ? <span>Mejor WOD: {bestWorkout.phaseName} #{bestWorkout.rank}</span> : null}
                  {follow.category ? <span>{follow.category}</span> : null}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Link to={`/leaderboard/${follow.competitionId}`} style={{ color: '#FF9A3D', textDecoration: 'none', fontSize: 12, fontWeight: 900 }}>Leaderboard</Link>
                {follow.username ? <Link to={`/a/${follow.username}`} style={{ color: premium.teal, textDecoration: 'none', fontSize: 12, fontWeight: 900 }}>Perfil</Link> : null}
                <button type="button" aria-label="Dejar de seguir" onClick={() => onUnfollow(follow)} style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 8, border: `1px solid ${premium.border}`, background: '#171A20', color: premium.textMuted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 0, cursor: 'pointer' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function HomeVariants({ variant = 1 }) {
  const navigate = useNavigate()
  const { session, role, userId, isAthlete } = useAuth()
  const [competitions, setCompetitions] = useState([])
  const [myComps, setMyComps] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [schedulePayload, setSchedulePayload] = useState(null)
  const [leaderboardPayload, setLeaderboardPayload] = useState(null)
  const [resultItems, setResultItems] = useState([])
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrError, setQrError] = useState('')
  const [qrPayload, setQrPayload] = useState(null)
  const [qrCompetitionName, setQrCompetitionName] = useState('')
  const [spectatorFollows, setSpectatorFollows] = useState(() => readSpectatorFollows())
  const [spectatorDetails, setSpectatorDetails] = useState({})
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => subscribeSpectatorFollows(setSpectatorFollows), [])

  useEffect(() => {
    if (!spectatorFollows.length) {
      setSpectatorDetails({})
      return undefined
    }
    let active = true
    const refresh = async () => {
      try {
        const { detailsByKey } = await fetchFollowSummary(spectatorFollows)
        if (active) setSpectatorDetails(detailsByKey)
      } catch {
        if (active) setSpectatorDetails({})
      }
    }

    refresh()
    const timer = window.setInterval(refresh, 30000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [spectatorFollows])

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

  const primaryCompetition = useMemo(
    () => selectPrimaryUserCompetition(myComps),
    [myComps]
  )
  const hasCurrentOrFuture = useMemo(
    () => hasCurrentOrFutureUserCompetition(myComps),
    [myComps]
  )
  const leaderboardSummary = useMemo(
    () => extractUserLeaderboardSummary(leaderboardPayload, userId),
    [leaderboardPayload, userId]
  )
  const myResults = useMemo(
    () => normalizeUserResults(resultItems),
    [resultItems]
  )
  const nextHeat = useMemo(
    () => getNextPersonalHeat(schedulePayload),
    [schedulePayload]
  )

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    document.body.classList.toggle('fr-modal-open', qrModalOpen)
    return () => document.body.classList.remove('fr-modal-open')
  }, [qrModalOpen])

  useEffect(() => {
    if (!session || !isAthlete || !userId || !primaryCompetition?.id || !hasCurrentOrFuture) {
      setSchedulePayload(null)
      setLeaderboardPayload(null)
      setResultItems([])
      setDetailsLoading(false)
      return
    }

    let active = true
    setDetailsLoading(true)
    Promise.all([
      api.get(`/competitions/${primaryCompetition.id}/my-schedule`).catch(() => ({ data: null })),
      api.get(`/leaderboard/${primaryCompetition.id}`).catch(() => ({ data: null })),
      api.get(`/results?competition_id=${primaryCompetition.id}`).catch(() => ({ data: [] })),
    ])
      .then(([scheduleResponse, leaderboardResponse, resultsResponse]) => {
        if (!active) return
        setSchedulePayload(scheduleResponse.data || null)
        setLeaderboardPayload(leaderboardResponse.data || null)
        setResultItems(Array.isArray(resultsResponse.data) ? resultsResponse.data : [])
      })
      .finally(() => {
        if (!active) return
        setDetailsLoading(false)
      })

    return () => {
      active = false
    }
  }, [session, isAthlete, userId, primaryCompetition?.id, hasCurrentOrFuture])

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

  const openQrModal = async (competition) => {
    if (!competition?.id) return
    setQrModalOpen(true)
    setQrCompetitionName(competition.nombre || '')
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

  return (
    <div style={{ minHeight: '100vh', background: homePageBg, color: premium.text }}>
      <div style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: isMobile ? '18px 14px 112px' : '24px 18px 72px' }}>
        {session && isAthlete && userId ? (
          <>
            <PersonalHome
              isMobile={isMobile}
              myComps={myComps}
              publicCompetitions={featuredCompetitions}
              primaryCompetition={primaryCompetition}
              hasCurrentOrFuture={hasCurrentOrFuture}
              leaderboard={leaderboardSummary}
              results={myResults}
              nextHeat={nextHeat}
              loading={loading}
              detailsLoading={detailsLoading}
              onOpenQr={openQrModal}
              onParticipate={handleParticipate}
              enrollmentByComp={enrollmentByComp}
              isAthlete={isAthlete}
            />
            <div style={{ marginTop: 18 }}>
              <SpectatorFollowPanel
                follows={spectatorFollows}
                detailsByKey={spectatorDetails}
                isMobile={isMobile}
                onUnfollow={(follow) => setSpectatorFollows(unfollowAthlete(follow.competitionId, follow.athleteId))}
              />
            </div>
          </>
        ) : (
        <>
        <HomeVariantTop
          variant={variant}
          isMobile={isMobile}
          totalCompetitions={featuredCompetitions.length}
          openCount={openCount}
          activeCount={activeCount}
        />

        <CommandStrip items={commandItems} isMobile={isMobile} />

        <SpectatorFollowPanel
          follows={spectatorFollows}
          detailsByKey={spectatorDetails}
          isMobile={isMobile}
          onUnfollow={(follow) => setSpectatorFollows(unfollowAthlete(follow.competitionId, follow.athleteId))}
        />

        <section>
          <CompetitionSectionHeader totalVisible={competitionCards.length} query={query} />
          <CompetitionSearch value={query} onChange={setQuery} />

          {loading ? (
            <SkeletonCardGrid count={6} minWidth={260} />
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
        </>
        )}
      </div>
      <QrModal
        open={qrModalOpen}
        loading={qrLoading}
        error={qrError}
        payload={qrPayload}
        competitionName={qrCompetitionName}
        onClose={() => setQrModalOpen(false)}
      />
    </div>
  )
}

