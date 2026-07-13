import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  Download,
  Eye,
  BarChart3,
  MapPin,
  Megaphone,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Ticket,
  Trash2,
  Trophy,
  Users,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { AdminToolsNav } from '../components/admin/AdminToolsNav'
import { APP_CONTENT_MAX_WIDTH } from '../utils/competitionLayout'

const colors = {
  bg: '#0D0F12',
  top: '#090B0E',
  surface: '#171B21',
  border: '#252A33',
  primary: '#FF6B00',
  accent: '#00C2A8',
  text: '#F5F7FA',
  secondary: '#AAB2C0',
  muted: '#6B7280',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  gradient: 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)',
}

const wodColorPalette = ['#FF6B00', '#00C2A8', '#D4A537', '#8B5CF6', '#38BDF8', '#F59E0B', '#EF4444', '#22C55E']

function wodColorFor(value) {
  const raw = String(value ?? 'wod').trim() || 'wod'
  let hash = 0
  for (let index = 0; index < raw.length; index += 1) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(index)
    hash |= 0
  }
  return wodColorPalette[Math.abs(hash) % wodColorPalette.length]
}

function preventNumberInputWheel(event) {
  if (event.currentTarget?.type !== 'number') return
  event.currentTarget.blur()
}

const stepTemplates = [
  {
    id: 'identity',
    label: 'Crear evento',
    icon: Megaphone,
    title: 'Datos base',
    purpose: 'Nombre, descripcion, fechas, sede, imagen publica, contacto, landing y visibilidad.',
    nextAction: 'Guardar datos base',
  },
  {
    id: 'registration',
    label: 'Inscripciones',
    icon: Ticket,
    title: 'Registro y venta',
    purpose: 'Categorias, precios, cupos, apertura, participantes, descuentos e invitaciones.',
    nextAction: 'Abrir o cerrar registro',
  },
  {
    id: 'prepare',
    label: 'Preparar',
    icon: CalendarDays,
    title: 'Operacion previa',
    purpose: 'Fases, workouts, heats, equipos, check-in y orden de salida.',
    nextAction: 'Generar heats',
  },
  {
    id: 'live',
    label: 'En vivo',
    icon: Radio,
    title: 'Control en competencia',
    purpose: 'Resultados, leaderboard, jueces, cronometro y pantalla publica.',
    nextAction: 'Cargar resultados',
  },
  {
    id: 'close',
    label: 'Cerrar',
    icon: Trophy,
    title: 'Cierre',
    purpose: 'Podiums, finanzas, boleteria, exportes y archivo operativo.',
    nextAction: 'Revisar cierre',
  },
]

function authHeaders(json = true) {
  const token = window.localStorage.getItem('token')
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...authHeaders(options.body instanceof FormData ? false : true),
      ...(options.headers || {}),
    },
  })
  if (!response.ok) {
    let message = `Error ${response.status}`
    try {
      const data = await response.json()
      message = data?.detail || message
    } catch {
      try {
        message = await response.text()
      } catch {
        // keep default message
      }
    }
    throw new Error(message)
  }
  if (response.status === 204) return null
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return response.json()
  return response.blob()
}

function normalizeHeatsPayload(payload) {
  if (Array.isArray(payload)) return { items: payload }
  const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.heats) ? payload.heats : []
  return { ...(payload || {}), items }
}

function formatDateRange(competition) {
  const start = competition?.competition_start || competition?.enrollment_start
  const end = competition?.competition_end
  if (!start) return 'Fecha por confirmar'
  const formatter = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short' })
  const startDate = new Date(start)
  if (!end) return formatter.format(startDate)
  return `${formatter.format(startDate)} - ${formatter.format(new Date(end))}`
}

function formatDateTime(value) {
  if (!value) return 'Sin hora'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin hora'
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
}

function formatHeatSchedule(heat) {
  if (!heat?.start_at) return 'Horario pendiente'
  const start = formatDateTime(heat.start_at)
  const end = heat.end_at ? formatDateTime(heat.end_at) : null
  return end ? `${start} - ${end}` : start
}

function formatHeatScheduleCompact(heat) {
  if (!heat?.start_at) return 'Horario pendiente'
  const start = new Date(heat.start_at)
  if (Number.isNaN(start.getTime())) return 'Horario pendiente'
  const timeFormatter = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' })
  const dateFormatter = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short' })
  if (!heat.end_at) return `${dateFormatter.format(start)}, ${timeFormatter.format(start)}`
  const end = new Date(heat.end_at)
  if (Number.isNaN(end.getTime())) return `${dateFormatter.format(start)}, ${timeFormatter.format(start)}`
  const sameDay = start.toDateString() === end.toDateString()
  return sameDay
    ? `${timeFormatter.format(start)} - ${timeFormatter.format(end)}`
    : `${dateFormatter.format(start)}, ${timeFormatter.format(start)} - ${dateFormatter.format(end)}, ${timeFormatter.format(end)}`
}

function formatHeatDuration(heat) {
  if (!heat?.start_at || !heat?.end_at) return null
  const start = new Date(heat.start_at)
  const end = new Date(heat.end_at)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
  return minutes ? `${minutes} min` : null
}

function formatMoney(value) {
  const amount = Number(value || 0)
  if (!amount) return '$0'
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount)
}

function formatCategoryCapacity(category) {
  const maxCapacity = Number(category?.max_capacity || 0)
  const registered = Number(category?.registered_count || 0)
  const reserved = Number(category?.reserved_count || registered || 0)
  if (!maxCapacity) return `${registered} inscritos - Sin limite`
  const available = Math.max(0, maxCapacity - reserved)
  return `${registered} / ${maxCapacity} inscritos - ${available} disponibles`
}

function dateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16)
  const pad = (item) => String(item).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toUtcOrNull(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function statusOf(competition, summary) {
  if (!competition?.activa) return 'Borrador'
  if (competition?.enrollment_open) return 'Inscripciones'
  if ((summary?.phases || 0) > 0) return 'Preparacion'
  return 'Publicado'
}

function activeStepId(competition, summary) {
  if (!competition?.activa) return 'identity'
  if (competition?.enrollment_open) return 'registration'
  if ((summary?.phases || 0) > 0 && (summary?.heats || 0) === 0) return 'prepare'
  if ((summary?.results || 0) > 0) return 'live'
  return 'prepare'
}

function buildSteps(competition, summary) {
  const active = activeStepId(competition, summary)
  const activeIndex = stepTemplates.findIndex((step) => step.id === active)
  return stepTemplates.map((step, index) => {
    let progress = 0
    if (step.id === 'identity') progress = competition?.nombre ? (competition?.activa ? 100 : 70) : 20
    if (step.id === 'registration') progress = Math.min(100, (summary?.categories || 0) * 12 + Math.min(summary?.participants || 0, 80) / 2 + (competition?.enrollment_open ? 25 : 0))
    if (step.id === 'prepare') progress = Math.min(100, (summary?.phases || 0) * 20 + (summary?.heats || 0) * 8)
    if (step.id === 'live') progress = Math.min(100, (summary?.results || 0) * 7 + (summary?.judges || 0) * 12)
    if (step.id === 'close') progress = summary?.results ? 45 : 0
    return {
      ...step,
      progress: Math.round(progress),
      state: index < activeIndex ? 'done' : index === activeIndex ? 'active' : index === activeIndex + 1 ? 'next' : 'locked',
    }
  })
}

function normalizeCompetition(raw, bundle = {}) {
  const summary = {
    participants: (bundle.participants || []).filter((item) => item.estado === 'confirmado').length,
    categories: (bundle.categories || []).length,
    phases: (bundle.phases || []).length,
    heats: (bundle.heats?.items || []).length,
    results: (bundle.results || []).length,
    judges: (bundle.judges || []).length,
    appeals: (bundle.appeals || []).filter((item) => ACTIVE_APPEAL_STATUSES.includes(item.status)).length,
  }
  const steps = buildSteps(raw, summary)
  const health = Math.round(steps.reduce((sum, step) => sum + step.progress, 0) / steps.length)
  return {
    raw,
    id: raw.id,
    name: raw.nombre || 'Competencia',
    status: statusOf(raw, summary),
    date: formatDateRange(raw),
    venue: raw.lugar || 'Sede por confirmar',
    athletes: summary.participants,
    categories: summary.categories,
    phases: summary.phases,
    heats: summary.heats,
    results: summary.results,
    judges: summary.judges,
    health,
    nextStep: steps.find((step) => step.state === 'active')?.nextAction || 'Continuar',
    risk: summary.phases ? `${summary.phases} fases` : summary.categories ? `${summary.categories} categorias` : 'Configurar',
    source: 'api',
  }
}

async function loadCompetitionBundle(competitionId) {
  const [competition, participants, categories, phases, scoring, discounts, invitations, ticketConfig, ticketOrders, heats, results, teams, judges, announcers, judgeAudit, appeals, finance, leaderboard] = await Promise.all([
    api(`/competitions/${competitionId}`),
    api(`/competitions/${competitionId}/participants`).catch(() => []),
    api(`/competitions/${competitionId}/categories`).catch(() => []),
    api(`/competitions/${competitionId}/phases`).catch(() => []),
    api(`/competitions/${competitionId}/scoring`).catch(() => null),
    api(`/competitions/${competitionId}/discounts`).catch(() => []),
    api(`/competitions/${competitionId}/competitor-invitations`).catch(() => []),
    api(`/competitions/${competitionId}/ticketing-config`).catch(() => null),
    api(`/competitions/${competitionId}/ticketing-orders`).catch(() => []),
    api(`/competitions/${competitionId}/heats`).then(normalizeHeatsPayload).catch(() => ({ items: [] })),
    api(`/results?competition_id=${competitionId}`).catch(() => []),
    api(`/teams?competition_id=${competitionId}`).catch(() => []),
    api(`/competitions/${competitionId}/judges`).catch(() => []),
    api(`/competitions/${competitionId}/announcers`).catch(() => []),
    api(`/competitions/${competitionId}/judge-audit`).catch(() => []),
    api(`/appeals?competition_id=${competitionId}`).catch(() => []),
    api(`/finance/competitions/${competitionId}`).catch(() => null),
    api(`/leaderboard/${competitionId}`).catch(() => null),
  ])
  return { competition, participants, categories, phases, scoring, discounts, invitations, ticketConfig, ticketOrders, heats, results, teams, judges, announcers, judgeAudit, appeals, finance, leaderboard }
}

function Pill({ children, tone = colors.border, filled = false }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      minHeight: 26,
      padding: '5px 9px',
      borderRadius: 999,
      border: `1px solid ${tone}66`,
      background: filled ? tone : `${tone}18`,
      color: filled ? colors.bg : colors.text,
      fontSize: 11,
      fontWeight: 800,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <span style={{ color: colors.secondary, fontSize: 12, fontWeight: 800 }}>{label}</span>
      {children}
    </label>
  )
}

function inputStyle() {
  return {
    width: '100%',
    minHeight: 40,
    border: `1px solid ${colors.border}`,
    background: colors.top,
    color: colors.text,
    borderRadius: 8,
    padding: '9px 11px',
    outline: 'none',
  }
}

function parseTimeInput(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (/^\d+$/.test(raw)) {
    const parts = clockPartsFromDigits(raw)
    if (parts) return (parts.hours * 3600) + (parts.minutes * 60) + parts.seconds
    return Number(raw)
  }
  const parts = raw.split(':').map((item) => Number(item.trim()))
  if (![2, 3].includes(parts.length) || parts.some((item) => !Number.isFinite(item) || item < 0)) return null
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0], parts[1]]
  if (minutes > 59 || seconds > 59) return null
  return (hours * 3600) + (minutes * 60) + seconds
}

function parseTimeCapInput(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (/^\d+$/.test(raw)) return Number(raw) * 60
  return parseTimeInput(raw)
}

function formatSeconds(value) {
  if (value === '' || value === null || value === undefined || !Number.isFinite(Number(value))) return ''
  const total = Math.max(0, Math.round(Number(value)))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function clockPartsFromDigits(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 6)
  if (digits.length < 3) return null
  const valid = (hours, minutes, seconds) => (
    Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds)
    && hours >= 0 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59
  )
  const candidate = (hours, minutes, seconds) => valid(hours, minutes, seconds) ? { hours, minutes, seconds } : null
  if (digits.length === 3) return candidate(0, Number(digits.slice(0, 1)), Number(digits.slice(1)))
  if (digits.length === 4) {
    return candidate(0, Number(digits.slice(0, 2)), Number(digits.slice(2)))
      || clockPartsFromDigits(digits.slice(0, 3))
  }
  if (digits.length === 5) {
    return (digits.startsWith('0') ? clockPartsFromDigits(digits.slice(1)) : null)
      || candidate(Number(digits.slice(0, 1)), Number(digits.slice(1, 3)), Number(digits.slice(3)))
      || clockPartsFromDigits(digits.slice(0, 4))
  }
  return candidate(Number(digits.slice(0, 2)), Number(digits.slice(2, 4)), Number(digits.slice(4)))
    || clockPartsFromDigits(digits.slice(0, 5))
}

function formatTimeEntryInput(value) {
  const raw = String(value ?? '')
  if (!raw.trim()) return ''
  const digits = raw.replace(/\D/g, '')
  const parts = clockPartsFromDigits(digits)
  if (!parts) return digits || raw.replace(/[^\d:]/g, '')
  const seconds = (parts.hours * 3600) + (parts.minutes * 60) + parts.seconds
  return formatSeconds(seconds)
}

function resolveAssetUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  return raw.startsWith('/') ? raw : `/${raw}`
}

function Button({ children, onClick, tone = 'secondary', disabled = false, type = 'button', title, primaryAction = false }) {
  const primary = tone === 'primary'
  const danger = tone === 'danger'
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-primary-action={primaryAction ? 'true' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 40,
        borderRadius: 8,
        border: primary ? 'none' : `1px solid ${danger ? 'rgba(239,68,68,0.5)' : colors.border}`,
        background: primary ? colors.primary : danger ? 'rgba(239,68,68,0.12)' : colors.top,
        color: primary ? colors.bg : danger ? '#FCA5A5' : colors.text,
        padding: '9px 12px',
        fontWeight: 900,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function ToggleCard({ title, description, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        minHeight: 104,
        borderRadius: 8,
        border: `1px solid ${active ? 'rgba(0,194,168,0.58)' : colors.border}`,
        background: active ? 'rgba(0,194,168,0.12)' : colors.top,
        color: colors.text,
        padding: 12,
        textAlign: 'left',
        display: 'grid',
        gap: 8,
        alignContent: 'start',
      }}
    >
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <span style={{ fontWeight: 950 }}>{title}</span>
        <Pill tone={active ? colors.accent : colors.border}>{active ? 'Activo' : 'Inactivo'}</Pill>
      </span>
      <span style={{ color: colors.secondary, fontSize: 12, lineHeight: 1.45 }}>{description}</span>
    </button>
  )
}

function Panel({ title, subtitle, action, children }) {
  return (
    <section className="fr-panel" style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, overflow: 'hidden', minWidth: 0 }}>
      <div className="fr-panel-header" style={{ padding: 14, borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 17, lineHeight: 1.15 }}>{title}</h3>
          {subtitle ? <div style={{ color: colors.secondary, fontSize: 12, marginTop: 4 }}>{subtitle}</div> : null}
        </div>
        {action ? <div className="fr-panel-action" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>{action}</div> : null}
      </div>
      <div className="fr-panel-body" style={{ padding: 14, display: 'grid', gap: 12 }}>{children}</div>
    </section>
  )
}

function ModuleTabs({ items, active, onChange }) {
  return (
    <div className="fr-module-tabs" style={{
      display: 'flex',
      gap: 8,
      overflowX: 'auto',
      padding: 4,
      border: `1px solid ${colors.border}`,
      background: colors.top,
      borderRadius: 8,
      scrollbarWidth: 'none',
    }}>
      {items.map((item) => {
        const Icon = item.icon
        const selected = item.id === active
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            style={{
              flex: '0 0 auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 38,
              border: `1px solid ${selected ? 'rgba(255,107,0,0.62)' : colors.border}`,
              background: selected ? 'rgba(255,107,0,0.15)' : colors.surface,
              color: selected ? colors.text : colors.secondary,
              borderRadius: 8,
              padding: '8px 11px',
              fontWeight: 900,
            }}
          >
            {Icon ? <Icon size={15} /> : null}
            {item.label}
            {item.count !== undefined ? <Pill tone={selected ? colors.primary : colors.border}>{item.count}</Pill> : null}
          </button>
        )
      })}
    </div>
  )
}

