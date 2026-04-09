export const FINALREP_COMPETITION_THEME = {
  background: '#0D0F12',
  surface: '#171B21',
  primary: '#FF6B00',
  accent: '#00C2A8',
  border: '#252A33',
  text: '#F5F7FA',
  textSecondary: '#AAB2C0',
  textMuted: '#6B7280',
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
  const background = normalizeHexColor(competition?.theme_background_color) || FINALREP_COMPETITION_THEME.background
  const surface = normalizeHexColor(competition?.theme_surface_color) || FINALREP_COMPETITION_THEME.surface
  const primary = normalizeHexColor(competition?.theme_primary_color) || FINALREP_COMPETITION_THEME.primary
  const accent = normalizeHexColor(competition?.theme_accent_color) || FINALREP_COMPETITION_THEME.accent
  return {
    ...FINALREP_COMPETITION_THEME,
    background,
    surface,
    primary,
    accent,
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
