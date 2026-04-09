export const COMPETITION_WORKSPACE_SECTIONS = [
  {
    id: 'summary',
    label: 'Resumen',
    shortLabel: 'Resumen',
    group: 'control',
    description: 'Estado general, alertas y accesos rapidos de la competencia.',
    primaryAction: 'Revisar estado',
  },
  {
    id: 'setup',
    label: 'Ajustes',
    shortLabel: 'Ajustes',
    group: 'config',
    description: 'Identidad, reglas, fechas, categorias, preguntas y pagos.',
    primaryAction: 'Ajustar configuracion',
  },
  {
    id: 'enrollments',
    label: 'Inscripciones',
    shortLabel: 'Inscripciones',
    group: 'operacion',
    description: 'Solicitudes, confirmados, rechazos y respuestas del registro.',
    primaryAction: 'Gestionar inscripciones',
  },
  {
    id: 'competition',
    label: 'Competencia',
    shortLabel: 'Competencia',
    group: 'operacion',
    description: 'Fases, equipos, resultados y cronometro operativo.',
    primaryAction: 'Operar competencia',
  },
  {
    id: 'broadcast',
    label: 'TV',
    shortLabel: 'TV',
    group: 'publico',
    description: 'Leaderboard publico, QR y salida para pantalla.',
    primaryAction: 'Abrir pantalla',
  },
]

export const COMPETITION_WORKSPACE_GROUPS = [
  {
    id: 'control',
    label: 'Control',
    description: 'Visibilidad rapida y acciones de vigilancia.',
  },
  {
    id: 'config',
    label: 'Configuracion',
    description: 'Ajustes base y contenido del evento.',
  },
  {
    id: 'operacion',
    label: 'Operacion',
    description: 'Trabajo diario durante la competencia.',
  },
  {
    id: 'publico',
    label: 'Pantalla',
    description: 'Lo que ven atletas, staff y pantallas externas.',
  },
]

export const COMPETITION_CARD_ACTIONS = [
  {
    id: 'open-panel',
    label: 'Abrir panel',
    tone: 'primary',
    priority: 1,
  },
  {
    id: 'open-leaderboard',
    label: 'Ver leaderboard',
    tone: 'secondary',
    priority: 2,
  },
  {
    id: 'open-enrollments',
    label: 'Inscripciones',
    tone: 'secondary',
    priority: 3,
  },
  {
    id: 'duplicate',
    label: 'Duplicar',
    tone: 'secondary',
    priority: 4,
  },
  {
    id: 'delete',
    label: 'Eliminar',
    tone: 'danger',
    priority: 99,
  },
]

export const COMPETITION_WORKSPACE_DEFAULT_SECTION = 'summary'

export function getCompetitionWorkspaceSection(sectionId) {
  return COMPETITION_WORKSPACE_SECTIONS.find(section => section.id === sectionId) || null
}

export function getCompetitionWorkspaceSectionsByGroup(groupId) {
  return COMPETITION_WORKSPACE_SECTIONS.filter(section => section.group === groupId)
}

export function getCompetitionCardAction(actionId) {
  return COMPETITION_CARD_ACTIONS.find(action => action.id === actionId) || null
}

export function getCompetitionWorkspaceNavigation() {
  return COMPETITION_WORKSPACE_GROUPS.map(group => ({
    ...group,
    sections: getCompetitionWorkspaceSectionsByGroup(group.id),
  }))
}
