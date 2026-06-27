export function parseCalendarDate(value) {
  if (!value) return null
  const raw = String(value).trim()
  const [year, month, day] = raw.slice(0, 10).split('-').map(Number)
  if (year && month && day) {
    const date = new Date(year, month - 1, day)
    if (!Number.isNaN(date.getTime())) return date
  }
  return null
}

export function formatCalendarDate(value, locale = 'es-CO', options = { day: 'numeric', month: 'short', year: 'numeric' }, timeZone = '') {
  const raw = String(value || '')
  const date = timeZone && raw.includes('T') ? new Date(value) : parseCalendarDate(value)
  if (!date || Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(locale, timeZone && raw.includes('T') ? { ...options, timeZone } : options).format(date)
}

export function formatCalendarDateRange(start, end, {
  empty = 'Fechas por confirmar',
  prefixStart = 'Desde',
  prefixEnd = 'Hasta',
  locale = 'es-CO',
  options = { day: 'numeric', month: 'short', year: 'numeric' },
  timeZone = '',
} = {}) {
  const startLabel = formatCalendarDate(start, locale, options, timeZone)
  const endLabel = formatCalendarDate(end, locale, options, timeZone)
  if (!startLabel && !endLabel) return empty
  if (!startLabel) return `${prefixEnd} ${endLabel}`
  if (!endLabel) return `${prefixStart} ${startLabel}`
  return `${startLabel} - ${endLabel}`
}
