import { formatCalendarDate } from '../../utils/calendarDate'

export const homePageBg =
  'radial-gradient(circle at top, rgba(214,217,224,0.10), transparent 24%), radial-gradient(circle at 82% 18%, rgba(94,234,212,0.10), transparent 20%), radial-gradient(circle at 20% 78%, rgba(205,170,107,0.08), transparent 18%), #0D0F12'

export function formatCompetitionDate(value, options = {}) {
  const { includeYear = true } = options
  return formatCalendarDate(value, 'es-CO', includeYear
    ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { day: 'numeric', month: 'short' })
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
  return formatCompetitionDateRange(competition?.enrollment_start, competition?.enrollment_end, options)
}

export function formatCompetitionWindow(competition, options = {}) {
  return formatCompetitionDateRange(competition?.competition_start, competition?.competition_end, options)
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
      const start = formatCompetitionDate(item.start_at)
      const end = formatCompetitionDate(item.end_at)
      if (start && end && start !== end) return `${item.label || 'Fecha'}: ${start} - ${end}`
      return `${item.label || 'Fecha'}: ${start || end || 'Por confirmar'}`
    })
    return main.join(' | ')
  }
  const competitionStart = formatCompetitionDate(competition?.competition_start)
  const competitionEnd = formatCompetitionDate(competition?.competition_end)
  if (competitionStart || competitionEnd) {
    return competitionStart && competitionEnd
      ? `${competitionStart} - ${competitionEnd}`
      : (competitionStart || competitionEnd)
  }
  const enrollmentStart = formatCompetitionDate(competition?.enrollment_start)
  const enrollmentEnd = formatCompetitionDate(competition?.enrollment_end)
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
