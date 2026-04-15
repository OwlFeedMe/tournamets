const PENDING_CEDULA_PREFIX = 'pending:'

export function getMissingParticipantProfileFields(profile) {
  if (!profile) return ['perfil']

  const cedula = String(profile.cedula || '').trim()
  const genero = String(profile.genero || profile.sexo || '').trim()
  const checks = {
    cedula: cedula && !cedula.startsWith(PENDING_CEDULA_PREFIX),
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