function MiniStat({ label, value, tone = colors.accent }) {
  return (
    <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 11, minWidth: 0 }}>
      <div style={{ color: colors.muted, fontSize: 11, fontWeight: 800 }}>{label}</div>
      <div style={{ color: tone, fontSize: 20, lineHeight: 1.1, fontWeight: 950, marginTop: 5, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return (
    <div className="fr-command-modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.74)', display: 'grid', placeItems: 'center', padding: 16 }} onClick={onClose}>
      <div className="fr-command-modal" style={{ width: 'min(760px, 100%)', maxHeight: '88vh', overflowY: 'auto', border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.surface }} onClick={(event) => event.stopPropagation()}>
        <div className="fr-command-modal-header" style={{ position: 'sticky', top: 0, zIndex: 1, background: colors.surface, borderBottom: `1px solid ${colors.border}`, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div className="fr-command-modal-title" style={{ fontSize: 18, fontWeight: 950 }}>{title}</div>
          <Button onClick={onClose}>Cerrar</Button>
        </div>
        <div className="fr-command-modal-body" style={{ padding: 14 }}>{children}</div>
      </div>
    </div>
  )
}

function CompetitionCard({ item, onOpen }) {
  const statusTone = item.status === 'Borrador' ? colors.warning : item.status === 'Inscripciones' ? colors.accent : colors.primary
  return (
    <button type="button" onClick={() => onOpen(item.id)} style={{ width: '100%', textAlign: 'left', border: `1px solid ${colors.border}`, background: colors.surface, color: colors.text, borderRadius: 8, padding: 0, overflow: 'hidden' }}>
      <div style={{ height: 7, background: `linear-gradient(90deg, ${statusTone}, rgba(255,255,255,0.06))` }} />
      <div style={{ padding: 16, display: 'grid', gap: 15 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <Pill tone={statusTone}>{item.status}</Pill>
              <Pill tone={colors.border}>Datos reales</Pill>
            </div>
            <div style={{ fontSize: 19, lineHeight: 1.1, fontWeight: 950 }}>{item.name}</div>
            <div style={{ marginTop: 7, color: colors.secondary, fontSize: 12, lineHeight: 1.5 }}>{item.venue} - {item.date}</div>
          </div>
          <span style={{ width: 38, height: 38, borderRadius: 8, display: 'grid', placeItems: 'center', background: colors.top, border: `1px solid ${colors.border}`, color: '#FFB36F', flexShrink: 0 }}>
            <ChevronRight size={18} />
          </span>
        </div>
        <div className="fr-competition-card-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 9 }}>
          <MiniStat label="Inscritos" value={item.athletes} tone={colors.accent} />
          <MiniStat label="Categorias" value={item.categories} tone={colors.success} />
          <MiniStat label="Avance" value={`${item.health}%`} tone={colors.primary} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
          <div>
            <div style={{ color: colors.secondary, fontSize: 11, fontWeight: 800 }}>Siguiente paso</div>
            <div style={{ color: colors.text, fontSize: 13, fontWeight: 900, marginTop: 3 }}>{item.nextStep}</div>
          </div>
          <Pill tone={item.phases ? colors.accent : colors.warning}>{item.risk}</Pill>
        </div>
      </div>
    </button>
  )
}

function useDraft(source, mapFn) {
  const [draft, setDraft] = useState(() => mapFn(source))
  const set = (field, value) => setDraft((prev) => ({ ...prev, [field]: value }))
  return [draft, set, setDraft]
}

function IdentityPanel({ bundle, reload, notify }) {
  const competition = bundle.competition
  const [editOpen, setEditOpen] = useState(false)
  const [assetModal, setAssetModal] = useState(null)
  const [draft, setDraft] = useDraft(competition, (item) => ({
    nombre: item?.nombre || '',
    descripcion: item?.descripcion || '',
    general_info_text: item?.general_info_text || '',
    lugar: item?.lugar || '',
    timezone: item?.timezone || 'America/Bogota',
    contact_phone: item?.contact_phone || '',
    website_url: item?.website_url || '',
    enrollment_intro_text: item?.enrollment_intro_text || '',
    enrollment_terms_text: item?.enrollment_terms_text || '',
    enrollment_start: dateTimeInput(item?.enrollment_start),
    enrollment_end: dateTimeInput(item?.enrollment_end),
    competition_start: dateTimeInput(item?.competition_start),
    competition_end: dateTimeInput(item?.competition_end),
    individual_enabled: item?.individual_enabled ? 1 : 0,
    team_enabled: item?.team_enabled ? 1 : 0,
    team_size: item?.team_size || 2,
    team_membership_rule: item?.team_membership_rule || 'free',
    show_public_category_roster: item?.show_public_category_roster ? 1 : 0,
    allow_user_results: item?.allow_user_results ? 1 : 0,
    scoring_mode: item?.scoring_mode || 'higher_wins',
    rm_unit: item?.rm_unit || 'kg',
  }))
  const [busy, setBusy] = useState(false)
  const [assetBusy, setAssetBusy] = useState('')
  const profileUrl = resolveAssetUrl(competition.profile_image_url || competition.imagen_url)
  const bannerUrl = resolveAssetUrl(competition.banner_image_url || competition.banner_desktop_url || competition.banner_mobile_url || competition.imagen_url)
  const modalityOptions = [
    {
      key: 'individual_enabled',
      title: 'Competencia individual',
      description: 'Habilita categorias y resultados por atleta. Si este modo esta activo, los inscritos compiten como personas.',
    },
    {
      key: 'team_enabled',
      title: 'Competencia por equipos',
      description: 'Habilita creacion de equipos, categorias de equipos y resultados por equipo. Apagado oculta la configuracion de equipos.',
    },
    {
      key: 'show_public_category_roster',
      title: 'Roster publico por categoria',
      description: 'Muestra al publico la lista de inscritos separada por categoria en la landing o roster publico.',
    },
    {
      key: 'allow_user_results',
      title: 'Resultados enviados por atletas',
      description: 'Permite flujos donde el atleta pueda cargar resultados. Si esta apagado, solo staff/jueces operan resultados.',
    },
  ]
  const detailValue = (value, fallback = 'Pendiente') => {
    const text = String(value || '').trim()
    return text || fallback
  }
  const dateValue = (value) => {
    if (!value) return 'Pendiente'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  }
  const details = [
    ['Nombre', detailValue(competition.nombre)],
    ['Sede / ciudad', detailValue(competition.lugar)],
    ['Inicio inscripciones', dateValue(competition.enrollment_start)],
    ['Fin inscripciones', dateValue(competition.enrollment_end)],
    ['Inicio competencia', dateValue(competition.competition_start)],
    ['Fin competencia', dateValue(competition.competition_end)],
    ['Telefono contacto', detailValue(competition.contact_phone)],
    ['Sitio web', detailValue(competition.website_url)],
  ]
  const longDetails = [
    ['Descripcion', competition.descripcion],
    ['Informacion general', competition.general_info_text],
    ['Texto inicial de registro', competition.enrollment_intro_text],
    ['Terminos de registro', competition.enrollment_terms_text],
  ]
  const pendingItems = [
    !competition.nombre ? 'Nombre de la competencia' : null,
    !competition.descripcion ? 'Descripcion publica' : null,
    !competition.lugar ? 'Sede o ciudad' : null,
    !competition.website_url ? 'Sitio web' : null,
    !competition.enrollment_start ? 'Inicio de inscripciones' : null,
    !competition.enrollment_end ? 'Fin de inscripciones' : null,
    !competition.competition_start ? 'Inicio de competencia' : null,
    !competition.contact_phone ? 'Telefono de contacto' : null,
    !profileUrl ? 'Imagen perfil' : null,
    !bannerUrl ? 'Banner' : null,
  ].filter(Boolean)

  const save = async () => {
    setBusy(true)
    try {
      await api(`/competitions/${competition.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...draft,
          enrollment_start: toUtcOrNull(draft.enrollment_start),
          enrollment_end: toUtcOrNull(draft.enrollment_end),
          competition_start: toUtcOrNull(draft.competition_start),
          competition_end: toUtcOrNull(draft.competition_end),
          team_size: Number(draft.team_size || 2),
        }),
      })
      notify('Datos base guardados')
      setEditOpen(false)
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const uploadAsset = async (assetType, file) => {
    if (!file) return
    setAssetBusy(assetType)
    try {
      const data = new FormData()
      data.append('file', file)
      await api(`/competitions/${competition.id}/assets?asset_type=${assetType}`, { method: 'POST', body: data })
      notify('Imagen actualizada')
      setAssetModal(null)
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setAssetBusy('')
    }
  }

  const deleteAsset = async (assetType) => {
    setAssetBusy(assetType)
    try {
      await api(`/competitions/${competition.id}/assets?asset_type=${assetType}`, { method: 'DELETE' })
      notify('Imagen eliminada')
      setAssetModal(null)
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setAssetBusy('')
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {editOpen ? (
        <Modal title="Editar datos base" onClose={() => setEditOpen(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <Field label="Nombre"><input style={inputStyle()} value={draft.nombre} onChange={(e) => setDraft('nombre', e.target.value)} /></Field>
              <Field label="Sede / ciudad"><input style={inputStyle()} value={draft.lugar} onChange={(e) => setDraft('lugar', e.target.value)} /></Field>
              <Field label="Inicio inscripciones"><input type="datetime-local" style={inputStyle()} value={draft.enrollment_start} onChange={(e) => setDraft('enrollment_start', e.target.value)} /></Field>
              <Field label="Fin inscripciones"><input type="datetime-local" style={inputStyle()} value={draft.enrollment_end} onChange={(e) => setDraft('enrollment_end', e.target.value)} /></Field>
              <Field label="Inicio competencia"><input type="datetime-local" style={inputStyle()} value={draft.competition_start} onChange={(e) => setDraft('competition_start', e.target.value)} /></Field>
              <Field label="Fin competencia"><input type="datetime-local" style={inputStyle()} value={draft.competition_end} onChange={(e) => setDraft('competition_end', e.target.value)} /></Field>
              <Field label="Telefono contacto"><input style={inputStyle()} value={draft.contact_phone} onChange={(e) => setDraft('contact_phone', e.target.value)} /></Field>
              <Field label="Sitio web"><input style={inputStyle()} value={draft.website_url} onChange={(e) => setDraft('website_url', e.target.value)} /></Field>
              <Field label="Descripcion"><textarea style={{ ...inputStyle(), minHeight: 94 }} value={draft.descripcion} onChange={(e) => setDraft('descripcion', e.target.value)} /></Field>
              <Field label="Informacion general"><textarea style={{ ...inputStyle(), minHeight: 94 }} value={draft.general_info_text} onChange={(e) => setDraft('general_info_text', e.target.value)} /></Field>
              <Field label="Texto inicial de registro"><textarea style={{ ...inputStyle(), minHeight: 94 }} value={draft.enrollment_intro_text} onChange={(e) => setDraft('enrollment_intro_text', e.target.value)} /></Field>
              <Field label="Terminos de registro"><textarea style={{ ...inputStyle(), minHeight: 94 }} value={draft.enrollment_terms_text} onChange={(e) => setDraft('enrollment_terms_text', e.target.value)} /></Field>
            </div>
            <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
              {modalityOptions.map((item) => (
                <ToggleCard key={item.key} title={item.title} description={item.description} active={!!draft[item.key]} onClick={() => setDraft(item.key, draft[item.key] ? 0 : 1)} />
              ))}
            </div>
            {draft.team_enabled ? (
              <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                <Field label="Tamano equipo"><input type="number" min="1" max="8" style={inputStyle()} value={draft.team_size} onChange={(e) => setDraft('team_size', e.target.value)} /></Field>
                <Field label="Regla equipos">
                  <select style={inputStyle()} value={draft.team_membership_rule} onChange={(e) => setDraft('team_membership_rule', e.target.value)}>
                    <option value="free">Libre</option>
                    <option value="same_category">Misma categoria</option>
                  </select>
                </Field>
                <Field label="Scoring"><select style={inputStyle()} value={draft.scoring_mode} onChange={(e) => setDraft('scoring_mode', e.target.value)}><option value="higher_wins">Mayor gana</option><option value="lower_wins">Menor gana</option></select></Field>
                <Field label="Unidad RM"><select style={inputStyle()} value={draft.rm_unit} onChange={(e) => setDraft('rm_unit', e.target.value)}><option value="kg">kg</option><option value="lb">lb</option></select></Field>
              </div>
            ) : (
              <>
                <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 12, color: colors.secondary, fontSize: 13 }}>
                  La competencia esta configurada como individual. Las opciones de equipos se ocultan hasta activar "Competencia por equipos".
                </div>
                <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  <Field label="Scoring"><select style={inputStyle()} value={draft.scoring_mode} onChange={(e) => setDraft('scoring_mode', e.target.value)}><option value="higher_wins">Mayor gana</option><option value="lower_wins">Menor gana</option></select></Field>
                  <Field label="Unidad RM"><select style={inputStyle()} value={draft.rm_unit} onChange={(e) => setDraft('rm_unit', e.target.value)}><option value="kg">kg</option><option value="lb">lb</option></select></Field>
                </div>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button tone="primary" onClick={save} disabled={busy} primaryAction><Save size={16} />Guardar datos base</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      {assetModal ? (
        <Modal title={`Cambiar ${assetModal.label.toLowerCase()}`} onClose={() => setAssetModal(null)}>
          <div style={{ display: 'grid', gap: 12 }}>
            {assetModal.url ? <img src={assetModal.url} alt={assetModal.label} style={{ width: '100%', maxHeight: 360, objectFit: 'cover', borderRadius: 8, border: `1px solid ${colors.border}` }} /> : null}
            <Field label="Archivo de imagen">
              <input type="file" accept="image/*" style={inputStyle()} disabled={assetBusy === assetModal.type} onChange={(e) => uploadAsset(assetModal.type, e.target.files?.[0])} />
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              {assetModal.url ? <Button tone="danger" onClick={() => deleteAsset(assetModal.type)} disabled={assetBusy === assetModal.type}>Eliminar imagen</Button> : null}
              <Button onClick={() => setAssetModal(null)}>Cerrar</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      <Panel
        title="Datos principales"
        subtitle="Esta informacion alimenta la landing, registro y operacion."
        action={<Button tone="primary" onClick={() => setEditOpen(true)} primaryAction>Editar datos</Button>}
      >
        <div className="fr-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
          <MiniStat label="Descripcion guardada" value={competition.descripcion ? 'Si' : 'No'} tone={competition.descripcion ? colors.success : colors.warning} />
          <MiniStat label="Sitio web guardado" value={competition.website_url ? 'Si' : 'No'} tone={competition.website_url ? colors.success : colors.warning} />
          <MiniStat label="Contacto" value={competition.contact_phone ? 'Si' : 'No'} tone={competition.contact_phone ? colors.success : colors.warning} />
          <MiniStat label="Timezone" value={competition.timezone || 'America/Bogota'} tone={colors.accent} />
        </div>
        <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
          {details.map(([label, value]) => {
            const pending = value === 'Pendiente'
            return (
              <div key={label} style={{ border: `1px solid ${pending ? colors.warning : colors.border}`, background: pending ? 'rgba(245,158,11,0.10)' : colors.top, borderRadius: 8, padding: 11, minWidth: 0 }}>
                <div style={{ color: pending ? '#FBBF24' : colors.muted, fontSize: 11, fontWeight: 900 }}>{label}</div>
                <div style={{ color: colors.text, fontSize: 13, fontWeight: 850, marginTop: 6, overflowWrap: 'anywhere', lineHeight: 1.35 }}>{value}</div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {longDetails.map(([label, value]) => {
            const hasValue = !!String(value || '').trim()
            return (
              <div key={label} style={{ border: `1px solid ${hasValue ? colors.border : colors.warning}`, background: hasValue ? colors.top : 'rgba(245,158,11,0.10)', borderRadius: 8, padding: 12 }}>
                <div style={{ color: hasValue ? colors.secondary : '#FBBF24', fontSize: 12, fontWeight: 900 }}>{label}</div>
                <div style={{ color: hasValue ? colors.text : colors.warning, marginTop: 6, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {hasValue ? value : 'Pendiente'}
                </div>
              </div>
            )
          })}
        </div>
        {pendingItems.length ? (
          <div style={{ border: `1px solid ${colors.warning}`, background: 'rgba(245,158,11,0.10)', borderRadius: 8, padding: 12 }}>
            <div style={{ color: '#FBBF24', fontSize: 12, fontWeight: 950 }}>Pendiente por completar</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {pendingItems.map((item) => <Pill key={item} tone={colors.warning}>{item}</Pill>)}
            </div>
          </div>
        ) : (
          <div style={{ border: `1px solid ${colors.success}`, background: 'rgba(34,197,94,0.10)', borderRadius: 8, padding: 12, color: colors.text, fontWeight: 850 }}>
            Datos principales completos
          </div>
        )}
        <div className="fr-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
          <MiniStat label="Modalidad individual" value={competition.individual_enabled ? 'Activa' : 'Inactiva'} tone={competition.individual_enabled ? colors.accent : colors.muted} />
          <MiniStat label="Equipos" value={competition.team_enabled ? 'Activos' : 'Inactivos'} tone={competition.team_enabled ? colors.accent : colors.muted} />
          <MiniStat label="Roster publico" value={competition.show_public_category_roster ? 'Activo' : 'Inactivo'} tone={competition.show_public_category_roster ? colors.accent : colors.muted} />
          <MiniStat label="Resultados atleta" value={competition.allow_user_results ? 'Activo' : 'Inactivo'} tone={competition.allow_user_results ? colors.accent : colors.muted} />
        </div>
      </Panel>

      <Panel title="Imagenes" subtitle="El backend soporta imagen de perfil y banner. Si ya existen, se ven aqui.">
        <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {[
            ['profile', 'Imagen perfil', profileUrl, 'Cuadrada para tarjetas y encabezados.'],
            ['banner', 'Banner', bannerUrl, 'Imagen ancha para landing y portada.'],
          ].map(([type, label, url, help]) => (
            <div key={type} style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{label}</div>
                  <div style={{ color: colors.secondary, fontSize: 12, marginTop: 3 }}>{help}</div>
                </div>
                <Pill tone={url ? colors.success : colors.warning}>{url ? 'Cargada' : 'Pendiente'}</Pill>
              </div>
              {url ? (
                <img src={url} alt={label} style={{ width: '100%', aspectRatio: type === 'profile' ? '1 / 1' : '16 / 7', objectFit: 'cover', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg }} />
              ) : (
                <div style={{ width: '100%', aspectRatio: type === 'profile' ? '1 / 1' : '16 / 7', borderRadius: 8, border: `1px dashed ${colors.border}`, display: 'grid', placeItems: 'center', color: colors.muted, background: colors.bg }}>
                  Sin imagen
                </div>
              )}
              <Button onClick={() => setAssetModal({ type, label, url })}>{url ? 'Cambiar imagen' : 'Subir imagen'}</Button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function CategoryEditor({ bundle, reload, notify }) {
  const competition = bundle.competition
  const [draft, setDraft] = useState({ nombre: '', descripcion: '', modality: 'individual', enrollment_price: 0, max_capacity: '', registration_enabled: 1 })
  const [editingId, setEditingId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const startEdit = (category) => {
    setEditingId(category.id)
    setDraft({
      nombre: category.nombre || '',
      descripcion: category.descripcion || '',
      modality: category.modality || 'individual',
      enrollment_price: category.enrollment_price || 0,
      max_capacity: category.max_capacity || '',
      registration_enabled: category.registration_enabled ? 1 : 0,
    })
    setModalOpen(true)
  }

  const reset = () => {
    setEditingId(null)
    setDraft({ nombre: '', descripcion: '', modality: 'individual', enrollment_price: 0, max_capacity: '', registration_enabled: 1 })
    setModalOpen(false)
  }

  const save = async () => {
    if (!draft.nombre.trim()) return notify('Nombre de categoria requerido', 'error')
    setBusy(true)
    try {
      const body = {
        ...draft,
        enrollment_price: Number(draft.enrollment_price || 0),
        max_capacity: draft.max_capacity === '' ? null : Number(draft.max_capacity),
        registration_enabled: draft.registration_enabled ? 1 : 0,
      }
      if (editingId) {
        await api(`/competitions/${competition.id}/categories/${editingId}`, { method: 'PUT', body: JSON.stringify(body) })
      } else {
        await api(`/competitions/${competition.id}/categories`, { method: 'POST', body: JSON.stringify(body) })
      }
      notify('Categoria guardada')
      reset()
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (category) => {
    if (!window.confirm(`Eliminar categoria ${category.nombre}?`)) return
    try {
      await api(`/competitions/${competition.id}/categories/${category.id}`, { method: 'DELETE' })
      notify('Categoria eliminada')
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }

  return (
    <Panel title="Categorias y precios" subtitle="Cupos, modalidad y valor de inscripcion por categoria." action={<Button tone="primary" onClick={() => { reset(); setModalOpen(true) }} primaryAction><Plus size={16} />Crear categoria</Button>}>
      {modalOpen ? (
        <Modal title={editingId ? 'Editar categoria' : 'Crear categoria'} onClose={reset}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <Field label="Nombre"><input style={inputStyle()} value={draft.nombre} onChange={(e) => setDraft((p) => ({ ...p, nombre: e.target.value }))} /></Field>
              <Field label="Descripcion"><input style={inputStyle()} value={draft.descripcion} onChange={(e) => setDraft((p) => ({ ...p, descripcion: e.target.value }))} /></Field>
              <Field label="Modalidad"><select style={inputStyle()} value={draft.modality} onChange={(e) => setDraft((p) => ({ ...p, modality: e.target.value }))}><option value="individual">Individual</option><option value="teams">Equipos</option></select></Field>
              <Field label="Precio"><input type="number" style={inputStyle()} value={draft.enrollment_price} onChange={(e) => setDraft((p) => ({ ...p, enrollment_price: e.target.value }))} /></Field>
              <Field label="Cupo"><input type="number" style={inputStyle()} value={draft.max_capacity} onChange={(e) => setDraft((p) => ({ ...p, max_capacity: e.target.value }))} /></Field>
              <Field label="Registro"><select style={inputStyle()} value={draft.registration_enabled} onChange={(e) => setDraft((p) => ({ ...p, registration_enabled: Number(e.target.value) }))}><option value={1}>Abierto</option><option value={0}>Cerrado</option></select></Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={reset}>Cancelar</Button>
              <Button tone="primary" onClick={save} disabled={busy}><Save size={16} />{editingId ? 'Guardar cambios' : 'Crear categoria'}</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      <div style={{ display: 'grid', gap: 8 }}>
        {(bundle.categories || []).map((category) => (
          <div key={category.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 10, alignItems: 'center', border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.top, padding: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900 }}>{category.nombre} <span style={{ color: colors.secondary, fontSize: 12 }}>({category.modality || 'individual'})</span></div>
              <div style={{ color: colors.secondary, fontSize: 12 }}>{formatMoney(category.enrollment_price)} - {formatCategoryCapacity(category)} - {category.registration_enabled ? 'registro activo' : 'registro cerrado'}</div>
            </div>
            <Button onClick={() => startEdit(category)}>Editar</Button>
            <Button tone="danger" onClick={() => remove(category)}><Trash2 size={15} /></Button>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function ParticipantsPanel({ bundle, reload, notify }) {
  const competition = bundle.competition
  const [filter, setFilter] = useState('')
  const [replacement, setReplacement] = useState({ participant: null, email: '' })
  const [categoryEdit, setCategoryEdit] = useState({ participant: null, categoria: '' })
  const participants = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (bundle.participants || []).filter((item) => {
      if (!q) return true
      return `${item.nombre || ''} ${item.apellido || ''} ${item.email || ''} ${item.categoria_competencia || ''}`.toLowerCase().includes(q)
    })
  }, [bundle.participants, filter])

  const updateCategory = async () => {
    if (!categoryEdit.participant) return
    try {
      await api(`/competitions/${competition.id}/users/${categoryEdit.participant.user_id ?? categoryEdit.participant.id}/categoria`, { method: 'PATCH', body: JSON.stringify({ categoria: categoryEdit.categoria }) })
      notify('Categoria actualizada')
      setCategoryEdit({ participant: null, categoria: '' })
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }

  const remove = async (participant) => {
    if (!window.confirm(`Eliminar inscripcion de ${participant.nombre} ${participant.apellido}?`)) return
    try {
      await api(`/competitions/${competition.id}/users/${participant.user_id ?? participant.id}`, { method: 'DELETE' })
      notify('Inscripcion eliminada')
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }

  const replace = async () => {
    if (!replacement.participant || !replacement.email.trim()) return
    try {
      await api(`/competitions/${competition.id}/users/${replacement.participant.user_id ?? replacement.participant.id}/replace`, { method: 'POST', body: JSON.stringify({ email: replacement.email.trim() }) })
      notify('Participante reemplazado')
      setReplacement({ participant: null, email: '' })
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }

  const exportXlsx = async () => {
    try {
      const blob = await api(`/competitions/${competition.id}/participants/export.xlsx`)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${competition.nombre || 'competencia'}-inscritos.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      notify(error.message, 'error')
    }
  }

  return (
    <Panel title="Inscritos" subtitle="Listado operativo, cambio de categoria, reemplazo y exporte." action={<Button onClick={exportXlsx}><Download size={16} />Exportar</Button>}>
      {categoryEdit.participant ? (
        <Modal title="Cambiar categoria" onClose={() => setCategoryEdit({ participant: null, categoria: '' })}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ color: colors.secondary }}>Inscrito: <strong style={{ color: colors.text }}>{categoryEdit.participant.nombre} {categoryEdit.participant.apellido}</strong></div>
            <Field label="Categoria">
              <select style={inputStyle()} value={categoryEdit.categoria} onChange={(e) => setCategoryEdit((p) => ({ ...p, categoria: e.target.value }))}>
                <option value="">Sin categoria</option>
                {(bundle.categories || []).map((cat) => <option key={cat.id} value={cat.nombre}>{cat.nombre}</option>)}
              </select>
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => setCategoryEdit({ participant: null, categoria: '' })}>Cancelar</Button>
              <Button tone="primary" onClick={updateCategory}>Guardar categoria</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      {replacement.participant ? (
        <Modal title={`Reemplazar a ${replacement.participant.nombre} ${replacement.participant.apellido}`} onClose={() => setReplacement({ participant: null, email: '' })}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Email del nuevo participante">
              <input style={inputStyle()} value={replacement.email} onChange={(e) => setReplacement((p) => ({ ...p, email: e.target.value }))} />
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => setReplacement({ participant: null, email: '' })}>Cancelar</Button>
              <Button tone="primary" onClick={replace}>Confirmar reemplazo</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      <input style={inputStyle()} placeholder="Buscar inscrito" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="fr-mobile-table-wrap" style={{ overflowX: 'auto' }}>
        <table className="fr-mobile-card-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead><tr>{['Participante', 'Categoria', 'Estado', 'Pago', 'Acciones'].map((h) => <th key={h} style={{ textAlign: 'left', color: colors.secondary, fontSize: 12, padding: 9, borderBottom: `1px solid ${colors.border}` }}>{h}</th>)}</tr></thead>
          <tbody>
            {participants.map((p) => (
              <tr key={`${p.user_id || p.id}-${p.email}`} style={{ borderBottom: `1px solid ${colors.border}` }}>
                <td data-label="Participante" style={{ padding: 9 }}><strong>{p.apellido}, {p.nombre}</strong><div style={{ color: colors.secondary, fontSize: 12 }}>{p.email || p.cedula}</div></td>
                <td data-label="Categoria" style={{ padding: 9 }}>{p.categoria_competencia || 'Sin categoria'}</td>
                <td data-label="Estado" style={{ padding: 9 }}>{p.estado || '-'}</td>
                <td data-label="Pago" style={{ padding: 9 }}>{p.payment_status || p.payment_reference || '-'}</td>
                <td data-label="Acciones" style={{ padding: 9 }}>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <Button onClick={() => setReplacement({ participant: p, email: '' })}>Reemplazar</Button>
                    <Button onClick={() => setCategoryEdit({ participant: p, categoria: p.categoria_competencia || '' })}>Categoria</Button>
                    <Button tone="danger" onClick={() => remove(p)}>Eliminar</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function DiscountsPanel({ bundle, reload, notify }) {
  const competition = bundle.competition
  const [draft, setDraft] = useState({ code: '', description: '', discount_type: 'percentage', discount_value: 10, max_uses: '', max_uses_per_user: 1, applies_to_category_id: '' })
  const [modalOpen, setModalOpen] = useState(false)
  const create = async () => {
    try {
      await api(`/competitions/${competition.id}/discounts`, {
        method: 'POST',
        body: JSON.stringify({
          ...draft,
          code: draft.code.trim().toUpperCase(),
          discount_value: Number(draft.discount_value),
          max_uses: draft.max_uses === '' ? null : Number(draft.max_uses),
          max_uses_per_user: Number(draft.max_uses_per_user || 1),
          applies_to_category_id: draft.applies_to_category_id ? Number(draft.applies_to_category_id) : null,
        }),
      })
      notify('Descuento creado')
      setDraft({ code: '', description: '', discount_type: 'percentage', discount_value: 10, max_uses: '', max_uses_per_user: 1, applies_to_category_id: '' })
      setModalOpen(false)
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const toggle = async (discount) => {
    try {
      await api(`/competitions/${competition.id}/discounts/${discount.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: discount.is_active ? 0 : 1 }) })
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const remove = async (discount) => {
    if (!window.confirm(`Eliminar codigo ${discount.code}?`)) return
    try {
      await api(`/competitions/${competition.id}/discounts/${discount.id}`, { method: 'DELETE' })
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  return (
    <Panel title="Descuentos" subtitle="Codigos reales para checkout." action={<Button tone="primary" onClick={() => setModalOpen(true)}><Plus size={16} />Crear codigo</Button>}>
      {modalOpen ? (
        <Modal title="Crear codigo de descuento" onClose={() => setModalOpen(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <Field label="Codigo"><input style={inputStyle()} value={draft.code} onChange={(e) => setDraft((p) => ({ ...p, code: e.target.value }))} /></Field>
              <Field label="Descripcion"><input style={inputStyle()} value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} /></Field>
              <Field label="Tipo"><select style={inputStyle()} value={draft.discount_type} onChange={(e) => setDraft((p) => ({ ...p, discount_type: e.target.value }))}><option value="percentage">Porcentaje</option><option value="fixed">Fijo</option></select></Field>
              <Field label="Valor"><input type="number" style={inputStyle()} value={draft.discount_value} onChange={(e) => setDraft((p) => ({ ...p, discount_value: e.target.value }))} /></Field>
              <Field label="Usos max"><input type="number" style={inputStyle()} value={draft.max_uses} onChange={(e) => setDraft((p) => ({ ...p, max_uses: e.target.value }))} /></Field>
              <Field label="Categoria"><select style={inputStyle()} value={draft.applies_to_category_id} onChange={(e) => setDraft((p) => ({ ...p, applies_to_category_id: e.target.value }))}><option value="">Todas</option>{(bundle.categories || []).map((cat) => <option key={cat.id} value={cat.id}>{cat.nombre}</option>)}</select></Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button tone="primary" onClick={create}>Crear codigo</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      <div style={{ display: 'grid', gap: 8 }}>
        {(bundle.discounts || []).map((discount) => (
          <div key={discount.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 10 }}>
            <div><strong>{discount.code}</strong><div style={{ color: colors.secondary, fontSize: 12 }}>{discount.discount_type} {discount.discount_value} - usos {discount.uses_count || 0}/{discount.max_uses || 'sin limite'}</div></div>
            <Button onClick={() => toggle(discount)}>{discount.is_active ? 'Desactivar' : 'Activar'}</Button>
            <Button tone="danger" onClick={() => remove(discount)}>Eliminar</Button>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function InvitationsPanel({ bundle, reload, notify }) {
  const competition = bundle.competition
  const [draft, setDraft] = useState({ invited_email: '', categoria: '', note: '' })
  const [modalOpen, setModalOpen] = useState(false)
  const toggleEnabled = async () => {
    try {
      await api(`/competitions/${competition.id}/invitations/enable`, { method: competition.invitations_enabled ? 'DELETE' : 'POST' })
      notify(competition.invitations_enabled ? 'Invitaciones deshabilitadas' : 'Invitaciones habilitadas')
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const invite = async () => {
    try {
      await api(`/competitions/${competition.id}/competitor-invitations`, { method: 'POST', body: JSON.stringify(draft) })
      notify('Invitacion enviada')
      setDraft({ invited_email: '', categoria: '', note: '' })
      setModalOpen(false)
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const revoke = async (invitation) => {
    try {
      await api(`/competitions/${competition.id}/competitor-invitations/${invitation.id}`, { method: 'DELETE' })
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  return (
    <Panel title="Invitaciones" subtitle="Invita competidores por correo." action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Button onClick={toggleEnabled}>{competition.invitations_enabled ? 'Deshabilitar' : 'Habilitar'}</Button><Button tone="primary" onClick={() => setModalOpen(true)} disabled={!competition.invitations_enabled}>Invitar</Button></div>}>
      {modalOpen ? (
        <Modal title="Invitar competidor" onClose={() => setModalOpen(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Email"><input style={inputStyle()} value={draft.invited_email} onChange={(e) => setDraft((p) => ({ ...p, invited_email: e.target.value }))} /></Field>
            <Field label="Categoria"><select style={inputStyle()} value={draft.categoria} onChange={(e) => setDraft((p) => ({ ...p, categoria: e.target.value }))}><option value="">Sin categoria</option>{(bundle.categories || []).map((cat) => <option key={cat.id} value={cat.nombre}>{cat.nombre}</option>)}</select></Field>
            <Field label="Nota"><input style={inputStyle()} value={draft.note} onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))} /></Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button tone="primary" onClick={invite}>Enviar invitacion</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      {(bundle.invitations || []).map((item) => (
        <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 10 }}>
          <div><strong>{item.invited_email}</strong><div style={{ color: colors.secondary, fontSize: 12 }}>{item.categoria || 'Sin categoria'} - {item.status}</div></div>
          <Pill tone={item.status === 'accepted' ? colors.success : item.status === 'revoked' ? colors.error : colors.warning}>{item.status}</Pill>
          <Button tone="danger" onClick={() => revoke(item)} disabled={item.status === 'accepted'}>Revocar</Button>
        </div>
      ))}
    </Panel>
  )
}

function RegistrationPanel({ bundle, reload, notify }) {
  const competition = bundle.competition
  const [section, setSection] = useState('status')
  const [analyticsField, setAnalyticsField] = useState('box')
  const confirmedParticipantRows = (bundle.participants || []).filter((p) => p.estado === 'confirmado')
  const confirmedParticipants = confirmedParticipantRows.length
  const pendingParticipants = (bundle.participants || []).filter((p) => p.estado && p.estado !== 'confirmado').length
  const totalCapacity = (bundle.categories || []).reduce((sum, category) => sum + Number(category.max_capacity || 0), 0)
  const availableCapacity = (bundle.categories || []).reduce((sum, category) => {
    const capacity = Number(category.max_capacity || 0)
    if (!capacity) return sum
    return sum + Math.max(0, capacity - Number(category.reserved_count || category.registered_count || 0))
  }, 0)
  const activeCategories = (bundle.categories || []).filter((category) => category.registration_enabled).length
  const analyticsFields = [
    { key: 'box', label: 'Box' },
    { key: 'categoria_competencia', label: 'Categoria' },
    { key: 'ciudad_pais', label: 'Pais / Ciudad' },
    { key: 'sexo', label: 'Sexo' },
  ]
  const selectedAnalyticsField = analyticsFields.find((field) => field.key === analyticsField) || analyticsFields[0]
  const analyticsCounts = confirmedParticipantRows.reduce((counts, participant) => {
    const raw = participant[analyticsField]
    const key = raw && String(raw).trim() ? String(raw).trim() : '__empty__'
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})
  const analyticsRows = Object.entries(analyticsCounts)
    .map(([key, count]) => ({
      label: key === '__empty__' ? `Sin ${selectedAnalyticsField.label.toLowerCase()}` : key,
      count,
      empty: key === '__empty__',
    }))
    .sort((a, b) => {
      if (a.empty && !b.empty) return 1
      if (!a.empty && b.empty) return -1
      return b.count - a.count
    })
  const toggle = async (payload, message) => {
    try {
      await api(`/competitions/${competition.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      notify(message)
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const modules = [
    { id: 'status', label: 'Estado', icon: CheckCircle2 },
    { id: 'categories', label: 'Categorias', icon: Settings2, count: (bundle.categories || []).length },
    { id: 'participants', label: 'Inscritos', icon: Users, count: (bundle.participants || []).filter((p) => p.estado === 'confirmado').length },
    { id: 'analytics', label: 'Estadisticas', icon: BarChart3, count: confirmedParticipants },
    { id: 'discounts', label: 'Descuentos', icon: Ticket, count: (bundle.discounts || []).length },
    { id: 'invitations', label: 'Invitaciones', icon: Megaphone, count: (bundle.invitations || []).length },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <ModuleTabs items={modules} active={section} onChange={setSection} />
      {section === 'status' && (
      <Panel title="Estado de registro" subtitle="Publicacion e inscripciones." action={<Button tone="primary" primaryAction onClick={() => toggle({ enrollment_open: competition.enrollment_open ? 0 : 1 }, competition.enrollment_open ? 'Inscripciones cerradas' : 'Inscripciones abiertas')} disabled={!competition.activa}>{competition.enrollment_open ? 'Cerrar inscripciones' : 'Abrir inscripciones'}</Button>}>
        <div className="fr-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
          <MiniStat label="Publicada" value={competition.activa ? 'Si' : 'No'} tone={competition.activa ? colors.success : colors.warning} />
          <MiniStat label="Inscripciones" value={competition.enrollment_open ? 'Abiertas' : 'Cerradas'} tone={competition.enrollment_open ? colors.accent : colors.muted} />
          <MiniStat label="Inscritos" value={confirmedParticipants} />
          <MiniStat label="Categorias" value={(bundle.categories || []).length} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button onClick={() => toggle({ activa: competition.activa ? 0 : 1, ...(competition.activa ? { enrollment_open: 0 } : {}) }, competition.activa ? 'Competencia despublicada' : 'Competencia publicada')}>{competition.activa ? 'Despublicar' : 'Publicar'}</Button>
          <Button onClick={() => toggle({ allow_free_categories: competition.allow_free_categories ? 0 : 1 }, competition.allow_free_categories ? 'Gratuitas bloqueadas' : 'Gratuitas habilitadas')}>{competition.allow_free_categories ? 'Bloquear gratis' : 'Permitir gratis'}</Button>
          <Button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/competitions/${competition.slug || competition.id}`)}>Copiar link publico</Button>
          <Link to={`/competitions/${competition.slug || competition.id}`} target="_blank" style={{ textDecoration: 'none' }}><Button><Eye size={16} />Vista publica</Button></Link>
        </div>
      </Panel>
      )}
      {section === 'categories' && <CategoryEditor bundle={bundle} reload={reload} notify={notify} />}
      {section === 'participants' && <ParticipantsPanel bundle={bundle} reload={reload} notify={notify} />}
      {section === 'analytics' && (
        <Panel title="Estadisticas de inscritos" subtitle="Distribucion porcentual de atletas confirmados.">
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="fr-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
              <MiniStat label="Confirmados" value={confirmedParticipants} tone={colors.accent} />
              <MiniStat label="Pendientes" value={pendingParticipants} tone={pendingParticipants ? colors.warning : colors.muted} />
              <MiniStat label="Categorias abiertas" value={`${activeCategories}/${(bundle.categories || []).length}`} tone={colors.success} />
              <MiniStat label="Cupos disponibles" value={totalCapacity ? availableCapacity : 'Sin limite'} tone={totalCapacity ? colors.primary : colors.muted} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: colors.secondary, fontWeight: 800 }}>Ver por</span>
              {analyticsFields.map((field) => {
                const active = analyticsField === field.key
                return (
                  <button
                    key={field.key}
                    type="button"
                    onClick={() => setAnalyticsField(field.key)}
                    style={{
                      fontSize: 12,
                      padding: '6px 12px',
                      borderRadius: 999,
                      border: `1px solid ${active ? 'rgba(0,194,168,0.55)' : colors.border}`,
                      background: active ? 'rgba(0,194,168,0.12)' : colors.top,
                      color: active ? colors.accent : colors.secondary,
                      cursor: 'pointer',
                      fontWeight: active ? 800 : 600,
                    }}
                  >
                    {field.label}
                  </button>
                )
              })}
            </div>
            <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden', background: colors.top }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 72px 72px', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${colors.border}`, background: colors.top }}>
                <span style={{ fontSize: 11, color: colors.secondary, fontWeight: 800, textTransform: 'uppercase' }}>{selectedAnalyticsField.label}</span>
                <span style={{ fontSize: 11, color: colors.secondary, fontWeight: 800, textAlign: 'right', textTransform: 'uppercase' }}>Cant.</span>
                <span style={{ fontSize: 11, color: colors.secondary, fontWeight: 800, textAlign: 'right', textTransform: 'uppercase' }}>%</span>
              </div>
              {analyticsRows.length === 0 ? (
                <div style={{ padding: 22, color: colors.secondary, fontSize: 13, textAlign: 'center' }}>Sin inscritos confirmados</div>
              ) : analyticsRows.map((row, index) => {
                const pct = confirmedParticipants > 0 ? Math.round((row.count / confirmedParticipants) * 100) : 0
                return (
                  <div
                    key={row.label}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) 72px 72px',
                      gap: 8,
                      alignItems: 'center',
                      padding: '11px 14px',
                      borderBottom: index < analyticsRows.length - 1 ? '1px solid rgba(37,42,51,0.78)' : 'none',
                      background: index % 2 === 0 ? 'rgba(13,15,18,0.72)' : 'rgba(23,27,33,0.78)',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ position: 'absolute', inset: 0, right: 'auto', width: `${pct}%`, background: 'linear-gradient(90deg, rgba(0,194,168,0.16), rgba(255,107,0,0.05))', pointerEvents: 'none' }} />
                    <span style={{ color: row.empty ? colors.secondary : colors.text, fontSize: 13, fontStyle: row.empty ? 'italic' : 'normal', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', position: 'relative' }}>{row.label}</span>
                    <span style={{ color: colors.text, fontSize: 13, fontWeight: 800, textAlign: 'right', position: 'relative' }}>{row.count}</span>
                    <span style={{ color: colors.secondary, fontSize: 12, textAlign: 'right', position: 'relative' }}>{pct}%</span>
                  </div>
                )
              })}
              {confirmedParticipants > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 72px 72px', gap: 8, padding: '10px 14px', borderTop: `1px solid ${colors.border}`, background: colors.top }}>
                  <span style={{ color: colors.secondary, fontSize: 12, fontWeight: 800 }}>Total</span>
                  <span style={{ color: colors.accent, fontSize: 12, fontWeight: 800, textAlign: 'right' }}>{confirmedParticipants}</span>
                  <span style={{ color: colors.secondary, fontSize: 12, textAlign: 'right' }}>100%</span>
                </div>
              ) : null}
            </div>
          </div>
        </Panel>
      )}
      {section === 'discounts' && <DiscountsPanel bundle={bundle} reload={reload} notify={notify} />}
      {section === 'invitations' && <InvitationsPanel bundle={bundle} reload={reload} notify={notify} />}
    </div>
  )
}

function PhasesPanel({ bundle, reload, notify }) {
  const competition = bundle.competition
  const descriptionRef = useRef(null)
  const emptyDraft = {
    nombre: '',
    descripcion: '',
    modality: 'individual',
    measurement_method: 'amrap',
    workout_format: 'amrap',
    winner_rule: 'higher_wins',
    team_result_mode: 'single_member',
    tie_break_enabled: 0,
    tie_break_method: 'for_time',
    time_cap_seconds: '',
    is_visible: 1,
  }
  const measurementOptions = [
    { value: 'amrap', label: 'Repeticiones', winner: 'higher_wins', workout: 'amrap' },
    { value: 'for_time', label: 'Tiempo / For time', winner: 'lower_wins', workout: 'for_time' },
    { value: 'rm', label: 'Peso / RM', winner: 'higher_wins', workout: 'max_weight' },
    { value: 'metros', label: 'Metros', winner: 'higher_wins', workout: 'other' },
  ]
  const workoutFormatOptions = [
    { value: 'for_time', label: 'For time' },
    { value: 'amrap', label: 'AMRAP' },
    { value: 'emom', label: 'EMOM' },
    { value: 'max_weight', label: 'Max weight / RM' },
    { value: 'chipper', label: 'Chipper' },
    { value: 'other', label: 'Otro' },
  ]
  const labelFor = (items, value, fallback = 'Sin definir') => items.find((item) => item.value === value)?.label || fallback
  const phaseStatusLabel = (value) => {
    if (value === 'finalizada') return 'Finalizada'
    if (value === 'en_progreso') return 'En progreso'
    return 'Pendiente'
  }
  const [draft, setDraft] = useState(emptyDraft)
  const [editingId, setEditingId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const reset = () => {
    setEditingId(null)
    setDraft(emptyDraft)
    setModalOpen(false)
  }
  const startEdit = (phase) => {
    const method = phase.measurement_method || 'amrap'
    setEditingId(phase.id)
    setDraft({
      nombre: phase.nombre || '',
      descripcion: phase.descripcion || '',
      modality: phase.modality || 'individual',
      measurement_method: method,
      workout_format: phase.workout_format || measurementOptions.find((item) => item.value === method)?.workout || 'other',
      winner_rule: phase.winner_rule || measurementOptions.find((item) => item.value === method)?.winner || 'higher_wins',
      team_result_mode: phase.team_result_mode || 'single_member',
      tie_break_enabled: phase.tie_break_enabled ? 1 : 0,
      tie_break_method: phase.tie_break_method || 'for_time',
      time_cap_seconds: phase.time_cap_seconds ? formatSeconds(phase.time_cap_seconds) : '',
      is_visible: phase.is_visible ? 1 : 0,
    })
    setModalOpen(true)
  }
  const save = async () => {
    if (!draft.nombre.trim()) return notify('Nombre de fase requerido', 'error')
    const selectedMeasurement = measurementOptions.find((item) => item.value === draft.measurement_method)
    const draftIsTime = ['for_time', 'tiempo_hms', 'tiempo'].includes(String(draft.measurement_method || draft.workout_format || '').trim().toLowerCase())
    const parsedCap = draftIsTime && String(draft.time_cap_seconds || '').trim() ? parseTimeCapInput(draft.time_cap_seconds) : null
    if (draftIsTime && !String(draft.time_cap_seconds || '').trim()) return notify('Time cap requerido para WODs for time', 'error')
    if (draftIsTime && String(draft.time_cap_seconds || '').trim() && parsedCap === null) return notify('Time cap invalido. Usa minutos, MM:SS o HH:MM:SS', 'error')
    const payload = {
      ...draft,
      tipo: draft.measurement_method === 'for_time' ? 'tiempo' : 'cantidad',
      workout_format: draft.workout_format || selectedMeasurement?.workout || 'other',
      winner_rule: draft.winner_rule || selectedMeasurement?.winner || 'higher_wins',
      points_mode: 'manual',
      team_result_mode: draft.modality === 'teams' ? draft.team_result_mode : 'single_member',
      tie_break_enabled: Number(draft.tie_break_enabled || 0) ? 1 : 0,
      time_cap_seconds: draftIsTime ? parsedCap : null,
      orden: editingId ? undefined : (bundle.phases || []).length + 1,
    }
    try {
      if (editingId) await api(`/competitions/${competition.id}/phases/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) })
      else await api(`/competitions/${competition.id}/phases`, { method: 'POST', body: JSON.stringify(payload) })
      notify('Fase guardada')
      reset()
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const setMeasurement = (value) => {
    const selected = measurementOptions.find((item) => item.value === value)
    setDraft((prev) => ({
      ...prev,
      measurement_method: value,
      workout_format: selected?.workout || prev.workout_format,
      winner_rule: selected?.winner || prev.winner_rule,
      time_cap_seconds: value === 'for_time' ? prev.time_cap_seconds : '',
    }))
  }
  const insertDescriptionText = (before, after = '') => {
    const input = descriptionRef.current
    if (!input) return setDraft((prev) => ({ ...prev, descripcion: `${prev.descripcion}${before}${after}` }))
    const start = input.selectionStart || 0
    const end = input.selectionEnd || 0
    const selected = draft.descripcion.slice(start, end)
    const next = `${draft.descripcion.slice(0, start)}${before}${selected || ''}${after}${draft.descripcion.slice(end)}`
    setDraft((prev) => ({ ...prev, descripcion: next }))
    window.setTimeout(() => {
      input.focus()
      const cursor = selected ? start + before.length + selected.length + after.length : start + before.length
      input.setSelectionRange(cursor, cursor)
    }, 0)
  }
  const renderDescription = (value) => String(value || '').split(/(\*\*[^*]+\*\*)/g).map((part, index) => (
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part
  ))
  const remove = async (phase) => {
    if (!window.confirm(`Eliminar fase ${phase.nombre}?`)) return
    try {
      await api(`/competitions/${competition.id}/phases/${phase.id}`, { method: 'DELETE' })
      notify('Fase eliminada')
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const orderedPhases = [...(bundle.phases || [])].sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0) || Number(a.id || 0) - Number(b.id || 0))
  const movePhase = async (phase, direction) => {
    const index = orderedPhases.findIndex((item) => String(item.id) === String(phase.id))
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= orderedPhases.length) return
    const nextOrder = [...orderedPhases]
    const [item] = nextOrder.splice(index, 1)
    nextOrder.splice(targetIndex, 0, item)
    try {
      await Promise.all(nextOrder.map((item, orderIndex) => (
        api(`/competitions/${competition.id}/phases/${item.id}`, {
          method: 'PUT',
          body: JSON.stringify({ orden: orderIndex + 1 }),
        })
      )))
      notify('Orden actualizado')
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  return (
    <Panel title="Fases y workouts" subtitle="Crea los eventos deportivos que alimentan resultados y heats." action={<Button tone="primary" onClick={() => { reset(); setModalOpen(true) }}><Plus size={16} />Crear fase</Button>}>
      {modalOpen ? (
        <Modal title={editingId ? 'Editar fase' : 'Crear fase'} onClose={reset}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <Field label="Nombre"><input style={inputStyle()} value={draft.nombre} onChange={(e) => setDraft((p) => ({ ...p, nombre: e.target.value }))} /></Field>
              <Field label="Modalidad"><select style={inputStyle()} value={draft.modality} onChange={(e) => setDraft((p) => ({ ...p, modality: e.target.value }))}><option value="individual">Individual</option><option value="teams">Equipos</option></select></Field>
              <div style={{ gridColumn: '1 / -1', border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 10, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: colors.secondary, fontSize: 12, fontWeight: 850 }}>Descripcion</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Button onClick={() => insertDescriptionText('**', '**')}>Negrilla</Button>
                    <Button onClick={() => insertDescriptionText('\n\n')}>Espacio</Button>
                    <Button onClick={() => insertDescriptionText('\t')}>Tab</Button>
                    <Button onClick={() => insertDescriptionText('\n- ')}>Lista</Button>
                  </div>
                </div>
                <textarea ref={descriptionRef} style={{ ...inputStyle(), minHeight: 150, resize: 'vertical', lineHeight: 1.55, whiteSpace: 'pre-wrap' }} value={draft.descripcion} placeholder="Ej: **Time cap:** 12 min&#10;&#10;- 21 cal row&#10;- 15 burpees&#10;- 9 snatches" onChange={(e) => setDraft((p) => ({ ...p, descripcion: e.target.value }))} />
              </div>
              <Field label="Medicion"><select style={inputStyle()} value={draft.measurement_method} onChange={(e) => setMeasurement(e.target.value)}>{measurementOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
              <Field label="Formato"><select style={inputStyle()} value={draft.workout_format} onChange={(e) => setDraft((p) => ({ ...p, workout_format: e.target.value }))}>{workoutFormatOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
              {draft.measurement_method === 'for_time' ? (
                <Field label="Time cap *"><input style={inputStyle()} required value={draft.time_cap_seconds} placeholder="12 o 12:00" onChange={(e) => setDraft((p) => ({ ...p, time_cap_seconds: e.target.value }))} /></Field>
              ) : null}
              <Field label="Gana"><select style={inputStyle()} value={draft.winner_rule} onChange={(e) => setDraft((p) => ({ ...p, winner_rule: e.target.value }))}><option value="higher_wins">Mayor marca</option><option value="lower_wins">Menor marca</option></select></Field>
              {draft.modality === 'teams' ? (
                <Field label="Resultado equipos"><select style={inputStyle()} value={draft.team_result_mode} onChange={(e) => setDraft((p) => ({ ...p, team_result_mode: e.target.value }))}><option value="single_member">Un integrante</option><option value="sum_two">Suma integrantes</option><option value="total">Resultado del equipo</option></select></Field>
              ) : null}
              <Field label="Tiebreak"><select style={inputStyle()} value={draft.tie_break_enabled} onChange={(e) => setDraft((p) => ({ ...p, tie_break_enabled: Number(e.target.value) }))}><option value={0}>No</option><option value={1}>Si</option></select></Field>
              {Number(draft.tie_break_enabled) ? (
                <Field label="Medicion tiebreak"><select style={inputStyle()} value={draft.tie_break_method} onChange={(e) => setDraft((p) => ({ ...p, tie_break_method: e.target.value }))}><option value="for_time">Tiempo</option><option value="amrap">Reps</option><option value="rm">Peso</option><option value="metros">Metros</option></select></Field>
              ) : null}
              <Field label="Visibilidad"><select style={inputStyle()} value={draft.is_visible} onChange={(e) => setDraft((p) => ({ ...p, is_visible: Number(e.target.value) }))}><option value={1}>Visible</option><option value={0}>Oculta</option></select></Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={reset}>Cancelar</Button>
              <Button tone="primary" onClick={save}><Save size={16} />{editingId ? 'Guardar cambios' : 'Crear fase'}</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 10, color: colors.secondary, fontSize: 13, lineHeight: 1.5 }}>
        El orden define la secuencia deportiva del evento: WOD 1, WOD 2, final, etc. Muévelas con las flechas; los horarios reales se ajustan en Heats.
      </div>
      {orderedPhases.map((phase, index) => (
        <div key={phase.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', gap: 10, alignItems: 'center', border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 10 }}>
          <div style={{ display: 'grid', gap: 5 }}>
            <Button disabled={index === 0} onClick={() => movePhase(phase, -1)}><ChevronUp size={15} /></Button>
            <Button disabled={index === orderedPhases.length - 1} onClick={() => movePhase(phase, 1)}><ChevronDown size={15} /></Button>
          </div>
          <div>
            <strong>{phase.nombre}</strong>
            <div style={{ color: colors.secondary, fontSize: 12, marginTop: 3 }}>
              {phase.modality === 'teams' ? 'Equipos' : 'Individual'} - {labelFor(measurementOptions, phase.measurement_method, phase.measurement_method || 'Medicion')} - {labelFor(workoutFormatOptions, phase.workout_format, phase.workout_format || 'Formato')}{phase.time_cap_seconds ? ` - Cap ${formatSeconds(phase.time_cap_seconds)}` : ''} - {phase.winner_rule === 'lower_wins' ? 'menor gana' : 'mayor gana'} - Estado automatico: {phaseStatusLabel(phase.estado)}
            </div>
            {phase.descripcion ? <div style={{ color: colors.secondary, fontSize: 12, marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{renderDescription(phase.descripcion)}</div> : null}
          </div>
          <Button onClick={() => startEdit(phase)}>Editar</Button>
          <Button onClick={async () => { await api(`/competitions/${competition.id}/phases/${phase.id}`, { method: 'PUT', body: JSON.stringify({ is_visible: phase.is_visible ? 0 : 1 }) }); await reload() }}>{phase.is_visible ? 'Ocultar' : 'Mostrar'}</Button>
          <Button tone="danger" onClick={() => remove(phase)}>Eliminar</Button>
        </div>
      ))}
    </Panel>
  )
}

function HeatsPanel({ bundle, reload, notify }) {
  const competition = bundle.competition
  const startPickerRef = useRef(null)
  const [draft, setDraft] = useState({ phase_id: '', generation_mode: 'by_category', heat_numbering_mode: 'by_category', seed_mode: 'leaderboard', advance_limit: '', lane_count: 8, first_heat_start_at: '', heat_duration_minutes: 15, heat_gap_minutes: 5, category_transition_minutes: 0, is_published: true, location_name: '', location_detail: '' })
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingMove, setPendingMove] = useState(null)
  const [scheduleModal, setScheduleModal] = useState(null)
  const [deleteWorkout, setDeleteWorkout] = useState(null)
  const [collapsedWorkouts, setCollapsedWorkouts] = useState({})
  const [previewPlan, setPreviewPlan] = useState(null)
  const [scheduleDraft, setScheduleDraft] = useState({ start_at: '', end_at: '', phase_id: '', categoria: '', from_heat_id: '', heat_count: '', delta_minutes: 60, location_name: '', location_detail: '' })
  const [locationModal, setLocationModal] = useState(false)
  const [locationDraft, setLocationDraft] = useState({ name: '', detail: '', originalName: '' })
  const [categoryOrderModal, setCategoryOrderModal] = useState(false)
  const [customLocations, setCustomLocations] = useState([])
  const [heatMode, setHeatMode] = useState('participants')
  const [schedulePhaseId, setSchedulePhaseId] = useState('')
  const [scheduleDay, setScheduleDay] = useState('')
  const [draggingHeatId, setDraggingHeatId] = useState('')
  useEffect(() => {
    if (!competition?.id) return
    try {
      const saved = JSON.parse(window.localStorage.getItem(`finalrep:heat-locations:${competition.id}`) || '[]')
      setCustomLocations(Array.isArray(saved) ? saved.filter((item) => item?.name) : [])
    } catch {
      setCustomLocations([])
    }
  }, [competition?.id])
  const persistCustomLocations = (items) => {
    setCustomLocations(items)
    if (competition?.id) window.localStorage.setItem(`finalrep:heat-locations:${competition.id}`, JSON.stringify(items))
  }
  useEffect(() => {
    setPreviewPlan(null)
  }, [draft.phase_id, draft.generation_mode, draft.heat_numbering_mode, draft.seed_mode, draft.advance_limit, draft.lane_count, draft.first_heat_start_at, draft.heat_duration_minutes, draft.heat_gap_minutes, draft.category_transition_minutes, draft.location_name])
  const openLocationManager = (location = null) => {
    setLocationDraft({
      name: location?.name || '',
      detail: location?.detail || '',
      originalName: location?.name || '',
    })
    setLocationModal(true)
  }
  const selectedPhase = (bundle.phases || []).find((phase) => String(phase.id) === String(draft.phase_id))
  const orderedHeatCategories = [...(bundle.categories || [])]
    .sort((a, b) => String(a.modality || 'individual').localeCompare(String(b.modality || 'individual')) || Number(a.orden || 0) - Number(b.orden || 0) || String(a.nombre || '').localeCompare(String(b.nombre || '')))
  const seedModeLabel = (value) => String(value || draft.seed_mode) === 'leaderboard' ? 'Posicion actual' : 'Inscripcion'
  const openStartPicker = () => {
    const picker = startPickerRef.current
    if (!picker) return
    if (typeof picker.showPicker === 'function') picker.showPicker()
    else picker.focus()
  }
  const generate = async (preview = false) => {
    if (!draft.phase_id) return notify('Selecciona una fase', 'error')
    if (!heatLocations.length) return notify('Crea una ubicacion antes de generar heats', 'error')
    if (!draft.location_name) return notify('Selecciona una ubicacion para los heats', 'error')
    const selectedLocation = heatLocations.find((location) => location.name === draft.location_name)
    try {
      const payload = {
        phase_id: Number(draft.phase_id),
        generation_mode: draft.generation_mode,
        heat_numbering_mode: draft.heat_numbering_mode,
        seed_mode: draft.seed_mode,
        advance_limit: draft.advance_limit === '' ? null : Number(draft.advance_limit),
        lane_count: Number(draft.lane_count || 8),
        heat_duration_minutes: Number(draft.heat_duration_minutes || 15),
        heat_gap_minutes: Number(draft.heat_gap_minutes || 0),
        category_transition_seconds: Math.max(0, Number(draft.category_transition_minutes || 0)) * 60,
        delete_existing: true,
        is_published: !!draft.is_published,
        first_heat_start_at: toUtcOrNull(draft.first_heat_start_at),
        location_name: draft.location_name,
        location_detail: selectedLocation?.detail || null,
      }
      const data = await api(`/competitions/${competition.id}/heats/generate${preview ? '/preview' : ''}`, { method: 'POST', body: JSON.stringify(payload) })
      if (preview) {
        setPreviewPlan(data)
        notify(`Plan listo: ${(data.plan || []).length} grupos`)
      } else {
        setPreviewPlan(null)
        notify('Heats generados')
        setModalOpen(false)
      }
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const removeHeat = async (heat) => {
    if (!window.confirm(`Eliminar ${heat.nombre || 'heat'}?`)) return
    try {
      await api(`/competitions/${competition.id}/heats/${heat.id}`, { method: 'DELETE' })
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const confirmDeleteWorkoutHeats = async () => {
    if (!deleteWorkout?.id || deleteWorkout.id === 'sin-fase') return
    try {
      const data = await api(`/competitions/${competition.id}/heats/phase/${deleteWorkout.id}`, { method: 'DELETE' })
      notify(`${data.deleted_heats || deleteWorkout.heats} heats eliminados`)
      setDeleteWorkout(null)
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const heats = bundle.heats?.items || []
  const heatParticipants = (heat) => (heat.participants || heat.assignments || [])
  const heatLocations = [
    ...customLocations,
    ...heats
      .filter((heat) => heat.location_name)
      .map((heat) => ({ name: heat.location_name, detail: heat.location_detail || '' })),
  ].reduce((items, location) => {
    const name = String(location.name || '').trim()
    if (!name || items.some((item) => item.name.toLowerCase() === name.toLowerCase())) return items
    items.push({ name, detail: String(location.detail || '').trim() })
    return items
  }, [])
  const saveLocation = async () => {
    const name = locationDraft.name.trim()
    if (!name) return notify('Nombre de ubicacion requerido', 'error')
    const originalName = locationDraft.originalName.trim()
    if (heatLocations.some((location) => location.name.toLowerCase() === name.toLowerCase() && location.name.toLowerCase() !== originalName.toLowerCase())) return notify('Esa ubicacion ya existe', 'error')
    const detail = locationDraft.detail.trim()
    const nextLocations = customLocations.some((location) => location.name.toLowerCase() === originalName.toLowerCase())
      ? customLocations.map((location) => location.name.toLowerCase() === originalName.toLowerCase() ? { name, detail } : location)
      : [...customLocations, { name, detail }]
    persistCustomLocations(nextLocations)
    setScheduleDraft((prev) => ({ ...prev, location_name: name, location_detail: detail }))
    setDraft((prev) => ({ ...prev, location_name: name, location_detail: detail }))
    if (originalName) {
      const affected = heats.filter((heat) => String(heat.location_name || '').trim().toLowerCase() === originalName.toLowerCase())
      try {
        for (const heat of affected) {
          await api(`/competitions/${competition.id}/heats/${heat.id}`, {
            method: 'PUT',
            body: JSON.stringify(heatPayload(heat, { location_name: name, location_detail: detail || null })),
          })
        }
        if (affected.length) await reload()
      } catch (error) {
        notify(error.message, 'error')
        return
      }
    }
    setLocationDraft({ name: '', detail: '', originalName: '' })
    notify(originalName ? 'Ubicacion actualizada' : 'Ubicacion creada')
  }
  const deleteLocation = async (location) => {
    const usedHeats = heats.filter((heat) => String(heat.location_name || '').trim().toLowerCase() === String(location.name || '').trim().toLowerCase())
    const message = usedHeats.length
      ? `Eliminar ${location.name}? Se quitara esta ubicacion de ${usedHeats.length} heats.`
      : `Eliminar ${location.name}?`
    if (!window.confirm(message)) return
    persistCustomLocations(customLocations.filter((item) => item.name.toLowerCase() !== location.name.toLowerCase()))
    if (draft.location_name === location.name) setDraft((prev) => ({ ...prev, location_name: '', location_detail: '' }))
    if (scheduleDraft.location_name === location.name) setScheduleDraft((prev) => ({ ...prev, location_name: '', location_detail: '' }))
    try {
      for (const heat of usedHeats) {
        await api(`/competitions/${competition.id}/heats/${heat.id}`, {
          method: 'PUT',
          body: JSON.stringify(heatPayload(heat, { location_name: null, location_detail: null })),
        })
      }
      if (usedHeats.length) await reload()
      setLocationDraft({ name: '', detail: '', originalName: '' })
      notify(usedHeats.length ? 'Ubicacion eliminada y heats desasignados' : 'Ubicacion eliminada')
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const moveCategoryOrder = async (category, direction) => {
    const scopedCategories = orderedHeatCategories.filter((item) => String(item.modality || 'individual') === String(category.modality || 'individual'))
    const index = scopedCategories.findIndex((item) => String(item.id) === String(category.id))
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= scopedCategories.length) return
    const nextOrder = [...scopedCategories]
    const [item] = nextOrder.splice(index, 1)
    nextOrder.splice(targetIndex, 0, item)
    try {
      await api(`/competitions/${competition.id}/categories/order`, {
        method: 'PUT',
        body: JSON.stringify({
          items: nextOrder.map((item, orderIndex) => ({ id: Number(item.id), orden: orderIndex + 1 })),
        }),
      })
      notify('Orden de categorias actualizado')
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const heatTimeRange = (heat, overrides = {}) => {
    const startRaw = overrides.start_at === undefined ? heat.start_at : overrides.start_at
    const endRaw = overrides.end_at === undefined ? heat.end_at : overrides.end_at
    const start = startRaw ? new Date(startRaw) : null
    if (!start || Number.isNaN(start.getTime())) return null
    const end = endRaw ? new Date(endRaw) : new Date(start.getTime() + 15 * 60000)
    if (Number.isNaN(end.getTime())) return null
    return { start, end: end > start ? end : new Date(start.getTime() + 15 * 60000) }
  }
  const findLocationConflicts = (heat, overrides = {}, pool = heats) => {
    const locationName = String(overrides.location_name ?? heat.location_name ?? '').trim()
    if (!locationName) return []
    const currentRange = heatTimeRange(heat, overrides)
    if (!currentRange) return []
    return pool.filter((item) => {
      if (String(item.id) === String(heat.id)) return false
      if (String(item.location_name || '').trim().toLowerCase() !== locationName.toLowerCase()) return false
      const otherRange = heatTimeRange(item)
      if (!otherRange) return false
      return currentRange.start < otherRange.end && currentRange.end > otherRange.start
    })
  }
  const hasLocationConflict = (heat) => findLocationConflicts(heat).length > 0
  const heatDestinations = (heat) => heats
    .filter((item) => String(item.id) !== String(heat.id) && String(item.phase_id) === String(heat.phase_id))
    .sort((a, b) => String(a.categoria || 'Todas').localeCompare(String(b.categoria || 'Todas')) || Number(a.heat_number || 0) - Number(b.heat_number || 0) || Number(a.id || 0) - Number(b.id || 0))
  const heatPayload = (heat, overrides = {}) => ({
    phase_id: Number(overrides.phase_id ?? heat.phase_id),
    categoria: overrides.categoria !== undefined ? overrides.categoria : heat.categoria,
    nombre: overrides.nombre || heat.heat_label || heat.nombre || `Heat ${heat.heat_number || 1}`,
    heat_number: Number(overrides.heat_number ?? heat.heat_number ?? 1),
    lane_count: Number(overrides.lane_count ?? heat.lane_count ?? 0),
    heat_transition_seconds: Number(overrides.heat_transition_seconds ?? heat.heat_transition_seconds ?? 0),
    category_transition_seconds: Number(overrides.category_transition_seconds ?? heat.category_transition_seconds ?? 0),
    start_at: overrides.start_at === undefined ? heat.start_at : overrides.start_at,
    end_at: overrides.end_at === undefined ? heat.end_at : overrides.end_at,
    location_name: overrides.location_name ?? heat.location_name ?? null,
    location_detail: overrides.location_detail ?? heat.location_detail ?? null,
    note: overrides.note ?? heat.note ?? null,
    is_published: Number(overrides.is_published ?? heat.is_published ?? 0),
    assignments: heatParticipants(heat).map((participant, index) => ({
      user_id: participant.user_id ? Number(participant.user_id) : null,
      team_id: participant.team_id ? Number(participant.team_id) : null,
      lane_number: Number(participant.lane_number || index + 1),
      seed_order: Number(participant.seed_order || index + 1),
    })),
  })
  const openSingleSchedule = (heat) => {
    setScheduleDraft((prev) => ({
      ...prev,
      start_at: dateTimeInput(heat.start_at),
      end_at: dateTimeInput(heat.end_at),
      location_name: heat.location_name || '',
      location_detail: heat.location_detail || '',
    }))
    setScheduleModal({ mode: 'single', heat })
  }
  const openBulkSchedule = () => {
    const firstHeat = heats.find((heat) => heat.start_at) || heats[0]
    setScheduleDraft({
      start_at: '',
      end_at: '',
      phase_id: firstHeat?.phase_id ? String(firstHeat.phase_id) : '',
      categoria: '',
      from_heat_id: firstHeat?.id ? String(firstHeat.id) : '',
      heat_count: '',
      delta_minutes: 60,
      location_name: '',
      location_detail: '',
    })
    setScheduleModal({ mode: 'bulk' })
  }
  const saveSingleSchedule = async () => {
    if (!scheduleModal?.heat) return
    const nextStart = toUtcOrNull(scheduleDraft.start_at)
    const nextEnd = toUtcOrNull(scheduleDraft.end_at)
    const locationName = scheduleDraft.location_name.trim()
    const locationDetail = heatLocations.find((location) => location.name === locationName)?.detail || scheduleDraft.location_detail.trim()
    const conflicts = findLocationConflicts(scheduleModal.heat, { start_at: nextStart, end_at: nextEnd, location_name: locationName || null })
    if (conflicts.length) return notify(`Solape en ${locationName}: ${conflicts[0].heat_label || conflicts[0].nombre || `Heat ${conflicts[0].heat_number}`}`, 'error')
    try {
      await api(`/competitions/${competition.id}/heats/${scheduleModal.heat.id}`, {
        method: 'PUT',
        body: JSON.stringify(heatPayload(scheduleModal.heat, {
          start_at: nextStart,
          end_at: nextEnd,
          location_name: locationName || null,
          location_detail: locationName ? locationDetail : null,
        })),
      })
      notify('Horario actualizado')
      setScheduleModal(null)
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const bulkShiftHeats = async () => {
    const phaseId = scheduleDraft.phase_id
    if (!phaseId) return notify('Selecciona un WOD', 'error')
    const deltaMs = Number(scheduleDraft.delta_minutes || 0) * 60000
    if (!deltaMs) return notify('Define cuantos minutos mover', 'error')
    const ordered = heats
      .filter((heat) => String(heat.phase_id) === String(phaseId))
      .filter((heat) => !scheduleDraft.categoria || String(heat.categoria || 'Todas') === String(scheduleDraft.categoria))
      .sort((a, b) => new Date(a.start_at || 0).getTime() - new Date(b.start_at || 0).getTime() || Number(a.heat_number || 0) - Number(b.heat_number || 0) || Number(a.id || 0) - Number(b.id || 0))
    const startIndex = scheduleDraft.from_heat_id ? ordered.findIndex((heat) => String(heat.id) === String(scheduleDraft.from_heat_id)) : 0
    const scoped = ordered.slice(Math.max(0, startIndex))
    const count = Number(scheduleDraft.heat_count || 0)
    const selected = count > 0 ? scoped.slice(0, count) : scoped
    if (!selected.length) return notify('No hay heats para mover', 'error')
    const shifted = selected.map((heat) => ({
      ...heat,
      start_at: heat.start_at ? new Date(new Date(heat.start_at).getTime() + deltaMs).toISOString() : null,
      end_at: heat.end_at ? new Date(new Date(heat.end_at).getTime() + deltaMs).toISOString() : null,
    }))
    const shiftedPool = heats.map((heat) => shifted.find((item) => String(item.id) === String(heat.id)) || heat)
    const conflictHeat = shifted.find((heat) => findLocationConflicts(heat, {}, shiftedPool).length)
    if (conflictHeat) return notify(`Solape en ${conflictHeat.location_name}: ${conflictHeat.heat_label || conflictHeat.nombre || `Heat ${conflictHeat.heat_number}`}`, 'error')
    try {
      for (const heat of selected) {
        const nextStart = heat.start_at ? new Date(new Date(heat.start_at).getTime() + deltaMs).toISOString() : null
        const nextEnd = heat.end_at ? new Date(new Date(heat.end_at).getTime() + deltaMs).toISOString() : null
        await api(`/competitions/${competition.id}/heats/${heat.id}`, {
          method: 'PUT',
          body: JSON.stringify(heatPayload(heat, { start_at: nextStart, end_at: nextEnd })),
        })
      }
      notify(`${selected.length} heats desplazados`)
      setScheduleModal(null)
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const openMoveConfirmation = (heat, participant) => {
    const destinations = heatDestinations(heat)
    setPendingMove({ sourceHeat: heat, targetHeat: destinations[0] || null, participant })
  }
  const confirmMoveParticipant = async () => {
    if (!pendingMove) return
    const { sourceHeat, targetHeat, participant } = pendingMove
    if (!targetHeat) return notify('Selecciona el heat destino', 'error')
    const sourceCount = heatParticipants(sourceHeat).length
    try {
      await api(`/competitions/${competition.id}/heats/${sourceHeat.id}/move-assignment`, {
        method: 'PUT',
        body: JSON.stringify({
          user_id: participant.user_id ? Number(participant.user_id) : null,
          team_id: participant.team_id ? Number(participant.team_id) : null,
          target_heat_id: Number(targetHeat.id),
        }),
      })
      notify(sourceCount === 1 ? 'Atleta movido y heat vacio eliminado' : 'Atleta movido')
      setPendingMove(null)
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const heatsByWorkout = heats.reduce((groups, heat) => {
    const workoutId = String(heat.phase_id || 'sin-fase')
    let workout = groups.find((group) => group.id === workoutId)
    if (!workout) {
      workout = { id: workoutId, name: heat.phase_name || `WOD ${heat.phase_id || ''}`, categories: [], heats: 0, athletes: 0 }
      groups.push(workout)
    }
    const category = heat.categoria || 'Todas'
    let categoryGroup = workout.categories.find((group) => group.category === category)
    if (!categoryGroup) {
      categoryGroup = { category, heats: [], athletes: 0 }
      workout.categories.push(categoryGroup)
    }
    const participants = heatParticipants(heat)
    categoryGroup.heats.push(heat)
    categoryGroup.athletes += participants.length
    workout.heats += 1
    workout.athletes += participants.length
    return groups
  }, []).map((workout) => ({
    ...workout,
    categories: workout.categories.map((group) => ({
      ...group,
      heats: [...group.heats].sort((a, b) => Number(a.heat_number || 0) - Number(b.heat_number || 0) || Number(a.id || 0) - Number(b.id || 0)),
    })),
  }))
  const schedulePhaseOptions = heatsByWorkout.map((workout) => ({ id: workout.id, name: workout.name }))
  const activeSchedulePhaseId = schedulePhaseId || 'all'
  const showingAllSchedule = activeSchedulePhaseId === 'all'
  const scheduleHeats = heats
    .filter((heat) => showingAllSchedule || String(heat.phase_id || 'sin-fase') === String(activeSchedulePhaseId))
    .sort((a, b) => new Date(a.start_at || 0).getTime() - new Date(b.start_at || 0).getTime() || String(a.phase_name || '').localeCompare(String(b.phase_name || '')) || Number(a.heat_number || 0) - Number(b.heat_number || 0))
  const scheduleDateKey = (value) => {
    const date = value ? new Date(value) : null
    if (!date || Number.isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  const scheduleDays = [...new Set(scheduleHeats.map((heat) => scheduleDateKey(heat.start_at)).filter(Boolean))].sort()
  const activeScheduleDay = scheduleDays.includes(scheduleDay) ? scheduleDay : scheduleDays[0] || ''
  const activeScheduleDayIndex = activeScheduleDay ? scheduleDays.indexOf(activeScheduleDay) : -1
  const scheduleDayHeats = scheduleHeats.filter((heat) => !activeScheduleDay || scheduleDateKey(heat.start_at) === activeScheduleDay)
  const scheduleCategories = [...new Set(scheduleDayHeats.map((heat) => heat.categoria || 'Todas'))]
  const scheduleMissingLocations = scheduleDayHeats.filter((heat) => !heat.location_name).length
  const scheduleConflictCount = scheduleDayHeats.filter((heat) => hasLocationConflict(heat)).length
  const scheduleLocationColumns = [
    ...heatLocations.map((location) => location.name),
    ...(scheduleMissingLocations ? [''] : []),
  ].filter((location, index, items) => items.findIndex((item) => String(item).toLowerCase() === String(location).toLowerCase()) === index)
  const locationLabel = (locationName) => locationName || 'Sin ubicacion'
  const previewCategoryLabel = (value) => String(value || '').trim() || 'Sin categoria'
  const confirmedPreviewParticipants = (bundle.participants || [])
    .filter((participant) => participant.estado === 'confirmado')
    .map((participant) => ({
      user_id: participant.user_id || participant.id,
      name: `${participant.nombre || ''} ${participant.apellido || ''}`.trim() || participant.email || 'Atleta',
      categoria: previewCategoryLabel(participant.categoria_competencia || participant.categoria),
    }))
  const buildFallbackPreviewHeats = (plan) => {
    const laneCount = Math.max(1, Number(plan?.lane_count || draft.lane_count || 1))
    const duration = Math.max(1, Number(draft.heat_duration_minutes || 15))
    const heatGap = Math.max(0, Number(draft.heat_gap_minutes || 0))
    const categoryGap = Math.max(0, Number(draft.category_transition_minutes || 0))
    let cursor = draft.first_heat_start_at ? new Date(draft.first_heat_start_at) : null
    let previousCategory = null
    const fallback = []
    ;(plan?.plan || []).forEach((item) => {
      const category = previewCategoryLabel(item.categoria)
      let candidates = item.mixed
        ? confirmedPreviewParticipants
        : confirmedPreviewParticipants.filter((participant) => previewCategoryLabel(participant.categoria).toLowerCase() === category.toLowerCase())
      if (!candidates.length && Number(item.participants || 0) > 0) {
        candidates = Array.from({ length: Number(item.participants || 0) }, (_, index) => ({ user_id: `fallback-${category}-${index}`, name: `Atleta ${index + 1}`, categoria: category }))
      }
      const heatCount = Math.max(0, Number(item.heats || Math.ceil(candidates.length / laneCount) || 0))
      for (let heatIndex = 0; heatIndex < heatCount; heatIndex += 1) {
        if (cursor && previousCategory !== null && category !== previousCategory && categoryGap > heatGap) {
          cursor = new Date(cursor.getTime() + (categoryGap - heatGap) * 60000)
        }
        const start = cursor ? new Date(cursor) : null
        const end = start ? new Date(start.getTime() + duration * 60000) : null
        const chunk = candidates.slice(heatIndex * laneCount, heatIndex * laneCount + laneCount)
        fallback.push({
          heat_number: heatIndex + 1,
          heat_label: `Heat ${heatIndex + 1}`,
          categoria: item.mixed ? null : category,
          start_at: start ? start.toISOString() : null,
          end_at: end ? end.toISOString() : null,
          location_name: draft.location_name || null,
          location_detail: draft.location_detail || null,
          participants: chunk.map((participant, index) => ({ ...participant, lane_number: index + 1, seed_order: index + 1 })),
        })
        if (cursor && end) cursor = new Date(end.getTime() + heatGap * 60000)
        previousCategory = category
      }
    })
    return fallback
  }
  const previewHeats = previewPlan
    ? ((previewPlan.heats_preview || []).length ? (previewPlan.heats_preview || []) : buildFallbackPreviewHeats(previewPlan))
    : []
  const previewDateKey = (value) => {
    const date = value ? new Date(value) : null
    if (!date || Number.isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  const previewTargetDay = previewDateKey(previewHeats.find((heat) => heat.start_at)?.start_at || draft.first_heat_start_at)
  const previewExistingHeats = previewPlan
    ? heats
      .filter((heat) => String(heat.phase_id) !== String(previewPlan.phase_id || draft.phase_id))
      .filter((heat) => !previewTargetDay || previewDateKey(heat.start_at) === previewTargetDay)
    : []
  const previewCalendarItems = [
    ...previewExistingHeats.map((heat) => ({ ...heat, preview_kind: 'existing', preview_key: `existing-${heat.id}` })),
    ...previewHeats
      .filter((heat) => !previewTargetDay || previewDateKey(heat.start_at) === previewTargetDay)
      .map((heat, index) => ({ ...heat, preview_kind: 'preview', preview_key: `preview-${index}` })),
  ]
  const previewLocationColumns = [
    ...heatLocations.map((location) => location.name),
    ...(previewCalendarItems.some((heat) => !heat.location_name) ? [''] : []),
  ].filter((location, index, items) => items.findIndex((item) => String(item).toLowerCase() === String(location).toLowerCase()) === index)
  const previewStartDate = previewCalendarItems.reduce((min, heat) => {
    const date = heat.start_at ? new Date(heat.start_at) : null
    if (!date || Number.isNaN(date.getTime())) return min
    return !min || date < min ? date : min
  }, null)
  const previewEndDate = previewCalendarItems.reduce((max, heat) => {
    const date = heat.end_at ? new Date(heat.end_at) : heat.start_at ? new Date(heat.start_at) : null
    if (!date || Number.isNaN(date.getTime())) return max
    return !max || date > max ? date : max
  }, null)
  const previewBase = previewStartDate ? new Date(previewStartDate) : null
  if (previewBase) previewBase.setMinutes(Math.floor(previewBase.getMinutes() / 5) * 5, 0, 0)
  const previewLast = previewEndDate ? new Date(previewEndDate) : null
  if (previewLast) previewLast.setMinutes(Math.ceil(previewLast.getMinutes() / 5) * 5, 0, 0)
  const previewSlotCount = previewBase && previewLast ? Math.max(12, Math.ceil((previewLast.getTime() - previewBase.getTime()) / 300000) + 6) : 0
  const previewSlots = Array.from({ length: previewSlotCount }, (_, index) => new Date(previewBase.getTime() + index * 5 * 60000))
  const previewHeatsAtSlot = (slot, locationName) => previewCalendarItems.filter((heat) => {
    if (!heat.start_at) return false
    if (String(heat.location_name || '').trim().toLowerCase() !== String(locationName || '').trim().toLowerCase()) return false
    const start = new Date(heat.start_at)
    return Math.abs(start.getTime() - slot.getTime()) < 60000
  })
  const previewHasOverlap = (heat) => {
    if (!heat.location_name || !heat.start_at) return false
    const range = heatTimeRange(heat)
    if (!range) return false
    return previewCalendarItems.some((item) => {
      if (item.preview_key === heat.preview_key) return false
      if (!item.location_name || String(item.location_name).toLowerCase() !== String(heat.location_name).toLowerCase()) return false
      const other = heatTimeRange(item)
      return other && range.start < other.end && range.end > other.start
    })
  }
  const previewOverlapCount = previewCalendarItems.filter((heat) => previewHasOverlap(heat)).length
  const scheduleStartDate = scheduleDayHeats.reduce((min, heat) => {
    const date = heat.start_at ? new Date(heat.start_at) : null
    if (!date || Number.isNaN(date.getTime())) return min
    return !min || date < min ? date : min
  }, null)
  const scheduleEndDate = scheduleDayHeats.reduce((max, heat) => {
    const date = heat.end_at ? new Date(heat.end_at) : heat.start_at ? new Date(heat.start_at) : null
    if (!date || Number.isNaN(date.getTime())) return max
    return !max || date > max ? date : max
  }, null)
  const scheduleBase = scheduleStartDate ? new Date(scheduleStartDate) : null
  if (scheduleBase) scheduleBase.setMinutes(Math.floor(scheduleBase.getMinutes() / 5) * 5, 0, 0)
  const scheduleLast = scheduleEndDate ? new Date(scheduleEndDate) : null
  if (scheduleLast) scheduleLast.setMinutes(Math.ceil(scheduleLast.getMinutes() / 5) * 5, 0, 0)
  const scheduleSlotCount = scheduleBase && scheduleLast ? Math.max(12, Math.ceil((scheduleLast.getTime() - scheduleBase.getTime()) / 300000) + 6) : 0
  const scheduleSlots = Array.from({ length: scheduleSlotCount }, (_, index) => new Date(scheduleBase.getTime() + index * 5 * 60000))
  const heatsAtSlot = (slot, locationName) => scheduleDayHeats.filter((heat) => {
    if (!heat.start_at) return false
    if (String(heat.location_name || '').trim().toLowerCase() !== String(locationName || '').trim().toLowerCase()) return false
    const start = new Date(heat.start_at)
    return Math.abs(start.getTime() - slot.getTime()) < 60000
  }).sort((a, b) => String(a.categoria || 'Todas').localeCompare(String(b.categoria || 'Todas')) || Number(a.heat_number || 0) - Number(b.heat_number || 0))
  const moveHeatSchedule = async (heat, slot, locationName = heat.location_name || '') => {
    const oldStart = heat.start_at ? new Date(heat.start_at) : null
    const oldEnd = heat.end_at ? new Date(heat.end_at) : null
    const durationMs = oldStart && oldEnd && oldEnd > oldStart ? oldEnd.getTime() - oldStart.getTime() : 15 * 60000
    const nextStart = slot.toISOString()
    const nextEnd = new Date(slot.getTime() + durationMs).toISOString()
    const locationDetail = heatLocations.find((location) => location.name === locationName)?.detail || heat.location_detail || ''
    const conflicts = findLocationConflicts(heat, { start_at: nextStart, end_at: nextEnd, location_name: locationName || null })
    try {
      await api(`/competitions/${competition.id}/heats/${heat.id}`, {
        method: 'PUT',
        body: JSON.stringify(heatPayload(heat, {
          start_at: nextStart,
          end_at: nextEnd,
          location_name: locationName || null,
          location_detail: locationName ? locationDetail : null,
        })),
      })
      notify(conflicts.length ? `Horario actualizado con solape en ${locationLabel(locationName)}` : 'Horario del heat actualizado', conflicts.length ? 'error' : undefined)
      setDraggingHeatId('')
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  return (
    <Panel title="Heats y orden de salida" subtitle="Participantes y horarios se ajustan por separado." action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Button onClick={() => setCategoryOrderModal(true)}><Settings2 size={16} />Orden categorias</Button><Button onClick={openBulkSchedule}><Clock3 size={16} />Mover horarios</Button><Button tone="primary" onClick={() => setModalOpen(true)} primaryAction><Zap size={16} />Generar heats</Button></div>}>
      {categoryOrderModal ? (
        <Modal title="Orden de categorias para heats" onClose={() => setCategoryOrderModal(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 12, color: colors.secondary, fontSize: 13, lineHeight: 1.5 }}>
              Este orden se usa cuando generas heats por categoria. Normalmente se inicia desde categorias base hacia categorias avanzadas.
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {orderedHeatCategories.length ? orderedHeatCategories.map((category, index) => {
                const scopedCategories = orderedHeatCategories.filter((item) => String(item.modality || 'individual') === String(category.modality || 'individual'))
                const scopedIndex = scopedCategories.findIndex((item) => String(item.id) === String(category.id))
                return (
                <div key={category.id} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 10, alignItems: 'center', border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 10 }}>
                  <span style={{ color: colors.muted, fontSize: 12, fontWeight: 900, width: 28 }}>#{index + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: colors.text, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category.nombre}</div>
                    <div style={{ color: colors.secondary, fontSize: 12, marginTop: 2 }}>{category.modality === 'teams' ? 'Equipos' : 'Individual'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Button disabled={scopedIndex === 0} onClick={() => moveCategoryOrder(category, -1)}><ChevronUp size={15} /></Button>
                    <Button disabled={scopedIndex === scopedCategories.length - 1} onClick={() => moveCategoryOrder(category, 1)}><ChevronDown size={15} /></Button>
                  </div>
                </div>
              )}) : (
                <div style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 12, color: colors.secondary }}>
                  No hay categorias para esta modalidad.
                </div>
              )}
            </div>
          </div>
        </Modal>
      ) : null}
      {modalOpen ? (
        <Modal title="Generar heats" onClose={() => { setPreviewPlan(null); setModalOpen(false) }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: previewPlan ? 'none' : 'grid', gap: 12 }}>
            {!heatLocations.length ? (
              <div style={{ border: `1px solid ${colors.warning}`, background: 'rgba(245,158,11,0.10)', borderRadius: 8, padding: 12, color: '#FBBF24', fontSize: 13, lineHeight: 1.5 }}>
                No hay ubicaciones creadas. Crea al menos una ubicacion fisica antes de generar heats.
              </div>
            ) : !draft.location_name ? (
              <div style={{ border: `1px solid ${colors.warning}`, background: 'rgba(245,158,11,0.10)', borderRadius: 8, padding: 12, color: '#FBBF24', fontSize: 13, lineHeight: 1.5 }}>
                Selecciona la ubicacion donde correrán estos heats.
              </div>
            ) : null}
            <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: colors.text, fontWeight: 950 }}>Ubicacion de estos heats</div>
                  <div style={{ color: colors.secondary, fontSize: 12, marginTop: 3 }}>Cada generacion queda asignada a un espacio fisico.</div>
                </div>
                <Button onClick={() => openLocationManager()}><MapPin size={16} />Gestionar ubicaciones</Button>
              </div>
              <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
                <Field label="Ubicacion asignada">
                  <select
                    style={inputStyle()}
                    value={draft.location_name}
                    onChange={(event) => {
                      const location = heatLocations.find((item) => item.name === event.target.value)
                      setDraft((prev) => ({ ...prev, location_name: event.target.value, location_detail: location?.detail || '' }))
                    }}
                  >
                    <option value="">Selecciona una ubicacion</option>
                    {heatLocations.map((location) => <option key={location.name} value={location.name}>{location.name}</option>)}
                  </select>
                </Field>
                {draft.location_name ? (
                  <div style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 10 }}>
                    <div style={{ color: colors.muted, fontSize: 11, fontWeight: 900 }}>Detalle de ubicacion</div>
                    <div style={{ color: colors.secondary, fontSize: 13, marginTop: 5 }}>{draft.location_detail || 'Sin detalle adicional'}</div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <Field label="Fase"><select style={inputStyle()} value={draft.phase_id} onChange={(e) => {
                const nextPhase = (bundle.phases || []).find((phase) => String(phase.id) === String(e.target.value))
                setDraft((p) => ({
                  ...p,
                  phase_id: e.target.value,
                  first_heat_start_at: p.first_heat_start_at || dateTimeInput(nextPhase?.start_at),
                  category_transition_minutes: p.category_transition_minutes || Math.round(Number(nextPhase?.category_transition_seconds || 0) / 60),
                }))
              }}><option value="">Seleccionar</option>{(bundle.phases || []).map((phase) => <option key={phase.id} value={phase.id}>{phase.nombre}</option>)}</select></Field>
              <Field label="Modo"><select style={inputStyle()} value={draft.generation_mode} onChange={(e) => setDraft((p) => ({ ...p, generation_mode: e.target.value }))}><option value="by_category">Por categoria</option><option value="mixed">Mixto</option></select></Field>
              <Field label="Numeracion"><select style={inputStyle()} value={draft.heat_numbering_mode} onChange={(e) => setDraft((p) => ({ ...p, heat_numbering_mode: e.target.value }))}><option value="by_category">Reiniciar por categoria</option><option value="continuous">Continua ascendente</option></select></Field>
              <Field label="Carriles"><input type="number" style={inputStyle()} value={draft.lane_count} onChange={(e) => setDraft((p) => ({ ...p, lane_count: e.target.value }))} /></Field>
              <Field label="Clasificados por categoria"><input type="number" min="0" style={inputStyle()} value={draft.advance_limit} placeholder="Todos" onChange={(e) => setDraft((p) => ({ ...p, advance_limit: e.target.value }))} /></Field>
              <div style={{ gridColumn: '1 / -1', border: `1px solid ${draft.seed_mode === 'leaderboard' ? colors.accent : colors.border}`, background: draft.seed_mode === 'leaderboard' ? 'rgba(0,194,168,0.08)' : colors.top, borderRadius: 8, padding: 12, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: colors.text, fontWeight: 950 }}>Orden deportivo por posicion actual</div>
                    <div style={{ color: colors.secondary, fontSize: 12, marginTop: 3 }}>Usa el leaderboard actual para que los mejores queden en carriles centrales.</div>
                  </div>
                  <Button tone={draft.seed_mode === 'leaderboard' ? 'primary' : 'default'} onClick={() => setDraft((p) => ({ ...p, seed_mode: p.seed_mode === 'leaderboard' ? 'registration' : 'leaderboard' }))}>
                    {draft.seed_mode === 'leaderboard' ? 'Activo' : 'Inactivo'}
                  </Button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  <div style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 10 }}>
                    <div style={{ color: colors.muted, fontSize: 11, fontWeight: 900 }}>Si esta activo</div>
                    <div style={{ color: colors.secondary, fontSize: 12, marginTop: 4 }}>Mejores posiciones al centro; heats finales con los atletas mas fuertes.</div>
                  </div>
                  <div style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 10 }}>
                    <div style={{ color: colors.muted, fontSize: 11, fontWeight: 900 }}>Si esta inactivo</div>
                    <div style={{ color: colors.secondary, fontSize: 12, marginTop: 4 }}>Se respeta el orden de inscripcion, sin tomar posiciones actuales.</div>
                  </div>
                </div>
                {Number(draft.advance_limit || 0) > 0 ? (
                  <div style={{ border: `1px solid ${colors.warning}`, background: 'rgba(245,158,11,0.10)', borderRadius: 8, padding: 10, color: '#FBBF24', fontSize: 12, lineHeight: 1.5 }}>
                    Corte activo: solo pasan los mejores {draft.advance_limit} por categoria segun el leaderboard actual. Este corte activa ranking aunque el orden deportivo este apagado.
                  </div>
                ) : null}
              </div>
              <Field label="Fecha y hora de inicio">
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
                  <input ref={startPickerRef} type="datetime-local" style={inputStyle()} value={draft.first_heat_start_at} onChange={(e) => setDraft((p) => ({ ...p, first_heat_start_at: e.target.value }))} />
                  <Button onClick={openStartPicker}><CalendarDays size={16} />Calendario</Button>
                </div>
              </Field>
              <Field label="Duracion minima del heat (min)"><input type="number" min="1" style={inputStyle()} value={draft.heat_duration_minutes} onChange={(e) => setDraft((p) => ({ ...p, heat_duration_minutes: e.target.value }))} /></Field>
              <Field label="Tiempo entre heats (min)"><input type="number" min="0" style={inputStyle()} value={draft.heat_gap_minutes} onChange={(e) => setDraft((p) => ({ ...p, heat_gap_minutes: e.target.value }))} /></Field>
              <Field label="Tiempo entre categorias (min)"><input type="number" min="0" style={inputStyle()} value={draft.category_transition_minutes} onChange={(e) => setDraft((p) => ({ ...p, category_transition_minutes: e.target.value }))} /></Field>
            </div>
            <div className="fr-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
              <MiniStat label="Duracion minima" value={`${draft.heat_duration_minutes || 0} min`} tone={colors.primary} />
              <MiniStat label="Entre heats" value={`${draft.heat_gap_minutes || 0} min`} tone={colors.accent} />
              <MiniStat label="Entre categorias" value={`${draft.category_transition_minutes || 0} min`} tone={colors.warning} />
              <MiniStat label="Corte" value={Number(draft.advance_limit || 0) > 0 ? `Top ${draft.advance_limit}` : 'Todos'} tone={Number(draft.advance_limit || 0) > 0 ? colors.accent : colors.secondary} />
            </div>
            {selectedPhase?.category_transition_seconds ? (
              <div style={{ color: colors.secondary, fontSize: 12, lineHeight: 1.5 }}>
                Esta fase tiene configurado un cambio entre categorias de {Math.round(Number(selectedPhase.category_transition_seconds || 0) / 60)} min. Puedes ajustarlo para esta generacion.
              </div>
            ) : null}
            {previewPlan ? (
              <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 12, borderBottom: `1px solid ${colors.border}` }}>
                  <div>
                    <div style={{ color: colors.text, fontWeight: 950 }}>Previsualizacion</div>
                    <div style={{ color: colors.secondary, fontSize: 12, marginTop: 3 }}>{previewPlan.phase_name} - {previewPlan.lane_count} carriles - {draft.location_name}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Pill tone={previewPlan.seed_mode === 'leaderboard' ? colors.accent : colors.secondary}>{seedModeLabel(previewPlan.seed_mode)}</Pill>
                    {Number(previewPlan.advance_limit || 0) > 0 ? <Pill tone={colors.warning}>Top {previewPlan.advance_limit}</Pill> : null}
                    <Pill tone={colors.primary}>{(previewPlan.plan || []).reduce((sum, item) => sum + Number(item.heats || 0), 0)} heats nuevos</Pill>
                    <Pill tone={colors.accent}>{(previewPlan.plan || []).reduce((sum, item) => sum + Number(item.participants || 0), 0)} atletas</Pill>
                  </div>
                </div>
                {previewPlan.existing?.heats ? (
                  <div style={{ borderBottom: `1px solid ${colors.border}`, background: 'rgba(245,158,11,0.10)', padding: 10, color: '#FBBF24', fontSize: 13 }}>
                    Ya existen {previewPlan.existing.heats} heats con {previewPlan.existing.assignments || 0} atletas asignados en este WOD. Al confirmar, se reemplazaran para evitar duplicados.
                  </div>
                ) : null}
                <div style={{ display: 'grid' }}>
                  {(previewPlan.plan || []).map((item) => (
                    <div key={item.categoria} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 10, alignItems: 'center', padding: '10px 12px', borderBottom: `1px solid ${colors.border}` }}>
                      <div>
                        <div style={{ color: colors.text, fontWeight: 900 }}>{item.categoria}</div>
                        <div style={{ color: colors.secondary, fontSize: 12, marginTop: 3 }}>{item.mixed ? 'Participantes mezclados' : 'Por categoria'}</div>
                      </div>
                      <Pill tone={colors.accent}>{item.participants} atletas</Pill>
                      <Pill tone={colors.primary}>{item.heats} heats</Pill>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => generate(true)}>Previsualizar plan</Button>
            </div>
            </div>
            {previewPlan ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 12, borderBottom: `1px solid ${colors.border}` }}>
                    <div>
                      <div style={{ color: colors.text, fontWeight: 950 }}>Asi quedaria la generacion</div>
                      <div style={{ color: colors.secondary, fontSize: 12, marginTop: 3 }}>{previewPlan.phase_name} - {previewPlan.lane_count} carriles - {draft.location_name}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Pill tone={previewPlan.seed_mode === 'leaderboard' ? colors.accent : colors.secondary}>{seedModeLabel(previewPlan.seed_mode)}</Pill>
                      {Number(previewPlan.advance_limit || 0) > 0 ? <Pill tone={colors.warning}>Top {previewPlan.advance_limit}</Pill> : null}
                      <Pill tone={colors.primary}>{previewHeats.length} heats</Pill>
                      <Pill tone={colors.accent}>{previewHeats.reduce((sum, heat) => sum + (heat.participants || []).length, 0)} atletas</Pill>
                    </div>
                  </div>
                  {previewPlan.existing?.heats ? (
                    <div style={{ borderBottom: `1px solid ${colors.border}`, background: 'rgba(245,158,11,0.10)', padding: 10, color: '#FBBF24', fontSize: 13 }}>
                      Ya existen {previewPlan.existing.heats} heats con {previewPlan.existing.assignments || 0} atletas asignados en este WOD. Al confirmar, se reemplazaran para evitar duplicados.
                    </div>
                  ) : null}
                  <div style={{ display: 'grid', gap: 10, padding: 10, maxHeight: 520, overflowY: 'auto' }}>
                    {previewHeats.map((heat, index) => (
                      <div key={`${heat.categoria || 'mixed'}-${heat.heat_number}-${index}`} style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 10, display: 'grid', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <div>
                            <strong style={{ color: colors.text }}>{heat.heat_label}</strong>
                            <div style={{ color: colors.secondary, fontSize: 12, marginTop: 3 }}>{formatHeatSchedule(heat)} - {heat.location_name || 'Sin ubicacion'}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <Pill tone={colors.accent}>{heat.categoria || 'Mixto'}</Pill>
                            <Pill tone={colors.primary}>{(heat.participants || []).length} atletas</Pill>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gap: 5 }}>
                          {(heat.participants || []).map((participant) => (
                            <div key={`${heat.heat_number}-${participant.user_id}`} style={{ display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr) auto', gap: 8, alignItems: 'center', border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.top, padding: '6px 8px' }}>
                              <span style={{ color: colors.muted, fontSize: 11, fontWeight: 900 }}>Carril {participant.lane_number}</span>
                              <span style={{ color: colors.text, fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{participant.name}</span>
                              {previewPlan.seed_mode === 'leaderboard' ? (
                                <span style={{ color: colors.secondary, fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap' }}>{participant.seed_position ? `#${participant.seed_position}` : 'Sin ranking'}</span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 12, borderBottom: `1px solid ${colors.border}` }}>
                    <div>
                      <div style={{ color: colors.text, fontWeight: 950 }}>Calendario de previsualizacion</div>
                      <div style={{ color: colors.secondary, fontSize: 12, marginTop: 3 }}>
                        {previewTargetDay ? `Dia ${new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${previewTargetDay}T12:00:00`))}` : 'Un dia de competencia'} - existentes y nuevos proyectados.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Pill tone={colors.primary}>{previewHeats.length} nuevos</Pill>
                      <Pill tone={colors.secondary}>{previewExistingHeats.length} existentes</Pill>
                      <Pill tone={previewOverlapCount ? colors.error : colors.success}>{previewOverlapCount} solapes</Pill>
                    </div>
                  </div>
                  <div style={{ overflow: 'auto' }}>
                    {previewSlots.length && previewLocationColumns.length ? (
                      <div style={{ minWidth: Math.max(760, 96 + previewLocationColumns.length * 240), display: 'grid', gridTemplateColumns: `96px repeat(${previewLocationColumns.length}, minmax(220px, 1fr))` }}>
                        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: colors.surface, borderBottom: `1px solid ${colors.border}`, borderRight: `1px solid ${colors.border}`, padding: 10, color: colors.secondary, fontSize: 12, fontWeight: 900 }}>Hora</div>
                        {previewLocationColumns.map((locationName) => (
                          <div key={locationName || 'sin-ubicacion'} style={{ position: 'sticky', top: 0, zIndex: 2, background: colors.surface, borderBottom: `1px solid ${colors.border}`, borderRight: `1px solid ${colors.border}`, padding: 10, color: colors.text, fontSize: 12, fontWeight: 900 }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <MapPin size={14} />
                              <span>{locationLabel(locationName)}</span>
                            </div>
                          </div>
                        ))}
                        {previewSlots.map((slot) => (
                          <div key={slot.toISOString()} style={{ display: 'contents' }}>
                            <div style={{ minHeight: 72, borderRight: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}`, padding: 8, color: colors.secondary, fontSize: 12, fontWeight: 800 }}>{new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(slot)}</div>
                            {previewLocationColumns.map((locationName) => {
                              const slotHeats = previewHeatsAtSlot(slot, locationName)
                              return (
                                <div key={`${locationName || 'sin-ubicacion'}-${slot.toISOString()}`} style={{ minHeight: 72, borderRight: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}`, padding: 7, background: slotHeats.length ? 'rgba(255,107,0,0.08)' : 'rgba(13,15,18,0.38)', display: 'grid', gap: 7 }}>
                                  {slotHeats.map((heat) => {
                                    const overlap = previewHasOverlap(heat)
                                    const isNew = heat.preview_kind === 'preview'
                                    return (
                                      <div key={heat.preview_key} style={{ border: `1px solid ${overlap ? colors.error : isNew ? colors.primary : colors.border}66`, background: overlap ? 'rgba(239,68,68,0.10)' : isNew ? colors.surface : colors.top, borderRadius: 8, padding: 9, display: 'grid', gap: 6 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                          <strong style={{ color: colors.text, fontSize: 13 }}>{heat.heat_label || heat.nombre || `Heat ${heat.heat_number}`}</strong>
                                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            <Pill tone={isNew ? colors.primary : colors.secondary}>{isNew ? 'Nuevo' : 'Existente'}</Pill>
                                            {overlap ? <Pill tone={colors.error}>Solape</Pill> : null}
                                          </div>
                                        </div>
                                        <div style={{ color: colors.secondary, fontSize: 11 }}>{formatHeatSchedule(heat)}</div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                          <Pill tone={colors.accent}>{heat.categoria || 'Mixto'}</Pill>
                                          <Pill tone={colors.accent}>{(heat.participants || heat.assignments || []).length} atletas</Pill>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ padding: 18, color: colors.secondary, fontSize: 13 }}>Sin horarios para previsualizar.</div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <Button onClick={() => setPreviewPlan(null)}><ArrowLeft size={16} />Volver a generacion</Button>
                  <Button tone="primary" onClick={() => generate(false)}>Confirmar generacion</Button>
                </div>
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
      {deleteWorkout ? (
        <Modal title="Eliminar heats del WOD" onClose={() => setDeleteWorkout(null)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ border: `1px solid ${colors.error}`, background: 'rgba(239,68,68,0.10)', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
              <div style={{ color: colors.text, fontWeight: 950 }}>{deleteWorkout.name}</div>
              <div style={{ color: colors.secondary, fontSize: 13, lineHeight: 1.5 }}>
                Se eliminaran todos los heats de este WOD, sus horarios y las asignaciones de atletas a carriles. No se eliminan atletas, resultados, categorias ni el WOD.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Pill tone={colors.primary}>{deleteWorkout.heats} heats</Pill>
                <Pill tone={colors.accent}>{deleteWorkout.athletes} atletas asignados</Pill>
                <Pill tone={colors.error}>Accion irreversible</Pill>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => setDeleteWorkout(null)}>Cancelar</Button>
              <Button tone="danger" onClick={confirmDeleteWorkoutHeats}>Eliminar todos los heats</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      {pendingMove ? (() => {
        const sourceParticipants = heatParticipants(pendingMove.sourceHeat)
        const targetParticipants = heatParticipants(pendingMove.targetHeat)
        const sameCategory = pendingMove.targetHeat ? String(pendingMove.sourceHeat.categoria || 'Todas') === String(pendingMove.targetHeat.categoria || 'Todas') : true
        const athleteName = pendingMove.participant.participant_name || pendingMove.participant.user_name || pendingMove.participant.team_name || 'Atleta'
        const destinations = heatDestinations(pendingMove.sourceHeat)
        return (
          <Modal title="Confirmar movimiento" onClose={() => setPendingMove(null)}>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 12, display: 'grid', gap: 10 }}>
                <div style={{ color: colors.secondary, fontSize: 12, fontWeight: 900 }}>Atleta</div>
                <div style={{ color: colors.text, fontSize: 16, fontWeight: 950 }}>{athleteName}</div>
              </div>
              <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 12 }}>
                  <div style={{ color: colors.muted, fontSize: 11, fontWeight: 900 }}>Origen</div>
                  <div style={{ color: colors.text, fontWeight: 900, marginTop: 6 }}>{pendingMove.sourceHeat.phase_name || pendingMove.sourceHeat.phase_id}</div>
                  <div style={{ color: colors.secondary, fontSize: 13, marginTop: 4 }}>{pendingMove.sourceHeat.categoria || 'Todas'} - {pendingMove.sourceHeat.heat_label || pendingMove.sourceHeat.nombre || `Heat ${pendingMove.sourceHeat.heat_number}`}</div>
                  <div style={{ color: colors.secondary, fontSize: 12, marginTop: 6 }}>{sourceParticipants.length} atletas actuales</div>
                </div>
                <div style={{ border: `1px solid ${sameCategory ? colors.border : colors.warning}`, background: sameCategory ? colors.top : 'rgba(245,158,11,0.10)', borderRadius: 8, padding: 12 }}>
                  <div style={{ color: sameCategory ? colors.muted : '#FBBF24', fontSize: 11, fontWeight: 900 }}>Destino</div>
                  <div style={{ color: colors.text, fontWeight: 900, marginTop: 6 }}>{pendingMove.targetHeat ? (pendingMove.targetHeat.phase_name || pendingMove.targetHeat.phase_id) : 'Selecciona destino'}</div>
                  <div style={{ color: colors.secondary, fontSize: 13, marginTop: 4 }}>{pendingMove.targetHeat ? `${pendingMove.targetHeat.categoria || 'Todas'} - ${pendingMove.targetHeat.heat_label || pendingMove.targetHeat.nombre || `Heat ${pendingMove.targetHeat.heat_number}`}` : 'Sin heat seleccionado'}</div>
                  <div style={{ color: colors.secondary, fontSize: 12, marginTop: 6 }}>{targetParticipants.length} atletas actuales</div>
                </div>
              </div>
              <Field label="Heat destino">
                <select
                  style={inputStyle()}
                  value={pendingMove.targetHeat?.id || ''}
                  onChange={(event) => {
                    const targetHeat = heats.find((item) => String(item.id) === String(event.target.value)) || null
                    setPendingMove((prev) => prev ? { ...prev, targetHeat } : prev)
                  }}
                >
                  <option value="">Seleccionar destino</option>
                  {destinations.map((target) => <option key={target.id} value={target.id}>{target.phase_name || target.phase_id} - {target.categoria || 'Todas'} - {target.heat_label || target.nombre || `Heat ${target.heat_number}`} ({heatParticipants(target).length} atletas)</option>)}
                </select>
              </Field>
              {!sameCategory ? (
                <div style={{ border: `1px solid ${colors.warning}`, background: 'rgba(245,158,11,0.10)', borderRadius: 8, padding: 12, color: '#FBBF24', fontSize: 13, lineHeight: 1.5 }}>
                  Movimiento entre categorias. El atleta quedara corriendo en un heat de otra categoria; revisa que sea intencional.
                </div>
              ) : null}
              {sourceParticipants.length === 1 ? (
                <div style={{ border: `1px solid ${colors.error}`, background: 'rgba(239,68,68,0.10)', borderRadius: 8, padding: 12, color: '#FCA5A5', fontSize: 13, lineHeight: 1.5 }}>
                  Este es el unico atleta del heat origen. Al confirmar, el heat origen se eliminara automaticamente.
                </div>
              ) : null}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <Button onClick={() => setPendingMove(null)}>Cancelar</Button>
                <Button tone="danger" onClick={confirmMoveParticipant} disabled={!pendingMove.targetHeat}>Confirmar movimiento</Button>
              </div>
            </div>
          </Modal>
        )
      })() : null}
      {scheduleModal ? (
        <Modal title={scheduleModal.mode === 'single' ? 'Editar horario del heat' : 'Mover horarios'} onClose={() => setScheduleModal(null)}>
          {scheduleModal.mode === 'single' ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 12 }}>
                <div style={{ color: colors.secondary, fontSize: 12, fontWeight: 900 }}>{scheduleModal.heat?.phase_name || scheduleModal.heat?.phase_id}</div>
                <div style={{ color: colors.text, fontWeight: 950, marginTop: 6 }}>{scheduleModal.heat?.categoria || 'Todas'} - {scheduleModal.heat?.heat_label || scheduleModal.heat?.nombre || `Heat ${scheduleModal.heat?.heat_number}`}</div>
              </div>
              <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                <Field label="Inicio"><input type="datetime-local" style={inputStyle()} value={scheduleDraft.start_at} onChange={(event) => setScheduleDraft((prev) => ({ ...prev, start_at: event.target.value }))} /></Field>
                <Field label="Fin"><input type="datetime-local" style={inputStyle()} value={scheduleDraft.end_at} onChange={(event) => setScheduleDraft((prev) => ({ ...prev, end_at: event.target.value }))} /></Field>
                <Field label="Ubicacion">
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
                    <select
                      style={inputStyle()}
                      value={scheduleDraft.location_name}
                      onChange={(event) => {
                        const location = heatLocations.find((item) => item.name === event.target.value)
                        setScheduleDraft((prev) => ({ ...prev, location_name: event.target.value, location_detail: location?.detail || '' }))
                      }}
                    >
                      <option value="">Sin ubicacion</option>
                      {heatLocations.map((location) => <option key={location.name} value={location.name}>{location.name}</option>)}
                    </select>
                    <Button onClick={() => openLocationManager()}><Plus size={16} /></Button>
                  </div>
                </Field>
                <Field label="Detalle"><input style={inputStyle()} value={scheduleDraft.location_detail} onChange={(event) => setScheduleDraft((prev) => ({ ...prev, location_detail: event.target.value }))} /></Field>
              </div>
              {scheduleDraft.location_name && findLocationConflicts(scheduleModal.heat, { start_at: toUtcOrNull(scheduleDraft.start_at), end_at: toUtcOrNull(scheduleDraft.end_at), location_name: scheduleDraft.location_name }).length ? (
                <div style={{ border: `1px solid ${colors.error}`, background: 'rgba(239,68,68,0.10)', borderRadius: 8, padding: 12, color: '#FCA5A5', fontSize: 13, lineHeight: 1.5 }}>
                  Esta ubicacion ya tiene un heat en ese horario.
                </div>
              ) : null}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <Button onClick={() => setScheduleModal(null)}>Cancelar</Button>
                <Button tone="primary" onClick={saveSingleSchedule}>Guardar horario</Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ border: `1px solid ${colors.warning}`, background: 'rgba(245,158,11,0.10)', borderRadius: 8, padding: 12, color: '#FBBF24', fontSize: 13, lineHeight: 1.5 }}>
                Esto solo mueve horarios. No cambia atletas, carriles ni categorias.
              </div>
              <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                <Field label="WOD"><select style={inputStyle()} value={scheduleDraft.phase_id} onChange={(event) => setScheduleDraft((prev) => ({ ...prev, phase_id: event.target.value, categoria: '', from_heat_id: '' }))}><option value="">Seleccionar</option>{(bundle.phases || []).map((phase) => <option key={phase.id} value={phase.id}>{phase.nombre}</option>)}</select></Field>
                <Field label="Categoria"><select style={inputStyle()} value={scheduleDraft.categoria} onChange={(event) => setScheduleDraft((prev) => ({ ...prev, categoria: event.target.value, from_heat_id: '' }))}><option value="">Todas</option>{[...new Set(heats.filter((heat) => String(heat.phase_id) === String(scheduleDraft.phase_id)).map((heat) => heat.categoria || 'Todas'))].map((category) => <option key={category} value={category}>{category}</option>)}</select></Field>
                <Field label="Desde heat"><select style={inputStyle()} value={scheduleDraft.from_heat_id} onChange={(event) => setScheduleDraft((prev) => ({ ...prev, from_heat_id: event.target.value }))}><option value="">Desde el primero</option>{heats.filter((heat) => String(heat.phase_id) === String(scheduleDraft.phase_id)).filter((heat) => !scheduleDraft.categoria || String(heat.categoria || 'Todas') === String(scheduleDraft.categoria)).map((heat) => <option key={heat.id} value={heat.id}>{heat.categoria || 'Todas'} - {heat.heat_label || heat.nombre || `Heat ${heat.heat_number}`} - {formatHeatSchedule(heat)}</option>)}</select></Field>
                <Field label="Cantidad de heats"><input type="number" min="0" style={inputStyle()} value={scheduleDraft.heat_count} placeholder="Todos" onChange={(event) => setScheduleDraft((prev) => ({ ...prev, heat_count: event.target.value }))} /></Field>
                <Field label="Mover minutos"><input type="number" style={inputStyle()} value={scheduleDraft.delta_minutes} onChange={(event) => setScheduleDraft((prev) => ({ ...prev, delta_minutes: event.target.value }))} /></Field>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <Button onClick={() => setScheduleModal(null)}>Cancelar</Button>
                <Button tone="danger" onClick={bulkShiftHeats}>Aplicar movimiento</Button>
              </div>
            </div>
          )}
        </Modal>
      ) : null}
      {locationModal ? (
        <Modal title="Ubicaciones" onClose={() => setLocationModal(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ color: colors.text, fontWeight: 950 }}>{locationDraft.originalName ? 'Editar ubicacion' : 'Crear ubicacion'}</div>
              <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                <Field label="Nombre"><input style={inputStyle()} value={locationDraft.name} placeholder="Coliseo, Cancha 1, Tarima principal" onChange={(event) => setLocationDraft((prev) => ({ ...prev, name: event.target.value }))} /></Field>
                <Field label="Detalle"><input style={inputStyle()} value={locationDraft.detail} placeholder="Zona norte, piso 2, entrada B" onChange={(event) => setLocationDraft((prev) => ({ ...prev, detail: event.target.value }))} /></Field>
              </div>
              <div style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 10, color: colors.secondary, fontSize: 13, lineHeight: 1.5 }}>
                Si un mismo espacio fisico funciona en paralelo, crealo como ubicaciones separadas: Cancha 1, Cancha 2.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                {locationDraft.originalName ? <Button onClick={() => setLocationDraft({ name: '', detail: '', originalName: '' })}>Nuevo</Button> : null}
                <Button tone="primary" onClick={saveLocation}><Save size={16} />{locationDraft.originalName ? 'Guardar cambios' : 'Crear ubicacion'}</Button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ color: colors.secondary, fontSize: 12, fontWeight: 900 }}>Ubicaciones creadas</div>
              {heatLocations.length ? heatLocations.map((location) => {
                const usedCount = heats.filter((heat) => String(heat.location_name || '').trim().toLowerCase() === location.name.toLowerCase()).length
                return (
                  <div key={location.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 8, alignItems: 'center', border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 10 }}>
                    <div>
                      <div style={{ color: colors.text, fontWeight: 900 }}>{location.name}</div>
                      <div style={{ color: colors.secondary, fontSize: 12, marginTop: 3 }}>{location.detail || 'Sin detalle adicional'}</div>
                      <div style={{ marginTop: 6 }}><Pill tone={usedCount ? colors.primary : colors.muted}>{usedCount} heats</Pill></div>
                    </div>
                    <Button onClick={() => openLocationManager(location)}>Editar</Button>
                    <Button tone="danger" onClick={() => deleteLocation(location)}>Eliminar</Button>
                  </div>
                )
              }) : (
                <div style={{ border: `1px solid ${colors.warning}`, background: 'rgba(245,158,11,0.10)', borderRadius: 8, padding: 12, color: '#FBBF24', fontSize: 13 }}>
                  No hay ubicaciones creadas.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={() => setLocationModal(false)}>Cerrar</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      <div className="fr-heat-mode-switch" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button tone={heatMode === 'participants' ? 'primary' : 'secondary'} onClick={() => setHeatMode('participants')}><Users size={16} />Heat participantes</Button>
        <Button tone={heatMode === 'schedule' ? 'primary' : 'secondary'} onClick={() => setHeatMode('schedule')}><Clock3 size={16} />Heat horario</Button>
      </div>
      {heatMode === 'schedule' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="fr-schedule-toolbar" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 10 }}>
            <Field label="WOD">
              <select style={inputStyle()} value={activeSchedulePhaseId} onChange={(event) => setSchedulePhaseId(event.target.value)}>
                <option value="all">Todos los WODs</option>
                {schedulePhaseOptions.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
              </select>
            </Field>
            <div className="fr-schedule-day-controls" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                onClick={() => setScheduleDay(scheduleDays[Math.max(0, activeScheduleDayIndex - 1)] || activeScheduleDay)}
                disabled={activeScheduleDayIndex <= 0}
              >
                <ArrowLeft size={16} />Dia anterior
              </Button>
              <Pill tone={colors.primary}>
                {activeScheduleDay ? new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${activeScheduleDay}T12:00:00`)) : 'Sin dia'}
              </Pill>
              <Button
                onClick={() => setScheduleDay(scheduleDays[Math.min(scheduleDays.length - 1, activeScheduleDayIndex + 1)] || activeScheduleDay)}
                disabled={activeScheduleDayIndex < 0 || activeScheduleDayIndex >= scheduleDays.length - 1}
              >
                Dia siguiente <ChevronRight size={16} />
              </Button>
            </div>
            <div className="fr-schedule-summary" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {showingAllSchedule ? <Pill tone={colors.secondary}>{schedulePhaseOptions.length} WODs</Pill> : null}
              <Pill tone={colors.primary}>{scheduleDayHeats.length} heats</Pill>
              {scheduleDays.length > 1 ? <Pill tone={colors.secondary}>Dia {activeScheduleDayIndex + 1} de {scheduleDays.length}</Pill> : null}
              <Pill tone={colors.accent}>{scheduleCategories.length} categorias</Pill>
              <Pill tone={scheduleMissingLocations ? colors.warning : colors.success}>{scheduleMissingLocations} sin ubicacion</Pill>
              <Pill tone={scheduleConflictCount ? colors.error : colors.success}>{scheduleConflictCount} solapes</Pill>
              <Button onClick={openBulkSchedule}><Clock3 size={16} />Mover bloque</Button>
            </div>
          </div>
          <div className="fr-schedule-mobile" style={{ display: 'none' }}>
            {scheduleDayHeats.length ? (
              [...scheduleDayHeats]
                .sort((a, b) => new Date(a.start_at || 0).getTime() - new Date(b.start_at || 0).getTime() || String(a.location_name || '').localeCompare(String(b.location_name || '')))
                .map((heat) => {
                  const participants = heatParticipants(heat)
                  const duration = formatHeatDuration(heat)
                  const locationConflict = hasLocationConflict(heat)
                  const wodTone = wodColorFor(heat.phase_id || heat.phase_name)
                  return (
                    <div key={heat.id} className="fr-schedule-card" style={{ border: `1px solid ${locationConflict ? colors.error : wodTone}`, borderLeft: `5px solid ${wodTone}`, background: locationConflict ? 'rgba(239,68,68,0.10)' : `${wodTone}14`, borderRadius: 8, padding: 12, display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: colors.primary, fontSize: 12, fontWeight: 950 }}>{formatHeatScheduleCompact(heat)}</div>
                          <div style={{ marginTop: 5, color: colors.text, fontSize: 15, fontWeight: 950 }}>{heat.heat_label || heat.nombre || `Heat ${heat.heat_number}`}</div>
                        </div>
                        <Button onClick={() => openSingleSchedule(heat)}><Clock3 size={14} />Editar</Button>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {showingAllSchedule ? <Pill tone={wodTone}>{heat.phase_name || `WOD ${heat.phase_id || ''}`}</Pill> : null}
                        <Pill tone={colors.accent}>{heat.categoria || 'Todas'}</Pill>
                        <Pill tone={heat.location_name ? colors.primary : colors.warning}>{locationLabel(heat.location_name)}</Pill>
                        {duration ? <Pill tone={colors.primary}>{duration}</Pill> : null}
                        <Pill tone={colors.accent}>{participants.length} atletas</Pill>
                        {locationConflict ? <Pill tone={colors.error}>Solape</Pill> : null}
                      </div>
                      {heat.location_detail ? <div style={{ color: colors.secondary, fontSize: 12 }}><MapPin size={12} style={{ verticalAlign: -2 }} /> {heat.location_detail}</div> : null}
                    </div>
                  )
                })
            ) : (
              <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 14, color: colors.secondary, fontSize: 13 }}>Genera heats con horario para ver la agenda.</div>
            )}
          </div>
          <div className="fr-schedule-desktop" style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'auto', background: colors.top }}>
            {scheduleSlots.length && scheduleLocationColumns.length ? (
              <div style={{ minWidth: Math.max(760, 96 + scheduleLocationColumns.length * 240), display: 'grid', gridTemplateColumns: `96px repeat(${scheduleLocationColumns.length}, minmax(220px, 1fr))` }}>
                <div style={{ position: 'sticky', top: 0, zIndex: 2, background: colors.surface, borderBottom: `1px solid ${colors.border}`, borderRight: `1px solid ${colors.border}`, padding: 10, color: colors.secondary, fontSize: 12, fontWeight: 900 }}>Hora</div>
                {scheduleLocationColumns.map((locationName) => {
                  const location = heatLocations.find((item) => item.name === locationName)
                  const columnConflicts = scheduleDayHeats.filter((heat) => String(heat.location_name || '').trim().toLowerCase() === String(locationName || '').trim().toLowerCase()).filter((heat) => hasLocationConflict(heat)).length
                  return (
                    <div key={locationName || 'sin-ubicacion'} style={{ position: 'sticky', top: 0, zIndex: 2, background: colors.surface, borderBottom: `1px solid ${colors.border}`, borderRight: `1px solid ${colors.border}`, padding: 10, color: colors.text, fontSize: 12, fontWeight: 900 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <MapPin size={14} />
                        <span>{locationLabel(locationName)}</span>
                        {columnConflicts ? <Pill tone={colors.error}>{columnConflicts} solapes</Pill> : null}
                      </div>
                      {location?.detail ? <div style={{ color: colors.secondary, fontSize: 11, marginTop: 4, fontWeight: 700 }}>{location.detail}</div> : null}
                    </div>
                  )
                })}
                {scheduleSlots.map((slot) => {
                  return (
                    <div key={slot.toISOString()} style={{ display: 'contents' }}>
                      <div style={{ minHeight: 72, borderRight: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}`, padding: 8, color: colors.secondary, fontSize: 12, fontWeight: 800 }}>{new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(slot)}</div>
                      {scheduleLocationColumns.map((locationName) => {
                        const slotHeats = heatsAtSlot(slot, locationName)
                        return (
                          <div
                            key={`${locationName || 'sin-ubicacion'}-${slot.toISOString()}`}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault()
                              const heatId = event.dataTransfer.getData('text/plain') || draggingHeatId
                              const dragged = scheduleHeats.find((item) => String(item.id) === String(heatId))
                              if (dragged) moveHeatSchedule(dragged, slot, locationName)
                            }}
                            style={{ minHeight: 72, borderRight: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}`, padding: 7, background: slotHeats.length ? 'rgba(255,107,0,0.08)' : 'rgba(13,15,18,0.38)', display: 'grid', gap: 7 }}
                          >
                            {slotHeats.map((heat) => {
                              const participants = heatParticipants(heat)
                              const duration = formatHeatDuration(heat)
                              const locationConflict = hasLocationConflict(heat)
                              const wodTone = wodColorFor(heat.phase_id || heat.phase_name)
                              return (
                                <div
                                  key={heat.id}
                                  draggable
                                  onDragStart={(event) => {
                                    setDraggingHeatId(String(heat.id))
                                    event.dataTransfer.setData('text/plain', String(heat.id))
                                  }}
                                  onDragEnd={() => setDraggingHeatId('')}
                                  style={{ border: `1px solid ${locationConflict ? colors.error : wodTone}88`, borderLeft: `5px solid ${wodTone}`, background: locationConflict ? 'rgba(239,68,68,0.10)' : `${wodTone}14`, borderRadius: 8, padding: 9, cursor: 'grab', display: 'grid', gap: 6 }}
                                >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                          <strong style={{ color: colors.text, fontSize: 13 }}>{heat.heat_label || heat.nombre || `Heat ${heat.heat_number}`}</strong>
                                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {showingAllSchedule ? <Pill tone={wodTone}>{heat.phase_name || `WOD ${heat.phase_id || ''}`}</Pill> : null}
                                            <Pill tone={colors.accent}>{heat.categoria || 'Todas'}</Pill>
                                            {locationConflict ? <Pill tone={colors.error}>Solape</Pill> : null}
                                            <Pill tone={colors.accent}>{participants.length}</Pill>
                                    </div>
                                  </div>
                                  {heat.location_detail ? <div style={{ color: colors.secondary, fontSize: 11 }}><MapPin size={12} style={{ verticalAlign: -2 }} /> {heat.location_detail}</div> : null}
                                  <div style={{ color: colors.secondary, fontSize: 11 }}>{formatHeatSchedule(heat)}</div>
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {duration ? <Pill tone={colors.primary}>{duration}</Pill> : null}
                                    <Button onClick={() => openSingleSchedule(heat)}><Clock3 size={14} /></Button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ padding: 18, color: colors.secondary, fontSize: 13 }}>Genera heats con horario para ver la agenda.</div>
            )}
          </div>
        </div>
      ) : (
      <div style={{ display: 'grid', gap: 12 }}>
        {heatsByWorkout.map((workout, workoutIndex) => {
          const collapsed = collapsedWorkouts[workout.id] ?? workoutIndex > 0
          const workoutTone = wodColorFor(workout.id || workout.name)
          return (
          <section key={workout.id} style={{ border: `1px solid ${workoutTone}66`, background: colors.top, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '11px 12px', borderBottom: `1px solid ${colors.border}`, borderLeft: `6px solid ${workoutTone}`, background: `${workoutTone}14`, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setCollapsedWorkouts((prev) => ({ ...prev, [workout.id]: !collapsed }))} style={{ border: 0, background: 'transparent', color: colors.text, padding: 0, display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', minWidth: 0 }}>
                {collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                <div>
                  <div style={{ color: colors.text, fontWeight: 950 }}>{workout.name}</div>
                  <div style={{ color: colors.secondary, fontSize: 12, marginTop: 3 }}>{workout.categories.length} categorias - {workout.heats} heats - {workout.athletes} atletas asignados</div>
                </div>
              </button>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Pill tone={workoutTone}>{workout.heats} heats</Pill>
                <Button tone="danger" onClick={() => setDeleteWorkout(workout)}>Eliminar WOD</Button>
              </div>
            </div>
            {!collapsed ? <div style={{ display: 'grid', gap: 10, padding: 10 }}>
              {workout.categories.map((group) => (
                <section key={`${workout.id}-${group.category}`} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.bg, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '9px 10px', borderBottom: `1px solid ${colors.border}`, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ color: colors.text, fontWeight: 900 }}>{group.category}</div>
                      <div style={{ color: colors.secondary, fontSize: 12, marginTop: 2 }}>{group.heats.length} heats - {group.athletes} atletas asignados</div>
                    </div>
                    <Pill tone={colors.accent}>{group.athletes} atletas</Pill>
                  </div>
                  <div style={{ display: 'grid', gap: 8, padding: 10 }}>
                    {group.heats.map((heat) => {
                      const participants = heatParticipants(heat)
                      const destinations = heatDestinations(heat)
                      const duration = formatHeatDuration(heat)
                      const heatGap = Math.round(Number(heat.heat_transition_seconds || 0) / 60)
                      const categoryGap = Math.round(Number(heat.category_transition_seconds || 0) / 60)
                      const locationConflict = hasLocationConflict(heat)
                      const wodTone = wodColorFor(heat.phase_id || workout.id || workout.name)
                      return (
                        <div key={heat.id} style={{ border: `1px solid ${locationConflict ? colors.error : wodTone}88`, borderLeft: `5px solid ${wodTone}`, background: locationConflict ? 'rgba(239,68,68,0.08)' : `${wodTone}10`, borderRadius: 8, padding: 10, display: 'grid', gap: 10 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 10, alignItems: 'center' }}>
                            <div>
                              <strong>{heat.heat_label || heat.nombre || `Heat ${heat.heat_number}`}</strong>
                              <div style={{ color: colors.secondary, fontSize: 12, marginTop: 3 }}>{formatHeatSchedule(heat)}</div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                                <Pill tone={wodTone}>{participants.length} atletas</Pill>
                                <Pill tone={heat.location_name ? colors.primary : colors.warning}>{heat.location_name || 'Sin ubicacion'}</Pill>
                                {locationConflict ? <Pill tone={colors.error}>Solape</Pill> : null}
                                {duration ? <Pill tone={colors.primary}>Duracion {duration}</Pill> : null}
                                {heatGap ? <Pill tone={colors.border}>+{heatGap} min entre heats</Pill> : null}
                                {categoryGap ? <Pill tone={colors.warning}>+{categoryGap} min categoria</Pill> : null}
                              </div>
                              {heat.location_detail ? <div style={{ color: colors.secondary, fontSize: 12, marginTop: 5 }}><MapPin size={12} style={{ verticalAlign: -2 }} /> {heat.location_detail}</div> : null}
                            </div>
                            <Pill tone={heat.is_published ? colors.success : colors.warning}>{heat.is_published ? 'Publicado' : 'Borrador'}</Pill>
                            <Button onClick={() => openSingleSchedule(heat)}><Clock3 size={16} />Horario</Button>
                            <Button tone="danger" onClick={() => removeHeat(heat)}>Eliminar</Button>
                          </div>
                          <details style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 9 }}>
                            <summary style={{ cursor: 'pointer', color: colors.accent, fontSize: 12, fontWeight: 900 }}>Ver atletas del heat</summary>
                            <div style={{ display: 'grid', gap: 6, marginTop: 9, maxHeight: 260, overflowY: 'auto' }}>
                              {participants.length ? participants.map((participant) => (
                                  <div key={participant.id || `${participant.user_id || participant.team_id}-${participant.lane_number || participant.seed_order}`} style={{ display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr) auto', gap: 8, alignItems: 'center', border: `1px solid ${wodTone}55`, borderLeft: `4px solid ${wodTone}`, borderRadius: 8, background: colors.surface, padding: '7px 9px' }}>
                                    <span style={{ color: colors.muted, fontSize: 11, fontWeight: 900 }}>Carril {participant.lane_number || '-'}</span>
                                    <span style={{ color: colors.text, fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{participant.participant_name || participant.user_name || participant.team_name || 'Atleta'}</span>
                                    <Button onClick={() => openMoveConfirmation(heat, participant)} disabled={!destinations.length}>Mover</Button>
                                  </div>
                              )) : (
                                <div style={{ color: colors.secondary, fontSize: 12 }}>Sin atletas asignados.</div>
                              )}
                            </div>
                          </details>
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div> : null}
          </section>
        )})}
      </div>
      )}
    </Panel>
  )
}

function TeamsPanel({ bundle, reload, notify }) {
  const competition = bundle.competition
  const [draft, setDraft] = useState({ nombre: '', member_ids: [], team_category_id: '' })
  const [modalOpen, setModalOpen] = useState(false)
  const toggleMember = (id) => setDraft((prev) => {
    const exists = prev.member_ids.includes(id)
    const next = exists ? prev.member_ids.filter((item) => item !== id) : [...prev.member_ids, id].slice(0, competition.team_size || 2)
    return { ...prev, member_ids: next }
  })
  const create = async () => {
    try {
      await api('/teams', { method: 'POST', body: JSON.stringify({ nombre: draft.nombre, competition_id: competition.id, member_ids: draft.member_ids, team_category_id: draft.team_category_id ? Number(draft.team_category_id) : null }) })
      notify('Equipo creado')
      setDraft({ nombre: '', member_ids: [], team_category_id: '' })
      setModalOpen(false)
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const remove = async (team) => {
    if (!window.confirm(`Eliminar equipo ${team.nombre}?`)) return
    try {
      await api(`/teams/${team.id}`, { method: 'DELETE' })
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  return (
    <Panel title="Equipos" subtitle="Crea equipos con atletas inscritos." action={<Button tone="primary" onClick={() => setModalOpen(true)} disabled={!competition.team_enabled}>Crear equipo</Button>}>
      {modalOpen ? (
        <Modal title="Crear equipo" onClose={() => setModalOpen(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
              <Field label="Nombre equipo"><input style={inputStyle()} value={draft.nombre} onChange={(e) => setDraft((p) => ({ ...p, nombre: e.target.value }))} /></Field>
              <Field label="Categoria equipo"><select style={inputStyle()} value={draft.team_category_id} onChange={(e) => setDraft((p) => ({ ...p, team_category_id: e.target.value }))}><option value="">Auto</option>{(bundle.categories || []).filter((cat) => String(cat.modality).includes('team')).map((cat) => <option key={cat.id} value={cat.id}>{cat.nombre}</option>)}</select></Field>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxHeight: 260, overflowY: 'auto', border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10, background: colors.top }}>
              {(bundle.participants || []).filter((p) => p.estado === 'confirmado').slice(0, 80).map((p) => (
                <button key={p.user_id || p.id} type="button" onClick={() => toggleMember(p.user_id || p.id)} style={{ border: `1px solid ${draft.member_ids.includes(p.user_id || p.id) ? colors.accent : colors.border}`, background: draft.member_ids.includes(p.user_id || p.id) ? 'rgba(0,194,168,0.12)' : colors.surface, color: colors.text, borderRadius: 999, padding: '7px 10px', fontSize: 12 }}>
                  {p.nombre} {p.apellido}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button tone="primary" onClick={create}>Crear equipo</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      {(bundle.teams || []).map((team) => (
        <div key={team.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 10 }}>
          <div><strong>{team.nombre}</strong><div style={{ color: colors.secondary, fontSize: 12 }}>{(team.members || []).map((m) => `${m.nombre} ${m.apellido}`).join(', ') || 'Sin miembros'}</div></div>
          <Button tone="danger" onClick={() => remove(team)}>Eliminar</Button>
        </div>
      ))}
    </Panel>
  )
}

const scoringModeOptions = [
  {
    id: 'auto_table',
    label: 'Tipo CrossFit Games',
    summary: 'Gana mayor total. Reparte de 100 a 0 segun atletas rankeados.',
    example: ['30 atletas', '1o = 100 pts', '2o = 96 pts', '30o = 0 pts'],
    warning: 'Pensado para categorias de 20+ participantes. Cada categoria usa su propio tamano de field.',
  },
  {
    id: 'dynamic_step',
    label: 'Puntos por paso',
    summary: 'Gana mayor total. Cada puesto baja una diferencia fija.',
    example: ['Paso 3', '10 atletas', '1o = 30 pts', '10o = 3 pts'],
    warning: 'Usa la totalidad de atletas rankeados y multiplica cada puesto por el paso definido.',
  },
  {
    id: 'placement',
    label: 'Tipo Open',
    summary: 'Gana menor total. La posicion se convierte directamente en puntos.',
    example: ['1o = 1 pt', '2o = 2 pts', '3o = 3 pts'],
    warning: 'Modelo oficial tipo Open o clasificatorio. Gana quien acumula menos puntos.',
  },
  {
    id: 'fixed_table',
    label: 'Tabla fija avanzada',
    summary: 'Gana mayor total. Cada posicion tiene puntos definidos.',
    example: ['1o = 100 pts', '2o = 95 pts', '3o = 90 pts'],
    warning: 'Modo avanzado para reglamentos con tabla propia o finales con pesos especiales.',
  },
]

const legacyScoringModeOptions = [
  {
    id: 'dynamic_points',
    label: 'Puntos dinamicos clasico',
    summary: 'Gana mayor total. Cada WOD reparte puntos segun atletas con resultado.',
    example: ['10 atletas', '1o = 10 pts', '2o = 9 pts', '10o = 1 pt'],
    warning: 'Modo heredado. Para nuevas competencias usa Puntos por paso con diferencia 1 o mas.',
  },
  {
    id: 'cumulative',
    label: 'Puntos acumulados',
    summary: 'Suma marcas crudas. Usalo solo si todos los WODs comparten unidad.',
    example: ['120 reps + 95 reps', 'Total = 215 reps'],
    warning: 'Modo avanzado. No recomendado si mezclas tiempo, reps y peso.',
  },
]

const defaultScoringTable = [
  { rank: 1, points: 100 },
  { rank: 2, points: 95 },
  { rank: 3, points: 90 },
  { rank: 4, points: 85 },
  { rank: 5, points: 80 },
  { rank: 6, points: 75 },
  { rank: 7, points: 70 },
  { rank: 8, points: 65 },
  { rank: 9, points: 60 },
  { rank: 10, points: 55 },
]

function normalizeScoringTableInput(value) {
  if (Array.isArray(value)) return value.map((item) => ({ rank: Number(item.rank || 0), points: Number(item.points || 0) })).filter((item) => item.rank > 0)
  if (!value) return []
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return normalizeScoringTableInput(parsed)
  } catch {
    return []
  }
}

function scoringTablePoints(table, position) {
  const row = normalizeScoringTableInput(table).find((item) => Number(item.rank) === Number(position))
  return row ? Number(row.points || 0) : 0
}

function autoTablePoints(position, totalRanked) {
  const pos = Number(position || 0)
  const total = Number(totalRanked || 0)
  if (pos <= 0 || total <= 0 || pos > total) return 0
  if (total === 1) return 100
  const gaps = total - 1
  const baseDrop = Math.floor(100 / gaps)
  const largerDropCount = 100 % gaps
  const completedGaps = pos - 1
  const largerGapsUsed = Math.min(completedGaps, largerDropCount)
  const regularGapsUsed = completedGaps - largerGapsUsed
  return Math.max(0, 100 - (largerGapsUsed * (baseDrop + 1)) - (regularGapsUsed * baseDrop))
}

function normalizePointStep(value) {
  const parsed = Number(value || 1)
  return Math.max(1, Math.min(99, Number.isFinite(parsed) ? Math.round(parsed) : 1))
}

function pointStepInputValue(value) {
  if (value === '') return ''
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  return String(Math.min(99, Math.max(1, Number(digits))))
}

function previewPointsForScoring(config, position, totalRanked, mark) {
  if (Number(mark) === 2147483647 || Number(mark) === -2147483648) return 0
  const system = String(config?.system || config?.scoring_system || 'dynamic_points').trim().toLowerCase()
  let base = Math.max(0, Number(totalRanked || 0) - Number(position || 0) + 1)
  if (system === 'placement') base = Number(position || 0)
  if (system === 'fixed_table') base = scoringTablePoints(config?.table || config?.scoring_table || defaultScoringTable, position)
  if (system === 'auto_table') base = autoTablePoints(position, totalRanked)
  if (system === 'dynamic_step') base = Math.max(0, Number(totalRanked || 0) - Number(position || 0) + 1) * normalizePointStep(config?.point_step ?? config?.scoring_point_step)
  if (system === 'cumulative') base = Number(mark || 0)
  const weight = Number(config?.weight_percent ?? config?.scoring_weight_percent ?? 100)
  return Math.round(base * weight / 100)
}

function scoringPreviewLabel(config) {
  const system = String(config?.system || config?.scoring_system || 'dynamic_points').trim().toLowerCase()
  if (system === 'dynamic_step') return 'Puntos por paso: mayor total gana'
  if (system === 'placement') return 'Posicion: menor total gana'
  if (system === 'fixed_table') return 'Tabla fija: mayor total gana'
  if (system === 'auto_table') return 'Tipo CrossFit Games: mayor total gana'
  if (system === 'cumulative') return String(config?.cumulative_direction || '').toLowerCase() === 'lower_wins' ? 'Acumulado: menor total gana' : 'Acumulado: mayor total gana'
  return 'Puntos dinamicos: mayor total gana'
}

function ScoringPanel({ bundle, reload, notify }) {
  const competition = bundle.competition
  const scoring = bundle.scoring || {}
  const resultsCount = Number(scoring.results_count ?? (bundle.results || []).length)
  const [draft, setDraft] = useState(() => ({
    scoring_system: scoring.scoring_system || competition.scoring_system || 'dynamic_points',
    scoring_scope: scoring.scoring_scope || competition.scoring_scope || 'category',
    scoring_tiebreak: scoring.scoring_tiebreak || competition.scoring_tiebreak || 'best_positions',
    cumulative_direction: scoring.cumulative_direction || competition.cumulative_direction || 'higher_wins',
    scoring_point_step: normalizePointStep(scoring.scoring_point_step ?? competition.scoring_point_step ?? 3),
    scoring_table: normalizeScoringTableInput(scoring.scoring_table || competition.scoring_table || defaultScoringTable),
  }))
  const [saving, setSaving] = useState(false)
  const updateDraft = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }))
  const visibleScoringModeOptions = scoringModeOptions.some((item) => item.id === draft.scoring_system)
    ? scoringModeOptions
    : [...scoringModeOptions, ...legacyScoringModeOptions.filter((item) => item.id === draft.scoring_system)]
  const selectedMode = visibleScoringModeOptions.find((item) => item.id === draft.scoring_system) || scoringModeOptions[0]
  const tableRows = draft.scoring_table.length ? draft.scoring_table : defaultScoringTable
  const setTableRow = (index, key, value) => {
    const next = [...tableRows]
    next[index] = { ...next[index], [key]: Number(value || 0) }
    updateDraft('scoring_table', next)
  }
  const addTableRow = () => {
    const nextRank = Math.max(0, ...tableRows.map((item) => Number(item.rank || 0))) + 1
    updateDraft('scoring_table', [...tableRows, { rank: nextRank, points: 0 }])
  }
  const save = async () => {
    const shouldRecalculate = resultsCount > 0
      ? window.confirm(`Hay ${resultsCount} resultado(s) cargado(s). Guardar esta configuracion recalculara puntos y posiciones.`)
      : true
    if (!shouldRecalculate) return
    setSaving(true)
    try {
      await api(`/competitions/${competition.id}/scoring`, {
        method: 'PUT',
        body: JSON.stringify({
          ...draft,
          scoring_table: draft.scoring_system === 'fixed_table' ? tableRows : [],
          scoring_point_step: normalizePointStep(draft.scoring_point_step),
          recalculate: resultsCount > 0 ? 1 : 0,
        }),
      })
      notify(resultsCount > 0 ? 'Puntuacion guardada y recalculada' : 'Puntuacion guardada')
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  const updatePhaseScoring = async (phase, patch) => {
    try {
      await api(`/competitions/${competition.id}/phases/${phase.id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      })
      notify('Puntuacion del WOD actualizada')
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  return (
    <Panel title="Puntuacion" subtitle="Define como las posiciones de cada WOD se convierten en puntos del leaderboard." action={<Button tone="primary" onClick={save} disabled={saving}><Save size={16} />{saving ? 'Guardando...' : 'Guardar regla'}</Button>}>
      {resultsCount > 0 ? (
        <div style={{ border: `1px solid rgba(245,158,11,0.45)`, background: 'rgba(245,158,11,0.10)', borderRadius: 8, padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start', color: colors.text }}>
          <AlertTriangle size={18} color={colors.warning} />
          <div>
            <strong>{resultsCount} resultado(s) cargado(s)</strong>
            <div style={{ color: colors.secondary, fontSize: 12, marginTop: 3 }}>Guardar cambios recalcula puntos y posiciones de los WODs con resultados.</div>
          </div>
        </div>
      ) : null}

      <div className="fr-form-grid fr-scoring-mode-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        {visibleScoringModeOptions.map((item) => {
          const active = draft.scoring_system === item.id
          return (
            <button key={item.id} type="button" onClick={() => updateDraft('scoring_system', item.id)} style={{ textAlign: 'left', border: `1px solid ${active ? colors.primary : colors.border}`, background: active ? 'rgba(255,107,0,0.12)' : colors.top, color: colors.text, borderRadius: 8, padding: 12, display: 'grid', gap: 9 }}>
              <span style={{ fontSize: 14, fontWeight: 950 }}>{item.label}</span>
              <span style={{ color: colors.secondary, fontSize: 12, lineHeight: 1.45 }}>{item.summary}</span>
              <span style={{ color: active ? '#FFB36F' : colors.muted, fontSize: 11, lineHeight: 1.45 }}>{item.example.join(' | ')}</span>
            </button>
          )
        })}
      </div>

      <div className="fr-scoring-settings" style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 12, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: 16 }}>{selectedMode.label}</h3>
            <div style={{ color: colors.secondary, fontSize: 12, marginTop: 4 }}>{selectedMode.warning}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Field label="Agrupar por">
              <select style={inputStyle()} value={draft.scoring_scope} onChange={(event) => updateDraft('scoring_scope', event.target.value)}>
                <option value="category">Categoria</option>
                <option value="global">Global</option>
              </select>
            </Field>
            <Field label="Desempate general">
              <select style={inputStyle()} value={draft.scoring_tiebreak} onChange={(event) => updateDraft('scoring_tiebreak', event.target.value)}>
                <option value="best_positions">Mejores posiciones</option>
                <option value="first_places">Mas primeros lugares</option>
                <option value="final_workout">WOD final</option>
              </select>
            </Field>
            {draft.scoring_system === 'cumulative' ? (
              <Field label="Total acumulado">
                <select style={inputStyle()} value={draft.cumulative_direction} onChange={(event) => updateDraft('cumulative_direction', event.target.value)}>
                  <option value="higher_wins">Mayor total gana</option>
                  <option value="lower_wins">Menor total gana</option>
                </select>
              </Field>
            ) : null}
            {draft.scoring_system === 'dynamic_step' ? (
              <Field label="Diferencia">
                <input type="number" min="1" max="99" step="1" style={inputStyle()} value={draft.scoring_point_step ?? ''} onWheel={preventNumberInputWheel} onBlur={(event) => updateDraft('scoring_point_step', normalizePointStep(event.target.value))} onChange={(event) => updateDraft('scoring_point_step', pointStepInputValue(event.target.value))} />
              </Field>
            ) : null}
          </div>
        </div>

        {draft.scoring_system === 'fixed_table' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>Tabla de puntos</strong>
              <Button onClick={addTableRow}><Plus size={15} />Agregar posicion</Button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              {tableRows.map((item, index) => (
                <div key={`${item.rank}-${index}`} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <input type="number" min="1" style={inputStyle()} value={item.rank} onWheel={preventNumberInputWheel} onChange={(event) => setTableRow(index, 'rank', event.target.value)} />
                  <input type="number" min="0" style={inputStyle()} value={item.points} onWheel={preventNumberInputWheel} onChange={(event) => setTableRow(index, 'points', event.target.value)} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 12, display: 'grid', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 16 }}>Overrides por WOD</h3>
          <div style={{ color: colors.secondary, fontSize: 12, marginTop: 4 }}>Usa el peso para finales o WODs decisivos. 200% duplica los puntos de ese WOD.</div>
        </div>
        {(bundle.phases || []).length ? (bundle.phases || []).map((phase) => {
          const phaseScoring = (scoring.phases || []).find((item) => String(item.id) === String(phase.id)) || phase
          const override = Number(phaseScoring.scoring_override_enabled || phase.scoring_override_enabled || 0) ? 1 : 0
          const phaseSystem = phaseScoring.scoring_system || phase.scoring_system || draft.scoring_system
          const phaseWeight = Number(phaseScoring.scoring_weight_percent ?? phase.scoring_weight_percent ?? 100)
          const phasePointStep = normalizePointStep(phaseScoring.scoring_point_step ?? phase.scoring_point_step ?? draft.scoring_point_step ?? 3)
          return (
            <div key={phase.id} className="fr-scoring-phase-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 150px 110px 110px 150px', gap: 10, alignItems: 'center', border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10 }}>
              <div>
                <strong>{phase.nombre}</strong>
                <div style={{ color: colors.secondary, fontSize: 12, marginTop: 3 }}>{override ? 'Personalizado' : 'Regla de la competencia'}</div>
              </div>
              <select style={inputStyle()} value={override ? 'custom' : 'event'} onChange={(event) => updatePhaseScoring(phase, { scoring_override_enabled: event.target.value === 'custom' ? 1 : 0 })}>
                <option value="event">Regla evento</option>
                <option value="custom">Personalizado</option>
              </select>
              <input type="number" min="0" max="1000" step="25" style={inputStyle()} value={phaseWeight} disabled={!override} onWheel={preventNumberInputWheel} onChange={(event) => updatePhaseScoring(phase, { scoring_override_enabled: 1, scoring_weight_percent: Number(event.target.value || 0) })} />
              <input type="number" min="1" max="99" step="1" style={inputStyle()} value={phasePointStep} disabled={!override || phaseSystem !== 'dynamic_step'} onWheel={preventNumberInputWheel} onChange={(event) => updatePhaseScoring(phase, { scoring_override_enabled: 1, scoring_point_step: normalizePointStep(event.target.value) })} />
              <select style={inputStyle()} value={phaseSystem} disabled={!override} onChange={(event) => updatePhaseScoring(phase, { scoring_override_enabled: 1, scoring_system: event.target.value })}>
                {(visibleScoringModeOptions.some((item) => item.id === phaseSystem) ? visibleScoringModeOptions : [...visibleScoringModeOptions, ...legacyScoringModeOptions.filter((item) => item.id === phaseSystem)]).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </div>
          )
        }) : (
          <div style={{ color: colors.secondary, fontSize: 13 }}>Crea fases antes de configurar overrides.</div>
        )}
      </div>
    </Panel>
  )
}

function PreparePanel({ bundle, reload, notify }) {
  const [section, setSection] = useState('phases')
  const modules = [
    { id: 'phases', label: 'Fases', icon: CalendarDays, count: (bundle.phases || []).length },
    { id: 'scoring', label: 'Puntuacion', icon: Trophy },
    { id: 'heats', label: 'Heats', icon: Zap, count: (bundle.heats?.items || []).length },
    { id: 'teams', label: 'Equipos', icon: Users, count: (bundle.teams || []).length },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <ModuleTabs items={modules} active={section} onChange={setSection} />
      {section === 'phases' && <PhasesPanel bundle={bundle} reload={reload} notify={notify} />}
      {section === 'scoring' && <ScoringPanel bundle={bundle} reload={reload} notify={notify} />}
      {section === 'heats' && <HeatsPanel bundle={bundle} reload={reload} notify={notify} />}
      {section === 'teams' && <TeamsPanel bundle={bundle} reload={reload} notify={notify} />}
    </div>
  )
}

function ResultsPanel({ bundle, reload, notify }) {
  const competition = bundle.competition
  const heats = bundle.heats?.items || []
  const phaseOptions = bundle.phases || []
  const [scoreDraft, setScoreDraft] = useState({ phase_id: phaseOptions[0]?.id ? String(phaseOptions[0].id) : '', heat_id: '', category: '' })
  const [marks, setMarks] = useState({})
  const [editingRows, setEditingRows] = useState({})
  const selectedPhase = (bundle.phases || []).find((phase) => String(phase.id) === String(scoreDraft.phase_id))
  const phaseHeats = heats
    .filter((heat) => String(heat.phase_id) === String(scoreDraft.phase_id))
    .sort((a, b) => String(a.categoria || 'Todas').localeCompare(String(b.categoria || 'Todas')) || Number(a.heat_number || 0) - Number(b.heat_number || 0))
  const heatParticipants = (heat) => (heat.participants || heat.assignments || [])
  const participantName = (participant) => participant.participant_name || participant.user_name || participant.team_name || participant.name || 'Atleta'
  const resultEntityKey = (item) => item.team_id ? `team-${item.team_id}` : `user-${item.user_id || item.id}`
  const resultKey = (phaseId, item) => `${phaseId}:${resultEntityKey(item)}`
  const existingResultFor = (item) => {
    const userId = item.user_id || item.id
    const teamId = item.team_id
    return (bundle.results || []).find((result) => (
      String(result.phase_id) === String(scoreDraft.phase_id)
      && (teamId ? String(result.team_id) === String(teamId) : String(result.user_id) === String(userId))
    ))
  }
  const allConfirmedRows = (bundle.participants || [])
    .filter((participant) => participant.estado === 'confirmado')
    .map((participant) => ({
      user_id: participant.user_id || participant.id,
      participant_name: `${participant.nombre || ''} ${participant.apellido || ''}`.trim() || participant.email || 'Atleta',
      categoria: participant.categoria_competencia || participant.categoria || 'Todas',
      lane_number: '',
    }))
  const categoryOptions = [...new Set([
    ...phaseHeats.map((heat) => heat.categoria || 'Todas'),
    ...allConfirmedRows.map((participant) => participant.categoria || 'Todas'),
  ])].sort((a, b) => String(a).localeCompare(String(b)))
  const activeCategory = categoryOptions.includes(scoreDraft.category) ? scoreDraft.category : categoryOptions[0] || ''
  const categoryHeats = phaseHeats.filter((heat) => String(heat.categoria || 'Todas') === String(activeCategory || 'Todas'))
  const activeHeatId = categoryHeats.some((heat) => String(heat.id) === String(scoreDraft.heat_id)) ? scoreDraft.heat_id : (categoryHeats[0]?.id ? String(categoryHeats[0].id) : '')
  const selectedHeat = categoryHeats.find((heat) => String(heat.id) === String(activeHeatId))
  const scoreRows = selectedHeat
    ? heatParticipants(selectedHeat).map((participant) => ({ ...participant, heat_label: selectedHeat.heat_label || selectedHeat.nombre || `Heat ${selectedHeat.heat_number}`, categoria: selectedHeat.categoria || participant.categoria || activeCategory || 'Todas' }))
    : []
  const fallbackRows = scoreDraft.phase_id && !scoreRows.length
    ? allConfirmedRows.filter((participant) => String(participant.categoria || 'Todas') === String(activeCategory || 'Todas'))
    : []
  const rows = [...(scoreRows.length ? scoreRows : fallbackRows)].sort((a, b) => {
    const laneA = Number(a.lane_number)
    const laneB = Number(b.lane_number)
    const hasLaneA = Number.isFinite(laneA) && laneA > 0
    const hasLaneB = Number.isFinite(laneB) && laneB > 0
    if (hasLaneA && hasLaneB && laneA !== laneB) return laneA - laneB
    if (hasLaneA !== hasLaneB) return hasLaneA ? -1 : 1
    return participantName(a).localeCompare(participantName(b))
  })
  const setResultField = (item, field, value) => {
    const key = resultKey(scoreDraft.phase_id, item)
    setMarks((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }))
  }
  const DNF_MARK_HIGH = 2147483647
  const DNF_MARK_LOW = -2147483648
  const dnfMark = () => lowerIsBetter ? DNF_MARK_HIGH : DNF_MARK_LOW
  const isDnfMark = (value) => Number(value) === DNF_MARK_HIGH || Number(value) === DNF_MARK_LOW
  const markValue = (item) => {
    const key = resultKey(scoreDraft.phase_id, item)
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'capDnf') && marks[key].capDnf === true) return timeCapLabel
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'marca')) return marks[key].marca
    const existing = existingResultFor(item)
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'dnf') && marks[key].dnf === false && isDnfMark(existing?.marca)) return ''
    return formatMarkValue(existing?.marca)
  }
  const isDnfValue = (item) => {
    const key = resultKey(scoreDraft.phase_id, item)
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'capDnf') && marks[key].capDnf === true) return false
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'dnf')) return !!marks[key].dnf
    return isDnfMark(existingResultFor(item)?.marca)
  }
  const tiebreakValue = (item) => {
    const key = resultKey(scoreDraft.phase_id, item)
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'tiebreak')) return marks[key].tiebreak
    const existing = existingResultFor(item)
    return formatTiebreakValue(existing?.tiebreak)
  }
  const extraValue = (item) => {
    const key = resultKey(scoreDraft.phase_id, item)
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'extra')) return marks[key].extra
    const existing = existingResultFor(item)
    return existing?.extra ?? ''
  }
  const lowerIsBetter = (() => {
    const winnerRule = String(selectedPhase?.winner_rule || '').trim().toLowerCase()
    if (winnerRule === 'lower_wins') return true
    if (winnerRule === 'higher_wins') return false
    return ['tiempo', 'posicion'].includes(String(selectedPhase?.tipo || '').trim().toLowerCase())
  })()
  const isTimePhase = ['for_time', 'tiempo_hms', 'tiempo'].includes(String(selectedPhase?.measurement_method || selectedPhase?.workout_format || selectedPhase?.tipo || '').trim().toLowerCase()) || String(selectedPhase?.tipo || '').trim().toLowerCase() === 'tiempo'
  const timeCapSeconds = isTimePhase && Number(selectedPhase?.time_cap_seconds) > 0 ? Number(selectedPhase.time_cap_seconds) : null
  const timeCapLabel = timeCapSeconds ? formatSeconds(timeCapSeconds) : ''
  const tiebreakMethod = String(selectedPhase?.tie_break_method || 'for_time').trim().toLowerCase()
  const tieBreakActive = !!Number(selectedPhase?.tie_break_enabled || 0)
  const isTiebreakTime = ['for_time', 'tiempo_hms', 'tiempo'].includes(tiebreakMethod)
  const tiebreakLowerIsBetter = ['for_time', 'tiempo_hms', 'tiempo', 'posicion'].includes(tiebreakMethod)
  const showExtraField = isTimePhase && !!timeCapSeconds
  const isCapDnfValue = (item) => {
    if (!showExtraField) return false
    const key = resultKey(scoreDraft.phase_id, item)
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'capDnf')) return !!marks[key].capDnf
    const existing = existingResultFor(item)
    return Number(existing?.marca) === Number(timeCapSeconds) && existing?.extra !== null && existing?.extra !== undefined
  }
  const competitionScoring = bundle.scoring || {}
  const selectedPhaseScoring = (competitionScoring.phases || []).find((item) => String(item.id) === String(selectedPhase?.id))
  const effectiveScoring = {
    system: selectedPhaseScoring?.scoring_system || selectedPhase?.scoring_system || competitionScoring.scoring_system || competition.scoring_system || 'dynamic_points',
    scope: competitionScoring.scoring_scope || competition.scoring_scope || 'category',
    table: selectedPhaseScoring?.scoring_table || selectedPhase?.scoring_table || competitionScoring.scoring_table || competition.scoring_table || defaultScoringTable,
    tiebreak: competitionScoring.scoring_tiebreak || competition.scoring_tiebreak || 'best_positions',
    cumulative_direction: competitionScoring.cumulative_direction || competition.cumulative_direction || 'higher_wins',
    weight_percent: selectedPhaseScoring?.scoring_weight_percent ?? selectedPhase?.scoring_weight_percent ?? 100,
  }
  const formatMarkValue = (value) => isTimePhase && !isDnfMark(value) ? formatSeconds(value) : (value ?? '')
  const parseMarkValue = (value) => {
    if (isTimePhase) return parseTimeInput(value)
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  const formatTiebreakValue = (value) => isTiebreakTime ? formatSeconds(value) : (value ?? '')
  const parseTiebreakValue = (value) => {
    if (value === '' || value === null || value === undefined) return null
    if (isTiebreakTime) return parseTimeInput(value)
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  const tiebreakLabel = isTiebreakTime ? 'Tiebreak tiempo' : tiebreakMethod === 'rm' ? 'Tiebreak peso' : tiebreakMethod === 'metros' ? 'Tiebreak metros' : 'Tiebreak reps'
  const displayMarkWithExtra = (item) => {
    if (isDnfValue(item)) return 'DNF'
    const mark = markValue(item)
    const extra = extraValue(item)
    return showExtraField && parseMarkValue(mark) === timeCapSeconds && extra !== '' && extra !== null && extra !== undefined ? `${mark} + ${extra}` : (mark || '-')
  }
  const setDnfResult = (item, currentDnf) => {
    if (showExtraField) {
      const key = resultKey(scoreDraft.phase_id, item)
      const nextActive = !currentDnf
      setMarks((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          capDnf: nextActive,
          dnf: false,
          marca: nextActive ? timeCapLabel : '',
          extra: '',
        },
      }))
      return
    }
    setResultField(item, 'dnf', !currentDnf)
  }
  const previewPool = [...phaseHeats.flatMap((heat) => heatParticipants(heat).map((participant) => ({ ...participant, categoria: heat.categoria || participant.categoria || 'Todas' }))), ...allConfirmedRows]
    .reduce((items, item) => {
      const key = resultEntityKey(item)
      if (!key.includes('undefined') && !items.some((existing) => resultEntityKey(existing) === key)) items.push(item)
      return items
    }, [])
  const previewRankMap = (() => {
    const categoryMap = previewPool.reduce((map, item) => {
      map[resultEntityKey(item)] = item.categoria || 'Todas'
      return map
    }, {})
    ;(bundle.results || []).filter((result) => String(result.phase_id) === String(scoreDraft.phase_id)).forEach((result) => {
      const key = result.team_id ? `team-${result.team_id}` : `user-${result.user_id}`
      if (!categoryMap[key]) categoryMap[key] = result.categoria || 'Todas'
    })
    const entities = previewPool.map((item) => {
      const key = resultKey(scoreDraft.phase_id, item)
      const existing = existingResultFor(item)
      const draft = marks[key] || {}
      const draftCapDnf = !!draft.capDnf
      const draftDnf = !!draft.dnf && !draftCapDnf
      const rawMarca = draftCapDnf ? timeCapLabel : Object.prototype.hasOwnProperty.call(draft, 'marca') ? draft.marca : formatMarkValue(existing?.marca)
      const marca = draftDnf ? dnfMark() : parseMarkValue(rawMarca)
      const extra = draftDnf ? null : Object.prototype.hasOwnProperty.call(draft, 'extra') ? draft.extra : existing?.extra
      const tiebreak = tieBreakActive && !draftDnf ? Object.prototype.hasOwnProperty.call(draft, 'tiebreak') ? parseTiebreakValue(draft.tiebreak) : existing?.tiebreak : null
      return {
        key,
        category: categoryMap[resultEntityKey(item)] || 'Todas',
        marca: marca === '' || marca === null || marca === undefined ? null : Number(marca),
        extra: extra === '' || extra === null || extra === undefined ? null : Number(extra),
        tiebreak: tiebreak === '' || tiebreak === null || tiebreak === undefined ? null : Number(tiebreak),
      }
    }).filter((item) => item.marca !== null && !Number.isNaN(item.marca))
    const groups = entities.reduce((map, item) => {
      const category = effectiveScoring.scope === 'global' ? '__global__' : (item.category || 'Todas')
      if (!map[category]) map[category] = []
      map[category].push(item)
      return map
    }, {})
    const out = {}
    Object.values(groups).forEach((group) => {
      const ordered = [...group].sort((a, b) => {
        if (a.marca !== b.marca) return lowerIsBetter ? a.marca - b.marca : b.marca - a.marca
        return 0
      })
      let position = 1
      let index = 0
      while (index < ordered.length) {
        const mark = ordered[index].marca
        const markGroup = []
        while (index < ordered.length && ordered[index].marca === mark) {
          markGroup.push(ordered[index])
          index += 1
        }
        let extraGroups = [markGroup]
        if (markGroup.length > 1 && markGroup.every((item) => item.extra !== null && !Number.isNaN(item.extra))) {
          const sortedExtra = [...markGroup].sort((a, b) => a.extra - b.extra)
          extraGroups = []
          let extraIndex = 0
          while (extraIndex < sortedExtra.length) {
            const extraValue = sortedExtra[extraIndex].extra
            const extraItems = []
            while (extraIndex < sortedExtra.length && sortedExtra[extraIndex].extra === extraValue) {
              extraItems.push(sortedExtra[extraIndex])
              extraIndex += 1
            }
            extraGroups.push(extraItems)
          }
        }
        const positionedGroups = []
        extraGroups.forEach((extraGroup) => {
        if (tieBreakActive && extraGroup.length > 1 && extraGroup.every((item) => item.tiebreak !== null && !Number.isNaN(item.tiebreak))) {
          const sortedTie = [...extraGroup].sort((a, b) => tiebreakLowerIsBetter ? a.tiebreak - b.tiebreak : b.tiebreak - a.tiebreak)
          let tieIndex = 0
          while (tieIndex < sortedTie.length) {
            const tieValue = sortedTie[tieIndex].tiebreak
            const tieItems = []
            while (tieIndex < sortedTie.length && sortedTie[tieIndex].tiebreak === tieValue) {
              tieItems.push(sortedTie[tieIndex])
              tieIndex += 1
            }
            positionedGroups.push(tieItems)
          }
        } else {
          positionedGroups.push(extraGroup)
        }
        })
        positionedGroups.forEach((items) => {
          const points = previewPointsForScoring(effectiveScoring, position, ordered.length, items[0]?.marca)
          items.forEach((item) => { out[item.key] = { posicion: position, puntos: points } })
          position += items.length
        })
      }
    })
    return out
  })()
  const persistedTieKeys = (() => {
    if (!tieBreakActive) return new Set()
    const categoryMap = previewPool.reduce((map, item) => {
      map[resultEntityKey(item)] = item.categoria || 'Todas'
      return map
    }, {})
    const persistedTieGroupKey = (result) => {
      const key = result.team_id ? `team-${result.team_id}` : `user-${result.user_id}`
      const mark = Number(result.marca)
      if (!Number.isFinite(mark)) return null
      const category = categoryMap[key] || result.categoria || 'Todas'
      if (timeCapSeconds && mark === timeCapSeconds) {
        const extra = Number(result.extra)
        return `${category}:${mark}:extra-${Number.isFinite(extra) ? extra : 'none'}`
      }
      return `${category}:${mark}`
    }
    const groups = (bundle.results || [])
      .filter((result) => String(result.phase_id) === String(scoreDraft.phase_id) && !isDnfMark(result.marca))
      .reduce((map, result) => {
        const groupKey = persistedTieGroupKey(result)
        if (!groupKey) return map
        if (!map[groupKey]) map[groupKey] = []
        map[groupKey].push(resultKey(scoreDraft.phase_id, { user_id: result.user_id, team_id: result.team_id }))
        return map
      }, {})
    return new Set(Object.values(groups).filter((items) => items.length > 1).flat())
  })()
  const saveFastResults = async () => {
    if (!scoreDraft.phase_id) return notify('Selecciona un WOD', 'error')
    const changed = rows.filter((row) => Object.prototype.hasOwnProperty.call(marks, resultKey(scoreDraft.phase_id, row)))
    if (!changed.length) return notify('No hay cambios por guardar', 'error')
    try {
      let saved = 0
      for (const row of changed) {
        const value = markValue(row)
        if (value === '') continue
        const extra = extraValue(row)
        const tiebreak = tieBreakActive ? tiebreakValue(row) : ''
        const existing = existingResultFor(row)
        const rowDraft = marks[resultKey(scoreDraft.phase_id, row)] || {}
        const rowCapDnf = !!rowDraft.capDnf
        const rowDnf = !!rowDraft.dnf && !rowCapDnf
        const parsedMark = rowDnf ? dnfMark() : rowCapDnf ? timeCapSeconds : parseMarkValue(value)
        if (!rowDnf && parsedMark === null) return notify(isTimePhase ? 'Tiempo invalido. Usa MM:SS o HH:MM:SS' : 'Marca invalida', 'error')
        if (!rowDnf && timeCapSeconds && parsedMark > timeCapSeconds) return notify(`El tiempo no puede superar el cap de ${timeCapLabel}`, 'error')
        const parsedTiebreak = !tieBreakActive || rowDnf || tiebreak === '' ? null : parseTiebreakValue(tiebreak)
        if (tieBreakActive && !rowDnf && tiebreak !== '' && parsedTiebreak === null) return notify(isTiebreakTime ? 'Tiebreak invalido. Usa MM:SS o HH:MM:SS' : 'Tiebreak invalido', 'error')
        if (rowCapDnf && extra === '') return notify('Ingresa reps faltantes. Usa 0 si termino justo en el cap.', 'error')
        const parsedExtra = rowCapDnf ? Number(extra) : null
        if (parsedExtra !== null && (!Number.isInteger(parsedExtra) || parsedExtra < 0)) return notify('Reps faltantes invalido', 'error')
        if (existing) {
          await api(`/results/${existing.id}`, {
            method: 'PUT',
            body: JSON.stringify({ marca: parsedMark, extra: parsedExtra, tiebreak: tieBreakActive ? parsedTiebreak : null }),
          })
        } else {
          await api('/results', {
            method: 'POST',
            body: JSON.stringify({
              competition_id: competition.id,
              phase_id: Number(scoreDraft.phase_id),
              user_id: row.user_id ? Number(row.user_id) : null,
              team_id: row.team_id ? Number(row.team_id) : null,
              marca: parsedMark,
              extra: parsedExtra,
              tiebreak: tieBreakActive ? parsedTiebreak : null,
            }),
          })
        }
        saved += 1
      }
      notify(`${saved} resultados guardados`)
      setMarks({})
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const saveRowResult = async (row) => {
    if (!scoreDraft.phase_id) return notify('Selecciona un WOD', 'error')
    const key = resultKey(scoreDraft.phase_id, row)
    const rowDraft = marks[key] || {}
    const rowCapDnf = !!rowDraft.capDnf
    const rowDnf = !!rowDraft.dnf && !rowCapDnf
    const value = markValue(row)
    if (!rowDnf && value === '') return notify('Ingresa una marca o marca DNF', 'error')
    const extra = extraValue(row)
    const tiebreak = tieBreakActive ? tiebreakValue(row) : ''
    const existing = existingResultFor(row)
    const parsedMark = rowDnf ? dnfMark() : rowCapDnf ? timeCapSeconds : parseMarkValue(value)
    if (!rowDnf && parsedMark === null) return notify(isTimePhase ? 'Tiempo invalido. Usa MM:SS o HH:MM:SS' : 'Marca invalida', 'error')
    if (!rowDnf && timeCapSeconds && parsedMark > timeCapSeconds) return notify(`El tiempo no puede superar el cap de ${timeCapLabel}`, 'error')
    const parsedTiebreak = !tieBreakActive || rowDnf || tiebreak === '' ? null : parseTiebreakValue(tiebreak)
    if (tieBreakActive && !rowDnf && tiebreak !== '' && parsedTiebreak === null) return notify(isTiebreakTime ? 'Tiebreak invalido. Usa MM:SS o HH:MM:SS' : 'Tiebreak invalido', 'error')
    if (rowCapDnf && extra === '') return notify('Ingresa reps faltantes. Usa 0 si termino justo en el cap.', 'error')
    const parsedExtra = rowCapDnf ? Number(extra) : null
    if (parsedExtra !== null && (!Number.isInteger(parsedExtra) || parsedExtra < 0)) return notify('Reps faltantes invalido', 'error')
    try {
      if (existing) {
        await api(`/results/${existing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ marca: parsedMark, extra: parsedExtra, tiebreak: tieBreakActive ? parsedTiebreak : null }),
        })
      } else {
        await api('/results', {
          method: 'POST',
          body: JSON.stringify({
            competition_id: competition.id,
            phase_id: Number(scoreDraft.phase_id),
            user_id: row.user_id ? Number(row.user_id) : null,
            team_id: row.team_id ? Number(row.team_id) : null,
            marca: parsedMark,
            extra: parsedExtra,
            tiebreak: tieBreakActive ? parsedTiebreak : null,
          }),
        })
      }
      notify(existing ? 'Resultado actualizado' : 'Resultado guardado')
      setMarks((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setEditingRows((prev) => ({ ...prev, [key]: false }))
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const resultCountForPhase = rows.filter((row) => existingResultFor(row)).length
  const markLabel = isTimePhase ? 'Tiempo' : selectedPhase?.tipo === 'posicion' ? 'Posicion' : 'Marca'
  const extraLabel = showExtraField ? 'Reps faltantes' : 'Extra'
  const resultFormatLabels = {
    for_time: 'Tiempo / For time',
    tiempo: 'Tiempo',
    tiempo_hms: 'Tiempo',
    amrap: 'AMRAP',
    reps: 'Reps',
    rm: 'Peso',
    metros: 'Metros',
    other: 'Marca',
  }
  const phaseFormatValue = String(selectedPhase?.measurement_method || selectedPhase?.workout_format || selectedPhase?.tipo || 'marca').trim().toLowerCase()
  const phaseFormatLabel = selectedPhase ? (resultFormatLabels[phaseFormatValue] || selectedPhase.measurement_method || selectedPhase.workout_format || selectedPhase.tipo || 'Marca') : 'Sin WOD'
  const markRuleLabel = lowerIsBetter ? 'Menor marca gana' : 'Mayor marca gana'
  const tiebreakRuleLabel = isTimePhase ? 'Menor extra gana si el tiempo empata; luego tiebreak' : (tiebreakLowerIsBetter ? 'Menor tiebreak gana' : 'Mayor tiebreak gana')
  const scoringRuleLabel = scoringPreviewLabel(effectiveScoring)
  const resultCardGridColumns = tieBreakActive
    ? 'minmax(120px, 1.1fr) repeat(5, minmax(90px, 1fr))'
    : 'minmax(120px, 1.1fr) repeat(4, minmax(90px, 1fr))'
  return (
    <Panel title="Resultados" subtitle="Carga por categoria y heat con guardado por atleta." action={<Pill tone={colors.accent}>{resultCountForPhase} cargados</Pill>}>
      <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 12, display: 'grid', gap: 12 }}>
        <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
          <Field label="WOD">
            <select style={inputStyle()} value={scoreDraft.phase_id} onChange={(event) => setScoreDraft((prev) => ({ ...prev, phase_id: event.target.value, heat_id: '', category: '' }))}>
              <option value="">Seleccionar</option>
              {phaseOptions.map((phase) => <option key={phase.id} value={phase.id}>{phase.nombre}</option>)}
            </select>
          </Field>
          <Field label="Categoria">
            <select style={inputStyle()} value={activeCategory} onChange={(event) => setScoreDraft((prev) => ({ ...prev, category: event.target.value, heat_id: '' }))}>
              {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </Field>
          <Field label="Heat">
            <select style={inputStyle()} value={activeHeatId} onChange={(event) => setScoreDraft((prev) => ({ ...prev, heat_id: event.target.value }))}>
              {categoryHeats.length ? categoryHeats.map((heat) => <option key={heat.id} value={heat.id}>{heat.heat_label || heat.nombre || `Heat ${heat.heat_number}`}</option>) : <option value="">Sin heats</option>}
            </select>
          </Field>
          <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
            <Pill tone={colors.primary}>{rows.length} atletas</Pill>
            <Pill tone={colors.accent}>{resultCountForPhase} resultados</Pill>
          </div>
        </div>
        <div className="fr-result-rules" style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Pill tone={colors.primary}>Formato {phaseFormatLabel}</Pill>
          {timeCapSeconds ? <Pill tone={colors.primary}>Cap {timeCapLabel}</Pill> : null}
          <Pill tone={colors.accent}>{markRuleLabel}</Pill>
          {tieBreakActive ? <Pill tone={colors.secondary}>{tiebreakRuleLabel}</Pill> : null}
          <Pill tone={colors.secondary}>{scoringRuleLabel}</Pill>
          <span style={{ color: colors.secondary, fontSize: 12 }}>{isTimePhase ? (timeCapSeconds ? 'Tiempo es el valor por defecto. CAP coloca el time cap y habilita reps faltantes.' : 'Configura un cap para usar reps faltantes.') : (tieBreakActive ? 'El tiebreak desempata solo cuando la marca esta empatada y todos los empatados tienen tiebreak.' : 'Carga la marca y guarda el resultado del atleta.')}</span>
        </div>
        <div className="fr-results-table" style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden', background: colors.surface }}>
          <div className="fr-results-list" style={{ display: 'grid', gap: 10, maxHeight: 560, overflowY: 'auto', padding: 12 }}>
            {rows.length ? rows.map((row) => {
              const existing = existingResultFor(row)
              const key = resultKey(scoreDraft.phase_id, row)
              const dirty = Object.prototype.hasOwnProperty.call(marks, key)
              const preview = previewRankMap[key]
              const editable = !existing || editingRows[key] || dirty
              const capDnf = isCapDnfValue(row)
              const rowDnf = isDnfValue(row) && !capDnf
              const showTiebreakWarning = persistedTieKeys.has(key)
              const showExtraInput = editable && showExtraField && capDnf
              return (
                <div className="fr-result-row" key={key} style={{ display: 'grid', gap: 12, padding: 12, border: `1px solid ${dirty ? 'rgba(255,107,0,0.55)' : colors.border}`, borderRadius: 8, background: dirty ? 'rgba(255,107,0,0.08)' : colors.top }}>
                  <div className="fr-result-card-head" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
                    <span className="fr-result-lane" style={{ color: colors.primary, fontSize: 12, fontWeight: 900, padding: '6px 9px', borderRadius: 999, background: 'rgba(255,107,0,0.10)', border: '1px solid rgba(255,107,0,0.28)', whiteSpace: 'nowrap' }}>Carril {row.lane_number || '-'}</span>
                    <span className="fr-result-athlete" style={{ color: colors.text, fontSize: 15, lineHeight: 1.25, fontWeight: 900, minWidth: 0, overflowWrap: 'anywhere' }}>{participantName(row)}</span>
                    <div className="fr-result-actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {editable ? (
                        <>
                          <Button onClick={() => setDnfResult(row, showExtraField ? capDnf : rowDnf)} tone={(showExtraField ? capDnf : rowDnf) ? 'danger' : 'default'}>{showExtraField ? 'CAP' : 'DNF'}</Button>
                          <Button tone="primary" onClick={() => saveRowResult(row)}><Save size={14} /></Button>
                        </>
                      ) : (
                        <Button onClick={() => setEditingRows((prev) => ({ ...prev, [key]: true }))}><Pencil size={14} /></Button>
                      )}
                    </div>
                  </div>
                  <div className="fr-result-card-grid" style={{ display: 'grid', gridTemplateColumns: resultCardGridColumns, gap: 10, alignItems: 'stretch' }}>
                    <span className="fr-result-heat fr-result-card-field" data-label="Heat" style={{ color: colors.secondary, fontSize: 13, overflowWrap: 'anywhere' }}>{row.heat_label || selectedHeat?.heat_label || selectedHeat?.nombre || 'Sin heat'}</span>
                    {editable ? (
                      <label className="fr-result-input-wrap">
                        <span className="fr-result-mobile-label">{markLabel}</span>
                        <span style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                          <input className="fr-result-mark" type={isTimePhase ? 'text' : 'number'} style={inputStyle()} value={rowDnf ? '' : capDnf ? timeCapLabel : markValue(row)} onWheel={preventNumberInputWheel} onChange={(event) => setResultField(row, 'marca', isTimePhase ? formatTimeEntryInput(event.target.value) : event.target.value)} placeholder={rowDnf ? 'DNF' : isTimePhase ? (timeCapLabel || '12:00') : 'Valor'} disabled={rowDnf || capDnf} />
                        </span>
                      </label>
                    ) : (
                      <span className="fr-result-readonly" data-label={markLabel} style={{ color: rowDnf ? colors.error : colors.text, fontSize: 13, fontWeight: 850 }}>{displayMarkWithExtra(row)}</span>
                    )}
                    {showExtraInput ? (
                      <label className="fr-result-input-wrap">
                        <span className="fr-result-mobile-label">{extraLabel}</span>
                        <input className="fr-result-extra" type="number" step="1" min="0" style={inputStyle()} value={extraValue(row)} onWheel={preventNumberInputWheel} onChange={(event) => setResultField(row, 'extra', event.target.value)} placeholder="Faltantes" />
                      </label>
                    ) : null}
                    {tieBreakActive && editable ? (
                      <label className={`fr-result-input-wrap${showTiebreakWarning ? ' fr-result-tiebreak-field' : ''}`}>
                        <span className={`fr-result-mobile-label${showTiebreakWarning ? ' fr-result-label-with-help' : ''}`}>
                          {tiebreakLabel}
                          {showTiebreakWarning ? (
                            <span className="fr-tiebreak-help" tabIndex={0} role="button" aria-label="Hay empate en la marca. El tiebreak puede usarse para desempatar." title="Hay empate en la marca. El tiebreak puede desempatar.">
                              <AlertTriangle size={13} />
                            </span>
                          ) : null}
                        </span>
                        <input className="fr-result-tiebreak" type={isTiebreakTime ? 'text' : 'number'} step="1" style={inputStyle()} value={rowDnf ? '' : tiebreakValue(row)} onWheel={preventNumberInputWheel} onChange={(event) => setResultField(row, 'tiebreak', isTiebreakTime ? formatTimeEntryInput(event.target.value) : event.target.value)} placeholder={isTiebreakTime ? '01:23' : 'Opcional'} disabled={rowDnf} />
                      </label>
                    ) : tieBreakActive ? (
                      <span className={`fr-result-readonly${showTiebreakWarning ? ' fr-result-tiebreak-field' : ''}`} data-label={tiebreakLabel} style={{ color: colors.secondary, fontSize: 13 }}>
                        <span className="fr-result-value-with-help">
                          {rowDnf ? '-' : tiebreakValue(row) || '-'}
                          {showTiebreakWarning ? (
                            <span className="fr-tiebreak-help" tabIndex={0} role="button" aria-label="Hay empate en la marca. El tiebreak puede usarse para desempatar." title="Hay empate en la marca. El tiebreak puede desempatar.">
                              <AlertTriangle size={13} />
                            </span>
                          ) : null}
                        </span>
                      </span>
                    ) : null}
                    <span className="fr-result-position fr-result-card-field" data-label="Posicion" style={{ color: dirty ? colors.primary : colors.secondary, fontSize: 13, fontWeight: dirty ? 900 : 800 }}>{preview?.posicion ?? existing?.posicion ?? '-'}</span>
                    <span className="fr-result-points fr-result-card-field" data-label="Puntos" style={{ color: dirty ? colors.primary : colors.secondary, fontSize: 13, fontWeight: dirty ? 900 : 800 }}>{preview?.puntos ?? existing?.puntos ?? '-'}</span>
                  </div>
                </div>
              )
            }) : (
              <div style={{ padding: 16, color: colors.secondary, fontSize: 13 }}>Selecciona un WOD con atletas para cargar resultados.</div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  )
}

function JudgesPanel({ bundle, reload, notify }) {
  const competition = bundle.competition
  const [email, setEmail] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const invite = async () => {
    try {
      await api(`/competitions/${competition.id}/judges/invite`, { method: 'POST', body: JSON.stringify({ email }) })
      notify('Juez invitado')
      setEmail('')
      setModalOpen(false)
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const revoke = async (judge) => {
    try {
      await api(`/competitions/${competition.id}/judges/${judge.id}`, { method: 'DELETE' })
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  return (
    <Panel title="Jueces" subtitle="Invitaciones y accesos de jueces." action={<Button tone="primary" onClick={() => setModalOpen(true)}>Invitar juez</Button>}>
      {modalOpen ? (
        <Modal title="Invitar juez" onClose={() => setModalOpen(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Email del juez"><input style={inputStyle()} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button tone="primary" onClick={invite}>Enviar invitacion</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      {(bundle.judges || []).map((judge) => (
        <div key={judge.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 10 }}>
          <div><strong>{judge.email || judge.judge_email}</strong><div style={{ color: colors.secondary, fontSize: 12 }}>{judge.status || 'activo'}</div></div>
          <Pill tone={colors.accent}>{judge.status || 'activo'}</Pill>
          <Button tone="danger" onClick={() => revoke(judge)}>Revocar</Button>
        </div>
      ))}
    </Panel>
  )
}

function AnnouncersPanel({ bundle, reload, notify }) {
  const competition = bundle.competition
  const [email, setEmail] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const invite = async () => {
    try {
      await api(`/competitions/${competition.id}/announcers/invite`, { method: 'POST', body: JSON.stringify({ email }) })
      notify('Locutor invitado')
      setEmail('')
      setModalOpen(false)
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const revoke = async (announcer) => {
    try {
      await api(`/competitions/${competition.id}/announcers/${announcer.id}`, { method: 'DELETE' })
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  return (
    <Panel title="Locutores" subtitle="Acceso de solo lectura para narrar la competencia en vivo." action={<Button tone="primary" onClick={() => setModalOpen(true)}>Invitar locutor</Button>}>
      {modalOpen ? (
        <Modal title="Invitar locutor" onClose={() => setModalOpen(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Email del locutor"><input style={inputStyle()} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <div style={{ color: colors.secondary, fontSize: 12 }}>El locutor podra ver cabina en vivo, heats, carriles y leaderboard sin editar resultados.</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button tone="primary" onClick={invite}>Enviar invitacion</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      {(bundle.announcers || []).map((announcer) => (
        <div key={announcer.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 10 }}>
          <div>
            <strong>{announcer.announcer_display_name || announcer.announcer_participant_name || announcer.invited_email}</strong>
            <div style={{ color: colors.secondary, fontSize: 12 }}>{announcer.announcer_username || announcer.invited_email}</div>
          </div>
          <Pill tone={announcer.status === 'active' ? colors.accent : colors.warning}>{announcer.status || 'pendiente'}</Pill>
          <Button tone="danger" onClick={() => revoke(announcer)}>Revocar</Button>
        </div>
      ))}
      {!(bundle.announcers || []).length ? <div style={{ color: colors.secondary, fontSize: 13 }}>Aun no hay locutores invitados.</div> : null}
    </Panel>
  )
}

const ACTIVE_APPEAL_STATUSES = ['submitted', 'under_review', 'needs_evidence', 'escalated']

function appealStatusLabel(status) {
  const labels = {
    submitted: 'Nueva',
    under_review: 'En revision',
    needs_evidence: 'Evidencia solicitada',
    escalated: 'Escalada',
    accepted: 'Aceptada',
    rejected: 'Rechazada',
    score_adjusted: 'Resultado ajustado',
    closed: 'Cerrada',
    cancelled: 'Cancelada',
  }
  return labels[status] || status || 'Sin estado'
}

function appealTone(status) {
  if (status === 'rejected') return colors.error
  if (status === 'accepted' || status === 'score_adjusted') return colors.success
  if (status === 'needs_evidence') return colors.warning
  return colors.accent
}

function AppealsPanel({ bundle, reload, notify }) {
  const competition = bundle.competition
  const [appeals, setAppeals] = useState(bundle.appeals || [])
  const [active, setActive] = useState(null)
  const [reply, setReply] = useState({ message: '' })
  const [resolution, setResolution] = useState({ marca: '', tiebreak: '', resolution_note: '' })
  const [decisionOpen, setDecisionOpen] = useState(false)
  const [decisionMode, setDecisionMode] = useState('score_adjusted')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setAppeals(bundle.appeals || [])
    setActive(null)
  }, [competition.id])

  const loadAppeals = async () => {
    setLoading(true)
    try {
      const data = await api(`/appeals?competition_id=${competition.id}`)
      setAppeals(Array.isArray(data) ? data : [])
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const openAppeal = async (appeal) => {
    setBusy(true)
    try {
      const data = await api(`/appeals/${appeal.id}`)
      setActive(data)
      setReply({ message: '' })
      setResolution({
        marca: data.current_marca ?? '',
        tiebreak: data.current_tiebreak ?? '',
        resolution_note: '',
      })
      setDecisionOpen(false)
      setDecisionMode('score_adjusted')
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const sendReply = async () => {
    if (!active || !reply.message.trim()) return
    setBusy(true)
    try {
      const data = await api(`/appeals/${active.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          message: reply.message.trim(),
        }),
      })
      setActive(data)
      setReply({ message: '' })
      notify('Mensaje enviado')
      await loadAppeals()
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const resolveAppeal = async (resolutionType) => {
    if (!active) return
    setBusy(true)
    try {
      const payload = {
        resolution_type: resolutionType,
        resolution_note: resolution.resolution_note.trim(),
      }
      if (resolutionType === 'score_adjusted') {
        payload.marca = resolution.marca
        if (String(resolution.tiebreak).trim() !== '') payload.tiebreak = resolution.tiebreak
      }
      const data = await api(`/appeals/${active.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setActive(data)
      setDecisionOpen(false)
      notify(resolutionType === 'rejected' ? 'Reclamacion rechazada' : resolutionType === 'needs_evidence' ? 'Evidencia solicitada' : 'Resultado actualizado')
      await loadAppeals()
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const openItems = appeals.filter((item) => ACTIVE_APPEAL_STATUSES.includes(item.status))
  const activeCanResolve = active && ACTIVE_APPEAL_STATUSES.includes(active.status)

  return (
    <Panel
      title="Reclamaciones"
      subtitle="Revision de evidencia, mensajes y ajustes de puntaje."
      action={<><Pill tone={openItems.length ? colors.warning : colors.accent}>{openItems.length} abiertas</Pill><Button onClick={loadAppeals} disabled={loading}>{loading ? 'Cargando...' : 'Actualizar'}</Button></>}
    >
      <div className="fr-appeals-layout" style={{ display: 'grid', gridTemplateColumns: active ? 'minmax(260px, 360px) minmax(0, 1fr)' : '1fr', gap: 12 }}>
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden', background: colors.top }}>
          {appeals.length ? appeals.map((appeal) => {
            const tone = appealTone(appeal.status)
            return (
              <button
                key={appeal.id}
                type="button"
                onClick={() => openAppeal(appeal)}
                style={{
                  width: '100%',
                  border: 0,
                  borderBottom: `1px solid ${colors.border}`,
                  background: active?.id === appeal.id ? 'rgba(255,107,0,0.12)' : colors.top,
                  color: colors.text,
                  padding: 12,
                  textAlign: 'left',
                  display: 'grid',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{appeal.user_name || 'Atleta'}</strong>
                  <Pill tone={tone}>{appealStatusLabel(appeal.status)}</Pill>
                </span>
                <span style={{ color: colors.secondary, fontSize: 12 }}>{appeal.phase_name || 'Workout'}</span>
                <span style={{ color: colors.muted, fontSize: 11 }}>Solicita: {appeal.user_requested_score || '-'}</span>
              </button>
            )
          }) : <div style={{ padding: 14, color: colors.secondary, fontSize: 13 }}>Sin reclamaciones.</div>}
        </div>

        {active ? (
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.top, padding: 12, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ fontSize: 18 }}>{active.user_name || 'Atleta'}</h3>
                <div style={{ color: colors.secondary, fontSize: 12, marginTop: 4 }}>{active.phase_name || 'Workout'} - {appealStatusLabel(active.status)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {active.evidence_url ? <a href={active.evidence_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><Button>Ver evidencia</Button></a> : null}
                {activeCanResolve ? <Button tone="primary" onClick={() => setDecisionOpen(true)}>Resolver reclamacion</Button> : null}
              </div>
            </div>

            <div className="fr-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <MiniStat label="Marca actual" value={active.current_marca ?? '-'} />
              <MiniStat label="Posicion" value={active.current_posicion ? `#${active.current_posicion}` : '-'} tone={colors.accent} />
              <MiniStat label="Puntos" value={active.current_puntos ?? '-'} />
            </div>

            <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.surface, padding: 12, color: colors.secondary, fontSize: 13, lineHeight: 1.55 }}>
              <strong style={{ color: colors.text }}>Solicitud:</strong> {active.description || '-'}
              {active.user_requested_score ? <div style={{ marginTop: 8 }}>Resultado solicitado: <strong style={{ color: colors.text }}>{active.user_requested_score}</strong></div> : null}
            </div>

            <div style={{ display: 'grid', gap: 8, maxHeight: 300, overflowY: 'auto', padding: 10, border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.bg }}>
              {(active.messages || []).map((message) => {
                const isAthlete = message.author_role === 'athlete'
                return (
                  <div key={message.id} style={{ justifySelf: isAthlete ? 'start' : 'end', width: 'fit-content', maxWidth: 'min(84%, 460px)', border: `1px solid ${isAthlete ? colors.border : 'rgba(0,194,168,0.24)'}`, borderRadius: isAthlete ? '14px 14px 14px 4px' : '14px 14px 4px 14px', background: isAthlete ? colors.surface : '#005A4F', padding: '9px 11px', display: 'grid', gap: 5 }}>
                    <div style={{ color: isAthlete ? colors.secondary : '#BFFAF1', fontSize: 10, fontWeight: 850 }}>{isAthlete ? (message.author_name || 'Atleta') : 'Organizacion'}</div>
                    <div style={{ color: colors.text, fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.message}</div>
                    {message.evidence_url ? <a href={message.evidence_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: isAthlete ? colors.accent : '#DFFFF9', fontSize: 12, fontWeight: 850, textDecoration: 'none' }}><Paperclip size={12} /> Abrir link</a> : null}
                  </div>
                )
              })}
            </div>

            {activeCanResolve ? (
              <>
                <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 42px', gap: 8, alignItems: 'end' }}>
                    <textarea rows={1} style={{ ...inputStyle(), minHeight: 42, maxHeight: 100, resize: 'none', borderRadius: 20 }} value={reply.message} onChange={(event) => setReply((prev) => ({ ...prev, message: event.target.value }))} placeholder="Mensaje para el atleta" />
                    <button type="button" aria-label="Enviar mensaje" onClick={sendReply} disabled={busy || !reply.message.trim()} style={{ width: 42, height: 42, minWidth: 42, minHeight: 42, padding: 0, lineHeight: 0, borderRadius: '50%', border: 'none', background: colors.primary, color: colors.bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: busy || !reply.message.trim() ? 'not-allowed' : 'pointer', opacity: busy || !reply.message.trim() ? 0.55 : 1 }}>
                      <Send size={18} style={{ display: 'block' }} />
                    </button>
                  </div>
                </div>

                {decisionOpen ? (
                  <Modal title="Resolver reclamacion" onClose={() => !busy && setDecisionOpen(false)}>
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                        <Button tone={decisionMode === 'rejected' ? 'danger' : 'secondary'} onClick={() => setDecisionMode('rejected')}>Rechazar</Button>
                        <Button tone={decisionMode === 'score_adjusted' ? 'primary' : 'secondary'} onClick={() => setDecisionMode('score_adjusted')}>Ajustar resultado</Button>
                      </div>
                      {decisionMode === 'score_adjusted' ? (
                        <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                          <Field label="Nueva marca"><input type="number" style={inputStyle()} value={resolution.marca} onChange={(event) => setResolution((prev) => ({ ...prev, marca: event.target.value }))} /></Field>
                          <Field label="Tiebreak"><input type="number" style={inputStyle()} value={resolution.tiebreak} onChange={(event) => setResolution((prev) => ({ ...prev, tiebreak: event.target.value }))} /></Field>
                        </div>
                      ) : null}
                      <Field label={decisionMode === 'rejected' ? 'Mensaje de cierre' : 'Nota para resolver'}>
                        <textarea rows={4} style={inputStyle()} value={resolution.resolution_note} onChange={(event) => setResolution((prev) => ({ ...prev, resolution_note: event.target.value }))} placeholder={decisionMode === 'rejected' ? 'Explica por que se rechaza la reclamacion' : 'Motivo del ajuste'} />
                      </Field>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                        <Button onClick={() => setDecisionOpen(false)} disabled={busy}>Cancelar</Button>
                        <Button tone={decisionMode === 'rejected' ? 'danger' : 'primary'} onClick={() => resolveAppeal(decisionMode)} disabled={busy}>
                          {decisionMode === 'rejected' ? 'Enviar cierre' : 'Resolver'}
                        </Button>
                      </div>
                    </div>
                  </Modal>
                ) : null}
              </>
            ) : (
              <div style={{ color: colors.secondary, fontSize: 13 }}>Decision final: {active.resolution_note || '-'}</div>
            )}
          </div>
        ) : null}
      </div>
    </Panel>
  )
}

function BroadcastPanel({ bundle, reload, notify }) {
  const competition = bundle.competition
  const [modalOpen, setModalOpen] = useState(false)
  const [draft, setDraft] = useDraft(competition, (item) => ({
    tv_show_qr: item?.tv_show_qr ? 1 : 0,
    tv_include_total_slide: item?.tv_include_total_slide ? 1 : 0,
    tv_only_finalized_phases: item?.tv_only_finalized_phases ? 1 : 0,
    tv_rotation_interval_seconds: item?.tv_rotation_interval_seconds || 24,
    tv_data_refresh_interval_seconds: item?.tv_data_refresh_interval_seconds || 5,
    tv_mode: item?.tv_mode || 'cyclic',
  }))
  const save = async () => {
    try {
      await api(`/competitions/${competition.id}`, { method: 'PUT', body: JSON.stringify({ ...draft, tv_rotation_interval_seconds: Number(draft.tv_rotation_interval_seconds), tv_data_refresh_interval_seconds: Number(draft.tv_data_refresh_interval_seconds) }) })
      notify('Pantalla actualizada')
      setModalOpen(false)
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  return (
    <Panel title="Pantalla publica" subtitle="Configura salida TV y abre vistas publicas." action={<Button tone="primary" onClick={() => setModalOpen(true)}><Save size={16} />Editar pantalla</Button>}>
      {modalOpen ? (
        <Modal title="Editar pantalla publica" onClose={() => setModalOpen(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              {[
                ['tv_show_qr', 'Mostrar QR'],
                ['tv_include_total_slide', 'Slide total'],
                ['tv_only_finalized_phases', 'Solo finalizadas'],
              ].map(([key, label]) => <Button key={key} tone={draft[key] ? 'primary' : 'secondary'} onClick={() => setDraft(key, draft[key] ? 0 : 1)}>{label}</Button>)}
              <Field label="Rotacion seg"><input type="number" style={inputStyle()} value={draft.tv_rotation_interval_seconds} onChange={(e) => setDraft('tv_rotation_interval_seconds', e.target.value)} /></Field>
              <Field label="Refresh seg"><input type="number" style={inputStyle()} value={draft.tv_data_refresh_interval_seconds} onChange={(e) => setDraft('tv_data_refresh_interval_seconds', e.target.value)} /></Field>
              <Field label="Modo"><select style={inputStyle()} value={draft.tv_mode} onChange={(e) => setDraft('tv_mode', e.target.value)}><option value="cyclic">Ciclico</option><option value="static">Estatico</option></select></Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button tone="primary" onClick={save}>Guardar pantalla</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      <div className="fr-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        <MiniStat label="QR" value={competition.tv_show_qr ? 'Si' : 'No'} />
        <MiniStat label="Modo" value={competition.tv_mode || 'cyclic'} />
        <MiniStat label="Rotacion" value={`${competition.tv_rotation_interval_seconds || 24}s`} />
        <MiniStat label="Refresh" value={`${competition.tv_data_refresh_interval_seconds || 5}s`} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link target="_blank" to={`/leaderboard?competition=${competition.id}`} style={{ textDecoration: 'none' }}><Button><Trophy size={16} />Leaderboard</Button></Link>
        <Link target="_blank" to={`/competitions/${competition.slug || competition.id}/schedule`} style={{ textDecoration: 'none' }}><Button><CalendarDays size={16} />Cronograma</Button></Link>
        <Link target="_blank" to={`/competitions/${competition.slug || competition.id}`} style={{ textDecoration: 'none' }}><Button><Eye size={16} />Landing</Button></Link>
      </div>
    </Panel>
  )
}

function LivePanel({ bundle, reload, notify }) {
  const [section, setSection] = useState('results')
  const openAppeals = (bundle.appeals || []).filter((item) => ACTIVE_APPEAL_STATUSES.includes(item.status))
  const modules = [
    { id: 'results', label: 'Resultados', icon: Trophy, count: (bundle.results || []).length },
    { id: 'appeals', label: 'Reclamaciones', icon: MessageSquare, count: openAppeals.length },
    { id: 'judges', label: 'Jueces', icon: Users, count: (bundle.judges || []).length },
    { id: 'announcers', label: 'Locutores', icon: Radio, count: (bundle.announcers || []).length },
    { id: 'broadcast', label: 'Pantalla', icon: Radio },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <ModuleTabs items={modules} active={section} onChange={setSection} />
      {section === 'results' && <ResultsPanel bundle={bundle} reload={reload} notify={notify} />}
      {section === 'appeals' && <AppealsPanel bundle={bundle} reload={reload} notify={notify} />}
      {section === 'judges' && <JudgesPanel bundle={bundle} reload={reload} notify={notify} />}
      {section === 'announcers' && <AnnouncersPanel bundle={bundle} reload={reload} notify={notify} />}
      {section === 'broadcast' && <BroadcastPanel bundle={bundle} reload={reload} notify={notify} />}
    </div>
  )
}

function TicketingPanel({ bundle, reload, notify }) {
  const competition = bundle.competition
  const config = bundle.ticketConfig || {}
  const [modalOpen, setModalOpen] = useState(false)
  const [draft, setDraft] = useDraft(config, (item) => ({
    product_title: item?.product_title || `Boletas ${competition.nombre}`,
    product_description: item?.product_description || '',
    max_capacity: item?.max_capacity || 0,
    price_unit: item?.price_unit || 0,
    max_tickets_per_person: item?.max_tickets_per_person || 1,
    max_tickets_per_transaction: item?.max_tickets_per_transaction || 4,
    limit_per_identity: item?.limit_per_identity ? 1 : 0,
    ticket_products: item?.ticket_products?.length ? item.ticket_products : [{ id: 'general', label: 'General', price_unit: item?.price_unit || 0, is_all_days: 1, access_days: [] }],
  }))
  const save = async () => {
    try {
      await api(`/competitions/${competition.id}/ticketing-config`, {
        method: 'PUT',
        body: JSON.stringify({
          ...draft,
          max_capacity: Number(draft.max_capacity || 0),
          price_unit: Number(draft.price_unit || 0),
          max_tickets_per_person: Number(draft.max_tickets_per_person || 1),
          max_tickets_per_transaction: Number(draft.max_tickets_per_transaction || 4),
          ticket_products: draft.ticket_products.map((p) => ({ ...p, price_unit: Number(p.price_unit || 0), is_all_days: p.is_all_days ? 1 : 0 })),
        }),
      })
      notify('Boleteria guardada')
      setModalOpen(false)
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  return (
    <Panel title="Boleteria" subtitle="Configura ventas de publico y revisa ordenes." action={<Button tone="primary" onClick={() => setModalOpen(true)}>Editar boleteria</Button>}>
      {modalOpen ? (
        <Modal title="Editar boleteria" onClose={() => setModalOpen(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <Field label="Titulo"><input style={inputStyle()} value={draft.product_title} onChange={(e) => setDraft('product_title', e.target.value)} /></Field>
              <Field label="Aforo"><input type="number" style={inputStyle()} value={draft.max_capacity} onChange={(e) => setDraft('max_capacity', e.target.value)} /></Field>
              <Field label="Precio base"><input type="number" style={inputStyle()} value={draft.price_unit} onChange={(e) => setDraft('price_unit', e.target.value)} /></Field>
              <Field label="Max por compra"><input type="number" style={inputStyle()} value={draft.max_tickets_per_transaction} onChange={(e) => setDraft('max_tickets_per_transaction', e.target.value)} /></Field>
            </div>
            <Field label="Descripcion de boleteria"><textarea style={{ ...inputStyle(), minHeight: 90 }} value={draft.product_description} onChange={(e) => setDraft('product_description', e.target.value)} /></Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button tone="primary" onClick={save}>Guardar boleteria</Button>
            </div>
          </div>
        </Modal>
      ) : null}
      <div className="fr-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        <MiniStat label="Estado" value={config.enabled ? 'Activa' : 'Borrador'} />
        <MiniStat label="Ordenes" value={(bundle.ticketOrders || []).length} />
        <MiniStat label="Aforo" value={config.max_capacity || 0} />
        <MiniStat label="Precio" value={formatMoney(config.price_unit || 0)} />
      </div>
      {(bundle.ticketOrders || []).slice(0, 20).map((order) => (
        <div key={order.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 10 }}>
          <div><strong>{order.buyer_full_name}</strong><div style={{ color: colors.secondary, fontSize: 12 }}>{order.buyer_email} - {order.quantity} boletas</div></div>
          <Pill tone={order.payment_status === 'approved' ? colors.success : colors.warning}>{order.payment_status}</Pill>
          <span>{formatMoney(order.payment_amount_total)}</span>
        </div>
      ))}
    </Panel>
  )
}

function ClosePanel({ bundle, reload, notify }) {
  const competition = bundle.competition
  const [section, setSection] = useState('summary')
  const deleteResults = async () => {
    if (!window.confirm('Eliminar todos los resultados de esta competencia?')) return
    try {
      await api(`/results/competition/${competition.id}`, { method: 'DELETE' })
      notify('Resultados eliminados')
      await reload()
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  const modules = [
    { id: 'summary', label: 'Cierre', icon: Trophy },
    { id: 'ticketing', label: 'Boleteria', icon: Ticket, count: (bundle.ticketOrders || []).length },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <ModuleTabs items={modules} active={section} onChange={setSection} />
      {section === 'summary' && (
      <Panel title="Cierre operativo" subtitle="Resumen final, finanzas y acciones de archivo." action={<Button tone="primary" primaryAction onClick={() => reload().catch((error) => notify(error.message, 'error'))}><RefreshCw size={16} />Refrescar cierre</Button>}>
        <div className="fr-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
          <MiniStat label="Inscritos" value={(bundle.participants || []).filter((p) => p.estado === 'confirmado').length} />
          <MiniStat label="Resultados" value={(bundle.results || []).length} />
          <MiniStat label="Ingresos" value={formatMoney(bundle.finance?.summary?.gross_revenue || bundle.finance?.gross_revenue || 0)} />
          <MiniStat label="Retiros" value={formatMoney(bundle.finance?.summary?.withdrawn || bundle.finance?.withdrawn || 0)} />
          <MiniStat label="Podiums" value={bundle.leaderboard ? 'Listos' : 'Pendiente'} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link target="_blank" to={`/leaderboard?competition=${competition.id}`} style={{ textDecoration: 'none' }}><Button><Trophy size={16} />Ver podiums</Button></Link>
          <Button onClick={() => api(`/competitions/${competition.id}/participants/export.xlsx`).then((blob) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${competition.nombre}-inscritos.xlsx`; a.click(); URL.revokeObjectURL(url) }).catch((e) => notify(e.message, 'error'))}><Download size={16} />Exportar inscritos</Button>
          <Button tone="danger" onClick={deleteResults}>Limpiar resultados</Button>
        </div>
      </Panel>
      )}
      {section === 'ticketing' && <TicketingPanel bundle={bundle} reload={reload} notify={notify} />}
    </div>
  )
}

function WizardStatusDot({ state }) {
  const tone = state === 'done' ? colors.success : state === 'active' ? colors.primary : state === 'next' ? colors.warning : colors.muted
  return <span style={{ width: 10, height: 10, borderRadius: 999, background: tone, boxShadow: state === 'active' ? `0 0 0 5px ${colors.primary}22` : 'none', flexShrink: 0 }} />
}

function WizardWorkspace({ selectedId, onBack }) {
  const [bundle, setBundle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [activeStepIdState, setActiveStepIdState] = useState('identity')

  const notify = (text, type = 'success') => {
    setToast({ text, type })
    window.setTimeout(() => setToast(null), 3200)
  }

  const reload = async () => {
    setLoading(true)
    const next = await loadCompetitionBundle(selectedId)
    setBundle(next)
    setLoading(false)
    return next
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    loadCompetitionBundle(selectedId)
      .then((data) => {
        if (!active) return
        setBundle(data)
        setActiveStepIdState(activeStepId(data.competition, {
          participants: (data.participants || []).filter((p) => p.estado === 'confirmado').length,
          categories: (data.categories || []).length,
          phases: (data.phases || []).length,
          heats: (data.heats?.items || []).length,
          results: (data.results || []).length,
          judges: (data.judges || []).length,
        }))
      })
      .catch((error) => notify(error.message, 'error'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [selectedId])

  if (loading && !bundle) {
    return <main style={{ minHeight: '100%', background: colors.bg, color: colors.text, display: 'grid', placeItems: 'center' }}>Cargando centro de mando...</main>
  }
  if (!bundle?.competition) {
    return <main style={{ minHeight: '100%', background: colors.bg, color: colors.text, display: 'grid', placeItems: 'center' }}><Button onClick={onBack}>Volver</Button></main>
  }

  const summary = {
    participants: (bundle.participants || []).filter((p) => p.estado === 'confirmado').length,
    categories: (bundle.categories || []).length,
    phases: (bundle.phases || []).length,
    heats: (bundle.heats?.items || []).length,
    results: (bundle.results || []).length,
    judges: (bundle.judges || []).length,
    appeals: (bundle.appeals || []).filter((item) => ACTIVE_APPEAL_STATUSES.includes(item.status)).length,
  }
  const competition = normalizeCompetition(bundle.competition, bundle)
  const steps = buildSteps(bundle.competition, summary)
  const activeStep = steps.find((step) => step.id === activeStepIdState) || steps[0]
  const totalProgress = Math.round(steps.reduce((sum, step) => sum + step.progress, 0) / steps.length)

  return (
    <main className="fr-command-scope" style={{ minHeight: '100%', background: colors.bg, color: colors.text }}>
      {toast ? (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 10020, border: `1px solid ${toast.type === 'error' ? colors.error : colors.accent}`, background: colors.surface, color: colors.text, borderRadius: 8, padding: '11px 13px', boxShadow: '0 18px 40px rgba(0,0,0,0.35)' }}>
          {toast.text}
        </div>
      ) : null}
      <div className="fr-command-page" style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: '22px 16px 34px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <button type="button" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: colors.secondary, background: 'transparent', padding: 0, fontSize: 13, fontWeight: 800 }}>
            <ArrowLeft size={16} /> Mis competencias
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button onClick={() => reload().catch((error) => notify(error.message, 'error'))}><RefreshCw size={16} />Refrescar</Button>
            <Pill tone={colors.accent}>Wizard real</Pill>
            <Pill tone={colors.primary}>{activeStep.label}</Pill>
          </div>
        </div>

        <section style={{ border: `1px solid ${colors.border}`, borderRadius: 8, background: 'linear-gradient(135deg, rgba(255,107,0,0.18) 0%, rgba(23,27,33,0.96) 42%, rgba(0,194,168,0.10) 100%)', padding: 18, display: 'grid', gap: 16 }}>
          <div className="fr-command-hero-top" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) auto', gap: 16, alignItems: 'start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#FFB36F', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Competencia</div>
              <h1 style={{ marginTop: 6, fontSize: 'clamp(30px, 5vw, 58px)', lineHeight: 0.95, fontFamily: 'Bebas Neue, Poppins, sans-serif', letterSpacing: 0 }}>{competition.name}</h1>
              <p style={{ marginTop: 10, maxWidth: 760, color: colors.secondary, fontSize: 14, lineHeight: 1.6 }}>{competition.venue} - {competition.date}. {activeStep.purpose}</p>
            </div>
            <div className="fr-command-hero-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button tone="primary" onClick={() => {
                const firstButton = document.querySelector('[data-primary-action="true"]')
                if (firstButton) firstButton.click()
              }}><Zap size={16} />{activeStep.nextAction}</Button>
              <Link to={`/competitions/${bundle.competition.slug || bundle.competition.id}`} target="_blank" style={{ textDecoration: 'none' }}><Button><Eye size={16} />Vista publica</Button></Link>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: colors.secondary, fontSize: 12, fontWeight: 800 }}>
              <span>{steps.filter((step) => step.state === 'done').length} de {steps.length} etapas completas</span>
              <span>{totalProgress}% avance general</span>
            </div>
            <div style={{ height: 12, borderRadius: 999, background: colors.border, overflow: 'hidden' }}>
              <div style={{ width: `${totalProgress}%`, height: '100%', background: colors.gradient }} />
            </div>
          </div>
        </section>

        <section className="fr-wizard-layout" style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '292px minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
          <aside className="fr-wizard-sidebar" style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 12, display: 'grid', gap: 10, position: 'sticky', top: 90 }}>
            <div><div style={{ fontWeight: 900 }}>Flujo de competencia</div><div style={{ color: colors.secondary, fontSize: 12, marginTop: 3 }}>Elige una etapa para operar.</div></div>
            {steps.map((step, index) => {
              const Icon = step.icon
              const active = step.id === activeStep.id
              return (
                <button key={step.id} type="button" onClick={() => setActiveStepIdState(step.id)} style={{ display: 'grid', gridTemplateColumns: '34px 1fr auto', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left', borderRadius: 8, border: `1px solid ${active ? 'rgba(255,107,0,0.58)' : colors.border}`, background: active ? 'rgba(255,107,0,0.12)' : colors.top, color: colors.text, padding: 10 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center', background: active ? colors.primary : colors.surface, color: active ? colors.bg : colors.secondary }}><Icon size={17} /></span>
                  <span style={{ minWidth: 0 }}><span style={{ display: 'block', color: colors.muted, fontSize: 10, fontWeight: 900 }}>Paso {index + 1}</span><span style={{ display: 'block', fontSize: 13, fontWeight: 900 }}>{step.label}</span></span>
                  <WizardStatusDot state={step.state} />
                </button>
              )
            })}
            <div className="fr-wizard-sidebar-stats" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <MiniStat label="Inscritos" value={summary.participants} />
              <MiniStat label="Resultados" value={summary.results} />
            </div>
          </aside>

          <section style={{ display: 'grid', gap: 12, minWidth: 0 }}>
            <Panel title={activeStep.title} subtitle={activeStep.purpose}>
              <div className="fr-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 10 }}>
                <MiniStat label="Categorias" value={summary.categories} />
                <MiniStat label="Fases" value={summary.phases} />
                <MiniStat label="Heats" value={summary.heats} />
                <MiniStat label="Jueces" value={summary.judges} />
                <MiniStat label="Estado" value={competition.status} />
                <MiniStat label="Avance" value={`${competition.health}%`} />
              </div>
            </Panel>

            {activeStep.id === 'identity' && <IdentityPanel bundle={bundle} reload={reload} notify={notify} />}
            {activeStep.id === 'registration' && <RegistrationPanel bundle={bundle} reload={reload} notify={notify} />}
            {activeStep.id === 'prepare' && <PreparePanel bundle={bundle} reload={reload} notify={notify} />}
            {activeStep.id === 'live' && <LivePanel bundle={bundle} reload={reload} notify={notify} />}
            {activeStep.id === 'close' && <ClosePanel bundle={bundle} reload={reload} notify={notify} />}
          </section>
        </section>
      </div>
      <ResponsiveStyles />
    </main>
  )
}

function CreateCompetitionModal({ onClose, onCreated, notify }) {
  const [draft, setDraft] = useState({ nombre: '', descripcion: '', lugar: '', competition_start: '', competition_end: '' })
  const [busy, setBusy] = useState(false)
  const create = async () => {
    if (!draft.nombre.trim()) return notify('Nombre requerido', 'error')
    setBusy(true)
    try {
      const created = await api('/competitions', {
        method: 'POST',
        body: JSON.stringify({
          ...draft,
          competition_start: toUtcOrNull(draft.competition_start),
          competition_end: toUtcOrNull(draft.competition_end),
          timezone: 'America/Bogota',
          activa: 0,
        }),
      })
      notify('Competencia creada')
      onCreated(created)
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Nueva competencia" onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="Nombre"><input style={inputStyle()} value={draft.nombre} onChange={(e) => setDraft((p) => ({ ...p, nombre: e.target.value }))} /></Field>
        <Field label="Descripcion"><textarea style={{ ...inputStyle(), minHeight: 90 }} value={draft.descripcion} onChange={(e) => setDraft((p) => ({ ...p, descripcion: e.target.value }))} /></Field>
        <Field label="Lugar"><input style={inputStyle()} value={draft.lugar} onChange={(e) => setDraft((p) => ({ ...p, lugar: e.target.value }))} /></Field>
        <div className="fr-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Inicio"><input type="datetime-local" style={inputStyle()} value={draft.competition_start} onChange={(e) => setDraft((p) => ({ ...p, competition_start: e.target.value }))} /></Field>
          <Field label="Fin"><input type="datetime-local" style={inputStyle()} value={draft.competition_end} onChange={(e) => setDraft((p) => ({ ...p, competition_end: e.target.value }))} /></Field>
        </div>
        <Button tone="primary" onClick={create} disabled={busy}><Plus size={16} />Crear y abrir wizard</Button>
      </div>
    </Modal>
  )
}

function ResponsiveStyles() {
  return (
    <style>{`
      .fr-result-mobile-label {
        display: block;
        color: ${colors.muted};
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
        margin-bottom: 5px;
      }
      .fr-result-input-wrap,
      .fr-result-readonly,
      .fr-result-card-field {
        display: grid;
        align-content: center;
        min-width: 0;
        min-height: 58px;
        padding: 8px 10px;
        border: 1px solid ${colors.border};
        border-radius: 8px;
        background: ${colors.surface};
      }
      .fr-result-readonly::before,
      .fr-result-card-field::before {
        content: attr(data-label);
        display: block;
        color: ${colors.muted};
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
        margin-bottom: 5px;
      }
      .fr-result-tiebreak-field {
        border-color: rgba(245,158,11,0.36) !important;
        background: rgba(245,158,11,0.08) !important;
      }
      .fr-result-label-with-help,
      .fr-result-value-with-help {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .fr-tiebreak-help {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
        border: 1px solid rgba(245,158,11,0.42);
        border-radius: 999px;
        color: ${colors.warning};
        background: rgba(245,158,11,0.12);
        cursor: help;
      }
      .fr-tiebreak-help::after {
        content: "Hay empate en la marca. El tiebreak puede desempatar.";
        position: absolute;
        left: 50%;
        top: calc(100% + 8px);
        z-index: 20;
        width: max-content;
        max-width: min(260px, 72vw);
        padding: 8px 10px;
        border: 1px solid rgba(245,158,11,0.42);
        border-radius: 8px;
        background: ${colors.top};
        color: ${colors.text};
        box-shadow: 0 14px 34px rgba(0,0,0,0.38);
        font-size: 11px;
        font-weight: 850;
        line-height: 1.35;
        text-transform: none;
        transform: translate(-50%, -4px);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.14s ease, transform 0.14s ease;
        white-space: normal;
      }
      .fr-tiebreak-help:hover::after,
      .fr-tiebreak-help:focus-visible::after {
        opacity: 1;
        transform: translate(-50%, 0);
      }
      .fr-tiebreak-help:focus-visible {
        outline: 2px solid rgba(245,158,11,0.55);
        outline-offset: 2px;
      }
      @media (max-width: 1120px) {
        .fr-wizard-layout,
        .fr-command-portfolio-grid {
          grid-template-columns: 1fr !important;
        }
        .fr-wizard-sidebar {
          position: static !important;
        }
        .fr-stat-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
        .fr-form-grid {
          grid-template-columns: 1fr !important;
        }
      }
      @media (max-width: 760px) {
        .fr-command-page {
          padding: 12px 10px 24px !important;
        }
        .fr-command-scope button {
          max-width: 100%;
          white-space: normal !important;
        }
        .fr-command-modal-overlay {
          padding: 18px 10px 92px !important;
          place-items: center stretch !important;
        }
        .fr-command-modal {
          width: 100% !important;
          max-height: calc(100dvh - 128px) !important;
          border-radius: 12px !important;
        }
        .fr-command-modal-header {
          padding: 10px 12px !important;
          align-items: flex-start !important;
        }
        .fr-command-modal-title {
          font-size: 16px !important;
          line-height: 1.2 !important;
          min-width: 0;
        }
        .fr-command-modal-body {
          padding: 12px !important;
        }
        .fr-panel-header {
          align-items: stretch !important;
        }
        .fr-panel-action {
          width: 100%;
          justify-content: stretch !important;
        }
        .fr-panel-action > button,
        .fr-panel-action > a {
          width: 100%;
        }
        .fr-panel-action > div {
          width: 100%;
          display: grid !important;
          grid-template-columns: 1fr !important;
        }
        .fr-panel-action > div > button,
        .fr-panel-action > div > a {
          width: 100%;
        }
        .fr-panel-body > * {
          min-width: 0 !important;
          max-width: 100% !important;
        }
        .fr-scoring-mode-grid,
        .fr-scoring-settings,
        .fr-scoring-phase-row {
          grid-template-columns: 1fr !important;
          width: 100% !important;
          min-width: 0 !important;
        }
        .fr-scoring-mode-grid > button,
        .fr-scoring-settings > *,
        .fr-scoring-phase-row > * {
          min-width: 0 !important;
          max-width: 100% !important;
        }
        .fr-scoring-mode-grid span,
        .fr-scoring-settings,
        .fr-scoring-phase-row {
          overflow-wrap: break-word;
        }
        .fr-panel-body [style*="grid-template-columns: minmax(0, 1fr) auto"],
        .fr-panel-body [style*="grid-template-columns: 1fr auto"],
        .fr-panel-body [style*="grid-template-columns: auto 1fr"],
        .fr-panel-body [style*="grid-template-columns: minmax(0px, 1fr) auto"],
        .fr-panel-body [style*="grid-template-columns: 1fr auto auto"],
        .fr-panel-body [style*="grid-template-columns: minmax(0, 1fr) auto auto"] {
          grid-template-columns: 1fr !important;
        }
        .fr-results-header {
          display: none !important;
        }
        .fr-results-list {
          max-height: none !important;
          padding-bottom: 84px;
        }
        .fr-result-rules {
          gap: 6px !important;
          padding: 8px !important;
        }
        .fr-result-rules > span:last-child {
          font-size: 11px !important;
          line-height: 1.35 !important;
        }
        .fr-result-row {
          gap: 10px !important;
          align-items: stretch !important;
          margin: 0;
        }
        .fr-result-card-head {
          grid-template-columns: minmax(0, 1fr) auto !important;
        }
        .fr-result-card-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
        .fr-result-athlete {
          grid-column: 1 / -1;
          font-size: 14px !important;
          line-height: 1.25;
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: clip !important;
          order: 3;
        }
        .fr-result-lane {
          order: 1;
          padding: 5px 8px;
          border-radius: 999px;
          background: rgba(255,107,0,0.10);
          color: ${colors.primary} !important;
          width: fit-content;
        }
        .fr-result-lane::before {
          content: none;
          color: ${colors.muted};
          font-weight: 700;
        }
        .fr-result-heat {
          order: 2;
          text-align: right;
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: clip !important;
          align-self: center;
          justify-self: end;
        }
        .fr-result-input-wrap,
        .fr-result-readonly {
          gap: 5px;
          order: 4;
        }
        .fr-result-mobile-label,
        .fr-result-readonly::before {
          color: ${colors.muted};
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .fr-result-readonly::before {
          content: attr(data-label);
        }
        .fr-result-mark,
        .fr-result-extra,
        .fr-result-tiebreak {
          width: 100% !important;
        }
        .fr-result-position {
          order: 5;
          padding: 7px 9px;
          border: 1px solid ${colors.border};
          border-radius: 8px;
          background: ${colors.surface};
        }
        .fr-result-position::before {
          content: "Pos ";
          color: ${colors.muted};
          font-weight: 700;
        }
        .fr-result-points {
          order: 6;
          text-align: right;
          padding: 7px 9px;
          border: 1px solid ${colors.border};
          border-radius: 8px;
          background: ${colors.surface};
        }
        .fr-result-points::before {
          content: "Pts ";
          color: ${colors.muted};
          font-weight: 700;
        }
        .fr-result-actions {
          order: 7;
          grid-column: 1 / -1;
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .fr-result-actions > button {
          width: 100%;
        }
        .fr-mobile-table-wrap {
          overflow-x: visible !important;
        }
        .fr-mobile-card-table {
          min-width: 0 !important;
          border-collapse: separate !important;
          border-spacing: 0 10px !important;
        }
        .fr-mobile-card-table thead {
          display: none !important;
        }
        .fr-mobile-card-table tbody,
        .fr-mobile-card-table tr,
        .fr-mobile-card-table td {
          display: block !important;
          width: 100% !important;
        }
        .fr-mobile-card-table tr {
          border: 1px solid ${colors.border} !important;
          border-radius: 8px;
          background: ${colors.top};
          overflow: hidden;
        }
        .fr-mobile-card-table td {
          padding: 9px 10px !important;
          border-bottom: 1px solid ${colors.border};
        }
        .fr-mobile-card-table td:last-child {
          border-bottom: 0;
        }
        .fr-mobile-card-table td::before {
          content: attr(data-label);
          display: block;
          color: ${colors.muted};
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .fr-mobile-card-table td[data-label="Acciones"] > div {
          display: grid !important;
          grid-template-columns: 1fr !important;
        }
        .fr-mobile-card-table td[data-label="Acciones"] button {
          width: 100%;
        }
        .fr-wizard-sidebar {
          display: flex !important;
          gap: 8px !important;
          overflow-x: auto !important;
          position: sticky !important;
          top: 0 !important;
          z-index: 30 !important;
          padding: 8px !important;
          scroll-snap-type: x proximity;
        }
        .fr-wizard-sidebar > div:first-child,
        .fr-wizard-sidebar-stats {
          display: none !important;
        }
        .fr-wizard-sidebar > button {
          min-width: 174px;
          grid-template-columns: 30px minmax(0, 1fr) auto !important;
          scroll-snap-align: start;
          padding: 9px !important;
        }
        .fr-wizard-sidebar > button > span:first-child {
          width: 30px !important;
          height: 30px !important;
        }
        .fr-module-tabs {
          margin-left: -2px;
          margin-right: -2px;
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          overflow-x: visible !important;
          scrollbar-width: auto !important;
          padding: 6px !important;
        }
        .fr-module-tabs > button {
          width: 100%;
          min-width: 0;
          justify-content: center;
          flex: initial !important;
          padding: 9px 8px !important;
        }
        .fr-module-tabs > button span {
          min-width: 0;
        }
        .fr-heat-mode-switch {
          display: grid !important;
          grid-template-columns: 1fr 1fr;
          gap: 8px !important;
        }
        .fr-heat-mode-switch > button {
          width: 100%;
          justify-content: center;
          min-height: 44px;
          padding-left: 8px !important;
          padding-right: 8px !important;
        }
        .fr-schedule-toolbar {
          display: grid !important;
          grid-template-columns: 1fr !important;
          gap: 10px !important;
          padding: 10px !important;
        }
        .fr-schedule-day-controls {
          display: grid !important;
          grid-template-columns: 1fr !important;
          gap: 8px !important;
        }
        .fr-schedule-day-controls > button {
          width: 100%;
        }
        .fr-schedule-day-controls > span {
          justify-content: center;
          text-align: center;
        }
        .fr-schedule-summary {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 7px !important;
        }
        .fr-schedule-summary > span,
        .fr-schedule-summary > button {
          width: 100%;
          justify-content: center;
        }
        .fr-schedule-desktop {
          display: none !important;
        }
        .fr-schedule-mobile {
          display: grid !important;
          gap: 10px;
          padding-bottom: 84px;
        }
        .fr-schedule-card {
          box-shadow: 0 10px 26px rgba(0,0,0,0.22);
        }
        .fr-schedule-card button {
          white-space: nowrap !important;
        }
        .fr-command-hero-top {
          grid-template-columns: 1fr !important;
        }
        .fr-command-hero-top h1 {
          font-size: clamp(28px, 11vw, 40px) !important;
        }
        .fr-command-hero-actions {
          justify-content: stretch !important;
        }
        .fr-command-hero-actions > button,
        .fr-command-hero-actions > a {
          width: 100%;
        }
        .fr-inline-grid {
          grid-template-columns: 1fr !important;
        }
        .fr-command-competition-grid,
        .fr-competition-card-metrics {
          grid-template-columns: 1fr !important;
        }
      }
      @media (max-width: 420px) {
        .fr-stat-grid {
          grid-template-columns: 1fr !important;
        }
        .fr-module-tabs {
          grid-template-columns: 1fr !important;
        }
        .fr-command-modal-header > button {
          padding-left: 10px !important;
          padding-right: 10px !important;
        }
      }
    `}</style>
  )
}

export default function AdminCompetitionCommandProposal() {
  const [view, setView] = useState('portfolio')
  const [selectedId, setSelectedId] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [toast, setToast] = useState(null)

  const notify = (text, type = 'success') => {
    setToast({ text, type })
    window.setTimeout(() => setToast(null), 3200)
  }

  const loadPortfolio = async () => {
    setLoading(true)
    setError('')
    try {
      const competitions = await api('/competitions')
      const summaries = await Promise.all(
        competitions.map(async (competition) => {
          const bundle = await loadCompetitionBundle(competition.id).catch(() => ({ competition, participants: [], categories: [], phases: [], heats: { items: [] }, results: [], judges: [] }))
          return normalizeCompetition(competition, bundle)
        })
      )
      setItems(summaries)
    } catch (err) {
      setError(err.message || 'No se pudo cargar el API local.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPortfolio()
  }, [])

  const totalAthletes = items.reduce((sum, item) => sum + Number(item.athletes || 0), 0)
  const totalCategories = items.reduce((sum, item) => sum + Number(item.categories || 0), 0)
  const averageHealth = items.length ? Math.round(items.reduce((sum, item) => sum + Number(item.health || 0), 0) / items.length) : 0

  if (view === 'wizard' && selectedId) {
    return <WizardWorkspace selectedId={selectedId} onBack={() => { setView('portfolio'); loadPortfolio() }} />
  }

  return (
    <main className="fr-command-scope" style={{ minHeight: '100%', background: colors.bg, color: colors.text }}>
      {toast ? <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 10020, border: `1px solid ${toast.type === 'error' ? colors.error : colors.accent}`, background: colors.surface, borderRadius: 8, padding: '11px 13px' }}>{toast.text}</div> : null}
      {createOpen ? <CreateCompetitionModal onClose={() => setCreateOpen(false)} notify={notify} onCreated={(created) => { setCreateOpen(false); setSelectedId(created.id); setView('wizard') }} /> : null}
      <div className="fr-command-page" style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: '22px 16px 34px' }}>
        <div style={{ marginBottom: 16 }}>
          <AdminToolsNav />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button onClick={loadPortfolio}><RefreshCw size={16} />Refrescar</Button>
            <Pill tone={colors.accent}>Wizard</Pill>
            <Pill tone={colors.primary}>{loading ? 'Cargando' : 'Datos reales'}</Pill>
          </div>
        </div>

        <section style={{ border: `1px solid ${colors.border}`, borderRadius: 8, background: 'linear-gradient(135deg, rgba(255,107,0,0.18) 0%, rgba(23,27,33,0.96) 42%, rgba(0,194,168,0.10) 100%)', padding: 18, display: 'grid', gap: 16 }}>
          <div className="fr-command-hero-top" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) auto', gap: 16, alignItems: 'start' }}>
            <div>
              <div style={{ color: '#FFB36F', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Organizador</div>
              <h1 style={{ marginTop: 6, fontSize: 'clamp(34px, 5vw, 64px)', lineHeight: 0.95, fontFamily: 'Bebas Neue, Poppins, sans-serif', letterSpacing: 0 }}>Mis competencias</h1>
              <p style={{ marginTop: 10, maxWidth: 720, color: colors.secondary, fontSize: 14, lineHeight: 1.6 }}>
                Entra a cada competencia y avanza por etapas claras: datos base, inscripciones, preparacion, operacion en vivo y cierre.
              </p>
            </div>
            <div className="fr-command-hero-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button tone="primary" onClick={() => setCreateOpen(true)}><Plus size={16} />Nueva competencia</Button>
            </div>
          </div>

          <div className="fr-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: 10 }}>
            <MiniStat label="Competencias" value={items.length} tone={colors.primary} />
            <MiniStat label="Inscritos" value={totalAthletes} tone={colors.accent} />
            <MiniStat label="Categorias" value={totalCategories} tone={colors.success} />
            <MiniStat label="Avance" value={`${averageHealth}%`} tone={colors.warning} />
          </div>
          {error ? <div style={{ border: `1px solid ${colors.error}`, background: 'rgba(239,68,68,0.12)', color: '#FCA5A5', borderRadius: 8, padding: 10 }}>{error}</div> : null}
        </section>

        <section style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 14, alignItems: 'start' }} className="fr-command-portfolio-grid">
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 22, lineHeight: 1.15 }}>Competencias</h2>
              <div style={{ color: colors.secondary, fontSize: 13, marginTop: 4 }}>Abre una competencia para operar el wizard con datos reales.</div>
            </div>
            <div className="fr-command-competition-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 12 }}>
              {items.map((item) => (
                <CompetitionCard key={item.id} item={item} onOpen={(id) => { setSelectedId(id); setView('wizard') }} />
              ))}
              {!items.length && !loading ? <Panel title="Sin competencias" subtitle="Crea una competencia para empezar."><Button tone="primary" onClick={() => setCreateOpen(true)}>Crear competencia</Button></Panel> : null}
            </div>
          </div>

          <aside style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 14, display: 'grid', gap: 13 }}>
            <div><div style={{ fontWeight: 900 }}>Prioridades</div><div style={{ color: colors.secondary, fontSize: 12, marginTop: 2 }}>Siguiente accion por evento</div></div>
            {items.slice(0, 4).map((item) => (
              <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); setView('wizard') }} style={{ textAlign: 'left', border: `1px solid ${colors.border}`, background: colors.top, color: colors.text, borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.primary, fontSize: 12, fontWeight: 900 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: colors.primary }} />{item.name}</div>
                <div style={{ color: colors.secondary, fontSize: 12, lineHeight: 1.45, marginTop: 7 }}>{item.nextStep}</div>
              </button>
            ))}
          </aside>
        </section>
      </div>
      <ResponsiveStyles />
    </main>
  )
}
