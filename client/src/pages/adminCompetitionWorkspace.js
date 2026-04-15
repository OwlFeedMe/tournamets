export const COMPETITION_WORKSPACE_SECTIONS = [
  {
    id: 'setup',
    label: 'Configuracion',
    shortLabel: 'Config',
    group: 'config',
    description: 'Base, registro, divisiones y pagos.',
    primaryAction: 'Configurar competencia',
  },
  {
    id: 'launch',
    label: 'Lanzamiento',
    shortLabel: 'Lanzamiento',
    group: 'config',
    description: 'Revisar si ya esta lista y publicarla.',
    primaryAction: 'Lanzar competencia',
  },
  {
    id: 'enrollments',
    label: 'Inscripciones',
    shortLabel: 'Inscripciones',
    group: 'operacion',
    description: 'Inscritos y respuestas del registro.',
    primaryAction: 'Gestionar inscripciones',
  },
  {
    id: 'prep',
    label: 'Preparacion',
    shortLabel: 'Preparacion',
    group: 'operacion',
    description: 'Heats, cronograma y salida.',
    primaryAction: 'Preparar competencia',
  },
  {
    id: 'live',
    label: 'En vivo',
    shortLabel: 'En vivo',
    group: 'operacion',
    description: 'Resultados y control en competencia.',
    primaryAction: 'Operar en vivo',
  },
  {
    id: 'broadcast',
    label: 'Pantalla',
    shortLabel: 'Pantalla',
    group: 'publico',
    description: 'Salida publica y vista externa.',
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

export const COMPETITION_WORKSPACE_DEFAULT_SECTION = 'setup'

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
