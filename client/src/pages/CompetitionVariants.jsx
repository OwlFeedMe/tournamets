import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../api/axios'
import { COMPETITION_PAGE_MAX_WIDTH } from '../utils/competitionLayout'
import { FINALREP_COMPETITION_THEME, getReadableTextColor } from '../utils/competitionTheme'

const TARGET_COMPETITION = 'unbroken games'

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function formatDateRange(start, end) {
  const startLabel = formatDate(start)
  const endLabel = formatDate(end)
  if (!startLabel && !endLabel) return 'Fechas por confirmar'
  if (!startLabel) return `Hasta ${endLabel}`
  if (!endLabel) return `Desde ${startLabel}`
  return `${startLabel} - ${endLabel}`
}

function parseLandingSections(raw) {
  if (!raw) return null
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const normalizeItems = (items) => (Array.isArray(items) ? items : [])
      .map((item, idx) => ({
        id: String(item?.id || `item_${idx + 1}`),
        title: String(item?.title || '').trim(),
        body: String(item?.body || '').trim(),
      }))
      .filter(item => item.title || item.body)

    return {
      experience: {
        title: String(parsed?.experience?.title || '').trim(),
        intro: String(parsed?.experience?.intro || '').trim(),
        items: normalizeItems(parsed?.experience?.items),
      },
      format: {
        title: String(parsed?.format?.title || '').trim(),
        items: normalizeItems(parsed?.format?.items),
      },
      highlights: {
        title: String(parsed?.highlights?.title || '').trim(),
        items: normalizeItems(parsed?.highlights?.items),
      },
    }
  } catch {
    return null
  }
}

function parseScheduleItems(raw) {
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item, idx) => ({
        id: String(item?.id || `date_${idx + 1}`),
        label: String(item?.label || '').trim(),
        start_at: item?.start_at || null,
        end_at: item?.end_at || null,
        note: String(item?.note || '').trim(),
      }))
      .filter(item => item.label || item.start_at || item.end_at || item.note)
  } catch {
    return []
  }
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

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function getStatusLabel(competition) {
  if (competition?.enrollment_open) return { label: 'Inscripciones abiertas', tone: FINALREP_COMPETITION_THEME.accent }
  if (competition?.activa) return { label: 'Competencia activa', tone: FINALREP_COMPETITION_THEME.primary }
  return { label: 'Proximamente', tone: FINALREP_COMPETITION_THEME.textSecondary }
}

function getCompetitionMode(config) {
  const individual = !!config?.individual_enabled
  const teams = !!config?.team_enabled
  if (individual && teams) return 'Individual + Equipos'
  if (teams) return 'Por equipos'
  return 'Individual'
}

function buildVariantMeta(baseId) {
  return [
    { id: 1, label: '01', path: '/competition1', note: 'Banner completo' },
    { id: 2, label: '02', path: '/competition2', note: 'Split premium' },
    { id: 3, label: '03', path: '/competition3', note: 'Poster vertical' },
    { id: 4, label: '04', path: '/competition4', note: 'Editorial' },
    { id: 5, label: '05', path: '/competition5', note: 'Arena data' },
  ].map((item) => ({ ...item, baseId }))
}

function pageBackground() {
  return `
    radial-gradient(circle at top, rgba(214,217,224,0.10), transparent 26%),
    radial-gradient(circle at 84% 12%, rgba(94,234,212,0.10), transparent 22%),
    #0D0F12
  `
}

function bannerFillStyle(url, fallback) {
  return {
    backgroundColor: '#0D0F12',
    backgroundImage: url
      ? `linear-gradient(180deg, rgba(13,15,18,0.18), rgba(13,15,18,0.82)), url("${url}")`
      : fallback,
    backgroundPosition: 'center center',
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
  }
}

function pillStyle(active) {
  return {
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 999,
    border: `1px solid ${active ? 'rgba(214,217,224,0.34)' : 'rgba(214,217,224,0.14)'}`,
    background: active ? 'rgba(214,217,224,0.14)' : 'rgba(13,15,18,0.62)',
    color: '#F5F7FA',
    fontSize: 12,
    fontWeight: 800,
  }
}

function chipStyle() {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid rgba(214,217,224,0.16)',
    background: 'rgba(13,15,18,0.58)',
    color: '#F5F7FA',
    fontSize: 12,
    fontWeight: 800,
  }
}

