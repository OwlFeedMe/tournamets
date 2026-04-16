import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Clock3, MapPin, Medal, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { COMPETITION_PAGE_MAX_WIDTH } from '../utils/competitionLayout'
import { getReadableTextColor, hexToRgba, resolveCompetitionTheme } from '../utils/competitionTheme'

function buildPageBackground(theme) {
  return `radial-gradient(circle at top, ${hexToRgba(theme.primary, 0.16)}, transparent 28%), radial-gradient(circle at 88% 12%, ${hexToRgba(theme.accent, 0.10)}, transparent 24%), ${theme.background}`
}

const scheduleCopy = {
  public: {
    eyebrow: 'Cronograma publico',
    title: 'Todos los heats en un solo lugar',
    description: 'Consulta horarios, ubicaciones y participantes publicados para la competencia.',
    empty: 'Aun no se publican heats. Cuando el staff los active, apareceran aqui.',
  },
  personal: {
    eyebrow: 'Mi cronograma',
    title: 'Tus salidas, sin buscar de mas',
    description: 'Veras solo tus heats y cambios de horario o ubicacion cuando el backend entregue la asignacion personal.',
    empty: 'Todavia no hay asignaciones personales publicadas para tu perfil.',
  },
}

function parseJson(value, fallback = []) {
  if (!value) return fallback
  if (Array.isArray(value)) return value
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function formatDateTime(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDateRange(start, end) {
  const startLabel = formatDateTime(start)
  const endLabel = formatDateTime(end)
  if (!startLabel && !endLabel) return 'Por confirmar'
  if (!startLabel) return `Hasta ${endLabel}`
  if (!endLabel) return `Desde ${startLabel}`
  return `${startLabel} - ${endLabel}`
}

function getPhaseId(value) {
  if (value == null || value === '') return ''
  return String(value)
}

function normalizeParticipant(item, index) {
  if (!item || typeof item !== 'object') return null
  const id = item.id ?? item.participant_id ?? item.participantId ?? `p_${index + 1}`
  const firstName = String(item.nombre || item.first_name || item.name || '').trim()
  const lastName = String(item.apellido || item.last_name || '').trim()
  const name = String(item.participant_name || item.full_name || [firstName, lastName].filter(Boolean).join(' ') || '').trim()
  return {
    id: String(id),
    name: name || `Participante ${index + 1}`,
    category: String(item.categoria || item.category || item.enrollment_category || '').trim(),
    lane: item.lane ?? item.lane_number ?? item.lane_no ?? null,
    note: String(item.note || item.comment || '').trim(),
  }
}

function normalizeScheduleItem(item, index) {
  if (!item || typeof item !== 'object') return null
  const participants = parseJson(item.participants || item.assignments || item.entries).map(normalizeParticipant).filter(Boolean)
  const phaseId = getPhaseId(item.phase_id ?? item.phaseId)
  const phaseName = String(item.phase_name || item.phase || item.block_name || '').trim()
  const title = String(item.heat_label || item.label || item.title || '').trim() || (participants.length ? `Heat ${item.heat_number ?? index + 1}` : `Bloque ${index + 1}`)
  return {
    id: String(item.id ?? item.heat_id ?? `item_${index + 1}`),
    kind: String(item.kind || item.type || (participants.length ? 'heat' : 'block')).trim().toLowerCase(),
    phaseId,
    phaseName,
    title,
    heatNumber: item.heat_number ?? item.heat ?? null,
    lane: item.lane ?? item.lane_number ?? null,
    startAt: item.start_at || item.starts_at || item.start || null,
    endAt: item.end_at || item.ends_at || item.end || null,
    locationName: String(item.location_name || item.location || item.venue || '').trim(),
    locationDetail: String(item.location_detail || item.venue_detail || '').trim(),
    checkInAt: item.checkin_at || item.call_room_at || item.call_time || null,
    note: String(item.note || item.description || '').trim(),
    participants,
  }
}

function normalizeCompetitionSchedule(payload, fallbackCompetition = null) {
  const root = payload?.schedule || payload?.data || payload || {}
  const competition = root.competition || payload?.competition || fallbackCompetition
  const phaseSource = root.phases || payload?.phases || fallbackCompetition?.phases || []
  const phases = parseJson(phaseSource).length ? parseJson(phaseSource) : parseJson(phaseSource, [])
  const rawItems = root.items || root.heats || root.schedule_items || payload?.items || payload?.heats || payload?.schedule_items || []
  const items = parseJson(rawItems).map(normalizeScheduleItem).filter(Boolean)
  const updatedAt = root.updated_at || payload?.updated_at || payload?.last_updated || null
  const note = String(root.note || payload?.note || '').trim()
  const summary = root.summary || payload?.summary || {}
  const scope = String(root.scope || payload?.scope || '').trim().toLowerCase()
  return { competition, phases, items, updatedAt, note, summary, scope }
}

function buildFallbackSections(competitionPayload) {
  const phases = parseJson(competitionPayload?.phases || [])
  const scheduleItems = parseJson(competitionPayload?.competition?.schedule_items || competitionPayload?.schedule_items || [])
  const phaseMap = new Map(phases.map(phase => [String(phase.id), phase]))
  const sections = []

  phases.forEach((phase, index) => {
    sections.push({
      id: `phase-${phase.id ?? index + 1}`,
      phaseId: phase.id != null ? String(phase.id) : '',
      phaseName: String(phase.nombre || `Fase ${index + 1}`),
      title: String(phase.nombre || `Fase ${index + 1}`),
      subtitle: phase.descripcion || phase.block_name || 'Bloque publicado',
      startAt: phase.start_at || null,
      endAt: phase.end_at || null,
      locationName: String(phase.location_name || phase.location || '').trim(),
      locationDetail: String(phase.location_detail || '').trim(),
      kind: 'phase',
      note: phase.descripcion || '',
      items: [],
    })
  })

  scheduleItems.forEach((item, index) => {
    const phaseId = item.phase_id != null ? String(item.phase_id) : ''
    const linkedPhase = phaseId ? phaseMap.get(phaseId) : null
    const sectionId = phaseId ? `phase-${phaseId}` : `date-${item.id || index + 1}`
    const section = sections.find(entry => entry.id === sectionId)
    const normalizedItem = normalizeScheduleItem({
      ...item,
      phase_name: linkedPhase?.nombre || item.phase_name || '',
      kind: item.kind || 'date',
    }, index)
    if (section) {
      section.items.push(normalizedItem)
      if (!section.startAt && normalizedItem.startAt) section.startAt = normalizedItem.startAt
      if (!section.endAt && normalizedItem.endAt) section.endAt = normalizedItem.endAt
      if (!section.locationName && normalizedItem.locationName) section.locationName = normalizedItem.locationName
      if (!section.locationDetail && normalizedItem.locationDetail) section.locationDetail = normalizedItem.locationDetail
      return
    }
    sections.push({
      id: sectionId,
      phaseId,
      phaseName: linkedPhase?.nombre || normalizedItem.phaseName || '',
      title: normalizedItem.title,
      subtitle: linkedPhase?.descripcion || normalizedItem.note || 'Fecha publicada',
      startAt: normalizedItem.startAt,
      endAt: normalizedItem.endAt,
      locationName: normalizedItem.locationName,
      locationDetail: normalizedItem.locationDetail,
      kind: normalizedItem.kind,
      note: normalizedItem.note,
      items: [normalizedItem],
    })
  })

  return sections
}

function tryParseError(error) {
  return error?.response?.data?.detail || error?.response?.data?.message || error?.message || 'No se pudo cargar el cronograma'
}

async function fetchWithFallback(urls) {
  let lastError = null
  for (const url of urls) {
    try {
      return await api.get(url)
    } catch (error) {
      lastError = error
      const status = error?.response?.status
      if (status && status !== 404 && status !== 405) break
    }
  }
  throw lastError || new Error('No se pudo cargar el cronograma')
}

function ScheduleItemCard({ item, personal = false, theme }) {
  const participants = item.participants || []
  const firstParticipant = participants[0]
  return (
    <div className="fr-cut-card" style={{
      border: `1px solid ${theme.border}`,
      background: hexToRgba(theme.background, 0.62),
      padding: 16,
      display: 'grid',
      gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: theme.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {item.kind === 'heat' ? 'Heat' : item.kind === 'block' ? 'Bloque' : 'Salida'}
            {item.heatNumber != null ? ` ${item.heatNumber}` : ''}
          </div>
          <div style={{ color: theme.text, fontSize: 16, fontWeight: 800, lineHeight: 1.25, marginTop: 4 }}>
            {item.title}
          </div>
          {item.phaseName ? (
            <div style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}>{item.phaseName}</div>
          ) : null}
        </div>
        {item.lane != null ? (
          <span style={{ alignSelf: 'flex-start', padding: '6px 10px', borderRadius: 999, background: hexToRgba(theme.primary, 0.12), border: `1px solid ${hexToRgba(theme.primary, 0.24)}`, color: theme.text, fontSize: 12, fontWeight: 800 }}>
            Lane {item.lane}
          </span>
        ) : null}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {(item.startAt || item.endAt) ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: theme.text, fontSize: 14, lineHeight: 1.5 }}>
            <Clock3 size={14} color={theme.accent} />
            {formatDateRange(item.startAt, item.endAt)}
          </div>
        ) : null}
        {item.checkInAt ? (
          <div style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 1.5 }}>
            Check-in: {formatDateTime(item.checkInAt) || item.checkInAt}
          </div>
        ) : null}
        {item.locationName || item.locationDetail ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: theme.text, fontSize: 14, lineHeight: 1.5 }}>
            <MapPin size={14} color={theme.accent} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>
              {item.locationName || 'Ubicacion por confirmar'}
              {item.locationDetail ? <span style={{ color: theme.textSecondary }}> · {item.locationDetail}</span> : null}
            </span>
          </div>
        ) : null}
      </div>

      {participants.length ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {personal ? 'Tu salida' : 'Asignados'}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {participants.map((participant) => (
              <div
                key={participant.id}
                style={{
                  borderRadius: 6,
                  border: `1px solid ${theme.border}`,
                  background: participant.note ? hexToRgba(theme.accent, 0.08) : 'rgba(255,255,255,0.03)',
                  padding: '10px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: theme.text, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {participant.name}
                  </div>
                  {participant.category ? (
                    <div style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>Cat: {participant.category}</div>
                  ) : null}
                </div>
                {participant.lane != null ? (
                  <span style={{ color: theme.accent, fontSize: 12, fontWeight: 800 }}>Lane {participant.lane}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {item.note ? (
        <div style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 1.6 }}>{item.note}</div>
      ) : null}
      {!participants.length && !personal ? (
        <div style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 1.6 }}>
          Sin asignacion visible todavia.
        </div>
      ) : null}
      {!participants.length && personal ? (
        <div style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 1.6 }}>
          Tu asignacion personal aun no esta publicada.
        </div>
      ) : null}
      {firstParticipant?.note ? (
        <div style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 1.5 }}>{firstParticipant.note}</div>
      ) : null}
    </div>
  )
}

