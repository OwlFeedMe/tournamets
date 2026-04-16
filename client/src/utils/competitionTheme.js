export const FINALREP_COMPETITION_THEME = {
  background: '#0D0F12',
  surface: '#171A20',
  primary: '#D6D9E0',
  accent: '#5EEAD4',
  border: 'rgba(214, 217, 224, 0.14)',
  text: '#F5F7FA',
  textSecondary: '#C7CDD6',
  textMuted: '#8B94A3',
}

const HEX_COLOR_RE = /^#?[0-9a-f]{6}$/i

export function normalizeHexColor(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (!HEX_COLOR_RE.test(raw)) return ''
  return raw.startsWith('#') ? raw.toUpperCase() : `#${raw.toUpperCase()}`
}

export function hexToRgba(color, alpha = 1) {
  const hex = normalizeHexColor(color)
  if (!hex) return `rgba(0, 0, 0, ${alpha})`
  const value = hex.slice(1)
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function getRelativeLuminance(color) {
  const hex = normalizeHexColor(color)
  if (!hex) return 0
  const channels = [0, 2, 4].map((index) => {
    const channel = Number.parseInt(hex.slice(index + 1, index + 3), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2])
}

export function getReadableTextColor(color, dark = '#0D0F12', light = '#F5F7FA') {
  return getRelativeLuminance(color) > 0.45 ? dark : light
}

export function resolveCompetitionTheme(competition) {
  return {
    ...FINALREP_COMPETITION_THEME,
  }
}

export const COMPETITION_THEME_FIELDS = [
  {
    key: 'theme_background_color',
    label: 'Fondo',
    hint: 'Base general de la pagina y zonas amplias.',
    fallback: FINALREP_COMPETITION_THEME.background,
  },
  {
    key: 'theme_surface_color',
    label: 'Superficie',
    hint: 'Cards, paneles y bloques internos.',
    fallback: FINALREP_COMPETITION_THEME.surface,
  },
  {
    key: 'theme_primary_color',
    label: 'Primario',
    hint: 'Botones principales, estados activos y llamadas a la accion.',
    fallback: FINALREP_COMPETITION_THEME.primary,
  },
  {
    key: 'theme_accent_color',
    label: 'Accent',
    hint: 'Etiquetas, datos destacados y detalles secundarios.',
    fallback: FINALREP_COMPETITION_THEME.accent,
  },
]
