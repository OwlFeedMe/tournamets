import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Clock3, MapPin, Medal, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/axios'
import { SkeletonBlock, SkeletonList, SkeletonMetricGrid } from '../components/layout/Skeleton'
import { useAuth } from '../context/AuthContext'
import { COMPETITION_PAGE_MAX_WIDTH } from '../utils/competitionLayout'
import { getReadableTextColor, hexToRgba, resolveCompetitionTheme } from '../utils/competitionTheme'
import { formatCompetitionDateTime, formatCompetitionTimeZoneLabel } from '../utils/competitionTimeZone'

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

function formatDateTime(value, timeZone) {
  if (!value) return null
  return formatCompetitionDateTime(value, timeZone, {
    weekday: 'short',
    fallback: null,
  })
}

const wodColorPalette = ['#FF6B00', '#00C2A8', '#D4A537', '#8B5CF6', '#38BDF8', '#F59E0B', '#EF4444', '#22C55E']

function wodColorFor(value) {
  const raw = String(value ?? 'wod').trim() || 'wod'
  let hash = 0
  for (let index = 0; index < raw.length; index += 1) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(index)
    hash |= 0
  }
  return wodColorPalette[Math.abs(hash) % wodColorPalette.length]
}

function formatDateRange(start, end, timeZone) {
  const startLabel = formatDateTime(start, timeZone)
  const endLabel = formatDateTime(end, timeZone)
  if (!startLabel && !endLabel) return 'Por confirmar'
  if (!startLabel) return `Hasta ${endLabel}`
  if (!endLabel) return `Desde ${startLabel}`
  return `${startLabel} - ${endLabel}`
}