function ScheduleSection({ section, personal = false, theme }) {
  return (
    <section className="fr-cut-card" style={{
      border: `1px solid ${theme.border}`,
      background: theme.surface,
      padding: 18,
      display: 'grid',
      gap: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <div style={{ color: theme.accent, fontSize: 12, fontWeight: 800, letterSpacing: 1.1, textTransform: 'uppercase' }}>
            {section.kind === 'phase' ? 'Fase' : 'Bloque'}
          </div>
          <h2 style={{ margin: '6px 0 0', fontSize: 22, lineHeight: 1.1 }}>{section.title}</h2>
          {section.subtitle ? (
            <div style={{ marginTop: 6, color: theme.textSecondary, fontSize: 14, lineHeight: 1.5 }}>{section.subtitle}</div>
          ) : null}
        </div>
        <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
          {section.startAt || section.endAt ? (
            <div style={{ color: theme.text, fontSize: 13, textAlign: 'right' }}>
              {formatDateRange(section.startAt, section.endAt)}
            </div>
          ) : null}
          {section.locationName || section.locationDetail ? (
            <div style={{ color: theme.textSecondary, fontSize: 13, textAlign: 'right' }}>
              {section.locationName || 'Ubicacion por confirmar'}
              {section.locationDetail ? <span style={{ color: '#6B7280' }}> · {section.locationDetail}</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      {section.items?.length ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {section.items.map((item) => (
            <ScheduleItemCard key={item.id} item={item} personal={personal} theme={theme} />
          ))}
        </div>
      ) : (
        <div style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
          {personal ? scheduleCopy.personal.empty : scheduleCopy.public.empty}
        </div>
      )}
    </section>
  )
}

export default function CompetitionSchedulePage({ scope = 'public' }) {
  const { competitionId } = useParams()
  const { session, participantId, isAthlete } = useAuth()
  const isPersonal = scope === 'personal'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    const publicEndpoints = [
      `/competitions/${competitionId}/schedule`,
      `/competitions/${competitionId}/public`,
    ]
    const personalEndpoints = [
      `/competitions/${competitionId}/schedule/me`,
      `/competitions/${competitionId}/my-schedule`,
      `/participants/me/competitions/${competitionId}/schedule`,
    ]

    const endpoints = isPersonal ? personalEndpoints : publicEndpoints

    const run = async () => {
      try {
        const { data } = await fetchWithFallback(endpoints)
        if (!active) return
        setPayload(data)
      } catch (err) {
        if (!active) return
        if (isPersonal) {
          if (err?.response?.status === 403) {
            setError(tryParseError(err))
            return
          }
          try {
            const { data } = await fetchWithFallback(publicEndpoints)
            if (!active) return
            setPayload(data)
            setError('')
            return
          } catch (fallbackErr) {
            if (!active) return
            setError(tryParseError(fallbackErr || err))
            return
          }
        }
        setError(tryParseError(err))
      } finally {
        if (active) setLoading(false)
      }
    }

    run()

    return () => {
      active = false
    }
  }, [competitionId, isPersonal])

  const schedule = useMemo(() => normalizeCompetitionSchedule(payload), [payload])
  const competition = schedule.competition || payload?.competition || null
  const sections = useMemo(() => {
    if (schedule.items.length) {
      const phaseMap = new Map((schedule.phases || []).map(phase => [String(phase.id), phase]))
      const grouped = new Map()
      const loose = []

      schedule.items.forEach((item) => {
        const phaseKey = item.phaseId || item.phaseName || ''
        if (!phaseKey) {
          loose.push(item)
          return
        }
        const phase = phaseMap.get(String(phaseKey))
        const key = String(phaseKey)
        if (!grouped.has(key)) {
          grouped.set(key, {
            id: `phase-${key}`,
            phaseId: key,
            phaseName: phase?.nombre || item.phaseName || '',
            title: phase?.nombre || item.phaseName || item.title,
            subtitle: phase?.descripcion || item.note || 'Bloque publicado',
            startAt: phase?.start_at || item.startAt || null,
            endAt: phase?.end_at || item.endAt || null,
            locationName: item.locationName || phase?.location_name || '',
            locationDetail: item.locationDetail || phase?.location_detail || '',
            kind: item.kind === 'heat' ? 'phase' : item.kind,
            note: phase?.descripcion || item.note || '',
            items: [],
          })
        }
        grouped.get(key).items.push(item)
      })

      const groupedSections = Array.from(grouped.values()).sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
      const looseSections = loose.length ? [{
        id: 'sin-fase',
        phaseId: '',
        phaseName: '',
        title: 'Sin evento publicado',
        subtitle: 'Heats sin bloque asignado',
        startAt: null,
        endAt: null,
        locationName: '',
        locationDetail: '',
        kind: 'block',
        note: '',
        items: loose,
      }] : []
      return [...groupedSections, ...looseSections]
    }
    return buildFallbackSections(schedule)
  }, [schedule])

  const stats = schedule.summary || {}
  const modeCopy = scheduleCopy[isPersonal ? 'personal' : 'public']
  const hasPersonalAccess = isPersonal && session && !!participantId && isAthlete
  const heroLink = competition ? `/competitions/${competition.id}` : '/'
  const leaderboardLink = competition ? `/leaderboard/${competition.id}` : '/leaderboard'
  const myScheduleLink = competition ? `/competitions/${competition.id}/my-schedule` : '/profile'

  const title = competition?.nombre || 'Cronograma'
  const lastUpdated = formatDateTime(schedule.updatedAt)
  const sectionCount = sections.length
  const totalHeats = schedule.items.filter(item => item.kind === 'heat').length || Number(stats.heats_total || 0) || 0
  const totalParticipants = Number(stats.participants_total || stats.confirmed_total || 0) || 0
  const theme = useMemo(() => resolveCompetitionTheme(competition), [competition])
  const pageBg = useMemo(() => buildPageBackground(theme), [theme])
  const primaryTextColor = useMemo(() => getReadableTextColor(theme.primary), [theme.primary])

  return (
    <div style={{ minHeight: '100vh', background: pageBg, color: theme.text }}>
      <div style={{ maxWidth: COMPETITION_PAGE_MAX_WIDTH, margin: '0 auto', padding: '20px 16px 72px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
          <Link
            to={heroLink}
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 6,
              border: `1px solid ${theme.border}`,
              color: theme.text,
              background: hexToRgba(theme.background, 0.4),
              width: 'fit-content',
              justifyContent: 'center',
            }}
          >
            <ArrowLeft size={16} />
            Volver
          </Link>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link
              to={leaderboardLink}
              style={{
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                borderRadius: 6,
                background: `linear-gradient(135deg, ${theme.primary} 0%, ${hexToRgba(theme.primary, 0.72)} 100%)`,
                color: primaryTextColor,
                fontWeight: 800,
              }}
            >
              Ver leaderboard
              <ArrowRight size={16} />
            </Link>
            {!isPersonal ? (
              <Link
                to={myScheduleLink}
                style={{
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 16px',
                  borderRadius: 6,
                  border: `1px solid ${theme.border}`,
                  background: hexToRgba(theme.background, 0.62),
                  color: theme.text,
                  fontWeight: 700,
                }}
              >
                Mi cronograma
              </Link>
            ) : null}
          </div>
        </div>

        <section className="fr-cut-card" style={{
          border: `1px solid ${theme.border}`,
          background: `linear-gradient(135deg, ${hexToRgba(theme.primary, 0.14)}, ${hexToRgba(theme.surface, 0.96)} 40%, ${hexToRgba(theme.accent, 0.08)} 100%)`,
          padding: 22,
          marginBottom: 18,
          boxShadow: '0 24px 70px rgba(0,0,0,0.25)',
        }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: hexToRgba(theme.background, 0.78), border: `1px solid ${hexToRgba(theme.primary, 0.28)}`, color: theme.text, fontSize: 12, fontWeight: 800 }}>
              <Clock3 size={14} color={theme.primary} />
              {modeCopy.eyebrow}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: hexToRgba(theme.background, 0.78), border: `1px solid ${hexToRgba(theme.accent, 0.22)}`, color: theme.text, fontSize: 12, fontWeight: 800 }}>
              <Users size={14} color={theme.accent} />
              {totalHeats ? `${totalHeats} heats` : 'Heats por publicar'}
            </span>
            {totalParticipants ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: hexToRgba(theme.background, 0.78), border: `1px solid ${hexToRgba(theme.primary, 0.20)}`, color: theme.text, fontSize: 12, fontWeight: 800 }}>
                <Medal size={14} color={theme.primary} />
                {totalParticipants} inscritos
              </span>
            ) : null}
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(32px, 5vw, 58px)', lineHeight: 0.98 }}>
            {title}
          </h1>
          <p style={{ margin: '12px 0 0', maxWidth: 760, color: theme.text, fontSize: 15, lineHeight: 1.7 }}>
            {modeCopy.description}
          </p>
          {schedule.note ? (
            <div style={{ marginTop: 12, color: theme.textSecondary, fontSize: 13, lineHeight: 1.6 }}>{schedule.note}</div>
          ) : null}
          {lastUpdated ? (
            <div style={{ marginTop: 8, color: '#6B7280', fontSize: 12 }}>
              Actualizado {lastUpdated}
            </div>
          ) : null}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, marginBottom: 18 }}>
          <div className="fr-cut-card" style={{ border: `1px solid ${theme.border}`, background: theme.surface, padding: 18 }}>
            <div style={{ color: theme.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Vista</div>
            <div style={{ marginTop: 8, fontSize: 18, fontWeight: 800 }}>{isPersonal ? 'Personal' : 'Publica'}</div>
            <div style={{ marginTop: 6, color: theme.textSecondary, fontSize: 13, lineHeight: 1.5 }}>
              {isPersonal ? 'Solo tus salidas y tus cambios.' : 'Todo lo que ya esta publicado.'}
            </div>
          </div>
          <div className="fr-cut-card" style={{ border: `1px solid ${theme.border}`, background: theme.surface, padding: 18 }}>
            <div style={{ color: theme.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Bloques</div>
            <div style={{ marginTop: 8, fontSize: 18, fontWeight: 800 }}>{sectionCount}</div>
            <div style={{ marginTop: 6, color: theme.textSecondary, fontSize: 13, lineHeight: 1.5 }}>Eventos, heats y bloques publicados.</div>
          </div>
          <div className="fr-cut-card" style={{ border: `1px solid ${theme.border}`, background: theme.surface, padding: 18 }}>
            <div style={{ color: theme.accent, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Ubicacion</div>
            <div style={{ marginTop: 8, fontSize: 18, fontWeight: 800 }}>{competition?.lugar || 'Por confirmar'}</div>
            <div style={{ marginTop: 6, color: theme.textSecondary, fontSize: 13, lineHeight: 1.5 }}>Si cambia el venue por heat, quedara indicado en cada card.</div>
          </div>
        </section>

        {loading ? (
          <div className="fr-cut-card" style={{ padding: 24, background: hexToRgba(theme.surface, 0.94), border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
            Cargando cronograma...
          </div>
        ) : error ? (
          <div className="fr-cut-card" style={{ padding: 24, background: hexToRgba(theme.surface, 0.94), border: `1px solid ${theme.border}`, color: theme.text }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>No se pudo cargar el cronograma</div>
            <div style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 1.6 }}>{error}</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {sections.length ? sections.map((section) => (
              <ScheduleSection key={section.id} section={section} personal={hasPersonalAccess} theme={theme} />
            )) : (
              <div className="fr-cut-card" style={{ padding: 24, background: hexToRgba(theme.surface, 0.94), border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
                {modeCopy.empty}
              </div>
            )}
          </div>
        )}

        {isPersonal && !hasPersonalAccess ? (
          <div style={{
            marginTop: 16,
            borderRadius: 6,
            border: `1px solid ${hexToRgba(theme.primary, 0.22)}`,
            background: hexToRgba(theme.primary, 0.08),
            padding: 16,
            color: theme.text,
          }}>
            Tu cronograma personal usa un endpoint distinto al publico. Si el backend aun no lo publica, veras solo la estructura general de la competencia.
          </div>
        ) : null}
      </div>
    </div>
  )
}