function infoCardStyle() {
  return {
    border: '1px solid rgba(214,217,224,0.14)',
    background: '#171A20',
    padding: 18,
  }
}

function MiniStat({ label, value, accent = false }) {
  return (
    <div className="fr-cut-card" style={{ ...infoCardStyle(), background: accent ? 'linear-gradient(135deg, rgba(214,217,224,0.10), rgba(94,234,212,0.10) 58%, #171A20 100%)' : '#171A20' }}>
      <div style={{ color: 'var(--oa-text-secondary)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ marginTop: 8, color: '#F5F7FA', fontSize: 18, fontWeight: 800, lineHeight: 1.25 }}>{value}</div>
    </div>
  )
}

function SectionTitle({ kicker, title, body }) {
  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ color: 'var(--oa-accent)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2 }}>{kicker}</div>
      <h2 style={{ margin: '8px 0 0', fontSize: 'clamp(24px, 4vw, 34px)', lineHeight: 1.02 }}>{title}</h2>
      {body ? <p style={{ margin: '12px 0 0', color: 'var(--oa-text-secondary)', fontSize: 14, lineHeight: 1.7 }}>{body}</p> : null}
    </div>
  )
}

function HeroActions({ competitionId }) {
  const primaryTextColor = getReadableTextColor(FINALREP_COMPETITION_THEME.primary)
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
      <Link
        to={`/leaderboard/${competitionId}`}
        style={{
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderRadius: 6,
          background: 'linear-gradient(135deg, #D6D9E0 0%, #F1F4F8 100%)',
          color: primaryTextColor,
          fontWeight: 800,
        }}
      >
        Ver leaderboard
        <ArrowRight size={16} />
      </Link>
      <Link
        to={`/competitions/${competitionId}/schedule`}
        style={{
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderRadius: 6,
          border: '1px solid rgba(214,217,224,0.16)',
          background: 'rgba(13,15,18,0.58)',
          color: '#F5F7FA',
          fontWeight: 700,
        }}
      >
        Ver cronograma
      </Link>
      <Link
        to={`/competitions/${competitionId}/register`}
        style={{
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderRadius: 6,
          border: '1px solid rgba(94,234,212,0.22)',
          background: 'rgba(94,234,212,0.08)',
          color: '#F5F7FA',
          fontWeight: 700,
        }}
      >
        Inscribirme
      </Link>
    </div>
  )
}

