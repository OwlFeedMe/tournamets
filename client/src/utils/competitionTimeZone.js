export const DEFAULT_COMPETITION_TIMEZONE = 'America/Bogota'

export const COMPETITION_TIMEZONE_OPTIONS = [
  ['America/Bogota', 'Colombia - Bogota'],
  ['America/Lima', 'Peru - Lima'],
  ['America/Guayaquil', 'Ecuador - Quito/Guayaquil'],
  ['America/Panama', 'Panama'],
  ['America/Mexico_City', 'Mexico - Ciudad de Mexico'],
  ['America/Santiago', 'Chile - Santiago'],
  ['America/Caracas', 'Venezuela - Caracas'],
  ['America/New_York', 'Estados Unidos - Este'],
  ['America/Chicago', 'Estados Unidos - Centro'],
  ['America/Los_Angeles', 'Estados Unidos - Pacifico'],
  ['Europe/Madrid', 'Espana - Madrid'],
]

export function competitionTimeZone(value) {
  return String(value || '').trim() || DEFAULT_COMPETITION_TIMEZONE
}

function formatParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: competitionTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  return Object.fromEntries(
    formatter.formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  )
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function timeZoneOffsetMs(date, timeZone) {
  const parts = formatParts(date, timeZone)
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  )
  return asUtc - date.getTime()
}

export function utcToCompetitionDateTimeInput(value, timeZone) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16)
  const parts = formatParts(date, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function competitionDateTimeInputToUtc(value, timeZone) {
  if (!value) return null
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!match) return null
  const [, year, month, day, hour, minute] = match
  const utcGuess = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0)
  const offset = timeZoneOffsetMs(new Date(utcGuess), timeZone)
  return new Date(utcGuess - offset).toISOString()
}

export function utcToCompetitionDateInput(value, timeZone) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
  const parts = formatParts(date, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function competitionDateInputToLocalBoundary(value, endOfDay = false) {
  if (!value) return null
  return `${value}T${endOfDay ? '23:59:59' : '00:00:00'}`
}

export function formatCompetitionDateTime(value, timeZone, options = {}) {
  if (!value) return options.fallback || null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return options.fallback || String(value)
  return new Intl.DateTimeFormat(options.locale || 'es-CO', {
    timeZone: competitionTimeZone(timeZone),
    weekday: options.weekday,
    day: options.day || 'numeric',
    month: options.month || 'short',
    year: options.year,
    hour: options.hour || '2-digit',
    minute: options.minute || '2-digit',
    timeZoneName: options.timeZoneName,
  }).format(date)
}

export function formatCompetitionTimeZoneLabel(timeZone) {
  const tz = competitionTimeZone(timeZone)
  try {
    const label = new Intl.DateTimeFormat('es-CO', {
      timeZone: tz,
      timeZoneName: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value
    return label ? `${tz} (${label})` : tz
  } catch {
    return tz
  }
}

export function formatDateInputLabel(value) {
  if (!value) return ''
  const [year, month, day] = String(value).slice(0, 10).split('-')
  return [year, pad2(month), pad2(day)].filter(Boolean).join('-')
}
