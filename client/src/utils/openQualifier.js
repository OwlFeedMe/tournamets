export function openRegistrationState(competition, config, categories = [], now = Date.now()) {
  if (!competition.activa) return { available: false, label: 'Open pendiente de publicación' }
  if (now >= Date.parse(config.deadline)) return { available: false, closed: true, label: 'Plazo del Open finalizado' }
  if (competition.enrollment_end && now > Date.parse(competition.enrollment_end)) return { available: false, closed: true, label: 'Registro al Open cerrado' }
  if (competition.enrollment_start && now < Date.parse(competition.enrollment_start)) return { available: false, label: 'Registro al Open próximamente' }
  if (!competition.enrollment_open) return { available: false, label: 'Registro al Open no habilitado' }
  if (!categories.some(c => c.registration_enabled && (c.modality || 'individual') === 'individual')) return { available: false, label: 'Categorías del Open por publicar' }
  return { available: true, label: 'Registro al Open abierto' }
}

export function openLandingAction(registration, entry) {
  if (entry) return { mode: 'entry', label: entry.status === 'qualified' ? 'Confirmar mi cupo' : 'Ver mi Open' }
  if (registration.closed) return { mode: 'closed', label: 'Registro al Open cerrado' }
  if (registration.available) return { mode: 'register', label: 'Participar en el Open' }
  return { mode: 'notify', label: 'Notificarme cuando abra el Open' }
}

export function openSubmissionState(config, now = Date.now()) {
  if (now >= Date.parse(config.deadline)) return 'closed'
  if (config.submissions_open_at && now < Date.parse(config.submissions_open_at)) return 'upcoming'
  return 'open'
}

export function openFinalPaymentLabel(config) {
  if (config.final_payment === 'pending') return config.final_prices ? 'El valor adicional está publicado por categoría. Consúltalo antes de confirmar tu cupo.' : 'Valor adicional por confirmar. El organizador publicará el precio antes de habilitar el pago del Qualifier.'
  return ({ full: 'Al clasificar pagas el precio completo de tu categoría.', difference: 'Al clasificar pagas la diferencia entre tu categoría y el Open, sin descontar cargos de servicio.', discount: `Al clasificar tienes ${config.discount_percent}% de descuento sobre el precio completo de tu categoría.`, none: 'Si clasificas, no tienes que pagar un valor adicional.' })[config.final_payment]
}
export const openProfileStates = {
  open_preregistered: { label: 'Preinscrito al Open', copy: 'Tu preinscripción está guardada. Puedes pagar y enviar tu Open dentro del plazo.' },
  open_paid: { label: 'Open pagado', copy: 'Consulta los requisitos y envía tu Open dentro del período de entregas.' },
  open_submitted: { label: 'Open en revisión', copy: 'La organización está revisando tu entrega.' },
  open_missing: { label: 'Open sin entrega', copy: 'El plazo del Open terminó sin una entrega.' },
  open_qualified: { label: 'Clasificado', copy: 'Consulta tu clasificación y las condiciones para confirmar tu cupo.' },
  open_rejected: { label: 'No clasificado', copy: 'Consulta el estado de tu participación en el Open.' },
  open_confirmed: { label: 'Cupo confirmado', copy: 'Tu cupo está confirmado. Consulta los detalles de la competencia.' },
}