function CompetitionHero({ variant, competition, bannerUrl, profileImageUrl, status, mode, stats, description, landingSections, isMobile }) {
  const heroHighlights = [
    `${stats.fases_total || 0} eventos`,
    `${stats.categorias_total || 0} categorias`,
    mode,
  ]
  const overviewText = (competition?.general_info_text || competition?.descripcion || '').trim()

  const bannerBackground = bannerUrl
    ? bannerUrl
    : ''
  const bannerFallback = 'linear-gradient(135deg, rgba(214,217,224,0.14), rgba(94,234,212,0.10) 50%, rgba(23,26,32,0.96) 100%)'

  if (variant === 1) {
    return (
      <section className="fr-cut-card" style={{ position: 'relative', overflow: 'hidden', border: '1px solid rgba(214,217,224,0.16)', ...bannerFillStyle(bannerBackground, bannerFallback), padding: isMobile ? '24px 18px' : '40px clamp(24px, 5vw, 44px)', boxShadow: '0 24px 80px rgba(0,0,0,0.28)' }}>
        <div style={{ maxWidth: 720 }}>
          <div style={{ ...chipStyle(), marginBottom: 14 }}>
            <ShieldCheck size={14} color={status.tone} />
            {status.label}
          </div>
          <h1 style={{ margin: 0, fontSize: isMobile ? 36 : 'clamp(44px, 7vw, 78px)', lineHeight: 0.92, maxWidth: 680 }}>{competition.nombre}</h1>
          <p style={{ margin: '14px 0 0', maxWidth: 620, color: '#F5F7FA', fontSize: isMobile ? 14 : 16, lineHeight: 1.7 }}>{description}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
            {heroHighlights.map((item) => <span key={item} style={chipStyle()}>{item}</span>)}
          </div>
          <HeroActions competitionId={competition.id} />
        </div>
      </section>
    )
  }

  if (variant === 2) {
    return (
      <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.05fr 0.95fr', gap: 14 }}>
        <div className="fr-cut-card" style={{ border: '1px solid rgba(214,217,224,0.16)', background: 'linear-gradient(135deg, rgba(214,217,224,0.08), rgba(94,234,212,0.08) 46%, rgba(23,26,32,0.98) 100%)', padding: isMobile ? 20 : 28 }}>
          <div style={{ ...chipStyle(), marginBottom: 14, width: 'fit-content' }}>
            <ShieldCheck size={14} color={status.tone} />
            {status.label}
          </div>
          <h1 style={{ margin: 0, fontSize: isMobile ? 34 : 'clamp(40px, 6vw, 66px)', lineHeight: 0.94 }}>{competition.nombre}</h1>
          <p style={{ margin: '14px 0 0', color: 'var(--oa-text-secondary)', fontSize: 15, lineHeight: 1.7 }}>{description}</p>
          <HeroActions competitionId={competition.id} />
        </div>
        <div className="fr-cut-card" style={{ position: 'relative', overflow: 'hidden', minHeight: isMobile ? 280 : 420, aspectRatio: isMobile ? '4 / 5' : '4 / 3', border: '1px solid rgba(214,217,224,0.16)', ...bannerFillStyle(bannerBackground, bannerFallback) }}>
          <div style={{ position: 'absolute', inset: 'auto 16px 16px 16px', display: 'grid', gap: 10 }}>
            <MiniStat label="Modo" value={mode} accent />
            <MiniStat label="Fechas" value={formatDateRange(competition.competition_start || competition.enrollment_start, competition.competition_end || competition.enrollment_end)} />
            <MiniStat label="Lugar" value={competition.lugar || 'Sede por confirmar'} />
          </div>
        </div>
      </section>
    )
  }

  if (variant === 3) {
    return (
      <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '0.72fr 1.28fr', gap: 14 }}>
        <div className="fr-cut-card" style={{ position: 'relative', overflow: 'hidden', minHeight: isMobile ? 320 : 520, aspectRatio: isMobile ? '4 / 5' : '3 / 4', border: '1px solid rgba(214,217,224,0.16)', ...bannerFillStyle(bannerBackground, bannerFallback) }}>
          <div style={{ position: 'absolute', inset: 'auto 16px 16px 16px' }}>
            <div style={chipStyle()}>{status.label}</div>
          </div>
        </div>
        <div className="fr-cut-card" style={{ border: '1px solid rgba(214,217,224,0.16)', background: '#171A20', padding: isMobile ? 20 : 28, display: 'flex', flexDirection: 'column', gap: 18, minHeight: isMobile ? 'auto' : 520 }}>
          <div>
            <div style={{ color: 'var(--oa-accent)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2 }}>Poster de competencia</div>
            <h1 style={{ margin: '10px 0 0', fontSize: isMobile ? 34 : 'clamp(42px, 6vw, 72px)', lineHeight: 0.92 }}>{competition.nombre}</h1>
            <p style={{ margin: '16px 0 0', color: 'var(--oa-text-secondary)', fontSize: 15, lineHeight: 1.7 }}>{description}</p>
          </div>
          <div className="fr-cut-card" style={{ border: '1px solid rgba(214,217,224,0.14)', background: 'rgba(13,15,18,0.58)', padding: isMobile ? 16 : 18 }}>
            <div style={{ color: 'var(--oa-accent)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1 }}>Descripcion</div>
            <div style={{ marginTop: 10, color: '#F5F7FA', fontSize: 14, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
              {overviewText || 'La competencia ya tiene una narrativa lista para sostener la portada y el resto de la pagina.'}
            </div>
          </div>
          <div style={{ marginTop: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              {heroHighlights.map((item) => <MiniStat key={item} label="Dato clave" value={item} />)}
            </div>
            <HeroActions competitionId={competition.id} />
          </div>
        </div>
      </section>
    )
  }

  if (variant === 4) {
    return (
      <section className="fr-cut-card" style={{ border: '1px solid rgba(214,217,224,0.16)', background: '#171A20', padding: isMobile ? 18 : 24 }}>
        <div style={{ display: 'grid', gap: 18 }}>
          <div>
            <div style={{ ...chipStyle(), width: 'fit-content', marginBottom: 12 }}>
              <ShieldCheck size={14} color={status.tone} />
              {status.label}
            </div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 34 : 'clamp(42px, 6vw, 68px)', lineHeight: 0.92, maxWidth: 780 }}>{competition.nombre}</h1>
            <p style={{ margin: '14px 0 0', maxWidth: 760, color: 'var(--oa-text-secondary)', fontSize: 15, lineHeight: 1.7 }}>{description}</p>
            <HeroActions competitionId={competition.id} />
          </div>
          <div className="fr-cut-card" style={{ minHeight: isMobile ? 220 : 360, aspectRatio: isMobile ? '16 / 10' : '16 / 9', border: '1px solid rgba(214,217,224,0.16)', ...bannerFillStyle(bannerBackground, bannerFallback) }} />
        </div>
      </section>
    )
  }

  return (
    <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.12fr 0.88fr', gap: 14 }}>
      <div className="fr-cut-card" style={{ border: '1px solid rgba(214,217,224,0.16)', background: '#171A20', padding: isMobile ? 20 : 28 }}>
        <div style={{ color: 'var(--oa-accent)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2 }}>Arena data</div>
        <h1 style={{ margin: '10px 0 0', fontSize: isMobile ? 34 : 'clamp(42px, 6vw, 68px)', lineHeight: 0.92 }}>{competition.nombre}</h1>
        <p style={{ margin: '14px 0 0', color: 'var(--oa-text-secondary)', fontSize: 15, lineHeight: 1.7 }}>{description}</p>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 20 }}>
          <MiniStat label="Competidores" value={`${stats.participantes_total || 0} registrados`} accent />
          <MiniStat label="Formato" value={mode} />
          <MiniStat label="Lugar" value={competition.lugar || 'Sede por confirmar'} />
          <MiniStat label="Ventana" value={formatDateRange(competition.competition_start || competition.enrollment_start, competition.competition_end || competition.enrollment_end)} />
        </div>
        <HeroActions competitionId={competition.id} />
      </div>
      <div className="fr-cut-card" style={{ position: 'relative', overflow: 'hidden', minHeight: isMobile ? 280 : 460, aspectRatio: isMobile ? '4 / 5' : '4 / 5', border: '1px solid rgba(214,217,224,0.16)', ...bannerFillStyle(bannerBackground, bannerFallback) }}>
        {profileImageUrl ? (
          <div style={{ position: 'absolute', top: 16, left: 16, width: isMobile ? 66 : 88, height: isMobile ? 66 : 88, borderRadius: 6, border: '1px solid rgba(214,217,224,0.18)', background: `#0D0F12 url("${profileImageUrl}") center/cover` }} />
        ) : null}
      </div>
    </section>
  )
}

function SharedCompetitionBody({ competition, payload, landingSections, scheduleItems, isMobile }) {
  const stats = payload?.stats || {}
  const categories = payload?.categories || []
  const highlightItems = landingSections?.highlights?.items || []
  const formatItems = landingSections?.format?.items || []
  const experienceItems = landingSections?.experience?.items || []

  return (
    <div style={{ display: 'grid', gap: 18, marginTop: 18 }}>
      <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
        <MiniStat label="Lugar" value={competition.lugar || 'Por confirmar'} accent />
        <MiniStat label="Fechas" value={formatDateRange(competition.competition_start || competition.enrollment_start, competition.competition_end || competition.enrollment_end)} />
        <MiniStat label="Categorias" value={`${stats.categorias_total || categories.length || 0} activas`} />
        <MiniStat label="Eventos" value={`${stats.fases_total || 0} publicos`} />
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 0.9fr', gap: 14 }}>
        <div className="fr-cut-card" style={{ ...infoCardStyle(), padding: isMobile ? 18 : 22 }}>
          <SectionTitle
            kicker={landingSections?.experience?.title ? 'Experiencia' : 'Overview'}
            title={landingSections?.experience?.title || 'La competencia desde adentro'}
            body={landingSections?.experience?.intro || (competition.general_info_text || competition.descripcion || '').trim() || 'La competencia ya tiene base publica para revisar formato, momentos clave y rendimiento.'}
          />
          {experienceItems.length ? (
            <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              {experienceItems.slice(0, 3).map((item) => (
                <div key={item.id} className="fr-cut-card" style={{ border: '1px solid rgba(214,217,224,0.14)', background: 'rgba(13,15,18,0.58)', padding: '12px 14px' }}>
                  <div style={{ color: '#F5F7FA', fontSize: 14, fontWeight: 800 }}>{item.title}</div>
                  {item.body ? <div style={{ marginTop: 4, color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.55 }}>{item.body}</div> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div className="fr-cut-card" style={{ ...infoCardStyle(), padding: 18 }}>
            <SectionTitle kicker="Formato" title={landingSections?.format?.title || 'Como se compite'} />
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              {(formatItems.length ? formatItems : categories.slice(0, 3).map((item) => ({ id: item.id, title: item.nombre, body: item.descripcion }))).slice(0, 3).map((item) => (
                <div key={item.id} style={{ color: '#F5F7FA', fontSize: 14, fontWeight: 700 }}>
                  {item.title}
                  {item.body ? <div style={{ marginTop: 4, color: 'var(--oa-text-secondary)', fontSize: 13, fontWeight: 500, lineHeight: 1.55 }}>{item.body}</div> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="fr-cut-card" style={{ ...infoCardStyle(), padding: 18 }}>
            <SectionTitle kicker="Puntos clave" title={landingSections?.highlights?.title || 'Lo que más pesa'} />
            <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
              {(highlightItems.length ? highlightItems : scheduleItems.slice(0, 3).map((item) => ({ id: item.id, title: item.label, body: formatDateRange(item.start_at, item.end_at) }))).slice(0, 3).map((item) => (
                <div key={item.id} style={{ color: '#F5F7FA', fontSize: 14, fontWeight: 700 }}>
                  {item.title}
                  {item.body ? <span style={{ color: 'var(--oa-text-secondary)', fontWeight: 500 }}> {item.body}</span> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="fr-cut-card" style={{ ...infoCardStyle(), padding: isMobile ? 18 : 22 }}>
        <SectionTitle kicker="Calendario" title="Momentos que ya marcan la competencia" body="Una vista corta para comparar la narrativa del evento en cada propuesta visual." />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 16 }}>
          {scheduleItems.length ? scheduleItems.slice(0, 3).map((item) => (
            <div key={item.id} className="fr-cut-card" style={{ border: '1px solid rgba(214,217,224,0.14)', background: 'rgba(13,15,18,0.58)', padding: 14 }}>
              <div style={{ color: 'var(--oa-accent)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                Fecha clave
              </div>
              <div style={{ marginTop: 8, color: '#F5F7FA', fontSize: 15, fontWeight: 800 }}>{item.label || 'Fecha'}</div>
              <div style={{ marginTop: 6, color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.55 }}>{formatDateRange(item.start_at, item.end_at)}</div>
              {item.note ? <div style={{ marginTop: 6, color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.55 }}>{item.note}</div> : null}
            </div>
          )) : (
            <div style={{ color: 'var(--oa-text-secondary)', fontSize: 14 }}>Todavia no hay fechas cargadas para esta competencia.</div>
          )}
        </div>
      </section>
    </div>
  )
}

function splitCategoryDescription(raw) {
  const text = String(raw || '').trim()
  if (!text) return { shortDescription: '', longDescription: '' }
  const parts = text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean)
  if (parts.length <= 1) return { shortDescription: text, longDescription: '' }
  return {
    shortDescription: parts[0],
    longDescription: parts.slice(1).join('\n\n'),
  }
}

function phaseStateLabel(state) {
  if (state === 'finalizada') return 'Finalizada'
  if (state === 'en_progreso') return 'En progreso'
  return 'Pendiente'
}

function phaseFormatLabel(phase) {
  const activityCount = Array.isArray(phase?.activities) && phase.activities.length ? phase.activities.length : 1
  return activityCount === 1 ? '1 actividad' : `${activityCount} actividades`
}

function VariantThreeBody({ competition, payload, landingSections, scheduleItems, isMobile }) {
  const phases = payload?.phases || []
  const categories = payload?.categories || []
  const categoriesByModality = payload?.categories_by_modality || { individual: [], teams: [] }

  return (
    <div style={{ display: 'grid', gap: 18, marginTop: 18 }}>
      {scheduleItems.length ? (
        <section className="fr-cut-card" style={{ ...infoCardStyle(), padding: isMobile ? 18 : 22 }}>
          <SectionTitle
            kicker="Calendario"
            title="Fechas clave"
            body="Lectura rápida de los momentos principales publicados para la competencia."
          />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 16 }}>
            {scheduleItems.map((item) => (
              <div key={item.id} className="fr-cut-card" style={{ border: '1px solid rgba(214,217,224,0.14)', background: 'rgba(13,15,18,0.58)', padding: 14 }}>
                <div style={{ color: 'var(--oa-accent)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Fecha clave</div>
                <div style={{ marginTop: 8, color: '#F5F7FA', fontSize: 15, fontWeight: 800 }}>{item.label || 'Fecha'}</div>
                <div style={{ marginTop: 6, color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.55 }}>{formatDateRange(item.start_at, item.end_at)}</div>
                {item.note ? <div style={{ marginTop: 6, color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.55 }}>{item.note}</div> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="fr-cut-card" style={{ ...infoCardStyle(), padding: isMobile ? 18 : 22 }}>
        <SectionTitle
          kicker="Fases"
          title="Estructura competitiva"
          body="Cada fase baja a lectura directa con estado, ventana de fechas y carga de trabajo."
        />
        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          {phases.length ? phases.map((phase) => (
            <div key={phase.id} className="fr-cut-card" style={{ border: '1px solid rgba(214,217,224,0.14)', background: 'rgba(13,15,18,0.58)', padding: isMobile ? 14 : 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 800 }}>{phase.nombre}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={chipStyle()}>{phaseStateLabel(phase.estado)}</span>
                  <span style={chipStyle()}>{phaseFormatLabel(phase)}</span>
                </div>
              </div>
              <div style={{ marginTop: 8, color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.55 }}>
                {formatDateRange(phase.start_at, phase.end_at)}
              </div>
              {Array.isArray(phase.activities) && phase.activities.length ? (
                <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                  {phase.activities.slice(0, 2).map((activity, index) => (
                    <div key={`${phase.id}-${index}`} style={{ color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      <span style={{ color: '#F5F7FA', fontWeight: 700 }}>WOD {index + 1}:</span> {activity?.descripcion || activity?.part_b_descripcion || 'Pendiente por publicar'}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )) : (
            <div style={{ color: 'var(--oa-text-secondary)', fontSize: 14 }}>Todavia no hay fases publicadas para esta competencia.</div>
          )}
        </div>
      </section>

      <section className="fr-cut-card" style={{ ...infoCardStyle(), padding: isMobile ? 18 : 22 }}>
        <SectionTitle
          kicker="Categorias"
          title="Divisiones de la competencia"
          body="Cada categoria queda listada con tono, descripcion y modalidad."
        />
        <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
          {Object.entries(categoriesByModality).filter(([, items]) => Array.isArray(items) && items.length).map(([modality, items]) => (
            <div key={modality} style={{ display: 'grid', gap: 10 }}>
              <div style={{ color: modality === 'teams' ? 'var(--oa-primary)' : 'var(--oa-accent)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                {modality === 'teams' ? 'Equipos' : 'Individual'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                {items.map((category) => {
                  const { shortDescription, longDescription } = splitCategoryDescription(category.descripcion)
                  return (
                    <div key={category.id} className="fr-cut-card" style={{ border: '1px solid rgba(214,217,224,0.14)', background: 'rgba(13,15,18,0.58)', padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                        <div style={{ color: '#F5F7FA', fontSize: 14, fontWeight: 800 }}>{category.nombre}</div>
                        <span style={chipStyle()}>{modality === 'teams' ? 'Equipos' : 'Individual'}</span>
                      </div>
                      <div style={{ marginTop: 8, color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
                        {shortDescription || 'Categoria pendiente por detallar.'}
                      </div>
                      {longDescription ? (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(214,217,224,0.12)', color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          {longDescription}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {!categories.length ? (
            <div style={{ color: 'var(--oa-text-secondary)', fontSize: 14 }}>Sin categorias definidas.</div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

export default function CompetitionVariants({ variant = 1 }) {
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [baseCompetitionId, setBaseCompetitionId] = useState(null)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')
      try {
        const { data } = await api.get('/competitions?scope=public')
        const items = Array.isArray(data) ? data : []
        const match = items.find((item) => normalizeText(item?.nombre) === TARGET_COMPETITION)
          || items.find((item) => normalizeText(item?.nombre).includes(TARGET_COMPETITION))
          || items[0]

        if (!match?.id) {
          throw new Error('No se encontro una competencia publica para construir variantes.')
        }

        const detail = await api.get(`/competitions/${match.id}/public`)
        if (!active) return
        setBaseCompetitionId(match.id)
        setPayload(detail.data || null)
      } catch (err) {
        if (!active) return
        setError(err.response?.data?.detail || err.message || 'No se pudieron cargar las variantes de competencia.')
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  const competition = payload?.competition || null
  const stats = payload?.stats || {}
  const status = getStatusLabel(competition)
  const mode = getCompetitionMode(payload?.modality_config || null)
  const landingSections = useMemo(() => parseLandingSections(competition?.landing_sections), [competition?.landing_sections])
  const scheduleItems = useMemo(() => parseScheduleItems(competition?.schedule_items), [competition?.schedule_items])
  const bannerUrl = resolveCompetitionAsset(competition, 'banner')
  const profileImageUrl = resolveCompetitionAsset(competition, 'profile')
  const description = (competition?.descripcion || competition?.general_info_text || '').trim() || 'La pagina publica entra con tono premium, agenda clara y una lectura inmediata del nivel de la competencia.'
  const variants = buildVariantMeta(baseCompetitionId)

  return (
    <div style={{ minHeight: '100vh', background: pageBackground(), color: FINALREP_COMPETITION_THEME.text }}>
      <div style={{ maxWidth: COMPETITION_PAGE_MAX_WIDTH, margin: '0 auto', padding: isMobile ? '16px 14px 56px' : '24px 24px 72px' }}>
        <section className="fr-cut-card" style={{ ...infoCardStyle(), padding: isMobile ? 16 : 18, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: 'var(--oa-accent)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2 }}>Laboratorio de competencia</div>
              <div style={{ marginTop: 8, fontSize: isMobile ? 22 : 28, fontWeight: 800, lineHeight: 1.04 }}>5 propuestas para la landing de {competition?.nombre || 'la competencia'}</div>
              <div style={{ marginTop: 8, color: 'var(--oa-text-secondary)', fontSize: 14, lineHeight: 1.65 }}>
                Misma data. Cinco jerarquias visuales distintas. Una de ellas empuja el banner como pieza principal.
              </div>
            </div>
            {baseCompetitionId ? (
              <Link to={`/competitions/${baseCompetitionId}`} style={{ ...pillStyle(false), whiteSpace: 'nowrap' }}>
                Ver landing actual
              </Link>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            {variants.map((item) => (
              <Link key={item.id} to={item.path} style={pillStyle(item.id === variant)}>
                {item.label}
                <span style={{ color: item.id === variant ? '#F5F7FA' : 'var(--oa-text-secondary)', fontWeight: 700 }}>{item.note}</span>
              </Link>
            ))}
          </div>
        </section>

        {loading ? (
          <div style={{ color: 'var(--oa-text-secondary)', fontSize: 14 }}>Cargando variantes de competencia...</div>
        ) : error ? (
          <div className="fr-cut-card" style={{ ...infoCardStyle(), padding: 22, color: '#F5F7FA' }}>{error}</div>
        ) : competition ? (
          <>
            <CompetitionHero
              variant={variant}
              competition={competition}
              bannerUrl={bannerUrl}
              profileImageUrl={profileImageUrl}
              status={status}
              mode={mode}
              stats={stats}
              description={description}
              landingSections={landingSections}
              isMobile={isMobile}
            />
            {variant === 3 ? (
              <VariantThreeBody
                competition={competition}
                payload={payload}
                landingSections={landingSections}
                scheduleItems={scheduleItems}
                isMobile={isMobile}
              />
            ) : (
              <SharedCompetitionBody
                competition={competition}
                payload={payload}
                landingSections={landingSections}
                scheduleItems={scheduleItems}
                isMobile={isMobile}
              />
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
