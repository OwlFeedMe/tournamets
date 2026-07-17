import { formatCalendarDate } from '../../utils/calendarDate'

export const homePageBg =
  'radial-gradient(circle at top, rgba(214,217,224,0.10), transparent 24%), radial-gradient(circle at 82% 18%, rgba(94,234,212,0.10), transparent 20%), radial-gradient(circle at 20% 78%, rgba(205,170,107,0.08), transparent 18%), #0D0F12'

export function formatCompetitionDate(value, options = {}) {
  const { includeYear = true, timeZone = '' } = options
  return formatCalendarDate(value, 'es-CO', includeYear
    ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { day: 'numeric', month: 'short' }, timeZone)
}

export function formatCompetitionDateRange(startValue, endValue, options = {}) {
  const start = formatCompetitionDate(startValue, options)
  const end = formatCompetitionDate(endValue, options)
  if (start && end) return `${start} - ${end}`
  if (start) return start
  if (end) return end
  return options.fallback || 'Por confirmar'
}

export function formatEnrollmentDateRange(competition, options = {}) {
  return formatCompetitionDateRange(competition?.enrollment_start, competition?.enrollment_end, { ...options, timeZone: competition?.timezone })
}

export function formatCompetitionWindow(competition, options = {}) {
  return formatCompetitionDateRange(competition?.competition_start, competition?.competition_end, { ...options, timeZone: competition?.timezone })
}