function formatCompactTime(value, timeZone) {
  if (!value) return null
  return formatCompetitionDateTime(value, timeZone, {
    fallback: null,
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCompactDateTime(value, timeZone) {
  if (!value) return null
  return formatCompetitionDateTime(value, timeZone, {
    fallback: null,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function dateKey(value, timeZone) {
  if (!value) return ''
  return formatCompetitionDateTime(value, timeZone, {
    fallback: '',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatScheduleRange(start, end, timeZone, compact = false) {
  if (!compact) return formatDateRange(start, end, timeZone)
  const startLabel = formatCompactDateTime(start, timeZone)
  const endTime = formatCompactTime(end, timeZone)
  const endLabel = formatCompactDateTime(end, timeZone)
  if (!startLabel && !endLabel) return 'Por confirmar'
  if (!startLabel) return `Hasta ${endLabel}`
  if (!endLabel) return `Desde ${startLabel}`
  if (dateKey(start, timeZone) === dateKey(end, timeZone)) return `${startLabel} - ${endTime}`
  return `${startLabel} - ${endLabel}`
}

function getPhaseId(value) {
  if (value == null || value === '') return ''
  return String(value)
}

function toDomId(value) {
  return String(value || 'section').replace(/[^a-zA-Z0-9_-]+/g, '-')
}

function heatLabelFor(item) {
  if (item?.heatNumber != null) return `Heat ${item.heatNumber}`
  const title = String(item?.title || '').trim()
  const phaseName = String(item?.phaseName || '').trim()
  if (phaseName && title.toLowerCase().startsWith(phaseName.toLowerCase())) {
    return title.slice(phaseName.length).replace(/^\s*[-–—:]\s*/, '').trim() || title
  }
  return title
}

function meaningfulDescription(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const generic = ['Bloque publicado', 'Fecha publicada']
  return generic.some((entry) => entry.toLowerCase() === text.toLowerCase()) ? '' : text
}

function truncateText(value, maxLength = 92) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trim()}...`
}

function parseWorkoutDescription(value) {
  const text = meaningfulDescription(value)
  if (!text) return { text: '', parts: [] }

  const markerPattern = /\b(Bloque\s+\d+|Parte\s+[A-Z]|Part\s+[A-Z])\b/gi
  const matches = Array.from(text.matchAll(markerPattern))
  if (!matches.length) return { text, parts: [] }

  const parts = matches.map((match, index) => {
    const label = match[1]
    const start = match.index + match[0].length
    const end = matches[index + 1]?.index ?? text.length
    const body = text.slice(start, end).replace(/^\s*[-–—:]\s*/, '').trim()
    return { label, body }
  }).filter((part) => part.body)

  return parts.length ? { text, parts } : { text, parts: [] }
}

function workoutTeaser(value) {
  const detail = parseWorkoutDescription(value)
  if (!detail.text) return ''
  if (!detail.parts.length) return truncateText(detail.text)
  const hasParts = detail.parts.some((part) => /^parte\b/i.test(part.label) || /^part\b/i.test(part.label))
  const unit = hasParts ? (detail.parts.length === 1 ? 'parte' : 'partes') : (detail.parts.length === 1 ? 'bloque' : 'bloques')
  return `${detail.parts.length} ${unit} · ${truncateText(detail.parts[0].body, 74)}`
}

function groupItemsByCategory(items = []) {
  const groups = []
  const byCategory = new Map()

  items.forEach((item) => {
    const category = String(item.category || 'Sin categoria').trim() || 'Sin categoria'
    if (!byCategory.has(category)) {
      const group = { id: `cat-${toDomId(category)}`, category, items: [] }
      byCategory.set(category, group)
      groups.push(group)
    }
    byCategory.get(category).items.push(item)
  })

  return groups
}

function categoryTimeRange(items = []) {
  const starts = items.map((item) => item.startAt).filter(Boolean).sort()
  const ends = items.map((item) => item.endAt).filter(Boolean).sort()
  return {
    startAt: starts[0] || null,
    endAt: ends[ends.length - 1] || null,
  }
}

function WorkoutDescription({ text, theme }) {
  const detail = parseWorkoutDescription(text)
  if (!detail.text) return null

  if (!detail.parts.length) {
    return (
      <div style={{
        border: `1px solid ${hexToRgba(theme.accent, 0.16)}`,
        background: hexToRgba(theme.background, 0.36),
        borderRadius: 6,
        padding: 12,
        color: theme.textSecondary,
        fontSize: 13,
        lineHeight: 1.6,
        maxWidth: 860,
      }}>
        {detail.text}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 920 }}>
      {detail.parts.map((part) => (
        <div
          key={`${part.label}-${part.body}`}
          className="fr-schedule-wod-detail-row"
          style={{
            display: 'grid',
            gridTemplateColumns: '96px minmax(0, 1fr)',
            gap: 10,
            alignItems: 'start',
            border: `1px solid ${hexToRgba(theme.accent, 0.16)}`,
            background: hexToRgba(theme.background, 0.36),
            borderRadius: 6,
            padding: 12,
          }}
        >
          <div style={{ color: theme.accent, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {part.label}
          </div>
          <div style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 1.55, overflowWrap: 'anywhere' }}>
            {part.body}
          </div>
        </div>
      ))}
    </div>
  )
}

function normalizeParticipant(item, index) {
  if (!item || typeof item !== 'object') return null
  const id = item.id ?? item.user_id ?? item.participantId ?? `p_${index + 1}`
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
    category: String(item.categoria || item.category || '').trim(),
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

function ScheduleItemCard({ item, personal = false, theme, timeZone }) {
  const [isOpen, setIsOpen] = useState(false)
  const participants = item.participants || []
  const firstParticipant = participants[0]
  const participantCount = participants.length
  const wodTone = wodColorFor(item.phaseId || item.phaseName || item.title)
  const contentId = `schedule-heat-${toDomId(item.id)}`
  const heatLabel = heatLabelFor(item)
  const titleLabel = heatLabel || item.title
  return (
    <div className="fr-cut-card fr-schedule-item-card" style={{
      border: `1px solid ${hexToRgba(wodTone, 0.32)}`,
      borderLeft: `4px solid ${wodTone}`,
      background: hexToRgba(theme.background, 0.30),
      padding: 14,
      display: 'grid',
      gap: 10,
      minWidth: 0,
      maxWidth: '100%',
    }}>
      <button
        type="button"
        className="fr-schedule-heat-toggle"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((current) => !current)}
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 12,
          alignItems: 'start',
          width: '100%',
          padding: 0,
          border: 0,
          background: 'transparent',
          color: theme.text,
          textAlign: 'left',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="fr-schedule-overline" style={{ color: theme.textSecondary, fontSize: 11, fontWeight: 800 }}>
              {participantCount ? `${participantCount} ${participantCount === 1 ? 'asignado' : 'asignados'}` : 'Sin asignados'}
            </span>
          </div>
          <div className="fr-schedule-heat-title" style={{ color: theme.text, fontSize: 15, fontWeight: 800, lineHeight: 1.25, marginTop: 4 }}>{titleLabel}</div>
          {(item.startAt || item.endAt) ? (
            <div className="fr-schedule-meta-line" style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>{formatScheduleRange(item.startAt, item.endAt, timeZone, true)}</div>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 10, minWidth: 0 }}>
          {item.lane != null ? (
            <span style={{ alignSelf: 'flex-start', padding: '6px 10px', borderRadius: 999, background: hexToRgba(theme.primary, 0.12), border: `1px solid ${hexToRgba(theme.primary, 0.24)}`, color: theme.text, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
              Lane {item.lane}
            </span>
          ) : null}
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 6,
              border: `1px solid ${hexToRgba(wodTone, 0.28)}`,
              background: hexToRgba(theme.background, 0.48),
              color: wodTone,
              flexShrink: 0,
            }}
          >
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        </div>
      </button>

      {isOpen ? (
        <div id={contentId} style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        {item.checkInAt ? (
          <div style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 1.5 }}>
            Check-in: {formatDateTime(item.checkInAt, timeZone) || item.checkInAt}
          </div>
        ) : null}
        {item.locationName || item.locationDetail ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: theme.text, fontSize: 14, lineHeight: 1.5 }}>
            <MapPin size={14} color={wodTone} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>
              {item.locationName || 'Ubicacion por confirmar'}
              {item.locationDetail ? <span style={{ color: theme.textSecondary }}> · {item.locationDetail}</span> : null}
            </span>
          </div>
        ) : null}
      </div>

      {participants.length ? (
        <div className="fr-schedule-participants" style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          <div style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {personal ? 'Tu salida' : 'Asignados'}
          </div>
          <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
            {participants.map((participant) => (
              <div
                key={participant.id}
                className="fr-schedule-participant-row"
                style={{
                  borderRadius: 6,
                  border: `1px solid ${hexToRgba(wodTone, 0.38)}`,
                  borderLeft: `4px solid ${wodTone}`,
                  background: participant.note ? hexToRgba(wodTone, 0.10) : 'rgba(255,255,255,0.03)',
                  padding: '10px 12px',
                  display: 'grid',
                  gridTemplateColumns: participant.lane != null ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)',
                  gap: 10,
                  alignItems: 'center',
                  minWidth: 0,
                  maxWidth: '100%',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="fr-schedule-participant-name" style={{ color: theme.text, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {participant.name}
                  </div>
                  {participant.category ? (
                    <div style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2, overflowWrap: 'anywhere' }}>Cat: {participant.category}</div>
                  ) : null}
                </div>
                {participant.lane != null ? (
                  <span className="fr-schedule-lane" style={{ color: wodTone, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>Lane {participant.lane}</span>
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
      ) : null}
    </div>
  )
}

function ScheduleCategoryGroup({ group, personal = false, theme, timeZone, sectionId }) {
  const [isOpen, setIsOpen] = useState(false)
  const itemCount = group.items.length
  const participantCount = group.items.reduce((total, item) => total + (item.participants?.length || 0), 0)
  const { startAt, endAt } = categoryTimeRange(group.items)
  const tone = wodColorFor(`${sectionId}-${group.category}`)
  const contentId = `schedule-category-${toDomId(sectionId)}-${toDomId(group.category)}`

  return (
    <div className="fr-cut-card fr-schedule-category-card" style={{
      border: `1px solid ${hexToRgba(tone, 0.34)}`,
      borderLeft: `4px solid ${tone}`,
      background: hexToRgba(theme.background, 0.36),
      padding: 14,
      display: 'grid',
      gap: 10,
      minWidth: 0,
    }}>
      <button
        type="button"
        className="fr-schedule-category-toggle"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((current) => !current)}
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 12,
          alignItems: 'start',
          width: '100%',
          padding: 0,
          border: 0,
          background: 'transparent',
          color: theme.text,
          textAlign: 'left',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="fr-schedule-overline" style={{ color: tone, fontSize: 11, fontWeight: 850, textTransform: 'uppercase', letterSpacing: 0.35 }}>
            {itemCount} {itemCount === 1 ? 'heat' : 'heats'} · {participantCount} {participantCount === 1 ? 'asignado' : 'asignados'}
          </div>
          <div className="fr-schedule-category-title" style={{ color: theme.text, fontSize: 16, fontWeight: 850, lineHeight: 1.2, marginTop: 4 }}>
            {group.category}
          </div>
          {(startAt || endAt) ? (
            <div className="fr-schedule-meta-line" style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>
              {formatScheduleRange(startAt, endAt, timeZone, true)}
            </div>
          ) : null}
        </div>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 6,
            border: `1px solid ${hexToRgba(tone, 0.28)}`,
            background: hexToRgba(theme.background, 0.48),
            color: tone,
            flexShrink: 0,
          }}
        >
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>

      {isOpen ? (
        <div id={contentId} style={{ display: 'grid', gap: 10, minWidth: 0 }}>
          {group.items.map((item) => (
            <ScheduleItemCard key={item.id} item={item} personal={personal} theme={theme} timeZone={timeZone} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ScheduleSection({ section, personal = false, theme, timeZone }) {
  const [isOpen, setIsOpen] = useState(false)
  const contentId = `schedule-section-${toDomId(section.id)}`
  const itemCount = section.items?.length || 0
  const description = meaningfulDescription(section.subtitle)
  const teaser = workoutTeaser(description)
  const categoryGroups = groupItemsByCategory(section.items || [])

  return (
    <section className="fr-cut-card fr-schedule-section" style={{
      border: `1px solid ${theme.border}`,
      background: theme.surface,
      padding: 18,
      display: 'grid',
      gap: 14,
      minWidth: 0,
      maxWidth: '100%',
    }}>
      <button
        type="button"
        className="fr-schedule-section-toggle"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((current) => !current)}
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 12,
          alignItems: 'start',
          width: '100%',
          padding: 0,
          border: 0,
          background: 'transparent',
          color: theme.text,
          textAlign: 'left',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="fr-schedule-overline" style={{ color: theme.accent, fontSize: 11, fontWeight: 850, letterSpacing: 0.45, textTransform: 'uppercase' }}>
              {section.kind === 'phase' ? 'Fase' : 'Bloque'}
            </span>
            <span className="fr-schedule-overline" style={{ color: theme.textSecondary, fontSize: 11, fontWeight: 800 }}>
              {itemCount ? `${itemCount} ${itemCount === 1 ? 'heat' : 'heats'}` : 'Sin heats'}
            </span>
          </div>
          <h2 className="fr-schedule-wod-title" style={{ margin: '5px 0 0', fontSize: 20, lineHeight: 1.1 }}>{section.title}</h2>
          {teaser ? (
            <div
              className="fr-schedule-wod-teaser"
              style={{
                marginTop: 7,
                color: theme.textSecondary,
                fontSize: 13,
                lineHeight: 1.45,
                maxWidth: 720,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {teaser}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 10, minWidth: 0 }}>
          <div className="fr-schedule-section-meta" style={{ display: 'grid', gap: 8, justifyItems: 'end', minWidth: 0 }}>
            {section.startAt || section.endAt ? (
              <div className="fr-schedule-meta-line" style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'right' }}>
                {formatScheduleRange(section.startAt, section.endAt, timeZone, true)}
              </div>
            ) : null}
            {section.locationName || section.locationDetail ? (
              <div style={{ color: theme.textSecondary, fontSize: 13, textAlign: 'right' }}>
                {section.locationName || 'Ubicacion por confirmar'}
                {section.locationDetail ? <span style={{ color: '#6B7280' }}> · {section.locationDetail}</span> : null}
              </div>
            ) : null}
          </div>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            width: 30,
            height: 30,
              borderRadius: 6,
              border: `1px solid ${hexToRgba(theme.accent, 0.24)}`,
              background: hexToRgba(theme.background, 0.52),
              color: theme.accent,
              flexShrink: 0,
            }}
          >
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        </div>
      </button>

      {isOpen ? (
        section.items?.length ? (
          <div id={contentId} style={{ display: 'grid', gap: 12, minWidth: 0 }}>
            {description ? (
              <div className="fr-schedule-wod-description">
                <WorkoutDescription text={description} theme={theme} />
              </div>
            ) : null}
            {categoryGroups.map((group) => (
              <ScheduleCategoryGroup
                key={group.id}
                group={group}
                personal={personal}
                theme={theme}
                timeZone={timeZone}
                sectionId={section.id}
              />
            ))}
          </div>
        ) : (
          <div id={contentId} style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
            {personal ? scheduleCopy.personal.empty : scheduleCopy.public.empty}
          </div>
        )
      ) : null}
    </section>
  )
}

export default function CompetitionSchedulePage({ scope = 'public' }) {
  const { competitionId } = useParams()
  const { session, userId, isAthlete } = useAuth()
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
      `/competitions/users/me/${competitionId}/schedule`,
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
  const hasPersonalAccess = isPersonal && session && !!userId && isAthlete
  const heroLink = competition ? `/competitions/${competition.id}` : '/'
  const leaderboardLink = competition ? `/leaderboard/${competition.id}` : '/leaderboard'
  const myScheduleLink = competition ? `/competitions/${competition.id}/my-schedule` : '/profile'
  const timeZone = competition?.timezone

  const title = competition?.nombre || 'Cronograma'
  const lastUpdated = formatDateTime(schedule.updatedAt, timeZone)
  const totalHeats = schedule.items.filter(item => item.kind === 'heat').length || Number(stats.heats_total || 0) || 0
  const totalParticipants = Number(stats.participants_total || stats.confirmed_total || 0) || 0
  const theme = useMemo(() => resolveCompetitionTheme(competition), [competition])
  const pageBg = useMemo(() => buildPageBackground(theme), [theme])
  const primaryTextColor = useMemo(() => getReadableTextColor(theme.primary), [theme.primary])

  return (
    <div className="fr-schedule-page" style={{ minHeight: '100vh', background: pageBg, color: theme.text, overflowX: 'clip' }}>
      <div className="fr-schedule-page-inner" style={{ width: '100%', maxWidth: COMPETITION_PAGE_MAX_WIDTH, margin: '0 auto', padding: '20px 16px 72px', minWidth: 0 }}>
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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: hexToRgba(theme.background, 0.78), border: `1px solid ${hexToRgba(theme.accent, 0.22)}`, color: theme.text, fontSize: 12, fontWeight: 800 }}>
              Hora oficial: {formatCompetitionTimeZoneLabel(timeZone)}
            </span>
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

        {loading ? (
          <div className="fr-cut-card" style={{ padding: 24, background: hexToRgba(theme.surface, 0.94), border: `1px solid ${theme.border}` }}>
            <SkeletonBlock width="48%" height={30} radius={8} />
            <SkeletonBlock width="72%" height={14} radius={999} style={{ marginTop: 14 }} />
            <div style={{ marginTop: 18 }}>
              <SkeletonMetricGrid count={3} />
            </div>
            <div style={{ marginTop: 18 }}>
              <SkeletonList count={4} />
            </div>
          </div>
        ) : error ? (
          <div className="fr-cut-card" style={{ padding: 24, background: hexToRgba(theme.surface, 0.94), border: `1px solid ${theme.border}`, color: theme.text }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>No se pudo cargar el cronograma</div>
            <div style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 1.6 }}>{error}</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
            {sections.length ? sections.map((section) => (
              <ScheduleSection key={section.id} section={section} personal={hasPersonalAccess} theme={theme} timeZone={timeZone} />
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
