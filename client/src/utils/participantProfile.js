export const PENDING_CEDULA_PREFIX = 'pending:'

export function isPendingCedula(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized.startsWith(PENDING_CEDULA_PREFIX)
}

export function formatCedula(value, fallback = 'Pendiente') {
  const normalized = String(value || '').trim()
  if (!normalized || isPendingCedula(normalized)) return fallback
  return normalized
}

export function cedulaInputValue(value) {
  const normalized = String(value || '').trim()
  if (!normalized || isPendingCedula(normalized)) return ''
  return normalized
}

export function getMissingParticipantProfileFields(profile) {
  if (!profile) return ['perfil']

  const cedula = String(profile.cedula || '').trim()
  const genero = String(profile.genero || profile.sexo || '').trim()
  const checks = {
    cedula: cedula && !isPendingCedula(cedula),
    nombre: String(profile.nombre || '').trim(),
    apellido: String(profile.apellido || '').trim(),
    email: String(profile.email || '').trim(),
    celular: String(profile.celular || '').trim(),
    genero,
    fecha_nacimiento: profile.fecha_nacimiento,
    ciudad_pais: String(profile.ciudad_pais || '').trim(),
  }

  return Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([field]) => field)
}

export function formatMissingParticipantProfileFields(fields) {
  if (!Array.isArray(fields) || !fields.length) return ''
  return fields.join(', ')
}