export function resolveCompetitionAsset(competition, asset) {
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

export function scheduleSummary(competition) {
  const items = parseScheduleItems(competition?.schedule_items)
  if (items.length) {
    const main = items.slice(0, 2).map(item => {
      const start = formatCompetitionDate(item.start_at, { timeZone: competition?.timezone })
      const end = formatCompetitionDate(item.end_at, { timeZone: competition?.timezone })
      if (start && end && start !== end) return `${item.label || 'Fecha'}: ${start} - ${end}`
      return `${item.label || 'Fecha'}: ${start || end || 'Por confirmar'}`
    })
    return main.join(' | ')
  }
  const competitionStart = formatCompetitionDate(competition?.competition_start, { timeZone: competition?.timezone })
  const competitionEnd = formatCompetitionDate(competition?.competition_end, { timeZone: competition?.timezone })
  if (competitionStart || competitionEnd) {
    return competitionStart && competitionEnd
      ? `${competitionStart} - ${competitionEnd}`
      : (competitionStart || competitionEnd)
  }
  const enrollmentStart = formatCompetitionDate(competition?.enrollment_start, { timeZone: competition?.timezone })
  const enrollmentEnd = formatCompetitionDate(competition?.enrollment_end, { timeZone: competition?.timezone })
  return enrollmentStart || enrollmentEnd
    ? `${enrollmentStart || 'Ahora'}${enrollmentEnd ? ` - ${enrollmentEnd}` : ''}`
    : 'Fechas por confirmar'
}

export function truncate(text, max = 140) {
  const value = (text || '').trim()
  if (!value) return 'Consulta fechas, formatos y acceso directo al ranking del evento.'
  return value.length > max ? `${value.slice(0, max - 1)}...` : value
}

export function getCompetitionState(competition) {
  const now = Date.now()
  const start = competition.enrollment_start ? Date.parse(competition.enrollment_start) : null
  const end = competition.enrollment_end ? Date.parse(competition.enrollment_end) : null

  if (competition.enrollment_open) {
    return { label: 'Inscripciones abiertas', tone: '#5EEAD4', weight: 0 }
  }
  if (competition.activa) {
    return { label: 'Activa', tone: '#D6D9E0', weight: 1 }
  }
  if (start && start > now) {
    return { label: 'Proximamente', tone: '#CDAA6B', weight: 2 }
  }
  if (end && end > now) {
    return { label: 'Cierre cercano', tone: '#CDAA6B', weight: 3 }
  }
  return { label: 'Borrador', tone: '#6B7280', weight: 4 }
}

export function cardVisualStyle(competition, index, bannerUrl = '') {
  if (bannerUrl) {
    return `linear-gradient(180deg, rgba(13,15,18,0.12), rgba(13,15,18,0.58)), url("${bannerUrl}")`
  }

  const palettes = [
    'linear-gradient(135deg, rgba(214,217,224,0.26), rgba(94,234,212,0.12))',
    'linear-gradient(135deg, rgba(94,234,212,0.24), rgba(15,17,20,0.76))',
    'linear-gradient(135deg, rgba(205,170,107,0.22), rgba(214,217,224,0.14))',
  ]

  return palettes[index % palettes.length]
}

function competitionSearchText(competition) {
  return [
    competition?.nombre,
    competition?.descripcion,
    competition?.general_info_text,
    competition?.lugar,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function filterCompetitionsByQuery(items, query) {
  const value = String(query || '').trim().toLowerCase()
  if (!value) return items
  return (items || []).filter((competition) => competitionSearchText(competition).includes(value))
}

export function buttonStateForCompetition(competition, isAthlete, enrollmentState) {
  if (!isAthlete) return { label: 'Quiero participar', tone: 'secondary', disabled: false }
  if (enrollmentState === 'confirmado') return { label: 'Ya inscrito', tone: 'muted', disabled: true }
  if (enrollmentState === 'pendiente') return { label: 'Inscripcion en proceso', tone: 'muted', disabled: true }
  if (enrollmentState === 'rechazado') {
    if (!competition.enrollment_open) return { label: 'Inscripciones cerradas', tone: 'muted', disabled: true }
    return { label: 'Reintentar inscripcion', tone: 'secondary', disabled: false }
  }
  if (!competition.enrollment_open) return { label: 'Inscripciones cerradas', tone: 'muted', disabled: true }
  return { label: 'Quiero participar', tone: 'secondary', disabled: false }
}

export function buildCommandItems(competitions) {
  const openCount = competitions.filter(item => item.enrollment_open).length
  const activeCount = competitions.filter(item => item.activa).length
  const upcomingCount = competitions.filter(item => getCompetitionState(item).label === 'Proximamente').length

  return [
    {
      label: 'Configuracion total',
      value: 'Formatos, bloques y reglas listos para competir.',
      copy: `${openCount} eventos abiertos para entrar sin friccion.`,
      tone: '#5EEAD4',
      background: 'linear-gradient(180deg, rgba(94,234,212,0.08), rgba(23,27,33,0.94))',
    },
    {
      label: 'Tiempo real',
      value: 'Scores directos y ranking siempre en movimiento.',
      copy: `${activeCount} eventos con clasificacion viva en este momento.`,
      tone: '#D6D9E0',
      background: 'linear-gradient(180deg, rgba(214,217,224,0.08), rgba(23,27,33,0.94))',
    },
    {
      label: 'Ritmo elite',
      value: 'Seguimiento fino para eventos que no pueden perder precision.',
      copy: `${upcomingCount} cierres y aperturas proximas para seguir de cerca.`,
      tone: '#CDAA6B',
      background: 'linear-gradient(180deg, rgba(205,170,107,0.08), rgba(23,27,33,0.94))',
    },
  ]
}

export function mapCompetitionViewModel(competition, index) {
  const bannerUrl = resolveCompetitionAsset(competition, 'banner')
  const profileImageUrl = resolveCompetitionAsset(competition, 'profile')
  const enrollmentStartLabel = formatEnrollmentDateRange(competition, { fallback: 'Por confirmar' })
  const competitionDateLabel = competition.competition_start || competition.competition_end
    ? formatCompetitionWindow(competition, { fallback: 'Por confirmar' })
    : 'Por confirmar'
  return {
    id: competition.id,
    raw: competition,
    nombre: competition.nombre,
    description: truncate(competition.descripcion),
    status: getCompetitionState(competition),
    scheduleLabel: scheduleSummary(competition),
    bannerUrl,
    bannerStyle: cardVisualStyle(competition, index, bannerUrl),
    profileImageUrl,
    enrollmentStartLabel,
    competitionDateLabel,
    initials: (competition.nombre || 'FR').slice(0, 2).toUpperCase(),
  }
}

function dateMs(value) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function competitionStartMs(competition) {
  return dateMs(competition?.competition_start) || dateMs(competition?.enrollment_start) || dateMs(competition?.created_at) || 0
}

function competitionEndMs(competition) {
  return dateMs(competition?.competition_end) || dateMs(competition?.competition_start) || dateMs(competition?.enrollment_end) || 0
}

function isConfirmedEnrollment(competition) {
  return String(competition?.enrollment_estado || '').toLowerCase() === 'confirmado'
}

function isRejectedEnrollment(competition) {
  return String(competition?.enrollment_estado || '').toLowerCase() === 'rechazado'
}

function enrollmentPriority(competition) {
  if (isConfirmedEnrollment(competition)) return 0
  const state = String(competition?.enrollment_estado || '').toLowerCase()
  if (state === 'pendiente' || state === 'pago_en_verificacion') return 1
  return 2
}

function isCurrentCompetition(competition, nowMs) {
  const start = dateMs(competition?.competition_start)
  const end = dateMs(competition?.competition_end) || start
  if (start && end && start <= nowMs && end >= nowMs) return true
  return Boolean(competition?.activa && (!end || end >= nowMs))
}

function isFutureCompetition(competition, nowMs) {
  const start = dateMs(competition?.competition_start) || dateMs(competition?.enrollment_start)
  return Boolean(start && start >= nowMs)
}

export function selectPrimaryUserCompetition(competitions = [], nowValue = Date.now()) {
  const nowMs = typeof nowValue === 'number' ? nowValue : dateMs(nowValue) || Date.now()
  const items = Array.isArray(competitions) ? competitions.filter(Boolean) : []
  const pool = items.filter((competition) => !isRejectedEnrollment(competition))
  const candidates = pool.length ? pool : items

  const current = candidates
    .filter((competition) => isCurrentCompetition(competition, nowMs))
    .sort((a, b) => {
      const stateDiff = enrollmentPriority(a) - enrollmentPriority(b)
      if (stateDiff !== 0) return stateDiff
      return competitionEndMs(a) - competitionEndMs(b)
    })
  if (current.length) return current[0]

  const upcoming = candidates
    .filter((competition) => isFutureCompetition(competition, nowMs))
    .sort((a, b) => {
      const stateDiff = enrollmentPriority(a) - enrollmentPriority(b)
      if (stateDiff !== 0) return stateDiff
      return competitionStartMs(a) - competitionStartMs(b)
    })
  if (upcoming.length) return upcoming[0]

  return [...candidates].sort((a, b) => {
    const aTime = competitionEndMs(a) || competitionStartMs(a)
    const bTime = competitionEndMs(b) || competitionStartMs(b)
    return bTime - aTime
  })[0] || null
}

export function hasCurrentOrFutureUserCompetition(competitions = [], nowValue = Date.now()) {
  const nowMs = typeof nowValue === 'number' ? nowValue : dateMs(nowValue) || Date.now()
  return (Array.isArray(competitions) ? competitions : []).some((competition) => (
    !isRejectedEnrollment(competition) && (isCurrentCompetition(competition, nowMs) || isFutureCompetition(competition, nowMs))
  ))
}

function flattenIndividualLeaderboard(individual = {}) {
  return Object.entries(individual || {}).flatMap(([category, rows]) => (
    Array.isArray(rows) ? rows.map((row) => ({ ...row, category })) : []
  ))
}

function scoringPartLabel(part, index) {
  const key = String(part?.score_key || '').trim()
  return key || String.fromCharCode(65 + index)
}

function scoringPartResult(part, userId, category, index) {
  const rows = flattenIndividualLeaderboard(part?.individual)
  const row = rows.find((item) => (
    Number(item.id) === Number(userId)
    && (!category || item.category === category || item.categoria === category)
  )) || rows.find((item) => Number(item.id) === Number(userId))
  if (!row) return null
  return {
    label: scoringPartLabel(part, index),
    name: part?.nombre || `Parte ${scoringPartLabel(part, index)}`,
    mark: row.mejor_marca ?? null,
    extra: row.extra ?? null,
    points: row.total_puntos ?? 0,
    rank: row.rank ?? null,
    tipo: part?.tipo || null,
    measurementMethod: part?.measurement_method || null,
    timeCapSeconds: part?.time_cap_seconds ?? null,
  }
}

export function extractUserLeaderboardSummary(payload, userId) {
  if (!payload || userId == null) return null
  const targetId = Number(userId)
  const totalRows = flattenIndividualLeaderboard(payload.individual)
  const total = totalRows.find((row) => Number(row.id) === targetId) || null
  const totalTeam = (Array.isArray(payload.teams) ? payload.teams : []).find((team) => (
    Array.isArray(team.members) && team.members.some((member) => Number(member.id) === targetId)
  )) || null
  const phases = Array.isArray(payload.phases) ? payload.phases : []
  const phaseRows = phases
    .map((phase) => {
      const individualRow = flattenIndividualLeaderboard(phase.individual).find((row) => Number(row.id) === targetId)
      if (individualRow) {
        const scoringParts = Array.isArray(phase.scoring_parts)
          ? phase.scoring_parts
              .map((part, index) => scoringPartResult(part, targetId, individualRow.category || individualRow.categoria, index))
              .filter(Boolean)
          : []
        return {
          phaseId: phase.id,
          phaseName: phase.nombre || 'Workout',
          rank: individualRow.rank ?? null,
          points: individualRow.total_puntos ?? 0,
          mark: individualRow.mejor_marca ?? null,
          extra: individualRow.extra ?? null,
          events: individualRow.total_eventos ?? 0,
          status: phase.status_display || phase.estado || null,
          startAt: phase.start_at || null,
          endAt: phase.end_at || null,
          category: individualRow.category || individualRow.categoria || null,
          tipo: phase.tipo || null,
          measurementMethod: phase.measurement_method || null,
          timeCapSeconds: phase.time_cap_seconds ?? null,
          scoringParts,
        }
      }

      const teamRow = (Array.isArray(phase.teams) ? phase.teams : []).find((team) => (
        Array.isArray(team.members) && team.members.some((member) => Number(member.id) === targetId)
      ))
      if (!teamRow) return null
      const member = teamRow.members.find((item) => Number(item.id) === targetId) || {}
      return {
        phaseId: phase.id,
        phaseName: phase.nombre || 'Workout',
        rank: teamRow.rank ?? null,
        points: teamRow.total_puntos ?? member.puntos_propios ?? 0,
        mark: teamRow.mejor_marca ?? member.mejor_marca ?? null,
        extra: teamRow.extra ?? member.extra ?? null,
        events: teamRow.total_eventos ?? member.intentos ?? 0,
        status: phase.status_display || phase.estado || null,
        startAt: phase.start_at || null,
        endAt: phase.end_at || null,
        category: teamRow.team_category || member.categoria || null,
        teamName: teamRow.nombre || null,
        tipo: phase.tipo || null,
        measurementMethod: phase.measurement_method || null,
        timeCapSeconds: phase.time_cap_seconds ?? null,
        scoringParts: [],
      }
    })
    .filter(Boolean)

  return {
    rank: total?.rank ?? totalTeam?.rank ?? null,
    points: total?.total_puntos ?? totalTeam?.total_puntos ?? 0,
    events: total?.total_eventos ?? totalTeam?.total_eventos ?? 0,
    category: total?.category || total?.categoria || totalTeam?.team_category || null,
    teamName: totalTeam?.nombre || null,
    phases: phaseRows,
  }
}

export function normalizeUserResults(results = []) {
  return (Array.isArray(results) ? results : []).map((result) => ({
    id: result.id,
    phaseId: result.phase_id,
    phaseName: result.fase || 'Workout',
    mark: result.marca ?? null,
    extra: result.extra ?? null,
    points: result.puntos ?? 0,
    position: result.posicion ?? null,
    tipo: result.tipo ?? null,
    measurementMethod: result.measurement_method ?? null,
    timeCapSeconds: result.time_cap_seconds ?? null,
    createdAt: result.created_at || null,
  }))
}

function heatStartMs(item) {
  return dateMs(item?.start_at || item?.startAt) || Number.MAX_SAFE_INTEGER
}

export function getNextPersonalHeat(schedulePayload, nowValue = Date.now()) {
  const nowMs = typeof nowValue === 'number' ? nowValue : dateMs(nowValue) || Date.now()
  const items = Array.isArray(schedulePayload?.items)
    ? schedulePayload.items
    : Array.isArray(schedulePayload?.schedule?.items)
      ? schedulePayload.schedule.items
      : []
  const upcoming = items
    .filter((item) => heatStartMs(item) >= nowMs)
    .sort((a, b) => heatStartMs(a) - heatStartMs(b))
  return upcoming[0] || items.sort((a, b) => heatStartMs(b) - heatStartMs(a))[0] || null
}
