import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import api from '../api/axios'
import { buildCityCountry, loadCitiesByCountry, loadCountries, parseCityCountry } from '../utils/locations'
import { APP_CONTENT_MAX_WIDTH } from '../utils/competitionLayout'
import { COMPETITION_THEME_FIELDS, getReadableTextColor, hexToRgba, normalizeHexColor, resolveCompetitionTheme } from '../utils/competitionTheme'
import { cedulaInputValue, formatCedula } from '../utils/participantProfile'
import { X, Trash2, Pencil, ChevronDown, ChevronRight, ClipboardList, Clock3, Hourglass, Play, Pause, RotateCcw, ArrowLeft, Crown, Info, QrCode, Plus, CheckCircle2, MoreHorizontal } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { COMPETITION_WORKSPACE_SECTIONS } from './adminCompetitionWorkspace'
import { CompetitionSchedulePanel } from './adminCompetitionSchedulePanel'
import CompetitionDiscountsPage from './CompetitionDiscountsPage'
import CompetitorInvitationsPage from './CompetitorInvitationsPage'
import AdminGymsPanel from './AdminGymsPanel'

function buildAthleteProfilePath(username) {
  const value = String(username || '').trim()
  return value ? `/a/${value}` : ''
}

function AthleteNameLink({ username, children, style }) {
  const profilePath = buildAthleteProfilePath(username)
  if (!profilePath) return <span style={style}>{children}</span>
  return (
    <Link
      to={profilePath}
      style={{
        color: 'inherit',
        textDecoration: 'none',
        borderBottom: '1px solid rgba(255,107,0,0.45)',
        transition: 'border-color 0.18s ease, color 0.18s ease',
        ...style,
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.color = '#FF9A3D'
        event.currentTarget.style.borderBottomColor = '#FF9A3D'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.color = 'inherit'
        event.currentTarget.style.borderBottomColor = 'rgba(255,107,0,0.45)'
      }}
    >
      {children}
    </Link>
  )
}

function SuccessToast({ text, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{
        position: 'relative',
        background: '#0D1117',
        border: '2px solid #D6D9E0',
        borderRadius: 12,
        padding: '18px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9,
        boxShadow: '0 0 30px rgba(214,217,224,0.18), 0 4px 20px rgba(0,0,0,0.7)',
        animation: 'successToastIn 0.25s cubic-bezier(.34,1.56,.64,1)',
        pointerEvents: 'auto',
      }}>
        <button onClick={onDone} style={{
          position: 'absolute', top: 6, right: 6,
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#AAB2C0', lineHeight: 1, padding: 2,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div style={{
          width: 36, height: 36,
          borderRadius: '50%',
          border: '2px solid #D6D9E0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(214,217,224,0.08)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D6D9E0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#F5F7FA', letterSpacing: 0.2, textAlign: 'center' }}>
          {text || 'Datos guardados correctamente'}
        </span>
      </div>
      <style>{`@keyframes successToastIn { from { opacity:0; transform:scale(0.8); } to { opacity:1; transform:scale(1); } }`}</style>
    </div>
  )
}

const CATEGORIAS = ['Rx', 'Scaled', 'Masters', 'Teens', 'Otro']
const GENEROS = ['M', 'F', 'Otro']
const CATEGORY_ORDER = ['Rx', 'Scaled', 'Masters', 'Teens', 'Otro', 'Sin categoria']
const JUDGE_CARD_PAGE_SPECS = {
  letter: { width: 612, height: 792, label: 'LETTER' },
  a4: { width: 595.28, height: 841.89, label: 'A4' },
}
const JUDGE_CARD_QR_FIXED_SIZE_PT = 0.72 * 72
const JUDGE_CARD_QR_SAFE_ZONE_PT = 8
const JUDGE_CARD_TITLE_BAND_PT = 20
const JUDGE_CARD_COLUMN_GAP_PT = 12

function resolveJudgeCardLayout(layout, options = {}) {
  const normalized = String(layout || 'auto').trim().toLowerCase()
  if (/^[1-4]x([1-9]|10)$/.test(normalized)) return normalized
  if (normalized && normalized !== 'auto') return normalized
  let visibleLines = 2
  if (options.includeCedula) visibleLines += 1
  if (options.includeScoreField) visibleLines += 1
  if (options.includeSignatureField) visibleLines += 1
  if (options.includeNotesField) visibleLines += 1
  if (options.includeQr) visibleLines += 1
  if (visibleLines <= 4) return '3x6'
  if (visibleLines <= 5) return '3x5'
  if (visibleLines <= 6) return '3x4'
  if (visibleLines <= 7) return '2x5'
  if (visibleLines <= 8) return '2x4'
  return '2x3'
}

function sanitizeJudgeCardGridValue(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

function orderCategories(data) {
  const keys = Object.keys(data || {})
  return CATEGORY_ORDER.filter(c => keys.includes(c)).concat(keys.filter(c => !CATEGORY_ORDER.includes(c)))
}

function buildJudgeCardPreviewMetaRows(card, includeCedula) {
  const rows = [
    { text: `${card.phaseName || ''} | ${card.category || ''}`, size: 6.7, color: '#252A33', gap: 7.4 },
  ]
  const heatParts = []
  if (card.heat) heatParts.push(`Heat: ${card.heat}`)
  if (Number(card.lane) > 0) heatParts.push(`Carril: ${Number(card.lane)}`)
  if (card.zone) heatParts.push(`Zona: ${card.zone}`)
  if (heatParts.length) rows.push({ text: heatParts.join(' | '), size: 5.8, color: '#6B7280', gap: 7.4 })
  if (includeCedula && card.cedula) rows.push({ text: `ID: ${card.cedula}`, size: 5.8, color: '#6B7280', gap: 7.4 })
  return rows
}

function buildJudgeCardPreviewFormRows(card, writingSpaceChars) {
  const writing = '_'.repeat(Math.min(48, Math.max(8, Number(writingSpaceChars || 30))))
  const rows = []
  if (card.includeScoreField) rows.push({ text: `Puntuacion: ${writing}`, size: 7.5, color: '#0D0F12', bold: true })
  if (card.includeSignatureField) rows.push({ text: `Firma atleta: ${writing}`, size: 7.5, color: '#0D0F12', bold: true })
  if (card.includeNotesField) rows.push({ text: `Notas: ${writing}`, size: 6.5, color: '#6B7280', bold: false })
  return rows
}

async function readBlobErrorDetail(error, fallbackMessage) {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  const blob = error?.response?.data
  if (blob instanceof Blob) {
    try {
      const text = await blob.text()
      if (text) {
        const parsed = JSON.parse(text)
        if (typeof parsed?.detail === 'string' && parsed.detail.trim()) return parsed.detail.trim()
      }
    } catch {
      // Ignore blob parsing errors and use fallback below.
    }
  }
  return fallbackMessage
}

function parseEnrollmentQuestions(raw) {
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item, idx) => ({
        id: String(item?.id || `q_${idx + 1}`),
        label: String(item?.label || '').trim(),
        field_type: String(item?.field_type || 'text').trim().toLowerCase() || 'text',
        required: Number(item?.required) ? 1 : 0,
        placeholder: String(item?.placeholder || '').trim(),
      }))
      .filter(item => item.label)
  } catch {
    return []
  }
}

function normalizeEnrollmentPrice(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.round(parsed))
}

function calculateEnrollmentPricing(basePrice, feeRate = 0.05, minPlatformFee = 5000) {
  const organizerPrice = normalizeEnrollmentPrice(basePrice)
  let platformFee = Math.round(organizerPrice * feeRate)
  if (organizerPrice > 0 && platformFee < minPlatformFee) {
    platformFee = minPlatformFee
  }
  return {
    organizerPrice,
    platformFee,
    totalPrice: organizerPrice + platformFee,
  }
}

function formatCop(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function parseTicketingTiers(raw) {
  if (!raw) return []
  const parsed = Array.isArray(raw) ? raw : []
  return parsed
    .map((item) => ({
      min_quantity: Number(item?.min_quantity || 0),
      unit_price: Number(item?.unit_price || 0),
    }))
    .filter(item => item.min_quantity > 0 && item.unit_price > 0)
}

function parseTicketingProducts(raw) {
  if (!raw) return []
  const parsed = Array.isArray(raw) ? raw : []
  return parsed
    .map((item, index) => ({
      id: String(item?.id || `product_${index + 1}`).trim(),
      label: String(item?.label || '').trim(),
      price_unit: Number(item?.price_unit || 0),
      access_days: Array.isArray(item?.access_days)
        ? item.access_days.map(day => String(day || '').trim()).filter(Boolean)
        : [],
      is_all_days: Number(item?.is_all_days || 0) ? 1 : 0,
    }))
    .filter(item => item.label && item.price_unit > 0)
}

function formatDate(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return String(value)
  }
}

function formatDurationShort(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds || 0))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function toLocalDateTimeInput(value) {
  return value ? String(value).slice(0, 16) : ''
}

function toDateInput(value) {
  return value ? String(value).slice(0, 10) : ''
}

function parseCalendarDate(value) {
  if (!value) return null
  const raw = String(value).trim()
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) {
    const [, year, month, day] = match
    const date = new Date(Number(year), Number(month) - 1, Number(day))
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

function dateInputToStartOfDay(value) {
  return value ? `${value}T00:00:00` : null
}

function dateInputToEndOfDay(value) {
  return value ? `${value}T23:59:59` : null
}

function resolveCompetitionAsset(competition, asset, isMobile = false) {
  if (!competition) return ''
  const profile = competition.profile_image_url || ''
  const banner = competition.banner_image_url || ''
  const desktop = competition.banner_desktop_url || ''
  const mobile = competition.banner_mobile_url || ''
  const legacy = competition.imagen_url || ''
  if (asset === 'profile') return profile || legacy
  if (asset === 'banner') return banner || desktop || mobile || legacy
  return legacy
}

function parseScheduleItems(raw) {
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item, idx) => ({
        id: String(item?.id || `date_${idx + 1}`),
        label: String(item?.label || '').trim(),
        kind: String(item?.kind || 'custom').trim().toLowerCase() || 'custom',
        start_at: toDateInput(item?.start_at),
        end_at: toDateInput(item?.end_at),
        phase_id: item?.phase_id == null ? '' : String(item.phase_id),
        use_phase_dates: Number(item?.use_phase_dates || 0),
        note: String(item?.note || '').trim(),
      }))
      .filter(item => item.label || item.start_at || item.end_at || item.note || item.phase_id)
  } catch {
    return []
  }
}

function parseSocialLinks(raw) {
  const knownPlatforms = {
    instagram: 'Instagram',
    whatsapp: 'WhatsApp',
    youtube: 'YouTube',
    facebook: 'Facebook',
    tiktok: 'TikTok',
    x: 'X',
  }
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item, idx) => ({
        id: String(item?.id || `social_${idx + 1}`),
        platform: Object.entries(knownPlatforms).find(([, label]) => label.toLowerCase() === String(item?.label || '').trim().toLowerCase())?.[0] || 'other',
        custom_label: Object.values(knownPlatforms).some(label => label.toLowerCase() === String(item?.label || '').trim().toLowerCase())
          ? ''
          : String(item?.label || '').trim(),
        url: String(item?.url || '').trim(),
      }))
      .filter(item => item.custom_label || item.url || item.platform !== 'other')
  } catch {
    return []
  }
}

function parseLandingSections(raw) {
  const defaultItems = () => ([
    { title: '', body: '' },
    { title: '', body: '' },
    { title: '', body: '' },
  ])
  const empty = {
    experience_title: '',
    experience_intro: '',
    experience_items: defaultItems(),
    format_title: '',
    format_items: defaultItems(),
    highlights_title: '',
    highlights_items: defaultItems(),
  }
  if (!raw) return empty
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const withDefaults = (items) => {
      const arr = Array.isArray(items) ? items : []
      if (!arr.length) return defaultItems()
      return arr.map((item) => ({
        title: String(item?.title || '').trim(),
        body: String(item?.body || '').trim(),
      }))
    }
    return {
      experience_title: String(parsed?.experience?.title || '').trim(),
      experience_intro: String(parsed?.experience?.intro || '').trim(),
      experience_items: withDefaults(parsed?.experience?.items),
      format_title: String(parsed?.format?.title || '').trim(),
      format_items: withDefaults(parsed?.format?.items),
      highlights_title: String(parsed?.highlights?.title || '').trim(),
      highlights_items: withDefaults(parsed?.highlights?.items),
    }
  } catch {
    return empty
  }
}

const COMPETITION_ASSET_RECOMMENDATIONS = {
  profile: 'Recomendado 512 x 512 px. Formato cuadrado.',
  banner: 'Recomendado 1600 x 900 px. Formato horizontal 16:9.',
}

function parseEnrollmentAnswers(raw) {
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(item => ({
        question_id: String(item?.question_id || '').trim(),
        question_label: String(item?.question_label || '').trim(),
        question_type: String(item?.question_type || 'text').trim().toLowerCase() || 'text',
        answer: String(item?.answer || '').trim(),
      }))
      .filter(item => item.question_label || item.answer)
  } catch {
    return []
  }
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function downloadEnrollmentWorkbook(participants, competitionName) {
  const answerLabels = Array.from(new Set(
    participants.flatMap(participant => parseEnrollmentAnswers(participant.enrollment_answers).map(item => item.question_label || 'Respuesta'))
  ))
  const headers = [
    'Participante',
    'Cedula',
    'Categoria',
    'Estado',
    'Email',
    'Celular',
    'Genero',
    'Box',
    'Ciudad / Pais',
    ...answerLabels,
  ]
  const rows = participants.map(participant => {
    const answers = Object.fromEntries(
      parseEnrollmentAnswers(participant.enrollment_answers).map(item => [
        item.question_label || 'Respuesta',
        item.question_type === 'image' && item.answer ? item.answer : (item.answer || ''),
      ])
    )
    return [
      `${participant.nombre || ''} ${participant.apellido || ''}`.trim(),
      formatCedula(participant.cedula),
      participant.categoria_competencia || '',
      participant.estado || '',
      participant.email || '',
      participant.celular || '',
      participant.genero || participant.sexo || '',
      participant.box || '',
      participant.ciudad_pais || '',
      ...answerLabels.map(label => answers[label] || ''),
    ]
  })
  const workbookXml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Inscripciones">
    <Table>
      <Row>
        ${headers.map(header => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`).join('')}
      </Row>
      ${rows.map(row => `
      <Row>
        ${row.map(cell => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join('')}
      </Row>`).join('')}
    </Table>
  </Worksheet>
</Workbook>`
  const blob = new Blob([workbookXml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${String(competitionName || 'inscripciones').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'inscripciones'}.xls`
  anchor.click()
  URL.revokeObjectURL(url)
}

const SHARED_MODE_CHIP_BASE_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1,
}

function getPhaseModeSummary(phase) {
  const activityCount = Array.isArray(phase?.activities) && phase.activities.length ? phase.activities.length : 1
  const formatLabel = activityCount === 1 ? '1 actividad' : `${activityCount} actividades`
  const normalizedMeasurement = normalizeMeasurementMethod(phase?.measurement_method, phase?.tipo)
  const measurement = normalizedMeasurement === 'rm'
    ? `RM (${String(phase?.rm_unit || 'kg').toUpperCase()})`
    : (PHASE_MEASUREMENT_LABELS[normalizedMeasurement] || normalizedMeasurement)
  const winner = normalizeWinnerRule(phase?.winner_rule, phaseTypeFromPhase(phase)) === 'lower_wins' ? 'Gana menor' : 'Gana mayor'
  const resultCount = Number(phase?.allow_multiple_results) ? 'Multiples' : 'Unico'
  const status = phase?.estado || 'pendiente'
  const summary = [formatLabel, measurement, winner, resultCount, status]
  if (!Number(phase?.is_visible == null ? 1 : phase.is_visible)) summary.push('Oculto')
  if ((phase?.modality || 'individual') === 'teams') {
    const teamMode = (phase?.team_result_mode || 'sum_two') === 'single_member'
      ? 'Equipo: uno'
      : (phase?.team_result_mode || 'sum_two') === 'total'
        ? 'Equipo: total'
        : 'Equipo: ambos'
    summary.splice(3, 0, teamMode)
  }
  return summary
}

function ImagePreviewModal({ item, onClose }) {
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const pinchStateRef = useRef({ active: false, distance: 0, zoom: 1, offset: { x: 0, y: 0 } })
  const panStateRef = useRef({ active: false, x: 0, y: 0, offset: { x: 0, y: 0 } })

  const touchDistance = (touches) => {
    if (!touches || touches.length < 2) return 0
    const [a, b] = touches
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  useEffect(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [item?.url])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const { body, documentElement } = document
    const prevBodyOverflow = body.style.overflow
    const prevBodyTouchAction = body.style.touchAction
    const prevHtmlOverflow = documentElement.style.overflow
    const prevHtmlOverscroll = documentElement.style.overscrollBehavior

    body.style.overflow = 'hidden'
    body.style.touchAction = 'none'
    documentElement.style.overflow = 'hidden'
    documentElement.style.overscrollBehavior = 'none'

    return () => {
      body.style.overflow = prevBodyOverflow
      body.style.touchAction = prevBodyTouchAction
      documentElement.style.overflow = prevHtmlOverflow
      documentElement.style.overscrollBehavior = prevHtmlOverscroll
    }
  }, [])

  if (!item?.url) return null

  const handleTouchStart = (event) => {
    if (event.touches.length === 2) {
      pinchStateRef.current = {
        active: true,
        distance: touchDistance(event.touches),
        zoom,
        offset,
      }
      panStateRef.current = { active: false, x: 0, y: 0, offset }
      return
    }
    if (event.touches.length === 1 && zoom > 1) {
      const touch = event.touches[0]
      panStateRef.current = {
        active: true,
        x: touch.clientX,
        y: touch.clientY,
        offset,
      }
    }
  }

  const handleTouchMove = (event) => {
    if (event.touches.length === 2 && pinchStateRef.current.active) {
      const nextDistance = touchDistance(event.touches)
      if (!nextDistance || !pinchStateRef.current.distance) return
      event.preventDefault()
      const ratio = nextDistance / pinchStateRef.current.distance
      const nextZoom = Math.min(4, Math.max(1, Number((pinchStateRef.current.zoom * ratio).toFixed(2))))
      setZoom(nextZoom)
      if (nextZoom <= 1) {
        setOffset({ x: 0, y: 0 })
      }
      return
    }
    if (event.touches.length === 1 && panStateRef.current.active && zoom > 1) {
      event.preventDefault()
      const touch = event.touches[0]
      const deltaX = touch.clientX - panStateRef.current.x
      const deltaY = touch.clientY - panStateRef.current.y
      setOffset({
        x: panStateRef.current.offset.x + deltaX,
        y: panStateRef.current.offset.y + deltaY,
      })
    }
  }

  const handleTouchEnd = () => {
    if (pinchStateRef.current.active) {
      pinchStateRef.current = { active: false, distance: 0, zoom, offset }
    }
    if (panStateRef.current.active) {
      panStateRef.current = { active: false, x: 0, y: 0, offset }
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(20px + env(safe-area-inset-top, 0px)) 12px calc(20px + env(safe-area-inset-bottom, 0px))' }}>
      <div style={{ width: '100%', maxWidth: 980, maxHeight: '100%', borderRadius: 22, background: '#171B21', border: '1px solid #252A33', boxShadow: '0 24px 80px rgba(0,0,0,0.35)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '16px 18px', borderBottom: '1px solid #252A33' }}>
          <div style={{ minWidth: 0, flex: '1 1 220px' }}>
            <div style={{ color: 'var(--oa-text)', fontWeight: 800, fontSize: 16 }}>{item.label || 'Imagen adjunta'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, minWidth: 52, textAlign: 'center' }}>{Math.round(zoom * 100)}%</div>
            <button type="button" className="btn-secondary btn-sm" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }}>Reset</button>
            <a href={item.url} download target="_blank" rel="noreferrer" className="btn-secondary btn-sm" style={{ textDecoration: 'none' }}>Descargar</a>
            <button type="button" className="btn-secondary btn-sm" onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div
          style={{ padding: 16, overflow: 'hidden', background: '#0D0F12', flex: 1, touchAction: 'none', display: 'grid', placeItems: 'center' }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            <img
              src={item.url}
              alt={item.label || 'Imagen adjunta'}
              style={{ maxWidth: '100%', maxHeight: '100%', height: 'auto', borderRadius: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.35)', transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: 'center center', transition: pinchStateRef.current.active || panStateRef.current.active ? 'none' : 'transform 0.12s ease-out' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function CheckinStatusChip({ participant, labeled = false }) {
  const done = Boolean(participant?.check_in_done)
  const usedAt = participant?.check_in_used_at
  const labelPrefix = labeled ? 'Check-in: ' : ''

  if (done) {
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, border: '1px solid rgba(34,197,94,0.34)', background: 'rgba(34,197,94,0.12)', color: '#86EFAC', fontSize: 12, fontWeight: 800, padding: '6px 10px', width: 'fit-content' }}>
          <CheckCircle2 size={14} />
          {labelPrefix}realizado
        </div>
        {usedAt ? <div style={{ color: '#AAB2C0', fontSize: 12 }}>{formatDate(usedAt)}</div> : null}
      </div>
    )
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, border: '1px solid rgba(170,178,192,0.24)', background: 'rgba(170,178,192,0.08)', color: '#AAB2C0', fontSize: 12, fontWeight: 700, padding: '6px 10px' }}>
      <Clock3 size={14} />
      {labelPrefix}pendiente
    </div>
  )
}

const SYSTEM_CHECKIN_PHASE_CODE = 'check_in'

function EnrollmentAnswersBlock({ raw, compact = false, onPreviewImage = null }) {
  const answers = parseEnrollmentAnswers(raw)
  if (!answers.length) return null
  return (
    <div style={{ marginTop: compact ? 6 : 8, display: 'grid', gap: 4 }}>
      {answers.map((item) => (
        <div key={`${item.question_id}-${item.question_label}`} style={{ fontSize: compact ? 11 : 12, color: 'var(--oa-text-secondary)' }}>
          <b style={{ color: 'var(--oa-text)' }}>{item.question_label || 'Respuesta'}:</b>{' '}
          {item.question_type === 'image' && item.answer ? (
            <button
              type="button"
              onClick={() => onPreviewImage?.({ url: item.answer, label: item.question_label || 'Imagen adjunta' })}
              style={{ background: 'transparent', border: 'none', padding: 0, color: '#00c2a8', cursor: 'pointer', fontSize: compact ? 11 : 12 }}
            >
              Ver imagen
            </button>
          ) : (
            item.answer || '-'
          )}
        </div>
      ))}
    </div>
  )
}

// â”€â”€ Generic small modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Modal({ title, onClose, width = 480, children, panelStyle = null, titleStyle = null, closeButtonStyle = null }) {
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const body = document.body
    const currentCount = Number(body.dataset.modalOpenCount || 0) + 1
    body.dataset.modalOpenCount = String(currentCount)
    const previousOverflow = body.style.overflow
    const previousTouchAction = body.style.touchAction
    body.style.overflow = 'hidden'
    body.style.touchAction = 'none'

    return () => {
      const nextCount = Math.max(0, Number(body.dataset.modalOpenCount || 1) - 1)
      body.dataset.modalOpenCount = String(nextCount)
      if (nextCount === 0) {
        body.style.overflow = previousOverflow
        body.style.touchAction = previousTouchAction
      }
    }
  }, [])

  const modalNode = (
    <div style={{ position: 'fixed', inset: 0, background: '#0006', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 'calc(12px + env(safe-area-inset-top, 0px)) 12px calc(12px + env(safe-area-inset-bottom, 0px))' }}>
      <div style={{ background: '#171B21', border: '1px solid #252A33', borderRadius: isMobile ? 16 : 18, width: '100%', maxWidth: width, maxHeight: 'calc(100dvh - 24px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', color: 'var(--oa-text)', boxShadow: '0 24px 80px rgba(0,0,0,0.35)', ...panelStyle, padding: 0 }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: isMobile ? '14px 14px 12px' : '18px 20px 14px', marginBottom: 0, background: 'rgba(23,27,33,0.98)', borderBottom: '1px solid #252A33' }}>
          <h3 style={{ margin: 0, fontSize: 15, paddingRight: 8, color: 'var(--oa-text)', minWidth: 0, ...titleStyle }}>{title}</h3>
          <button
            type="button"
            aria-label="Cerrar modal"
            style={{
              background: '#0D0F12',
              border: '1px solid #313845',
              borderRadius: 10,
              color: '#F5F7FA',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 38,
              height: 38,
              minWidth: 38,
              minHeight: 38,
              padding: 0,
              lineHeight: 0,
              flexShrink: 0,
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.02)',
              ...closeButtonStyle,
            }}
            onClick={onClose}
          >
            <X size={18} strokeWidth={2.4} color="#F5F7FA" />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 14 : 20 }}>
          {children}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return modalNode
  return createPortal(modalNode, document.body)
}

function TicketingLaunchModalLegacy({ competition, onClose, onSaved, inline = false }) {
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState(false)
  const [msg, setMsg] = useState(null)
  const [form, setForm] = useState({
    status: 'draft',
    enabled: 0,
    max_capacity: '',
    product_title: '',
    product_description: '',
    benefits_text: '',
    access_text: '',
    price_unit: '',
    limit_per_identity: 1,
    max_tickets_per_person: '',
    max_tickets_per_transaction: '',
    ticket_products: [],
    bulk_pricing_tiers: [],
  })

  const competitionDays = useMemo(() => {
    const startRaw = competition?.competition_start
    const endRaw = competition?.competition_end
    if (!startRaw || !endRaw) return []
    const start = new Date(`${String(startRaw).slice(0, 10)}T00:00:00`)
    const end = new Date(`${String(endRaw).slice(0, 10)}T00:00:00`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []
    const out = []
    const cursor = new Date(start)
    let dayIndex = 1
    while (cursor <= end && out.length < 31) {
      const iso = cursor.toISOString().slice(0, 10)
      out.push({
        id: `day_${dayIndex}`,
        value: iso,
        label: `Dia ${dayIndex} - ${cursor.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}`,
      })
      cursor.setDate(cursor.getDate() + 1)
      dayIndex += 1
    }
    return out
  }, [competition?.competition_start, competition?.competition_end])

  const baseUnitPrice = Math.max(0, Number(form.price_unit || 0))
  const sortedVolumeRules = [...(form.bulk_pricing_tiers || [])]
    .map((item) => ({
      min_quantity: Math.max(0, Number(item?.min_quantity || 0)),
      unit_price: Math.max(0, Number(item?.unit_price || 0)),
    }))
    .filter((item) => item.min_quantity > 0 && item.unit_price > 0)
    .sort((a, b) => a.min_quantity - b.min_quantity)

  const unitPriceForQuantity = (quantity) => {
    let selected = baseUnitPrice
    sortedVolumeRules.forEach((rule) => {
      if (Number(quantity) >= Number(rule.min_quantity)) selected = Number(rule.unit_price)
    })
    return Math.max(0, selected)
  }

  const volumeExampleQuantities = [1, 2, 4, 8]
  const [wizardStep, setWizardStep] = useState(0)
  const wizardSteps = [
    { id: 'info', title: 'Informacion base', hint: 'Contexto y aforo' },
    { id: 'products', title: 'Productos y precios', hint: 'Entradas y volumen' },
    { id: 'limits', title: 'Reglas y limites', hint: 'Documento y compra' },
    { id: 'review', title: 'Revision y activacion', hint: 'Guardar y lanzar' },
  ]

  const loadConfig = async () => {
    setLoading(true)
    setMsg(null)
    try {
      const { data } = await api.get(`/competitions/${competition.id}/ticketing-config`)
      setForm({
        status: data?.status || 'draft',
        enabled: Number(data?.enabled || 0),
        max_capacity: Number(data?.max_capacity || 0) > 0 ? String(data.max_capacity) : '',
        product_title: data?.product_title || '',
        product_description: data?.product_description || '',
        benefits_text: data?.benefits_text || '',
        access_text: data?.access_text || '',
        price_unit: Number(data?.price_unit || 0) > 0 ? String(data.price_unit) : '',
        limit_per_identity: Number(data?.limit_per_identity == null ? 1 : data.limit_per_identity),
        max_tickets_per_person: data?.max_tickets_per_person == null ? '' : String(data.max_tickets_per_person),
        max_tickets_per_transaction: data?.max_tickets_per_transaction == null ? '' : String(data.max_tickets_per_transaction),
        ticket_products: parseTicketingProducts(data?.ticket_products).map((item, idx) => ({
          id: item.id || `product_${idx + 1}`,
          label: item.label || '',
          price_unit: item.price_unit > 0 ? String(item.price_unit) : '',
          access_days: Array.isArray(item.access_days) ? item.access_days : [],
          is_all_days: Number(item?.is_all_days || 0) ? 1 : 0,
        })),
        bulk_pricing_tiers: parseTicketingTiers(data?.bulk_pricing_tiers).map(item => ({
          min_quantity: item.min_quantity > 0 ? String(item.min_quantity) : '',
          unit_price: item.unit_price > 0 ? String(item.unit_price) : '',
        })),
      })
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo cargar la configuracion de boleteria.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setWizardStep(0)
    loadConfig()
  }, [competition.id])
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const addTier = () => {
    setForm(prev => ({ ...prev, bulk_pricing_tiers: [...prev.bulk_pricing_tiers, { min_quantity: '', unit_price: '' }] }))
  }

  const updateTier = (idx, key, value) => {
    setForm(prev => ({
      ...prev,
      bulk_pricing_tiers: prev.bulk_pricing_tiers.map((tier, i) => (i === idx ? { ...tier, [key]: value } : tier)),
    }))
  }

  const removeTier = (idx) => {
    setForm(prev => ({
      ...prev,
      bulk_pricing_tiers: prev.bulk_pricing_tiers.filter((_, i) => i !== idx),
    }))
  }

  const addProduct = () => {
    setForm(prev => ({
      ...prev,
      ticket_products: [
        ...prev.ticket_products,
        {
          id: `product_${prev.ticket_products.length + 1}`,
          label: '',
          price_unit: '',
          access_days: [],
          is_all_days: 0,
        },
      ],
    }))
  }

  const updateProduct = (idx, key, value) => {
    setForm(prev => ({
      ...prev,
      ticket_products: prev.ticket_products.map((product, i) => (i === idx ? { ...product, [key]: value } : product)),
    }))
  }

  const removeProduct = (idx) => {
    setForm(prev => ({
      ...prev,
      ticket_products: prev.ticket_products.filter((_, i) => i !== idx),
    }))
  }

  const toggleProductAllDays = (idx) => {
    setForm(prev => ({
      ...prev,
      ticket_products: prev.ticket_products.map((product, i) => {
        if (i !== idx) return product
        const nextAllDays = product.is_all_days ? 0 : 1
        return {
          ...product,
          is_all_days: nextAllDays,
          access_days: nextAllDays ? [] : product.access_days,
        }
      }),
    }))
  }

  const toggleProductDay = (idx, label) => {
    setForm(prev => ({
      ...prev,
      ticket_products: prev.ticket_products.map((product, i) => {
        if (i !== idx) return product
        const exists = Array.isArray(product.access_days) && product.access_days.includes(label)
        return {
          ...product,
          access_days: exists
            ? product.access_days.filter(day => day !== label)
            : [...(product.access_days || []), label],
        }
      }),
    }))
  }

  const autogenerateProductsByDays = () => {
    if (!competitionDays.length) {
      setMsg({ type: 'error', text: 'Define inicio y fin de competencia para autogenerar boletas por dia.' })
      return
    }
    setForm(prev => {
      const previousById = new Map((prev.ticket_products || []).map(item => [String(item.id || ''), item]))
      const dayProducts = competitionDays.map((day, idx) => {
        const existing = previousById.get(day.id)
        return {
          id: day.id,
          label: existing?.label || `Boleta Dia ${idx + 1}`,
          price_unit: existing?.price_unit || '',
          access_days: [day.label],
          is_all_days: 0,
        }
      })
      const existingAll = previousById.get('all_days')
      const allDaysProduct = {
        id: 'all_days',
        label: existingAll?.label || 'Pase completo',
        price_unit: existingAll?.price_unit || '',
        access_days: competitionDays.map(day => day.label),
        is_all_days: 1,
      }
      return {
        ...prev,
        ticket_products: [...dayProducts, allDaysProduct],
      }
    })
    setMsg({ type: 'success', text: 'Productos por dias generados. Ahora define el precio de cada uno.' })
  }

  const buildNormalizedProducts = () => (
    (form.ticket_products || [])
      .map((product, idx) => ({
        id: String(product?.id || `product_${idx + 1}`).trim(),
        label: String(product?.label || '').trim(),
        price_unit: Number(product?.price_unit || 0),
        access_days: Number(product?.is_all_days || 0)
          ? []
          : (Array.isArray(product?.access_days) ? product.access_days.filter(Boolean) : []),
        is_all_days: Number(product?.is_all_days || 0) ? 1 : 0,
      }))
      .filter(product => product.label && product.price_unit > 0)
  )

  const validateWizardStep = (step) => {
    if (step === 0) {
      if (Number(form.max_capacity || 0) <= 0) return 'Define un aforo maximo mayor a 0.'
      if (!String(form.product_description || '').trim()) return 'Agrega una descripcion general de la boleteria.'
      return ''
    }
    if (step === 1) {
      const normalizedProducts = buildNormalizedProducts()
      if (Number(form.price_unit || 0) <= 0 && !normalizedProducts.length) {
        return 'Define precio base o al menos un producto con precio.'
      }
      return ''
    }
    if (step === 2) {
      if (form.limit_per_identity && Number(form.max_tickets_per_person || 0) <= 0) {
        return 'Si activas limite por documento, define maximo por persona.'
      }
      if (String(form.max_tickets_per_transaction || '').trim() !== '' && Number(form.max_tickets_per_transaction || 0) <= 0) {
        return 'El maximo por transaccion debe ser mayor a 0.'
      }
      return ''
    }
    return ''
  }

  const goNextStep = () => {
    const validationError = validateWizardStep(wizardStep)
    if (validationError) {
      setMsg({ type: 'error', text: validationError })
      return
    }
    setMsg(null)
    setWizardStep(prev => Math.min(prev + 1, wizardSteps.length - 1))
  }

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const normalizedProducts = buildNormalizedProducts()

      const payload = {
        max_capacity: Number(form.max_capacity || 0),
        product_title: form.product_title || null,
        product_description: form.product_description || null,
        benefits_text: form.benefits_text || null,
        access_text: form.access_text || null,
        price_unit: Number(form.price_unit || 0),
        ticket_products: normalizedProducts,
        limit_per_identity: form.limit_per_identity ? 1 : 0,
        max_tickets_per_person: form.max_tickets_per_person === '' ? null : Number(form.max_tickets_per_person),
        max_tickets_per_transaction: form.max_tickets_per_transaction === '' ? null : Number(form.max_tickets_per_transaction),
        bulk_pricing_tiers: parseTicketingTiers(form.bulk_pricing_tiers),
      }
      const { data } = await api.put(`/competitions/${competition.id}/ticketing-config`, payload)
      setMsg({ type: 'success', text: 'Configuracion de boleteria guardada.' })
      setForm(prev => ({ ...prev, status: data?.status || prev.status, enabled: Number(data?.enabled || 0) }))
      onSaved?.()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo guardar la boleteria.' })
    } finally {
      setSaving(false)
    }
  }

  const activate = async () => {
    setActivating(true)
    setMsg(null)
    try {
      await api.post(`/competitions/${competition.id}/ticketing-activate`)
      setMsg({ type: 'success', text: 'Boleteria activada. Este estado no se puede revertir.' })
      await loadConfig()
      onSaved?.()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo activar la boleteria.' })
    } finally {
      setActivating(false)
    }
  }

  const content = loading ? <div style={{ color: '#AAB2C0' }}>Cargando configuracion...</div> : (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ borderRadius: 12, border: '1px solid #252A33', background: form.enabled ? 'rgba(0,194,168,0.08)' : 'rgba(255,107,0,0.08)', padding: 12, color: '#F5F7FA', fontSize: 13 }}>
        Estado: <b>{form.enabled ? 'Activa (irreversible)' : 'Borrador'}</b>
      </div>

      <div style={{ border: '1px solid #252A33', borderRadius: 18, padding: isMobile ? 14 : 18, background: 'linear-gradient(135deg, rgba(214,217,224,0.16), rgba(23,27,33,0.98) 42%, rgba(9,11,14,0.98) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#F5F7FA' }}>Configuracion guiada</h4>
          </div>
          <div style={{ color: '#FFB36F', fontSize: 12, fontWeight: 800 }}>{`Paso ${wizardStep + 1} de ${wizardSteps.length}`}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${wizardSteps.length}, minmax(0, 1fr))`, gap: 8, marginTop: 14 }}>
          {wizardSteps.map((step, idx) => (
            <button
              key={step.id}
              type="button"
              onClick={() => setWizardStep(idx)}
              style={{
                borderRadius: 14,
                border: idx === wizardStep ? '1px solid rgba(214,217,224,0.45)' : '1px solid #252A33',
                background: idx === wizardStep ? 'rgba(214,217,224,0.16)' : 'rgba(13,15,18,0.72)',
                padding: '12px 14px',
                textAlign: 'left',
                color: '#F5F7FA',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: idx === wizardStep ? '#FFB36F' : '#AAB2C0' }}>{`0${idx + 1}`.slice(-2)}</div>
              <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4 }}>{step.title}</div>
              <div style={{ fontSize: 12, color: '#AAB2C0', marginTop: 4, lineHeight: 1.45 }}>{step.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {wizardStep === 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <label>Titulo general de la boleteria</label>
            <input value={form.product_title} onChange={(e) => setForm(prev => ({ ...prev, product_title: e.target.value }))} placeholder="Entradas FinalRep 2026" />
            <div style={{ color: '#AAB2C0', fontSize: 11 }}>
              Este titulo es la cabecera comercial general. Los nombres de cada entrada se definen en el paso de productos.
            </div>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <label>Descripcion general de la boleteria</label>
            <textarea rows={4} value={form.product_description} onChange={(e) => setForm(prev => ({ ...prev, product_description: e.target.value }))} placeholder="Explica brevemente que incluye la boleteria del evento..." />
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <label>Beneficios para espectador</label>
            <textarea rows={3} value={form.benefits_text} onChange={(e) => setForm(prev => ({ ...prev, benefits_text: e.target.value }))} placeholder="Describe beneficios clave." />
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <label>Acceso (dias/horarios)</label>
            <textarea rows={2} value={form.access_text} onChange={(e) => setForm(prev => ({ ...prev, access_text: e.target.value }))} placeholder="Ej: Ingreso desde 7:00 a.m." />
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <label>Aforo maximo</label>
            <input type="number" min="0" value={form.max_capacity} onChange={(e) => setForm(prev => ({ ...prev, max_capacity: e.target.value }))} placeholder="Ej: 500" />
          </div>
        </div>
      )}

      {wizardStep === 1 && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <label>Precio unitario base (COP)</label>
            <input type="number" min="0" value={form.price_unit} onChange={(e) => setForm(prev => ({ ...prev, price_unit: e.target.value }))} placeholder="Opcional si usas productos por dia" />
            <div style={{ color: '#AAB2C0', fontSize: 11 }}>Se usa cuando no eliges productos por dia.</div>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, color: '#F5F7FA' }}>Productos de boleteria</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn-secondary btn-sm" onClick={addProduct}>+ Agregar producto</button>
                <button type="button" className="btn-secondary btn-sm" onClick={autogenerateProductsByDays}>Autogenerar por dias</button>
              </div>
            </div>
            <div style={{ borderRadius: 12, border: '1px solid rgba(0,194,168,0.30)', background: 'rgba(0,194,168,0.08)', padding: 10, color: '#D7DEE8', fontSize: 12, lineHeight: 1.55 }}>
              Puedes vender boleta por dia, pase completo o productos adicionales (charlas, bonos, etc).
            </div>
            {!form.ticket_products.length ? <div style={{ color: '#AAB2C0', fontSize: 12 }}>Aun no hay productos creados.</div> : null}
            {form.ticket_products.map((product, idx) => (
              <div key={`product-${idx}`} style={{ display: 'grid', gap: 8, border: '1px solid #252A33', borderRadius: 10, background: 'rgba(13,15,18,0.55)', padding: 10 }}>
                <div style={{ color: '#AAB2C0', fontSize: 12 }}>Producto {idx + 1}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr auto', gap: 8 }}>
                  <input value={product.label} onChange={(e) => updateProduct(idx, 'label', e.target.value)} placeholder="Nombre del producto" />
                  <input type="number" min="1" value={product.price_unit} onChange={(e) => updateProduct(idx, 'price_unit', e.target.value)} placeholder="Precio unitario" />
                  <button type="button" className="btn-secondary btn-sm" onClick={() => removeProduct(idx)}>Quitar</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => toggleProductAllDays(idx)}>
                    {product.is_all_days ? 'Pase completo' : 'Solo dias seleccionados'}
                  </button>
                </div>
                {!product.is_all_days ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {competitionDays.length ? competitionDays.map(day => {
                      const selected = Array.isArray(product.access_days) && product.access_days.includes(day.label)
                      return (
                        <button
                          key={`${product.id}-${day.id}`}
                          type="button"
                          onClick={() => toggleProductDay(idx, day.label)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            border: selected ? '1px solid rgba(0,194,168,0.45)' : '1px solid #252A33',
                            background: selected ? 'rgba(0,194,168,0.14)' : 'rgba(9,11,14,0.62)',
                            color: selected ? '#8DF1DF' : '#AAB2C0',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          {day.label}
                        </button>
                      )
                    }) : <div style={{ color: '#AAB2C0', fontSize: 12 }}>Define fechas de competencia para seleccionar dias.</div>}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 8, borderTop: '1px solid #252A33', paddingTop: 10 }}>
            <div style={{ fontWeight: 700, color: '#F5F7FA' }}>Precio por volumen</div>
            <div style={{ color: '#AAB2C0', fontSize: 12 }}>Opcional: aplica descuentos por cantidad.</div>
            {form.bulk_pricing_tiers.map((tier, idx) => (
              <div key={`tier-${idx}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
                <input type="number" min="2" value={tier.min_quantity} onChange={(e) => updateTier(idx, 'min_quantity', e.target.value)} placeholder="Cantidad minima" />
                <input type="number" min="1" value={tier.unit_price} onChange={(e) => updateTier(idx, 'unit_price', e.target.value)} placeholder="Precio unitario" />
                <button type="button" className="btn-secondary btn-sm" onClick={() => removeTier(idx)}>Quitar</button>
              </div>
            ))}
            <button type="button" className="btn-secondary btn-sm" onClick={addTier}>+ Agregar regla por volumen</button>
            {!!sortedVolumeRules.length ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {volumeExampleQuantities.map((qty) => (
                  <span key={`qty-preview-${qty}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 999, border: '1px solid #252A33', background: 'rgba(9,11,14,0.62)', color: '#D7DEE8', fontSize: 11 }}>
                    x{qty}: <b style={{ color: '#F5F7FA' }}>{formatCop(unitPriceForQuantity(qty))}</b>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {wizardStep === 2 && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: '10px 12px', display: 'grid', gap: 10 }}>
            <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 700 }}>Limite por documento de identidad</div>
            <div style={{ color: '#AAB2C0', fontSize: 12 }}>Controla cuantas boletas puede comprar un mismo documento.</div>
            <div style={{ display: 'inline-flex', border: '1px solid #252A33', borderRadius: 999, overflow: 'hidden', width: 'fit-content' }}>
              <button type="button" onClick={() => setForm(prev => ({ ...prev, limit_per_identity: 1 }))} style={{ border: 'none', padding: '7px 12px', fontSize: 12, fontWeight: 700, color: form.limit_per_identity ? '#F5F7FA' : '#AAB2C0', background: form.limit_per_identity ? 'linear-gradient(135deg, #00C2A8 0%, #23D7BF 100%)' : '#171B21', cursor: 'pointer' }}>Activado</button>
              <button type="button" onClick={() => setForm(prev => ({ ...prev, limit_per_identity: 0 }))} style={{ border: 'none', padding: '7px 12px', fontSize: 12, fontWeight: 700, color: !form.limit_per_identity ? '#F5F7FA' : '#AAB2C0', background: !form.limit_per_identity ? 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)' : '#171B21', cursor: 'pointer' }}>Desactivado</button>
            </div>
          </div>
          {form.limit_per_identity ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <label>Maximo por documento</label>
              <input type="number" min="1" value={form.max_tickets_per_person} onChange={(e) => setForm(prev => ({ ...prev, max_tickets_per_person: e.target.value }))} placeholder="Ej: 4 boletas por documento" />
            </div>
          ) : null}
          <div style={{ display: 'grid', gap: 8 }}>
            <label>Maximo por transaccion</label>
            <input type="number" min="1" value={form.max_tickets_per_transaction} onChange={(e) => setForm(prev => ({ ...prev, max_tickets_per_transaction: e.target.value }))} placeholder="Sin limite" />
          </div>
        </div>
      )}

      {wizardStep === 3 && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 12, color: '#D7DEE8', fontSize: 13, lineHeight: 1.6 }}>
            <div><b style={{ color: '#F5F7FA' }}>Aforo:</b> {form.max_capacity || '-'}</div>
            <div><b style={{ color: '#F5F7FA' }}>Productos creados:</b> {buildNormalizedProducts().length}</div>
            <div><b style={{ color: '#F5F7FA' }}>Precio base:</b> {Number(form.price_unit || 0) > 0 ? formatCop(form.price_unit) : 'No definido'}</div>
            <div><b style={{ color: '#F5F7FA' }}>Limite por documento:</b> {form.limit_per_identity ? `Si (${form.max_tickets_per_person || '-'})` : 'No'}</div>
          </div>
          <div style={{ color: '#AAB2C0', fontSize: 12 }}>
            Guarda primero la configuracion. Cuando todo este correcto, activa la boleteria (irreversible).
          </div>
        </div>
      )}

      {msg ? (
        <div style={{ borderRadius: 12, border: `1px solid ${msg.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`, background: msg.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: '#F5F7FA', fontSize: 13, padding: 10 }}>
          {msg.text}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setWizardStep(prev => Math.max(0, prev - 1))} disabled={wizardStep === 0 || saving || activating}>Anterior</button>
          <button type="button" className="btn-secondary btn-sm" onClick={goNextStep} disabled={wizardStep >= wizardSteps.length - 1 || saving || activating}>Siguiente</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary btn-sm" onClick={save} disabled={saving || activating}>{saving ? 'Guardando...' : 'Guardar borrador'}</button>
          <button type="button" className="btn-primary btn-sm" onClick={activate} disabled={form.enabled || saving || activating || wizardStep !== wizardSteps.length - 1}>
            {activating ? 'Activando...' : (form.enabled ? 'Boleteria activa' : 'Activar boleteria')}
          </button>
        </div>
      </div>
    </div>
  )

  if (inline) return content
  return (
    <Modal title="Boleteria para espectadores" onClose={onClose} width={760}>
      {content}
    </Modal>
  )
}

function TicketingLaunchModal({ competition, onClose, onSaved, inline = false }) {
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [wizardStep, setWizardStep] = useState(0)
  const [status, setStatus] = useState('draft')
  const [enabled, setEnabled] = useState(0)
  const [aforoEnabled, setAforoEnabled] = useState(1)
  const [aforoMax, setAforoMax] = useState('')
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [draft, setDraft] = useState({ label: '', by_day: 0, access_days: [], price_unit: '' })

  const NO_CAPACITY_LIMIT = 999999
  const wizardSteps = [
    { id: 'create', title: 'Crear boleteria', hint: 'Que es, dias y precio' },
    { id: 'capacity', title: 'Aforo', hint: 'Aplica o no aplica' },
    { id: 'review', title: 'Revision', hint: 'Guardar' },
  ]

  const competitionDays = useMemo(() => {
    const startRaw = competition?.competition_start
    const endRaw = competition?.competition_end
    if (!startRaw || !endRaw) return []
    const start = new Date(`${String(startRaw).slice(0, 10)}T00:00:00`)
    const end = new Date(`${String(endRaw).slice(0, 10)}T00:00:00`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []
    const out = []
    const cursor = new Date(start)
    let dayIndex = 1
    while (cursor <= end && out.length < 31) {
      out.push({
        id: `day_${dayIndex}`,
        label: `Dia ${dayIndex} - ${cursor.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}`,
      })
      cursor.setDate(cursor.getDate() + 1)
      dayIndex += 1
    }
    return out
  }, [competition?.competition_start, competition?.competition_end])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const loadConfig = async () => {
    setLoading(true)
    setMsg(null)
    try {
      const { data } = await api.get(`/competitions/${competition.id}/ticketing-config`)
      setStatus(data?.status || 'draft')
      setEnabled(Number(data?.enabled || 0))
      const maxCapacity = Number(data?.max_capacity || 0)
      const hasAforo = maxCapacity > 0 && maxCapacity < NO_CAPACITY_LIMIT
      setAforoEnabled(hasAforo ? 1 : 0)
      setAforoMax(hasAforo ? String(maxCapacity) : '')
      const parsedProducts = parseTicketingProducts(data?.ticket_products).map((item, idx) => ({
        id: item.id || `product_${idx + 1}`,
        label: item.label || '',
        by_day: item.is_all_days ? 0 : (Array.isArray(item.access_days) && item.access_days.length ? 1 : 0),
        access_days: item.is_all_days ? [] : (Array.isArray(item.access_days) ? item.access_days : []),
        price_unit: item.price_unit > 0 ? String(item.price_unit) : '',
      }))
      setProducts(parsedProducts)
      setDraft({ label: '', by_day: 0, access_days: [], price_unit: '' })
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo cargar la configuracion de boleteria.' })
    } finally {
      setLoading(false)
    }
  }

  const loadOrders = async () => {
    try {
      const { data } = await api.get(`/competitions/${competition.id}/ticketing-orders`)
      setOrders(Array.isArray(data) ? data : [])
    } catch {
      setOrders([])
    }
  }

  useEffect(() => {
    setWizardStep(0)
    Promise.all([loadConfig(), loadOrders()])
  }, [competition.id])

  const toggleDraftDay = (dayLabel) => {
    setDraft(prev => {
      const exists = prev.access_days.includes(dayLabel)
      return {
        ...prev,
        access_days: exists ? prev.access_days.filter(day => day !== dayLabel) : [...prev.access_days, dayLabel],
      }
    })
  }

  const buildDraftProduct = () => {
    const label = String(draft.label || '').trim()
    const hasAnyInput = Boolean(label || String(draft.price_unit || '').trim() || draft.by_day || (draft.access_days || []).length)
    if (!hasAnyInput) return { product: null, hasAnyInput: false, error: '' }
    const priceUnit = Number(draft.price_unit || 0)
    if (!label) return { product: null, hasAnyInput: true, error: 'Indica que es la boleteria.' }
    if (priceUnit <= 0) return { product: null, hasAnyInput: true, error: 'El precio debe ser mayor a 0.' }
    if (draft.by_day && !draft.access_days.length) return { product: null, hasAnyInput: true, error: 'Selecciona al menos un dia si aplica por dia.' }
    return {
      hasAnyInput: true,
      error: '',
      product: {
        id: `product_${Date.now()}`,
        label,
        by_day: draft.by_day ? 1 : 0,
        access_days: draft.by_day ? [...draft.access_days] : [],
        price_unit: String(priceUnit),
      },
    }
  }

  const removeProduct = (id) => {
    setProducts(prev => prev.filter(product => String(product.id) !== String(id)))
  }

  const buildNormalizedProducts = () => (
    products
      .map((product, idx) => ({
        id: String(product?.id || `product_${idx + 1}`).trim(),
        label: String(product?.label || '').trim(),
        price_unit: Number(product?.price_unit || 0),
        access_days: product?.by_day ? (Array.isArray(product?.access_days) ? product.access_days.filter(Boolean) : []) : [],
        is_all_days: product?.by_day ? 0 : 1,
      }))
      .filter(product => product.label && product.price_unit > 0)
  )

  const orderStatsByProduct = useMemo(() => {
    const approvedStatuses = new Set(['approved'])
    const pendingStatuses = new Set(['created', 'processing', 'pending', 'unknown'])
    const stats = {}
    for (const product of products) {
      const key = String(product.id || '')
      stats[key] = { sold: 0, pending: 0 }
    }
    for (const order of orders) {
      const productKey = String(order?.product_id || '')
      if (!stats[productKey]) continue
      const qty = Number(order?.quantity || 0)
      const orderStatus = String(order?.payment_status || '').toLowerCase()
      if (approvedStatuses.has(orderStatus)) stats[productKey].sold += qty
      else if (pendingStatuses.has(orderStatus)) stats[productKey].pending += qty
    }
    return stats
  }, [orders, products])

  const soldTotal = useMemo(
    () => Object.values(orderStatsByProduct).reduce((acc, item) => acc + Number(item?.sold || 0), 0),
    [orderStatsByProduct],
  )
  const remainingCapacity = aforoEnabled ? Math.max(0, Number(aforoMax || 0) - soldTotal) : null

  const validateStep = (step) => {
    if (step === 0) {
      const draftCheck = buildDraftProduct()
      if (draftCheck.error) return draftCheck.error
      if (!buildNormalizedProducts().length && !draftCheck.product) return 'Crea al menos una boleteria para continuar.'
    }
    if (step === 1 && aforoEnabled && Number(aforoMax || 0) <= 0) return 'Si aplica aforo, define un maximo mayor a 0.'
    return ''
  }

  const goNext = () => {
    const errorText = validateStep(wizardStep)
    if (errorText) {
      setMsg({ type: 'error', text: errorText })
      return
    }
    setMsg(null)
    setWizardStep(prev => Math.min(prev + 1, wizardSteps.length - 1))
  }

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const draftCheck = buildDraftProduct()
      if (draftCheck.error) {
        setMsg({ type: 'error', text: draftCheck.error })
        setSaving(false)
        return
      }
      const combinedProducts = draftCheck.product ? [...products, draftCheck.product] : [...products]
      const normalizedProducts = combinedProducts
        .map((product, idx) => ({
          id: String(product?.id || `product_${idx + 1}`).trim(),
          label: String(product?.label || '').trim(),
          price_unit: Number(product?.price_unit || 0),
          access_days: product?.by_day ? (Array.isArray(product?.access_days) ? product.access_days.filter(Boolean) : []) : [],
          is_all_days: product?.by_day ? 0 : 1,
        }))
        .filter(product => product.label && product.price_unit > 0)
      if (!normalizedProducts.length) {
        setMsg({ type: 'error', text: 'Debes crear al menos una boleteria.' })
        setSaving(false)
        return
      }
      const maxCapacity = aforoEnabled ? Number(aforoMax || 0) : NO_CAPACITY_LIMIT
      const payload = {
        max_capacity: maxCapacity,
        product_title: `Boleteria ${competition?.nombre || ''}`.trim(),
        product_description: `Productos activos: ${normalizedProducts.map(item => item.label).join(', ')}`,
        benefits_text: null,
        access_text: null,
        price_unit: 0,
        ticket_products: normalizedProducts,
        limit_per_identity: 0,
        max_tickets_per_person: null,
        max_tickets_per_transaction: null,
        bulk_pricing_tiers: [],
      }
      const { data } = await api.put(`/competitions/${competition.id}/ticketing-config`, payload)
      setStatus(data?.status || status)
      setEnabled(Number(data?.enabled || 0))
      if (draftCheck.product) setDraft({ label: '', by_day: 0, access_days: [], price_unit: '' })
      await loadConfig()
      await loadOrders()
      setMsg({ type: 'success', text: 'Boleteria guardada correctamente.' })
      onSaved?.()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo guardar la boleteria.' })
    } finally {
      setSaving(false)
    }
  }

  const content = loading ? <div style={{ color: '#AAB2C0' }}>Cargando configuracion...</div> : (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ border: '1px solid #252A33', borderRadius: 18, padding: isMobile ? 14 : 18, background: 'linear-gradient(135deg, rgba(214,217,224,0.16), rgba(23,27,33,0.98) 42%, rgba(9,11,14,0.98) 100%)' }}>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#F5F7FA' }}>Agregar boleteria</h4>
        <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 6 }}>
          Completa todas las preguntas en este modal y al final presiona Guardar.
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ border: '1px solid #252A33', borderRadius: 14, background: 'rgba(13,15,18,0.72)', padding: 12, display: 'grid', gap: 10 }}>
            <div style={{ color: '#F5F7FA', fontWeight: 700, fontSize: 14 }}>Producto en preparacion</div>
            <div style={{ color: '#AAB2C0', fontSize: 12 }}>Se creara al guardar este formulario.</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <label>Que es</label>
              <input value={draft.label} onChange={(e) => setDraft(prev => ({ ...prev, label: e.target.value }))} placeholder="Ej: Dia 1, Pase completo, Charla tecnica" />
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <label>Aplica por dia</label>
              <div style={{ display: 'inline-flex', border: '1px solid #252A33', borderRadius: 999, overflow: 'hidden', width: 'fit-content' }}>
                <button type="button" onClick={() => setDraft(prev => ({ ...prev, by_day: 1 }))} style={{ border: 'none', padding: '7px 12px', fontSize: 12, fontWeight: 700, color: draft.by_day ? '#F5F7FA' : '#AAB2C0', background: draft.by_day ? 'linear-gradient(135deg, #00C2A8 0%, #23D7BF 100%)' : '#171B21', cursor: 'pointer' }}>Si</button>
                <button type="button" onClick={() => setDraft(prev => ({ ...prev, by_day: 0, access_days: [] }))} style={{ border: 'none', padding: '7px 12px', fontSize: 12, fontWeight: 700, color: !draft.by_day ? '#F5F7FA' : '#AAB2C0', background: !draft.by_day ? 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)' : '#171B21', cursor: 'pointer' }}>No</button>
              </div>
            </div>
            {draft.by_day ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <label>Selecciona uno o varios dias</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {competitionDays.length ? competitionDays.map(day => {
                    const selected = draft.access_days.includes(day.label)
                    return (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => toggleDraftDay(day.label)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 999,
                          border: selected ? '1px solid rgba(0,194,168,0.45)' : '1px solid #252A33',
                          background: selected ? 'rgba(0,194,168,0.14)' : 'rgba(9,11,14,0.62)',
                          color: selected ? '#8DF1DF' : '#AAB2C0',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        {day.label}
                      </button>
                    )
                  }) : <div style={{ color: '#AAB2C0', fontSize: 12 }}>No hay dias detectados en el evento.</div>}
                </div>
              </div>
            ) : null}
            <div style={{ display: 'grid', gap: 8 }}>
              <label>Precio (COP)</label>
              <input type="number" min="1" value={draft.price_unit} onChange={(e) => setDraft(prev => ({ ...prev, price_unit: e.target.value }))} placeholder="Ej: 45000" />
            </div>
          </div>

        </div>

      <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ border: '1px solid #252A33', borderRadius: 14, background: 'rgba(13,15,18,0.72)', padding: 12, display: 'grid', gap: 10 }}>
            <div style={{ color: '#F5F7FA', fontWeight: 700, fontSize: 14 }}>Aplica aforo</div>
            <div style={{ display: 'inline-flex', border: '1px solid #252A33', borderRadius: 999, overflow: 'hidden', width: 'fit-content' }}>
              <button type="button" onClick={() => setAforoEnabled(1)} style={{ border: 'none', padding: '7px 12px', fontSize: 12, fontWeight: 700, color: aforoEnabled ? '#F5F7FA' : '#AAB2C0', background: aforoEnabled ? 'linear-gradient(135deg, #00C2A8 0%, #23D7BF 100%)' : '#171B21', cursor: 'pointer' }}>Si</button>
              <button type="button" onClick={() => setAforoEnabled(0)} style={{ border: 'none', padding: '7px 12px', fontSize: 12, fontWeight: 700, color: !aforoEnabled ? '#F5F7FA' : '#AAB2C0', background: !aforoEnabled ? 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)' : '#171B21', cursor: 'pointer' }}>No</button>
            </div>
            {aforoEnabled ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <label>Cantidad maxima</label>
                <input type="number" min="1" value={aforoMax} onChange={(e) => setAforoMax(e.target.value)} placeholder="Ej: 500" />
              </div>
            ) : (
              <div style={{ color: '#AAB2C0', fontSize: 12 }}>Sin aforo: no se aplicara limite de capacidad.</div>
            )}
          </div>
        </div>

      <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 12, color: '#D7DEE8', fontSize: 13, lineHeight: 1.6 }}>
            <div><b style={{ color: '#F5F7FA' }}>Boleterias creadas:</b> {products.length}</div>
            <div><b style={{ color: '#F5F7FA' }}>Aforo:</b> {aforoEnabled ? `${aforoMax || '-'} cupos` : 'No aplica'}</div>
            <div><b style={{ color: '#F5F7FA' }}>Vendidas total:</b> {soldTotal}</div>
            {aforoEnabled ? <div><b style={{ color: '#F5F7FA' }}>Aforo restante:</b> {remainingCapacity}</div> : null}
            <div><b style={{ color: '#F5F7FA' }}>Resumen:</b> {buildNormalizedProducts().map(item => `${item.label} (${formatCop(item.price_unit)})`).join(' · ') || '-'}</div>
          </div>
        </div>

      {msg ? (
        <div style={{ borderRadius: 12, border: `1px solid ${msg.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`, background: msg.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: '#F5F7FA', fontSize: 13, padding: 10 }}>
          {msg.text}
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn-primary btn-sm" onClick={save} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )

  if (inline) return content
  return (
    <Modal title="Boleteria para espectadores" onClose={onClose} width={760}>
      {content}
    </Modal>
  )
}

function TicketingProductsPanel({ competition, refreshKey }) {
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [aforoEnabled, setAforoEnabled] = useState(false)
  const [aforoMax, setAforoMax] = useState(0)

  const NO_CAPACITY_LIMIT = 999999

  const loadData = async () => {
    setLoading(true)
    try {
      const [configRes, ordersRes] = await Promise.all([
        api.get(`/competitions/${competition.id}/ticketing-config`),
        api.get(`/competitions/${competition.id}/ticketing-orders`).catch(() => ({ data: [] })),
      ])
      const data = configRes.data
      const maxCapacity = Number(data?.max_capacity || 0)
      const hasAforo = maxCapacity > 0 && maxCapacity < NO_CAPACITY_LIMIT
      setAforoEnabled(hasAforo)
      setAforoMax(hasAforo ? maxCapacity : 0)
      setProducts(parseTicketingProducts(data?.ticket_products).map((item, idx) => ({
        id: item.id || `product_${idx + 1}`,
        label: item.label || '',
        by_day: item.is_all_days ? 0 : (Array.isArray(item.access_days) && item.access_days.length ? 1 : 0),
        access_days: item.is_all_days ? [] : (Array.isArray(item.access_days) ? item.access_days : []),
        price_unit: item.price_unit > 0 ? String(item.price_unit) : '',
      })))
      setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : [])
    } catch {
      setProducts([])
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [competition.id, refreshKey])

  const orderStatsByProduct = useMemo(() => {
    const approvedStatuses = new Set(['approved'])
    const pendingStatuses = new Set(['created', 'processing', 'pending', 'unknown'])
    const stats = {}
    for (const product of products) {
      const key = String(product.id || '')
      stats[key] = { sold: 0, pending: 0 }
    }
    for (const order of orders) {
      const productKey = String(order?.product_id || '')
      if (!stats[productKey]) continue
      const qty = Number(order?.quantity || 0)
      const orderStatus = String(order?.payment_status || '').toLowerCase()
      if (approvedStatuses.has(orderStatus)) stats[productKey].sold += qty
      else if (pendingStatuses.has(orderStatus)) stats[productKey].pending += qty
    }
    return stats
  }, [orders, products])

  const soldTotal = useMemo(
    () => Object.values(orderStatsByProduct).reduce((acc, item) => acc + Number(item?.sold || 0), 0),
    [orderStatsByProduct],
  )
  const remainingCapacity = aforoEnabled ? Math.max(0, aforoMax - soldTotal) : null

  if (loading) return <div style={{ color: '#AAB2C0', fontSize: 12 }}>Cargando boleterias...</div>

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ color: '#F5F7FA', fontWeight: 700, fontSize: 14 }}>Miscelanea de boleteria</div>
      {!products.length ? <div style={{ color: '#AAB2C0', fontSize: 12 }}>Aun no has creado boleterias.</div> : null}
      {products.map((product, idx) => (
        <div key={`${product.id}-${idx}`} style={{ border: '1px solid #252A33', borderRadius: 12, background: 'rgba(13,15,18,0.62)', padding: 10, display: 'grid', gap: 8 }}>
          <div style={{ color: '#F5F7FA', fontWeight: 700 }}>{product.label}</div>
          <div style={{ color: '#AAB2C0', fontSize: 12 }}>
            {product.by_day
              ? `Dias: ${(product.access_days || []).join(', ')}`
              : 'Dias: No aplica (general)'}
          </div>
          <div style={{ color: '#AAB2C0', fontSize: 12 }}>
            Precio: <b style={{ color: '#F5F7FA' }}>{formatCop(product.price_unit)}</b>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: 11, border: '1px solid #252A33', background: 'rgba(0,194,168,0.10)', color: '#8DF1DF' }}>
              Vendidas: {orderStatsByProduct[String(product.id)]?.sold || 0}
            </span>
            <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: 11, border: '1px solid #252A33', background: 'rgba(245,158,11,0.10)', color: '#FCD34D' }}>
              Pendientes: {orderStatsByProduct[String(product.id)]?.pending || 0}
            </span>
            {aforoEnabled ? (
              <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: 11, border: '1px solid #252A33', background: 'rgba(148,163,184,0.10)', color: '#CBD5E1' }}>
                Aforo restante global: {remainingCapacity}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function SpectatorTicketingOpsPanel({ competition }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [scanToken, setScanToken] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [scanResult, setScanResult] = useState(null)

  const loadOrders = async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/competitions/${competition.id}/ticketing-orders`)
      setOrders(Array.isArray(data) ? data : [])
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadOrders() }, [competition.id])

  const scan = async () => {
    const token = String(scanToken || '').trim()
    if (!token) return
    setScanBusy(true)
    try {
      const { data } = await api.post(`/competitions/${competition.id}/ticketing/scan`, { token })
      setScanResult(data || null)
      setScanToken('')
      loadOrders()
    } catch (err) {
      setScanResult({
        status: 'invalid',
        label: 'Error en escaneo',
        message: err.response?.data?.detail || 'No se pudo validar la boleta.',
      })
    } finally {
      setScanBusy(false)
    }
  }

  const resultTone = scanResult?.status === 'valid'
    ? { border: 'rgba(34,197,94,0.35)', bg: 'rgba(34,197,94,0.12)', text: '#86EFAC' }
    : scanResult?.status === 'used'
      ? { border: 'rgba(245,158,11,0.35)', bg: 'rgba(245,158,11,0.12)', text: '#FCD34D' }
      : scanResult?.status === 'null'
        ? { border: 'rgba(148,163,184,0.35)', bg: 'rgba(148,163,184,0.12)', text: '#CBD5E1' }
        : { border: 'rgba(239,68,68,0.35)', bg: 'rgba(239,68,68,0.12)', text: '#FCA5A5' }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ border: '1px solid #252A33', borderRadius: 14, background: 'rgba(13,15,18,0.72)', padding: 12, display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#F5F7FA' }}>Scanner de boletas</div>
        <div style={{ color: '#AAB2C0', fontSize: 12 }}>Valida una boleta a la vez. Estados: valida, nula, ya usada o invalida.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={scanToken} onChange={(e) => setScanToken(e.target.value)} placeholder="Pegar token del QR (fallback manual)" />
          <button type="button" className="btn-primary btn-sm" onClick={scan} disabled={scanBusy || !String(scanToken || '').trim()}>
            {scanBusy ? 'Validando...' : 'Validar'}
          </button>
        </div>
        {scanResult ? (
          <div style={{ border: `1px solid ${resultTone.border}`, background: resultTone.bg, borderRadius: 12, padding: 10, color: '#F5F7FA' }}>
            <div style={{ color: resultTone.text, fontWeight: 800, fontSize: 14 }}>{scanResult.label || 'Resultado'}</div>
            <div style={{ marginTop: 4, fontSize: 13 }}>{scanResult.message || ''}</div>
            {scanResult.buyer_full_name ? <div style={{ marginTop: 4, fontSize: 12, color: '#D7DEE8' }}>{scanResult.buyer_full_name} · {scanResult.buyer_document || '-'}</div> : null}
          </div>
        ) : null}
      </div>
      <div style={{ border: '1px solid #252A33', borderRadius: 14, background: 'rgba(13,15,18,0.72)', padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ color: '#F5F7FA', fontWeight: 700, fontSize: 14 }}>Ordenes de boleteria</div>
          <button type="button" className="btn-secondary btn-sm" onClick={loadOrders} disabled={loading}>{loading ? 'Cargando...' : 'Actualizar'}</button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {!orders.length ? <div style={{ color: '#AAB2C0', fontSize: 12 }}>Sin ordenes de boleteria por ahora.</div> : null}
          {orders.slice(0, 20).map((order) => (
            <div key={`ticket-order-${order.id}`} style={{ border: '1px solid #252A33', borderRadius: 10, background: 'rgba(23,27,33,0.78)', padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ color: '#F5F7FA', fontWeight: 700, fontSize: 13 }}>{order.buyer_full_name}</div>
                <div style={{ color: '#AAB2C0', fontSize: 12 }}>{order.payment_status}</div>
              </div>
              <div style={{ marginTop: 4, color: '#AAB2C0', fontSize: 12 }}>{order.buyer_document} · {order.quantity} boleta(s)</div>
              <div style={{ marginTop: 4, color: '#AAB2C0', fontSize: 12 }}>Usadas: {order.tickets_used}/{order.tickets_total}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CompetitionThemeMiniPreview({ theme }) {
  const primaryTextColor = getReadableTextColor(theme.primary)
  return (
    <div
      style={{
        borderRadius: 20,
        overflow: 'hidden',
        border: `1px solid ${theme.border}`,
        background: `radial-gradient(circle at top, ${hexToRgba(theme.primary, 0.18)}, transparent 28%), radial-gradient(circle at 85% 20%, ${hexToRgba(theme.accent, 0.12)}, transparent 24%), ${theme.background}`,
        padding: 14,
      }}
    >
      <div
        style={{
          borderRadius: 18,
          border: `1px solid ${theme.border}`,
          background: `linear-gradient(135deg, ${hexToRgba(theme.primary, 0.16)}, ${hexToRgba(theme.surface, 0.96)} 46%, ${hexToRgba(theme.accent, 0.10)} 100%)`,
          padding: 14,
          boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 72, height: 22, borderRadius: 999, background: hexToRgba(theme.primary, 0.18), border: `1px solid ${hexToRgba(theme.primary, 0.30)}` }} />
          <div style={{ width: 84, height: 22, borderRadius: 999, background: hexToRgba(theme.accent, 0.14), border: `1px solid ${hexToRgba(theme.accent, 0.26)}` }} />
        </div>
        <div style={{ width: '58%', height: 24, borderRadius: 10, background: hexToRgba(theme.text, 0.92), marginBottom: 10 }} />
        <div style={{ width: '82%', height: 10, borderRadius: 999, background: hexToRgba(theme.textSecondary, 0.64), marginBottom: 6 }} />
        <div style={{ width: '68%', height: 10, borderRadius: 999, background: hexToRgba(theme.textSecondary, 0.42), marginBottom: 14 }} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ width: 108, height: 34, borderRadius: 12, background: theme.primary, border: `1px solid ${hexToRgba(theme.primary, 0.45)}`, boxShadow: `inset 0 0 0 1px ${hexToRgba(primaryTextColor, 0.08)}` }} />
          <div style={{ width: 96, height: 34, borderRadius: 12, background: hexToRgba(theme.background, 0.56), border: `1px solid ${theme.border}` }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 12 }}>
        {[0, 1, 2].map((index) => (
          <div key={index} style={{ borderRadius: 16, border: `1px solid ${theme.border}`, background: theme.surface, padding: 12 }}>
            <div style={{ width: 44, height: 8, borderRadius: 999, background: hexToRgba(theme.accent, 0.8), marginBottom: 10 }} />
            <div style={{ width: '72%', height: 18, borderRadius: 8, background: hexToRgba(theme.text, 0.88), marginBottom: 8 }} />
            <div style={{ width: '100%', height: 8, borderRadius: 999, background: hexToRgba(theme.textSecondary, 0.34), marginBottom: 5 }} />
            <div style={{ width: '64%', height: 8, borderRadius: 999, background: hexToRgba(theme.textSecondary, 0.22) }} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, borderRadius: 18, border: `1px solid ${theme.border}`, background: theme.surface, padding: 12 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 74, height: 26, borderRadius: 999, background: hexToRgba(theme.primary, 0.14), border: `1px solid ${hexToRgba(theme.primary, 0.24)}` }} />
          <div style={{ width: 90, height: 26, borderRadius: 999, background: hexToRgba(theme.background, 0.64), border: `1px solid ${theme.border}` }} />
          <div style={{ width: 78, height: 26, borderRadius: 999, background: hexToRgba(theme.background, 0.64), border: `1px solid ${theme.border}` }} />
        </div>
        {[0, 1, 2].map((index) => (
          <div key={index} style={{ borderRadius: 14, border: `1px solid ${theme.border}`, background: hexToRgba(theme.background, 0.56), padding: 12, marginBottom: index === 2 ? 0 : 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ width: '52%', height: 14, borderRadius: 999, background: hexToRgba(theme.text, 0.84) }} />
              <div style={{ width: 68, height: 20, borderRadius: 999, background: index % 2 === 0 ? hexToRgba(theme.accent, 0.14) : hexToRgba(theme.primary, 0.14), border: `1px solid ${index % 2 === 0 ? hexToRgba(theme.accent, 0.24) : hexToRgba(theme.primary, 0.24)}` }} />
            </div>
            <div style={{ width: '34%', height: 8, borderRadius: 999, background: hexToRgba(theme.textSecondary, 0.30), marginTop: 10 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// â”€â”€ Categories Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CategoriesModal({ competition, onClose }) {
  const [cats, setCats] = useState([])
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [savingId, setSavingId] = useState(null)

  const load = () => api.get(`/competitions/${competition.id}/categories`).then(r => setCats(r.data))
  useEffect(() => { load() }, [competition.id])

  const add = async (e) => {
    e.preventDefault()
    if (!nombre.trim()) return
    await api.post(`/competitions/${competition.id}/categories`, {
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
    })
    setNombre('')
    setDescripcion('')
    load()
  }

  const updateCatField = (id, field, value) => {
    setCats(prev => prev.map(cat => (cat.id === id ? { ...cat, [field]: value } : cat)))
  }

  const saveCat = async (cat) => {
    if (!cat?.id || !String(cat.nombre || '').trim()) return
    setSavingId(cat.id)
    try {
      await api.put(`/competitions/${competition.id}/categories/${cat.id}`, {
        nombre: String(cat.nombre || '').trim(),
        descripcion: String(cat.descripcion || '').trim() || null,
        orden: Number.isFinite(cat.orden) ? cat.orden : 0,
      })
      load()
    } finally {
      setSavingId(null)
    }
  }

  const remove = async (id) => {
    await api.delete(`/competitions/${competition.id}/categories/${id}`)
    load()
  }

  return (
    <Modal title={`Categorias - ${competition.nombre}`} onClose={onClose}>
      <form onSubmit={add} style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Hombres, Mujeres, Master..." style={{ flex: 1 }} />
        <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripcion de la categoria" rows={3} style={{ resize: 'vertical' }} />
        <button type="submit" className="btn-primary btn-sm">Agregar</button>
      </form>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {cats.length === 0 && <p style={{ color: 'var(--oa-text-secondary)', textAlign: 'center', padding: 20 }}>Sin categorias definidas</p>}
        {cats.map(c => (
          <div key={c.id} style={{ display: 'grid', gap: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid #252A33', background: 'rgba(13,15,18,0.72)', marginBottom: 8 }}>
            <input value={c.nombre || ''} onChange={e => updateCatField(c.id, 'nombre', e.target.value)} placeholder="Nombre" />
            <textarea value={c.descripcion || ''} onChange={e => updateCatField(c.id, 'descripcion', e.target.value)} placeholder="Descripcion" rows={3} style={{ resize: 'vertical' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button type="button" className="btn-secondary btn-sm" onClick={() => saveCat(c)} disabled={savingId === c.id}>
                {savingId === c.id ? 'Guardando...' : 'Guardar'}
              </button>
              <button className="btn-danger btn-sm" onClick={() => remove(c.id)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// â”€â”€ Phases Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PHASE_TIPOS = ['posicion', 'cantidad', 'tiempo']
const PHASE_MEASUREMENT_METHODS = ['for_time', 'amrap', 'emom', 'metros', 'rm']
const PHASE_MEASUREMENT_LABELS = {
  for_time: 'For Time',
  amrap: 'AMRAP',
  emom: 'EMOM',
  metros: 'Metros (m)',
  rm: 'RM',
}
const RM_UNIT_OPTIONS = ['kg', 'lb']
const PHASE_ESTADOS = ['pendiente', 'en_progreso', 'finalizada']
const PHASE_TEAM_MODES = ['sum_two', 'total', 'single_member']
const PHASE_WINNER_RULES = ['higher_wins', 'lower_wins']

function normalizePhaseType(raw) {
  const value = (raw || '').toString().trim().toLowerCase()
  if (value === 'puntos' || value === 'peso') return 'cantidad'
  if (value === 'posicion') return 'posicion'
  return PHASE_TIPOS.includes(value) ? value : 'cantidad'
}

function defaultWinnerRuleForType(tipo) {
  const t = normalizePhaseType(tipo)
  return (t === 'tiempo' || t === 'posicion') ? 'lower_wins' : 'higher_wins'
}

function defaultMeasurementMethodForType(tipo) {
  const t = normalizePhaseType(tipo)
  if (t === 'tiempo') return 'for_time'
  return 'amrap'
}

function normalizeMeasurementMethod(raw, tipo) {
  const value = (raw || '').toString().trim().toLowerCase()
  if (PHASE_MEASUREMENT_METHODS.includes(value)) return value
  if (value === 'kg' || value === 'g' || value === 'lb' || value === 'lbs' || value === 'kilogramos' || value === 'gramos' || value === 'libras') return 'rm'
  if (value === 'hms' || value === 'hh:mm:ss' || value === 'tiempo_hms' || value === 'posicion' || value === 'posición') return 'for_time'
  if (value === 'reps' || value === 'rep' || value === 'repeticiones' || value === 'unidades') return 'amrap'
  if (value === 'metro') return 'metros'
  return defaultMeasurementMethodForType(tipo)
}

function isTimeMeasurement(method) {
  return normalizeMeasurementMethod(method) === 'for_time'
}

function phaseTypeFromMethod(method) {
  const m = normalizeMeasurementMethod(method)
  if (m === 'for_time') return 'tiempo'
  return 'cantidad'
}

function phaseTypeFromPhase(phase) {
  return phaseTypeFromMethod(normalizeMeasurementMethod(phase?.measurement_method, phase?.tipo))
}

function normalizeWinnerRule(raw, tipo) {
  const value = (raw || '').toString().trim().toLowerCase()
  if (PHASE_WINNER_RULES.includes(value)) return value
  return defaultWinnerRuleForType(tipo)
}

function parseScoringRules(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(r => ({
        min_pos: Number(r.min_pos),
        max_pos: r.max_pos == null || r.max_pos === '' ? null : Number(r.max_pos),
        points: Number(r.points),
      }))
      .filter(r => Number.isFinite(r.min_pos) && r.min_pos > 0 && Number.isFinite(r.points))
  } catch {
    return []
  }
}

function createDefaultPhaseActivity(index = 0) {
  return {
    nombre: `Actividad ${index + 1}`,
    descripcion: '',
    measurement_method: 'for_time',
    winner_rule: 'lower_wins',
    points_mode: 'manual',
  }
}

function normalizePhaseActivities(raw, phaseFallback = null) {
  const source = Array.isArray(raw) && raw.length
    ? raw.filter(item => !item?._cat)
    : (phaseFallback ? [{
      nombre: phaseFallback.nombre || 'Actividad 1',
      descripcion: phaseFallback.descripcion || '',
      measurement_method: normalizeMeasurementMethod(phaseFallback.measurement_method, phaseFallback.tipo),
      winner_rule: normalizeWinnerRule(phaseFallback.winner_rule, phaseTypeFromPhase(phaseFallback)),
      points_mode: phaseFallback.points_mode || 'manual',
    }] : [])

  const normalized = source.map((item, index) => {
    const method = normalizeMeasurementMethod(item?.measurement_method, item?.tipo)
    const hasExplicitName = Object.prototype.hasOwnProperty.call(item || {}, 'nombre') || Object.prototype.hasOwnProperty.call(item || {}, 'name')
    const rawName = hasExplicitName ? String(item?.nombre ?? item?.name ?? '') : `Actividad ${index + 1}`
    return {
      nombre: rawName,
      descripcion: String(item?.descripcion ?? ''),
      measurement_method: method,
      winner_rule: normalizeWinnerRule(item?.winner_rule, phaseTypeFromMethod(method)),
      points_mode: String(item?.points_mode || 'manual') || 'manual',
    }
  })
  return normalized.length ? normalized : [createDefaultPhaseActivity()]
}

function createPhaseFormState() {
  return {
    nombre: '',
    descripcion: '',
    time_cap: '',
    part_b_enabled: false,
    part_b_descripcion: '',
    part_b_time_cap: '',
    allow_multiple_results: 0,
    team_result_mode: 'sum_two',
    estado: 'pendiente',
    is_visible: 1,
    start_at: '',
    end_at: '',
    activities: [createDefaultPhaseActivity()],
  }
}

function createPhaseDraftState(phase) {
  return {
    nombre: phase.nombre || '',
    descripcion: phase.descripcion || '',
    allow_multiple_results: Number(phase.allow_multiple_results || 0),
    team_result_mode: phase.team_result_mode || 'sum_two',
    estado: phase.estado || 'pendiente',
    is_visible: phase.is_visible == null ? 1 : Number(phase.is_visible),
    start_at: toDateInput(phase.start_at),
    end_at: toDateInput(phase.end_at),
    activities: normalizePhaseActivities(phase.activities, phase),
  }
}

function buildPhasePayload(values, orden = 0) {
  let sourceActivities = normalizePhaseActivities(values.activities)
  if (!values.part_b_enabled) {
    sourceActivities = sourceActivities.slice(0, 1)
  } else if (sourceActivities.length < 2) {
    sourceActivities = [...sourceActivities, createDefaultPhaseActivity(1)]
  }

  const baseTimeCapMin = parseInt(values.time_cap, 10)
  const baseTimeCap = Number.isFinite(baseTimeCapMin) && baseTimeCapMin > 0 ? baseTimeCapMin * 60 : null
  const partBTimeCapMin = parseInt(values.part_b_time_cap, 10)
  const partBTimeCap = Number.isFinite(partBTimeCapMin) && partBTimeCapMin > 0 ? partBTimeCapMin * 60 : null

  const activities = sourceActivities.map((activity, index) => {
    const isPartB = index === 1 && !!values.part_b_enabled
    const nextMeasurementMethod = isPartB
      ? normalizeMeasurementMethod(values.part_b_measurement_method || activity.measurement_method, phaseTypeFromMethod(values.part_b_measurement_method || activity.measurement_method))
      : normalizeMeasurementMethod(values.measurement_method || activity.measurement_method, phaseTypeFromMethod(values.measurement_method || activity.measurement_method))
    const nextDescription = isPartB
      ? String(values.part_b_descripcion ?? activity.descripcion ?? '').trim()
      : String(values.descripcion ?? activity.descripcion ?? '').trim()
    return {
      nombre: String(activity.nombre || `Actividad ${index + 1}`) || `Actividad ${index + 1}`,
      descripcion: nextDescription || null,
      measurement_method: nextMeasurementMethod,
      tipo: phaseTypeFromMethod(nextMeasurementMethod),
      winner_rule: normalizeWinnerRule(activity.winner_rule, phaseTypeFromMethod(nextMeasurementMethod)),
      points_mode: activity.points_mode || 'manual',
      time_cap: isPartB ? partBTimeCap : baseTimeCap,
      orden: index,
    }
  })
  const primary = activities[0] || {
    measurement_method: 'for_time',
    tipo: 'tiempo',
    winner_rule: 'lower_wins',
    points_mode: 'manual',
  }
  const timeCapMin = parseInt(values.time_cap, 10)
  const timeCap = Number.isFinite(timeCapMin) && timeCapMin > 0 ? timeCapMin * 60 : null
  const payload = {
    nombre: String(values.nombre || '').trim(),
    phase_format: activities.length > 1 ? 'wod' : 'activity',
    descripcion: String(activities[0]?.descripcion || values.descripcion || '').trim() || null,
    time_cap: timeCap,
    allow_multiple_results: Number(values.allow_multiple_results || 0),
    team_result_mode: values.team_result_mode || 'sum_two',
    estado: values.estado || 'pendiente',
    is_visible: Number(values.is_visible == null ? 1 : values.is_visible) ? 1 : 0,
    start_at: dateInputToStartOfDay(values.start_at),
    end_at: dateInputToEndOfDay(values.end_at),
    orden,
  }
  return {
    ...payload,
    tipo: primary.tipo,
    measurement_method: primary.measurement_method,
    winner_rule: primary.winner_rule,
    points_mode: primary.points_mode || 'manual',
    activities,
  }
}

function buildPhasePayloadWithCategoryOverrides(values, categories = [], orden = 0) {
  let baseActivities = normalizePhaseActivities(values.activities, values)
  if (!values.part_b_enabled) {
    baseActivities = baseActivities.slice(0, 1)
  } else if (baseActivities.length < 2) {
    baseActivities = [...baseActivities, createDefaultPhaseActivity(1)]
  }

  const basePayload = buildPhasePayload({ ...values, activities: baseActivities }, orden)
  const catEntries = Object.entries(values.catOverrides || {})
    .filter(([, override]) => !!override?.modified)
    .map(([catId, override], index) => {
      const cat = categories.find((item) => String(item.id) === String(catId))
      const catTimeCapMin = parseInt(override.time_cap, 10)
      const catPartBTimeCapMin = parseInt(override.part_b_time_cap, 10)
      return {
        _cat: String(catId),
        _cat_name: cat?.nombre || String(catId),
        nombre: cat?.nombre || `Categoria ${index + 1}`,
        descripcion: String(override.text || '').trim() || null,
        tipo: basePayload.tipo,
        measurement_method: basePayload.measurement_method,
        winner_rule: basePayload.winner_rule,
        points_mode: basePayload.points_mode || 'manual',
        time_cap: Number.isFinite(catTimeCapMin) && catTimeCapMin > 0 ? catTimeCapMin * 60 : null,
        part_b_descripcion: String(override.part_b_text || '').trim() || null,
        part_b_time_cap: Number.isFinite(catPartBTimeCapMin) && catPartBTimeCapMin > 0 ? catPartBTimeCapMin * 60 : null,
        orden: basePayload.activities.length + index,
      }
    })

  return {
    ...basePayload,
    activities: [...basePayload.activities, ...catEntries],
  }
}

function pointsFromPosition(position, rules) {
  const pos = Number(position)
  if (!Number.isFinite(pos) || pos <= 0) return null
  for (const r of rules) {
    const min = Number(r.min_pos)
    const max = r.max_pos == null ? null : Number(r.max_pos)
    if (!Number.isFinite(min)) continue
    if (max == null) {
      if (pos >= min) return Number(r.points)
    } else if (pos >= min && pos <= max) {
      return Number(r.points)
    }
  }
  return null
}

function parseTimeToSeconds(value) {
  const raw = (value ?? '').toString().trim()
  if (!raw) return null
  if (/^\d+$/.test(raw)) return Number(raw)
  const parts = raw.split(':').map(p => p.trim())
  if (parts.length !== 2 && parts.length !== 3) return null
  const nums = parts.map(Number)
  if (nums.some(n => !Number.isFinite(n) || n < 0)) return null
  let h = 0
  let m = 0
  let s = 0
  if (nums.length === 2) {
    ;[m, s] = nums
  } else {
    ;[h, m, s] = nums
  }
  if (m > 59 || s > 59) return null
  return (h * 3600) + (m * 60) + s
}

function parseMetricByPhase(value, phase) {
  const method = normalizeMeasurementMethod(phase?.measurement_method, phase?.tipo)
  if (isTimeMeasurement(method)) return parseTimeToSeconds(value)
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function PhasesModal({ competition, onClose, inline = false }) {
  const [phases, setPhases] = useState([])
  const [form, setForm] = useState(createPhaseFormState)
  const [createStep, setCreateStep] = useState(0)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const [phaseDrafts, setPhaseDrafts] = useState({})
  const [savingPhaseId, setSavingPhaseId] = useState(null)
  const [collapsedPhases, setCollapsedPhases] = useState({})
  const [rulesModalOpen, setRulesModalOpen] = useState(false)
  const [rulesPhaseId, setRulesPhaseId] = useState('')
  const [rulesDraft, setRulesDraft] = useState([])
  const [categories, setCategories] = useState([])
  const [catOverrides, setCatOverrides] = useState({})

  const load = async () => {
    const [phasesRes, catsRes] = await Promise.all([
      api.get(`/competitions/${competition.id}/phases`),
      api.get(`/competitions/${competition.id}/categories`),
    ])
    const items = phasesRes.data || []
    setPhases(items)
    setCategories(catsRes.data || [])
    const drafts = {}
    items.forEach(ph => {
      drafts[ph.id] = createPhaseDraftState(ph)
    })
    setPhaseDrafts(drafts)
  }
  useEffect(() => { load() }, [competition.id])
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const add = async () => {
    if (!form.nombre.trim()) return
    // Filtrar actividades segun toggle de parte B
    let baseActivities = normalizePhaseActivities(form.activities)
    if (!form.part_b_enabled) {
      baseActivities = baseActivities.slice(0, 1)
    } else if (baseActivities.length < 2) {
      baseActivities = [...baseActivities, createDefaultPhaseActivity(1)]
    }
    // Serializar time_cap de parte B en segundos
    const partBTimeCapMin = parseInt(form.part_b_time_cap, 10)
    const partBTimeCap = Number.isFinite(partBTimeCapMin) && partBTimeCapMin > 0 ? partBTimeCapMin * 60 : null
    // Overrides por categoria
    const catEntries = Object.entries(catOverrides)
      .filter(([, v]) => v.modified)
      .map(([catId, v]) => {
        const cat = categories.find(c => String(c.id) === String(catId))
        const catTimeCapMin = parseInt(v.time_cap, 10)
        const catTimeCap = Number.isFinite(catTimeCapMin) && catTimeCapMin > 0 ? catTimeCapMin * 60 : null
        const catPartBTimeCapMin = parseInt(v.part_b_time_cap, 10)
        const catPartBTimeCap = Number.isFinite(catPartBTimeCapMin) && catPartBTimeCapMin > 0 ? catPartBTimeCapMin * 60 : null
        return {
          _cat: catId,
          _cat_name: cat?.nombre || catId,
          descripcion: String(v.text || '').trim() || null,
          time_cap: catTimeCap,
          part_b_descripcion: String(v.part_b_text || '').trim() || null,
          part_b_time_cap: catPartBTimeCap,
        }
      })
    const formWithOverrides = {
      ...form,
      part_b_time_cap_seconds: partBTimeCap,
      activities: [...baseActivities, ...catEntries],
    }
    await api.post(`/competitions/${competition.id}/phases`, buildPhasePayload(formWithOverrides, phases.length))
    setForm(createPhaseFormState())
    setCatOverrides({})
    setCreateStep(0)
    load()
  }

  const remove = async (id) => {
    await api.delete(`/competitions/${competition.id}/phases/${id}`)
    load()
  }

  const patchPhaseDraft = (id, field, value) => {
    setPhaseDrafts(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value },
    }))
  }

  const patchDraftCatOverride = (phaseId, catId, field, value) => {
    setPhaseDrafts(prev => {
      const draft = prev[phaseId] || {}
      const catOverrides = draft.catOverrides || {}
      const override = catOverrides[catId] || {}
      return {
        ...prev,
        [phaseId]: { ...draft, catOverrides: { ...catOverrides, [catId]: { ...override, [field]: value } } },
      }
    })
  }

  const patchFormActivity = (activityIndex, field, value) => {
    setForm(prev => {
      const activities = normalizePhaseActivities(prev.activities).map((activity, index) => {
        if (index !== activityIndex) return activity
        const next = { ...activity, [field]: value }
        if (field === 'measurement_method') {
          next.winner_rule = defaultWinnerRuleForType(phaseTypeFromMethod(value))
        }
        return next
      })
      return { ...prev, activities }
    })
  }

  const appendFormActivity = () => {
    setForm(prev => {
      const activities = normalizePhaseActivities(prev.activities)
      return { ...prev, activities: [...activities, createDefaultPhaseActivity(activities.length)] }
    })
  }

  const removeFormActivity = (activityIndex) => {
    setForm(prev => {
      const current = normalizePhaseActivities(prev.activities)
      const activities = current.filter((_, index) => index !== activityIndex)
      return { ...prev, activities: activities.length ? activities : [createDefaultPhaseActivity()] }
    })
  }

  const patchDraftActivity = (phaseId, activityIndex, field, value) => {
    setPhaseDrafts(prev => {
      const draft = prev[phaseId] || {}
      const activities = normalizePhaseActivities(draft.activities).map((activity, index) => {
        if (index !== activityIndex) return activity
        const next = { ...activity, [field]: value }
        if (field === 'measurement_method') {
          next.winner_rule = defaultWinnerRuleForType(phaseTypeFromMethod(value))
        }
        return next
      })
      return { ...prev, [phaseId]: { ...draft, activities } }
    })
  }

  const appendDraftActivity = (phaseId) => {
    setPhaseDrafts(prev => {
      const draft = prev[phaseId] || {}
      const activities = normalizePhaseActivities(draft.activities)
      return { ...prev, [phaseId]: { ...draft, activities: [...activities, createDefaultPhaseActivity(activities.length)] } }
    })
  }

  const removeDraftActivity = (phaseId, activityIndex) => {
    setPhaseDrafts(prev => {
      const draft = prev[phaseId] || {}
      const current = normalizePhaseActivities(draft.activities)
      const activities = current.filter((_, index) => index !== activityIndex)
      return { ...prev, [phaseId]: { ...draft, activities: activities.length ? activities : [createDefaultPhaseActivity()] } }
    })
  }

  const savePhase = async (phase) => {
    const d = phaseDrafts[phase.id] || {}
    setSavingPhaseId(phase.id)
    try {
      const base = { ...createPhaseDraftState(phase), ...d }
      // Merge cat overrides: start from existing _cat entries on phase, then apply draft edits
      const existingCatEntries = (phase.activities || []).filter(a => a._cat)
      const draftCatOverrides = d.catOverrides || {}
      // Build merged cat override list
      const allCatIds = new Set([
        ...existingCatEntries.map(a => String(a._cat)),
        ...Object.keys(draftCatOverrides),
      ])
      const catEntries = [...allCatIds].map(catId => {
        const existing = existingCatEntries.find(a => String(a._cat) === catId) || {}
        const override = draftCatOverrides[catId] || {}
        const catTimeCapMin = parseInt(override.time_cap ?? (existing.time_cap ? String(Math.round(existing.time_cap / 60)) : ''), 10)
        const catTimeCap = Number.isFinite(catTimeCapMin) && catTimeCapMin > 0 ? catTimeCapMin * 60 : (override.time_cap === '' ? null : existing.time_cap ?? null)
        const catPartBTimeCapMin = parseInt(override.part_b_time_cap ?? (existing.part_b_time_cap ? String(Math.round(existing.part_b_time_cap / 60)) : ''), 10)
        const catPartBTimeCap = Number.isFinite(catPartBTimeCapMin) && catPartBTimeCapMin > 0 ? catPartBTimeCapMin * 60 : (override.part_b_time_cap === '' ? null : existing.part_b_time_cap ?? null)
        const modified = 'modified' in override ? override.modified : true
        if (!modified) return null
        return {
          _cat: catId,
          _cat_name: existing._cat_name || catId,
          descripcion: 'text' in override ? (String(override.text || '').trim() || null) : (existing.descripcion ?? null),
          time_cap: catTimeCap,
          part_b_descripcion: 'part_b_text' in override ? (String(override.part_b_text || '').trim() || null) : (existing.part_b_descripcion ?? null),
          part_b_time_cap: catPartBTimeCap,
        }
      }).filter(Boolean)
      const baseActivities = normalizePhaseActivities(base.activities)
      await api.put(`/competitions/${competition.id}/phases/${phase.id}`, buildPhasePayload({
        ...base,
        activities: [...baseActivities, ...catEntries],
      }, Number(phase.orden || 0)))
      await load()
    } finally {
      setSavingPhaseId(null)
    }
  }

  const openRulesModal = (phase) => {
    setRulesPhaseId(String(phase.id))
    setRulesDraft(parseScoringRules(phase.scoring_rules))
    setRulesModalOpen(true)
  }

  const saveRules = async () => {
    if (!rulesPhaseId) return
    const cleaned = rulesDraft
      .map(r => ({
        min_pos: Number(r.min_pos),
        max_pos: r.max_pos === '' || r.max_pos == null ? null : Number(r.max_pos),
        points: Number(r.points),
      }))
      .filter(r => Number.isFinite(r.min_pos) && r.min_pos > 0 && Number.isFinite(r.points))
      .sort((a, b) => a.min_pos - b.min_pos)
    await api.put(`/competitions/${competition.id}/phases/${Number(rulesPhaseId)}`, {
      scoring_rules: JSON.stringify(cleaned),
    })
    setRulesModalOpen(false)
    await load()
  }

  const createActivities = normalizePhaseActivities(form.activities)
  const currentMethod = createActivities[0]?.measurement_method || 'for_time'
  const wizardSteps = [
    { id: 'overview', label: 'Ajustes generales' },
    { id: 'activities', label: 'Actividades' },
    { id: 'review', label: 'Revision' },
  ]
  const canAdvanceCreateStep = [
    form.nombre.trim().length > 0,
    String(createActivities[0]?.descripcion || '').trim().length > 0,
    true,
  ]
  const goNextCreateStep = () => {
    setCreateStep(prev => Math.min(prev + 1, wizardSteps.length - 1))
  }
  const goPrevCreateStep = () => {
    setCreateStep(prev => Math.max(prev - 1, 0))
  }

  const phaseManagerContent = (
    <>
      <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
        Crea cada evento paso a paso. Un evento puede tener una sola actividad o varios bloques dentro del mismo WOD.
      </div>
      <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
        <div style={{ borderRadius: 18, border: '1px solid #252A33', background: 'linear-gradient(180deg, rgba(23,27,33,0.98), rgba(13,15,18,0.92))', padding: isMobile ? 14 : 18, display: 'grid', gap: 14, boxShadow: '0 20px 50px rgba(0,0,0,0.22)' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: '#5EEAD4', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.9 }}>Wizard de evento</div>
                <div style={{ color: '#F5F7FA', fontSize: isMobile ? 18 : 20, fontWeight: 800, marginTop: 4 }}>{wizardSteps[createStep].label}</div>
              </div>
              <div style={{ color: '#AAB2C0', fontSize: 12 }}>{`Paso ${createStep + 1} de ${wizardSteps.length}`}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${wizardSteps.length}, minmax(0, 1fr))`, gap: 8 }}>
              {wizardSteps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    if (index <= createStep || canAdvanceCreateStep.slice(0, index).every(Boolean)) setCreateStep(index)
                  }}
                  style={{
                    borderRadius: 999,
                    border: index === createStep ? '1px solid rgba(214,217,224,0.45)' : '1px solid #252A33',
                    background: index === createStep ? 'rgba(214,217,224,0.14)' : 'rgba(13,15,18,0.72)',
                    color: index <= createStep ? '#F5F7FA' : '#6B7280',
                    padding: '10px 12px',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {step.label}
                </button>
              ))}
            </div>
          </div>

          {createStep === 0 && (() => {
            const compStart = parseCalendarDate(competition.competition_start)
            const compEnd = parseCalendarDate(competition.competition_end)
            const competitionDays = []
            if (compStart && compEnd) {
              const cursor = new Date(compStart)
              cursor.setHours(0, 0, 0, 0)
              const end = new Date(compEnd)
              end.setHours(0, 0, 0, 0)
              let dayIndex = 1
              while (cursor <= end) {
                competitionDays.push({
                label: `Dia ${dayIndex} - ${cursor.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}`,
                  value: cursor.toISOString().slice(0, 10),
                })
                cursor.setDate(cursor.getDate() + 1)
                dayIndex++
              }
            }
            return (
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Nombre *</label>
                  <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: WOD 1, Sprint, Evento final" required />
                </div>
                {/* ---- TOGGLE PARTE B ---- */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, border: '1px solid #252A33', background: 'rgba(13,15,18,0.5)' }}>
                  <span style={{ fontSize: 13, color: '#AAB2C0' }}>¿Este WOD tiene dos puntajes?</span>
                  <label htmlFor="toggle-part-b" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: form.part_b_enabled ? '#D6D9E0' : '#6B7280' }}>
                      {form.part_b_enabled ? 'Sí' : 'No'}
                    </span>
                    <span style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
                      <input id="toggle-part-b" type="checkbox" checked={form.part_b_enabled}
                        onChange={e => setForm(prev => ({ ...prev, part_b_enabled: e.target.checked, part_b_descripcion: '', part_b_time_cap: '' }))}
                        style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                      <span style={{ position: 'absolute', inset: 0, borderRadius: 999, cursor: 'pointer', background: form.part_b_enabled ? '#D6D9E0' : '#374151', transition: 'background 0.2s' }} />
                      <span style={{ position: 'absolute', top: 3, left: form.part_b_enabled ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', pointerEvents: 'none' }} />
                    </span>
                  </label>
                </div>
                {/* Selector de dia */}
                {competitionDays.length > 0 && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#5EEAD4', textTransform: 'uppercase', letterSpacing: 0.8 }}>Dia del evento</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {competitionDays.map(day => (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => setForm(prev => ({
                            ...prev,
                            start_at: prev.start_at === day.value ? '' : day.value,
                            end_at: prev.end_at === day.value ? '' : day.value,
                          }))}
                          style={{
                            borderRadius: 999,
                            border: form.start_at === day.value ? '1px solid rgba(214,217,224,0.6)' : '1px solid #252A33',
                            background: form.start_at === day.value ? 'rgba(214,217,224,0.18)' : 'rgba(13,15,18,0.72)',
                            color: form.start_at === day.value ? '#FFD0AE' : '#AAB2C0',
                            padding: '8px 14px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Estado */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Estado</label>
                  <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
                    {PHASE_ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )
          })()}

          {createStep === 1 && (
            <div style={{ display: 'grid', gap: 16 }}>

              {/* ---- PARTE A ---- */}
              {(() => {
                const isForTime = currentMethod === 'for_time'
                const isAmrapOrEmom = currentMethod === 'amrap' || currentMethod === 'emom'
                return (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#5EEAD4', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      {form.part_b_enabled ? 'Parte A' : 'WOD'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 8 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Formato</label>
                        <select
                          value={currentMethod}
                          onChange={e => {
                            const next = e.target.value
                            patchFormActivity(0, 'measurement_method', next)
                            if (next === 'for_time') patchFormActivity(0, 'winner_rule', 'lower_wins')
                            else if (next === 'amrap' || next === 'emom') patchFormActivity(0, 'winner_rule', 'higher_wins')
                          }}
                        >
                          {PHASE_MEASUREMENT_METHODS.map(m => <option key={m} value={m}>{PHASE_MEASUREMENT_LABELS[m] || m}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>{isForTime ? 'Time cap' : 'Duracion'} <span style={{ color: '#6B7280', fontWeight: 400 }}>(min)</span></label>
                        <input
                          type="number" min="1" max="999"
                          value={form.time_cap}
                          onChange={e => setForm(prev => ({ ...prev, time_cap: e.target.value.replace(/\D/g, '') }))}
                          placeholder="Ej: 20"
                          style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
                          onWheel={e => e.target.blur()}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Puntuacion</label>
                        <select value={createActivities[0]?.winner_rule || 'higher_wins'} onChange={e => patchFormActivity(0, 'winner_rule', e.target.value)}>
                          {isForTime ? (<><option value="lower_wins">Menor tiempo gana</option><option value="higher_wins">Mayor tiempo gana</option></>) :
                           isAmrapOrEmom ? (<><option value="higher_wins">Mas repeticiones gana</option><option value="lower_wins">Menos repeticiones gana</option></>) :
                           (<><option value="higher_wins">Mayor valor gana</option><option value="lower_wins">Menor valor gana</option></>)}
                        </select>
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>WOD *</label>
                      <textarea
                        value={createActivities[0]?.descripcion || ''}
                        onChange={e => patchFormActivity(0, 'descripcion', e.target.value)}
                        placeholder={'Escribe el WOD aqui...\nEj: 21-15-9\nThrusters 43/29 kg\nPull-ups'}
                        rows={6}
                        style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
                      />
                    </div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {currentMethod === 'rm' && (
                        <div style={{ borderRadius: 12, border: '1px solid rgba(94,234,212,0.2)', background: 'rgba(94,234,212,0.08)', padding: '10px 12px', color: '#D9FFFA', fontSize: 12 }}>
                          {`Este evento RM usará ${String(competition?.rm_unit || 'kg').toUpperCase()} como unidad global de la competencia.`}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, border: '1px solid #252A33', background: 'rgba(13,15,18,0.5)' }}>
                        <span style={{ fontSize: 13, color: '#AAB2C0' }}>Mostrar evento en la vista previa y pública</span>
                        <label htmlFor="toggle-phase-visibility" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: form.is_visible ? '#D6D9E0' : '#6B7280' }}>
                            {form.is_visible ? 'Visible' : 'Oculto'}
                          </span>
                          <span style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
                            <input
                              id="toggle-phase-visibility"
                              type="checkbox"
                              checked={!!form.is_visible}
                              onChange={e => setForm(prev => ({ ...prev, is_visible: e.target.checked ? 1 : 0 }))}
                              style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                            />
                            <span style={{ position: 'absolute', inset: 0, borderRadius: 999, cursor: 'pointer', background: form.is_visible ? '#D6D9E0' : '#374151', transition: 'background 0.2s' }} />
                            <span style={{ position: 'absolute', top: 3, left: form.is_visible ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', pointerEvents: 'none' }} />
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* ---- PARTE B ---- */}
              {form.part_b_enabled && (() => {
                const methodB = createActivities[1]?.measurement_method || 'for_time'
                const isForTimeB = methodB === 'for_time'
                const isAmrapOrEmomB = methodB === 'amrap' || methodB === 'emom'
                return (
                  <div style={{ display: 'grid', gap: 10, borderRadius: 12, border: '1px solid rgba(214,217,224,0.25)', background: 'rgba(214,217,224,0.04)', padding: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#D6D9E0', textTransform: 'uppercase', letterSpacing: 0.8 }}>Parte B</div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 8 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Formato</label>
                        <select
                          value={methodB}
                          onChange={e => {
                            const next = e.target.value
                            if (createActivities.length < 2) appendFormActivity()
                            patchFormActivity(1, 'measurement_method', next)
                            if (next === 'for_time') patchFormActivity(1, 'winner_rule', 'lower_wins')
                            else if (next === 'amrap' || next === 'emom') patchFormActivity(1, 'winner_rule', 'higher_wins')
                          }}
                        >
                          {PHASE_MEASUREMENT_METHODS.map(m => <option key={m} value={m}>{PHASE_MEASUREMENT_LABELS[m] || m}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>{isForTimeB ? 'Time cap' : 'Duracion'} <span style={{ color: '#6B7280', fontWeight: 400 }}>(min)</span></label>
                        <input
                          type="number" min="1" max="999"
                          value={form.part_b_time_cap}
                          onChange={e => setForm(prev => ({ ...prev, part_b_time_cap: e.target.value.replace(/\D/g, '') }))}
                          placeholder="Ej: 5"
                          style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
                          onWheel={e => e.target.blur()}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Puntuacion</label>
                        <select value={createActivities[1]?.winner_rule || 'higher_wins'} onChange={e => patchFormActivity(1, 'winner_rule', e.target.value)}>
                          {isForTimeB ? (<><option value="lower_wins">Menor tiempo gana</option><option value="higher_wins">Mayor tiempo gana</option></>) :
                           isAmrapOrEmomB ? (<><option value="higher_wins">Mas repeticiones gana</option><option value="lower_wins">Menos repeticiones gana</option></>) :
                           (<><option value="higher_wins">Mayor valor gana</option><option value="lower_wins">Menor valor gana</option></>)}
                        </select>
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>WOD Parte B</label>
                      <textarea
                        value={form.part_b_descripcion}
                        onChange={e => setForm(prev => ({ ...prev, part_b_descripcion: e.target.value }))}
                        placeholder={'Describe la parte B...\nEj: 1RM Clean'}
                        rows={4}
                        style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
                      />
                    </div>
                  </div>
                )
              })()}

              {/* ---- CONFIGURACION POR CATEGORIA ---- */}
              {categories.length > 0 && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#5EEAD4', textTransform: 'uppercase', letterSpacing: 0.8 }}>Configuracion por categoria</div>
                  {categories.map(cat => {
                    const override = catOverrides[cat.id] || {}
                    const isModified = !!override.modified
                    const toggleId = `cat-toggle-${cat.id}`
                    return (
                      <div
                        key={cat.id}
                        style={{ borderRadius: 12, border: `1px solid ${isModified ? 'rgba(214,217,224,0.35)' : '#252A33'}`, background: '#171B21', overflow: 'hidden' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 8px' }}>
                          <span style={{ padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 900, background: 'rgba(107,114,128,0.18)', border: '1px solid rgba(107,114,128,0.25)', color: '#9CA3AF', letterSpacing: 0.5, flexShrink: 0 }}>
                            {cat.nombre.split(' ')[0].toUpperCase()}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#F5F7FA' }}>{cat.nombre}</span>
                          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: isModified ? 'rgba(214,217,224,0.15)' : 'rgba(94,234,212,0.12)', border: `1px solid ${isModified ? 'rgba(214,217,224,0.35)' : 'rgba(94,234,212,0.22)'}`, color: isModified ? '#FFD0AE' : '#D9FFFA' }}>
                            {isModified ? 'Modificado' : 'Hereda base'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 14px 10px' }}>
                          <span style={{ fontSize: 13, color: '#AAB2C0' }}>¿Modificar el WOD para esta categoria?</span>
                          <label htmlFor={toggleId} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
                            <span style={{ fontSize: 12, color: '#6B7280' }}>{isModified ? '' : 'No'}</span>
                            <span style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
                              <input id={toggleId} type="checkbox" checked={isModified}
                                onChange={e => setCatOverrides(prev => ({ ...prev, [cat.id]: { ...override, modified: e.target.checked } }))}
                                style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                              />
                              <span style={{ position: 'absolute', inset: 0, borderRadius: 999, cursor: 'pointer', background: isModified ? '#D6D9E0' : '#374151', transition: 'background 0.2s' }} />
                              <span style={{ position: 'absolute', top: 3, left: isModified ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', pointerEvents: 'none' }} />
                            </span>
                          </label>
                        </div>
                        {isModified && (
                          <div style={{ padding: '0 14px 14px', display: 'grid', gap: 12 }}>
                            {/* Override Parte A */}
                            <div style={{ display: 'grid', gap: 8 }}>
                              {form.part_b_enabled && <div style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6 }}>Parte A</div>}
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>{currentMethod === 'for_time' ? 'Time cap' : 'Duracion'} <span style={{ color: '#6B7280', fontWeight: 400 }}>(min)</span></label>
                                <input
                                  type="number" min="1" max="999"
                                  value={override.time_cap ?? ''}
                                  onChange={e => setCatOverrides(prev => ({ ...prev, [cat.id]: { ...override, time_cap: e.target.value.replace(/\D/g, '') } }))}
                                  placeholder={form.time_cap ? `${form.time_cap} (hereda base)` : 'Ej: 20'}
                                  style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
                                  onWheel={e => e.target.blur()}
                                />
                              </div>
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>WOD{form.part_b_enabled ? ' Parte A' : ''}</label>
                                <textarea
                                  value={override.text || ''}
                                  onChange={e => setCatOverrides(prev => ({ ...prev, [cat.id]: { ...override, text: e.target.value } }))}
                                  placeholder={createActivities[0]?.descripcion ? `${createActivities[0].descripcion}\n\n(edita para sobreescribir)` : `WOD especifico para ${cat.nombre}...`}
                                  rows={4}
                                  style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                                />
                              </div>
                            </div>
                            {/* Override Parte B */}
                            {form.part_b_enabled && (
                              <div style={{ display: 'grid', gap: 8, borderTop: '1px solid #252A33', paddingTop: 10 }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6 }}>Parte B</div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                  <label>{createActivities[1]?.measurement_method === 'for_time' ? 'Time cap' : 'Duracion'} <span style={{ color: '#6B7280', fontWeight: 400 }}>(min)</span></label>
                                  <input
                                    type="number" min="1" max="999"
                                    value={override.part_b_time_cap ?? ''}
                                    onChange={e => setCatOverrides(prev => ({ ...prev, [cat.id]: { ...override, part_b_time_cap: e.target.value.replace(/\D/g, '') } }))}
                                    placeholder={form.part_b_time_cap ? `${form.part_b_time_cap} (hereda base)` : 'Ej: 5'}
                                    style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
                                    onWheel={e => e.target.blur()}
                                  />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                  <label>WOD Parte B</label>
                                  <textarea
                                    value={override.part_b_text || ''}
                                    onChange={e => setCatOverrides(prev => ({ ...prev, [cat.id]: { ...override, part_b_text: e.target.value } }))}
                                    placeholder={`Parte B especifica para ${cat.nombre}...`}
                                    rows={3}
                                    style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {createStep === 2 && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.72)', padding: 14, display: 'grid', gap: 10 }}>
                <div style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 800 }}>{form.nombre || 'Nuevo evento'}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(94,234,212,0.12)', border: '1px solid rgba(94,234,212,0.22)', color: '#D9FFFA', fontSize: 12, fontWeight: 700 }}>
                    {PHASE_MEASUREMENT_LABELS[createActivities[0]?.measurement_method] || createActivities[0]?.measurement_method || 'for_time'}
                  </span>
                  {form.time_cap ? (
                    <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(214,217,224,0.12)', border: '1px solid rgba(214,217,224,0.22)', color: '#FFD0AE', fontSize: 12, fontWeight: 700 }}>
                      {`Cap: ${form.time_cap}`}
                    </span>
                  ) : null}
                  <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(107,114,128,0.12)', border: '1px solid rgba(107,114,128,0.22)', color: '#AAB2C0', fontSize: 12, fontWeight: 700 }}>
                    {createActivities[0]?.winner_rule === 'lower_wins' ? 'Gana menor' : 'Gana mayor'}
                  </span>
                  <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(214,217,224,0.12)', border: '1px solid rgba(214,217,224,0.22)', color: '#FFD0AE', fontSize: 12, fontWeight: 700 }}>{form.estado || 'pendiente'}</span>
                </div>
                <div style={{ color: '#AAB2C0', fontSize: 13, lineHeight: 1.6 }}>
                  {form.start_at || form.end_at ? `Fechas: ${form.start_at || 'sin inicio'} a ${form.end_at || 'sin cierre'}` : 'Fechas: por definir'}
                </div>
              </div>

              <div style={{ borderRadius: 12, border: '1px solid #252A33', background: '#171B21', padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#5EEAD4', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>WOD Base</div>
                <div style={{ color: '#F5F7FA', fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{createActivities[0]?.descripcion}</div>
              </div>

              {Object.entries(catOverrides).filter(([, v]) => v.modified && String(v.text || '').trim()).length > 0 && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#5EEAD4', textTransform: 'uppercase', letterSpacing: 0.8 }}>Overrides por categoria</div>
                  {Object.entries(catOverrides)
                    .filter(([, v]) => v.modified && String(v.text || '').trim())
                    .map(([catId, v]) => {
                      const cat = categories.find(c => String(c.id) === String(catId))
                      return (
                        <div key={catId} style={{ borderRadius: 12, border: '1px solid rgba(214,217,224,0.25)', background: '#171B21', padding: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: '#FFD0AE', marginBottom: 6 }}>{cat?.nombre || catId}</div>
                          <div style={{ color: '#AAB2C0', fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{v.text}</div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary btn-sm" onClick={goPrevCreateStep} disabled={createStep === 0}>
              Atras
            </button>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {createStep < wizardSteps.length - 1 ? (
                <button type="button" className="btn-primary btn-sm" onClick={goNextCreateStep} disabled={!canAdvanceCreateStep[createStep]}>
                  Continuar
                </button>
              ) : (
                <button type="button" className="btn-primary btn-sm" onClick={add} disabled={!canAdvanceCreateStep.slice(0, 2).every(Boolean)}>
                  + Agregar evento
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Master / Detail */}
      {phases.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#647063' }}>Sin fases definidas</div>
      ) : (() => {
        const selectedPh = phases.find(p => String(p.id) === String(collapsedPhases.__selected)) || phases[0]
        const ph = selectedPh

        // Calcular competitionDays una vez
        const compStart = parseCalendarDate(competition.competition_start)
        const compEnd = parseCalendarDate(competition.competition_end)
        const competitionDays = []
        if (compStart && compEnd) {
          const cursor = new Date(compStart); cursor.setHours(0,0,0,0)
          const end = new Date(compEnd); end.setHours(0,0,0,0)
          let di = 1
          while (cursor <= end) {
            competitionDays.push({ label: `Dia ${di} - ${cursor.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}`, value: cursor.toISOString().slice(0,10) })
            cursor.setDate(cursor.getDate() + 1); di++
          }
        }

        const draftActivities = normalizePhaseActivities(phaseDrafts[ph.id]?.activities, ph)
        const actA = draftActivities[0] || {}
        const actB = draftActivities[1] || null
        const hasPartB = draftActivities.length > 1
        const methodA = actA.measurement_method || 'for_time'
        const isForTimeA = methodA === 'for_time'
        const isAmrapOrEmomA = methodA === 'amrap' || methodA === 'emom'
        const draftTimeCapA = phaseDrafts[ph.id]?.time_cap ?? (ph.time_cap ? String(Math.round(ph.time_cap / 60)) : '')
        const methodB = actB?.measurement_method || 'for_time'
        const isForTimeB = methodB === 'for_time'
        const isAmrapOrEmomB = methodB === 'amrap' || methodB === 'emom'
        const draftTimeCapB = phaseDrafts[ph.id]?.part_b_time_cap ?? (ph.activities?.find((_,idx) => idx === 1)?.time_cap ? String(Math.round(ph.activities.find((_,idx) => idx === 1).time_cap / 60)) : '')
        const dateVal = phaseDrafts[ph.id]?.start_at ?? toDateInput(ph.start_at)
        const toggleId = `edit-toggle-part-b-${ph.id}`

        return (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '200px 1fr', gap: 12, alignItems: 'start' }}>
            {/* Lista izquierda */}
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#5EEAD4', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Eventos creados</div>
              {phases.map((p, i) => {
                const isSelected = String(p.id) === String(ph.id)
                return (
                  <div
                    key={p.id}
                    onClick={() => setCollapsedPhases(prev => ({ ...prev, __selected: p.id }))}
                    style={{
                      padding: '9px 12px',
                      borderRadius: 10,
                      border: isSelected ? '1px solid rgba(214,217,224,0.45)' : '1px solid #252A33',
                      background: isSelected ? 'rgba(214,217,224,0.1)' : 'rgba(23,27,33,0.6)',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 700 }}>{`Evento ${i + 1}`}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? '#FFD0AE' : '#F5F7FA', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</div>
                  </div>
                )
              })}
            </div>

            {/* Detalle derecha */}
            <div style={{ display: 'grid', gap: 12, borderRadius: 16, border: '1px solid #252A33', background: 'linear-gradient(180deg, rgba(23,27,33,0.98), rgba(13,15,18,0.92))', padding: 16 }}>
              {/* Nombre */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Nombre</label>
                <input value={phaseDrafts[ph.id]?.nombre ?? ph.nombre} onChange={e => patchPhaseDraft(ph.id, 'nombre', e.target.value)} />
              </div>

              {/* Estado + Fecha */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Estado</label>
                  <select value={phaseDrafts[ph.id]?.estado ?? (ph.estado || 'pendiente')} onChange={e => patchPhaseDraft(ph.id, 'estado', e.target.value)}>
                    {PHASE_ESTADOS.map(s => <option key={`phase-state-${ph.id}-${s}`} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Fecha</label>
                  {competitionDays.length > 0 ? (
                    <select value={dateVal || ''} onChange={e => { patchPhaseDraft(ph.id, 'start_at', e.target.value); patchPhaseDraft(ph.id, 'end_at', e.target.value) }}>
                      <option value="">Sin fecha</option>
                      {competitionDays.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  ) : (
                    <div style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--oa-border)', background: 'var(--oa-surface)', fontSize: 14, color: 'var(--oa-text-muted)' }}>Sin fechas definidas</div>
                  )}
                </div>
              </div>

              {/* Toggle dos puntajes */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, border: '1px solid #252A33', background: 'rgba(13,15,18,0.5)' }}>
                <span style={{ fontSize: 13, color: '#AAB2C0' }}>¿Este WOD tiene dos puntajes?</span>
                <label htmlFor={toggleId} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: hasPartB ? '#D6D9E0' : '#6B7280' }}>{hasPartB ? 'Sí' : 'No'}</span>
                  <span style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
                    <input id={toggleId} type="checkbox" checked={hasPartB} onChange={e => e.target.checked ? appendDraftActivity(ph.id) : removeDraftActivity(ph.id, 1)} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                    <span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: hasPartB ? '#D6D9E0' : '#374151', transition: 'background 0.2s' }} />
                    <span style={{ position: 'absolute', top: 3, left: hasPartB ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', pointerEvents: 'none' }} />
                  </span>
                </label>
              </div>

              {/* WOD Parte A */}
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#5EEAD4', textTransform: 'uppercase', letterSpacing: 0.8 }}>{hasPartB ? 'Parte A' : 'WOD'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Formato</label>
                    <select value={methodA} onChange={e => { const n = e.target.value; patchDraftActivity(ph.id, 0, 'measurement_method', n); if (n === 'for_time') patchDraftActivity(ph.id, 0, 'winner_rule', 'lower_wins'); else if (n === 'amrap' || n === 'emom') patchDraftActivity(ph.id, 0, 'winner_rule', 'higher_wins') }}>
                      {PHASE_MEASUREMENT_METHODS.map(m => <option key={`edit-${ph.id}-a-${m}`} value={m}>{PHASE_MEASUREMENT_LABELS[m] || m}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>{isForTimeA ? 'Time cap' : 'Duracion'} <span style={{ color: '#6B7280', fontWeight: 400 }}>(min)</span></label>
                    <input type="number" min="1" max="999" value={draftTimeCapA} onChange={e => patchPhaseDraft(ph.id, 'time_cap', e.target.value.replace(/\D/g,''))} placeholder="Ej: 20" style={{ MozAppearance:'textfield', appearance:'textfield' }} onWheel={e => e.target.blur()} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Puntuacion</label>
                    <select value={actA.winner_rule || 'higher_wins'} onChange={e => patchDraftActivity(ph.id, 0, 'winner_rule', e.target.value)}>
                      {isForTimeA ? (<><option value="lower_wins">Menor tiempo gana</option><option value="higher_wins">Mayor tiempo gana</option></>) : isAmrapOrEmomA ? (<><option value="higher_wins">Mas repeticiones gana</option><option value="lower_wins">Menos repeticiones gana</option></>) : (<><option value="higher_wins">Mayor valor gana</option><option value="lower_wins">Menor valor gana</option></>)}
                    </select>
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>WOD {hasPartB ? 'Parte A' : '*'}</label>
                  <textarea value={actA.descripcion || ''} onChange={e => patchDraftActivity(ph.id, 0, 'descripcion', e.target.value)} placeholder={'Escribe el WOD aqui...\nEj: 21-15-9\nThrusters 43/29 kg\nPull-ups'} rows={6} style={{ resize:'vertical', fontFamily:'monospace', fontSize:13 }} />
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {methodA === 'rm' && (
                    <div style={{ borderRadius: 12, border: '1px solid rgba(94,234,212,0.2)', background: 'rgba(94,234,212,0.08)', padding: '10px 12px', color: '#D9FFFA', fontSize: 12 }}>
                      {`Este evento RM usará ${String(competition?.rm_unit || 'kg').toUpperCase()} como unidad global de la competencia.`}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, border: '1px solid #252A33', background: 'rgba(13,15,18,0.5)' }}>
                    <span style={{ fontSize: 13, color: '#AAB2C0' }}>Mostrar evento en la vista previa y pública</span>
                    <label htmlFor={`edit-toggle-visibility-${ph.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: (phaseDrafts[ph.id]?.is_visible ?? ph.is_visible ?? 1) ? '#D6D9E0' : '#6B7280' }}>
                        {(phaseDrafts[ph.id]?.is_visible ?? ph.is_visible ?? 1) ? 'Visible' : 'Oculto'}
                      </span>
                      <span style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
                        <input
                          id={`edit-toggle-visibility-${ph.id}`}
                          type="checkbox"
                          checked={!!(phaseDrafts[ph.id]?.is_visible ?? ph.is_visible ?? 1)}
                          onChange={e => patchPhaseDraft(ph.id, 'is_visible', e.target.checked ? 1 : 0)}
                          style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                        />
                        <span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: (phaseDrafts[ph.id]?.is_visible ?? ph.is_visible ?? 1) ? '#D6D9E0' : '#374151', transition: 'background 0.2s' }} />
                        <span style={{ position: 'absolute', top: 3, left: (phaseDrafts[ph.id]?.is_visible ?? ph.is_visible ?? 1) ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', pointerEvents: 'none' }} />
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* WOD Parte B */}
              {hasPartB && (
                <div style={{ display: 'grid', gap: 10, borderRadius: 12, border: '1px solid rgba(214,217,224,0.25)', background: 'rgba(214,217,224,0.04)', padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#D6D9E0', textTransform: 'uppercase', letterSpacing: 0.8 }}>Parte B</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Formato</label>
                      <select value={methodB} onChange={e => { const n = e.target.value; patchDraftActivity(ph.id, 1, 'measurement_method', n); if (n === 'for_time') patchDraftActivity(ph.id, 1, 'winner_rule', 'lower_wins'); else if (n === 'amrap' || n === 'emom') patchDraftActivity(ph.id, 1, 'winner_rule', 'higher_wins') }}>
                        {PHASE_MEASUREMENT_METHODS.map(m => <option key={`edit-${ph.id}-b-${m}`} value={m}>{PHASE_MEASUREMENT_LABELS[m] || m}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>{isForTimeB ? 'Time cap' : 'Duracion'} <span style={{ color: '#6B7280', fontWeight: 400 }}>(min)</span></label>
                      <input type="number" min="1" max="999" value={draftTimeCapB} onChange={e => patchPhaseDraft(ph.id, 'part_b_time_cap', e.target.value.replace(/\D/g,''))} placeholder="Ej: 5" style={{ MozAppearance:'textfield', appearance:'textfield' }} onWheel={e => e.target.blur()} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Puntuacion</label>
                      <select value={actB?.winner_rule || 'higher_wins'} onChange={e => patchDraftActivity(ph.id, 1, 'winner_rule', e.target.value)}>
                        {isForTimeB ? (<><option value="lower_wins">Menor tiempo gana</option><option value="higher_wins">Mayor tiempo gana</option></>) : isAmrapOrEmomB ? (<><option value="higher_wins">Mas repeticiones gana</option><option value="lower_wins">Menos repeticiones gana</option></>) : (<><option value="higher_wins">Mayor valor gana</option><option value="lower_wins">Menor valor gana</option></>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>WOD Parte B</label>
                    <textarea value={actB?.descripcion || ''} onChange={e => patchDraftActivity(ph.id, 1, 'descripcion', e.target.value)} placeholder={'Describe la parte B...\nEj: 1RM Clean'} rows={4} style={{ resize:'vertical', fontFamily:'monospace', fontSize:13 }} />
                  </div>
                </div>
              )}

              {/* Configuracion por categoria */}
              {categories.length > 0 && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#5EEAD4', textTransform: 'uppercase', letterSpacing: 0.8 }}>Configuracion por categoria</div>
                  {categories.map(cat => {
                    const existingEntry = (ph.activities || []).find(a => String(a._cat) === String(cat.id))
                    const draftOverride = (phaseDrafts[ph.id]?.catOverrides || {})[cat.id] || {}
                    const isModified = 'modified' in draftOverride ? draftOverride.modified : !!existingEntry
                    const toggleCatId = `edit-cat-toggle-${ph.id}-${cat.id}`
                    return (
                      <div key={`edit-cat-${ph.id}-${cat.id}`} style={{ borderRadius: 12, border: `1px solid ${isModified ? 'rgba(214,217,224,0.35)' : '#252A33'}`, background: '#171B21', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 8px' }}>
                          <span style={{ padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 900, background: 'rgba(107,114,128,0.18)', border: '1px solid rgba(107,114,128,0.25)', color: '#9CA3AF', letterSpacing: 0.5, flexShrink: 0 }}>
                            {cat.nombre.split(' ')[0].toUpperCase()}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#F5F7FA' }}>{cat.nombre}</span>
                          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: isModified ? 'rgba(214,217,224,0.15)' : 'rgba(94,234,212,0.12)', border: `1px solid ${isModified ? 'rgba(214,217,224,0.35)' : 'rgba(94,234,212,0.22)'}`, color: isModified ? '#FFD0AE' : '#D9FFFA' }}>
                            {isModified ? 'Modificado' : 'Hereda base'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 14px 10px' }}>
                      <span style={{ fontSize: 13, color: '#AAB2C0' }}>¿Modificar el WOD para esta categoria?</span>
                          <label htmlFor={toggleCatId} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
                            <span style={{ fontSize: 12, color: '#6B7280' }}>{isModified ? '' : 'No'}</span>
                            <span style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
                              <input id={toggleCatId} type="checkbox" checked={isModified}
                                onChange={e => patchDraftCatOverride(ph.id, cat.id, 'modified', e.target.checked)}
                                style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                              />
                              <span style={{ position: 'absolute', inset: 0, borderRadius: 999, cursor: 'pointer', background: isModified ? '#D6D9E0' : '#374151', transition: 'background 0.2s' }} />
                              <span style={{ position: 'absolute', top: 3, left: isModified ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', pointerEvents: 'none' }} />
                            </span>
                          </label>
                        </div>
                        {isModified && (
                          <div style={{ padding: '0 14px 14px', display: 'grid', gap: 12 }}>
                            <div style={{ display: 'grid', gap: 8 }}>
                              {hasPartB && <div style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6 }}>Parte A</div>}
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>{isForTimeA ? 'Time cap' : 'Duracion'} <span style={{ color: '#6B7280', fontWeight: 400 }}>(min)</span></label>
                                <input
                                  type="number" min="1" max="999"
                                  value={'time_cap' in draftOverride ? draftOverride.time_cap : (existingEntry?.time_cap ? String(Math.round(existingEntry.time_cap / 60)) : '')}
                                  onChange={e => patchDraftCatOverride(ph.id, cat.id, 'time_cap', e.target.value.replace(/\D/g, ''))}
                                  placeholder={draftTimeCapA ? `${draftTimeCapA} (hereda base)` : 'Ej: 20'}
                                  style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
                                  onWheel={e => e.target.blur()}
                                />
                              </div>
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>WOD{hasPartB ? ' Parte A' : ''}</label>
                                <textarea
                                  value={'text' in draftOverride ? draftOverride.text : (existingEntry?.descripcion || '')}
                                  onChange={e => patchDraftCatOverride(ph.id, cat.id, 'text', e.target.value)}
                                  placeholder={actA.descripcion ? `${actA.descripcion}\n\n(edita para sobreescribir)` : `WOD especifico para ${cat.nombre}...`}
                                  rows={4}
                                  style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                                />
                              </div>
                            </div>
                            {hasPartB && (
                              <div style={{ display: 'grid', gap: 8, borderTop: '1px solid #252A33', paddingTop: 10 }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6 }}>Parte B</div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                  <label>{isForTimeB ? 'Time cap' : 'Duracion'} <span style={{ color: '#6B7280', fontWeight: 400 }}>(min)</span></label>
                                  <input
                                    type="number" min="1" max="999"
                                    value={'part_b_time_cap' in draftOverride ? draftOverride.part_b_time_cap : (existingEntry?.part_b_time_cap ? String(Math.round(existingEntry.part_b_time_cap / 60)) : '')}
                                    onChange={e => patchDraftCatOverride(ph.id, cat.id, 'part_b_time_cap', e.target.value.replace(/\D/g, ''))}
                                    placeholder={draftTimeCapB ? `${draftTimeCapB} (hereda base)` : 'Ej: 5'}
                                    style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
                                    onWheel={e => e.target.blur()}
                                  />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                  <label>WOD Parte B</label>
                                  <textarea
                                    value={'part_b_text' in draftOverride ? draftOverride.part_b_text : (existingEntry?.part_b_descripcion || '')}
                                    onChange={e => patchDraftCatOverride(ph.id, cat.id, 'part_b_text', e.target.value)}
                                    placeholder={`Parte B especifica para ${cat.nombre}...`}
                                    rows={3}
                                    style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Acciones */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-primary btn-sm" onClick={() => savePhase(ph)} disabled={savingPhaseId === ph.id}>
                  {savingPhaseId === ph.id ? 'Guardando...' : 'Actualizar fase'}
                </button>
                <button type="button" className="btn-danger btn-sm" onClick={() => remove(ph.id)}>Eliminar</button>
              </div>
            </div>
          </div>
        )
      })()}
      {rulesModalOpen && (
        <Modal title="Puntaje por posicion" onClose={() => setRulesModalOpen(false)} width={620}>
          <div style={{ fontSize: 12, color: '#647063', marginBottom: 8 }}>
            Define rangos de posiciones y puntos para este evento.
          </div>
          <div style={{ display: 'grid', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
            {rulesDraft.map((r, idx) => (
              <div key={`phase-rule-${idx}`} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Desde posicion</label>
                  <input type="number" value={r.min_pos ?? ''} onChange={e => setRulesDraft(prev => prev.map((it, i) => i === idx ? { ...it, min_pos: e.target.value } : it))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Hasta posicion</label>
                  <input type="number" value={r.max_pos ?? ''} onChange={e => setRulesDraft(prev => prev.map((it, i) => i === idx ? { ...it, max_pos: e.target.value } : it))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Puntos</label>
                  <input type="number" value={r.points ?? ''} onChange={e => setRulesDraft(prev => prev.map((it, i) => i === idx ? { ...it, points: e.target.value } : it))} />
                </div>
                <button className="btn-danger btn-sm" onClick={() => setRulesDraft(prev => prev.filter((_, i) => i !== idx))}>Eliminar</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={() => setRulesDraft(prev => [...prev, { min_pos: '', max_pos: '', points: '' }])}>+ Regla</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" onClick={() => setRulesModalOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={saveRules}>Guardar puntaje</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )

  const hasDates = competition.competition_start && competition.competition_end

  const noDatesGate = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 20px', textAlign: 'center' }}>
      <img src="/pesa.svg" alt="pesa" style={{ width: 140, opacity: 0.85 }} />
      <div>
        <div style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 800, marginBottom: 6 }}>
          Primero confirma las fechas del evento
        </div>
        <div style={{ color: '#AAB2C0', fontSize: 13, lineHeight: 1.6, maxWidth: 320 }}>
          Para crear eventos necesitas definir las fechas de inicio y fin de la competencia. Esto permite organizar el cronograma por dia automaticamente.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 320 }}>
        <div style={{ borderRadius: 10, border: '1px solid #252A33', background: '#171B21', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#AAB2C0' }}>Inicio de competencia</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: competition.competition_start ? '#F5F7FA' : '#F59E0B' }}>
            {competition.competition_start ? toDateInput(competition.competition_start) : 'Sin definir'}
          </span>
        </div>
        <div style={{ borderRadius: 10, border: '1px solid #252A33', background: '#171B21', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#AAB2C0' }}>Fin de competencia</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: competition.competition_end ? '#F5F7FA' : '#F59E0B' }}>
            {competition.competition_end ? toDateInput(competition.competition_end) : 'Sin definir'}
          </span>
        </div>
      </div>
      <div style={{ color: '#6B7280', fontSize: 12 }}>
        Ve a <b style={{ color: '#AAB2C0' }}>Ajustes</b> de la competencia para configurar las fechas.
      </div>
    </div>
  )

  if (inline) {
    return (
      <div className="card">
        <h4 style={{ marginBottom: 12, fontSize: 15 }}>Bloques y eventos</h4>
        {hasDates ? phaseManagerContent : noDatesGate}
      </div>
    )
  }

  return (
    <Modal title={`Eventos - ${competition.nombre}`} onClose={onClose} width={540}>
      {hasDates ? phaseManagerContent : noDatesGate}
    </Modal>
  )
}

// â”€â”€ Enrollment Dates Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function EnrollDatesModal({ competition, onClose, onSaved }) {
  const [form, setForm] = useState({
    enrollment_open: competition.enrollment_open || 0,
    enrollment_start: toDateInput(competition.enrollment_start),
    enrollment_end: toDateInput(competition.enrollment_end),
  })
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put(`/competitions/${competition.id}`, {
        enrollment_open: form.enrollment_open,
        enrollment_start: dateInputToStartOfDay(form.enrollment_start),
        enrollment_end: dateInputToEndOfDay(form.enrollment_end),
      })
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Inscripciones - ${competition.nombre}`} onClose={onClose} width={420}>
      <form onSubmit={save}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', marginBottom: 14, border: '1px solid #252A33', borderRadius: 14, background: form.enrollment_open ? 'linear-gradient(135deg, rgba(214,217,224,0.14), rgba(241,244,248,0.04))' : 'rgba(13,15,18,0.72)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--oa-text)' }}>Inscripciones habilitadas</div>
            <div style={{ fontSize: 12, color: 'var(--oa-text-secondary)', marginTop: 4 }}>Controla si esta competencia acepta nuevas inscripciones.</div>
          </div>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, enrollment_open: f.enrollment_open ? 0 : 1 }))}
            style={{
              width: 50,
              height: 30,
              borderRadius: 999,
              border: `1px solid ${form.enrollment_open ? 'rgba(241,244,248,0.95)' : '#313844'}`,
              background: form.enrollment_open ? 'linear-gradient(135deg, #D6D9E0 0%, #F1F4F8 100%)' : '#252A33',
              padding: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: form.enrollment_open ? 'flex-end' : 'flex-start',
            }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#F5F7FA', boxShadow: '0 4px 12px rgba(0,0,0,0.22)' }} />
          </button>
        </div>
        <div className="form-group">
          <label>Fecha inicio inscripciones</label>
          <input type="date" value={form.enrollment_start} onChange={e => setForm(f => ({ ...f, enrollment_start: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Fecha cierre inscripciones</label>
          <input type="date" value={form.enrollment_end} onChange={e => setForm(f => ({ ...f, enrollment_end: e.target.value }))} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

// â”€â”€ Enrollment Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function EnrollmentModal({ competition, onClose, onSaved }) {
  const { role, organizerEnabled } = useAuth()
  const isOrganizer = role === 'organizer' || organizerEnabled
  const [modalTab, setModalTab] = useState(isOrganizer ? 'confirmados' : 'gestion')
  const [previewImage, setPreviewImage] = useState(null)
  const [viewedParticipant, setViewedParticipant] = useState(null)
  const [allParticipants, setAllParticipants] = useState([])
  const [competitionParticipants, setCompetitionParticipants] = useState([])
  const [categories, setCategories] = useState([])
  const [enrollMap, setEnrollMap] = useState({})   // confirmed: pid -> { selected, categoria }
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [removingParticipantId, setRemovingParticipantId] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const load = () => {
    setLoadError(null)
    const requests = [
      api.get(`/competitions/${competition.id}/participants`),
      api.get(`/competitions/${competition.id}/categories`).catch(() => ({ data: [] })),
    ]
    if (!isOrganizer) requests.unshift(api.get('/participants').catch(() => ({ data: [] })))
    return Promise.all(requests).then((responses) => {
      const pRes = isOrganizer ? { data: [] } : responses[0]
      const eRes = isOrganizer ? responses[0] : responses[1]
      const cRes = isOrganizer ? responses[1] : responses[2]
      setAllParticipants(pRes.data || [])
      setCompetitionParticipants(eRes.data || [])
      setCategories(cRes.data || [])
      const enrolled = eRes.data || []
      const confirmed = enrolled.filter(e => e.estado === 'confirmado')
      const map = {}
      confirmed.forEach(e => { map[e.id] = { selected: true, categoria: e.categoria_competencia || '' } })
      setEnrollMap(map)
      setModalTab(isOrganizer ? 'confirmados' : 'gestion')
      setViewedParticipant(null)
    }).catch((err) => {
      setLoadError(err?.response?.data?.detail || 'No se pudo cargar la lista de inscritos')
    })
  }

  useEffect(() => { load() }, [competition.id])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const { body, documentElement } = document
    const prevBodyOverflow = body.style.overflow
    const prevBodyTouchAction = body.style.touchAction
    const prevHtmlOverflow = documentElement.style.overflow
    const prevHtmlOverscroll = documentElement.style.overscrollBehavior

    body.style.overflow = 'hidden'
    body.style.touchAction = 'none'
    documentElement.style.overflow = 'hidden'
    documentElement.style.overscrollBehavior = 'none'

    return () => {
      body.style.overflow = prevBodyOverflow
      body.style.touchAction = prevBodyTouchAction
      documentElement.style.overflow = prevHtmlOverflow
      documentElement.style.overscrollBehavior = prevHtmlOverscroll
    }
  }, [])

  const toggle = (id) => {
    setEnrollMap(prev => {
      const entry = prev[id]
      if (entry?.selected) {
        const next = { ...prev }
        delete next[id]
        return next
      }
      return { ...prev, [id]: { selected: true, categoria: categories[0]?.nombre || '' } }
    })
  }

  const setCategoria = (id, cat) => {
    setEnrollMap(prev => ({ ...prev, [id]: { ...prev[id], categoria: cat } }))
  }

  const save = async () => {
    if (isOrganizer) return
    setSaving(true)
    const participants = Object.entries(enrollMap)
      .filter(([, v]) => v.selected)
      .map(([pid, v]) => ({ user_id: Number(pid), categoria: v.categoria || null }))
    try {
      await api.post(`/competitions/${competition.id}/participants`, { participants })
      onSaved()
      onClose()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al guardar inscripciones')
    } finally {
      setSaving(false)
    }
  }

  const filtered = allParticipants
    .filter(p => `${p.nombre} ${p.apellido} ${formatCedula(p.cedula, '')}`.toLowerCase().includes(search.toLowerCase()))
  const confirmedList = useMemo(
    () => competitionParticipants.filter(p => p.estado === 'confirmado'),
    [competitionParticipants]
  )
  const selectedCount = Object.values(enrollMap).filter(v => v.selected).length

  const organizerDetailView = viewedParticipant && (
    <div style={{ display: 'grid', gap: 14 }}>
      <button type="button" className="btn-secondary btn-sm" onClick={() => setViewedParticipant(null)} style={{ justifySelf: 'flex-start' }}>
        Volver
      </button>
      <div style={{ border: '1px solid #252A33', borderRadius: 14, background: 'rgba(13,15,18,0.72)', padding: 16, display: 'grid', gap: 10 }}>
        <div style={{ color: 'var(--oa-text)', fontSize: 17, fontWeight: 800 }}>
          {viewedParticipant.nombre} {viewedParticipant.apellido}
        </div>
        <div style={{ display: 'grid', gap: 6, color: 'var(--oa-text-secondary)', fontSize: 13 }}>
          <div><b style={{ color: 'var(--oa-text)' }}>Cedula:</b> {formatCedula(viewedParticipant.cedula)}</div>
          <div><b style={{ color: 'var(--oa-text)' }}>Categoria:</b> {viewedParticipant.categoria_competencia || '-'}</div>
          <div><b style={{ color: 'var(--oa-text)' }}>Estado:</b> {viewedParticipant.estado || '-'}</div>
        </div>
        <EnrollmentAnswersBlock raw={viewedParticipant.enrollment_answers} onPreviewImage={setPreviewImage} />
      </div>
    </div>
  )

  const removeFromCompetition = async (p) => {
    if (!confirm(`Eliminar a ${p.nombre} ${p.apellido} de esta competencia?`)) return
    setRemovingParticipantId(p.user_id ?? p.id)
    try {
      await api.delete(`/competitions/${competition.id}/users/${p.user_id ?? p.id}`)
      await load()
      onSaved()
    } catch (err) {
      alert(err.response?.data?.detail || 'No se pudo eliminar la inscripcion')
    } finally {
      setRemovingParticipantId(null)
    }
  }

  const organizerListView = (
    <div style={{ overflowY: 'auto', flex: 1, display: 'grid', gap: 10 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        flexWrap: 'wrap',
        padding: '12px 14px',
        borderRadius: 12,
        border: '1px solid #252A33',
        background: 'rgba(13,15,18,0.72)',
      }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#F5F7FA' }}>Listado de inscritos</div>
          <div style={{ fontSize: 12, color: '#AAB2C0' }}>{competitionParticipants.length} participantes</div>
        </div>
      </div>
      {!competitionParticipants.length && (
        <div style={{ color: 'var(--oa-text-secondary)', textAlign: 'center', padding: 40 }}>
          No hay inscritos
        </div>
      )}
      {competitionParticipants.map((p) => {
        const uid = p.user_id ?? p.id
        const isBusy = removingParticipantId === uid
        const estadoBadge = p.estado === 'confirmado'
          ? { label: 'Confirmado', color: '#8DF1E4', border: 'rgba(94,234,212,0.3)' }
          : p.estado === 'pendiente'
          ? { label: 'Pendiente', color: '#FFB36F', border: 'rgba(255,179,111,0.3)' }
          : { label: p.estado || 'Desconocido', color: '#AAB2C0', border: '#252A33' }
        return (
          <div key={uid} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #252A33',
            background: 'rgba(13,15,18,0.72)',
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--oa-text)' }}>{p.nombre} {p.apellido}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, border: `1px solid ${estadoBadge.border}`, color: estadoBadge.color }}>{estadoBadge.label}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--oa-text-secondary)', marginTop: 4 }}>
                Categoria: <b style={{ color: 'var(--oa-text)' }}>{p.categoria_competencia || '-'}</b>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setViewedParticipant(p)} disabled={isBusy}>Ver</button>
              <button type="button" className="btn-danger btn-sm" onClick={() => removeFromCompetition(p)} disabled={isBusy} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34 }}>
                {isBusy ? '...' : <Trash2 size={13} />}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <Modal title={`Inscripciones - ${competition.nombre}`} onClose={onClose} width={640}>
      {previewImage && <ImagePreviewModal item={previewImage} onClose={() => setPreviewImage(null)} />}
      {loadError && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, color: '#FCA5A5', fontSize: 13 }}>
          {loadError}
        </div>
      )}
      <div className="tabs" style={{ margin: '0 0 14px', border: 'none', gap: 4 }}>
        {isOrganizer ? (
          <button className={`tab ${modalTab === 'confirmados' ? 'active' : ''}`} onClick={() => { setModalTab('confirmados'); setViewedParticipant(null) }} style={{ padding: '4px 14px', fontSize: 13 }}>
            Inscritos
          </button>
        ) : (
          <button className={`tab ${modalTab === 'gestion' ? 'active' : ''}`} onClick={() => { setModalTab('gestion'); setViewedParticipant(null) }} style={{ padding: '4px 14px', fontSize: 13 }}>
            Gestionar inscritos
          </button>
        )}
      </div>

      {((isOrganizer && modalTab === 'confirmados') || (!isOrganizer && modalTab === 'gestion')) && (
        <>
          {isOrganizer ? (
            <>{organizerDetailView || organizerListView}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button className="btn-secondary" onClick={onClose}>Cerrar</button>
              </div>
            </>
          ) : (
            <>
              <input placeholder="Buscar participante..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
              <div style={{ fontSize: 12, color: 'var(--oa-text-secondary)', marginBottom: 8 }}>{selectedCount} confirmados seleccionados</div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {filtered.map(p => {
                  const enrolled = enrollMap[p.id]
                  return (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, marginBottom: 8,
                      border: `1px solid ${enrolled ? 'rgba(94,234,212,0.35)' : '#252A33'}`,
                      background: enrolled ? 'rgba(94,234,212,0.08)' : 'rgba(13,15,18,0.72)',
                    }}>
                      <input type="checkbox" checked={!!enrolled} onChange={() => toggle(p.id)} style={{ width: 'auto', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--oa-text)' }}>{p.nombre} {p.apellido}</div>
                        <div style={{ fontSize: 11, color: 'var(--oa-text-secondary)' }}>{formatCedula(p.cedula)}</div>
                      </div>
                      {enrolled && (
                        <select value={enrolled.categoria} onChange={e => setCategoria(p.id, e.target.value)}
                          style={{ fontSize: 12, width: 130, background: '#0D0F12', border: '1px solid #252A33', borderRadius: 8, padding: '6px 8px', color: 'var(--oa-text)' }}>
                          {categories.length === 0 && <option value="">Sin categorias</option>}
                          {categories.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                          {enrolled.categoria && !categories.find(c => c.nombre === enrolled.categoria) && (
                            <option value={enrolled.categoria}>{enrolled.categoria}</option>
                          )}
                        </select>
                      )}
                    </div>
                  )
                })}
                {!filtered.length && <div style={{ color: 'var(--oa-text-secondary)', padding: 20, textAlign: 'center' }}>Sin resultados</div>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button className="btn-secondary" onClick={onClose}>Cancelar</button>
                <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar inscripciones'}</button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}

// â”€â”€ Competitions Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CheckinQrConfigPanel({ competition, isMobile = false }) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [phases, setPhases] = useState([])
  const [phaseModalOpen, setPhaseModalOpen] = useState(false)
  const [phaseModalMode, setPhaseModalMode] = useState('create')
  const [editingPhase, setEditingPhase] = useState(null)
  const [phaseForm, setPhaseForm] = useState({
    code: '',
    label: '',
    description: '',
    order_index: 10,
    max_uses: 1,
    enabled: 1,
  })
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerModalOpen, setScannerModalOpen] = useState(false)
  const [scannerBusy, setScannerBusy] = useState(false)
  const [scannerResult, setScannerResult] = useState(null)
  const [scannerError, setScannerError] = useState('')
  const [scannerPhaseCode, setScannerPhaseCode] = useState('check_in')
  const [scannerStation, setScannerStation] = useState('')
  const [manualToken, setManualToken] = useState('')
  const [supportsDetector, setSupportsDetector] = useState(false)
  const [cameraDevices, setCameraDevices] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const detectorRef = useRef(null)
  const rafRef = useRef(null)
  const lastValueRef = useRef('')
  const lastTimeRef = useRef(0)
  const systemPhase = phases.find((phase) => phase.code === SYSTEM_CHECKIN_PHASE_CODE) || null
  const extraPhases = phases.filter((phase) => phase.code !== SYSTEM_CHECKIN_PHASE_CODE)
  const scannerPhaseOptions = phases.filter((phase) => Number(phase.enabled || 0))
  const scannerTargetPhase = phases.find((phase) => phase.code === scannerPhaseCode) || systemPhase || phases[0] || null
  const editingSystemPhase = phaseModalMode === 'edit' && editingPhase?.code === SYSTEM_CHECKIN_PHASE_CODE

  const stopScanner = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setScannerOpen(false)
  }

  const closeScannerModal = () => {
    stopScanner()
    setScannerModalOpen(false)
  }

  const resetPhaseForm = () => {
    setPhaseForm({
      code: '',
      label: '',
      description: '',
      order_index: 10,
      max_uses: 1,
      enabled: 1,
    })
  }

  const openCreatePhaseModal = () => {
    setPhaseModalMode('create')
    setEditingPhase(null)
    resetPhaseForm()
    setPhaseModalOpen(true)
  }

  const openEditPhaseModal = (phase) => {
    setPhaseModalMode('edit')
    setEditingPhase(phase)
    setPhaseForm({
      code: phase.code || '',
      label: phase.label || '',
      description: phase.description || '',
      order_index: Number(phase.order_index || 0),
      max_uses: Number(phase.max_uses || 1),
      enabled: Number(phase.enabled || 0) ? 1 : 0,
    })
    setPhaseModalOpen(true)
  }

  const closePhaseModal = () => {
    setPhaseModalOpen(false)
    setEditingPhase(null)
    resetPhaseForm()
  }

  const loadCameraDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const cams = devices
        .filter((device) => device.kind === 'videoinput')
        .map((device, index) => ({
          id: device.deviceId,
          label: device.label || `Camara ${index + 1}`,
        }))
      setCameraDevices(cams)
      if (!selectedCameraId && cams.length) {
        setSelectedCameraId(cams[0].id)
      }
    } catch {
      setCameraDevices([])
    }
  }

  const loadPhases = async () => {
    if (!competition?.id) return
    setLoading(true)
    try {
      const { data } = await api.get(`/competitions/${competition.id}/checkin/phases`)
      const items = Array.isArray(data) ? data : []
      setPhases(items)
      if (items.length && !items.some((item) => item.code === scannerPhaseCode)) {
        setScannerPhaseCode(items[0].code)
      }
      setMsg(null)
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo cargar la configuracion QR' })
      setPhases([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPhases()
  }, [competition?.id])

  useEffect(() => {
    setSupportsDetector(typeof window !== 'undefined' && 'BarcodeDetector' in window)
    loadCameraDevices()
  }, [])

  useEffect(() => () => stopScanner(), [])

  useEffect(() => {
    if (!scannerModalOpen) return
    loadCameraDevices()
  }, [scannerModalOpen])

  const submitPhaseModal = async () => {
    const code = String(phaseForm.code || '').trim().toLowerCase()
    const label = String(phaseForm.label || '').trim()
    if (!label) {
      setMsg({ type: 'error', text: 'El nombre de la fase es obligatorio.' })
      return
    }
    if (phaseModalMode === 'create' && !code) {
      setMsg({ type: 'error', text: 'El code de la fase es obligatorio.' })
      return
    }

    setSaving(true)
    try {
      if (phaseModalMode === 'create') {
        await api.post(`/competitions/${competition.id}/checkin/phases`, {
          code,
          label,
          description: String(phaseForm.description || '').trim() || null,
          order_index: Number(phaseForm.order_index || 0),
          max_uses: Number(phaseForm.max_uses || 1),
          enabled: Number(phaseForm.enabled || 0) ? 1 : 0,
        })
        setMsg({ type: 'success', text: 'Fase QR creada.' })
      } else if (editingPhase) {
        await api.put(`/competitions/${competition.id}/checkin/phases/${editingPhase.id}`, {
          label,
          description: String(phaseForm.description || '').trim() || null,
          order_index: Number(phaseForm.order_index || 0),
          max_uses: Number(phaseForm.max_uses || 1),
          enabled: Number(phaseForm.enabled || 0) ? 1 : 0,
        })
        setMsg({ type: 'success', text: `Fase ${editingPhase.code} actualizada.` })
      }
      closePhaseModal()
      await loadPhases()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo guardar la fase QR' })
    } finally {
      setSaving(false)
    }
  }

  const deletePhase = async (phase) => {
    if (phase.is_system) return
    if (!confirm(`Eliminar fase "${phase.label}"?`)) return
    setSaving(true)
    try {
      await api.delete(`/competitions/${competition.id}/checkin/phases/${phase.id}`)
      setMsg({ type: 'success', text: `Fase ${phase.code} eliminada.` })
      await loadPhases()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || `No se pudo eliminar ${phase.code}` })
    } finally {
      setSaving(false)
    }
  }

  const parseScannerResponse = (data) => {
    const participant = data?.participant || null
    const fullName = participant ? `${participant.nombre || ''} ${participant.apellido || ''}`.trim() : ''
    return {
      status: data?.status || 'unknown',
      text: data?.ok
        ? `Valido${fullName ? `: ${fullName}` : ''}`
        : data?.status === 'already_used'
          ? `Ya usado${fullName ? `: ${fullName}` : ''}`
          : data?.status === 'invalid_token'
            ? 'QR invalido'
            : data?.status === 'phase_disabled'
              ? 'Fase deshabilitada'
              : data?.status === 'not_confirmed'
                ? 'Inscripcion no confirmada'
                : 'No valido',
      at: data?.used_at || null,
    }
  }

  const submitScan = async (tokenRaw) => {
    const token = String(tokenRaw || '').trim()
    if (!token || !competition?.id) return
    if (scannerBusy) return
    setScannerBusy(true)
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `scan-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
      const { data } = await api.post(`/competitions/${competition.id}/checkin/scan`, {
        token,
        phase_code: scannerPhaseCode || 'check_in',
        station: String(scannerStation || '').trim() || null,
        device_id: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 180) : null,
        idempotency_key: idempotencyKey,
      })
      setScannerResult(parseScannerResponse(data))
      setScannerError('')
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(data?.ok ? 100 : [80, 40, 80])
    } catch (err) {
      setScannerError(err.response?.data?.detail || 'No se pudo procesar el escaneo')
      setScannerResult(null)
    } finally {
      setScannerBusy(false)
    }
  }

  const startScanner = async () => {
    setScannerError('')
    setScannerResult(null)
    stopScanner()
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError('Este navegador no permite camara en vivo. Usa ingreso manual.')
      return
    }
    try {
      const videoConstraint = selectedCameraId
        ? { deviceId: { exact: selectedCameraId } }
        : { facingMode: { ideal: 'environment' } }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraint,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setScannerOpen(true)
      loadCameraDevices()

      // Helper: load jsQR dynamically as fallback when BarcodeDetector is unavailable
      const loadJsQR = () => new Promise((resolve, reject) => {
        if (window.jsQR) { resolve(window.jsQR); return }
        const s = document.createElement('script')
        s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
        s.onload = () => resolve(window.jsQR)
        s.onerror = () => reject(new Error('No se pudo cargar jsQR'))
        document.head.appendChild(s)
      })

      let jsQRLib = null
      let canvasEl = null
      let canvasCtx = null

      if ('BarcodeDetector' in window) {
        detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] })
      } else {
        try {
          jsQRLib = await loadJsQR()
          canvasEl = document.createElement('canvas')
          canvasCtx = canvasEl.getContext('2d')
          setScannerError('')
        } catch {
          setScannerError('No se pudo cargar el lector QR. Usa ingreso manual.')
          return
        }
      }

      const loop = async () => {
        if (!videoRef.current) return
        try {
          let raw = ''
          if (detectorRef.current) {
            const barcodes = await detectorRef.current.detect(videoRef.current)
            raw = String(barcodes?.[0]?.rawValue || '').trim()
          } else if (jsQRLib && canvasEl && canvasCtx) {
            const video = videoRef.current
            const w = video.videoWidth || 640
            const h = video.videoHeight || 480
            if (w > 0 && h > 0) {
              canvasEl.width = w
              canvasEl.height = h
              canvasCtx.drawImage(video, 0, 0, w, h)
              const imageData = canvasCtx.getImageData(0, 0, w, h)
              const code = jsQRLib(imageData.data, w, h, { inversionAttempts: 'dontInvert' })
              raw = String(code?.data || '').trim()
            }
          }
          const now = Date.now()
          if (raw && (!lastValueRef.current || raw !== lastValueRef.current || (now - lastTimeRef.current) > 1400)) {
            lastValueRef.current = raw
            lastTimeRef.current = now
            submitScan(raw)
          }
        } catch {
          // keep scanner loop alive
        } finally {
          rafRef.current = requestAnimationFrame(loop)
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    } catch (err) {
      setScannerError(err?.message || 'No se pudo iniciar camara.')
      stopScanner()
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#F5F7FA', fontWeight: 800, fontSize: 15 }}>
            <QrCode size={16} />
            Control de check-in
          </div>
          <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4 }}>
            Usa el QR que el atleta muestra en la app para registrar el ingreso oficial al evento.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-secondary btn-sm" type="button" onClick={loadPhases} disabled={loading || saving}>
            {loading ? 'Cargando...' : 'Recargar'}
          </button>
          <button className="btn-secondary btn-sm" type="button" onClick={openCreatePhaseModal}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} />
              Nueva etapa QR
            </span>
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {!phases.length && !loading ? <div style={{ color: '#AAB2C0', fontSize: 13 }}>No hay etapas QR configuradas.</div> : null}
        {systemPhase ? (
          <div style={{ border: '1px solid #252A33', borderRadius: 16, background: 'linear-gradient(180deg, rgba(23,27,33,0.98), rgba(13,15,18,0.92))', padding: isMobile ? 12 : 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 16 }}>Check-in de acceso</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ borderRadius: 999, border: `1px solid ${Number(systemPhase.enabled || 0) ? 'rgba(34,197,94,0.35)' : 'rgba(107,114,128,0.35)'}`, background: Number(systemPhase.enabled || 0) ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)', color: Number(systemPhase.enabled || 0) ? '#86EFAC' : '#AAB2C0', fontSize: 12, fontWeight: 800, padding: '6px 10px' }}>
                    {Number(systemPhase.enabled || 0) ? 'Check-in habilitado' : 'Check-in pausado'}
                  </span>
                  <span style={{ borderRadius: 999, border: '1px solid rgba(255,107,0,0.28)', background: 'rgba(255,107,0,0.12)', color: '#FFD0AE', fontSize: 12, fontWeight: 800, padding: '6px 10px' }}>
                    {`${Number(systemPhase.max_uses || 1)} ingreso por atleta`}
                  </span>
                </div>
                <div style={{ color: '#AAB2C0', fontSize: 13, lineHeight: 1.6 }}>
                  {systemPhase.description || 'Marca la llegada oficial al evento.'}
                </div>
                <div style={{ color: '#AAB2C0', fontSize: 12 }}>
                  El atleta abre la app, muestra su QR y el staff registra la entrada desde el escáner.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary btn-sm" type="button" onClick={() => openEditPhaseModal(systemPhase)} disabled={saving}>
                  Ajustes
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {extraPhases.length ? (
          <>
            <div style={{ color: '#AAB2C0', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Etapas QR adicionales
            </div>
            {extraPhases.map((phase) => (
              <div key={phase.id} style={{ border: '1px solid #252A33', borderRadius: 14, background: 'rgba(13,15,18,0.62)', padding: isMobile ? 10 : 12, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ color: '#F5F7FA', fontWeight: 700, fontSize: 14 }}>{phase.label || 'Etapa QR'}</div>
                    {phase.description ? <div style={{ color: '#AAB2C0', fontSize: 12 }}>{phase.description}</div> : null}
                    <div style={{ color: '#AAB2C0', fontSize: 12 }}>
                      {Number(phase.enabled || 0) ? 'Activa' : 'Pausada'} · {Number(phase.max_uses || 1)} uso{Number(phase.max_uses || 1) === 1 ? '' : 's'} por atleta
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-secondary btn-sm" type="button" onClick={() => openEditPhaseModal(phase)} disabled={saving}>
                      Editar
                    </button>
                    <button className="btn-danger btn-sm" type="button" onClick={() => deletePhase(phase)} disabled={saving}>
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : null}
      </div>

      <div style={{ border: '1px solid #252A33', borderRadius: 14, padding: isMobile ? 10 : 12, background: 'rgba(13,15,18,0.62)', display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#F5F7FA', fontWeight: 700, fontSize: 14 }}>Escaner de acceso</div>
            <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4 }}>Escanea el QR directamente desde el celular del atleta.</div>
          </div>
          <button
            className="btn-primary btn-sm"
            type="button"
            onClick={() => {
              setScannerError('')
              setScannerResult(null)
              setScannerModalOpen(true)
              loadCameraDevices()
            }}
          >
            Abrir scanner
          </button>
        </div>
        {scannerResult ? (
          <div
            style={{
              borderRadius: 12,
              border: `1px solid ${scannerResult.status === 'accepted' ? 'rgba(34,197,94,0.35)' : scannerResult.status === 'already_used' ? 'rgba(245,158,11,0.35)' : 'rgba(239,68,68,0.35)'}`,
              background: scannerResult.status === 'accepted' ? 'rgba(34,197,94,0.12)' : scannerResult.status === 'already_used' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
              padding: '10px 12px',
              color: '#F5F7FA',
              fontSize: 13,
            }}
          >
            Ultimo resultado: {scannerResult.text}{scannerResult.at ? ` · ${formatDate(scannerResult.at)}` : ''}
          </div>
        ) : null}
      </div>

      {phaseModalOpen ? (
        <Modal title={phaseModalMode === 'create' ? 'Nueva etapa QR' : editingSystemPhase ? 'Ajustes de check-in' : `Editar etapa ${editingPhase?.label || editingPhase?.code || ''}`} onClose={closePhaseModal} width={560}>
          <div style={{ display: 'grid', gap: 10 }}>
            {phaseModalMode === 'create' ? (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                <input
                  placeholder="codigo interno (ej: kit)"
                  value={phaseForm.code}
                  onChange={(e) => setPhaseForm(prev => ({ ...prev, code: e.target.value }))}
                />
                <input
                  placeholder="nombre visible"
                  value={phaseForm.label}
                  onChange={(e) => setPhaseForm(prev => ({ ...prev, label: e.target.value }))}
                />
              </div>
            ) : (
              <input
                placeholder="nombre visible"
                value={phaseForm.label}
                onChange={(e) => setPhaseForm(prev => ({ ...prev, label: e.target.value }))}
              />
            )}
            <input
              placeholder={editingSystemPhase ? 'Describe cuándo se usa este check-in' : 'descripcion (opcional)'}
              value={phaseForm.description}
              onChange={(e) => setPhaseForm(prev => ({ ...prev, description: e.target.value }))}
            />
            {editingSystemPhase ? (
              <>
                <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.68)', padding: '10px 12px', display: 'grid', gap: 4 }}>
                  <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 700 }}>Regla fija</div>
                  <div style={{ color: '#AAB2C0', fontSize: 12 }}>Cada atleta puede registrar su ingreso una sola vez.</div>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: 0, border: '1px solid #252A33', borderRadius: 6, padding: '10px 12px', background: '#171B21' }}>
                  <input
                    type="checkbox"
                    checked={!!phaseForm.enabled}
                    onChange={(e) => setPhaseForm(prev => ({ ...prev, enabled: e.target.checked ? 1 : 0 }))}
                    style={{ width: 'auto' }}
                  />
                  Permitir escaneos para el check-in
                </label>
              </>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 8 }}>
                <input
                  type="number"
                  min="0"
                  value={phaseForm.order_index}
                  onChange={(e) => setPhaseForm(prev => ({ ...prev, order_index: Number(e.target.value || 0) }))}
                  placeholder="orden"
                />
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={phaseForm.max_uses}
                  onChange={(e) => setPhaseForm(prev => ({ ...prev, max_uses: Number(e.target.value || 1) }))}
                  placeholder="usos permitidos"
                />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: 0, border: '1px solid #252A33', borderRadius: 6, padding: '8px 10px', background: '#171B21' }}>
                  <input
                    type="checkbox"
                    checked={!!phaseForm.enabled}
                    onChange={(e) => setPhaseForm(prev => ({ ...prev, enabled: e.target.checked ? 1 : 0 }))}
                    style={{ width: 'auto' }}
                  />
                  Habilitada
                </label>
              </div>
            )}
            {!editingSystemPhase && phaseModalMode !== 'create' ? (
              <div style={{ color: '#AAB2C0', fontSize: 12 }}>
                Codigo interno: <span style={{ color: '#F5F7FA' }}>{editingPhase?.code}</span>
              </div>
            ) : null}
            {phaseModalMode === 'create' ? (
              <div style={{ color: '#AAB2C0', fontSize: 12 }}>
                Usa etapas adicionales solo si necesitas registrar otro punto del evento además del ingreso principal.
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-secondary btn-sm" type="button" onClick={closePhaseModal}>Cancelar</button>
              <button className="btn-primary btn-sm" type="button" onClick={submitPhaseModal} disabled={saving}>
                {saving ? 'Guardando...' : editingSystemPhase ? 'Guardar ajustes' : phaseModalMode === 'create' ? 'Crear etapa' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {scannerModalOpen ? (
        <Modal title="Escaner QR" onClose={closeScannerModal} width={760}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
              {scannerPhaseOptions.length > 1 ? (
                <select value={scannerPhaseCode} onChange={(e) => setScannerPhaseCode(e.target.value)}>
                  {scannerPhaseOptions.map((phase) => (
                    <option key={phase.id} value={phase.code}>
                      {phase.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ border: '1px solid #252A33', borderRadius: 10, padding: '10px 12px', background: 'rgba(13,15,18,0.72)', color: '#F5F7FA', fontSize: 13, fontWeight: 700 }}>
                  {scannerTargetPhase?.label || 'Check-in'}
                </div>
              )}
              <input
                value={scannerStation}
                onChange={(e) => setScannerStation(e.target.value)}
                placeholder="Punto o puerta (opcional)"
              />
            </div>
            <div style={{ color: '#AAB2C0', fontSize: 12 }}>
              {scannerTargetPhase?.description || 'Escanea el QR mostrado en la app para registrar la llegada del atleta.'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto auto', gap: 8, alignItems: 'center' }}>
              <select value={selectedCameraId} onChange={(e) => setSelectedCameraId(e.target.value)}>
                <option value="">Camara por defecto</option>
                {cameraDevices.map((cam) => (
                  <option key={cam.id} value={cam.id}>{cam.label}</option>
                ))}
              </select>
              {!scannerOpen ? (
                <button className="btn-primary btn-sm" type="button" onClick={startScanner}>Iniciar camara</button>
              ) : (
                <button className="btn-secondary btn-sm" type="button" onClick={stopScanner}>Detener camara</button>
              )}
              <button className="btn-secondary btn-sm" type="button" onClick={loadCameraDevices}>Actualizar camaras</button>
            </div>
            {!supportsDetector ? <div style={{ color: '#8B9AAB', fontSize: 12 }}>Usando modo de compatibilidad (jsQR). El escaneo funciona normalmente.</div> : null}
            <div style={{ position: 'relative', borderRadius: 12, border: '1px solid #252A33', background: '#090B0E', overflow: 'hidden', minHeight: 220 }}>
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                style={{
                  width: '100%',
                  height: scannerOpen ? 'min(420px, 56vw)' : 0,
                  minHeight: scannerOpen ? 220 : 0,
                  objectFit: 'cover',
                  display: 'block',
                  background: '#090B0E',
                }}
              />
              {!scannerOpen ? (
                <div style={{ position: 'absolute', inset: 0, minHeight: 220, display: 'grid', placeItems: 'center', color: '#AAB2C0', fontSize: 13 }}>
                  Camara detenida
                </div>
              ) : null}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', gap: 8 }}>
              <input
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Pegar token QR manual (fallback)"
              />
              <button
                className="btn-secondary btn-sm"
                type="button"
                onClick={() => submitScan(manualToken)}
                disabled={!String(manualToken || '').trim() || scannerBusy}
              >
                {scannerBusy ? 'Procesando...' : 'Procesar token'}
              </button>
            </div>
            {scannerResult ? (
              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${scannerResult.status === 'accepted' ? 'rgba(34,197,94,0.35)' : scannerResult.status === 'already_used' ? 'rgba(245,158,11,0.35)' : 'rgba(239,68,68,0.35)'}`,
                  background: scannerResult.status === 'accepted' ? 'rgba(34,197,94,0.12)' : scannerResult.status === 'already_used' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                  padding: '10px 12px',
                  color: '#F5F7FA',
                  fontSize: 13,
                }}
              >
                {scannerResult.text}{scannerResult.at ? ` · ${formatDate(scannerResult.at)}` : ''}
              </div>
            ) : null}
            {scannerError ? <div style={{ color: '#EF4444', fontSize: 13 }}>{scannerError}</div> : null}
          </div>
        </Modal>
      ) : null}
      {msg ? <div className={`alert alert-${msg.type}`} style={{ margin: 0 }}>{msg.text}</div> : null}
    </div>
  )
}
function QuickCompetitionCreateModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    const trimmedName = String(name || '').trim()
    if (!trimmedName) {
      setMsg({ type: 'error', text: 'El nombre es obligatorio' })
      return
    }

    setSaving(true)
    setMsg(null)
    try {
      const { data } = await api.post('/competitions', {
        nombre: trimmedName,
        scoring_mode: 'highest_wins',
      })
      onCreated(data)
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo crear la competencia' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Nueva competencia"
      onClose={onClose}
      width={480}
      panelStyle={{
        background: '#171b21',
        border: '1px solid #252a33',
        borderRadius: 22,
        boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
      }}
      titleStyle={{ color: 'var(--oa-text)', fontSize: 18, fontWeight: 800 }}
      closeButtonStyle={{
        width: 34,
        height: 34,
        borderRadius: 12,
        border: '1px solid #252a33',
        background: 'transparent',
        color: 'var(--oa-text)',
        justifyContent: 'center',
        padding: 0,
      }}
    >
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Nombre</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. FinalRep Summer Throwdown"
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Creando...' : 'Crear'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CompetitionEditorModal({ mode, competition, onClose, onSaved, inline = false }) {
  const isEdit = mode === 'edit'
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    general_info_text: '',
    lugar: '',
    contact_phone: '',
    contact_phone_prefix: '+57',
    website_url: '',
    theme_background_color: '',
    theme_surface_color: '',
    theme_primary_color: '',
    theme_accent_color: '',
    imagen_url: '',
    activa: 0,
    individual_enabled: 1,
    team_enabled: 0,
    team_categories_enabled: 1,
    team_size: 2,
    team_membership_rule: 'free',
    allow_user_results: 0,
    show_individual_leaderboard: 1,
    show_public_category_roster: 0,
    show_team_all_by_category_option: 1,
    show_team_all_global_option: 1,
    enrollment_open: 0,
    enrollment_start: '',
    enrollment_end: '',
    competition_start: '',
    competition_end: '',
    enrollment_intro_text: '',
    enrollment_terms_text: '',
    platform_fee_rate: 0.05,
    scoring_mode: 'highest_wins',
    rm_unit: 'kg',
  })
  const [cats, setCats] = useState([])
  const [newCat, setNewCat] = useState({ nombre: '', descripcion: '', modality: 'individual', enrollment_price: 0 })
  const [phases, setPhases] = useState([])
  const [newPhase, setNewPhase] = useState({ nombre: '', block_name: '', modality: 'individual', measurement_method: 'for_time', descripcion: '', team_result_mode: 'sum_two', is_visible: 1, start_at: '', end_at: '', time_cap: '', part_b_enabled: false, part_b_descripcion: '', part_b_time_cap: '', part_b_measurement_method: 'for_time' })
  const [questions, setQuestions] = useState([])
  const [questionDraft, setQuestionDraft] = useState({ label: '', field_type: 'text', required: 0, placeholder: '' })
  const [scheduleItems, setScheduleItems] = useState([])
  const [socialLinks, setSocialLinks] = useState([])
  const [landingSections, setLandingSections] = useState(() => parseLandingSections(null))
  const [assetFiles, setAssetFiles] = useState({ profile: null, banner: null })
  const [assetPreviews, setAssetPreviews] = useState({ profile: '', banner: '' })
  const [uploadingAssets, setUploadingAssets] = useState(false)
  const [deletingAssetKey, setDeletingAssetKey] = useState('')
  const [showThemePreview, setShowThemePreview] = useState(false)
  const [editorStep, setEditorStep] = useState(0)
  const [expandedExtras, setExpandedExtras] = useState({
    basics: false,
    registration: false,
  })
  const [showPhonePrefixDropdown, setShowPhonePrefixDropdown] = useState(false)
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [showAddQuestionModal, setShowAddQuestionModal] = useState(false)
  const [editingQuestionId, setEditingQuestionId] = useState(null)
  const [showAddPhaseModal, setShowAddPhaseModal] = useState(false)
  const [editingPhaseId, setEditingPhaseId] = useState(null)
  const [showAddScheduleModal, setShowAddScheduleModal] = useState(false)
  const [editingScheduleId, setEditingScheduleId] = useState(null)
  const [scheduleDraft, setScheduleDraft] = useState({ label: '', kind: 'custom', start_at: '', end_at: '', phase_id: '', use_phase_dates: 0, note: '' })
  const [showAddSocialModal, setShowAddSocialModal] = useState(false)
  const [editingSocialId, setEditingSocialId] = useState(null)
  const [socialDraft, setSocialDraft] = useState({ platform: 'instagram', custom_label: '', url: '' })
  const [newPhaseCatOverrides, setNewPhaseCatOverrides] = useState({})
  const [globalPricingConfig, setGlobalPricingConfig] = useState(null)
  const effectivePlatformFeeRate = Number(globalPricingConfig?.default_platform_fee_rate || form.platform_fee_rate || 0.05)

  useEffect(() => {
    if (!isEdit || !competition) return
    const applyCompetitionData = (source) => {
      setForm({
        nombre: source.nombre || '',
        descripcion: source.descripcion || '',
        general_info_text: source.general_info_text || '',
        lugar: source.lugar || '',
        contact_phone: source.contact_phone || '',
        contact_phone_prefix: (source.contact_phone || '').match(/^(\+\d+)/)?.[1] || '+57',
        website_url: source.website_url || '',
        theme_background_color: source.theme_background_color || '',
        theme_surface_color: source.theme_surface_color || '',
        theme_primary_color: source.theme_primary_color || '',
        theme_accent_color: source.theme_accent_color || '',
        imagen_url: source.imagen_url || '',
        activa: source.activa || 0,
        individual_enabled: source.individual_enabled == null ? 1 : source.individual_enabled,
        team_enabled: source.team_enabled || 0,
        team_categories_enabled: source.team_categories_enabled == null ? 1 : source.team_categories_enabled,
        team_size: Math.max(1, Number(source.team_size || 2)),
        team_membership_rule: source.team_membership_rule || 'free',
        allow_user_results: source.allow_user_results || 0,
        show_individual_leaderboard: source.show_individual_leaderboard == null ? 1 : source.show_individual_leaderboard,
        show_public_category_roster: source.show_public_category_roster == null ? 0 : source.show_public_category_roster,
        show_team_all_by_category_option: source.show_team_all_by_category_option == null ? 1 : source.show_team_all_by_category_option,
        show_team_all_global_option: source.show_team_all_global_option == null ? 1 : source.show_team_all_global_option,
        enrollment_open: source.enrollment_open || 0,
        enrollment_start: toDateInput(source.enrollment_start),
        enrollment_end: toDateInput(source.enrollment_end),
        competition_start: toDateInput(source.competition_start),
        competition_end: toDateInput(source.competition_end),
        enrollment_intro_text: source.enrollment_intro_text || '',
        enrollment_terms_text: source.enrollment_terms_text || '',
        platform_fee_rate: Number(source.platform_fee_rate || 0.05),
        scoring_mode: source.scoring_mode || 'highest_wins',
        rm_unit: source.rm_unit === 'lb' ? 'lb' : 'kg',
      })
      setQuestions(parseEnrollmentQuestions(source.enrollment_questions))
      setScheduleItems(parseScheduleItems(source.schedule_items))
      setSocialLinks(parseSocialLinks(source.social_links))
      setLandingSections(parseLandingSections(source.landing_sections))
      setAssetFiles({ profile: null, banner: null })
      setAssetPreviews({ profile: '', banner: '' })
    }

    applyCompetitionData(competition)

    Promise.all([
      api.get(`/competitions/${competition.id}`),
      api.get(`/competitions/${competition.id}/categories`),
      api.get(`/competitions/${competition.id}/phases`),
    ]).then(([competitionRes, catRes, phRes]) => {
      if (competitionRes?.data) applyCompetitionData(competitionRes.data)
      setCats(catRes.data.map(c => ({
        id: c.id,
        nombre: c.nombre,
        descripcion: c.descripcion || '',
        modality: c.modality || 'individual',
        enrollment_price: normalizeEnrollmentPrice(c.enrollment_price),
      })))
      setPhases(phRes.data.map(p => {
        const activities = Array.isArray(p.activities) ? p.activities : []
        const baseActivities = normalizePhaseActivities(activities, p)
        const categoryEntries = activities.filter(activity => activity && activity._cat)
        const secondBaseActivity = baseActivities[1] || null
        const categoryOverrides = categoryEntries.reduce((acc, activity) => {
          acc[String(activity._cat)] = {
            modified: true,
            text: activity.descripcion || '',
            time_cap: activity.time_cap ? String(Math.round(Number(activity.time_cap) / 60)) : '',
            part_b_text: activity.part_b_descripcion || '',
            part_b_time_cap: activity.part_b_time_cap ? String(Math.round(Number(activity.part_b_time_cap) / 60)) : '',
          }
          return acc
        }, {})
        return {
          id: p.id,
          modality: p.modality || 'individual',
          block_name: p.block_name || '',
          block_order: Number(p.block_order || 0),
          nombre: p.nombre,
          measurement_method: normalizeMeasurementMethod(p.measurement_method, p.tipo),
          tipo: phaseTypeFromMethod(normalizeMeasurementMethod(p.measurement_method, p.tipo)),
          descripcion: baseActivities[0]?.descripcion || p.descripcion || '',
          team_result_mode: p.team_result_mode || 'sum_two',
          is_visible: p.is_visible == null ? 1 : Number(p.is_visible),
          start_at: toDateInput(p.start_at),
          end_at: toDateInput(p.end_at),
          activities: baseActivities,
          part_b_enabled: baseActivities.length > 1,
          part_b_descripcion: secondBaseActivity?.descripcion || '',
          part_b_measurement_method: secondBaseActivity?.measurement_method || 'for_time',
          time_cap: baseActivities[0]?.time_cap ? String(Math.round(Number(baseActivities[0].time_cap) / 60)) : '',
          part_b_time_cap: secondBaseActivity?.time_cap ? String(Math.round(Number(secondBaseActivity.time_cap) / 60)) : '',
          catOverrides: categoryOverrides,
        }
      }))
    }).catch(() => {
      setMsg({ type: 'error', text: 'No se pudo cargar la configuracion actual' })
    })
  }, [isEdit, competition?.id])

  useEffect(() => {
    api.get('/config/pricing').then(({ data }) => setGlobalPricingConfig(data)).catch(() => {})
  }, [])
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => {
    if (!showPhonePrefixDropdown) return
    const close = () => setShowPhonePrefixDropdown(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showPhonePrefixDropdown])
  useEffect(() => {
    setEditorStep(0)
    setExpandedExtras({
      basics: false,
      registration: false,
    })
    setShowAddCategoryModal(false)
    setEditingCategoryId(null)
    setShowAddQuestionModal(false)
    setEditingQuestionId(null)
    setQuestionDraft({ label: '', field_type: 'text', required: 0, placeholder: '' })
    setShowAddPhaseModal(false)
    setEditingPhaseId(null)
    setShowAddScheduleModal(false)
    setEditingScheduleId(null)
    setScheduleDraft({ label: '', kind: 'custom', start_at: '', end_at: '', phase_id: '', use_phase_dates: 0, note: '' })
    setShowAddSocialModal(false)
    setEditingSocialId(null)
    setSocialDraft({ platform: 'instagram', custom_label: '', url: '' })
  }, [competition?.id, isEdit])
  const previewTheme = useMemo(() => resolveCompetitionTheme(form), [form])

  const addCategory = () => {
    const nombre = newCat.nombre.trim()
    const descripcion = (newCat.descripcion || '').trim()
    if (!nombre) return false
    setCats(prev => [...prev, { id: `new-cat-${Date.now()}`, nombre, descripcion, modality: newCat.modality || 'individual', enrollment_price: normalizeEnrollmentPrice(newCat.enrollment_price) }])
    setNewCat({ nombre: '', descripcion: '', modality: newCat.modality || 'individual', enrollment_price: 0 })
    return true
  }

  const removeCategory = (id) => {
    setCats(prev => prev.filter(c => c.id !== id))
  }

  const updateCategoryName = (id, value) => {
    setCats(prev => prev.map(c => (c.id === id ? { ...c, nombre: value } : c)))
  }

  const updateCategoryDescription = (id, value) => {
    setCats(prev => prev.map(c => (c.id === id ? { ...c, descripcion: value } : c)))
  }

  const updateCategoryModality = (id, value) => {
    setCats(prev => prev.map(c => (c.id === id ? { ...c, modality: value } : c)))
  }

  const updateCategoryPrice = (id, value) => {
    setCats(prev => prev.map(c => (c.id === id ? { ...c, enrollment_price: value } : c)))
  }

  const updateLandingSectionField = (field, value) => {
    setLandingSections(prev => ({ ...prev, [field]: value }))
  }

  const updateLandingSectionItem = (sectionKey, index, field, value) => {
    setLandingSections(prev => ({
      ...prev,
      [sectionKey]: prev[sectionKey].map((item, itemIdx) => (
        itemIdx === index ? { ...item, [field]: value } : item
      )),
    }))
  }

  const addLandingSectionItem = (sectionKey) => {
    setLandingSections(prev => ({
      ...prev,
      [sectionKey]: [...prev[sectionKey], { title: '', body: '' }],
    }))
  }

  const removeLandingSectionItem = (sectionKey, index) => {
    setLandingSections(prev => ({
      ...prev,
      [sectionKey]: prev[sectionKey].filter((_, itemIdx) => itemIdx !== index),
    }))
  }

  const addPhase = () => {
    const nombre = newPhase.nombre.trim()
    if (!nombre) return false
    setPhases(prev => [...prev, {
      id: `new-phase-${Date.now()}`,
      modality: newPhase.modality || 'individual',
      block_name: (newPhase.block_name || '').trim(),
      block_order: prev.length,
      tipo: phaseTypeFromMethod(newPhase.measurement_method),
      nombre,
      measurement_method: newPhase.measurement_method,
      descripcion: newPhase.descripcion.trim(),
      team_result_mode: newPhase.team_result_mode,
      is_visible: Number(newPhase.is_visible == null ? 1 : newPhase.is_visible) ? 1 : 0,
      start_at: newPhase.start_at || '',
      end_at: newPhase.end_at || '',
      catOverrides: newPhaseCatOverrides,
    }])
    setNewPhase(prev => ({ ...prev, nombre: '', block_name: prev.block_name || '', measurement_method: 'for_time', descripcion: '', team_result_mode: 'sum_two', is_visible: 1, start_at: '', end_at: '', time_cap: '', part_b_enabled: false, part_b_descripcion: '', part_b_time_cap: '', part_b_measurement_method: 'for_time' }))
    setNewPhaseCatOverrides({})
    return true
  }

  const removePhase = (id) => {
    setPhases(prev => prev.filter(p => p.id !== id))
  }

  const updatePhase = (id, field, value) => {
    setPhases(prev => prev.map(p => (p.id === id ? { ...p, [field]: value } : p)))
  }

  const save = async (e) => {
    e.preventDefault()
    setMsg(null)
    if (!form.nombre.trim()) {
      setMsg({ type: 'error', text: 'El nombre es obligatorio' })
      return
    }
    if (form.enrollment_start && form.enrollment_end && form.enrollment_start > form.enrollment_end) {
      setMsg({ type: 'error', text: 'La fecha de inicio no puede ser mayor a la de cierre' })
      return
    }
    if (form.competition_start && form.competition_end && form.competition_start > form.competition_end) {
      setMsg({ type: 'error', text: 'La fecha inicial de la competencia no puede ser mayor a la final' })
      return
    }

    const cleanCats = cats
      .map(c => ({
        id: c.id,
        nombre: String(c.nombre || '').trim(),
        descripcion: String(c.descripcion || '').trim(),
        modality: c.modality === 'teams' ? 'teams' : 'individual',
        enrollment_price: normalizeEnrollmentPrice(c.enrollment_price),
      }))
      .filter(c => c.nombre)
    const cleanPhases = phases
      .map((p, idx) => ({
        ...p,
        nombre: p.nombre.trim(),
        descripcion: (p.descripcion || '').trim(),
        modality: p.modality === 'teams' ? 'teams' : 'individual',
        block_name: (p.block_name || '').trim() || null,
        block_order: Number.isFinite(Number(p.block_order)) ? Number(p.block_order) : idx,
      }))
      .filter(p => p.nombre)
    const cleanScheduleItems = scheduleItems
      .map((item, idx) => ({
        id: String(item.id || `date_${idx + 1}`),
        label: String(item.label || '').trim(),
        kind: String(item.kind || 'custom').trim().toLowerCase() || 'custom',
        phase_id: item.phase_id ? Number(item.phase_id) : null,
        use_phase_dates: item.phase_id && item.use_phase_dates ? 1 : 0,
        start_at: item.phase_id && item.use_phase_dates
          ? dateInputToStartOfDay(cleanPhases.find(phase => String(phase.id) === String(item.phase_id))?.start_at)
          : dateInputToStartOfDay(item.start_at),
        end_at: item.phase_id && item.use_phase_dates
          ? dateInputToEndOfDay(cleanPhases.find(phase => String(phase.id) === String(item.phase_id))?.end_at)
          : dateInputToEndOfDay(item.end_at),
        note: String(item.note || '').trim() || null,
      }))
      .filter(item => item.label || item.start_at || item.end_at || item.note || item.phase_id)
    const cleanSocialLinks = socialLinks
      .map((item, idx) => ({
        id: String(item.id || `social_${idx + 1}`),
        label: item.platform === 'other'
          ? String(item.custom_label || '').trim()
          : (SOCIAL_PLATFORM_OPTIONS.find(option => option.value === item.platform)?.label || ''),
        url: String(item.url || '').trim(),
      }))
      .filter(item => item.label || item.url)

    const invalidScheduleItem = cleanScheduleItems.find(item => item.start_at && item.end_at && item.start_at > item.end_at)
    if (invalidScheduleItem) {
      setMsg({ type: 'error', text: `La fecha inicial no puede ser mayor a la final en "${invalidScheduleItem.label || 'hito'}"` })
      return
    }

    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      general_info_text: form.general_info_text.trim() || null,
      lugar: form.lugar.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      website_url: form.website_url.trim() || null,
      theme_background_color: normalizeHexColor(form.theme_background_color) || null,
      theme_surface_color: normalizeHexColor(form.theme_surface_color) || null,
      theme_primary_color: normalizeHexColor(form.theme_primary_color) || null,
      theme_accent_color: normalizeHexColor(form.theme_accent_color) || null,
      social_links: cleanSocialLinks,
      imagen_url: form.imagen_url.trim() || null,
      activa: form.activa ? 1 : 0,
      individual_enabled: form.individual_enabled ? 1 : 0,
      team_enabled: form.team_enabled ? 1 : 0,
      team_categories_enabled: form.team_categories_enabled ? 1 : 0,
      team_size: Math.max(1, Number(form.team_size || 2)),
      team_membership_rule: form.team_membership_rule === 'same_category' ? 'same_category' : 'free',
      allow_user_results: form.allow_user_results ? 1 : 0,
      show_individual_leaderboard: form.show_individual_leaderboard ? 1 : 0,
      show_public_category_roster: form.show_public_category_roster ? 1 : 0,
      show_team_all_by_category_option: form.show_team_all_by_category_option ? 1 : 0,
      show_team_all_global_option: form.show_team_all_global_option ? 1 : 0,
      enrollment_open: form.enrollment_open ? 1 : 0,
      enrollment_start: dateInputToStartOfDay(form.enrollment_start),
      enrollment_end: dateInputToEndOfDay(form.enrollment_end),
      competition_start: dateInputToStartOfDay(form.competition_start),
      competition_end: dateInputToEndOfDay(form.competition_end),
      schedule_items: cleanScheduleItems,
      landing_sections: {
        experience: {
          title: String(landingSections.experience_title || '').trim() || null,
          intro: String(landingSections.experience_intro || '').trim() || null,
          items: landingSections.experience_items
            .map((item, idx) => ({
              id: `exp_${idx + 1}`,
              title: String(item.title || '').trim(),
              body: String(item.body || '').trim(),
            }))
            .filter(item => item.title || item.body),
        },
        format: {
          title: String(landingSections.format_title || '').trim() || null,
          items: landingSections.format_items
            .map((item, idx) => ({
              id: `fmt_${idx + 1}`,
              title: String(item.title || '').trim(),
              body: String(item.body || '').trim(),
            }))
            .filter(item => item.title || item.body),
        },
        highlights: {
          title: String(landingSections.highlights_title || '').trim() || null,
          items: landingSections.highlights_items
            .map((item, idx) => ({
              id: `hl_${idx + 1}`,
              title: String(item.title || '').trim(),
              body: String(item.body || '').trim(),
            }))
            .filter(item => item.title || item.body),
        },
      },
      enrollment_terms_text: form.enrollment_terms_text.trim() || null,
      rm_unit: form.rm_unit === 'lb' ? 'lb' : 'kg',
      enrollment_questions: questions
        .map((question, idx) => ({
          id: String(question.id || `q_${idx + 1}`),
          label: String(question.label || '').trim(),
          field_type: question.field_type === 'image' ? 'image' : question.field_type === 'number' ? 'number' : 'text',
          required: question.required ? 1 : 0,
          placeholder: String(question.placeholder || '').trim() || null,
        }))
        .filter(question => question.label),
      scoring_mode: form.scoring_mode || 'highest_wins',
    }

    setSaving(true)
    try {
      let competitionId = competition?.id
      let createdCompetition = false
      if (isEdit) {
        await api.put(`/competitions/${competition.id}`, payload)
      } else {
        const { data } = await api.post('/competitions', payload)
        competitionId = data.id
        createdCompetition = true
      }

      if (competitionId) {
        await uploadCompetitionAssets(competitionId)
      }

      try {
        const existingCats = isEdit ? (await api.get(`/competitions/${competitionId}/categories`)).data : []
        const persistedCatsById = new Map(existingCats.map(cat => [String(cat.id), cat]))
        const nextCategoryIdByLocalId = {}

        const catsToDelete = existingCats.filter(cat => !cleanCats.some(localCat => String(localCat.id) === String(cat.id)))
        for (const cat of catsToDelete) {
          await api.delete(`/competitions/${competitionId}/categories/${cat.id}`)
        }

        for (let i = 0; i < cleanCats.length; i += 1) {
          const localCat = cleanCats[i]
          const payload = {
            nombre: localCat.nombre,
            descripcion: localCat.descripcion || null,
            modality: localCat.modality,
            enrollment_price: localCat.enrollment_price,
            orden: i,
          }
          if (persistedCatsById.has(String(localCat.id))) {
            const persisted = persistedCatsById.get(String(localCat.id))
            await api.put(`/competitions/${competitionId}/categories/${persisted.id}`, payload)
            nextCategoryIdByLocalId[String(localCat.id)] = persisted.id
          } else {
            const { data: createdCat } = await api.post(`/competitions/${competitionId}/categories`, payload)
            nextCategoryIdByLocalId[String(localCat.id)] = createdCat.id
          }
        }

        const existingPhases = isEdit ? (await api.get(`/competitions/${competitionId}/phases`)).data : []
        const localIds = new Set(cleanPhases.filter(p => Number.isInteger(p.id)).map(p => p.id))
        for (const existing of existingPhases) {
          if (!localIds.has(existing.id)) {
            await api.delete(`/competitions/${competitionId}/phases/${existing.id}`)
          }
        }
        for (let i = 0; i < cleanPhases.length; i += 1) {
          const phase = cleanPhases[i]
          const remappedCatOverrides = Object.fromEntries(
            Object.entries(phase.catOverrides || {}).map(([catId, override]) => [
              String(nextCategoryIdByLocalId[String(catId)] || catId),
              override,
            ])
          )
          const phasePayload = {
            ...buildPhasePayloadWithCategoryOverrides(
              { ...phase, catOverrides: remappedCatOverrides },
              cleanCats.map(cat => ({ ...cat, id: nextCategoryIdByLocalId[String(cat.id)] || cat.id })),
              i
            ),
            nombre: phase.nombre,
            modality: phase.modality,
            block_name: phase.block_name,
            block_order: Number(phase.block_order || i),
            team_result_mode: phase.team_result_mode || 'sum_two',
            start_at: dateInputToStartOfDay(phase.start_at),
            end_at: dateInputToEndOfDay(phase.end_at),
            orden: i,
          }
          if (Number.isInteger(phase.id)) {
            await api.put(`/competitions/${competitionId}/phases/${phase.id}`, phasePayload)
          } else {
            await api.post(`/competitions/${competitionId}/phases`, phasePayload)
          }
        }
      } catch (syncErr) {
        if (createdCompetition) {
          const detail = syncErr.response?.data?.detail || 'no se pudieron guardar todas las categorias o eventos'
          onSaved(`Competencia creada, pero ${detail}`)
          if (!inline) onClose()
          return
        }
        throw syncErr
      }

      onSaved(isEdit ? 'Competencia actualizada' : 'Competencia creada')
      if (!inline || !isEdit) onClose()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo guardar la competencia' })
    } finally {
      setSaving(false)
    }
  }

  const sectionStyle = {
    border: '1px solid #252A33',
    borderRadius: 18,
    padding: isMobile ? 14 : 18,
    background: 'linear-gradient(180deg, rgba(214,217,224,0.08) 0%, rgba(23,27,33,0.98) 24%, rgba(9,11,14,0.98) 100%)',
    marginBottom: 14,
  }
  const sectionTitleStyle = {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--oa-text)',
  }
  const sectionHintStyle = {
    marginTop: 4,
    fontSize: 12,
    color: 'var(--oa-text-secondary)',
    lineHeight: 1.5,
  }
  const listItemStyle = {
    display: 'grid',
    gap: 8,
    alignItems: 'center',
    padding: isMobile ? '10px 12px' : '12px 14px',
    borderRadius: 14,
    border: '1px solid #252A33',
    background: 'rgba(13,15,18,0.82)',
    marginBottom: 8,
  }
  const toggleCardStyle = (enabled) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    width: '100%',
    padding: '14px 16px',
    borderRadius: 16,
    border: `1px solid ${enabled ? 'rgba(214,217,224,0.45)' : '#252A33'}`,
    background: enabled ? 'linear-gradient(135deg, rgba(214,217,224,0.14), rgba(241,244,248,0.04))' : 'rgba(13,15,18,0.72)',
    color: 'var(--oa-text)',
    textAlign: 'left',
    cursor: 'pointer',
  })
  const toggleTrackStyle = (enabled) => ({
    width: 50,
    height: 30,
    borderRadius: 999,
    background: enabled ? 'linear-gradient(135deg, #D6D9E0 0%, #F1F4F8 100%)' : '#252a33',
    border: `1px solid ${enabled ? 'rgba(241,244,248,0.95)' : '#313844'}`,
    padding: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: enabled ? 'flex-end' : 'flex-start',
    flexShrink: 0,
    transition: 'all 0.2s ease',
  })
  const sectionRowLabelStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    color: 'var(--oa-text-secondary)',
    fontSize: 12,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  }
  const modeChipBaseStyle = SHARED_MODE_CHIP_BASE_STYLE
  const setupSteps = [
    { id: 'basics', label: 'Base', hint: 'Nombre, sede y portada' },
    { id: 'registration', label: 'Registro', hint: 'Apertura, reglas y preguntas' },
    { id: 'divisions', label: 'Divisiones', hint: 'Categorias y precios' },
    { id: 'events', label: 'Eventos', hint: 'Bloques y pruebas' },
  ]
  useEffect(() => {
    setEditorStep(prev => Math.min(prev, setupSteps.length - 1))
  }, [setupSteps.length])
  const activeStep = setupSteps[Math.min(editorStep, setupSteps.length - 1)]
  const canGoNextStep = [
    !!form.nombre.trim(),
    true,
    true,
    true,
  ][Math.min(editorStep, 3)]
  const setExtraExpanded = (key) => {
    setExpandedExtras(prev => ({ ...prev, [key]: !prev[key] }))
  }
  const extraToggleStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    width: '100%',
    padding: '12px 14px',
    borderRadius: 14,
    border: '1px solid #252A33',
    background: 'rgba(13,15,18,0.72)',
    color: '#F5F7FA',
    fontSize: 13,
    fontWeight: 700,
    textAlign: 'left',
  }
  const toggleThumbStyle = {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: '#F5F7FA',
    boxShadow: '0 4px 12px rgba(0,0,0,0.22)',
  }
  const renderToggleCard = ({ label, hint, enabled, onClick, enabledText = 'Activo', disabledText = 'Inactivo' }) => (
    <button type="button" onClick={onClick} style={toggleCardStyle(enabled)}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--oa-text)', fontSize: 14, fontWeight: 800 }}>{label}</div>
        <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>{hint}</div>
        <div style={{ color: enabled ? '#FFB36F' : '#7E8796', fontSize: 11, marginTop: 8, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          {enabled ? enabledText : disabledText}
        </div>
      </div>
      <span aria-hidden="true" style={toggleTrackStyle(enabled)}>
        <span style={toggleThumbStyle} />
      </span>
    </button>
  )
  const updateQuestion = (id, field, value) => {
    setQuestions(prev => prev.map(question => question.id === id ? { ...question, [field]: value } : question))
  }
  const addQuestion = () => {
    const item = { id: `q_${Date.now()}`, label: '', field_type: 'text', required: 0, placeholder: '' }
    setQuestions(prev => [...prev, item])
    return item
  }
  const createQuestionFromDraft = () => {
    const label = String(questionDraft.label || '').trim()
    if (!label) return false
    setQuestions(prev => [...prev, {
      id: `q_${Date.now()}`,
      label,
      field_type: questionDraft.field_type || 'text',
      required: questionDraft.required ? 1 : 0,
      placeholder: String(questionDraft.placeholder || '').trim(),
    }])
    setQuestionDraft({ label: '', field_type: 'text', required: 0, placeholder: '' })
    return true
  }
  const removeQuestion = (id) => {
    setQuestions(prev => prev.filter(question => question.id !== id))
  }
  const updateScheduleItem = (id, field, value) => {
    setScheduleItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item))
  }
  const resolvePhaseDates = (phaseId) => {
    const phase = phases.find(item => String(item.id) === String(phaseId))
    return {
      start_at: phase?.start_at || '',
      end_at: phase?.end_at || '',
    }
  }
  const linkScheduleItemToPhase = (id, phaseId) => {
    setScheduleItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const nextPhaseId = phaseId || ''
      const next = { ...item, phase_id: nextPhaseId }
      if (!nextPhaseId) {
        next.use_phase_dates = 0
        return next
      }
      if (next.use_phase_dates) {
        const phaseDates = resolvePhaseDates(nextPhaseId)
        next.start_at = phaseDates.start_at
        next.end_at = phaseDates.end_at
      }
      return next
    }))
  }
  const toggleScheduleItemPhaseDates = (id) => {
    setScheduleItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const enabled = item.phase_id && !item.use_phase_dates ? 1 : 0
      if (!enabled) return { ...item, use_phase_dates: 0 }
      const phaseDates = resolvePhaseDates(item.phase_id)
      return {
        ...item,
        use_phase_dates: 1,
        start_at: phaseDates.start_at,
        end_at: phaseDates.end_at,
      }
    }))
  }
  useEffect(() => {
    setScheduleItems(prev => prev.map(item => {
      if (!item.phase_id || !item.use_phase_dates) return item
      const phaseDates = resolvePhaseDates(item.phase_id)
      return {
        ...item,
        start_at: phaseDates.start_at,
        end_at: phaseDates.end_at,
      }
    }))
  }, [phases])
  const createScheduleItemFromDraft = () => {
    const hasContent = scheduleDraft.label || scheduleDraft.start_at || scheduleDraft.end_at || scheduleDraft.note || scheduleDraft.phase_id
    if (!hasContent) return false
    const next = {
      id: `date_${Date.now()}`,
      label: String(scheduleDraft.label || '').trim(),
      kind: scheduleDraft.kind || 'custom',
      start_at: scheduleDraft.start_at || '',
      end_at: scheduleDraft.end_at || '',
      phase_id: scheduleDraft.phase_id || '',
      use_phase_dates: scheduleDraft.phase_id && scheduleDraft.use_phase_dates ? 1 : 0,
      note: String(scheduleDraft.note || '').trim(),
    }
    if (next.phase_id && next.use_phase_dates) {
      const phaseDates = resolvePhaseDates(next.phase_id)
      next.start_at = phaseDates.start_at
      next.end_at = phaseDates.end_at
    }
    setScheduleItems(prev => [...prev, next])
    setScheduleDraft({ label: '', kind: 'custom', start_at: '', end_at: '', phase_id: '', use_phase_dates: 0, note: '' })
    return true
  }
  const removeScheduleItem = (id) => {
    setScheduleItems(prev => prev.filter(item => item.id !== id))
  }
  const visibleScheduleItems = useMemo(
    () => scheduleItems.filter(item => item.label || item.start_at || item.end_at || item.note || item.phase_id),
    [scheduleItems]
  )
  const visibleScheduleSummary = useMemo(() => {
    if (!visibleScheduleItems.length) return 'Sin fechas visibles.'
    if (visibleScheduleItems.length === 1) return '1 fecha visible configurada.'
    return `${visibleScheduleItems.length} fechas visibles configuradas.`
  }, [visibleScheduleItems])
  const getScheduleKindLabel = (kind) => ({
    custom: 'Personalizada',
    enrollment_start: 'Apertura inscripciones',
    enrollment_end: 'Cierre inscripciones',
    competition_start: 'Inicio competencia',
    competition_end: 'Fin competencia',
    competition_day: 'Dia de competencia',
  }[kind] || 'Personalizada')
  const formatScheduleDate = (value) => {
    if (!value) return 'Pendiente'
    try {
      return new Date(`${value}T00:00:00`).toLocaleDateString('es-CO', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return value
    }
  }
  const getScheduleRangeLabel = (item) => {
    if (item.start_at && item.end_at) return `${formatScheduleDate(item.start_at)} - ${formatScheduleDate(item.end_at)}`
    if (item.start_at) return `Desde ${formatScheduleDate(item.start_at)}`
    if (item.end_at) return `Hasta ${formatScheduleDate(item.end_at)}`
    return 'Sin rango definido'
  }
  const updateSocialLink = (id, field, value) => {
    setSocialLinks(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item))
  }
  const createSocialLinkFromDraft = () => {
    const url = String(socialDraft.url || '').trim()
    const customLabel = String(socialDraft.custom_label || '').trim()
    if (!url) return false
    if (socialDraft.platform === 'other' && !customLabel) return false
    setSocialLinks(prev => [...prev, {
      id: `social_${Date.now()}`,
      platform: socialDraft.platform || 'instagram',
      custom_label: customLabel,
      url,
    }])
    setSocialDraft({ platform: socialDraft.platform || 'instagram', custom_label: '', url: '' })
    return true
  }
  const removeSocialLink = (id) => {
    setSocialLinks(prev => prev.filter(item => item.id !== id))
  }
  const setCompetitionAssetFile = (assetType, file) => {
    setAssetFiles(prev => ({ ...prev, [assetType]: file || null }))
    setAssetPreviews(prev => ({
      ...prev,
      [assetType]: file ? URL.createObjectURL(file) : '',
    }))
  }

  const deleteCompetitionAsset = async (assetType) => {
    if (!competition?.id) {
      setAssetFiles(prev => ({ ...prev, [assetType]: null }))
      setAssetPreviews(prev => ({ ...prev, [assetType]: '' }))
      return
    }
    setDeletingAssetKey(assetType)
    try {
      await api.delete(`/competitions/${competition.id}/assets?asset_type=${assetType}`)
      setAssetFiles(prev => ({ ...prev, [assetType]: null }))
      setAssetPreviews(prev => ({ ...prev, [assetType]: '' }))
      onSaved('Imagen eliminada')
      if (!inline) onClose()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo eliminar la imagen' })
    } finally {
      setDeletingAssetKey('')
    }
  }

  const uploadCompetitionAssets = async (competitionId) => {
    const pendingAssets = Object.entries(assetFiles).filter(([, file]) => !!file)
    if (!pendingAssets.length) return null
    setUploadingAssets(true)
    try {
      let latestCompetition = null
      for (const [assetType, file] of pendingAssets) {
        const formData = new FormData()
        formData.append('file', file)
        const { data } = await api.post(`/competitions/${competitionId}/assets?asset_type=${assetType}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        latestCompetition = data?.competition || latestCompetition
      }
      return latestCompetition
    } finally {
      setUploadingAssets(false)
    }
  }

  const SOCIAL_PLATFORM_OPTIONS = [
    { value: 'instagram', label: 'Instagram' },
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'tiktok', label: 'TikTok' },
    { value: 'x', label: 'X' },
    { value: 'other', label: 'Otra' },
  ]
  const getSocialPlatformLabel = (item) => {
    if (item?.platform === 'other') return String(item.custom_label || '').trim() || 'Otra'
    return SOCIAL_PLATFORM_OPTIONS.find(option => option.value === item?.platform)?.label || 'Red social'
  }

  const formContent = (
      <form onSubmit={save} style={inline ? { display: 'grid', gap: 0 } : { overflowY: 'auto', paddingRight: 4 }}>
        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        <div style={{ ...sectionStyle, background: 'linear-gradient(135deg, rgba(214,217,224,0.16), rgba(23,27,33,0.98) 42%, rgba(9,11,14,0.98) 100%)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <h4 style={sectionTitleStyle}>Configuracion guiada</h4>
            </div>
            <div style={{ color: '#FFB36F', fontSize: 12, fontWeight: 800 }}>{`Paso ${editorStep + 1} de ${setupSteps.length}`}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${setupSteps.length}, minmax(0, 1fr))`, gap: 8, marginTop: 14 }}>
            {setupSteps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  if (index <= editorStep || !!form.nombre.trim()) setEditorStep(index)
                }}
                style={{
                  borderRadius: 14,
                  border: index === editorStep ? '1px solid rgba(214,217,224,0.45)' : '1px solid #252A33',
                  background: index === editorStep ? 'rgba(214,217,224,0.16)' : 'rgba(13,15,18,0.72)',
                  padding: '12px 14px',
                  textAlign: 'left',
                  color: '#F5F7FA',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: index === editorStep ? '#FFB36F' : '#AAB2C0' }}>{`0${index + 1}`.slice(-2)}</div>
                <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4 }}>{step.label}</div>
                <div style={{ fontSize: 12, color: '#AAB2C0', marginTop: 4, lineHeight: 1.45 }}>{step.hint}</div>
              </button>
            ))}
          </div>
        </div>

        {activeStep.id === 'basics' && (
        <div style={{ ...sectionStyle, paddingBottom: isMobile ? 12 : 16 }}>
          <div style={{ marginBottom: 14 }}>
            <h4 style={sectionTitleStyle}>Base de la competencia</h4>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Nombre *</label>
              <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Lugar</label>
              <input value={form.lugar} onChange={e => setForm(f => ({ ...f, lugar: e.target.value }))} placeholder="Ej: Bogota, Coliseo Central" />
            </div>
          </div>


          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Numero de contacto</label>
              {(() => {
                const PHONE_PREFIXES = [
                  { code: 'co', prefix: '+57' },
                  { code: 'us', prefix: '+1' },
                  { code: 'mx', prefix: '+52' },
                  { code: 'ar', prefix: '+54' },
                  { code: 'cl', prefix: '+56' },
                  { code: 'pe', prefix: '+51' },
                  { code: 've', prefix: '+58' },
                  { code: 'ec', prefix: '+593' },
                  { code: 'es', prefix: '+34' },
                ]
                const flagUrl = code => `https://flagcdn.com/20x15/${code}.png`
                const currentPrefix = form.contact_phone_prefix || '+57'
                const currentEntry = PHONE_PREFIXES.find(p => p.prefix === currentPrefix) || PHONE_PREFIXES[0]
                return (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => setShowPhonePrefixDropdown(v => !v)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', height: '100%', minHeight: 38, borderRadius: 8, border: '1px solid var(--oa-border, #252A33)', background: 'var(--oa-surface, #1e2329)', cursor: 'pointer' }}
                      >
                        <img src={flagUrl(currentEntry.code)} alt={currentEntry.code} style={{ width: 16, height: 12, borderRadius: 2, objectFit: 'cover' }} />
                        <span style={{ fontSize: 11, color: '#AAB2C0' }}>{currentPrefix}</span>
                      <span style={{ fontSize: 10, color: '#6B7280' }}>▾</span>
                      </button>
                      {showPhonePrefixDropdown && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 999, background: '#1e2329', border: '1px solid #252A33', borderRadius: 10, padding: 4, display: 'grid', gap: 2, minWidth: 110, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
                          {PHONE_PREFIXES.map(p => (
                            <button
                              key={p.prefix}
                              type="button"
                              onClick={() => {
                                setForm(f => {
                                  const digits = f.contact_phone.replace(/^\+\d+\s*/, '')
                                  return { ...f, contact_phone_prefix: p.prefix, contact_phone: digits ? `${p.prefix} ${digits}` : '' }
                                })
                                setShowPhonePrefixDropdown(false)
                              }}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, border: 'none', background: p.prefix === currentPrefix ? 'rgba(214,217,224,0.12)' : 'transparent', cursor: 'pointer', color: '#F5F7FA', textAlign: 'left' }}
                            >
                              <img src={flagUrl(p.code)} alt={p.code} style={{ width: 16, height: 12, borderRadius: 2, objectFit: 'cover' }} />
                              <span style={{ fontSize: 12, color: '#AAB2C0' }}>{p.prefix}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      value={form.contact_phone.replace(/^\+\d+\s*/, '')}
                      onChange={e => {
                        const digits = e.target.value.replace(/\D/g, '')
                        const prefix = form.contact_phone_prefix || '+57'
                        setForm(f => ({ ...f, contact_phone: digits ? `${prefix} ${digits}` : '', contact_phone_prefix: prefix }))
                      }}
                      placeholder="300 123 4567"
                      inputMode="numeric"
                      style={{ flex: 1 }}
                    />
                  </div>
                )
              })()}
            </div>
            <div className="form-group">
              <label>Pagina web</label>
              <input value={form.website_url} onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))} placeholder="https://..." />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <div className="form-group">
              <label>Descripcion</label>
              <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Informacion general</label>
              <textarea
                value={form.general_info_text}
                onChange={e => setForm(f => ({ ...f, general_info_text: e.target.value }))}
                rows={6}
                placeholder="Resumen amplio de la competencia, dinamica general, formato, ambiente, reglas base o lo que el atleta debe entender antes de ver eventos y categorias."
              />
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            <div>
              <div style={{ color: 'var(--oa-text)', fontSize: 14, fontWeight: 800 }}>Imagenes</div>
              <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>
                Puedes subir foto del evento y un solo banner para toda la competencia.
                {!isEdit ? ' En competencias nuevas, las imagenes se cargan al guardar.' : ''}
              </div>
            </div>
            {[
              { key: 'profile', label: 'Foto del evento' },
              { key: 'banner', label: 'Banner' },
            ].map((asset) => {
              const savedPreview = resolveCompetitionAsset(competition, asset.key)
              const currentPreview = assetPreviews[asset.key] || savedPreview
              const pendingFile = assetFiles[asset.key]
              return (
                <div key={asset.key} style={{ ...listItemStyle, gridTemplateColumns: isMobile ? '1fr' : '160px 1fr', gap: 12, marginBottom: 0 }}>
                  <div style={{
                    width: '100%',
                    minHeight: asset.key === 'profile' ? 140 : 100,
                    borderRadius: asset.key === 'profile' ? 18 : 14,
                    border: '1px solid #252A33',
                    background: currentPreview ? `#0D0F12 url("${currentPreview}") center/cover no-repeat` : 'rgba(13,15,18,0.72)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#7E8796',
                    fontSize: 12,
                    fontWeight: 700,
                    overflow: 'hidden',
                    aspectRatio: asset.key === 'profile' ? '1 / 1' : '4 / 5',
                  }}>
                    {!currentPreview ? 'Sin imagen' : null}
                  </div>
                  <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
                    <div style={{ color: 'var(--oa-text)', fontSize: 14, fontWeight: 700 }}>{asset.label}</div>
                    <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12 }}>{COMPETITION_ASSET_RECOMMENDATIONS[asset.key]}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '10px 14px',
                          borderRadius: 12,
                          border: '1px solid #252A33',
                          background: 'rgba(13,15,18,0.72)',
                          color: '#F5F7FA',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Seleccionar archivo
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => setCompetitionAssetFile(asset.key, e.target.files?.[0] || null)}
                          style={{ display: 'none' }}
                        />
                      </label>
                      {(currentPreview || pendingFile) ? (
                        <button
                          type="button"
                          className="btn-danger btn-sm"
                          disabled={deletingAssetKey === asset.key}
                          onClick={() => deleteCompetitionAsset(asset.key)}
                        >
                          {deletingAssetKey === asset.key ? 'Eliminando...' : 'Eliminar imagen'}
                        </button>
                      ) : null}
                    </div>
                    <div style={{ color: pendingFile ? '#F5F7FA' : 'var(--oa-text-secondary)', fontSize: 12, lineHeight: 1.45 }}>
                      {pendingFile?.name || (currentPreview ? 'Imagen cargada.' : 'Ningun archivo seleccionado.')}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            <button type="button" onClick={() => setExtraExpanded('basics')} style={extraToggleStyle}>
              <span>Configuracion extra</span>
              <span style={{ color: '#AAB2C0', fontSize: 12 }}>{expandedExtras.basics ? 'Ocultar' : 'Mostrar'}</span>
            </button>
            {expandedExtras.basics ? (
            <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <div style={{ color: 'var(--oa-text)', fontSize: 14, fontWeight: 800 }}>Textos de portada</div>
              <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>
                Solo usalos si necesitas reforzar contexto en la landing publica.
              </div>
            </div>

            <div style={{ ...listItemStyle, marginBottom: 0 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Titulo de experiencia</label>
                <input value={landingSections.experience_title} onChange={e => updateLandingSectionField('experience_title', e.target.value)} placeholder="Ej: Tres dias para construir el ranking y cerrar la final." />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Intro de experiencia</label>
                <textarea value={landingSections.experience_intro} onChange={e => updateLandingSectionField('experience_intro', e.target.value)} rows={4} placeholder="Explica en pocas lineas como se vive esta competencia y que tipo de exigencia propone." />
              </div>
              <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12 }}>Momentos recomendados: 3.</div>
              {landingSections.experience_items.map((item, idx) => (
                <div key={`exp-item-${idx}`} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '0.7fr 1.3fr auto', gap: 8 }}>
                  <input value={item.title} onChange={e => updateLandingSectionItem('experience_items', idx, 'title', e.target.value)} placeholder={`Momento ${idx + 1}`} />
                  <input value={item.body} onChange={e => updateLandingSectionItem('experience_items', idx, 'body', e.target.value)} placeholder="Texto corto del momento" />
                  <button type="button" className="btn-danger btn-sm" onClick={() => removeLandingSectionItem('experience_items', idx)}>Quitar</button>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <button type="button" className="btn-secondary btn-sm" onClick={() => addLandingSectionItem('experience_items')}>+ Agregar momento</button>
              </div>
            </div>

            <div style={{ ...listItemStyle, marginBottom: 0 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Titulo de pasos del formato</label>
                <input value={landingSections.format_title} onChange={e => updateLandingSectionField('format_title', e.target.value)} placeholder="Ej: Asi se compite" />
              </div>
              <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12 }}>Pasos recomendados: 3.</div>
              {landingSections.format_items.map((item, idx) => (
                <div key={`format-item-${idx}`} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '0.7fr 1.3fr auto', gap: 8 }}>
                  <input value={item.title} onChange={e => updateLandingSectionItem('format_items', idx, 'title', e.target.value)} placeholder={`Paso ${idx + 1}`} />
                  <input value={item.body} onChange={e => updateLandingSectionItem('format_items', idx, 'body', e.target.value)} placeholder="Explicacion breve del paso" />
                  <button type="button" className="btn-danger btn-sm" onClick={() => removeLandingSectionItem('format_items', idx)}>Quitar</button>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <button type="button" className="btn-secondary btn-sm" onClick={() => addLandingSectionItem('format_items')}>+ Agregar paso</button>
              </div>
            </div>

            <div style={{ ...listItemStyle, marginBottom: 0 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Titulo de puntos clave</label>
                <input value={landingSections.highlights_title} onChange={e => updateLandingSectionField('highlights_title', e.target.value)} placeholder="Ej: Lo clave" />
              </div>
              <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12 }}>Puntos recomendados: 3.</div>
              {landingSections.highlights_items.map((item, idx) => (
                <div key={`highlight-item-${idx}`} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '0.7fr 1.3fr auto', gap: 8 }}>
                  <input value={item.title} onChange={e => updateLandingSectionItem('highlights_items', idx, 'title', e.target.value)} placeholder={`Punto ${idx + 1}`} />
                  <input value={item.body} onChange={e => updateLandingSectionItem('highlights_items', idx, 'body', e.target.value)} placeholder="Aclaracion breve opcional" />
                  <button type="button" className="btn-danger btn-sm" onClick={() => removeLandingSectionItem('highlights_items', idx)}>Quitar</button>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <button type="button" className="btn-secondary btn-sm" onClick={() => addLandingSectionItem('highlights_items')}>+ Agregar punto</button>
              </div>
            </div>
          <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ color: 'var(--oa-text)', fontSize: 14, fontWeight: 800 }}>Tema de la competencia</div>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setShowThemePreview(true)}
              >
                Ver preview
              </button>
            </div>
            <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, lineHeight: 1.5 }}>
              Define 4 colores base para la pagina de esta competencia. Si un campo queda vacio, se usa el tema oficial de FinalRep.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '320px minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
              <div style={{ maxWidth: isMobile ? '100%' : 320 }}>
                <CompetitionThemeMiniPreview theme={previewTheme} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                {COMPETITION_THEME_FIELDS.map((field) => {
                  const currentValue = normalizeHexColor(form[field.key]) || field.fallback
                  return (
                    <div key={field.key} style={{ ...listItemStyle, gap: 10, marginBottom: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                        <div>
                          <div style={{ color: 'var(--oa-text)', fontSize: 14, fontWeight: 700 }}>{field.label}</div>
                          <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>{field.hint}</div>
                        </div>
                        <div style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #252A33', background: currentValue, flexShrink: 0 }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center' }}>
                        <input
                          value={form[field.key]}
                          onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value.trim() }))}
                          placeholder={field.fallback}
                          maxLength={7}
                        />
                        <input
                          type="color"
                          value={currentValue}
                          onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                          style={{ width: 46, height: 40, padding: 4, borderRadius: 10, cursor: 'pointer' }}
                        />
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => setForm(f => ({ ...f, [field.key]: '' }))}
                        >
                          FinalRep
                        </button>
                      </div>
                      <div style={{ color: 'var(--oa-text-secondary)', fontSize: 11 }}>
                        {normalizeHexColor(form[field.key]) ? `Guardado: ${normalizeHexColor(form[field.key])}` : `Por defecto: ${field.fallback}`}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          </div>
            ) : (
              <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12 }}>Configuracion adicional.</div>
            )}
        </div>
        </div>
        )}

        {activeStep.id === 'registration' && (
        <div style={{ display: 'grid', gap: 0 }}>
        <div style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <h4 style={sectionTitleStyle}>Registro y reglas base</h4>
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <div style={sectionRowLabelStyle}>Modalidades</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
                {renderToggleCard({
                  label: 'Modalidad individual',
                  hint: 'Usa categorias, inscripciones y eventos para atletas individuales.',
                  enabled: !!form.individual_enabled,
                  enabledText: 'Activa',
                  disabledText: 'Oculta',
                  onClick: () => setForm(f => ({ ...f, individual_enabled: f.individual_enabled ? 0 : 1 })),
                })}
                {renderToggleCard({
                  label: 'Modalidad equipos',
                  hint: 'Activa armado de equipos y divisiones grupales.',
                  enabled: !!form.team_enabled,
                  enabledText: 'Activa',
                  disabledText: 'Oculta',
                  onClick: () => setForm(f => ({ ...f, team_enabled: f.team_enabled ? 0 : 1, team_categories_enabled: f.team_enabled ? f.team_categories_enabled : 1 })),
                })}
              </div>
              {form.team_enabled ? (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Tamaño de equipo</label>
                    <input type="number" min="1" max="10" value={form.team_size} onChange={e => setForm(f => ({ ...f, team_size: e.target.value === '' ? '' : Math.max(1, Number(e.target.value)) }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Regla de armado</label>
                    <select value={form.team_membership_rule} onChange={e => setForm(f => ({ ...f, team_membership_rule: e.target.value }))}>
                      <option value="free">Libre</option>
                      <option value="same_category">Misma categoria</option>
                    </select>
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <div style={sectionRowLabelStyle}>Unidad global para RM</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 220px) minmax(0, 1fr)', gap: 10, alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Unidad de carga</label>
                  <select value={form.rm_unit || 'kg'} onChange={e => setForm(f => ({ ...f, rm_unit: e.target.value === 'lb' ? 'lb' : 'kg' }))}>
                    {RM_UNIT_OPTIONS.map(unit => <option key={unit} value={unit}>{unit.toUpperCase()}</option>)}
                  </select>
                </div>
                <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.45)', padding: '10px 12px', color: '#AAB2C0', fontSize: 12, lineHeight: 1.5 }}>
                  Todos los eventos configurados como <strong style={{ color: '#F5F7FA' }}>RM</strong> usarán esta unidad en el panel y en la vista pública.
                </div>
              </div>
            </div>

          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <h4 style={sectionTitleStyle}>Redes y contacto</h4>
                <div style={sectionHintStyle}>Agrega links publicos de Instagram, TikTok, Facebook, WhatsApp o cualquier canal oficial de la competencia.</div>
              </div>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setShowAddSocialModal(true)}>
                + Agregar red
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12 }}>
              {socialLinks.length ? `${socialLinks.length} red${socialLinks.length === 1 ? '' : 'es'} configurada${socialLinks.length === 1 ? '' : 's'}.` : 'Sin redes configuradas.'}
            </div>
            {socialLinks.map((item, idx) => (
              <div key={item.id} style={{ ...listItemStyle, display: 'grid', gap: 12, marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#FFB36F', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{`Red ${String(idx + 1).padStart(2, '0')}`}</div>
                    <div style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 800, marginTop: 4 }}>{getSocialPlatformLabel(item)}</div>
                  </div>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingSocialId(item.id)}>
                    Editar
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 180px) minmax(0, 1fr)', gap: 10 }}>
                  <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(255,255,255,0.02)', padding: '10px 12px' }}>
                    <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 4 }}>Canal</div>
                    <div style={{ color: '#F5F7FA', fontSize: 14, fontWeight: 700, wordBreak: 'break-word' }}>{getSocialPlatformLabel(item)}</div>
                  </div>
                  <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(255,255,255,0.02)', padding: '10px 12px' }}>
                    <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 4 }}>Link</div>
                    <div style={{ color: '#F5F7FA', fontSize: 14, fontWeight: 700, wordBreak: 'break-word' }}>{item.url || 'Pendiente'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <h4 style={sectionTitleStyle}>Ventana de inscripcion</h4>
            <div style={sectionHintStyle}>Estas fechas ordenan la apertura del registro y el rango principal de la competencia.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Inicio de inscripciones</label>
              <input type="date" value={form.enrollment_start} onChange={e => setForm(f => ({ ...f, enrollment_start: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Cierre de inscripciones</label>
              <input type="date" value={form.enrollment_end} min={form.enrollment_start || undefined} onChange={e => setForm(f => ({ ...f, enrollment_end: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Inicio de competencia</label>
              <input type="date" value={form.competition_start} onChange={e => setForm(f => ({ ...f, competition_start: e.target.value, competition_end: f.competition_end && e.target.value > f.competition_end ? '' : f.competition_end }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Fin de competencia</label>
              <input type="date" value={form.competition_end} min={form.competition_start || undefined} onChange={e => setForm(f => ({ ...f, competition_end: e.target.value }))} />
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <h4 style={sectionTitleStyle}>Fechas visibles</h4>
                <div style={sectionHintStyle}>Agrega solo las fechas que quieras publicar en el resumen de la competencia.</div>
              </div>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setShowAddScheduleModal(true)}>
                + Agregar fecha
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12 }}>{visibleScheduleSummary}</div>
            {scheduleItems.map((item, idx) => {
              const linkedPhase = phases.find(phase => String(phase.id) === String(item.phase_id))
              return (
                <div key={item.id} style={{ ...listItemStyle, gap: 12, marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: '#FFB36F', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{`Fecha ${String(idx + 1).padStart(2, '0')}`}</div>
                      <div style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 800, marginTop: 4 }}>{item.label || `Fecha visible ${idx + 1}`}</div>
                    </div>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingScheduleId(item.id)}>
                      Editar
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                    <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(255,255,255,0.02)', padding: '10px 12px' }}>
                      <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 4 }}>Tipo</div>
                      <div style={{ color: '#F5F7FA', fontSize: 14, fontWeight: 700 }}>{getScheduleKindLabel(item.kind)}</div>
                    </div>
                    <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(255,255,255,0.02)', padding: '10px 12px' }}>
                      <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 4 }}>Rango</div>
                      <div style={{ color: '#F5F7FA', fontSize: 14, fontWeight: 700, wordBreak: 'break-word' }}>{getScheduleRangeLabel(item)}</div>
                    </div>
                    <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(255,255,255,0.02)', padding: '10px 12px' }}>
                      <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 4 }}>Evento enlazado</div>
                      <div style={{ color: '#F5F7FA', fontSize: 14, fontWeight: 700, wordBreak: 'break-word' }}>
                        {linkedPhase?.nombre || 'Sin evento enlazado'}
                    {linkedPhase && item.use_phase_dates ? ' · usa fechas del evento' : ''}
                      </div>
                    </div>
                  </div>
                  {item.note ? (
                    <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.45)', padding: '10px 12px' }}>
                      <div style={{ color: '#6B7280', fontSize: 11, marginBottom: 4 }}>Nota</div>
                      <div style={{ color: '#F5F7FA', fontSize: 13, lineHeight: 1.5 }}>{item.note}</div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <h4 style={sectionTitleStyle}>Terminos y condiciones</h4>
            <div style={sectionHintStyle}>Opcional, pero recomendado si manejas reglas, imagen o reembolsos propios.</div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Texto de terminos del evento</label>
            <textarea
              value={form.enrollment_terms_text}
              onChange={e => setForm(f => ({ ...f, enrollment_terms_text: e.target.value }))}
              rows={8}
              placeholder="Ej: Al inscribirme declaro que estoy en condiciones fisicas adecuadas, acepto el reglamento del evento, autorizo el uso de imagen segun las politicas del organizador y entiendo las condiciones de reembolso."
            />
          </div>
        </div>

        </div>
        )}

        {activeStep.id === 'divisions' && (
        <div style={{ display: 'grid', gap: 0 }}>
        <div style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <h4 style={sectionTitleStyle}>Divisiones</h4>
            <div style={sectionHintStyle}>Crea solo las divisiones que realmente vas a usar. Si una no aplica, dejala fuera.</div>
          </div>
          <div style={{ marginBottom: 14 }}>
            {renderToggleCard({
              label: 'Mostrar inscritos publicamente por categoria',
              hint: 'Publica en la landing los atletas y equipos confirmados dentro de cada categoria.',
              enabled: !!form.show_public_category_roster,
              enabledText: 'Visible',
              disabledText: 'Oculto',
              onClick: () => setForm(f => ({ ...f, show_public_category_roster: f.show_public_category_roster ? 0 : 1 })),
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12 }}>
              {cats.length ? `${cats.length} division${cats.length === 1 ? '' : 'es'} configurada${cats.length === 1 ? '' : 's'}.` : 'Todavia no has agregado divisiones.'}
            </div>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setShowAddCategoryModal(true)}>
              + Agregar division
            </button>
          </div>
          <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, marginBottom: 8 }}>{cats.length ? '' : 'Sin divisiones'}</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {cats.map((cat, idx) => (
              <div key={cat.id} style={{ ...listItemStyle, gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ color: '#5EEAD4', fontSize: 11, fontWeight: 800, letterSpacing: 0.6 }}>
                        DIVISION {String(idx + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <div style={{ color: '#F5F7FA', fontSize: 17, fontWeight: 800, lineHeight: 1.2, marginTop: 6 }}>
                      {cat.nombre || `Division ${idx + 1}`}
                    </div>
                  </div>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingCategoryId(cat.id)} style={{ flexShrink: 0 }}>
                    Editar
                  </button>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                    <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.45)', padding: '10px 12px' }}>
                      <div style={{ color: '#6B7280', fontSize: 11, marginBottom: 4 }}>Modalidad</div>
                      <div style={{ color: '#F5F7FA', fontSize: 13 }}>
                        {cat.modality === 'teams' ? 'Equipos' : 'Individual'}
                      </div>
                    </div>
                    <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.45)', padding: '10px 12px' }}>
                      <div style={{ color: '#6B7280', fontSize: 11, marginBottom: 4 }}>Precio base</div>
                      <div style={{ color: '#F5F7FA', fontSize: 13 }}>{formatCop(normalizeEnrollmentPrice(cat.enrollment_price))}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                    <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(255,255,255,0.02)', padding: '10px 12px' }}>
                      <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 4 }}>Tu precio</div>
                      <div style={{ color: '#F5F7FA', fontSize: 14, fontWeight: 800 }}>{formatCop(calculateEnrollmentPricing(cat.enrollment_price, effectivePlatformFeeRate).organizerPrice)}</div>
                    </div>
                    <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(255,255,255,0.02)', padding: '10px 12px' }}>
                      <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 4 }}>Comision FinalRep</div>
                      <div style={{ color: '#FFB36F', fontSize: 14, fontWeight: 800 }}>{formatCop(calculateEnrollmentPricing(cat.enrollment_price, effectivePlatformFeeRate).platformFee)}</div>
                    </div>
                    <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(255,255,255,0.02)', padding: '10px 12px' }}>
                      <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 4 }}>Paga el atleta</div>
                      <div style={{ color: '#8DF1E4', fontSize: 14, fontWeight: 800 }}>{formatCop(calculateEnrollmentPricing(cat.enrollment_price, effectivePlatformFeeRate).totalPrice)}</div>
                    </div>
                  </div>
                  <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.45)', padding: '10px 12px' }}>
                    <div style={{ color: '#6B7280', fontSize: 11, marginBottom: 4 }}>Descripcion</div>
                    <div style={{ color: '#F5F7FA', fontSize: 13, lineHeight: 1.5 }}>
                      {cat.descripcion || 'Sin descripcion'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h4 style={sectionTitleStyle}>Preguntas de participacion</h4>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 999, border: '1px solid rgba(94,234,212,0.28)', background: 'rgba(94,234,212,0.08)', color: '#D7FFFA', fontSize: 11, fontWeight: 700 }}>
                <Info size={12} />
                No agregues preguntas con informacion que ya existe en el perfil del atleta.
              </span>
            </div>
            <div style={sectionHintStyle}>Se muestran en el formulario que abre el boton "Quiero participar". Puedes pedir texto o una imagen para validar informacion del atleta.</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12 }}>
              {questions.length ? `${questions.length} pregunta${questions.length === 1 ? '' : 's'} configurada${questions.length === 1 ? '' : 's'}.` : 'Todavia no has agregado preguntas.'}
            </div>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setShowAddQuestionModal(true)}>
              + Agregar pregunta
            </button>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {questions.map((question, idx) => (
              <div key={question.id} style={{ ...listItemStyle, gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ color: '#5EEAD4', fontSize: 11, fontWeight: 800, letterSpacing: 0.6 }}>
                        PREGUNTA {String(idx + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <div style={{ color: '#F5F7FA', fontSize: 17, fontWeight: 800, lineHeight: 1.2, marginTop: 6 }}>
                      {question.label || `Pregunta ${idx + 1}`}
                    </div>
                  </div>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingQuestionId(question.id)} style={{ flexShrink: 0 }}>
                    Editar
                  </button>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                    <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.45)', padding: '10px 12px' }}>
                      <div style={{ color: '#6B7280', fontSize: 11, marginBottom: 4 }}>Tipo</div>
                      <div style={{ color: '#F5F7FA', fontSize: 13 }}>
                        {question.field_type === 'image' ? 'Imagen' : question.field_type === 'number' ? 'Solo numeros' : 'Solo texto'}
                      </div>
                    </div>
                    <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.45)', padding: '10px 12px' }}>
                      <div style={{ color: '#6B7280', fontSize: 11, marginBottom: 4 }}>Estado</div>
                      <div style={{ color: '#F5F7FA', fontSize: 13 }}>
                        {question.required ? 'Obligatoria' : 'Opcional'}
                      </div>
                    </div>
                  </div>
                  <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.45)', padding: '10px 12px' }}>
                    <div style={{ color: '#6B7280', fontSize: 11, marginBottom: 4 }}>Ayuda</div>
                    <div style={{ color: '#F5F7FA', fontSize: 13, lineHeight: 1.5 }}>
                      {question.placeholder || 'Sin ayuda adicional'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {!questions.length && <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12 }}>Sin preguntas configuradas.</div>}
          </div>
        </div>
        </div>
        )}

        {activeStep.id === 'events' && (
          <div style={sectionStyle}>
            <div style={{ marginBottom: 14 }}>
              <h4 style={sectionTitleStyle}>Bloques y eventos</h4>
              <div style={sectionHintStyle}>Agrega cada prueba una por una. Si algo es opcional, dejalo vacio y ajustalo despues.</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12 }}>
                {phases.length ? `${phases.length} evento${phases.length === 1 ? '' : 's'} configurado${phases.length === 1 ? '' : 's'}.` : 'Todavia no has agregado eventos.'}
              </div>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setShowAddPhaseModal(true)}>
                + Agregar evento
              </button>
            </div>
            {phases.length === 0 && <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, marginBottom: 8 }}>Sin fases</div>}
            <div style={{ display: 'grid', gap: 6 }}>
              {phases.map((phase, idx) => (
                <div key={phase.id} style={{ ...listItemStyle, gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ color: '#D6D9E0', fontSize: 11, fontWeight: 800, letterSpacing: 0.6 }}>
                          EVENTO {String(idx + 1).padStart(2, '0')}
                        </span>
                        {phase.block_name ? (
                          <span style={{ color: '#AAB2C0', fontSize: 12 }}>
                            {phase.block_name}
                          </span>
                        ) : null}
                      </div>
                      <div style={{ color: '#F5F7FA', fontSize: 17, fontWeight: 800, lineHeight: 1.2, marginTop: 6 }}>
                        {phase.nombre || `Evento ${idx + 1}`}
                      </div>
                    </div>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingPhaseId(phase.id)} style={{ flexShrink: 0 }}>
                      Editar
                    </button>
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                      <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.45)', padding: '10px 12px' }}>
                        <div style={{ color: '#6B7280', fontSize: 11, marginBottom: 4 }}>Modalidad</div>
                        <div style={{ color: '#F5F7FA', fontSize: 13 }}>
                          {phase.modality === 'teams' ? 'Equipos' : 'Individual'}
                        </div>
                      </div>
                      <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.45)', padding: '10px 12px' }}>
                        <div style={{ color: '#6B7280', fontSize: 11, marginBottom: 4 }}>Medicion</div>
                        <div style={{ color: '#F5F7FA', fontSize: 13 }}>
                          {normalizeMeasurementMethod(phase.measurement_method, phase.tipo) === 'rm'
                            ? `RM (${String(form.rm_unit || 'kg').toUpperCase()})`
                            : (PHASE_MEASUREMENT_LABELS[normalizeMeasurementMethod(phase.measurement_method, phase.tipo)] || normalizeMeasurementMethod(phase.measurement_method, phase.tipo))}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${phase.modality === 'teams' ? 2 : 1}, minmax(0, 1fr))`, gap: 8 }}>
                      {phase.modality === 'teams' ? (
                        <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.45)', padding: '10px 12px' }}>
                          <div style={{ color: '#6B7280', fontSize: 11, marginBottom: 4 }}>Resultado por equipo</div>
                          <div style={{ color: '#F5F7FA', fontSize: 13 }}>
                            {phase.team_result_mode === 'total' ? 'Total' : phase.team_result_mode === 'single_member' ? 'Uno' : 'Ambos'}
                          </div>
                        </div>
                      ) : null}
                      <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.45)', padding: '10px 12px' }}>
                        <div style={{ color: '#6B7280', fontSize: 11, marginBottom: 4 }}>Fechas</div>
                        <div style={{ color: '#F5F7FA', fontSize: 13 }}>
                          {phase.start_at || phase.end_at ? `${phase.start_at || '-'}${phase.end_at ? ` -> ${phase.end_at}` : ''}` : 'Sin fecha'}
                        </div>
                      </div>
                    </div>
                    <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.45)', padding: '10px 12px' }}>
                      <div style={{ color: '#6B7280', fontSize: 11, marginBottom: 4 }}>Descripcion</div>
                      <div style={{ color: '#F5F7FA', fontSize: 13, lineHeight: 1.5 }}>
                        {phase.descripcion || 'Sin descripcion'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 12, border: `1px solid ${phase.is_visible ? 'rgba(214,217,224,0.28)' : '#252A33'}`, background: phase.is_visible ? 'rgba(214,217,224,0.08)' : 'rgba(13,15,18,0.45)', padding: '12px 14px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 700 }}>Visibilidad del evento</div>
                        <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>
                          {phase.is_visible ? 'Se mostrará en la vista previa y en la página pública.' : 'Quedará oculto en la vista previa y en la página pública.'}
                        </div>
                      </div>
                      <label htmlFor={`phase-visibility-card-${phase.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: phase.is_visible ? '#D6D9E0' : '#6B7280' }}>
                          {phase.is_visible ? 'Visible' : 'Oculto'}
                        </span>
                        <span style={{ position: 'relative', display: 'inline-block', width: 40, height: 22 }}>
                          <input
                            id={`phase-visibility-card-${phase.id}`}
                            type="checkbox"
                            checked={!!phase.is_visible}
                            onChange={e => updatePhase(phase.id, 'is_visible', e.target.checked ? 1 : 0)}
                            style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                          />
                          <span style={{ position: 'absolute', inset: 0, borderRadius: 999, cursor: 'pointer', background: phase.is_visible ? '#D6D9E0' : '#374151', transition: 'background 0.2s' }} />
                          <span style={{ position: 'absolute', top: 3, left: phase.is_visible ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', pointerEvents: 'none' }} />
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <div style={{ color: '#AAB2C0', fontSize: 12, alignSelf: 'center' }}>
            {activeStep.id === 'events' || (activeStep.id === 'divisions' && inline && isEdit)
              ? 'Revisa y guarda cuando termines.'
              : 'Avanza paso a paso. Puedes volver cuando quieras.'}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {editorStep > 0 ? (
            <button type="button" className="btn-secondary" onClick={() => setEditorStep(prev => Math.max(0, prev - 1))}>
              Anterior
            </button>
          ) : null}
          {!inline && <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>}
          {editorStep < setupSteps.length - 1 ? (
            <button type="button" className="btn-primary" disabled={!canGoNextStep} onClick={() => setEditorStep(prev => Math.min(setupSteps.length - 1, prev + 1))}>
              Siguiente
            </button>
          ) : null}
          <button type="submit" className="btn-primary" disabled={saving || uploadingAssets}>
            {(saving || uploadingAssets) ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear competencia'}
          </button>
          </div>
        </div>
      </form>
  )

  const addPhaseModal = showAddPhaseModal ? (
    <Modal
      title="Agregar evento"
      onClose={() => setShowAddPhaseModal(false)}
      width={760}
      panelStyle={{ padding: 18 }}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
                    Completa los datos del evento y agrégalo a la competencia.
        </div>

        {/* ---- DATOS BASICOS ---- */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Bloque</label>
            <input value={newPhase.block_name || ''} onChange={e => setNewPhase(p => ({ ...p, block_name: e.target.value }))} placeholder="Ej: Workout 1" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Nombre del evento</label>
            <input value={newPhase.nombre} onChange={e => setNewPhase(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre visible" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Modalidad</label>
            <select value={newPhase.modality} onChange={e => setNewPhase(p => ({ ...p, modality: e.target.value }))}>
              <option value="individual">Individual</option>
              <option value="teams" disabled={!form.team_enabled}>Equipos</option>
            </select>
          </div>
          {form.team_enabled && newPhase.modality === 'teams' ? (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Resultado por equipo</label>
              <select value={newPhase.team_result_mode} onChange={e => setNewPhase(p => ({ ...p, team_result_mode: e.target.value }))}>
                <option value="sum_two">Equipo: ambos</option>
                <option value="total">Equipo: total</option>
                <option value="single_member">Equipo: uno</option>
              </select>
            </div>
          ) : null}
          {(() => {
            const compStart = parseCalendarDate(form.competition_start)
            const compEnd = parseCalendarDate(form.competition_end)
            const competitionDays = []
            if (compStart && compEnd) {
              const cursor = new Date(compStart)
              cursor.setHours(0, 0, 0, 0)
              const end = new Date(compEnd)
              end.setHours(0, 0, 0, 0)
              let dayIndex = 1
              while (cursor <= end) {
                competitionDays.push({
                  label: `Dia ${dayIndex} - ${cursor.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}`,
                  value: cursor.toISOString().slice(0, 10),
                })
                cursor.setDate(cursor.getDate() + 1)
                dayIndex++
              }
            }
            if (competitionDays.length > 0) {
              return (
                <div style={{ display: 'grid', gap: 8, gridColumn: isMobile ? 'auto' : '1 / -1' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#5EEAD4', textTransform: 'uppercase', letterSpacing: 0.8 }}>Dia del evento</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {competitionDays.map(day => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => setNewPhase(p => ({
                          ...p,
                          start_at: p.start_at === day.value ? '' : day.value,
                          end_at: p.end_at === day.value ? '' : day.value,
                        }))}
                        style={{
                          borderRadius: 999,
                          border: newPhase.start_at === day.value ? '1px solid rgba(214,217,224,0.6)' : '1px solid #252A33',
                          background: newPhase.start_at === day.value ? 'rgba(214,217,224,0.18)' : 'rgba(13,15,18,0.72)',
                          color: newPhase.start_at === day.value ? '#FFD0AE' : '#AAB2C0',
                          padding: '8px 14px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            }
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Inicio</label>
                  <input type="date" value={newPhase.start_at || ''} onChange={e => setNewPhase(p => ({ ...p, start_at: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Fin</label>
                  <input type="date" value={newPhase.end_at || ''} onChange={e => setNewPhase(p => ({ ...p, end_at: e.target.value }))} />
                </div>
              </div>
            )
          })()}
        </div>

        {/* ---- TOGGLE DOS PUNTAJES ---- */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, border: '1px solid #252A33', background: 'rgba(13,15,18,0.5)' }}>
                  <span style={{ fontSize: 13, color: '#AAB2C0' }}>¿Este WOD tiene dos puntajes?</span>
          <label htmlFor="add-phase-toggle-part-b" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: newPhase.part_b_enabled ? '#D6D9E0' : '#6B7280' }}>
                      {newPhase.part_b_enabled ? 'Sí' : 'No'}
            </span>
            <span style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
              <input id="add-phase-toggle-part-b" type="checkbox" checked={newPhase.part_b_enabled}
                onChange={e => setNewPhase(p => ({ ...p, part_b_enabled: e.target.checked, part_b_descripcion: '', part_b_time_cap: '' }))}
                style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
              <span style={{ position: 'absolute', inset: 0, borderRadius: 999, cursor: 'pointer', background: newPhase.part_b_enabled ? '#D6D9E0' : '#374151', transition: 'background 0.2s' }} />
              <span style={{ position: 'absolute', top: 3, left: newPhase.part_b_enabled ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', pointerEvents: 'none' }} />
            </span>
          </label>
        </div>

        {/* ---- WOD BASE (Parte A) ---- */}
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#5EEAD4', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {newPhase.part_b_enabled ? 'Parte A' : 'WOD Base'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Medicion</label>
              <select value={newPhase.measurement_method} onChange={e => setNewPhase(p => ({ ...p, measurement_method: e.target.value }))}>
                {PHASE_MEASUREMENT_METHODS.map(m => <option key={m} value={m}>{PHASE_MEASUREMENT_LABELS[m] || m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>{newPhase.measurement_method === 'for_time' ? 'Time cap' : 'Duracion'} <span style={{ color: '#6B7280', fontWeight: 400 }}>(min)</span></label>
              <input
                type="number" min="1" max="999"
                value={newPhase.time_cap}
                onChange={e => setNewPhase(p => ({ ...p, time_cap: e.target.value.replace(/\D/g, '') }))}
                placeholder="Ej: 20"
                style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
                onWheel={e => e.target.blur()}
              />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>WOD{newPhase.part_b_enabled ? ' Parte A' : ''}</label>
            <textarea rows={4} value={newPhase.descripcion} onChange={e => setNewPhase(p => ({ ...p, descripcion: e.target.value }))} placeholder={'Escribe el WOD aqui...\nEj: 21-15-9\nThrusters 43/29 kg\nPull-ups'} style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }} />
          </div>
        </div>

        {/* ---- PARTE B ---- */}
        {newPhase.part_b_enabled && (
          <div style={{ display: 'grid', gap: 10, borderRadius: 12, border: '1px solid rgba(214,217,224,0.25)', background: 'rgba(214,217,224,0.04)', padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#D6D9E0', textTransform: 'uppercase', letterSpacing: 0.8 }}>Parte B</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Medicion</label>
                <select value={newPhase.part_b_measurement_method} onChange={e => setNewPhase(p => ({ ...p, part_b_measurement_method: e.target.value }))}>
                  {PHASE_MEASUREMENT_METHODS.map(m => <option key={m} value={m}>{PHASE_MEASUREMENT_LABELS[m] || m}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{newPhase.part_b_measurement_method === 'for_time' ? 'Time cap' : 'Duracion'} <span style={{ color: '#6B7280', fontWeight: 400 }}>(min)</span></label>
                <input
                  type="number" min="1" max="999"
                  value={newPhase.part_b_time_cap}
                  onChange={e => setNewPhase(p => ({ ...p, part_b_time_cap: e.target.value.replace(/\D/g, '') }))}
                  placeholder="Ej: 5"
                  style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
                  onWheel={e => e.target.blur()}
                />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>WOD Parte B</label>
              <textarea rows={3} value={newPhase.part_b_descripcion} onChange={e => setNewPhase(p => ({ ...p, part_b_descripcion: e.target.value }))} placeholder={'Describe la parte B...\nEj: 1RM Clean'} style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }} />
            </div>
          </div>
        )}

        {/* ---- CONFIGURACION POR CATEGORIA ---- */}
        {cats.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,193,7,0.3)', background: 'rgba(255,193,7,0.07)', color: '#FFD700', fontSize: 13 }}>
                    <span style={{ fontWeight: 700 }}>⚠</span>
                    <span>No hay categorías creadas. Ve a la sección <strong>Divisiones</strong> y crea las categorías primero.</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#5EEAD4', textTransform: 'uppercase', letterSpacing: 0.8 }}>Configuracion por categoria</div>
            {cats.map(cat => {
              const override = newPhaseCatOverrides[cat.id] || {}
              const isModified = !!override.modified
              const toggleId = `new-phase-cat-toggle-${cat.id}`
              return (
                <div key={cat.id} style={{ borderRadius: 12, border: `1px solid ${isModified ? 'rgba(214,217,224,0.35)' : '#252A33'}`, background: '#171B21', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 8px' }}>
                    <span style={{ padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 900, background: 'rgba(107,114,128,0.18)', border: '1px solid rgba(107,114,128,0.25)', color: '#9CA3AF', letterSpacing: 0.5, flexShrink: 0 }}>
                      {cat.nombre.split(' ')[0].toUpperCase()}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#F5F7FA' }}>{cat.nombre}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: isModified ? 'rgba(214,217,224,0.15)' : 'rgba(94,234,212,0.12)', border: `1px solid ${isModified ? 'rgba(214,217,224,0.35)' : 'rgba(94,234,212,0.22)'}`, color: isModified ? '#FFD0AE' : '#D9FFFA' }}>
                      {isModified ? 'Modificado' : 'Hereda base'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 14px 10px' }}>
                          <span style={{ fontSize: 13, color: '#AAB2C0' }}>¿Modificar el WOD para esta categoria?</span>
                    <label htmlFor={toggleId} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: '#6B7280' }}>{isModified ? '' : 'No'}</span>
                      <span style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
                        <input id={toggleId} type="checkbox" checked={isModified}
                          onChange={e => setNewPhaseCatOverrides(prev => ({ ...prev, [cat.id]: { ...override, modified: e.target.checked } }))}
                          style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                        />
                        <span style={{ position: 'absolute', inset: 0, borderRadius: 999, cursor: 'pointer', background: isModified ? '#D6D9E0' : '#374151', transition: 'background 0.2s' }} />
                        <span style={{ position: 'absolute', top: 3, left: isModified ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', pointerEvents: 'none' }} />
                      </span>
                    </label>
                  </div>
                  {isModified && (
                    <div style={{ padding: '0 14px 14px', display: 'grid', gap: 12 }}>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {newPhase.part_b_enabled && <div style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6 }}>Parte A</div>}
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>{newPhase.measurement_method === 'for_time' ? 'Time cap' : 'Duracion'} <span style={{ color: '#6B7280', fontWeight: 400 }}>(min)</span></label>
                          <input
                            type="number" min="1" max="999"
                            value={override.time_cap ?? ''}
                            onChange={e => setNewPhaseCatOverrides(prev => ({ ...prev, [cat.id]: { ...override, time_cap: e.target.value.replace(/\D/g, '') } }))}
                            placeholder={newPhase.time_cap ? `${newPhase.time_cap} (hereda base)` : 'Ej: 20'}
                            style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
                            onWheel={e => e.target.blur()}
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>WOD{newPhase.part_b_enabled ? ' Parte A' : ''}</label>
                          <textarea
                            value={override.text || ''}
                            onChange={e => setNewPhaseCatOverrides(prev => ({ ...prev, [cat.id]: { ...override, text: e.target.value } }))}
                            placeholder={newPhase.descripcion ? `${newPhase.descripcion}\n\n(edita para sobreescribir)` : `WOD especifico para ${cat.nombre}...`}
                            rows={4}
                            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>
                      {newPhase.part_b_enabled && (
                        <div style={{ display: 'grid', gap: 8, borderTop: '1px solid #252A33', paddingTop: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6 }}>Parte B</div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>{newPhase.part_b_measurement_method === 'for_time' ? 'Time cap' : 'Duracion'} <span style={{ color: '#6B7280', fontWeight: 400 }}>(min)</span></label>
                            <input
                              type="number" min="1" max="999"
                              value={override.part_b_time_cap ?? ''}
                              onChange={e => setNewPhaseCatOverrides(prev => ({ ...prev, [cat.id]: { ...override, part_b_time_cap: e.target.value.replace(/\D/g, '') } }))}
                              placeholder={newPhase.part_b_time_cap ? `${newPhase.part_b_time_cap} (hereda base)` : 'Ej: 5'}
                              style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
                              onWheel={e => e.target.blur()}
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>WOD Parte B</label>
                            <textarea
                              value={override.part_b_text || ''}
                              onChange={e => setNewPhaseCatOverrides(prev => ({ ...prev, [cat.id]: { ...override, part_b_text: e.target.value } }))}
                              placeholder={`Parte B especifica para ${cat.nombre}...`}
                              rows={3}
                              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setShowAddPhaseModal(false)}>Cancelar</button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (addPhase()) setShowAddPhaseModal(false)
            }}
          >
            Agregar evento
          </button>
        </div>
      </div>
    </Modal>
  ) : null

  const addCategoryModal = showAddCategoryModal ? (
    <Modal
      title="Agregar division"
      onClose={() => setShowAddCategoryModal(false)}
      width={760}
      panelStyle={{ padding: 18 }}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
                    Completa los datos de la division y agrégala a la competencia.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Nombre</label>
            <input value={newCat.nombre} onChange={e => setNewCat(prev => ({ ...prev, nombre: e.target.value }))} placeholder="Ej: Elite, Open, Masters..." />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Modalidad</label>
            <select value={newCat.modality} onChange={e => setNewCat(prev => ({ ...prev, modality: e.target.value }))}>
              <option value="individual">Individual</option>
              <option value="teams" disabled={!form.team_enabled}>Equipos</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Precio base</label>
            <input type="number" min="0" step="1" value={newCat.enrollment_price === '' ? '' : (newCat.enrollment_price || 0)} onChange={e => setNewCat(prev => ({ ...prev, enrollment_price: e.target.value === '' ? '' : (Number(e.target.value) === 0 && prev.enrollment_price !== '' ? '' : e.target.value) }))} onFocus={e => { if (Number(e.target.value) === 0) setNewCat(prev => ({ ...prev, enrollment_price: '' })) }} placeholder="Precio base" />
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? 'auto' : '1 / -1' }}>
            <label>Descripcion</label>
            <textarea value={newCat.descripcion} onChange={e => setNewCat(prev => ({ ...prev, descripcion: e.target.value }))} placeholder="Descripcion de la categoria" rows={4} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setShowAddCategoryModal(false)}>Cancelar</button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (addCategory()) setShowAddCategoryModal(false)
            }}
          >
            Agregar division
          </button>
        </div>
      </div>
    </Modal>
  ) : null

  const addQuestionModal = showAddQuestionModal ? (
    <Modal
      title="Agregar pregunta"
      onClose={() => setShowAddQuestionModal(false)}
      width={760}
      panelStyle={{ padding: 18 }}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
                    Configura la pregunta que verá el atleta en la inscripción.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? 'auto' : '1 / -1' }}>
            <label>Pregunta</label>
            <input value={questionDraft.label} onChange={e => setQuestionDraft(prev => ({ ...prev, label: e.target.value }))} placeholder="Escribe la pregunta" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Tipo</label>
            <select value={questionDraft.field_type || 'text'} onChange={e => setQuestionDraft(prev => ({ ...prev, field_type: e.target.value }))}>
              <option value="text">Solo texto</option>
              <option value="number">Solo numeros</option>
              <option value="image">Imagen</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Estado</label>
            <select value={questionDraft.required ? 'required' : 'optional'} onChange={e => setQuestionDraft(prev => ({ ...prev, required: e.target.value === 'required' ? 1 : 0 }))}>
              <option value="optional">Opcional</option>
              <option value="required">Obligatoria</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? 'auto' : '1 / -1' }}>
            <label>Ayuda</label>
            <input
              value={questionDraft.placeholder}
              onChange={e => setQuestionDraft(prev => ({ ...prev, placeholder: e.target.value }))}
              placeholder={questionDraft.field_type === 'image' ? 'Ej: Sube el comprobante legible' : questionDraft.field_type === 'number' ? 'Ej: Escribe solo numeros' : 'Placeholder opcional'}
            />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setShowAddQuestionModal(false)}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={() => { if (createQuestionFromDraft()) setShowAddQuestionModal(false) }}>
            Agregar pregunta
          </button>
        </div>
      </div>
    </Modal>
  ) : null

  const editingQuestion = questions.find(question => String(question.id) === String(editingQuestionId))
  const editQuestionModal = editingQuestion ? (
    <Modal
      title={`Editar pregunta - ${editingQuestion.label || ''}`}
      onClose={() => setEditingQuestionId(null)}
      width={760}
      panelStyle={{ padding: 18 }}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? 'auto' : '1 / -1' }}>
            <label>Pregunta</label>
            <input value={editingQuestion.label || ''} onChange={e => updateQuestion(editingQuestion.id, 'label', e.target.value)} placeholder="Escribe la pregunta" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Tipo</label>
            <select value={editingQuestion.field_type || 'text'} onChange={e => updateQuestion(editingQuestion.id, 'field_type', e.target.value)}>
              <option value="text">Solo texto</option>
              <option value="number">Solo numeros</option>
              <option value="image">Imagen</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Estado</label>
            <select value={editingQuestion.required ? 'required' : 'optional'} onChange={e => updateQuestion(editingQuestion.id, 'required', e.target.value === 'required' ? 1 : 0)}>
              <option value="optional">Opcional</option>
              <option value="required">Obligatoria</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? 'auto' : '1 / -1' }}>
            <label>Ayuda</label>
            <input
              value={editingQuestion.placeholder || ''}
              onChange={e => updateQuestion(editingQuestion.id, 'placeholder', e.target.value)}
              placeholder={editingQuestion.field_type === 'image' ? 'Ej: Sube el comprobante legible' : editingQuestion.field_type === 'number' ? 'Ej: Escribe solo numeros' : 'Placeholder opcional'}
            />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn-danger btn-sm" onClick={() => { removeQuestion(editingQuestion.id); setEditingQuestionId(null) }}>
            Eliminar
          </button>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingQuestionId(null)}>Cerrar</button>
            <button type="button" className="btn-primary" onClick={() => setEditingQuestionId(null)}>Guardar</button>
          </div>
        </div>
      </div>
    </Modal>
  ) : null

  const addSocialModal = showAddSocialModal ? (
    <Modal
      title="Agregar red social"
      onClose={() => setShowAddSocialModal(false)}
      width={760}
      panelStyle={{ padding: 18 }}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
          Agrega un canal oficial para mostrarlo dentro de la competencia.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Plataforma</label>
            <select value={socialDraft.platform || 'instagram'} onChange={e => setSocialDraft(prev => ({ ...prev, platform: e.target.value }))}>
              {SOCIAL_PLATFORM_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          {socialDraft.platform === 'other' ? (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Nombre visible</label>
              <input value={socialDraft.custom_label || ''} onChange={e => setSocialDraft(prev => ({ ...prev, custom_label: e.target.value }))} placeholder="Nombre de la red o canal" />
            </div>
          ) : null}
          <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? 'auto' : '1 / -1' }}>
            <label>Link</label>
            <input value={socialDraft.url || ''} onChange={e => setSocialDraft(prev => ({ ...prev, url: e.target.value }))} placeholder="https://..." />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setShowAddSocialModal(false)}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={() => { if (createSocialLinkFromDraft()) setShowAddSocialModal(false) }}>
            Agregar red
          </button>
        </div>
      </div>
    </Modal>
  ) : null

  const addScheduleModal = showAddScheduleModal ? (
    <Modal
      title="Agregar fecha visible"
      onClose={() => setShowAddScheduleModal(false)}
      width={760}
      panelStyle={{ padding: 18 }}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
          Agrega una fecha para mostrarla en la vista publica de la competencia.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Nombre visible</label>
            <input value={scheduleDraft.label} onChange={e => setScheduleDraft(prev => ({ ...prev, label: e.target.value }))} placeholder="Ej: Inscripciones abiertas, Dia 1, Final..." />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Tipo</label>
            <select value={scheduleDraft.kind} onChange={e => setScheduleDraft(prev => ({ ...prev, kind: e.target.value }))}>
              <option value="custom">Personalizada</option>
              <option value="enrollment_start">Apertura inscripciones</option>
              <option value="enrollment_end">Cierre inscripciones</option>
              <option value="competition_start">Inicio competencia</option>
              <option value="competition_end">Fin competencia</option>
              <option value="competition_day">Dia de competencia</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Evento enlazado</label>
            <select
              value={scheduleDraft.phase_id || ''}
              onChange={e => {
                const phaseId = e.target.value
                const phaseDates = resolvePhaseDates(phaseId)
                setScheduleDraft(prev => ({
                  ...prev,
                  phase_id: phaseId,
                  use_phase_dates: phaseId ? prev.use_phase_dates : 0,
                  start_at: phaseId && prev.use_phase_dates ? phaseDates.start_at : prev.start_at,
                  end_at: phaseId && prev.use_phase_dates ? phaseDates.end_at : prev.end_at,
                }))
              }}
            >
              <option value="">Sin evento enlazado</option>
              {phases.map(phase => (
                <option key={`new-schedule-phase-${phase.id}`} value={phase.id}>{phase.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Rango del evento</label>
            <button
              type="button"
              className={scheduleDraft.phase_id && scheduleDraft.use_phase_dates ? 'btn-success btn-sm' : 'btn-secondary btn-sm'}
              onClick={() => {
                if (!scheduleDraft.phase_id) return
                const nextUsePhaseDates = scheduleDraft.use_phase_dates ? 0 : 1
                const phaseDates = resolvePhaseDates(scheduleDraft.phase_id)
                setScheduleDraft(prev => ({
                  ...prev,
                  use_phase_dates: nextUsePhaseDates,
                  start_at: nextUsePhaseDates ? phaseDates.start_at : prev.start_at,
                  end_at: nextUsePhaseDates ? phaseDates.end_at : prev.end_at,
                }))
              }}
              disabled={!scheduleDraft.phase_id}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {scheduleDraft.phase_id && scheduleDraft.use_phase_dates ? 'Usa fechas del evento' : 'Usar fechas del evento'}
            </button>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Inicio</label>
            <input type="date" value={scheduleDraft.start_at} disabled={!!scheduleDraft.phase_id && !!scheduleDraft.use_phase_dates} onChange={e => setScheduleDraft(prev => ({ ...prev, start_at: e.target.value }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Fin</label>
            <input type="date" value={scheduleDraft.end_at} disabled={!!scheduleDraft.phase_id && !!scheduleDraft.use_phase_dates} onChange={e => setScheduleDraft(prev => ({ ...prev, end_at: e.target.value }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? 'auto' : '1 / -1' }}>
            <label>Nota</label>
            <input value={scheduleDraft.note} onChange={e => setScheduleDraft(prev => ({ ...prev, note: e.target.value }))} placeholder="Nota opcional. Ej: Clasificatorio online o puertas abiertas 7:00 am" />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setShowAddScheduleModal(false)}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={() => { if (createScheduleItemFromDraft()) setShowAddScheduleModal(false) }}>
            Agregar fecha
          </button>
        </div>
      </div>
    </Modal>
  ) : null

  const editingSchedule = scheduleItems.find(item => String(item.id) === String(editingScheduleId))
  const editScheduleModal = editingSchedule ? (
    <Modal
      title={`Editar fecha - ${editingSchedule.label || 'Fecha visible'}`}
      onClose={() => setEditingScheduleId(null)}
      width={760}
      panelStyle={{ padding: 18 }}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Nombre visible</label>
            <input value={editingSchedule.label || ''} onChange={e => updateScheduleItem(editingSchedule.id, 'label', e.target.value)} placeholder="Ej: Inscripciones abiertas, Dia 1, Final..." />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Tipo</label>
            <select value={editingSchedule.kind || 'custom'} onChange={e => updateScheduleItem(editingSchedule.id, 'kind', e.target.value)}>
              <option value="custom">Personalizada</option>
              <option value="enrollment_start">Apertura inscripciones</option>
              <option value="enrollment_end">Cierre inscripciones</option>
              <option value="competition_start">Inicio competencia</option>
              <option value="competition_end">Fin competencia</option>
              <option value="competition_day">Dia de competencia</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Evento enlazado</label>
            <select value={editingSchedule.phase_id || ''} onChange={e => linkScheduleItemToPhase(editingSchedule.id, e.target.value)}>
              <option value="">Sin evento enlazado</option>
              {phases.map(phase => (
                <option key={`edit-schedule-phase-${editingSchedule.id}-${phase.id}`} value={phase.id}>{phase.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Rango del evento</label>
            <button
              type="button"
              className={editingSchedule.phase_id && editingSchedule.use_phase_dates ? 'btn-success btn-sm' : 'btn-secondary btn-sm'}
              onClick={() => toggleScheduleItemPhaseDates(editingSchedule.id)}
              disabled={!editingSchedule.phase_id}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {editingSchedule.phase_id && editingSchedule.use_phase_dates ? 'Usa fechas del evento' : 'Usar fechas del evento'}
            </button>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Inicio</label>
            <input type="date" value={editingSchedule.start_at || ''} disabled={!!editingSchedule.phase_id && !!editingSchedule.use_phase_dates} onChange={e => updateScheduleItem(editingSchedule.id, 'start_at', e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Fin</label>
            <input type="date" value={editingSchedule.end_at || ''} disabled={!!editingSchedule.phase_id && !!editingSchedule.use_phase_dates} onChange={e => updateScheduleItem(editingSchedule.id, 'end_at', e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? 'auto' : '1 / -1' }}>
            <label>Nota</label>
            <input value={editingSchedule.note || ''} onChange={e => updateScheduleItem(editingSchedule.id, 'note', e.target.value)} placeholder="Nota opcional. Ej: Clasificatorio online o puertas abiertas 7:00 am" />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn-danger btn-sm" onClick={() => { removeScheduleItem(editingSchedule.id); setEditingScheduleId(null) }}>
            Eliminar
          </button>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingScheduleId(null)}>Cerrar</button>
            <button type="button" className="btn-primary" onClick={() => setEditingScheduleId(null)}>Guardar</button>
          </div>
        </div>
      </div>
    </Modal>
  ) : null

  const editingSocial = socialLinks.find(item => String(item.id) === String(editingSocialId))
  const editSocialModal = editingSocial ? (
    <Modal
      title={`Editar red - ${getSocialPlatformLabel(editingSocial)}`}
      onClose={() => setEditingSocialId(null)}
      width={760}
      panelStyle={{ padding: 18 }}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Plataforma</label>
            <select value={editingSocial.platform || 'instagram'} onChange={e => updateSocialLink(editingSocial.id, 'platform', e.target.value)}>
              {SOCIAL_PLATFORM_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          {editingSocial.platform === 'other' ? (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Nombre visible</label>
              <input value={editingSocial.custom_label || ''} onChange={e => updateSocialLink(editingSocial.id, 'custom_label', e.target.value)} placeholder="Nombre de la red o canal" />
            </div>
          ) : null}
          <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? 'auto' : '1 / -1' }}>
            <label>Link</label>
            <input value={editingSocial.url || ''} onChange={e => updateSocialLink(editingSocial.id, 'url', e.target.value)} placeholder="https://..." />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn-danger btn-sm" onClick={() => { removeSocialLink(editingSocial.id); setEditingSocialId(null) }}>
            Eliminar
          </button>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingSocialId(null)}>Cerrar</button>
            <button type="button" className="btn-primary" onClick={() => setEditingSocialId(null)}>Guardar</button>
          </div>
        </div>
      </div>
    </Modal>
  ) : null

  const editingCategory = cats.find(cat => String(cat.id) === String(editingCategoryId))
  const editCategoryModal = editingCategory ? (
    <Modal
      title={`Editar division - ${editingCategory.nombre || ''}`}
      onClose={() => setEditingCategoryId(null)}
      width={760}
      panelStyle={{ padding: 18 }}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Nombre</label>
            <input value={editingCategory.nombre || ''} onChange={e => updateCategoryName(editingCategory.id, e.target.value)} placeholder="Nombre de la division" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Modalidad</label>
            <select value={editingCategory.modality || 'individual'} onChange={e => updateCategoryModality(editingCategory.id, e.target.value)}>
              <option value="individual">Individual</option>
              <option value="teams" disabled={!form.team_enabled}>Equipos</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Precio base</label>
            <input type="number" min="0" step="1" value={editingCategory.enrollment_price === '' ? '' : (editingCategory.enrollment_price || 0)} onChange={e => updateCategoryPrice(editingCategory.id, e.target.value)} onFocus={e => { if (Number(e.target.value) === 0) updateCategoryPrice(editingCategory.id, '') }} placeholder="Precio base de inscripcion" />
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? 'auto' : '1 / -1' }}>
            <label>Descripcion</label>
            <textarea value={editingCategory.descripcion || ''} onChange={e => updateCategoryDescription(editingCategory.id, e.target.value)} placeholder="Descripcion de la categoria" rows={4} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(255,255,255,0.02)', padding: '10px 12px' }}>
            <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 4 }}>Tu precio</div>
            <div style={{ color: '#F5F7FA', fontSize: 14, fontWeight: 800 }}>{formatCop(calculateEnrollmentPricing(editingCategory.enrollment_price, effectivePlatformFeeRate).organizerPrice)}</div>
          </div>
          <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(255,255,255,0.02)', padding: '10px 12px' }}>
            <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 4 }}>Comision FinalRep</div>
            <div style={{ color: '#FFB36F', fontSize: 14, fontWeight: 800 }}>{formatCop(calculateEnrollmentPricing(editingCategory.enrollment_price, effectivePlatformFeeRate).platformFee)}</div>
          </div>
          <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(255,255,255,0.02)', padding: '10px 12px' }}>
            <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 4 }}>Paga el atleta</div>
            <div style={{ color: '#8DF1E4', fontSize: 14, fontWeight: 800 }}>{formatCop(calculateEnrollmentPricing(editingCategory.enrollment_price, effectivePlatformFeeRate).totalPrice)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-danger btn-sm"
            onClick={() => {
              removeCategory(editingCategory.id)
              setEditingCategoryId(null)
            }}
          >
            Eliminar
          </button>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingCategoryId(null)}>Cerrar</button>
            <button type="button" className="btn-primary" onClick={() => setEditingCategoryId(null)}>Guardar</button>
          </div>
        </div>
      </div>
    </Modal>
  ) : null

  const editingPhase = phases.find(phase => String(phase.id) === String(editingPhaseId))
  const editPhaseModal = editingPhase ? (
    <Modal
      title={`Editar evento - ${editingPhase.nombre || ''}`}
      onClose={() => setEditingPhaseId(null)}
      width={760}
      panelStyle={{ padding: 18 }}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {/* ---- DATOS BASICOS ---- */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Bloque</label>
            <input value={editingPhase.block_name || ''} onChange={e => updatePhase(editingPhase.id, 'block_name', e.target.value)} placeholder="Ej: Workout 1" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Nombre del evento</label>
            <input value={editingPhase.nombre || ''} onChange={e => updatePhase(editingPhase.id, 'nombre', e.target.value)} placeholder="Nombre visible" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Modalidad</label>
            <select value={editingPhase.modality || 'individual'} onChange={e => updatePhase(editingPhase.id, 'modality', e.target.value)}>
              <option value="individual">Individual</option>
              <option value="teams" disabled={!form.team_enabled}>Equipos</option>
            </select>
          </div>
          {form.team_enabled && editingPhase.modality === 'teams' ? (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Resultado por equipo</label>
              <select value={editingPhase.team_result_mode || 'sum_two'} onChange={e => updatePhase(editingPhase.id, 'team_result_mode', e.target.value)}>
                <option value="sum_two">Equipo: ambos</option>
                <option value="total">Equipo: total</option>
                <option value="single_member">Equipo: uno</option>
              </select>
            </div>
          ) : null}
          {(() => {
            const compStart = parseCalendarDate(form.competition_start)
            const compEnd = parseCalendarDate(form.competition_end)
            const competitionDays = []
            if (compStart && compEnd) {
              const cursor = new Date(compStart)
              cursor.setHours(0, 0, 0, 0)
              const end = new Date(compEnd)
              end.setHours(0, 0, 0, 0)
              let dayIndex = 1
              while (cursor <= end) {
                competitionDays.push({
                  label: `Dia ${dayIndex} - ${cursor.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}`,
                  value: cursor.toISOString().slice(0, 10),
                })
                cursor.setDate(cursor.getDate() + 1)
                dayIndex++
              }
            }
            if (competitionDays.length > 0) {
              return (
                <div style={{ display: 'grid', gap: 8, gridColumn: isMobile ? 'auto' : '1 / -1' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#5EEAD4', textTransform: 'uppercase', letterSpacing: 0.8 }}>Dia del evento</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {competitionDays.map(day => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => {
                          const next = editingPhase.start_at === day.value ? '' : day.value
                          updatePhase(editingPhase.id, 'start_at', next)
                          updatePhase(editingPhase.id, 'end_at', next)
                        }}
                        style={{
                          borderRadius: 999,
                          border: editingPhase.start_at === day.value ? '1px solid rgba(214,217,224,0.6)' : '1px solid #252A33',
                          background: editingPhase.start_at === day.value ? 'rgba(214,217,224,0.18)' : 'rgba(13,15,18,0.72)',
                          color: editingPhase.start_at === day.value ? '#FFD0AE' : '#AAB2C0',
                          padding: '8px 14px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            }
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Inicio</label>
                  <input type="date" value={editingPhase.start_at || ''} onChange={e => updatePhase(editingPhase.id, 'start_at', e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Fin</label>
                  <input type="date" value={editingPhase.end_at || ''} onChange={e => updatePhase(editingPhase.id, 'end_at', e.target.value)} />
                </div>
              </div>
            )
          })()}
        </div>

        {/* ---- TOGGLE DOS PUNTAJES ---- */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, border: '1px solid #252A33', background: 'rgba(13,15,18,0.5)' }}>
                <span style={{ fontSize: 13, color: '#AAB2C0' }}>¿Este WOD tiene dos puntajes?</span>
          <label htmlFor={`edit-phase-toggle-part-b-${editingPhase.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: editingPhase.part_b_enabled ? '#D6D9E0' : '#6B7280' }}>
                    {editingPhase.part_b_enabled ? 'Sí' : 'No'}
            </span>
            <span style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
              <input id={`edit-phase-toggle-part-b-${editingPhase.id}`} type="checkbox" checked={!!editingPhase.part_b_enabled}
                onChange={e => updatePhase(editingPhase.id, 'part_b_enabled', e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
              <span style={{ position: 'absolute', inset: 0, borderRadius: 999, cursor: 'pointer', background: editingPhase.part_b_enabled ? '#D6D9E0' : '#374151', transition: 'background 0.2s' }} />
              <span style={{ position: 'absolute', top: 3, left: editingPhase.part_b_enabled ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', pointerEvents: 'none' }} />
            </span>
          </label>
        </div>

        {/* ---- WOD BASE (Parte A) ---- */}
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#5EEAD4', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {editingPhase.part_b_enabled ? 'Parte A' : 'WOD Base'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Medicion</label>
              <select value={normalizeMeasurementMethod(editingPhase.measurement_method, editingPhase.tipo)} onChange={e => updatePhase(editingPhase.id, 'measurement_method', e.target.value)}>
                {PHASE_MEASUREMENT_METHODS.map(m => <option key={m} value={m}>{PHASE_MEASUREMENT_LABELS[m] || m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>{normalizeMeasurementMethod(editingPhase.measurement_method, editingPhase.tipo) === 'for_time' ? 'Time cap' : 'Duracion'} <span style={{ color: '#6B7280', fontWeight: 400 }}>(min)</span></label>
              <input
                type="number" min="1" max="999"
                value={editingPhase.time_cap || ''}
                onChange={e => updatePhase(editingPhase.id, 'time_cap', e.target.value.replace(/\D/g, ''))}
                placeholder="Ej: 20"
                style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
                onWheel={e => e.target.blur()}
              />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>WOD{editingPhase.part_b_enabled ? ' Parte A' : ''}</label>
            <textarea rows={4} value={editingPhase.descripcion || ''} onChange={e => updatePhase(editingPhase.id, 'descripcion', e.target.value)} placeholder={'Escribe el WOD aqui...'} style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }} />
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {normalizeMeasurementMethod(editingPhase.measurement_method, editingPhase.tipo) === 'rm' && (
              <div style={{ borderRadius: 12, border: '1px solid rgba(94,234,212,0.2)', background: 'rgba(94,234,212,0.08)', padding: '10px 12px', color: '#D9FFFA', fontSize: 12 }}>
                {`Este evento RM usará ${String(form.rm_unit || 'kg').toUpperCase()} como unidad global de la competencia.`}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, border: '1px solid #252A33', background: 'rgba(13,15,18,0.5)' }}>
              <span style={{ fontSize: 13, color: '#AAB2C0' }}>Mostrar evento en la vista previa y pública</span>
              <label htmlFor={`edit-phase-toggle-visible-${editingPhase.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: editingPhase.is_visible ? '#D6D9E0' : '#6B7280' }}>
                  {editingPhase.is_visible ? 'Visible' : 'Oculto'}
                </span>
                <span style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
                  <input
                    id={`edit-phase-toggle-visible-${editingPhase.id}`}
                    type="checkbox"
                    checked={!!editingPhase.is_visible}
                    onChange={e => updatePhase(editingPhase.id, 'is_visible', e.target.checked ? 1 : 0)}
                    style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                  />
                  <span style={{ position: 'absolute', inset: 0, borderRadius: 999, cursor: 'pointer', background: editingPhase.is_visible ? '#D6D9E0' : '#374151', transition: 'background 0.2s' }} />
                  <span style={{ position: 'absolute', top: 3, left: editingPhase.is_visible ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', pointerEvents: 'none' }} />
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* ---- PARTE B ---- */}
        {editingPhase.part_b_enabled && (
          <div style={{ display: 'grid', gap: 10, borderRadius: 12, border: '1px solid rgba(214,217,224,0.25)', background: 'rgba(214,217,224,0.04)', padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#D6D9E0', textTransform: 'uppercase', letterSpacing: 0.8 }}>Parte B</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Medicion</label>
                <select value={editingPhase.part_b_measurement_method || 'for_time'} onChange={e => updatePhase(editingPhase.id, 'part_b_measurement_method', e.target.value)}>
                  {PHASE_MEASUREMENT_METHODS.map(m => <option key={m} value={m}>{PHASE_MEASUREMENT_LABELS[m] || m}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{(editingPhase.part_b_measurement_method || 'for_time') === 'for_time' ? 'Time cap' : 'Duracion'} <span style={{ color: '#6B7280', fontWeight: 400 }}>(min)</span></label>
                <input
                  type="number" min="1" max="999"
                  value={editingPhase.part_b_time_cap || ''}
                  onChange={e => updatePhase(editingPhase.id, 'part_b_time_cap', e.target.value.replace(/\D/g, ''))}
                  placeholder="Ej: 5"
                  style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
                  onWheel={e => e.target.blur()}
                />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>WOD Parte B</label>
              <textarea rows={3} value={editingPhase.part_b_descripcion || ''} onChange={e => updatePhase(editingPhase.id, 'part_b_descripcion', e.target.value)} placeholder={'Describe la parte B...'} style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }} />
            </div>
          </div>
        )}

        {/* ---- CONFIGURACION POR CATEGORIA ---- */}
        {cats.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,193,7,0.3)', background: 'rgba(255,193,7,0.07)', color: '#FFD700', fontSize: 13 }}>
                    <span style={{ fontWeight: 700 }}>⚠</span>
                    <span>No hay categorías creadas. Ve a la sección <strong>Divisiones</strong> y crea las categorías primero.</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#5EEAD4', textTransform: 'uppercase', letterSpacing: 0.8 }}>Configuracion por categoria</div>
            {cats.map(cat => {
              const phaseCatOverrides = editingPhase.catOverrides || {}
              const override = phaseCatOverrides[cat.id] || {}
              const isModified = !!override.modified
              const toggleId = `edit-phase-cat-toggle-${editingPhase.id}-${cat.id}`
              return (
                <div key={cat.id} style={{ borderRadius: 12, border: `1px solid ${isModified ? 'rgba(214,217,224,0.35)' : '#252A33'}`, background: '#171B21', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 8px' }}>
                    <span style={{ padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 900, background: 'rgba(107,114,128,0.18)', border: '1px solid rgba(107,114,128,0.25)', color: '#9CA3AF', letterSpacing: 0.5, flexShrink: 0 }}>
                      {cat.nombre.split(' ')[0].toUpperCase()}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#F5F7FA' }}>{cat.nombre}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: isModified ? 'rgba(214,217,224,0.15)' : 'rgba(94,234,212,0.12)', border: `1px solid ${isModified ? 'rgba(214,217,224,0.35)' : 'rgba(94,234,212,0.22)'}`, color: isModified ? '#FFD0AE' : '#D9FFFA' }}>
                      {isModified ? 'Modificado' : 'Hereda base'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 14px 10px' }}>
                          <span style={{ fontSize: 13, color: '#AAB2C0' }}>¿Modificar el WOD para esta categoria?</span>
                    <label htmlFor={toggleId} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: '#6B7280' }}>{isModified ? '' : 'No'}</span>
                      <span style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
                        <input id={toggleId} type="checkbox" checked={isModified}
                          onChange={e => updatePhase(editingPhase.id, 'catOverrides', { ...phaseCatOverrides, [cat.id]: { ...override, modified: e.target.checked } })}
                          style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                        />
                        <span style={{ position: 'absolute', inset: 0, borderRadius: 999, cursor: 'pointer', background: isModified ? '#D6D9E0' : '#374151', transition: 'background 0.2s' }} />
                        <span style={{ position: 'absolute', top: 3, left: isModified ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', pointerEvents: 'none' }} />
                      </span>
                    </label>
                  </div>
                  {isModified && (
                    <div style={{ padding: '0 14px 14px', display: 'grid', gap: 12 }}>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {editingPhase.part_b_enabled && <div style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6 }}>Parte A</div>}
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>{normalizeMeasurementMethod(editingPhase.measurement_method, editingPhase.tipo) === 'for_time' ? 'Time cap' : 'Duracion'} <span style={{ color: '#6B7280', fontWeight: 400 }}>(min)</span></label>
                          <input
                            type="number" min="1" max="999"
                            value={override.time_cap ?? ''}
                            onChange={e => updatePhase(editingPhase.id, 'catOverrides', { ...phaseCatOverrides, [cat.id]: { ...override, time_cap: e.target.value.replace(/\D/g, '') } })}
                            placeholder={editingPhase.time_cap ? `${editingPhase.time_cap} (hereda base)` : 'Ej: 20'}
                            style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
                            onWheel={e => e.target.blur()}
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>WOD{editingPhase.part_b_enabled ? ' Parte A' : ''}</label>
                          <textarea
                            value={override.text || ''}
                            onChange={e => updatePhase(editingPhase.id, 'catOverrides', { ...phaseCatOverrides, [cat.id]: { ...override, text: e.target.value } })}
                            placeholder={editingPhase.descripcion ? `${editingPhase.descripcion}\n\n(edita para sobreescribir)` : `WOD especifico para ${cat.nombre}...`}
                            rows={4}
                            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>
                      {editingPhase.part_b_enabled && (
                        <div style={{ display: 'grid', gap: 8, borderTop: '1px solid #252A33', paddingTop: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6 }}>Parte B</div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>{(editingPhase.part_b_measurement_method || 'for_time') === 'for_time' ? 'Time cap' : 'Duracion'} <span style={{ color: '#6B7280', fontWeight: 400 }}>(min)</span></label>
                            <input
                              type="number" min="1" max="999"
                              value={override.part_b_time_cap ?? ''}
                              onChange={e => updatePhase(editingPhase.id, 'catOverrides', { ...phaseCatOverrides, [cat.id]: { ...override, part_b_time_cap: e.target.value.replace(/\D/g, '') } })}
                              placeholder={editingPhase.part_b_time_cap ? `${editingPhase.part_b_time_cap} (hereda base)` : 'Ej: 5'}
                              style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
                              onWheel={e => e.target.blur()}
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>WOD Parte B</label>
                            <textarea
                              value={override.part_b_text || ''}
                              onChange={e => updatePhase(editingPhase.id, 'catOverrides', { ...phaseCatOverrides, [cat.id]: { ...override, part_b_text: e.target.value } })}
                              placeholder={`Parte B especifica para ${cat.nombre}...`}
                              rows={3}
                              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-danger btn-sm"
            onClick={() => {
              removePhase(editingPhase.id)
              setEditingPhaseId(null)
            }}
          >
            Eliminar
          </button>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingPhaseId(null)}>Cerrar</button>
            <button type="button" className="btn-primary" onClick={() => setEditingPhaseId(null)}>Guardar</button>
          </div>
        </div>
      </div>
    </Modal>
  ) : null

  if (inline) {
    return (
      <>
        <div>
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: 0, fontSize: 16 }}>Configuracion</h4>
            <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>
              Edita identidad, modelo de salida, registro, pagos, divisiones y eventos directamente desde el workspace.
            </div>
          </div>
          {formContent}
        </div>
        {addCategoryModal}
        {editCategoryModal}
        {addQuestionModal}
        {editQuestionModal}
        {addPhaseModal}
        {editPhaseModal}
        {addScheduleModal}
        {editScheduleModal}
        {addSocialModal}
        {editSocialModal}
        {showThemePreview ? (
          <Modal
            title="Preview del tema"
            onClose={() => setShowThemePreview(false)}
            width={760}
            panelStyle={{ padding: 18 }}
          >
            <div style={{ display: 'grid', gap: 12, overflowY: 'auto' }}>
              <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, lineHeight: 1.5 }}>
                Vista rapida del layout publico con los colores actuales del formulario.
              </div>
              <CompetitionThemeMiniPreview theme={previewTheme} />
            </div>
          </Modal>
        ) : null}
      </>
    )
  }

  return (
    <>
      <Modal
        title={isEdit ? `Editar competencia - ${competition?.nombre || ''}` : 'Nueva competencia'}
        onClose={onClose}
        width={760}
        panelStyle={{
          background: '#171b21',
          border: '1px solid #252a33',
          borderRadius: 22,
          boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
        }}
        titleStyle={{ color: 'var(--oa-text)', fontSize: 18, fontWeight: 800 }}
        closeButtonStyle={{
          width: 34,
          height: 34,
          borderRadius: 12,
          border: '1px solid #252a33',
          background: 'transparent',
          color: 'var(--oa-text)',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        {formContent}
      </Modal>
      {addCategoryModal}
      {editCategoryModal}
      {addQuestionModal}
      {editQuestionModal}
      {addPhaseModal}
      {editPhaseModal}
      {addScheduleModal}
      {editScheduleModal}
      {addSocialModal}
      {editSocialModal}
      {showThemePreview ? (
        <Modal
          title="Preview del tema"
          onClose={() => setShowThemePreview(false)}
          width={760}
          panelStyle={{ padding: 18 }}
        >
          <div style={{ display: 'grid', gap: 12, overflowY: 'auto' }}>
            <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, lineHeight: 1.5 }}>
              Vista rapida del layout publico con los colores actuales del formulario.
            </div>
            <CompetitionThemeMiniPreview theme={previewTheme} />
          </div>
        </Modal>
      ) : null}
    </>
  )
}

// -- Timer Panel ---------------------------------------------------------------
function CompetitionTimerPanel({ competition }) {
  const [timer, setTimer] = useState(null)
  const [durationInput, setDurationInput] = useState('')
  const [currentInput, setCurrentInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [timerClockOffsetMs, setTimerClockOffsetMs] = useState(null)
  const [now, setNow] = useState(Date.now())
  const tickRef = useRef(null)

  const syncClockFromResponse = (payload, sentAt, receivedAt) => {
    const serverNowMs = Date.parse(payload?.server_now || '')
    if (!Number.isFinite(serverNowMs)) return
    const midpoint = sentAt + ((receivedAt - sentAt) / 2)
    const targetOffset = serverNowMs - midpoint
    setTimerClockOffsetMs(prev => (prev == null ? targetOffset : (prev + ((targetOffset - prev) * 0.2))))
  }

  const load = () => {
    const sentAt = Date.now()
    return api.get(`/competitions/${competition.id}/timer`)
      .then(r => {
        const receivedAt = Date.now()
        syncClockFromResponse(r.data, sentAt, receivedAt)
        setTimer(r.data)
      })
      .catch(() => {})
  }

  useEffect(() => {
    setTimerClockOffsetMs(null)
    load()
  }, [competition.id])

  useEffect(() => {
    setNow(Date.now() + (timerClockOffsetMs || 0))
    tickRef.current = setInterval(() => setNow(Date.now() + (timerClockOffsetMs || 0)), 500)
    return () => clearInterval(tickRef.current)
  }, [timerClockOffsetMs])

  useEffect(() => {
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [competition.id])

  const action = async (act, extra = {}) => {
    setBusy(true)
    setMsg(null)
    try {
      const sentAt = Date.now()
      const r = await api.post(`/competitions/${competition.id}/timer`, { action: act, ...extra })
      syncClockFromResponse(r.data, sentAt, Date.now())
      setTimer(r.data)
    } catch (err) {
      setMsg(err.response?.data?.detail || 'Error')
    } finally {
      setBusy(false)
    }
  }

  const parseClockInput = (raw, assumeSingleIsMinutes = false) => {
    const v = String(raw || '').trim()
    if (!v) return NaN
    const parts = v.split(':').map(p => Number(p))
    if (parts.some(n => !Number.isFinite(n) || n < 0)) return NaN
    if (parts.length === 1) return assumeSingleIsMinutes ? (parts[0] * 60) : parts[0]
    if (parts.length === 2) return (parts[0] * 60) + parts[1]
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2]
    return NaN
  }

  const applyDuration = async () => {
    const secs = parseClockInput(durationInput, true)
    if (!secs || secs <= 0) { setMsg('Ingresa un tiempo valido (MM:SS o MM)'); return }
    await action('set', { duration: secs })
    setDurationInput('')
  }

  const applyCurrent = async () => {
    const secs = parseClockInput(currentInput, true)
    if (!Number.isFinite(secs) || secs < 0) {
      setMsg('Ingresa un valor valido (MM:SS, HH:MM:SS o MM)')
      return
    }
    await action('set_current', { current_seconds: Math.floor(secs) })
    setCurrentInput('')
  }

  const applyMode = async (mode) => {
    await action('config', { mode })
  }

  const applyFormat = async (format) => {
    await action('config', { format })
  }

  const fmtSecs = (totalSecs, fmt) => {
    const s = Math.max(0, Math.floor(totalSecs))
    if (fmt === 'hh:mm:ss') {
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      const ss = s % 60
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    }
    if (fmt === 'mmm:ss') {
      const m = Math.floor(s / 60)
      const ss = s % 60
      return `${String(m).padStart(3, '0')}:${String(ss).padStart(2, '0')}`
    }
    // mm:ss (default)
    const m = Math.floor(s / 60)
    const ss = s % 60
    return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  }

  const computeDisplay = () => {
    if (!timer) return null
    let elapsed = timer.elapsed_before_pause || 0
    if (timer.state === 'running' && timer.started_at) {
      elapsed += (now - new Date(timer.started_at).getTime()) / 1000
    }
    const mode = timer.mode || 'countdown'
    const fmt = timer.format || 'mm:ss'
    if (mode === 'stopwatch') {
      return fmtSecs(elapsed, fmt)
    }
    // countdown
    if (!timer.duration) return null
    return fmtSecs(Math.max(0, timer.duration - elapsed), fmt)
  }

  const mode = timer?.mode || 'countdown'
  const fmt = timer?.format || 'mm:ss'
  const isRunning = timer?.state === 'running'
  const isPaused = timer?.state === 'paused'
  const isFinished = timer?.state === 'finished'
  const isStopped = timer?.state === 'stopped'
  const isStopwatch = mode === 'stopwatch'
  // Countdown needs a duration; stopwatch is always ready
  const isReady = isStopwatch || (timer?.duration > 0)
  const displayTime = computeDisplay()

  const stateColor = isFinished ? '#c0392b' : isRunning ? '#284017' : '#647063'
  const stateLabel = isRunning ? 'Corriendo' : isPaused ? 'Pausado' : isFinished ? 'Tiempo!' : 'Detenido'

  const modeBtn = (m, label) => (
    <button
      key={m}
      className={mode === m ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
      onClick={() => applyMode(m)}
      disabled={busy || isRunning}
      style={{ minWidth: 110 }}
    >
      {label}
    </button>
  )

  const fmtBtn = (f, label) => (
    <button
      key={f}
      className={fmt === f ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
      onClick={() => applyFormat(f)}
      disabled={busy}
      style={{ minWidth: 90 }}
    >
      {label}
    </button>
  )

  return (
    <div className="card">
      <h4 style={{ marginBottom: 16, fontSize: 15 }}>Cronometro de competencia</h4>

      {msg && <div className="alert alert-error" style={{ marginBottom: 12 }}>{msg}</div>}

      {/* Mode selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: '#647063', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
          Modo
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {modeBtn('stopwatch', (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Clock3 size={14} />
              Cronometro
            </span>
          ))}
          {modeBtn('countdown', (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Hourglass size={14} />
              Cuenta atras
            </span>
          ))}
        </div>
      </div>

      {/* Format selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: '#647063', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
          Formato
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {fmtBtn('mm:ss', 'MM:SS')}
          {fmtBtn('mmm:ss', 'MMM:SS')}
          {fmtBtn('hh:mm:ss', 'HH:MM:SS')}
        </div>
      </div>

      {/* Duration setup (only for countdown) */}
      {!isStopwatch && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: '#647063', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            Duracion (MM:SS o MM)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={durationInput}
              onChange={e => setDurationInput(e.target.value)}
              placeholder="Ej: 12:00 o 20"
              style={{ width: 140 }}
            />
            <button className="btn-secondary btn-sm" onClick={applyDuration} disabled={busy || isRunning}>
              Aplicar
            </button>
          </div>
          {timer?.duration > 0 && (
            <div style={{ marginTop: 6, fontSize: 13, color: '#647063' }}>
              Duracion: <b style={{ color: '#284017' }}>{fmtSecs(timer.duration, fmt)}</b>
            </div>
          )}
        </div>
      )}

      {/* Manual current value setup (recovery/failsafe) */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: '#647063', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
          {isStopwatch ? 'Valor actual (transcurrido)' : 'Valor actual (restante)'}
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={currentInput}
            onChange={e => setCurrentInput(e.target.value)}
            placeholder="Ej: 05:30 o 01:10:00"
            style={{ width: 170 }}
          />
          <button className="btn-secondary btn-sm" onClick={applyCurrent} disabled={busy || isRunning || (!isStopwatch && !isReady)}>
            Ajustar valor
          </button>
        </div>
      </div>

      {/* Big clock display */}
      {(isReady || isStopwatch) && displayTime !== null && (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            fontFamily: 'Bebas Neue, monospace', fontSize: 72, lineHeight: 1,
            color: isFinished ? '#c0392b' : isRunning ? '#284017' : '#aaa',
            letterSpacing: 4,
          }}>
            {isFinished ? 'TIEMPO!' : displayTime}
          </div>
          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: stateColor }}>
            {stateLabel}
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        {!isStopwatch && !isReady ? (
          <div style={{ color: '#647063', fontSize: 13 }}>Configura la duracion primero</div>
        ) : (
          <>
            {(isStopped || isPaused || isFinished) && (
              <button className="btn-primary" onClick={() => action('start')} disabled={busy}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Play size={14} />
                  {isPaused ? 'Reanudar' : 'Iniciar'}
                </span>
              </button>
            )}
            {isRunning && (
              <button className="btn-secondary" onClick={() => action('pause')} disabled={busy}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Pause size={14} />
                  Pausar
                </span>
              </button>
            )}
            {(isRunning || isPaused || isFinished) && (
              <button className="btn-danger btn-sm" onClick={() => action('reset')} disabled={busy}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <RotateCcw size={14} />
                  Reiniciar
                </span>
              </button>
            )}
          </>
        )}
      </div>

      <div style={{ marginTop: 20, fontSize: 12, color: '#888', textAlign: 'center' }}>
        El cronometro es visible en la pantalla del leaderboard / modo TV
      </div>
    </div>
  )
}

function CompetitionTvPanel({ competition, onSaved }) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [leaderboardData, setLeaderboardData] = useState(null)
  const [form, setForm] = useState({
    tv_mode: 'cyclic',
    tv_show_qr: 1,
    tv_show_timer: 1,
    tv_include_total_slide: 1,
    tv_only_finalized_phases: 1,
    tv_rotation_interval_seconds: 24,
    tv_data_refresh_interval_seconds: 5,
    tv_static_view: 'individual',
    tv_static_phase_id: 'total',
    tv_static_individual_category: '',
    tv_static_team_category_mode: '__by_category__',
  })

  const load = async () => {
    setLoading(true)
    setMsg(null)
    try {
      const [cRes, lbRes] = await Promise.all([
        api.get(`/competitions/${competition.id}`),
        api.get(`/leaderboard/${competition.id}`),
      ])
      const c = cRes.data
      setLeaderboardData(lbRes.data)
      setForm({
        tv_mode: c.tv_mode || 'cyclic',
        tv_show_qr: c.tv_show_qr == null ? 1 : c.tv_show_qr,
        tv_show_timer: c.tv_show_timer == null ? 1 : c.tv_show_timer,
        tv_include_total_slide: c.tv_include_total_slide == null ? 1 : c.tv_include_total_slide,
        tv_only_finalized_phases: c.tv_only_finalized_phases == null ? 1 : c.tv_only_finalized_phases,
        tv_rotation_interval_seconds: Number(c.tv_rotation_interval_seconds || 24),
        tv_data_refresh_interval_seconds: Number(c.tv_data_refresh_interval_seconds || 5),
        tv_static_view: c.tv_static_view || 'individual',
        tv_static_phase_id: c.tv_static_phase_id == null ? 'total' : String(c.tv_static_phase_id),
        tv_static_individual_category: c.tv_static_individual_category || '',
        tv_static_team_category_mode: c.tv_static_team_category_mode || '__by_category__',
      })
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo cargar configuracion TV' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [competition.id])

  const phases = leaderboardData?.phases || []
  const showIndividualLeaderboard = !!leaderboardData?.show_individual_leaderboard
  const hasTeams = !!leaderboardData?.has_teams
  const showTeamAllByCategoryOption = !!leaderboardData?.show_team_all_by_category_option
  const showTeamAllGlobalOption = !!leaderboardData?.show_team_all_global_option
  const staticPhase = form.tv_static_phase_id === 'total'
    ? null
    : phases.find(p => String(p.id) === String(form.tv_static_phase_id))
  const staticIndividual = staticPhase ? (staticPhase.individual || {}) : (leaderboardData?.individual || {})
  const staticIndividualCategories = useMemo(
    () => orderCategories(staticIndividual),
    [staticIndividual]
  )
  const staticTeamRows = staticPhase ? (staticPhase.teams || []) : (leaderboardData?.teams || [])
  const staticTeamCategories = useMemo(
    () => [...new Set(staticTeamRows.map(t => t.team_category || 'Sin categoria'))],
    [staticTeamRows]
  )

  useEffect(() => {
    if (!leaderboardData) return
    setForm(prev => {
      const next = { ...prev }
      let changed = false

      // Static view should only expose modes that are actually available for this competition.
      if (next.tv_static_view === 'individual' && !showIndividualLeaderboard) {
        next.tv_static_view = hasTeams ? 'teams' : 'individual'
        changed = true
      }
      if (next.tv_static_view === 'teams' && !hasTeams) {
        next.tv_static_view = showIndividualLeaderboard ? 'individual' : 'teams'
        changed = true
      }

      // If "Total" slide is disabled, do not allow selecting total in fixed phase.
      const hasPhases = phases.length > 0
      const phaseIds = phases.map(p => String(p.id))
      if (!next.tv_include_total_slide && String(next.tv_static_phase_id) === 'total') {
        next.tv_static_phase_id = hasPhases ? String(phases[0].id) : 'total'
        changed = true
      }
      if (String(next.tv_static_phase_id) !== 'total' && !phaseIds.includes(String(next.tv_static_phase_id))) {
        next.tv_static_phase_id = (next.tv_include_total_slide || !hasPhases) ? 'total' : String(phases[0].id)
        changed = true
      }

      if (next.tv_static_view === 'teams') {
        const teamCategoryValid =
          (next.tv_static_team_category_mode === '__by_category__' && showTeamAllByCategoryOption) ||
          (next.tv_static_team_category_mode === '__all__' && showTeamAllGlobalOption) ||
          staticTeamCategories.includes(next.tv_static_team_category_mode)
        if (!teamCategoryValid) {
          next.tv_static_team_category_mode = showTeamAllByCategoryOption
            ? '__by_category__'
            : (showTeamAllGlobalOption ? '__all__' : (staticTeamCategories[0] || '__by_category__'))
          changed = true
        }
      } else {
        if (next.tv_static_individual_category && !staticIndividualCategories.includes(next.tv_static_individual_category)) {
          next.tv_static_individual_category = ''
          changed = true
        }
      }

      return changed ? next : prev
    })
  }, [
    leaderboardData,
    showIndividualLeaderboard,
    hasTeams,
    showTeamAllByCategoryOption,
    showTeamAllGlobalOption,
    phases,
    staticTeamCategories,
    staticIndividualCategories,
  ])

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const payload = {
        tv_mode: form.tv_mode === 'static' ? 'static' : 'cyclic',
        tv_show_qr: form.tv_show_qr ? 1 : 0,
        tv_show_timer: form.tv_show_timer ? 1 : 0,
        tv_include_total_slide: form.tv_include_total_slide ? 1 : 0,
        tv_only_finalized_phases: form.tv_only_finalized_phases ? 1 : 0,
        tv_rotation_interval_seconds: Math.min(120, Math.max(5, Number(form.tv_rotation_interval_seconds || 24))),
        tv_data_refresh_interval_seconds: Math.min(60, Math.max(2, Number(form.tv_data_refresh_interval_seconds || 5))),
        tv_static_view: form.tv_static_view === 'teams' ? 'teams' : 'individual',
        tv_static_phase_id: form.tv_static_phase_id === 'total' ? null : Number(form.tv_static_phase_id),
        tv_static_individual_category: form.tv_static_individual_category || null,
        tv_static_team_category_mode: form.tv_static_team_category_mode || '__by_category__',
      }
      const res = await api.put(`/competitions/${competition.id}`, payload)
      onSaved?.(res.data)
      setMsg({ type: 'success', text: 'Configuracion TV guardada' })
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo guardar configuracion TV' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ color: '#777' }}>Cargando modo TV...</div>

  return (
    <div className="card">
      <h4 style={{ marginBottom: 16, fontSize: 15 }}>Modo TV</h4>
      {msg && <div className={`alert alert-${msg.type}`} style={{ marginBottom: 12 }}>{msg.text}</div>}

      <div style={{ display: 'grid', gap: 12 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Tipo de modo TV</label>
          <select value={form.tv_mode} onChange={e => setForm(f => ({ ...f, tv_mode: e.target.value }))}>
            <option value="cyclic">Ciclico (rota automaticamente)</option>
            <option value="static">Estatico (muestra una sola vista)</option>
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          <button type="button" className={form.tv_show_qr ? 'btn-success btn-sm' : 'btn-secondary btn-sm'} onClick={() => setForm(f => ({ ...f, tv_show_qr: f.tv_show_qr ? 0 : 1 }))}>
            {form.tv_show_qr ? 'TV: QR visible' : 'TV: QR oculto'}
          </button>
          <button type="button" className={form.tv_show_timer ? 'btn-success btn-sm' : 'btn-secondary btn-sm'} onClick={() => setForm(f => ({ ...f, tv_show_timer: f.tv_show_timer ? 0 : 1 }))}>
            {form.tv_show_timer ? 'TV: Cronometro visible' : 'TV: Cronometro oculto'}
          </button>
          <button type="button" className={form.tv_include_total_slide ? 'btn-success btn-sm' : 'btn-secondary btn-sm'} onClick={() => setForm(f => ({ ...f, tv_include_total_slide: f.tv_include_total_slide ? 0 : 1 }))}>
            {form.tv_include_total_slide ? 'TV: Incluye vista Total' : 'TV: Sin vista Total'}
          </button>
          <button type="button" className={form.tv_only_finalized_phases ? 'btn-success btn-sm' : 'btn-secondary btn-sm'} onClick={() => setForm(f => ({ ...f, tv_only_finalized_phases: f.tv_only_finalized_phases ? 0 : 1 }))}>
            {form.tv_only_finalized_phases ? 'TV: Solo eventos finalizados' : 'TV: Todos los eventos'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Tiempo de ciclo (segundos)</label>
            <input type="number" min={5} max={120} value={form.tv_rotation_interval_seconds} onChange={e => setForm(f => ({ ...f, tv_rotation_interval_seconds: Number(e.target.value || 24) }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Refresco de datos (segundos)</label>
            <input type="number" min={2} max={60} value={form.tv_data_refresh_interval_seconds} onChange={e => setForm(f => ({ ...f, tv_data_refresh_interval_seconds: Number(e.target.value || 5) }))} />
          </div>
        </div>

        {form.tv_mode === 'static' && (
          <div style={{ borderTop: '1px solid #d5ddd3', paddingTop: 12, display: 'grid', gap: 10 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Vista fija</label>
              <select value={form.tv_static_view} onChange={e => setForm(f => ({ ...f, tv_static_view: e.target.value }))}>
                {showIndividualLeaderboard && <option value="individual">Individual</option>}
                {hasTeams && <option value="teams">Equipos</option>}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Evento fijo</label>
              <select value={form.tv_static_phase_id} onChange={e => setForm(f => ({ ...f, tv_static_phase_id: e.target.value }))}>
                {form.tv_include_total_slide && <option value="total">Total</option>}
                {phases.map(ph => (
                  <option key={`tv-static-phase-${ph.id}`} value={ph.id}>
                              {ph.nombre}{ph.estado === 'finalizada' ? ' ✓' : (ph.estado === 'en_progreso' ? ' ⏳' : '')}
                  </option>
                ))}
              </select>
            </div>

            {form.tv_static_view === 'individual' ? (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Categoria fija (individual)</label>
                <select value={form.tv_static_individual_category} onChange={e => setForm(f => ({ ...f, tv_static_individual_category: e.target.value }))}>
                  <option value="">Primera disponible</option>
                  {staticIndividualCategories.map(cat => (
                    <option key={`tv-static-cat-${cat}`} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Categoria fija (equipos)</label>
                <select value={form.tv_static_team_category_mode} onChange={e => setForm(f => ({ ...f, tv_static_team_category_mode: e.target.value }))}>
                  {showTeamAllByCategoryOption && <option value="__by_category__">Todos por categoria</option>}
                  {showTeamAllGlobalOption && <option value="__all__">Todos global</option>}
                  {staticTeamCategories.map(cat => (
                    <option key={`tv-static-team-cat-${cat}`} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar modo TV'}</button>
      </div>
    </div>
  )
}

function CompetitionSummaryPanel({ competitionId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/leaderboard/${competitionId}`)
      setData(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cargar el resumen')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [competitionId])

  if (loading) return <div style={{ color: '#777' }}>Cargando resumen...</div>
  if (error) return <div className="alert alert-error">{error}</div>
  if (!data) return null

  const categories = Object.entries(data.individual || {})

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card">
        <h4 style={{ marginBottom: 12, fontSize: 15 }}>Puntajes por categoria (total)</h4>
        {categories.length === 0 ? (
          <div style={{ color: '#666' }}>Sin datos</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {categories.map(([cat, rows]) => (
              <div key={cat}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{cat}</div>
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table>
                  <thead>
                    <tr><th>#</th><th>Participante</th><th>Puntos</th></tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map(r => (
                      <tr key={r.id}>
                        <td>{r.rank}</td>
                        <td>{r.nombre} {r.apellido}</td>
                        <td style={{ fontWeight: 700 }}>{r.total_puntos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h4 style={{ marginBottom: 12, fontSize: 15 }}>Puntajes por evento</h4>
        {(data.phases || []).length === 0 ? (
          <div style={{ color: '#666' }}>Esta competencia no tiene eventos</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {data.phases.map(ph => (
              <div key={ph.id}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{ph.nombre} <span style={{ color: '#647063', fontWeight: 400 }}>({ph.tipo})</span></div>
                {Object.keys(ph.individual || {}).length === 0 ? (
                  <div style={{ color: '#666' }}>Sin resultados en este evento</div>
                ) : (
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table>
                    <thead>
                      <tr><th>Categoria</th><th>Lider</th><th>Puntos</th></tr>
                    </thead>
                    <tbody>
                      {Object.entries(ph.individual || {}).map(([cat, rows]) => (
                        <tr key={`${ph.id}-${cat}`}>
                          <td>{cat}</td>
                          <td>{rows?.[0] ? `${rows[0].nombre} ${rows[0].apellido}` : '-'}</td>
                          <td>{rows?.[0]?.total_puntos ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CompetitionTeamsPanel({ competition }) {
  const [teams, setTeams] = useState([])
  const [participantPool, setParticipantPool] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ nombre: '', member_ids: [], captain_id: null })
  const [searchCreate, setSearchCreate] = useState('')
  const [editingTeam, setEditingTeam] = useState(null)
  const [editForm, setEditForm] = useState({ nombre: '', member_ids: [], captain_id: null })
  const [searchEdit, setSearchEdit] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [teamsRes, participantsRes] = await Promise.all([
        api.get(`/teams?competition_id=${competition.id}`),
        api.get(`/competitions/${competition.id}/participants`),
      ])
      setTeams(teamsRes.data || [])
      setParticipantPool((participantsRes.data || []).filter(p => p.estado === 'confirmado'))
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudieron cargar los datos de equipos')
    } finally {
      setLoading(false)
    }
  }

  const usedIds = new Set(teams.flatMap(t => (t.members || []).map(m => m.id)))
  const defaultTeamName = (() => {
    const used = new Set(
      teams
        .map(t => (t.nombre || '').trim())
        .filter(Boolean)
    )
    let idx = 1
    while (used.has(`Equipo ${idx}`)) idx += 1
    return `Equipo ${idx}`
  })()
  const establishedTeamSize = (() => {
    const counts = teams.map(t => (t.members || []).length).filter(n => n > 0)
    return counts.length ? counts[0] : 2
  })()
  const availableForCreate = participantPool
    .filter(p => !usedIds.has(p.id) || createForm.member_ids.includes(p.id))
    .filter(p => `${p.nombre} ${p.apellido} ${formatCedula(p.cedula, '')}`.toLowerCase().includes(searchCreate.toLowerCase()))
  const memberTeamByParticipant = teams.reduce((acc, t) => {
    ;(t.members || []).forEach(m => { acc[m.id] = t })
    return acc
  }, {})
  const usedIdsExceptEditing = new Set(
    teams
      .filter(t => t.id !== editingTeam?.id)
      .flatMap(t => (t.members || []).map(m => m.id))
  )
  const availableForEdit = participantPool
    .filter(p => !usedIdsExceptEditing.has(p.id) || editForm.member_ids.includes(p.id))
    .filter(p => `${p.nombre} ${p.apellido} ${formatCedula(p.cedula, '')}`.toLowerCase().includes(searchEdit.toLowerCase()))

  const toggleCreateMember = (pid) => {
    const ids = createForm.member_ids
    if (ids.includes(pid)) {
      const next = ids.filter(i => i !== pid)
      const nextCaptain = createForm.captain_id === pid ? (next[0] || null) : createForm.captain_id
      setCreateForm({ ...createForm, member_ids: next, captain_id: nextCaptain })
    } else {
      if (ids.length >= MAX_TEAM_SIZE) return
      const next = [...ids, pid]
      setCreateForm({ ...createForm, member_ids: next, captain_id: createForm.captain_id || pid })
    }
  }

  const toggleEditMember = (pid) => {
    const ids = editForm.member_ids
    if (ids.includes(pid)) {
      const next = ids.filter(i => i !== pid)
      const nextCaptain = editForm.captain_id === pid ? (next[0] || null) : editForm.captain_id
      setEditForm({ ...editForm, member_ids: next, captain_id: nextCaptain })
    } else {
      if (ids.length >= MAX_TEAM_SIZE) return
      setEditForm({ ...editForm, member_ids: [...ids, pid] })
    }
  }

  const createTeam = async (e) => {
    e.preventDefault()
    if (createForm.member_ids.length !== establishedTeamSize) {
      setMsg({ type: 'error', text: `Cada equipo debe tener exactamente ${establishedTeamSize} integrantes` })
      return
    }
    try {
      await api.post('/teams', {
        nombre: createForm.nombre,
        competition_id: competition.id,
        member_ids: createForm.member_ids,
        captain_id: createForm.captain_id || createForm.member_ids[0] || null,
      })
      setMsg({ type: 'success', text: 'Equipo creado' })
      setShowCreate(false)
      setCreateForm({ nombre: '', member_ids: [], captain_id: null })
      setSearchCreate('')
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo crear el equipo' })
    }
  }

  const startEdit = (team) => {
    setEditingTeam(team)
    setEditForm({ nombre: (team.nombre || '').trim(), member_ids: (team.members || []).map(m => m.id), captain_id: team.captain_id || null })
    setSearchEdit('')
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if (!editingTeam) return
    if (editForm.member_ids.length !== establishedTeamSize) {
      setMsg({ type: 'error', text: `Cada equipo debe tener exactamente ${establishedTeamSize} integrantes` })
      return
    }
    try {
      await api.put(`/teams/${editingTeam.id}`, {
        nombre: editForm.nombre,
        member_ids: editForm.member_ids,
        captain_id: editForm.captain_id || editForm.member_ids[0] || null,
      })
      setMsg({ type: 'success', text: 'Equipo actualizado' })
      setEditingTeam(null)
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo actualizar el equipo' })
    }
  }

  const removeTeam = async (teamId) => {
    if (!confirm('Eliminar este equipo?')) return
    try {
      await api.delete(`/teams/${teamId}`)
      setMsg({ type: 'success', text: 'Equipo eliminado' })
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo eliminar el equipo' })
    }
  }

  useEffect(() => { load() }, [competition.id])
  useEffect(() => {
    if (showCreate && !createForm.nombre.trim()) {
      setCreateForm(prev => ({ ...prev, nombre: defaultTeamName, captain_id: prev.captain_id }))
    }
  }, [showCreate, defaultTeamName])

  if (loading) return <div style={{ color: '#777' }}>Cargando equipos...</div>
  if (error) return <div className="alert alert-error">{error}</div>

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h4 style={{ margin: 0, fontSize: 15 }}>Equipos de la competencia</h4>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#647063', fontSize: 12 }}>{teams.length} equipos | {participantPool.length} participantes confirmados | {establishedTeamSize} por equipo</span>
            <button
              className="btn-primary btn-sm"
              onClick={() => {
                if (showCreate) {
                  setShowCreate(false)
                  setCreateForm({ nombre: '', member_ids: [], captain_id: null })
                  setSearchCreate('')
                  return
                }
                setCreateForm({ nombre: defaultTeamName, member_ids: [], captain_id: null })
                setSearchCreate('')
                setShowCreate(true)
              }}
            >
              {showCreate ? 'Cancelar' : '+ Crear equipo'}
            </button>
          </div>
        </div>

        {showCreate && (
          <form onSubmit={createTeam} style={{ marginBottom: 12, border: '1px solid #d5ddd3', borderRadius: 8, padding: 12 }}>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Nombre del equipo *</label>
              <input value={createForm.nombre} onChange={e => setCreateForm({ ...createForm, nombre: e.target.value })} required />
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Integrantes ({createForm.member_ids.length}/{establishedTeamSize})</label>
              <input
                placeholder="Buscar por nombre o cedula..."
                value={searchCreate}
                onChange={e => setSearchCreate(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <div style={{ maxHeight: 180, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {availableForCreate.map(p => {
                  const selected = createForm.member_ids.includes(p.id)
                  const disabled = !selected && createForm.member_ids.length >= establishedTeamSize
                  const isCap = selected && createForm.captain_id === p.id
                  return (
                    <label key={`create-team-member-${p.id}`} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                      borderRadius: 6, border: `1px solid ${isCap ? '#e8a800' : selected ? '#284017' : '#d5ddd3'}`,
                      background: isCap ? '#fffbef' : selected ? '#28401711' : 'transparent', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
                    }}>
                      <input type="checkbox" checked={selected} onChange={() => !disabled && toggleCreateMember(p.id)} style={{ width: 'auto' }} />
                      <span style={{ fontSize: 13, flex: 1 }}>{p.nombre} {p.apellido}</span>
                      {selected && (
                                            <button type="button" title={isCap ? 'Capitán' : 'Hacer capitán'} onClick={e => { e.preventDefault(); setCreateForm(f => ({ ...f, captain_id: p.id })) }}
                          style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', lineHeight: 1 }}>
                          <Crown size={14} color={isCap ? '#e8a800' : '#ccc'} />
                        </button>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
            <button type="submit" className="btn-primary btn-sm">Crear equipo</button>
          </form>
        )}

        {teams.map(t => (
          <div key={t.id} style={{ border: '1px solid #d5ddd3', borderRadius: 8, padding: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {(t.nombre || '').trim() || `Equipo ${t.id}`}
                                  {t.captain_id && <span style={{ fontSize: 10, background: '#fff3cd', color: '#664d03', borderRadius: 4, padding: '1px 6px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Crown size={9} /> Capitán asignado</span>}
                </div>
                <div style={{ fontSize: 12, color: '#647063' }}>{(t.members || []).length} integrantes</div>
                <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                  {(t.members || []).map(m => (
                    <div key={`team-member-${t.id}-${m.id}`} style={{ background: m.id === t.captain_id ? '#fffbef' : '#fff', border: `1px solid ${m.id === t.captain_id ? '#ffe08a' : '#d5ddd3'}`, borderRadius: 6, padding: '6px 10px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {m.id === t.captain_id && <Crown size={12} color="#e8a800" />}
                      {m.nombre} {m.apellido}
                                        {m.id === t.captain_id && <span style={{ fontSize: 10, color: '#9a6a00', marginLeft: 2 }}>Capitán</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn-secondary btn-sm"
                  title="Editar equipo"
                  aria-label="Editar equipo"
                  onClick={() => startEdit(t)}
                  style={{ minWidth: 34, padding: '5px 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="btn-danger btn-sm"
                  title="Eliminar equipo"
                  aria-label="Eliminar equipo"
                  onClick={() => removeTeam(t.id)}
                  style={{ minWidth: 34, padding: '5px 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {!teams.length && <div style={{ color: '#647063', textAlign: 'center', padding: 20 }}>Sin equipos en esta competencia</div>}
      </div>

      {editingTeam && (
        <Modal title={`Editar equipo - ${(editingTeam.nombre || '').trim() || `Equipo ${editingTeam.id}`}`} onClose={() => setEditingTeam(null)} width={720}>
          <form onSubmit={saveEdit}>
            <div className="form-group">
              <label>Nombre del equipo *</label>
              <input value={editForm.nombre} onChange={e => setEditForm({ ...editForm, nombre: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Integrantes ({editForm.member_ids.length}/{establishedTeamSize})</label>
              <input
                placeholder="Buscar por nombre o cedula..."
                value={searchEdit}
                onChange={e => setSearchEdit(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {availableForEdit.map(p => {
                  const selected = editForm.member_ids.includes(p.id)
                  const disabled = !selected && editForm.member_ids.length >= establishedTeamSize
                  const owner = memberTeamByParticipant[p.id]
                  const isCap = selected && editForm.captain_id === p.id
                  return (
                    <label key={`edit-team-member-${p.id}`} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                      borderRadius: 6, border: `1px solid ${isCap ? '#e8a800' : selected ? '#284017' : '#d5ddd3'}`,
                      background: isCap ? '#fffbef' : selected ? '#28401711' : 'transparent', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
                    }}>
                      <input type="checkbox" checked={selected} onChange={() => !disabled && toggleEditMember(p.id)} style={{ width: 'auto' }} />
                      <span style={{ fontSize: 13, flex: 1 }}>{p.nombre} {p.apellido}</span>
                      {selected ? (
                                            <button type="button" title={isCap ? 'Capitán' : 'Hacer capitán'} onClick={e => { e.preventDefault(); setEditForm(f => ({ ...f, captain_id: p.id })) }}
                          style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', lineHeight: 1 }}>
                          <Crown size={14} color={isCap ? '#e8a800' : '#ccc'} />
                        </button>
                      ) : (
                        <span className="badge badge-default" style={{ fontSize: 10 }}>
                          {owner && owner.id === editingTeam?.id ? 'En este equipo' : (p.categoria_competencia || 'Libre')}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn-secondary" onClick={() => setEditingTeam(null)}>Cancelar</button>
              <button type="submit" className="btn-primary">Guardar cambios</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function CompetitionResultsPanel({ competition }) {
  const [participants, setParticipants] = useState([])
  const [teams, setTeams] = useState([])
  const [phases, setPhases] = useState([])
  const [results, setResults] = useState([])
  const [msg, setMsg] = useState(null)
  const [activePhaseId, setActivePhaseId] = useState('')
  const [form, setForm] = useState({ user_id: '', phase_id: '', puntos: 0, posicion: '' })
  const [quickRows, setQuickRows] = useState({})
  const [quick, setQuick] = useState({ phase_id: '' })
  const [teamQuickRows, setTeamQuickRows] = useState({})
  const [teamQuick, setTeamQuick] = useState({ phase_id: '' })
  const [teamMembersQuickRows, setTeamMembersQuickRows] = useState({})
  const [teamMembersQuick, setTeamMembersQuick] = useState({ phase_id: '' })
  const [teamQuickSaving, setTeamQuickSaving] = useState(false)
  const [teamMembersQuickSaving, setTeamMembersQuickSaving] = useState(false)
  const [quickSaving, setQuickSaving] = useState(false)
  const [savingRowId, setSavingRowId] = useState(null)
  const [editRows, setEditRows] = useState({})
  const [categoryFilter, setCategoryFilter] = useState('')
  const [rulesModalOpen, setRulesModalOpen] = useState(false)
  const [rulesPhaseId, setRulesPhaseId] = useState('')
  const [rulesDraft, setRulesDraft] = useState([])
  const [rulesPresetCount, setRulesPresetCount] = useState('')
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const [massDeleteModal, setMassDeleteModal] = useState({ open: false, scope: 'phase', phaseId: null, phaseName: '' })
  const [massDeleteLoading, setMassDeleteLoading] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [phRes, enRes, rRes, tRes] = await Promise.all([
        api.get(`/competitions/${competition.id}/phases`),
        api.get(`/competitions/${competition.id}/participants`),
        api.get(`/results?competition_id=${competition.id}`),
        api.get(`/teams?competition_id=${competition.id}`),
      ])
      const enrolled = (enRes.data || []).filter(p => p.estado === 'confirmado')
      setPhases(phRes.data || [])
      setParticipants(enrolled)
      setResults(rRes.data || [])
      setTeams(tRes.data || [])
      setCategoryFilter('')

      const map = {}
      enrolled.forEach(p => { map[p.id] = { puntos: '', posicion: '' } })
      setQuickRows(map)

      const teamMap = {}
      ;(tRes.data || []).forEach(t => { teamMap[t.id] = { puntos: '', posicion: '' } })
      setTeamQuickRows(teamMap)

      const membersMap = {}
      ;(tRes.data || []).forEach(t => {
        const a = t.members?.[0]
        const b = t.members?.[1]
        membersMap[t.id] = {
          performer: a ? String(a.id) : '',
          puntos_a: '',
          puntos_b: '',
          puntos_total: '',
          posicion: '',
        }
      })
      setTeamMembersQuickRows(membersMap)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load().catch(() => setMsg({ type: 'error', text: 'No se pudo cargar resultados' })) }, [competition.id])
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!phases.length) {
      setActivePhaseId('')
      return
    }
    if (!activePhaseId || !phases.some(p => String(p.id) === String(activePhaseId))) {
      const latestResultPhaseId = results.find(r => r?.phase_id != null)?.phase_id
      const fallback = phases[0]?.id
      const nextPhaseId = String(
        (latestResultPhaseId != null && phases.some(p => String(p.id) === String(latestResultPhaseId)))
          ? latestResultPhaseId
          : fallback
      )
      setActivePhaseId(nextPhaseId)
      setQuick(prev => ({ ...prev, phase_id: nextPhaseId }))
      setTeamQuick(prev => ({ ...prev, phase_id: nextPhaseId }))
      setTeamMembersQuick(prev => ({ ...prev, phase_id: nextPhaseId }))
      setForm(prev => ({ ...prev, phase_id: nextPhaseId }))
    }
  }, [phases, activePhaseId, results])

  const applyPhaseSelection = (phaseId) => {
    const value = String(phaseId || '')
    setActivePhaseId(value)
    setQuick(prev => ({ ...prev, phase_id: value }))
    setTeamQuick(prev => ({ ...prev, phase_id: value }))
    setTeamMembersQuick(prev => ({ ...prev, phase_id: value }))
    setForm(prev => ({ ...prev, phase_id: value }))
  }

  useEffect(() => {
    if (!phases.length || !results.length) return
    const latestResultPhaseId = String(results[0]?.phase_id || '')
    if (!latestResultPhaseId) return
    const activeValid = !!activePhaseId && phases.some(p => String(p.id) === String(activePhaseId))
    const activeHasRows = activeValid && results.some(r => String(r.phase_id || '') === String(activePhaseId))
    const latestExistsInPhases = phases.some(p => String(p.id) === latestResultPhaseId)
    if ((!activeValid || !activeHasRows) && latestExistsInPhases) {
      applyPhaseSelection(latestResultPhaseId)
    }
  }, [results, phases])
  useEffect(() => {
    const timer = setInterval(() => { load().catch(() => {}) }, 12000)
    const onFocus = () => load().catch(() => {})
    if (typeof window !== 'undefined') window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus)
    }
  }, [competition.id])

  const isPointsModeDirect = () => false
  const isPointsModeRules = () => false
  const computePhaseAutoPoints = (phase, posicion) => {
    if (!phase) return null
    // puntuacion y posicion se calculan en backend a partir de la marca
    return null
  }

  const resultPhaseType = phaseTypeFromPhase(phases.find(p => String(p.id) === String(form.phase_id)))
  const quickPhaseType = phaseTypeFromPhase(phases.find(p => String(p.id) === String(quick.phase_id)))
  const quickPhase = phases.find(p => String(p.id) === String(quick.phase_id))
  const formSinglePhase = phases.find(p => String(p.id) === String(form.phase_id))
  const quickAllowMultiple = !!Number(quickPhase?.allow_multiple_results || 0)
  const formAllowMultiple = !!Number(formSinglePhase?.allow_multiple_results || 0)
  const quickRules = parseScoringRules(phases.find(p => String(p.id) === String(quick.phase_id))?.scoring_rules)
  const teamQuickPhaseType = phaseTypeFromPhase(phases.find(p => String(p.id) === String(teamQuick.phase_id)))
  const teamQuickPhase = phases.find(p => String(p.id) === String(teamQuick.phase_id))
  const teamQuickAllowMultiple = !!Number(teamQuickPhase?.allow_multiple_results || 0)
  const teamQuickRules = parseScoringRules(teamQuickPhase?.scoring_rules)
  const teamQuickAutoByRules = isPointsModeRules(teamQuickPhase) && teamQuickRules.length > 0
  const teamQuickAutoByDirect = isPointsModeDirect(teamQuickPhase)
  const teamQuickAutoByPhase = teamQuickAutoByDirect || teamQuickAutoByRules
  const teamMembersPhase = phases.find(p => String(p.id) === String(teamMembersQuick.phase_id))
  const teamMembersPhaseType = phaseTypeFromPhase(teamMembersPhase)
  const teamMembersPhaseMethod = normalizeMeasurementMethod(teamMembersPhase?.measurement_method, teamMembersPhase?.tipo)
  const teamMembersPhaseIsTime = isTimeMeasurement(teamMembersPhaseMethod)
  const teamMembersAllowMultiple = !!Number(teamMembersPhase?.allow_multiple_results || 0)
  const teamMembersRules = parseScoringRules(teamMembersPhase?.scoring_rules)
  const teamMembersAutoByRules = isPointsModeRules(teamMembersPhase) && teamMembersRules.length > 0
  const teamMembersAutoByDirect = isPointsModeDirect(teamMembersPhase)
  const teamMembersAutoByPhase = teamMembersAutoByDirect || teamMembersAutoByRules
  const teamMembersMode = (teamMembersPhase?.team_result_mode || 'sum_two')
  const activePhase = phases.find(p => String(p.id) === String(activePhaseId))
  const activePhaseMethod = normalizeMeasurementMethod(activePhase?.measurement_method, activePhase?.tipo)
  const activePhaseIsTime = isTimeMeasurement(activePhaseMethod)
  const activePhaseRules = parseScoringRules(activePhase?.scoring_rules)
  const formPhase = phases.find(p => String(p.id) === String(form.phase_id))
  const formRules = parseScoringRules(formPhase?.scoring_rules)
  const formAutoByRules = isPointsModeRules(formPhase) && formRules.length > 0
  const formAutoByDirect = isPointsModeDirect(formPhase)
  const formAutoByPhase = formAutoByDirect || formAutoByRules
  const formAutoPoints = computePhaseAutoPoints(formPhase, form.posicion)
  const quickAutoByRules = isPointsModeRules(quickPhase) && quickRules.length > 0
  const quickAutoByDirect = isPointsModeDirect(quickPhase)
  const quickAutoByPhase = quickAutoByDirect || quickAutoByRules

  const createOne = async (e) => {
    e.preventDefault()
    try {
      const basePhase = phases.find(p => String(p.id) === String(form.phase_id))
      const phaseType = phaseTypeFromPhase(basePhase)
      const phaseMethod = normalizeMeasurementMethod(basePhase?.measurement_method, basePhase?.tipo)
      const autoPoints = computePhaseAutoPoints(basePhase, form.posicion)
      const parsedMetric = parseMetricByPhase(form.puntos, basePhase)
      if ((isPointsModeDirect(basePhase) || isPointsModeRules(basePhase)) && !form.posicion) {
        setMsg({ type: 'error', text: 'Debes indicar posicion para calcular puntos automaticamente' })
        return
      }
      if (phaseType !== 'posicion' && parsedMetric == null) {
        setMsg({ type: 'error', text: isTimeMeasurement(phaseMethod) ? 'Tiempo invalido. Usa HH:MM:SS' : 'Valor invalido' })
        return
      }
      if (form.phase_id && !formAllowMultiple) {
        const duplicate = results.some(r =>
          Number(r.user_id) === Number(form.user_id) &&
          String(r.phase_id || '') === String(form.phase_id)
        )
        if (duplicate) {
          setMsg({ type: 'error', text: 'Este evento permite un solo resultado por participante' })
          return
        }
      }
      await api.post('/results', {
        user_id: Number(form.user_id),
        competition_id: competition.id,
        phase_id: form.phase_id ? Number(form.phase_id) : null,
        marca: phaseType === 'posicion'
          ? (form.posicion ? Number(form.posicion) : null)
          : parsedMetric,
        puntos: autoPoints ?? parsedMetric,
        posicion: form.posicion ? Number(form.posicion) : null,
      })
      setMsg({ type: 'success', text: 'Resultado guardado' })
      setForm({ user_id: '', phase_id: form.phase_id, puntos: 0, posicion: '' })
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'Error al guardar' })
    }
  }

  const saveBulk = async () => {
    const rows = participants
      .map(p => ({ p, r: quickRows[p.id] || {} }))
      .filter(({ r }) => r.puntos !== '' || r.posicion !== '')
    if (rows.length === 0) {
      setMsg({ type: 'error', text: 'No hay datos para guardar' })
      return
    }
    if (quickAutoByPhase && rows.some(({ r }) => r.posicion === '')) {
      setMsg({ type: 'error', text: 'Este evento requiere posicion en todas las filas cargadas' })
      return
    }
    if (quick.phase_id && !quickAllowMultiple) {
      const blocked = rows.filter(({ p }) => results.some(r =>
        Number(r.user_id) === Number(p.id) &&
        String(r.phase_id || '') === String(quick.phase_id)
      ))
      if (blocked.length > 0) {
        setMsg({ type: 'error', text: 'El evento seleccionado permite un solo resultado por participante' })
        return
      }
    }
    setQuickSaving(true)
    try {
      const phaseForBulk = phases.find(x => String(x.id) === String(quick.phase_id))
      await Promise.all(rows.map(({ p, r }) => {
        const computed = computePhaseAutoPoints(phaseForBulk, r.posicion)
        const phaseType = phaseTypeFromPhase(phaseForBulk)
        const phaseMethod = normalizeMeasurementMethod(phaseForBulk?.measurement_method, phaseForBulk?.tipo)
        const parsedMetric = parseMetricByPhase(r.puntos, phaseForBulk)
        if (phaseType !== 'posicion' && parsedMetric == null) {
          throw new Error(isTimeMeasurement(phaseMethod) ? 'Tiempo invalido. Usa HH:MM:SS' : 'Valor invalido')
        }
        return api.post('/results', {
          user_id: p.id,
          competition_id: competition.id,
          phase_id: quick.phase_id ? Number(quick.phase_id) : null,
          marca: phaseType === 'posicion'
            ? (r.posicion === '' ? null : Number(r.posicion))
            : parsedMetric,
          puntos: computed ?? parsedMetric,
          posicion: r.posicion === '' ? null : Number(r.posicion),
        })
      }))
      setMsg({ type: 'success', text: `Carga masiva guardada (${rows.length})` })
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'Error en carga masiva' })
    } finally {
      setQuickSaving(false)
    }
  }

  const saveBulkTeams = async () => {
    const rows = teamsForEntry
      .map(t => ({ t, r: teamQuickRows[t.id] || {} }))
      .filter(({ r }) => r.puntos !== '' || r.posicion !== '')
    if (rows.length === 0) {
      setMsg({ type: 'error', text: 'No hay datos de equipos para guardar' })
      return
    }
    if (teamQuickAutoByPhase && rows.some(({ r }) => r.posicion === '')) {
      setMsg({ type: 'error', text: 'Este evento requiere posicion en todas las filas de equipos' })
      return
    }
    if (teamQuick.phase_id && !teamQuickAllowMultiple) {
      const blocked = rows.filter(({ t }) => results.some(r =>
        Number(r.team_id) === Number(t.id) &&
        Number(r.user_id || 0) === 0 &&
        String(r.phase_id || '') === String(teamQuick.phase_id)
      ))
      if (blocked.length > 0) {
        setMsg({ type: 'error', text: 'El evento seleccionado permite un solo resultado por equipo' })
        return
      }
    }
    setTeamQuickSaving(true)
    try {
      await Promise.all(rows.map(({ t, r }) => {
        const computed = computePhaseAutoPoints(teamQuickPhase, r.posicion)
        const phaseType = phaseTypeFromPhase(teamQuickPhase)
        const phaseMethod = normalizeMeasurementMethod(teamQuickPhase?.measurement_method, teamQuickPhase?.tipo)
        const parsedMetric = parseMetricByPhase(r.puntos, teamQuickPhase)
        if (phaseType !== 'posicion' && parsedMetric == null) {
          throw new Error(isTimeMeasurement(phaseMethod) ? 'Tiempo invalido. Usa HH:MM:SS' : 'Valor invalido')
        }
        return api.post('/results', {
          team_id: t.id,
          competition_id: competition.id,
          phase_id: teamQuick.phase_id ? Number(teamQuick.phase_id) : null,
          marca: phaseType === 'posicion'
            ? (r.posicion === '' ? null : Number(r.posicion))
            : parsedMetric,
          puntos: computed ?? parsedMetric,
          posicion: r.posicion === '' ? null : Number(r.posicion),
        })
      }))
      setMsg({ type: 'success', text: `Carga masiva de equipos guardada (${rows.length})` })
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'Error en carga masiva de equipos' })
    } finally {
      setTeamQuickSaving(false)
    }
  }

  const saveBulkTeamMembers = async () => {
    const rows = teamsForEntry
      .map(t => ({ t, r: teamMembersQuickRows[t.id] || {} }))
      .filter(({ r }) =>
        r.puntos_a !== '' || r.puntos_b !== '' || r.puntos_total !== '' || r.posicion !== ''
      )
    if (rows.length === 0) {
      setMsg({ type: 'error', text: 'No hay datos por integrantes para guardar' })
      return
    }
    if (!teamMembersQuick.phase_id) {
      setMsg({ type: 'error', text: 'Selecciona un evento para cargar por integrantes' })
      return
    }
    if (teamMembersAutoByPhase && rows.some(({ r }) => r.posicion === '')) {
      setMsg({ type: 'error', text: 'Este evento requiere posicion en todas las filas de equipos' })
      return
    }
    setTeamMembersQuickSaving(true)
    try {
      const requests = []
      for (const { t, r } of rows) {
        const members = (t.members || []).slice(0, 2)
        if (!members.length) continue
        const memberA = members[0]
        const memberB = members[1]
        const computedTeamPoints = computePhaseAutoPoints(teamMembersPhase, r.posicion)
        const performer = r.performer || String(memberA?.id || '')

        if (teamMembersMode === 'total') {
          const totalMetric = parseMetricByPhase(r.puntos_total, teamMembersPhase)
          if (teamMembersPhaseType !== 'posicion' && totalMetric == null) {
            throw new Error(isTimeMeasurement(normalizeMeasurementMethod(teamMembersPhase?.measurement_method, teamMembersPhase?.tipo)) ? 'Tiempo invalido. Usa HH:MM:SS' : 'Valor invalido')
          }
          const existingTeam = results.find(x =>
            Number(x.team_id) === Number(t.id) &&
        Number(x.user_id || 0) === 0 &&
            String(x.phase_id || '') === String(teamMembersQuick.phase_id)
          )
          const teamPayload = {
            team_id: Number(t.id),
            competition_id: competition.id,
            phase_id: Number(teamMembersQuick.phase_id),
            marca: teamMembersPhaseType === 'posicion'
              ? (r.posicion === '' ? null : Number(r.posicion))
              : totalMetric,
            puntos: totalMetric,
            posicion: r.posicion === '' ? null : Number(r.posicion),
          }
          if (!teamMembersAllowMultiple && existingTeam) {
            requests.push(api.put(`/results/${existingTeam.id}`, {
              phase_id: teamPayload.phase_id,
              puntos: teamPayload.puntos,
              posicion: teamPayload.posicion,
            }))
          } else {
            requests.push(api.post('/results', teamPayload))
          }
          continue
        }

        let pointsA = parseMetricByPhase(r.puntos_a, teamMembersPhase)
        let pointsB = parseMetricByPhase(r.puntos_b, teamMembersPhase)
        if (!teamMembersAutoByPhase && teamMembersPhaseType !== 'posicion' && (pointsA == null || pointsB == null)) {
          throw new Error(isTimeMeasurement(normalizeMeasurementMethod(teamMembersPhase?.measurement_method, teamMembersPhase?.tipo)) ? 'Tiempo invalido. Usa HH:MM:SS' : 'Valor invalido')
        }
        if (teamMembersAutoByPhase) {
          const autoPoints = Number(computedTeamPoints || 0)
          if (teamMembersMode === 'single_member') {
            pointsA = String(memberA?.id) === performer ? autoPoints : 0
            pointsB = String(memberB?.id) === performer ? autoPoints : 0
          } else {
            pointsA = autoPoints
            pointsB = memberB ? autoPoints : 0
          }
        } else if (teamMembersMode === 'single_member') {
          if (String(memberA?.id) === performer) pointsB = 0
          if (String(memberB?.id) === performer) pointsA = 0
        }

        const perMember = [
          { member: memberA, points: pointsA },
          { member: memberB, points: pointsB },
        ].filter(x => x.member)

        for (const pm of perMember) {
          const existing = results.find(x =>
        Number(x.user_id) === Number(pm.member.id) &&
            String(x.phase_id || '') === String(teamMembersQuick.phase_id)
          )
          const payload = {
            user_id: Number(pm.member.id),
            team_id: Number(t.id),
            competition_id: competition.id,
            phase_id: Number(teamMembersQuick.phase_id),
            marca: teamMembersPhaseType === 'posicion'
              ? (r.posicion === '' ? null : Number(r.posicion))
              : Number(pm.points || 0),
            puntos: Number(pm.points || 0),
            posicion: r.posicion === '' ? null : Number(r.posicion),
          }
          if (!teamMembersAllowMultiple && existing) {
            requests.push(api.put(`/results/${existing.id}`, {
              phase_id: payload.phase_id,
              puntos: payload.puntos,
              posicion: payload.posicion,
            }))
          } else {
            requests.push(api.post('/results', payload))
          }
        }
      }
      await Promise.all(requests)
      setMsg({ type: 'success', text: `Carga por integrantes guardada (${rows.length} equipos)` })
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'Error guardando carga por integrantes' })
    } finally {
      setTeamMembersQuickSaving(false)
    }
  }

  const patchRow = (id, field, value) => {
    setEditRows(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value },
    }))
  }
  const patchTeamMemberRow = (teamId, patch) => {
    setTeamMembersQuickRows(prev => ({ ...prev, [teamId]: { ...(prev[teamId] || {}), ...patch } }))
  }

  const saveRow = async (row) => {
    const draft = editRows[row.id] || {}
    setSavingRowId(row.id)
    try {
      const rowPhase = phases.find(p => String(p.id) === String(row.phase_id))
      const rowPhaseType = phaseTypeFromPhase(rowPhase || activePhase)
      const rowPhaseMethod = normalizeMeasurementMethod(rowPhase?.measurement_method || activePhase?.measurement_method, rowPhase?.tipo || activePhase?.tipo)
      const rawMetric = draft.marca != null ? draft.marca : (row.marca ?? row.puntos)
      const parsedMetric = parseMetricByPhase(rawMetric, rowPhase || activePhase)
      if (rowPhaseType !== 'posicion' && parsedMetric == null) {
        setMsg({ type: 'error', text: isTimeMeasurement(rowPhaseMethod) ? 'Tiempo invalido. Usa HH:MM:SS' : 'Valor invalido' })
        setSavingRowId(null)
        return
      }
      await api.put(`/results/${row.id}`, {
        marca: rowPhaseType === 'posicion' ? Number(rawMetric || 0) : parsedMetric,
      })
      setMsg({ type: 'success', text: 'Resultado actualizado' })
      setEditRows(prev => {
        const cp = { ...prev }
        delete cp[row.id]
        return cp
      })
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo actualizar' })
    } finally {
      setSavingRowId(null)
    }
  }

  const deleteRow = async (id) => {
    if (!confirm('Eliminar resultado?')) return
    await api.delete(`/results/${id}`)
    await load()
  }

  const openDeletePhaseModal = (phase) => {
    setMassDeleteModal({
      open: true,
      scope: 'phase',
      phaseId: Number(phase.id),
      phaseName: phase.nombre || `Fase ${phase.id}`,
    })
  }

  const openDeleteAllModal = () => {
    setMassDeleteModal({
      open: true,
      scope: 'all',
      phaseId: null,
      phaseName: '',
    })
  }

  const closeMassDeleteModal = () => {
    if (massDeleteLoading) return
    setMassDeleteModal({ open: false, scope: 'phase', phaseId: null, phaseName: '' })
  }

  const confirmMassDelete = async () => {
    if (!massDeleteModal.open || massDeleteLoading) return
    setMassDeleteLoading(true)
    try {
      let deleted = 0
      if (massDeleteModal.scope === 'phase') {
        if (!massDeleteModal.phaseId) return
        const res = await api.delete(`/results/competition/${competition.id}/phase/${Number(massDeleteModal.phaseId)}`)
        deleted = Number(res?.data?.deleted || 0)
        setMsg({ type: 'success', text: `Se borraron ${deleted} resultados de la fase "${massDeleteModal.phaseName}"` })
      } else {
        const res = await api.delete(`/results/competition/${competition.id}`)
        deleted = Number(res?.data?.deleted || 0)
        setMsg({ type: 'success', text: `Se borraron ${deleted} resultados de toda la competencia` })
      }
      setMassDeleteModal({ open: false, scope: 'phase', phaseId: null, phaseName: '' })
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudieron borrar los resultados' })
    } finally {
      setMassDeleteLoading(false)
    }
  }

  const categories = [...new Set(participants.map(p => p.categoria_competencia || 'Sin categoria'))]
  useEffect(() => {
    if (!categories.length) {
      if (categoryFilter !== '') setCategoryFilter('')
      return
    }
    if (categoryFilter && !categories.includes(categoryFilter)) {
      setCategoryFilter('')
    }
  }, [categories, categoryFilter])

  const participantCategoryById = participants.reduce((acc, p) => {
    acc[p.id] = p.categoria_competencia || 'Sin categoria'
    return acc
  }, {})
  const teamCategoryById = teams.reduce((acc, t) => {
    const memberCats = [...new Set((t.members || []).map(m => participantCategoryById[m.id] || 'Sin categoria'))]
    acc[t.id] = memberCats.length === 1 ? memberCats[0] : (memberCats.length ? 'Mixta' : 'Sin categoria')
    return acc
  }, {})
  const activePhaseForTeams = phases.find(p => String(p.id) === String(activePhaseId))
  const activeTeamPhaseAllowsMultiple = !!Number(activePhaseForTeams?.allow_multiple_results || 0)
  const teamsForCategory = categoryFilter
    ? teams.filter(t => (t.members || []).some(m => (participantCategoryById[m.id] || 'Sin categoria') === categoryFilter))
    : []
  const teamsForEntry = (!activeTeamPhaseAllowsMultiple && activePhaseId)
    ? teamsForCategory.filter(t => !results.some(r =>
        Number(r.team_id || 0) === Number(t.id) &&
        String(r.phase_id || '') === String(activePhaseId)
      ))
    : teamsForCategory
  const hiddenTeamsBySingleResultRule = Math.max(0, teamsForCategory.length - teamsForEntry.length)
  const filteredResults = results.filter(r => {
    const phaseMatch = !activePhaseId || String(r.phase_id || '') === String(activePhaseId)
      const cat = r.user_id
        ? (participantCategoryById[r.user_id] || 'Sin categoria')
        : (teamCategoryById[r.team_id] || 'Sin categoria')
    const catMatch = !categoryFilter || cat === categoryFilter
    return phaseMatch && catMatch
  }).sort((a, b) => (Number(b.puntos || 0) - Number(a.puntos || 0)))
  const latestResultPhaseId = String(results[0]?.phase_id || '')
  const latestResultPhaseName = phases.find(p => String(p.id) === latestResultPhaseId)?.nombre || (latestResultPhaseId ? `Fase ${latestResultPhaseId}` : '')

  const openRulesModal = () => {
    const fromForm = phases.find(p => String(p.id) === String(form.phase_id))
    const fromQuick = phases.find(p => String(p.id) === String(quick.phase_id))
    const fallback = phases.find(p => phaseTypeFromPhase(p) === 'posicion')
    const target = fromForm && phaseTypeFromPhase(fromForm) === 'posicion'
      ? fromForm
      : fromQuick && phaseTypeFromPhase(fromQuick) === 'posicion'
        ? fromQuick
        : fallback
    if (!target) {
      setMsg({ type: 'error', text: 'No hay eventos de tipo posicion para configurar' })
      return
    }
    setRulesPhaseId(String(target.id))
    setRulesDraft(parseScoringRules(target.scoring_rules))
    setRulesPresetCount(String(participants.length || ''))
    setRulesModalOpen(true)
  }

  const applyInversePreset = (count) => {
    const n = Number(count)
    if (!Number.isFinite(n) || n <= 0) {
      setMsg({ type: 'error', text: 'Cantidad de participantes invalida para preset inverso' })
      return
    }
    const next = []
    for (let pos = 1; pos <= n; pos += 1) {
      next.push({ min_pos: pos, max_pos: pos, points: n - pos + 1 })
    }
    setRulesDraft(next)
  }

  const applyPodiumPreset = () => {
    setRulesDraft([
      { min_pos: 1, max_pos: 1, points: 100 },
      { min_pos: 2, max_pos: 2, points: 90 },
      { min_pos: 3, max_pos: 3, points: 80 },
      { min_pos: 4, max_pos: null, points: 60 },
    ])
  }

  const saveRules = async () => {
    const cleaned = rulesDraft
      .map(r => ({
        min_pos: Number(r.min_pos),
        max_pos: r.max_pos === '' || r.max_pos == null ? null : Number(r.max_pos),
        points: Number(r.points),
      }))
      .filter(r => Number.isFinite(r.min_pos) && r.min_pos > 0 && Number.isFinite(r.points))
      .sort((a, b) => a.min_pos - b.min_pos)

    if (!rulesPhaseId) return
    try {
      await api.put(`/competitions/${competition.id}/phases/${Number(rulesPhaseId)}`, {
        scoring_rules: JSON.stringify(cleaned),
      })
      setRulesModalOpen(false)
      await load()
      setMsg({ type: 'success', text: 'Reglas de puntos por posicion actualizadas' })
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudieron guardar las reglas' })
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: '#647063' }}>Seleccion rapida de evento</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#647063' }}>Total resultados: {results.length}</span>
            <button type="button" className="btn-secondary btn-sm" onClick={() => load().catch(() => {})} disabled={loading}>
              {loading ? 'Recargando...' : 'Recargar'}
            </button>
            {latestResultPhaseId ? (
              <button type="button" className="btn-secondary btn-sm" onClick={() => applyPhaseSelection(latestResultPhaseId)}>
                Ir a ultima fase con resultados
              </button>
            ) : null}
          </div>
        </div>
        {isMobile ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 12, color: '#647063' }}>Evento</label>
              <select value={activePhaseId} onChange={e => applyPhaseSelection(e.target.value)}>
                {phases.map(ph => <option key={`results-phase-mobile-${ph.id}`} value={ph.id}>{ph.nombre}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 12, color: '#647063' }}>Categoria</label>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                <option value="">Todas</option>
                {categories.length
                  ? categories.map(cat => <option key={`results-cat-mobile-${cat}`} value={cat}>{cat}</option>)
                  : <option value="">Sin categorias</option>}
              </select>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setCategoryFilter('')}>
                Limpiar filtros
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="tabs" style={{ margin: 0, border: 'none', gap: 6, flexWrap: 'wrap' }}>
              {phases.map(ph => (
                <button
                  key={`results-phase-${ph.id}`}
                  className={`tab ${String(activePhaseId) === String(ph.id) ? 'active' : ''}`}
                  onClick={() => applyPhaseSelection(ph.id)}
                  style={{ padding: '5px 12px', fontSize: 13 }}
                  title={`Estado: ${ph.estado || 'pendiente'}`}
                >
                  {ph.nombre}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, color: '#647063' }}>Categoria:</label>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ width: 220 }}>
                <option value="">Todas</option>
                {categories.length
                  ? categories.map(cat => <option key={`results-cat-${cat}`} value={cat}>{cat}</option>)
                  : <option value="">Sin categorias</option>}
              </select>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setCategoryFilter('')}>
                Limpiar filtros
              </button>
            </div>
          </>
        )}
        {activePhase && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#647063' }}>
            <b style={{ color: '#ddd' }}>{activePhase.nombre}</b>
            {` | tipo: ${phaseTypeFromPhase(activePhase)}`}
            {` | metodo: ${PHASE_MEASUREMENT_LABELS[activePhaseMethod] || activePhaseMethod}`}
            {` | resultados: ${Number(activePhase.allow_multiple_results) ? 'multiples' : 'unico'}`}
            {` | equipo: ${(activePhase.team_result_mode || 'sum_two') === 'single_member' ? 'solo uno' : ((activePhase.team_result_mode || 'sum_two') === 'total' ? 'total' : 'ambos')}`}
            {` | estado: ${activePhase.estado || 'pendiente'}`}
            {activePhaseRules.length > 0 ? ` | reglas por posicion: ${activePhaseRules.length}` : ''}
          </div>
        )}
        {!filteredResults.length && results.length > 0 ? (
          <div style={{ marginTop: 8, borderRadius: 10, border: '1px solid rgba(245,158,11,0.28)', background: 'rgba(245,158,11,0.08)', padding: '8px 10px', color: '#D7DEE8', fontSize: 12 }}>
            Hay {results.length} resultados cargados, pero no coinciden con el filtro actual (evento/categoria). Ultima fase con datos: <b>{latestResultPhaseName || '-'}</b>.
          </div>
        ) : null}
        <div style={{ marginTop: 10, borderTop: '1px dashed #d5ddd3', paddingTop: 10 }}>
          <div style={{ fontSize: 12, color: '#647063', marginBottom: 8 }}>Borrado masivo de resultados</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {phases.map(ph => (
              <button
                key={`wipe-phase-${ph.id}`}
                type="button"
                className="btn-danger btn-sm"
                onClick={() => openDeletePhaseModal(ph)}
                disabled={massDeleteLoading}
                title={`Borrar resultados del evento ${ph.nombre}`}
              >
                Borrar {ph.nombre}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn-danger btn-sm"
              onClick={openDeleteAllModal}
              disabled={massDeleteLoading}
            >
              Borrar TODOS los resultados
            </button>
          </div>
        </div>
      </div>

      {teams.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ margin: 0, fontSize: 15 }}>Carga de resultados por equipos</h4>
            <button className="btn-secondary btn-sm" onClick={openRulesModal}>Configurar puntos por posicion</button>
          </div>
          <div style={{ color: '#647063', fontSize: 12, marginBottom: 8 }}>
            Tipo: <b style={{ color: '#ddd' }}>{teamMembersPhaseType}</b>
            {teamMembersQuick.phase_id && <span>{` | metodo: ${PHASE_MEASUREMENT_LABELS[teamMembersPhaseMethod] || teamMembersPhaseMethod}`}</span>}
            {teamMembersQuick.phase_id && <span>{` | ${teamMembersAllowMultiple ? 'multiples resultados' : 'resultado unico por integrante'}`}</span>}
            {teamMembersQuick.phase_id && <span>{` | equipo: ${teamMembersMode === 'single_member' ? 'solo uno' : (teamMembersMode === 'total' ? 'total' : 'ambos')}`}</span>}
            {teamMembersAutoByPhase && <span>{` | reglas activas: ${teamMembersRules.length} (puntos automaticos por posicion)`}</span>}
            {!activeTeamPhaseAllowsMultiple && activePhaseId && (
              <span>{` | pendientes: ${teamsForEntry.length}/${teamsForCategory.length}`}</span>
            )}
            {!activeTeamPhaseAllowsMultiple && hiddenTeamsBySingleResultRule > 0 && (
              <span>{` | ocultados por ya cargados: ${hiddenTeamsBySingleResultRule}`}</span>
            )}
          </div>
          <div style={{ maxHeight: isMobile ? 'none' : 360, overflowY: isMobile ? 'visible' : 'auto' }}>
            {teamsForEntry.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#647063', padding: 18 }}>
                No hay equipos pendientes por cargar en este evento.
              </div>
            ) : isMobile ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {teamsForEntry.map(t => {
                  const a = t.members?.[0]
                  const b = t.members?.[1]
                  const row = teamMembersQuickRows[t.id] || {}
                  const selectedPerformer = row.performer || String(a?.id || b?.id || '')
                  const autoPoints = teamMembersAutoByPhase ? computePhaseAutoPoints(teamMembersPhase, row.posicion) : null
                  const manualSinglePoints = String(a?.id) === String(selectedPerformer) ? (row.puntos_a ?? '') : (row.puntos_b ?? '')
                  const pointsTotal = teamMembersAutoByPhase ? (autoPoints ?? 0) : (row.puntos_total ?? '')
                  const pointsA = teamMembersAutoByPhase
                    ? (teamMembersMode === 'single_member'
                        ? (String(a?.id) === String(selectedPerformer) ? autoPoints ?? 0 : 0)
                        : (autoPoints ?? 0))
                    : (row.puntos_a ?? '')
                  const pointsB = teamMembersAutoByPhase
                    ? (teamMembersMode === 'single_member'
                        ? (String(b?.id) === String(selectedPerformer) ? autoPoints ?? 0 : 0)
                        : (b ? (autoPoints ?? 0) : 0))
                    : (row.puntos_b ?? '')
                  return (
                    <div key={`team-member-mobile-${t.id}`} style={{ border: '1px solid #d5ddd3', borderRadius: 10, background: '#fff', padding: 10 }}>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>{(t.nombre || '').trim() || `Equipo ${t.id}`}</div>
                      <div style={{ display: 'grid', gap: 2, fontSize: 13, color: '#555' }}>
                        <div><b>A:</b> {a ? `${a.nombre} ${a.apellido}` : '-'}</div>
                        <div><b>B:</b> {b ? `${b.nombre} ${b.apellido}` : '-'}</div>
                      </div>
                      {teamMembersMode === 'single_member' && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
                          {a && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                              <input
                                type="radio"
                                name={`performer-mobile-${t.id}`}
                                checked={String(selectedPerformer) === String(a.id)}
                                onChange={() => patchTeamMemberRow(t.id, { performer: String(a.id) })}
                                style={{ width: 'auto' }}
                              />
                              Hace A
                            </label>
                          )}
                          {b && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                              <input
                                type="radio"
                                name={`performer-mobile-${t.id}`}
                                checked={String(selectedPerformer) === String(b.id)}
                                onChange={() => patchTeamMemberRow(t.id, { performer: String(b.id) })}
                                style={{ width: 'auto' }}
                              />
                              Hace B
                            </label>
                          )}
                        </div>
                      )}
                      <div className={teamMembersMode === 'sum_two' ? 'responsive-grid-2' : ''} style={{ marginTop: 8, display: 'grid', gridTemplateColumns: teamMembersMode === 'sum_two' ? '1fr 1fr' : '1fr', gap: 8 }}>
                        {teamMembersMode === 'single_member' ? (
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Puntos</label>
                            <input
                              type={teamMembersPhaseIsTime ? 'text' : 'number'}
                              value={teamMembersAutoByPhase ? (autoPoints ?? '') : manualSinglePoints}
                              disabled={teamMembersAutoByPhase}
                              onChange={e => {
                                const val = e.target.value
                                patchTeamMemberRow(t.id, String(selectedPerformer) === String(a?.id)
                                  ? { puntos_a: val, puntos_b: 0 }
                                  : { puntos_a: 0, puntos_b: val })
                              }}
                              placeholder={teamMembersAutoByPhase ? 'Auto' : (teamMembersPhaseIsTime ? 'HH:MM:SS' : '')}
                            />
                          </div>
                        ) : teamMembersMode === 'total' ? (
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Total equipo</label>
                            <input
                              type={teamMembersPhaseIsTime ? 'text' : 'number'}
                              value={pointsTotal}
                              disabled={teamMembersAutoByPhase}
                              onChange={e => patchTeamMemberRow(t.id, { puntos_total: e.target.value })}
                              placeholder={teamMembersAutoByPhase ? 'Auto' : (teamMembersPhaseIsTime ? 'HH:MM:SS' : '')}
                            />
                          </div>
                        ) : (
                          <>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label>Puntos A</label>
                              <input
                                type={teamMembersPhaseIsTime ? 'text' : 'number'}
                                value={pointsA}
                                disabled={teamMembersAutoByPhase}
                                onChange={e => patchTeamMemberRow(t.id, { puntos_a: e.target.value })}
                                placeholder={teamMembersAutoByPhase ? 'Auto' : (teamMembersPhaseIsTime ? 'HH:MM:SS' : '')}
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label>Puntos B</label>
                              <input
                                type={teamMembersPhaseIsTime ? 'text' : 'number'}
                                value={pointsB}
                                disabled={teamMembersAutoByPhase}
                                onChange={e => patchTeamMemberRow(t.id, { puntos_b: e.target.value })}
                                placeholder={teamMembersAutoByPhase ? 'Auto' : (teamMembersPhaseIsTime ? 'HH:MM:SS' : '')}
                              />
                            </div>
                          </>
                        )}
                        {teamMembersAutoByPhase && (
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Posicion</label>
                            <input
                              type="number"
                              value={row.posicion ?? ''}
                              onChange={e => patchTeamMemberRow(t.id, { posicion: e.target.value })}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Equipo</th>
                    <th>Integrante A</th>
                    <th>Integrante B</th>
                    {teamMembersMode === 'single_member' && <th>Quien hizo el evento</th>}
                    {teamMembersMode === 'single_member' && <th>Puntos</th>}
                    {teamMembersMode === 'total' && <th>Total equipo</th>}
                    {teamMembersMode === 'sum_two' && <th>Puntos A</th>}
                    {teamMembersMode === 'sum_two' && <th>Puntos B</th>}
                    {teamMembersAutoByPhase && <th>Posicion</th>}
                  </tr>
                </thead>
                <tbody>
                  {teamsForEntry.map(t => {
                    const a = t.members?.[0]
                    const b = t.members?.[1]
                    const row = teamMembersQuickRows[t.id] || {}
                    const selectedPerformer = row.performer || String(a?.id || b?.id || '')
                    const autoPoints = teamMembersAutoByPhase ? computePhaseAutoPoints(teamMembersPhase, row.posicion) : null
                    const manualSinglePoints = String(a?.id) === String(selectedPerformer) ? (row.puntos_a ?? '') : (row.puntos_b ?? '')
                    const pointsTotal = teamMembersAutoByPhase ? (autoPoints ?? 0) : (row.puntos_total ?? '')
                    const pointsA = teamMembersAutoByPhase
                      ? (teamMembersMode === 'single_member'
                          ? (String(a?.id) === String(selectedPerformer) ? autoPoints ?? 0 : 0)
                          : (autoPoints ?? 0))
                      : (row.puntos_a ?? '')
                    const pointsB = teamMembersAutoByPhase
                      ? (teamMembersMode === 'single_member'
                          ? (String(b?.id) === String(selectedPerformer) ? autoPoints ?? 0 : 0)
                          : (b ? (autoPoints ?? 0) : 0))
                      : (row.puntos_b ?? '')
                    return (
                      <tr key={`team-member-row-${t.id}`}>
                        <td>{(t.nombre || '').trim() || `Equipo ${t.id}`}</td>
                        <td>{a ? `${a.nombre} ${a.apellido}` : '-'}</td>
                        <td>{b ? `${b.nombre} ${b.apellido}` : '-'}</td>
                        {teamMembersMode === 'single_member' && (
                          <td>
                            <div style={{ display: 'flex', gap: 10 }}>
                              {a && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                  <input
                                    type="radio"
                                    name={`performer-${t.id}`}
                                    checked={String(selectedPerformer) === String(a.id)}
                                    onChange={() => patchTeamMemberRow(t.id, { performer: String(a.id) })}
                                    style={{ width: 'auto' }}
                                  />
                                  A
                                </label>
                              )}
                              {b && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                  <input
                                    type="radio"
                                    name={`performer-${t.id}`}
                                    checked={String(selectedPerformer) === String(b.id)}
                                    onChange={() => patchTeamMemberRow(t.id, { performer: String(b.id) })}
                                    style={{ width: 'auto' }}
                                  />
                                  B
                                </label>
                              )}
                            </div>
                          </td>
                        )}
                        {teamMembersMode === 'single_member' ? (
                          <td>
                            <input
                              type={teamMembersPhaseIsTime ? 'text' : 'number'}
                              value={teamMembersAutoByPhase ? (autoPoints ?? '') : manualSinglePoints}
                              disabled={teamMembersAutoByPhase}
                              onChange={e => {
                                const val = e.target.value
                                patchTeamMemberRow(t.id, String(selectedPerformer) === String(a?.id)
                                  ? { puntos_a: val, puntos_b: 0 }
                                  : { puntos_a: 0, puntos_b: val })
                              }}
                              placeholder={teamMembersAutoByPhase ? 'Auto' : (teamMembersPhaseIsTime ? 'HH:MM:SS' : '')}
                            />
                          </td>
                        ) : teamMembersMode === 'total' ? (
                          <td>
                            <input
                              type={teamMembersPhaseIsTime ? 'text' : 'number'}
                              value={pointsTotal}
                              disabled={teamMembersAutoByPhase}
                              onChange={e => patchTeamMemberRow(t.id, { puntos_total: e.target.value })}
                              placeholder={teamMembersAutoByPhase ? 'Auto' : (teamMembersPhaseIsTime ? 'HH:MM:SS' : '')}
                            />
                          </td>
                        ) : (
                          <>
                            <td>
                              <input
                                type={teamMembersPhaseIsTime ? 'text' : 'number'}
                                value={pointsA}
                                disabled={teamMembersAutoByPhase}
                                onChange={e => patchTeamMemberRow(t.id, { puntos_a: e.target.value })}
                                placeholder={teamMembersAutoByPhase ? 'Auto' : (teamMembersPhaseIsTime ? 'HH:MM:SS' : '')}
                              />
                            </td>
                            <td>
                              <input
                                type={teamMembersPhaseIsTime ? 'text' : 'number'}
                                value={pointsB}
                                disabled={teamMembersAutoByPhase}
                                onChange={e => patchTeamMemberRow(t.id, { puntos_b: e.target.value })}
                                placeholder={teamMembersAutoByPhase ? 'Auto' : (teamMembersPhaseIsTime ? 'HH:MM:SS' : '')}
                              />
                            </td>
                          </>
                        )}
                        {teamMembersAutoByPhase && (
                          <td>
                            <input
                              type="number"
                              value={row.posicion ?? ''}
                              onChange={e => patchTeamMemberRow(t.id, { posicion: e.target.value })}
                            />
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn-primary" onClick={saveBulkTeamMembers} disabled={teamMembersQuickSaving}>
              {teamMembersQuickSaving ? 'Guardando...' : 'Guardar por evento'}
            </button>
          </div>
        </div>
      )}

      {rulesModalOpen && (
        <Modal title="Configurar puntos por posicion" onClose={() => setRulesModalOpen(false)} width={620}>
          <div className="form-group">
            <label>Evento de posicion</label>
            <select
              value={rulesPhaseId}
              onChange={e => {
                const nextId = e.target.value
                const nextPhase = phases.find(p => String(p.id) === String(nextId))
                setRulesPhaseId(nextId)
                setRulesDraft(parseScoringRules(nextPhase?.scoring_rules))
              }}
            >
              {phases.filter(p => phaseTypeFromPhase(p) === 'posicion').map(ph => (
                <option key={ph.id} value={ph.id}>{ph.nombre}</option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: 12, color: '#647063', marginBottom: 8 }}>
            Define rangos: ejemplo 1-1 = 100, 2-2 = 90, 3 en adelante = 80.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto auto', gap: 8, alignItems: 'end', marginBottom: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Preset inverso por N participantes</label>
              <input
                type="number"
                min="1"
                value={rulesPresetCount}
                onChange={e => setRulesPresetCount(e.target.value)}
                placeholder={`Ej: ${participants.length || 10}`}
              />
            </div>
            <button className="btn-secondary btn-sm" onClick={() => applyInversePreset(participants.length)} title="1er puesto = inscritos, ultimo = 1">
              Inversa por inscritos
            </button>
            <button className="btn-secondary btn-sm" onClick={() => applyInversePreset(rulesPresetCount)} title="Usa la cantidad indicada en N">
              Inversa por N
            </button>
            <button className="btn-secondary btn-sm" onClick={applyPodiumPreset} title="1=100, 2=90, 3=80, 4+=60">
              Podio + resto
            </button>
          </div>
          <div style={{ display: 'grid', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
            {rulesDraft.map((r, idx) => (
              <div key={`rule-${idx}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Desde posicion</label>
                  <input type="number" value={r.min_pos ?? ''} onChange={e => setRulesDraft(prev => prev.map((it, i) => i === idx ? { ...it, min_pos: e.target.value } : it))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Hasta posicion (opcional)</label>
                  <input type="number" value={r.max_pos ?? ''} onChange={e => setRulesDraft(prev => prev.map((it, i) => i === idx ? { ...it, max_pos: e.target.value } : it))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Puntos</label>
                  <input type="number" value={r.points ?? ''} onChange={e => setRulesDraft(prev => prev.map((it, i) => i === idx ? { ...it, points: e.target.value } : it))} />
                </div>
                <button className="btn-danger btn-sm" onClick={() => setRulesDraft(prev => prev.filter((_, i) => i !== idx))} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <button className="btn-secondary" onClick={() => setRulesDraft(prev => [...prev, { min_pos: '', max_pos: '', points: '' }])}>+ Regla</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" onClick={() => setRulesModalOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={saveRules}>Guardar reglas</button>
            </div>
          </div>
        </Modal>
      )}

      {massDeleteModal.open && (
        <Modal title="Confirmar borrado masivo" onClose={closeMassDeleteModal} width={520}>
          <div style={{ color: '#2f3a2f', fontSize: 14, lineHeight: 1.5 }}>
            {massDeleteModal.scope === 'phase'
              ? `Se borraran todos los resultados de la fase "${massDeleteModal.phaseName}". Esta accion no se puede deshacer.`
              : 'Se borraran TODOS los resultados de esta competencia. Esta accion no se puede deshacer.'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn-secondary" onClick={closeMassDeleteModal} disabled={massDeleteLoading}>Cancelar</button>
            <button type="button" className="btn-danger" onClick={confirmMassDelete} disabled={massDeleteLoading}>
              {massDeleteLoading ? 'Borrando...' : 'Si, borrar'}
            </button>
          </div>
        </Modal>
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <h4 style={{ margin: 0, fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClipboardList size={16} />Resultados cargados</h4>
          <span style={{ fontSize: 12, color: '#647063' }}>
            Evento: <b style={{ color: '#ddd' }}>{activePhase?.nombre || '-'}</b>
            {categoryFilter ? ` | Categoria: ${categoryFilter}` : ' | Categoria: Todas'}
          </span>
        </div>
        <div style={{ maxHeight: isMobile ? 'none' : 360, overflowY: isMobile ? 'visible' : 'auto' }}>
          {isMobile ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {filteredResults.map(r => {
                const draft = editRows[r.id] || {}
                return (
                  <div key={`result-mobile-${r.id}`} style={{ border: '1px solid #d5ddd3', borderRadius: 10, padding: 10, background: '#fff' }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    {r.user_id
                        ? `${r.nombre || ''} ${r.apellido || ''}`.trim()
                        : (r.equipo || `Equipo ${r.team_id}`)}
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Valor</label>
                          <input
                            type={activePhaseIsTime ? 'text' : 'number'}
                            placeholder={activePhaseIsTime ? 'HH:MM:SS' : undefined}
                            value={draft.marca ?? r.marca ?? r.puntos ?? 0}
                            onChange={e => patchRow(r.id, 'marca', e.target.value)}
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Posicion</label>
                          <input type="number" value={r.posicion ?? ''} readOnly disabled />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn-secondary btn-sm" onClick={() => saveRow(r)} disabled={savingRowId === r.id}>
                          {savingRowId === r.id ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button className="btn-danger btn-sm" onClick={() => deleteRow(r.id)}>Eliminar</button>
                      </div>
                    </div>
                  </div>
                )
              })}
              {!filteredResults.length && <div style={{ textAlign: 'center', color: '#666', padding: 16 }}>Sin resultados</div>}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table>
              <thead><tr><th>Participante / Equipo</th><th>Valor</th><th>Posicion</th><th></th></tr></thead>
              <tbody>
                {filteredResults.map(r => {
                  const draft = editRows[r.id] || {}
                  return (
                    <tr key={r.id}>
                      <td>
                    {r.user_id
                          ? `${r.nombre || ''} ${r.apellido || ''}`.trim()
                          : (r.equipo || `Equipo ${r.team_id}`)}
                      </td>
                      <td>
                        <input
                          type={activePhaseIsTime ? 'text' : 'number'}
                          placeholder={activePhaseIsTime ? 'HH:MM:SS' : undefined}
                          value={draft.marca ?? r.marca ?? r.puntos ?? 0}
                          onChange={e => patchRow(r.id, 'marca', e.target.value)}
                        />
                      </td>
                      <td><input type="number" value={r.posicion ?? ''} readOnly disabled /></td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-secondary btn-sm" onClick={() => saveRow(r)} disabled={savingRowId === r.id}>{savingRowId === r.id ? '...' : 'Guardar'}</button>
                        <button className="btn-danger btn-sm" onClick={() => deleteRow(r.id)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
                {!filteredResults.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#666', padding: 16 }}>Sin resultados</td></tr>}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function getDownloadFilenameFromDisposition(disposition, fallbackName) {
  const raw = String(disposition || '')
  const utf8Match = raw.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]).replace(/[\\/:*?"<>|]/g, '_')
    } catch {
      return utf8Match[1].replace(/[\\/:*?"<>|]/g, '_')
    }
  }
  const plainMatch = raw.match(/filename\s*=\s*"?([^\";]+)"?/i)
  if (plainMatch?.[1]) {
    return plainMatch[1].replace(/[\\/:*?"<>|]/g, '_')
  }
  return fallbackName
}

function CompetitionJudgesPanel({ competition }) {
  const [items, setItems] = useState([])
  const [auditItems, setAuditItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = async () => {
    if (!competition?.id) return
    setLoading(true)
    try {
      const [judgesRes, auditRes] = await Promise.all([
        api.get(`/competitions/${competition.id}/judges`),
        api.get(`/competitions/${competition.id}/judge-audit`),
      ])
      setItems(Array.isArray(judgesRes.data) ? judgesRes.data : [])
      setAuditItems(Array.isArray(auditRes.data) ? auditRes.data : [])
      setMsg(null)
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo cargar jueces y auditoria.' })
      setItems([])
      setAuditItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [competition?.id])

  const inviteJudge = async (event) => {
    event.preventDefault()
    if (!inviteEmail.trim()) return
    setBusy(true)
    try {
      await api.post(`/competitions/${competition.id}/judges/invite`, { email: inviteEmail.trim() })
      setInviteEmail('')
      setMsg({ type: 'success', text: 'Invitacion enviada.' })
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo enviar la invitacion.' })
    } finally {
      setBusy(false)
    }
  }

  const revokeJudge = async (item) => {
    if (!window.confirm(`Eliminar acceso de juez para ${item.judge_display_name || item.invited_email}?`)) return
    setBusy(true)
    try {
      await api.delete(`/competitions/${competition.id}/judges/${item.id}`)
      setMsg({ type: 'success', text: 'Juez removido.' })
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo remover el juez.' })
    } finally {
      setBusy(false)
    }
  }

  const activeItems = items.filter((item) => item.status === 'active')
  const pendingItems = items.filter((item) => item.status === 'pending')

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div>
          <div style={{ color: '#F5F7FA', fontSize: 20, fontWeight: 800 }}>Jueces de la competencia</div>
          <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>Invita por correo, revisa el estado y mantén trazabilidad de sus acciones.</div>
        </div>
        <form onSubmit={inviteJudge} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="correo@finalrep.com"
            style={{ flex: '1 1 280px', minWidth: 0 }}
          />
          <button className="btn-primary" type="submit" disabled={busy || !inviteEmail.trim()}>
            {busy ? 'Enviando...' : 'Invitar juez'}
          </button>
        </form>
        {msg ? <div className={`alert alert-${msg.type}`}>{msg.text}</div> : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          <div style={{ color: '#F5F7FA', fontWeight: 800 }}>Jueces activos</div>
          <div style={{ color: '#AAB2C0', fontSize: 13 }}>{activeItems.length} activos</div>
          {activeItems.length ? activeItems.map((item) => (
            <div key={item.id} style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.58)', padding: 14, display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 800, color: '#F5F7FA' }}>{item.judge_display_name || item.judge_participant_name || item.invited_email}</div>
              <div style={{ color: '#AAB2C0', fontSize: 12 }}>{item.judge_username || item.invited_email}</div>
              <div style={{ color: '#7AF0DE', fontSize: 12, fontWeight: 700 }}>Activo</div>
              <button className="btn-danger btn-sm" onClick={() => revokeJudge(item)} disabled={busy}>
                Remover
              </button>
            </div>
          )) : <div style={{ color: '#AAB2C0', fontSize: 13 }}>Aun no hay jueces activos.</div>}
        </div>

        <div className="card" style={{ display: 'grid', gap: 10 }}>
          <div style={{ color: '#F5F7FA', fontWeight: 800 }}>Invitaciones pendientes</div>
          <div style={{ color: '#AAB2C0', fontSize: 13 }}>{pendingItems.length} pendientes</div>
          {pendingItems.length ? pendingItems.map((item) => (
            <div key={item.id} style={{ borderRadius: 16, border: '1px solid rgba(245,158,11,0.24)', background: 'rgba(245,158,11,0.08)', padding: 14, display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 800, color: '#F5F7FA' }}>{item.judge_display_name || item.invited_email}</div>
              <div style={{ color: '#AAB2C0', fontSize: 12 }}>{item.invited_email}</div>
              <div style={{ color: '#F8C56E', fontSize: 12, fontWeight: 700 }}>Pendiente de respuesta</div>
              <button className="btn-secondary btn-sm" onClick={() => revokeJudge(item)} disabled={busy}>
                Cancelar invitacion
              </button>
            </div>
          )) : <div style={{ color: '#AAB2C0', fontSize: 13 }}>No hay invitaciones pendientes.</div>}
        </div>
      </div>

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ color: '#F5F7FA', fontWeight: 800 }}>Auditoria de jueces</div>
        {loading ? <div style={{ color: '#AAB2C0', fontSize: 13 }}>Cargando auditoria...</div> : null}
        {!loading && !auditItems.length ? <div style={{ color: '#AAB2C0', fontSize: 13 }}>Todavia no hay acciones registradas.</div> : null}
        {!loading && auditItems.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {auditItems.slice(0, 30).map((item) => (
              <div key={item.id} style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.58)', padding: 12, display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ color: '#F5F7FA', fontWeight: 700 }}>{item.action}</div>
                  <div style={{ color: '#AAB2C0', fontSize: 12 }}>{formatDate(item.created_at)}</div>
                </div>
                <div style={{ color: '#AAB2C0', fontSize: 12 }}>
                  {item.actor_display_name || item.judge_invited_email || 'Sistema'} · resultado: {item.result}
                </div>
                {item.target_type || item.target_id ? (
                  <div style={{ color: '#6B7280', fontSize: 12 }}>
                    {item.target_type || 'target'} {item.target_id ? `· ${item.target_id}` : ''}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function CompetitionJudgeCardsPanel({ competition, isMobile = false }) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [phases, setPhases] = useState([])
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState({
    phase_ids: [],
    categories: [],
    layout: 'custom',
    custom_cols: 3,
    custom_rows: 6,
    sort_mode: 'phase_heat_lane_name',
    only_confirmed: true,
    include_unassigned: true,
    include_score_field: true,
    include_signature_field: true,
    include_notes_field: false,
    include_qr: true,
    include_cedula: true,
    qr_expiration_days: 30,
    title: '',
    page_size: 'letter',
    font_scale: 1,
    line_spacing: 1.15,
    writing_space_chars: 22,
  })

  const load = async () => {
    setLoading(true)
    try {
      const [phasesRes, categoriesRes] = await Promise.all([
        api.get(`/competitions/${competition.id}/phases`),
        api.get(`/competitions/${competition.id}/categories`),
      ])
      const phaseItems = Array.isArray(phasesRes.data) ? phasesRes.data : []
      const categoryItems = Array.isArray(categoriesRes.data) ? categoriesRes.data : []
      setPhases(phaseItems)
      setCategories(categoryItems)
      setForm(prev => {
        const activeIds = new Set((prev.phase_ids || []).map(Number))
        const availableIds = phaseItems.map(item => Number(item.id)).filter(Number.isFinite)
        const normalized = availableIds.filter(id => activeIds.has(id))
        return {
          ...prev,
          phase_ids: normalized.length ? normalized : availableIds,
        }
      })
    } catch (error) {
      setMsg({ type: 'error', text: error?.response?.data?.detail || 'No se pudieron cargar fases y categorias' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [competition.id])

  const phaseCount = form.phase_ids.length || phases.length
  const categoryCount = form.categories.length
  const customCols = sanitizeJudgeCardGridValue(form.custom_cols, 3, 1, 4)
  const customRows = sanitizeJudgeCardGridValue(form.custom_rows, 6, 1, 10)
  const safeFontScale = Math.min(1.35, Math.max(0.75, Number(form.font_scale || 1)))
  const safeLineSpacing = Math.min(1.8, Math.max(0.8, Number(form.line_spacing || 1)))
  const safeWritingSpaceChars = Math.min(48, Math.max(8, Number(form.writing_space_chars || 22)))
  const requestedLayout = `${customCols}x${customRows}`
  const resolvedPreviewLayout = requestedLayout
  const [previewCols, previewRows] = String(resolvedPreviewLayout || '2x5').split('x').map((item) => Number(item || 0))
  const safePreviewCols = Math.max(1, previewCols || 2)
  const safePreviewRows = Math.max(1, previewRows || 5)
  const previewCapacity = safePreviewCols * safePreviewRows
  const previewPageSpec = JUDGE_CARD_PAGE_SPECS[String(form.page_size || 'letter').trim().toLowerCase()] || JUDGE_CARD_PAGE_SPECS.letter
  const pageAspect = previewPageSpec.width / previewPageSpec.height
  const selectedPhaseNames = phases
    .filter((phase) => form.phase_ids.includes(Number(phase.id)))
    .map((phase) => String(phase.nombre || '').trim())
    .filter(Boolean)
  const selectedCategoryNames = (form.categories || []).map((item) => String(item || '').trim()).filter(Boolean)
  const previewCards = Array.from({ length: previewCapacity }, (_, index) => ({
    participantName: `Participante ${index + 1}`,
    phaseName: selectedPhaseNames[index % Math.max(1, selectedPhaseNames.length)] || 'Evento',
    category: selectedCategoryNames[index % Math.max(1, selectedCategoryNames.length)] || 'Categoria',
    heat: `Heat ${Math.floor(index / Math.max(1, safePreviewCols)) + 1}`,
    lane: index + 1,
    cedula: `10${String(index + 1).padStart(6, '0')}`,
    zone: index % 2 === 0 ? 'Arena Norte' : '',
    includeScoreField: form.include_score_field,
    includeSignatureField: form.include_signature_field,
    includeNotesField: form.include_notes_field,
  }))
  const previewSheet = useMemo(() => {
    const margin = 24
    const headerSpace = 28
    const scaleBaseWidth = isMobile ? 340 : 430
    const scale = scaleBaseWidth / previewPageSpec.width
    const pageWidth = previewPageSpec.width * scale
    const pageHeight = previewPageSpec.height * scale
    const gridWidth = (previewPageSpec.width - (margin * 2)) * scale
    const gridHeight = (previewPageSpec.height - (margin * 2) - headerSpace) * scale
    const cellWidth = gridWidth / safePreviewCols
    const cellHeight = gridHeight / safePreviewRows
    return {
      scale,
      pageWidth,
      pageHeight,
      margin: margin * scale,
      headerSpace: headerSpace * scale,
      cellWidth,
      cellHeight,
      subtitleTop: (margin + 12) * scale,
      titleTop: (margin - 4) * scale,
      contentTop: (margin + headerSpace) * scale,
    }
  }, [isMobile, previewPageSpec.height, previewPageSpec.width, safePreviewCols, safePreviewRows])

  const toggleSelection = (collection, value) => {
    const normalized = String(value)
    if (collection.includes(normalized)) {
      return collection.filter(item => item !== normalized)
    }
    return [...collection, normalized]
  }

  const togglePhase = (phaseId) => {
    setForm(prev => {
      const strItems = (prev.phase_ids || []).map(item => String(item))
      const next = toggleSelection(strItems, String(phaseId))
      return { ...prev, phase_ids: next.map(Number).filter(Number.isFinite) }
    })
  }

  const toggleCategory = (categoryName) => {
    setForm(prev => ({
      ...prev,
      categories: toggleSelection(prev.categories || [], String(categoryName)),
    }))
  }

  const checkboxStyle = {
    accentColor: '#FF6B00',
    width: 16,
    height: 16,
    margin: 0,
    cursor: 'pointer',
  }
  const toggleRowStyle = (enabled) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    border: `1px solid ${enabled ? 'rgba(255,107,0,0.42)' : '#252A33'}`,
    background: enabled ? 'rgba(255,107,0,0.10)' : 'rgba(13,15,18,0.72)',
    borderRadius: 12,
    padding: '8px 10px',
    color: enabled ? '#F5F7FA' : '#D7DEE8',
    fontSize: 13,
    fontWeight: 600,
  })
  const settingsSectionStyle = {
    border: '1px solid #252A33',
    borderRadius: 14,
    background: 'rgba(13,15,18,0.72)',
    padding: isMobile ? 12 : 14,
    display: 'grid',
    gap: 12,
  }
  const sliderCardStyle = {
    border: '1px solid rgba(255,107,0,0.18)',
    borderRadius: 14,
    background: 'linear-gradient(180deg, rgba(23,27,33,0.98) 0%, rgba(13,15,18,0.98) 100%)',
    padding: isMobile ? '12px 12px 10px' : '14px 14px 12px',
    display: 'grid',
    gap: 10,
  }
  const sliderInputStyle = {
    width: '100%',
    accentColor: '#FF6B00',
    cursor: 'pointer',
    margin: 0,
  }

  const downloadCards = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const payload = {
        competition_id: Number(competition.id),
        phase_ids: form.phase_ids.length ? form.phase_ids.map(Number) : null,
        categories: form.categories.length ? form.categories : null,
        layout: requestedLayout,
        sort_mode: form.sort_mode,
        only_confirmed: form.only_confirmed ? 1 : 0,
        include_unassigned: form.include_unassigned ? 1 : 0,
        include_score_field: form.include_score_field ? 1 : 0,
        include_signature_field: form.include_signature_field ? 1 : 0,
        include_notes_field: form.include_notes_field ? 1 : 0,
        include_qr: form.include_qr ? 1 : 0,
        extra_fields: form.include_cedula ? ['cedula'] : [],
        qr_expiration_days: Math.max(1, Number(form.qr_expiration_days || 30)),
        title: String(form.title || '').trim() || null,
        page_size: String(form.page_size || 'letter').trim() || 'letter',
        font_scale: Number(form.font_scale || 1),
        line_spacing: Number(form.line_spacing || 1),
        writing_space_chars: Number(form.writing_space_chars || 22),
      }
      const response = await api.post('/judge-cards/export-pdf', payload, { responseType: 'blob' })
      const blob = new Blob(
        [response.data],
        { type: response.headers?.['content-type'] || 'application/pdf' }
      )
      const url = URL.createObjectURL(blob)
      const fallbackName = `finalrep_tarjetas_competencia_${competition.id}.pdf`
      const filename = getDownloadFilenameFromDisposition(response.headers?.['content-disposition'], fallbackName)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setMsg({ type: 'success', text: 'PDF generado y descargado.' })
    } catch (error) {
      const detail = await readBlobErrorDetail(error, 'No se pudo generar el PDF de tarjetas')
      setMsg({ type: 'error', text: detail })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 16 }}>Tarjetas de puntuacion</h4>
          <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>
            Genera un solo PDF para imprimir todo el bloque de jueceo.
          </div>
        </div>
        <button type="button" className="btn-secondary btn-sm" onClick={load} disabled={loading || busy}>Recargar</button>
      </div>

      {msg ? <div className={`alert alert-${msg.type}`}>{msg.text}</div> : null}
      {loading ? <div style={{ color: '#AAB2C0', fontSize: 13 }}>Cargando configuracion...</div> : null}

      {!loading ? (
        <form onSubmit={downloadCards} style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div style={{ border: '1px solid #252A33', borderRadius: 14, background: 'rgba(13,15,18,0.72)', padding: 12, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 800 }}>Eventos</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setForm(prev => ({ ...prev, phase_ids: phases.map(item => Number(item.id)).filter(Number.isFinite) }))}>Todos</button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setForm(prev => ({ ...prev, phase_ids: [] }))}>Limpiar</button>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6, maxHeight: 200, overflowY: 'auto', paddingRight: 4 }}>
                {phases.map((phase) => {
                  const checked = form.phase_ids.includes(Number(phase.id))
                  return (
                    <label key={`judge-card-phase-${phase.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#D7DEE8', fontSize: 13, border: checked ? '1px solid rgba(255,107,0,0.35)' : '1px solid #252A33', borderRadius: 10, padding: '7px 9px', background: checked ? 'rgba(255,107,0,0.10)' : 'rgba(9,11,14,0.56)' }}>
                      <input type="checkbox" style={checkboxStyle} checked={checked} onChange={() => togglePhase(phase.id)} />
                      <span>{phase.nombre}</span>
                    </label>
                  )
                })}
                {!phases.length ? <div style={{ color: '#6B7280', fontSize: 12 }}>No hay eventos configurados.</div> : null}
              </div>
            </div>

            <div style={{ border: '1px solid #252A33', borderRadius: 14, background: 'rgba(13,15,18,0.72)', padding: 12, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 800 }}>Categorias</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setForm(prev => ({ ...prev, categories: categories.map(item => String(item.nombre || '').trim()).filter(Boolean) }))}>Todas</button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setForm(prev => ({ ...prev, categories: [] }))}>Limpiar</button>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6, maxHeight: 200, overflowY: 'auto', paddingRight: 4 }}>
                {categories.map((category) => {
                  const name = String(category.nombre || '').trim()
                  if (!name) return null
                  const checked = form.categories.includes(name)
                  return (
                    <label key={`judge-card-category-${category.id || name}`} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#D7DEE8', fontSize: 13, border: checked ? '1px solid rgba(0,194,168,0.38)' : '1px solid #252A33', borderRadius: 10, padding: '7px 9px', background: checked ? 'rgba(0,194,168,0.10)' : 'rgba(9,11,14,0.56)' }}>
                      <input type="checkbox" style={checkboxStyle} checked={checked} onChange={() => toggleCategory(name)} />
                      <span>{name}</span>
                    </label>
                  )
                })}
                {!categories.length ? <div style={{ color: '#6B7280', fontSize: 12 }}>No hay categorias; se usaran todos.</div> : null}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <div style={settingsSectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 800 }}>Hoja y densidad</div>
                  <div style={{ color: '#6B7280', fontSize: 12, marginTop: 3 }}>Define el tamaño de hoja y cuántas tarjetas salen por página.</div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 12, border: '1px solid rgba(255,107,0,0.22)', background: 'rgba(255,107,0,0.08)' }}>
                  <div style={{ color: '#AAB2C0', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Layout</div>
                  <div style={{ color: '#F5F7FA', fontSize: 18, fontWeight: 800 }}>{requestedLayout.replace('x', ' x ')}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#AAB2C0', fontSize: 12 }}>Tamaño de hoja</span>
                  <select value={form.page_size} onChange={(e) => setForm(prev => ({ ...prev, page_size: e.target.value }))}>
                    <option value="letter">Carta</option>
                    <option value="a4">A4</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#AAB2C0', fontSize: 12 }}>Columnas</span>
                  <input
                    type="number"
                    min="1"
                    max="4"
                    value={form.custom_cols}
                    onChange={(e) => setForm(prev => ({ ...prev, custom_cols: e.target.value }))}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#AAB2C0', fontSize: 12 }}>Filas</span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={form.custom_rows}
                    onChange={(e) => setForm(prev => ({ ...prev, custom_rows: e.target.value }))}
                  />
                </label>
                <div style={{ border: '1px solid #252A33', borderRadius: 12, background: 'rgba(9,11,14,0.56)', padding: 10, display: 'grid', alignContent: 'center' }}>
                  <div style={{ color: '#AAB2C0', fontSize: 12 }}>Tarjetas por hoja</div>
                  <div style={{ color: '#F5F7FA', fontSize: 22, fontWeight: 800, marginTop: 4 }}>{customCols * customRows}</div>
                </div>
              </div>
            </div>

            <div style={settingsSectionStyle}>
              <div>
                <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 800 }}>Tipografía y escritura</div>
                <div style={{ color: '#6B7280', fontSize: 12, marginTop: 3 }}>Ajusta legibilidad, respiración vertical y longitud de las líneas a diligenciar.</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                <label style={sliderCardStyle}>
                  <span style={{ color: '#AAB2C0', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.45 }}>Tamaño letra</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <strong style={{ color: '#F5F7FA', fontSize: 18 }}>{safeFontScale.toFixed(2)}</strong>
                    <span style={{ color: '#6B7280', fontSize: 12 }}>0.75 - 1.35</span>
                  </div>
                  <input style={sliderInputStyle} type="range" min="0.75" max="1.35" step="0.05" value={form.font_scale} onChange={(e) => setForm(prev => ({ ...prev, font_scale: e.target.value }))} />
                </label>
                <label style={sliderCardStyle}>
                  <span style={{ color: '#AAB2C0', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.45 }}>Espaciado lineas</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <strong style={{ color: '#F5F7FA', fontSize: 18 }}>{safeLineSpacing.toFixed(2)}</strong>
                    <span style={{ color: '#6B7280', fontSize: 12 }}>0.80 - 1.80</span>
                  </div>
                  <input style={sliderInputStyle} type="range" min="0.8" max="1.8" step="0.05" value={form.line_spacing} onChange={(e) => setForm(prev => ({ ...prev, line_spacing: e.target.value }))} />
                </label>
                <label style={sliderCardStyle}>
                  <span style={{ color: '#AAB2C0', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.45 }}>Largo escritura</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <strong style={{ color: '#F5F7FA', fontSize: 18 }}>{safeWritingSpaceChars}</strong>
                    <span style={{ color: '#6B7280', fontSize: 12 }}>8 - 48</span>
                  </div>
                  <input style={sliderInputStyle} type="range" min="8" max="48" step="1" value={form.writing_space_chars} onChange={(e) => setForm(prev => ({ ...prev, writing_space_chars: e.target.value }))} />
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 0.9fr', gap: 12 }}>
              <div style={settingsSectionStyle}>
                <div>
                  <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 800 }}>Documento</div>
                  <div style={{ color: '#6B7280', fontSize: 12, marginTop: 3 }}>Define el nombre del archivo y el orden en que se organizan las tarjetas.</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: '#AAB2C0', fontSize: 12 }}>Titulo del documento</span>
                    <input value={form.title} onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder={`Tarjetas de puntuacion - ${competition.nombre}`} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: '#AAB2C0', fontSize: 12 }}>Orden</span>
                    <select value={form.sort_mode} onChange={(e) => setForm(prev => ({ ...prev, sort_mode: e.target.value }))}>
                      <option value="phase_heat_lane_name">Evento / heat / carril / nombre</option>
                      <option value="name">Nombre</option>
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: '#AAB2C0', fontSize: 12 }}>Expiracion QR (dias)</span>
                    <input type="number" min="1" max="365" value={form.qr_expiration_days} onChange={(e) => setForm(prev => ({ ...prev, qr_expiration_days: e.target.value }))} />
                  </label>
                </div>
              </div>

              <div style={settingsSectionStyle}>
                <div>
                  <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 800 }}>Contenido</div>
                  <div style={{ color: '#6B7280', fontSize: 12, marginTop: 3 }}>Activa solo los datos que necesitas imprimir en cada tarjeta.</div>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <label style={toggleRowStyle(form.only_confirmed)}><span>Solo confirmados</span><input type="checkbox" style={checkboxStyle} checked={form.only_confirmed} onChange={(e) => setForm(prev => ({ ...prev, only_confirmed: e.target.checked }))} /></label>
                  <label style={toggleRowStyle(form.include_unassigned)}><span>Incluir no asignados a heat</span><input type="checkbox" style={checkboxStyle} checked={form.include_unassigned} onChange={(e) => setForm(prev => ({ ...prev, include_unassigned: e.target.checked }))} /></label>
                  <label style={toggleRowStyle(form.include_qr)}><span>Incluir QR por tarjeta</span><input type="checkbox" style={checkboxStyle} checked={form.include_qr} onChange={(e) => setForm(prev => ({ ...prev, include_qr: e.target.checked }))} /></label>
                  <label style={toggleRowStyle(form.include_score_field)}><span>Campo de puntuacion</span><input type="checkbox" style={checkboxStyle} checked={form.include_score_field} onChange={(e) => setForm(prev => ({ ...prev, include_score_field: e.target.checked }))} /></label>
                  <label style={toggleRowStyle(form.include_signature_field)}><span>Campo firma atleta</span><input type="checkbox" style={checkboxStyle} checked={form.include_signature_field} onChange={(e) => setForm(prev => ({ ...prev, include_signature_field: e.target.checked }))} /></label>
                  <label style={toggleRowStyle(form.include_notes_field)}><span>Campo notas</span><input type="checkbox" style={checkboxStyle} checked={form.include_notes_field} onChange={(e) => setForm(prev => ({ ...prev, include_notes_field: e.target.checked }))} /></label>
                  <label style={toggleRowStyle(form.include_cedula)}><span>Mostrar cedula</span><input type="checkbox" style={checkboxStyle} checked={form.include_cedula} onChange={(e) => setForm(prev => ({ ...prev, include_cedula: e.target.checked }))} /></label>
                </div>
              </div>
            </div>
          </div>

          <div style={{ border: '1px solid rgba(0,194,168,0.24)', borderRadius: 12, background: 'rgba(0,194,168,0.08)', padding: 10, color: '#D7DEE8', fontSize: 13 }}>
            Se exportaran {phaseCount} evento(s){categoryCount ? ` y ${categoryCount} categoria(s)` : ''} en un solo archivo listo para impresion. Layout activo: {resolvedPreviewLayout.replace('x', ' x ')}.
          </div>
          <div style={{ border: '1px solid #252A33', borderRadius: 12, background: 'rgba(13,15,18,0.72)', padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 800 }}>Vista previa</div>
            <div style={{ color: '#AAB2C0', fontSize: 12 }}>
              Replica el PDF en escala real de layout.
            </div>
            <div style={{ borderRadius: 10, border: '1px solid #252A33', background: '#E5E7EB', padding: 12, display: 'grid', placeItems: 'center' }}>
              <div style={{ width: '100%', maxWidth: isMobile ? 340 : 430, aspectRatio: `${pageAspect}`, background: '#FFFFFF', border: '1px solid #D1D5DB', borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: previewSheet.margin, top: previewSheet.titleTop, color: '#0D0F12', fontSize: 11 * previewSheet.scale, fontWeight: 700, lineHeight: 1 }}>
                  {String(form.title || '').trim() || `Tarjetas de puntuacion - ${competition.nombre}`}
                </div>
                <div style={{ position: 'absolute', left: previewSheet.margin, top: previewSheet.subtitleTop, color: '#6B7280', fontSize: 7 * previewSheet.scale, lineHeight: 1 }}>
                  {`Competencia: ${competition.nombre} | Pagina 1/1 | ${previewPageSpec.label} | ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`}
                </div>
                {previewCards.map((item, idx) => {
                  const row = Math.floor(idx / safePreviewCols)
                  const col = idx % safePreviewCols
                  const cardLeft = previewSheet.margin + (col * previewSheet.cellWidth)
                  const cardTop = previewSheet.contentTop + (row * previewSheet.cellHeight)
                  const pad = 6 * previewSheet.scale
                  const qrSize = JUDGE_CARD_QR_FIXED_SIZE_PT * previewSheet.scale
                  const qrSafeZone = JUDGE_CARD_QR_SAFE_ZONE_PT * previewSheet.scale
                  const columnGap = JUDGE_CARD_COLUMN_GAP_PT * previewSheet.scale
                  const rightColumnWidth = form.include_qr ? qrSize + (qrSafeZone * 2) : 0
                  const metaRows = buildJudgeCardPreviewMetaRows(item, form.include_cedula)
                  const formRows = buildJudgeCardPreviewFormRows(item, safeWritingSpaceChars)
                  const columnRows = [...metaRows, ...formRows]
                  const topBandHeight = JUDGE_CARD_TITLE_BAND_PT * previewSheet.scale
                  const nameTop = pad
                  const bodyTop = topBandHeight
                  const bodyBottom = previewSheet.cellHeight - pad
                  const bodyHeight = bodyBottom - bodyTop
                  const textWidth = previewSheet.cellWidth - (pad * 2) - rightColumnWidth - (form.include_qr ? columnGap : 0)
                  const lineStep = 7.2 * previewSheet.scale * safeFontScale * safeLineSpacing
                  const blockHeight = columnRows.length
                    ? ((columnRows.length - 1) * lineStep) + (columnRows[columnRows.length - 1].size * previewSheet.scale * safeFontScale)
                    : 0
                  let rowY = bodyTop + ((bodyHeight - blockHeight) / 2)
                  return (
                    <div
                      key={`preview-card-${idx}`}
                      style={{
                        position: 'absolute',
                        left: cardLeft,
                        top: cardTop,
                        width: previewSheet.cellWidth,
                        height: previewSheet.cellHeight,
                        border: `${0.8 * previewSheet.scale}px solid #252A33`,
                        boxSizing: 'border-box',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          left: pad,
                          right: pad,
                          top: nameTop,
                          color: '#0D0F12',
                          fontSize: 8.8 * previewSheet.scale,
                          fontWeight: 700,
                          lineHeight: 1,
                          textAlign: 'center',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.participantName}
                      </div>
                      {columnRows.map((rowItem, rowIdx) => {
                        const node = (
                          <div
                            key={`preview-card-${idx}-row-${rowIdx}`}
                            style={{
                              position: 'absolute',
                              left: pad,
                              top: rowY,
                              width: Math.max(0, textWidth),
                              color: rowItem.color,
                              fontSize: rowItem.size * previewSheet.scale * safeFontScale,
                              fontWeight: rowItem.bold ? 700 : 400,
                              whiteSpace: 'nowrap',
                              lineHeight: 1,
                              overflow: 'hidden',
                            }}
                          >
                            {rowItem.text}
                          </div>
                        )
                        rowY += lineStep
                        return node
                      })}
                      {form.include_qr ? (
                        <div
                          style={{
                            position: 'absolute',
                            right: pad + qrSafeZone,
                            top: bodyTop + ((bodyHeight - qrSize) / 2),
                            width: qrSize,
                            height: qrSize,
                            border: `${0.9 * previewSheet.scale}px solid #252A33`,
                            background: 'linear-gradient(135deg, #F5F7FA 0%, #F5F7FA 100%)',
                            overflow: 'hidden',
                          }}
                        >
                          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, #0D0F12 0, #0D0F12 2px, transparent 2px, transparent 4px), repeating-linear-gradient(90deg, #0D0F12 0, #0D0F12 2px, transparent 2px, transparent 4px)', opacity: 0.9 }} />
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button type="submit" className="btn-primary btn-sm" disabled={busy || !phases.length}>
              {busy ? 'Generando PDF...' : 'Descargar PDF'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

function CompetitionsTab() {
  const { role, organizerEnabled, adminEnabled } = useAuth()
  const isOrganizer = role === 'organizer' || organizerEnabled
  const isAdmin = role === 'admin' || adminEnabled
  const [competitions, setCompetitions] = useState([])
  const [msg, setMsg] = useState(null)
  const [successToast, setSuccessToast] = useState(null)
  const [showConfirmPublish, setShowConfirmPublish] = useState(false)
  const [deleteCompetitionTarget, setDeleteCompetitionTarget] = useState(null)
  const [deleteCompetitionBusy, setDeleteCompetitionBusy] = useState(false)
  const [deleteCompetitionConfirmText, setDeleteCompetitionConfirmText] = useState('')
  const [editor, setEditor] = useState(null)
  const [enrollingComp, setEnrollingComp] = useState(null)
  const [enrollCounts, setEnrollCounts] = useState({})
  const [competitionMeta, setCompetitionMeta] = useState({})
  const [selectedCompetition, setSelectedCompetition] = useState(null)
  const [selectedTab, setSelectedTab] = useState('setup')
  const [ticketingModalOpen, setTicketingModalOpen] = useState(false)
  const [ticketingRefreshKey, setTicketingRefreshKey] = useState(0)
  const [linkCopied, setLinkCopied] = useState(false)
  const [competitionTab, setCompetitionTab] = useState('phases')
  const [selectedParticipants, setSelectedParticipants] = useState([])
  const [participantDetail, setParticipantDetail] = useState(null)
  const [deleteEnrollmentTarget, setDeleteEnrollmentTarget] = useState(null)
  const [deleteEnrollmentBusy, setDeleteEnrollmentBusy] = useState(false)
  const [enrollmentListMenuOpen, setEnrollmentListMenuOpen] = useState(false)
  const [enrollmentListGroupByCategory, setEnrollmentListGroupByCategory] = useState(false)
  const [enrollmentCategoryFilter, setEnrollmentCategoryFilter] = useState('')
  const [enrollmentExpandedGroups, setEnrollmentExpandedGroups] = useState({})
  const [previewImage, setPreviewImage] = useState(null)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const [selectedCategoryCount, setSelectedCategoryCount] = useState(0)
  const [selectedCompetitionCategories, setSelectedCompetitionCategories] = useState([])
  const [selectedPhaseCount, setSelectedPhaseCount] = useState(0)
  const enrollmentListMenuRef = useRef(null)

  const syncCompetitionParticipants = async (competitionId) => {
    const res = await api.get(`/competitions/${competitionId}/participants`)
    const items = res.data || []
    setEnrollCounts(prev => ({ ...prev, [competitionId]: items.filter(p => p.estado === 'confirmado').length }))
    return items
  }
  const syncCompetitionMeta = async (competitionId) => {
    try {
      const [categoriesRes, phasesRes] = await Promise.all([
        api.get(`/competitions/${competitionId}/categories`),
        api.get(`/competitions/${competitionId}/phases`),
      ])
      setCompetitionMeta(prev => ({
        ...prev,
        [competitionId]: {
          categories: Array.isArray(categoriesRes.data) ? categoriesRes.data.length : 0,
          phases: Array.isArray(phasesRes.data) ? phasesRes.data.length : 0,
        },
      }))
    } catch {
      setCompetitionMeta(prev => ({
        ...prev,
        [competitionId]: { categories: 0, phases: 0 },
      }))
    }
  }
  const refreshSelectedCompetitionMeta = async (competitionId) => {
    try {
      const [categoriesRes, phasesRes] = await Promise.all([
        api.get(`/competitions/${competitionId}/categories`),
        api.get(`/competitions/${competitionId}/phases`),
      ])
      const categoryItems = Array.isArray(categoriesRes.data) ? categoriesRes.data : []
      setSelectedCompetitionCategories(categoryItems)
      setSelectedCategoryCount(categoryItems.length)
      setSelectedPhaseCount((phasesRes.data || []).length)
    } catch {
      setSelectedCompetitionCategories([])
      setSelectedCategoryCount(0)
      setSelectedPhaseCount(0)
    }
  }

  const participantDetailName = participantDetail
    ? `${participantDetail.nombre || ''} ${participantDetail.apellido || ''}`.trim()
    : ''
  const enrollmentCategoryOptions = useMemo(() => {
    const names = selectedCompetitionCategories
      .map(category => String(category?.nombre || '').trim())
      .filter(Boolean)
    const hasUncategorized = selectedParticipants.some(participant => !String(participant?.categoria_competencia || '').trim())
    if (hasUncategorized) names.push('Sin categoria')
    return Array.from(new Set(names))
  }, [selectedCompetitionCategories, selectedParticipants])
  const filteredSelectedParticipants = useMemo(() => {
    return selectedParticipants.filter((participant) => {
      if (!enrollmentCategoryFilter) return true
      const categoryName = String(participant?.categoria_competencia || '').trim() || 'Sin categoria'
      return categoryName === enrollmentCategoryFilter
    })
  }, [selectedParticipants, enrollmentCategoryFilter])
  const groupedSelectedParticipants = useMemo(() => {
    const groups = {}
    filteredSelectedParticipants.forEach((participant) => {
      const categoryName = String(participant?.categoria_competencia || '').trim() || 'Sin categoria'
      if (!groups[categoryName]) groups[categoryName] = []
      groups[categoryName].push(participant)
    })
    return orderCategories(groups).map((categoryName) => ({
      categoryName,
      participants: groups[categoryName] || [],
    }))
  }, [filteredSelectedParticipants])
  const enrollmentSummary = useMemo(() => {
    const total = selectedParticipants.length
    const categoriesCount = new Set(
      selectedParticipants.map(participant => String(participant?.categoria_competencia || '').trim() || 'Sin categoria')
    ).size
    return {
      total,
      categoriesCount,
      filteredTotal: filteredSelectedParticipants.length,
    }
  }, [selectedParticipants, filteredSelectedParticipants])
  const enrollmentEmptyMessage = selectedParticipants.length
    ? (enrollmentCategoryFilter ? 'No hay inscritos en esta categoria' : 'No hay inscritos')
    : 'No hay inscritos'

  useEffect(() => {
    if (!enrollmentListMenuOpen || typeof document === 'undefined') return undefined
    const handlePointerDown = (event) => {
      if (!enrollmentListMenuRef.current?.contains(event.target)) {
        setEnrollmentListMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [enrollmentListMenuOpen])

  useEffect(() => {
    setEnrollmentListMenuOpen(false)
    setEnrollmentListGroupByCategory(false)
    setEnrollmentCategoryFilter('')
    setEnrollmentExpandedGroups({})
  }, [selectedCompetition?.id])

  useEffect(() => {
    if (!enrollmentListGroupByCategory) return
    setEnrollmentExpandedGroups((prev) => {
      const next = {}
      groupedSelectedParticipants.forEach((group) => {
        next[group.categoryName] = prev[group.categoryName] ?? true
      })
      return next
    })
    if (!groupedSelectedParticipants.length) {
      setEnrollmentExpandedGroups({})
    }
  }, [enrollmentListGroupByCategory, groupedSelectedParticipants])

  const load = () => api.get(isOrganizer ? '/competitions?scope=owned' : '/competitions').then(r => {
    setCompetitions(r.data)
    r.data.forEach(c => {
      syncCompetitionParticipants(c.id).catch(() => {})
      syncCompetitionMeta(c.id).catch(() => {})
    })
  })
  useEffect(() => { load() }, [isOrganizer])
  useEffect(() => {
    let active = true
    const refresh = () => {
      if (!active || typeof document === 'undefined' && typeof window === 'undefined') return
      if (typeof document !== 'undefined' && document.hidden) return
      load().catch(() => {})
      if (selectedCompetition?.id) {
        refreshSelectedParticipants().catch(() => {})
      }
    }
    const intervalId = setInterval(refresh, 10000)
    const handleFocus = () => refresh()
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) refresh()
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      active = false
      clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [selectedCompetition?.id])

  const deleteCompetition = async (comp) => {
    if (!comp?.id) return
    setDeleteCompetitionBusy(true)
    try {
      await api.delete(`/competitions/${comp.id}`)
      setMsg({ type: 'success', text: 'Competencia eliminada' })
      if (selectedCompetition?.id === comp.id) {
        setSelectedCompetition(null)
      }
      setDeleteCompetitionTarget(null)
      setDeleteCompetitionConfirmText('')
      load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo eliminar' })
    } finally {
      setDeleteCompetitionBusy(false)
    }
  }

  const openCompetition = async (comp) => {
    setSelectedCompetition(comp)
    setSelectedTab('setup')
    setCompetitionTab('schedule')
    try {
      const [items] = await Promise.all([
        syncCompetitionParticipants(comp.id),
        refreshSelectedCompetitionMeta(comp.id),
      ])
      setSelectedParticipants(items)
    } catch {
      setSelectedParticipants([])
      setSelectedCategoryCount(0)
      setSelectedPhaseCount(0)
    }
  }

  const refreshSelectedParticipants = async () => {
    if (!selectedCompetition) return
    try {
      const items = await syncCompetitionParticipants(selectedCompetition.id)
      setSelectedParticipants(items)
    } catch {
      setSelectedParticipants([])
    }
  }

  const deleteEnrollmentFromDetail = async () => {
    if (!selectedCompetition?.id || !deleteEnrollmentTarget) return
    const participantId = deleteEnrollmentTarget.user_id ?? deleteEnrollmentTarget.id
    if (!participantId) return
    setDeleteEnrollmentBusy(true)
    try {
      await api.delete(`/competitions/${selectedCompetition.id}/users/${participantId}`)
      const items = await syncCompetitionParticipants(selectedCompetition.id)
      setSelectedParticipants(items)
      setParticipantDetail(null)
      setDeleteEnrollmentTarget(null)
      setMsg({ type: 'success', text: 'Inscripcion eliminada' })
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo eliminar la inscripcion' })
    } finally {
      setDeleteEnrollmentBusy(false)
    }
  }

  useEffect(() => {
    if (selectedCompetition?.id) {
      refreshSelectedParticipants()
      refreshSelectedCompetitionMeta(selectedCompetition.id)
    }
  }, [selectedCompetition?.id])
  useEffect(() => {
    if (!selectedCompetition?.id) {
      setSelectedCategoryCount(0)
      setSelectedPhaseCount(0)
      return undefined
    }
    const id = setInterval(() => {
      refreshSelectedParticipants()
    }, 15000)
    return () => clearInterval(id)
  }, [selectedCompetition?.id])
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!selectedCompetition?.id) return
    const fresh = competitions.find(item => item.id === selectedCompetition.id)
    if (fresh) {
      setSelectedCompetition(prev => ({ ...prev, ...fresh }))
    }
  }, [competitions, selectedCompetition?.id])
  useEffect(() => {
    if (selectedCompetition && !selectedCompetition.team_enabled && competitionTab === 'teams') {
      setCompetitionTab('schedule')
    }
  }, [selectedCompetition, competitionTab])

  const competitionCardStyle = {
    padding: 16,
    display: 'grid',
    gap: 12,
    borderRadius: 18,
    border: '1px solid #252A33',
    background: 'linear-gradient(135deg, rgba(214,217,224,0.10), rgba(23,27,33,0.96) 42%, rgba(94,234,212,0.06) 100%)',
    boxShadow: '0 18px 40px rgba(0,0,0,0.22)',
  }
  const statCardStyle = {
    border: '1px solid #252A33',
    borderRadius: 12,
    padding: '10px 12px',
    background: 'rgba(13,15,18,0.72)',
  }
  const workspaceHeroCardStyle = {
    border: '1px solid #252A33',
    borderRadius: 22,
    padding: isMobile ? 16 : 20,
    background: 'linear-gradient(135deg, rgba(214,217,224,0.14), rgba(23,27,33,0.96) 40%, rgba(94,234,212,0.08) 100%)',
    boxShadow: '0 22px 50px rgba(0,0,0,0.24)',
    marginBottom: 14,
  }
  const workspaceTopSectionStyle = {
    display: 'grid',
    gap: 14,
    marginBottom: 14,
  }
  const mobileScrollTabsStyle = isMobile
    ? {
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        overflowY: 'hidden',
        flexWrap: 'nowrap',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        paddingBottom: 4,
      }
    : {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        alignItems: 'flex-start',
      }
  const mobileSubSectionTabsStyle = isMobile
    ? {
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        overflowY: 'hidden',
        flexWrap: 'nowrap',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        paddingBottom: 4,
      }
    : {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
      }
  const sectionTabStyle = (active) => ({
    border: `1px solid ${active ? 'rgba(214,217,224,0.45)' : '#252A33'}`,
    background: active ? 'linear-gradient(135deg, rgba(214,217,224,0.18), rgba(241,244,248,0.05))' : 'rgba(13,15,18,0.7)',
    color: active ? '#F5F7FA' : '#AAB2C0',
    borderRadius: 14,
    padding: isMobile ? '10px 12px' : '12px 14px',
    display: 'grid',
    gap: 4,
    minWidth: isMobile ? 'max-content' : 0,
    textAlign: 'left',
  })
  const subSectionBtnStyle = (active) => ({
    border: `1px solid ${active ? 'rgba(94,234,212,0.45)' : '#252A33'}`,
    background: active ? 'rgba(94,234,212,0.12)' : 'rgba(13,15,18,0.72)',
    color: active ? '#F5F7FA' : '#AAB2C0',
    borderRadius: 12,
    padding: '9px 12px',
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  })
  const workspaceStatTileStyle = {
    border: '1px solid #252A33',
    borderRadius: 16,
    padding: '14px 16px',
    background: 'rgba(13,15,18,0.72)',
    display: 'grid',
    gap: 4,
  }
  const setupInfoCardStyle = {
    border: '1px solid #252A33',
    borderRadius: 16,
    padding: isMobile ? 14 : 16,
    background: 'rgba(13,15,18,0.72)',
    display: 'grid',
    gap: 10,
  }
  const prepSubSections = [
    { id: 'schedule', label: 'Cronograma' },
    { id: 'judge_cards', label: 'Tarjetas' },
    ...(selectedCompetition?.team_enabled ? [{ id: 'teams', label: 'Equipos' }] : []),
  ]
  const enrollmentsSubSections = [
    { id: 'enrollment_list', label: 'Inscripciones' },
    { id: 'checkin_ops', label: 'Check-in' },
  ]
  const liveSubSections = [
    { id: 'results', label: 'Resultados' },
    { id: 'timer', label: 'Cronometro' },
    { id: 'judges', label: 'Jueces' },
  ]
  const currentEnrollCount = selectedCompetition ? (enrollCounts[selectedCompetition.id] || 0) : 0
  const workspaceSections = COMPETITION_WORKSPACE_SECTIONS
  const launchChecklist = [
    { label: 'Base', done: !!selectedCompetition?.nombre?.trim() },
    { label: 'Registro', done: !!selectedCompetition?.enrollment_start && !!selectedCompetition?.enrollment_end },
    { label: 'Divisiones', done: selectedCategoryCount > 0 },
    { label: 'Eventos', done: selectedPhaseCount > 0 },
  ]
  const launchCompletedCount = launchChecklist.filter(item => item.done).length
  const launchProgress = Math.round((launchCompletedCount / launchChecklist.length) * 100)
  const launchMissing = launchChecklist.filter(item => !item.done).map(item => item.label)
  const getCompetitionReadiness = (competition) => {
    const meta = competitionMeta[competition.id] || {}
    const checklist = [
      { label: 'Base', done: !!competition?.nombre?.trim() },
      { label: 'Registro', done: !!competition?.enrollment_start && !!competition?.enrollment_end },
      { label: 'Divisiones', done: (meta.categories || 0) > 0 },
      { label: 'Eventos', done: (meta.phases || 0) > 0 },
    ]
    const completedCount = checklist.filter(item => item.done).length

    return {
      progress: Math.round((completedCount / checklist.length) * 100),
      missing: checklist.filter(item => !item.done).map(item => item.label),
    }
  }

  return (
    <div>
      {previewImage && <ImagePreviewModal item={previewImage} onClose={() => setPreviewImage(null)} />}
      {participantDetail && (
        <Modal title={participantDetailName || 'Participante'} onClose={() => setParticipantDetail(null)} width={760}>
          <div style={{ display: 'grid', gap: 14, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <div style={setupInfoCardStyle}>
                <div style={{ color: '#AAB2C0', fontSize: 12 }}>Cedula</div>
                <div style={{ color: '#F5F7FA', fontWeight: 700 }}>{formatCedula(participantDetail.cedula)}</div>
              </div>
              <div style={setupInfoCardStyle}>
                <div style={{ color: '#AAB2C0', fontSize: 12 }}>Categoria</div>
                <div style={{ color: '#F5F7FA', fontWeight: 700 }}>{participantDetail.categoria_competencia || '-'}</div>
              </div>
              <div style={setupInfoCardStyle}>
                <div style={{ color: '#AAB2C0', fontSize: 12 }}>Email</div>
                <div style={{ color: '#F5F7FA', fontWeight: 700 }}>{participantDetail.email || '-'}</div>
              </div>
              <div style={setupInfoCardStyle}>
                <div style={{ color: '#AAB2C0', fontSize: 12 }}>Celular</div>
                <div style={{ color: '#F5F7FA', fontWeight: 700 }}>{participantDetail.celular || '-'}</div>
              </div>
              <div style={setupInfoCardStyle}>
                <div style={{ color: '#AAB2C0', fontSize: 12 }}>Genero</div>
                <div style={{ color: '#F5F7FA', fontWeight: 700 }}>{participantDetail.genero || participantDetail.sexo || '-'}</div>
              </div>
              <div style={setupInfoCardStyle}>
                <div style={{ color: '#AAB2C0', fontSize: 12 }}>Box</div>
                <div style={{ color: '#F5F7FA', fontWeight: 700 }}>{participantDetail.box || '-'}</div>
              </div>
              <div style={{ ...setupInfoCardStyle, gridColumn: isMobile ? 'auto' : '1 / -1' }}>
                <div style={{ color: '#AAB2C0', fontSize: 12 }}>Ciudad / Pais</div>
                <div style={{ color: '#F5F7FA', fontWeight: 700 }}>{participantDetail.ciudad_pais || '-'}</div>
              </div>
              <div style={{ ...setupInfoCardStyle, gridColumn: isMobile ? 'auto' : '1 / -1' }}>
                <div style={{ color: '#AAB2C0', fontSize: 12 }}>Estado</div>
                <div style={{ color: '#F5F7FA', fontWeight: 700 }}>{participantDetail.estado || '-'}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ color: '#F5F7FA', fontSize: 14, fontWeight: 800 }}>Preguntas del registro</div>
              <EnrollmentAnswersBlock raw={participantDetail.enrollment_answers} onPreviewImage={setPreviewImage} />
            </div>
            <div style={{ border: '1px solid rgba(239,68,68,0.28)', borderRadius: 16, background: 'rgba(239,68,68,0.08)', padding: 16, display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ color: '#FCA5A5', fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5 }}>Zona de riesgo</div>
                <div style={{ color: '#AAB2C0', fontSize: 13, lineHeight: 1.5 }}>
                  Elimina esta inscripcion de la competencia. Esta accion no se puede deshacer.
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-danger btn-sm"
                  onClick={() => setDeleteEnrollmentTarget(participantDetail)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Trash2 size={14} />
                  Eliminar inscrito
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {deleteEnrollmentTarget && (
        <Modal
          title="Confirmar eliminacion"
          onClose={() => {
            if (!deleteEnrollmentBusy) setDeleteEnrollmentTarget(null)
          }}
          width={520}
        >
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ border: '1px solid rgba(239,68,68,0.28)', borderRadius: 16, background: 'rgba(239,68,68,0.08)', padding: 16, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Trash2 size={18} color="#EF4444" />
                </div>
                <div>
                  <div style={{ color: '#F5F7FA', fontSize: 15, fontWeight: 900 }}>Eliminar inscrito</div>
                  <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 2 }}>
                    {deleteEnrollmentTarget.nombre} {deleteEnrollmentTarget.apellido}
                  </div>
                </div>
              </div>
              <div style={{ color: '#FCA5A5', fontSize: 13, lineHeight: 1.55 }}>
                Esta accion retirara al atleta de la competencia y de la lista de inscritos. No se puede deshacer desde esta pantalla.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setDeleteEnrollmentTarget(null)}
                disabled={deleteEnrollmentBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-danger btn-sm"
                onClick={deleteEnrollmentFromDetail}
                disabled={deleteEnrollmentBusy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Trash2 size={14} />
                {deleteEnrollmentBusy ? 'Eliminando...' : 'Eliminar inscrito'}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {!selectedCompetition && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 16 }}>
            <button className="btn-primary" onClick={() => setEditor({ mode: 'create', competition: null })}>
              + Nueva competencia
            </button>
          </div>
          {msg && <div className={`alert alert-${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
            {competitions.map(c => {
              const readiness = getCompetitionReadiness(c)
              const readinessLabel = c.activa
                ? 'Publicada'
                : readiness.progress === 100
                  ? 'Lista para publicar'
                  : readiness.missing.join(', ')
              return (
              <div key={c.id} className="card" style={competitionCardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--oa-text)' }}>{c.nombre}</div>
                    <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{c.descripcion || 'Sin descripcion'}</div>
                  </div>
                  <span
                    className="badge"
                    style={c.activa
                      ? { background: 'rgba(214,217,224,0.14)', color: '#ff9a3d', border: '1px solid rgba(214,217,224,0.35)' }
                      : { background: 'rgba(170,178,192,0.12)', color: 'var(--oa-text-secondary)', border: '1px solid rgba(170,178,192,0.25)' }}
                  >
                    {c.activa ? 'Activa' : 'Inactiva'}
                  </span>
                </div>

                <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={statCardStyle}>
                    <div style={{ color: '#5EEAD4', fontSize: 11, marginBottom: 4, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>Inscritos</div>
                    <div style={{ fontWeight: 700, color: 'var(--oa-text)' }}>{enrollCounts[c.id] || 0}</div>
                  </div>
                  <div style={statCardStyle}>
                    <div style={{ color: readiness.progress === 100 ? '#5EEAD4' : '#D6D9E0', fontSize: 11, marginBottom: 4, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      {readiness.progress === 100 ? 'Estado' : 'Falta'}
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--oa-text)' }}>{readinessLabel}</div>
                    {readiness.progress < 100 && (
                      <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, marginTop: 4 }}>{readiness.progress}% completo</div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn-primary btn-sm" onClick={() => openCompetition(c)}>Abrir competencia</button>
                  {isAdmin ? (
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => setDeleteCompetitionTarget(c)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Trash2 size={14} />
                      Eliminar
                    </button>
                  ) : null}
                </div>
              </div>
            )})}
            {!competitions.length && (
              <div className="card" style={{ color: '#647063', textAlign: 'center', padding: 24 }}>
                No hay competencias
              </div>
            )}
          </div>
        </>
      )}

      {selectedCompetition && (
        <div>
          <div style={workspaceTopSectionStyle}>
            <div style={{ ...workspaceHeroCardStyle, padding: isMobile ? 14 : 16, display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: isMobile ? 'flex-start' : 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn-secondary btn-sm" onClick={() => setSelectedCompetition(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <ArrowLeft size={14} />
                      Volver
                    </button>
                    <span
                      className="badge"
                      style={selectedCompetition.activa
                        ? { background: 'rgba(214,217,224,0.14)', color: '#ff9a3d', border: '1px solid rgba(214,217,224,0.35)' }
                        : { background: 'rgba(170,178,192,0.12)', color: 'var(--oa-text-secondary)', border: '1px solid rgba(170,178,192,0.25)' }}
                    >
                      {selectedCompetition.activa ? 'Publicada' : 'Borrador'}
                    </span>
                    <span style={{ color: '#AAB2C0', fontSize: 12 }}>
                      {currentEnrollCount} inscritos
                    </span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: isMobile ? 22 : 24, color: 'var(--oa-text)' }}>{selectedCompetition.nombre}</div>
                </div>
                {isAdmin ? (
                  <button
                    type="button"
                    className="btn-danger btn-sm"
                    onClick={() => setDeleteCompetitionTarget(selectedCompetition)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Trash2 size={14} />
                    Eliminar competencia
                  </button>
                ) : null}
              </div>

              <div style={mobileScrollTabsStyle}>
                {workspaceSections.map(section => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => {
                      setSelectedTab(section.id)
                      if (section.id === 'enrollments' && !['enrollment_list', 'checkin_ops'].includes(competitionTab)) setCompetitionTab('enrollment_list')
                      if (section.id === 'prep' && !['schedule', 'judge_cards', 'teams'].includes(competitionTab)) setCompetitionTab('schedule')
                      if (section.id === 'live' && !['results', 'timer'].includes(competitionTab)) setCompetitionTab('results')
                    }}
                    style={{ ...sectionTabStyle(selectedTab === section.id), padding: '10px 12px', flex: isMobile ? '0 0 auto' : undefined }}
                  >
                    <span style={{ color: selectedTab === section.id ? '#F5F7FA' : '#D7DEE8', fontSize: 13, fontWeight: 800 }}>{section.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {selectedTab === 'setup' && (
            <div className="card">
              <CompetitionEditorModal
                mode="edit"
                competition={selectedCompetition}
                inline
                onClose={() => {}}
                onSaved={() => {
                  setSuccessToast('Datos guardados correctamente')
                  setTimeout(() => {
                    load()
                    refreshSelectedCompetitionMeta(selectedCompetition.id).catch(() => {})
                    api.get(`/competitions/${selectedCompetition.id}`).then(res => setSelectedCompetition(res.data)).catch(() => {})
                  }, 300)
                }}
              />
            </div>
          )}

          {selectedTab === 'launch' && (
            <div className="card" style={{ display: 'grid', gap: 20 }}>

              {/* Estado general */}
              {launchProgress === 100 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(0,194,168,0.08)', border: '1px solid rgba(0,194,168,0.22)', borderRadius: 14, padding: '14px 18px' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,194,168,0.15)', border: '2px solid #00C2A8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00C2A8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#8FF3E7' }}>¡Todo listo! Has completado todos los pasos previos.</div>
                    <div style={{ fontSize: 12, color: '#AAB2C0', marginTop: 2 }}>La competencia está lista para publicar cuando quieras.</div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: 15 }}>Progreso de configuración</h4>
                    <span style={{ color: '#FFB36F', fontWeight: 800, fontSize: 16 }}>{launchProgress}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${launchProgress}%`, height: '100%', background: 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)', transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {launchChecklist.map(item => (
                      <span key={item.label} style={{ ...SHARED_MODE_CHIP_BASE_STYLE, background: item.done ? 'rgba(0,194,168,0.12)' : 'rgba(255,107,0,0.12)', color: item.done ? '#8FF3E7' : '#FFB36F', border: `1px solid ${item.done ? 'rgba(0,194,168,0.24)' : 'rgba(255,107,0,0.24)'}` }}>
                        {item.done ? '✓' : '○'} {item.label}
                      </span>
                    ))}
                  </div>
                  <div style={{ color: '#FFB36F', fontSize: 13 }}>
                    Falta completar: {launchMissing.join(', ')}
                  </div>
                </div>
              )}

              {/* Acciones */}
              <div style={{ display: 'grid', gap: 12 }}>

                {/* Vista previa */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#D7DEE8' }}>Vista previa</div>
                    <div style={{ fontSize: 12, color: '#AAB2C0', marginTop: 2 }}>Revisa textos, imágenes y estados antes de publicar.</div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    style={{ flexShrink: 0, ...(isMobile ? { width: '100%' } : {}) }}
                    onClick={() => {
                      if (!selectedCompetition?.id || typeof window === 'undefined') return
                      if (isMobile) {
                        window.location.href = `/competitions/${selectedCompetition.id}`
                      } else {
                        window.open(`/competitions/${selectedCompetition.id}`, '_blank', 'noopener,noreferrer')
                      }
                    }}
                  >
                    Abrir vista previa
                  </button>
                </div>

                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

                {/* Publicar / Despublicar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#D7DEE8' }}>
                      {selectedCompetition.activa ? 'Despublicar competencia' : 'Publicar competencia'}
                    </div>
                    <div style={{ fontSize: 12, color: '#AAB2C0', marginTop: 2 }}>
                      {selectedCompetition.activa
                        ? 'La competencia será retirada del listado público y las inscripciones se cerrarán.'
                        : 'La competencia será visible para todos los usuarios de la plataforma.'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={selectedCompetition.activa ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}
                    style={{ flexShrink: 0, ...(isMobile ? { width: '100%' } : {}), ...(launchProgress < 100 && !selectedCompetition.activa ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                    disabled={launchProgress < 100 && !selectedCompetition.activa}
                    title={launchProgress < 100 && !selectedCompetition.activa ? `Completa antes: ${launchMissing.join(', ')}` : undefined}
                    onClick={() => setShowConfirmPublish(true)}
                  >
                    {selectedCompetition.activa ? 'Despublicar' : 'Publicar competencia'}
                  </button>
                </div>

                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

                {/* Inscripciones gratuitas (solo admin) */}
                {isAdmin ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#D7DEE8' }}>Inscripciones gratuitas (Admin)</div>
                      <div style={{ fontSize: 12, color: '#AAB2C0', marginTop: 2 }}>
                        {selectedCompetition?.allow_free_categories
                          ? 'Habilitado. Esta competencia puede tener categorias con precio $0.'
                          : 'Deshabilitado. Las categorias con precio $0 bloquearan la publicacion.'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={selectedCompetition?.allow_free_categories ? 'btn-danger btn-sm' : 'btn-primary btn-sm'}
                      onClick={async () => {
                        const cid = selectedCompetition?.id
                        if (!cid) return
                        const next = selectedCompetition.allow_free_categories ? 0 : 1
                        try {
                          const { data } = await api.put(`/competitions/${cid}`, { allow_free_categories: next })
                          setSelectedCompetition(prev => ({ ...prev, ...data }))
                        } catch (ex) {
                          alert(ex.response?.data?.detail || 'Error al cambiar estado')
                        }
                      }}
                    >
                      {selectedCompetition?.allow_free_categories ? 'Deshabilitar gratuitas' : 'Habilitar gratuitas'}
                    </button>
                  </div>
                ) : null}

                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

                {/* Link para compartir */}
                {selectedCompetition?.slug && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#D7DEE8' }}>Link para compartir</div>
                      <div style={{ fontSize: 12, color: '#AAB2C0', marginTop: 2 }}>Comparte este link en tus redes sociales para que los participantes se inscriban.</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', ...(isMobile ? { width: '100%' } : {}) }}>
                      <input
                        readOnly
                        value={`${window.location.origin}/competitions/${selectedCompetition.slug}`}
                        style={{ flex: 1, background: 'rgba(13,15,18,0.6)', color: '#AAB2C0', cursor: 'default', fontSize: 12, minWidth: 0 }}
                        onFocus={e => e.target.select()}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/competitions/${selectedCompetition.slug}`
                          navigator.clipboard.writeText(url).then(() => {
                            setLinkCopied(true)
                            setTimeout(() => setLinkCopied(false), 2000)
                          }).catch(() => {})
                        }}
                        className="btn-secondary btn-sm"
                        style={{ flexShrink: 0, background: linkCopied ? 'rgba(94,234,212,0.12)' : undefined, color: linkCopied ? '#5EEAD4' : undefined, border: linkCopied ? '1px solid rgba(94,234,212,0.3)' : undefined }}
                      >
                        {linkCopied ? '¡Copiado!' : 'Copiar link'}
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

                {/* Inscripciones */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: selectedCompetition.activa ? '#D7DEE8' : '#666C78' }}>
                      {selectedCompetition.enrollment_open ? 'Cerrar inscripciones' : 'Abrir inscripciones'}
                    </div>
                    <div style={{ fontSize: 12, color: '#AAB2C0', marginTop: 2 }}>
                      {selectedCompetition.activa
                      ? (selectedCompetition.enrollment_open ? 'Los participantes ya no podrán registrarse.' : 'Permite que los participantes se registren.')
                        : 'Debes publicar la competencia primero para habilitar las inscripciones.'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    style={{ flexShrink: 0, ...(isMobile ? { width: '100%' } : {}), ...(!selectedCompetition.activa ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                    disabled={!selectedCompetition.activa}
                    title={!selectedCompetition.activa ? 'Debes publicar la competencia primero para habilitar las inscripciones' : undefined}
                    onClick={async () => {
                      try {
                        const { data } = await api.put(`/competitions/${selectedCompetition.id}`, { enrollment_open: selectedCompetition.enrollment_open ? 0 : 1 })
                        setSelectedCompetition(prev => ({ ...prev, ...data }))
                        load()
                      } catch (err) {
                        setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo actualizar inscripciones' })
                      }
                    }}
                  >
                    {selectedCompetition.enrollment_open ? 'Cerrar inscripciones' : 'Abrir inscripciones'}
                  </button>
                </div>
              </div>

                {/* Modal confirmación publicar */}
              {showConfirmPublish && (() => {
                const hasUnauthorizedFreeCategories = !selectedCompetition.activa
                  && !selectedCompetition.allow_free_categories
                  && selectedCompetitionCategories.some(cat => (cat.enrollment_price ?? 0) === 0)
                return (
                  <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowConfirmPublish(false)}>
                    <div style={{ background: '#0D1117', border: '1px solid #252A33', borderRadius: 18, padding: 28, maxWidth: 420, width: '100%', display: 'grid', gap: 18 }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
                        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,107,0,0.12)', border: `2px solid #FF6B00`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF6B00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            {selectedCompetition.activa
                              ? <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>
                              : <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
                            }
                          </svg>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: '#F5F7FA' }}>
                          {selectedCompetition.activa ? '¿Despublicar competencia?' : '¿Publicar competencia?'}
                        </div>
                        {hasUnauthorizedFreeCategories ? (
                          <div style={{ fontSize: 13, color: '#FFB36F', lineHeight: 1.6, background: 'rgba(255,179,111,0.08)', border: '1px solid rgba(255,179,111,0.25)', borderRadius: 12, padding: '10px 14px' }}>
                            Esta competencia tiene categorias con precio <strong>$0</strong>. Para publicarla, el administrador debe habilitar las inscripciones gratuitas. Por favor contacta al admin.
                          </div>
                        ) : (
                          <div style={{ fontSize: 13, color: '#AAB2C0', lineHeight: 1.6 }}>
                            {selectedCompetition.activa
                              ? 'La competencia dejará de ser visible para el público y las inscripciones se cerrarán automáticamente.'
                              : '¿Estás seguro de que deseas hacer pública esta competencia? Será visible para todos los usuarios de la plataforma.'}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => setShowConfirmPublish(false)}>Cancelar</button>
                        {!hasUnauthorizedFreeCategories && (
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            onClick={async () => {
                              try {
                                const nextActive = selectedCompetition.activa ? 0 : 1
                                const payload = nextActive ? { activa: 1 } : { activa: 0, enrollment_open: 0 }
                                const { data } = await api.put(`/competitions/${selectedCompetition.id}`, payload)
                                setSelectedCompetition(prev => ({ ...prev, ...data }))
                                setShowConfirmPublish(false)
                                load()
                                if (nextActive) setSuccessToast('¡Competencia publicada exitosamente!')
                              } catch (err) {
                                setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo actualizar la competencia' })
                                setShowConfirmPublish(false)
                              }
                            }}
                          >
                            {selectedCompetition.activa ? 'Sí, despublicar' : 'Sí, publicar'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}

            </div>
          )}

          {selectedTab === 'enrollments' && (
            <div style={{ display: 'grid', gap: 14, minWidth: 0, maxWidth: '100%' }}>
              <div className="card" style={{ minWidth: 0, maxWidth: '100%', overflowX: 'hidden' }}>
                <div style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  justifyContent: 'space-between',
                  gap: 10,
                  alignItems: isMobile ? 'stretch' : 'center',
                  flexWrap: 'wrap',
                  marginBottom: 14,
                  minWidth: 0,
                  maxWidth: '100%',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <h4 style={{ margin: 0, fontSize: 16 }}>Inscripciones</h4>
                  </div>
                  <div style={{ ...mobileSubSectionTabsStyle, alignSelf: isMobile ? 'stretch' : undefined }}>
                    {enrollmentsSubSections.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setCompetitionTab(item.id)}
                        style={{ ...subSectionBtnStyle(competitionTab === item.id), flex: isMobile ? '0 0 auto' : undefined }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {competitionTab === 'checkin_ops' ? (
                  <div style={{ display: 'grid', gap: 14 }}>
                    <CheckinQrConfigPanel competition={selectedCompetition} isMobile={isMobile} />
                    <SpectatorTicketingOpsPanel competition={selectedCompetition} />
                    <div style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.58)', padding: 16, display: 'grid', gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#F5F7FA' }}>Resumen de check-in</div>
                      <div style={{ color: '#AAB2C0', fontSize: 13, lineHeight: 1.6 }}>
                        Usa esta vista durante el ingreso. El atleta muestra el QR desde la app y aquí confirmas quién ya registró su entrada.
                      </div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
                        <span style={{ color: '#86EFAC' }}>{selectedParticipants.filter(item => item.check_in_done).length} realizados</span>
                        <span style={{ color: '#AAB2C0' }}>{selectedParticipants.filter(item => !item.check_in_done).length} pendientes</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gap: 12, marginBottom: 12, minWidth: 0, maxWidth: '100%' }}>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) auto',
                        alignItems: isMobile ? 'stretch' : 'center',
                        gap: 10,
                        minWidth: 0,
                        maxWidth: '100%',
                      }}>
                        <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                          <h4 style={{ margin: 0, fontSize: 16 }}>Listado de inscritos</h4>
                          <div style={{ color: '#AAB2C0', fontSize: 12 }}>
                            {enrollmentListGroupByCategory ? 'Vista operativa agrupada por categoria' : 'Vista operativa de inscritos confirmados'}
                          </div>
                        </div>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: isMobile ? 'minmax(0, 1fr) auto' : 'repeat(2, auto)',
                          gap: 8,
                          alignItems: 'center',
                          justifyContent: isMobile ? 'stretch' : 'end',
                          width: isMobile ? '100%' : 'auto',
                          maxWidth: '100%',
                          minWidth: 0,
                        }}>
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => downloadEnrollmentWorkbook(filteredSelectedParticipants, selectedCompetition?.nombre || 'inscripciones')}
                            style={isMobile ? { gridColumn: '1 / -1', width: '100%', minWidth: 0 } : undefined}
                          >
                          Descargar Excel
                        </button>
                          <div
                            ref={enrollmentListMenuRef}
                            style={{
                              position: 'relative',
                              justifySelf: isMobile ? 'end' : undefined,
                              minWidth: 0,
                            }}
                          >
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => setEnrollmentListMenuOpen(prev => !prev)}
                            style={{ width: 36, height: 36, padding: 0, justifyContent: 'center' }}
                            aria-label="Opciones de listado"
                          >
                            <MoreHorizontal size={18} />
                          </button>
                          {enrollmentListMenuOpen && (
                            <div style={{
                              position: 'absolute',
                              top: 'calc(100% + 8px)',
                              right: 0,
                              minWidth: isMobile ? 180 : 220,
                              width: isMobile ? 'min(220px, calc(100vw - 56px))' : undefined,
                              maxWidth: isMobile ? 'calc(100vw - 56px)' : undefined,
                              padding: 8,
                              borderRadius: 12,
                              border: '1px solid #252A33',
                              background: '#171B21',
                              boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
                              zIndex: 4,
                              display: 'grid',
                              gap: 4,
                            }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setEnrollmentListGroupByCategory(prev => !prev)
                                  setEnrollmentListMenuOpen(false)
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 10,
                                  width: '100%',
                                  border: 'none',
                                  background: enrollmentListGroupByCategory ? 'rgba(255,107,0,0.12)' : 'transparent',
                                  color: '#F5F7FA',
                                  borderRadius: 10,
                                  padding: '10px 12px',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                }}
                              >
                                <span style={{ fontSize: 13, fontWeight: 700 }}>Agrupar por categoria</span>
                                {enrollmentListGroupByCategory && <CheckCircle2 size={16} color="#FF6B00" />}
                              </button>
                            </div>
                          )}
                        </div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10, minWidth: 0, maxWidth: '100%' }}>
                        {[
                          { label: 'Inscritos', value: enrollmentSummary.total, tone: '#FFB36F' },
                          { label: 'Categorias', value: enrollmentSummary.categoriesCount, tone: '#8DF1E4' },
                          { label: 'Mostrados', value: enrollmentSummary.filteredTotal, tone: '#FFD0AE' },
                        ].map((item) => (
                          <div key={item.label} style={{
                            border: '1px solid #252A33',
                            borderRadius: 16,
                            padding: '14px 16px',
                            background: 'linear-gradient(180deg, rgba(23,27,33,0.98), rgba(13,15,18,0.94))',
                            display: 'grid',
                            gap: 6,
                            minWidth: 0,
                          }}>
                            <div style={{ color: '#AAB2C0', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{item.label}</div>
                            <div style={{ color: item.tone, fontSize: isMobile ? 22 : 24, fontWeight: 900, lineHeight: 1 }}>{item.value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{
                        border: '1px solid #252A33',
                        borderRadius: 16,
                        padding: isMobile ? 12 : 14,
                        background: 'rgba(13,15,18,0.72)',
                        display: 'grid',
                        gap: 12,
                        minWidth: 0,
                        maxWidth: '100%',
                      }}>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 320px) minmax(0, 1fr)',
                          gap: 12,
                          alignItems: 'end',
                          minWidth: 0,
                        }}>
                          <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                            <span style={{ color: '#AAB2C0', fontSize: 12, fontWeight: 700 }}>Filtrar por categoria</span>
                            <select
                              value={enrollmentCategoryFilter}
                              onChange={(event) => setEnrollmentCategoryFilter(event.target.value)}
                              style={{
                                width: '100%',
                                minHeight: 42,
                                borderRadius: 12,
                                border: '1px solid #252A33',
                                background: '#171B21',
                                color: '#F5F7FA',
                                padding: '0 14px',
                                fontSize: 13,
                                fontWeight: 700,
                                outline: 'none',
                                maxWidth: '100%',
                              }}
                            >
                              <option value="">Todas</option>
                              {enrollmentCategoryOptions.map((categoryName) => (
                                <option key={categoryName} value={categoryName}>
                                  {categoryName}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div style={{
                            display: 'flex',
                            flexDirection: isMobile ? 'column' : 'row',
                            justifyContent: isMobile ? 'flex-start' : 'flex-end',
                            alignItems: isMobile ? 'stretch' : 'center',
                            gap: 10,
                            flexWrap: 'wrap',
                            minHeight: 42,
                            minWidth: 0,
                          }}>
                            <div style={{ color: '#AAB2C0', fontSize: 12, textAlign: isMobile ? 'left' : 'right', overflowWrap: 'anywhere' }}>
                              Mostrando <span style={{ color: '#F5F7FA', fontWeight: 800 }}>{enrollmentSummary.filteredTotal}</span> de <span style={{ color: '#F5F7FA', fontWeight: 800 }}>{enrollmentSummary.total}</span> inscritos
                            </div>
                            {!!enrollmentCategoryFilter && (
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                onClick={() => setEnrollmentCategoryFilter('')}
                                style={isMobile ? { width: '100%' } : undefined}
                              >
                                Ver todas
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {isMobile ? (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {!filteredSelectedParticipants.length && <p style={{ textAlign: 'center', color: '#666', padding: 16 }}>{enrollmentEmptyMessage}</p>}
                        {enrollmentListGroupByCategory ? groupedSelectedParticipants.map((group) => {
                          const isExpanded = enrollmentExpandedGroups[group.categoryName] ?? true
                          return (
                            <div key={group.categoryName} style={{ border: '1px solid #252A33', borderRadius: 16, background: 'rgba(13,15,18,0.72)', overflow: 'hidden' }}>
                              <button
                                type="button"
                                onClick={() => setEnrollmentExpandedGroups(prev => ({ ...prev, [group.categoryName]: !isExpanded }))}
                                style={{
                                  width: '100%',
                                  border: 'none',
                                  background: 'linear-gradient(135deg, rgba(255,107,0,0.16) 0%, rgba(255,154,61,0.08) 100%)',
                                  padding: '12px 14px',
                                  color: '#F5F7FA',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 10,
                                  cursor: 'pointer',
                                }}
                              >
                                <div style={{ display: 'grid', justifyItems: 'start', gap: 2 }}>
                                  <span style={{ fontSize: 13, fontWeight: 800 }}>{group.categoryName}</span>
                                  <span style={{ color: '#AAB2C0', fontSize: 11 }}>{group.participants.length} inscritos</span>
                                </div>
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </button>
                              {isExpanded && (
                                <div style={{ display: 'grid', gap: 8, padding: 10 }}>
                                  {group.participants.map(p => (
                                    <div key={p.id} style={{ border: '1px solid #252A33', borderRadius: 14, padding: '12px 14px', background: '#171B21', display: 'grid', gap: 10 }}>
                                      <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                                        <div style={{ minWidth: 0 }}>
                                          <div style={{ fontWeight: 800, color: '#F5F7FA', fontSize: 15, overflowWrap: 'anywhere' }}>
                                            <AthleteNameLink username={p.username}>{p.nombre} {p.apellido}</AthleteNameLink>
                                          </div>
                                          <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4, overflowWrap: 'anywhere' }}>{p.email || formatCedula(p.cedula)}</div>
                                        </div>
                                        <span style={{
                                          border: '1px solid rgba(0,194,168,0.24)',
                                          background: 'rgba(0,194,168,0.12)',
                                          color: '#8DF1E4',
                                          borderRadius: 999,
                                          padding: '5px 9px',
                                          fontSize: 11,
                                          fontWeight: 800,
                                          maxWidth: '100%',
                                          width: 'fit-content',
                                          whiteSpace: 'normal',
                                          overflowWrap: 'anywhere',
                                        }}>
                                          {p.categoria_competencia || 'Sin categoria'}
                                        </span>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{ color: '#AAB2C0', fontSize: 12 }}>Inscripcion: <span style={{ color: '#F5F7FA', fontWeight: 700 }}>{String(p.estado || '-').trim() || '-'}</span></span>
                                      </div>
                                      <div>
                                        <button className="btn-secondary btn-sm" onClick={() => setParticipantDetail(p)}>Ver participante</button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        }) : filteredSelectedParticipants.map((p) => (
                          <div key={p.id} style={{ border: '1px solid #252A33', borderRadius: 16, padding: '14px', background: 'linear-gradient(180deg, rgba(23,27,33,0.98), rgba(13,15,18,0.92))', display: 'grid', gap: 10 }}>
                            <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 800, color: '#F5F7FA', fontSize: 15, overflowWrap: 'anywhere' }}>
                                  <AthleteNameLink username={p.username}>{p.nombre} {p.apellido}</AthleteNameLink>
                                </div>
                                <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4, overflowWrap: 'anywhere' }}>{p.email || formatCedula(p.cedula)}</div>
                              </div>
                              <span style={{
                                border: '1px solid rgba(0,194,168,0.24)',
                                background: 'rgba(0,194,168,0.12)',
                                color: '#8DF1E4',
                                borderRadius: 999,
                                padding: '5px 9px',
                                fontSize: 11,
                                fontWeight: 800,
                                maxWidth: '100%',
                                width: 'fit-content',
                                whiteSpace: 'normal',
                                overflowWrap: 'anywhere',
                              }}>
                                {p.categoria_competencia || 'Sin categoria'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ color: '#AAB2C0', fontSize: 12 }}>Inscripcion: <span style={{ color: '#F5F7FA', fontWeight: 700 }}>{String(p.estado || '-').trim() || '-'}</span></span>
                            </div>
                            <div>
                              <button className="btn-secondary btn-sm" onClick={() => setParticipantDetail(p)}>Ver participante</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      enrollmentListGroupByCategory ? (
                        <div style={{ display: 'grid', gap: 12 }}>
                          {!groupedSelectedParticipants.length && <div style={{ textAlign: 'center', color: '#666', padding: 24 }}>{enrollmentEmptyMessage}</div>}
                          {groupedSelectedParticipants.map((group) => {
                            const isExpanded = enrollmentExpandedGroups[group.categoryName] ?? true
                            return (
                              <div key={group.categoryName} style={{ border: '1px solid #252A33', borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(180deg, rgba(23,27,33,0.98), rgba(13,15,18,0.92))' }}>
                                <button
                                  type="button"
                                  onClick={() => setEnrollmentExpandedGroups(prev => ({ ...prev, [group.categoryName]: !isExpanded }))}
                                  style={{
                                    width: '100%',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, rgba(255,107,0,0.16) 0%, rgba(255,154,61,0.08) 100%)',
                                    padding: '14px 16px',
                                    color: '#F5F7FA',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <div style={{ display: 'grid', justifyItems: 'start', gap: 2 }}>
                                    <span style={{ fontSize: 14, fontWeight: 900 }}>{group.categoryName}</span>
                                    <span style={{ color: '#AAB2C0', fontSize: 12 }}>{group.participants.length} inscritos</span>
                                  </div>
                                  {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                </button>
                                {isExpanded && (
                                  <div style={{ padding: 10, display: 'grid', gap: 8 }}>
                                    {group.participants.map((p) => (
                                      <div key={p.id} style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'minmax(0, 1.4fr) minmax(140px, 0.8fr) auto',
                                        gap: 12,
                                        alignItems: 'center',
                                        padding: '12px 14px',
                                        borderRadius: 14,
                                        border: '1px solid #252A33',
                                        background: '#171B21',
                                      }}>
                                        <div style={{ minWidth: 0 }}>
                                          <div style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 14 }}>
                                            <AthleteNameLink username={p.username}>{p.nombre} {p.apellido}</AthleteNameLink>
                                          </div>
                                          <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4 }}>{p.email || formatCedula(p.cedula)}</div>
                                        </div>
                                        <div style={{ display: 'grid', gap: 6 }}>
                                          <span style={{ color: '#6B7280', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Inscripcion</span>
                                          <span style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 700 }}>{String(p.estado || '-').trim() || '-'}</span>
                                        </div>
                                        <div style={{ display: 'grid', justifyItems: 'end', gap: 8 }}>
                                          <span style={{ border: '1px solid rgba(0,194,168,0.24)', background: 'rgba(0,194,168,0.12)', color: '#8DF1E4', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 800 }}>
                                            {p.categoria_competencia || 'Sin categoria'}
                                          </span>
                                          <button className="btn-secondary btn-sm" onClick={() => setParticipantDetail(p)}>Ver participante</button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid #252A33', borderRadius: 18, background: 'linear-gradient(180deg, rgba(23,27,33,0.98), rgba(13,15,18,0.92))' }}>
                          <table>
                            <thead>
                              <tr><th>Participante</th><th>Categoria</th><th>Inscripcion</th><th>Accion</th></tr>
                            </thead>
                            <tbody>
                              {filteredSelectedParticipants.map((p) => (
                                <tr key={p.id}>
                                  <td>
                                    <div style={{ color: '#F5F7FA', fontWeight: 800 }}>
                                      <AthleteNameLink username={p.username}>{p.nombre} {p.apellido}</AthleteNameLink>
                                    </div>
                                    <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4 }}>{p.email || formatCedula(p.cedula)}</div>
                                  </td>
                                  <td>
                                    <span style={{ border: '1px solid rgba(0,194,168,0.24)', background: 'rgba(0,194,168,0.12)', color: '#8DF1E4', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 800, display: 'inline-flex' }}>
                                      {p.categoria_competencia || 'Sin categoria'}
                                    </span>
                                  </td>
                                  <td>{String(p.estado || '-').trim() || '-'}</td>
                                  <td>
                                    <button className="btn-secondary btn-sm" onClick={() => setParticipantDetail(p)}>Ver participante</button>
                                  </td>
                                </tr>
                              ))}
                              {!filteredSelectedParticipants.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#666', padding: 16 }}>{enrollmentEmptyMessage}</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {selectedTab === 'ticketing' && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div className="card">
                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                  <h4 style={{ margin: 0, fontSize: 16 }}>Boleteria</h4>
                  <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4 }}>
                    Configura en modal y revisa el estado de ventas por producto.
                  </div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() => setTicketingModalOpen(true)}
                  >
                    Agregar boleteria
                  </button>
                </div>
                <TicketingProductsPanel competition={selectedCompetition} refreshKey={ticketingRefreshKey} />
              </div>
              <div className="card">
                <SpectatorTicketingOpsPanel competition={selectedCompetition} />
              </div>
            </div>
          )}

          {selectedTab === 'discounts' && (
            <div className="card">
              <CompetitionDiscountsPage competition={selectedCompetition} />
            </div>
          )}

          {selectedTab === 'invitations' && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Habilitar invitaciones (Admin)</div>
                  <div style={{ fontSize: 12, color: '#7E8796', marginTop: 3 }}>
                    {selectedCompetition?.invitations_enabled
                      ? 'Las invitaciones estan habilitadas para esta competencia.'
                      : isAdmin
                        ? 'Las invitaciones estan deshabilitadas. Activalas para empezar a invitar competidores.'
                        : 'Las invitaciones estan deshabilitadas. Solo el admin puede activarlas.'}
                  </div>
                </div>
                <button
                  type="button"
                  className={selectedCompetition?.invitations_enabled ? 'btn-danger btn-sm' : 'btn-primary btn-sm'}
                  disabled={!isAdmin}
                  title={!isAdmin ? 'Solo el admin puede cambiar este estado' : undefined}
                  onClick={async () => {
                    const cid = selectedCompetition?.id
                    if (!cid || !isAdmin) return
                    try {
                      if (selectedCompetition.invitations_enabled) {
                        await api.delete(`/competitions/${cid}/invitations/enable`)
                        setSelectedCompetition(prev => ({ ...prev, invitations_enabled: 0 }))
                      } else {
                        await api.post(`/competitions/${cid}/invitations/enable`)
                        setSelectedCompetition(prev => ({ ...prev, invitations_enabled: 1 }))
                      }
                    } catch (ex) {
                      alert(ex.response?.data?.detail || 'Error al cambiar estado')
                    }
                  }}
                >
                  {selectedCompetition?.invitations_enabled ? 'Deshabilitar invitaciones' : 'Habilitar invitaciones'}
                </button>
              </div>
              <div className="card">
                <CompetitorInvitationsPage competition={selectedCompetition} />
              </div>
            </div>
          )}

          {selectedTab === 'prep' && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 16 }}>Preparacion</h4>
                </div>
                  <div style={mobileSubSectionTabsStyle}>
                    {prepSubSections.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setCompetitionTab(item.id)}
                        style={{ ...subSectionBtnStyle(competitionTab === item.id), flex: isMobile ? '0 0 auto' : undefined }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {competitionTab === 'schedule' && <CompetitionSchedulePanel competition={selectedCompetition} />}
              {competitionTab === 'judge_cards' && <CompetitionJudgeCardsPanel competition={selectedCompetition} isMobile={isMobile} />}
              {competitionTab === 'teams' && <CompetitionTeamsPanel competition={selectedCompetition} />}
            </div>
          )}

          {selectedTab === 'live' && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 16 }}>En vivo</h4>
                </div>
                  <div style={mobileSubSectionTabsStyle}>
                    {liveSubSections.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setCompetitionTab(item.id)}
                        style={{ ...subSectionBtnStyle(competitionTab === item.id), flex: isMobile ? '0 0 auto' : undefined }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {competitionTab === 'results' && <CompetitionResultsPanel competition={selectedCompetition} />}
              {competitionTab === 'timer' && <CompetitionTimerPanel competition={selectedCompetition} />}
              {competitionTab === 'judges' && <CompetitionJudgesPanel competition={selectedCompetition} />}
            </div>
          )}

          {selectedTab === 'broadcast' && (
            <CompetitionTvPanel
              competition={selectedCompetition}
              onSaved={(updated) => setSelectedCompetition(updated)}
            />
          )}
        </div>
      )}
      {deleteCompetitionTarget && (() => {
        const expectedName = (deleteCompetitionTarget.nombre || '').trim()
        const nameMatches = deleteCompetitionConfirmText.trim() === expectedName && expectedName.length > 0
        const closeDeleteModal = () => {
          if (deleteCompetitionBusy) return
          setDeleteCompetitionTarget(null)
          setDeleteCompetitionConfirmText('')
        }
        return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.76)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={closeDeleteModal}>
          <div style={{ background: '#171B21', border: '1px solid #252A33', borderRadius: 20, padding: 28, maxWidth: 460, width: '100%', display: 'grid', gap: 18, boxShadow: '0 24px 80px rgba(0,0,0,0.42)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
              <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', border: '2px solid rgba(239,68,68,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={22} color="#EF4444" />
              </div>
              <div style={{ fontWeight: 800, fontSize: 18, color: '#F5F7FA' }}>Eliminar competencia</div>
              <div style={{ fontSize: 14, color: '#AAB2C0', lineHeight: 1.65 }}>
                Vas a eliminar <span style={{ color: '#F5F7FA', fontWeight: 700 }}>"{deleteCompetitionTarget.nombre}"</span>.
                Esta acción no se puede deshacer.
              </div>
            </div>
            <div style={{ borderRadius: 16, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)', padding: '12px 14px', color: '#F5F7FA', fontSize: 13, lineHeight: 1.55 }}>
              Se eliminarán su configuración, inscripciones y contenido asociado en este entorno.
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 12, color: '#AAB2C0' }}>
                Para confirmar, escribe el nombre exacto de la competencia: <span style={{ color: '#F5F7FA', fontWeight: 700 }}>{expectedName}</span>
              </label>
              <input
                type="text"
                value={deleteCompetitionConfirmText}
                onChange={(e) => setDeleteCompetitionConfirmText(e.target.value)}
                disabled={deleteCompetitionBusy}
                autoFocus
                placeholder={expectedName}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #252A33', background: '#0F1217', color: '#F5F7FA', fontSize: 14, outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary btn-sm" onClick={closeDeleteModal} disabled={deleteCompetitionBusy}>Cancelar</button>
              <button
                type="button"
                className="btn-danger btn-sm"
                onClick={() => deleteCompetition(deleteCompetitionTarget)}
                disabled={deleteCompetitionBusy || !nameMatches}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: (!nameMatches && !deleteCompetitionBusy) ? 0.55 : 1 }}
              >
                <Trash2 size={14} />
                {deleteCompetitionBusy ? 'Eliminando...' : 'Eliminar competencia'}
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      {editor && (
        editor.mode === 'create' ? (
          <QuickCompetitionCreateModal
            onClose={() => setEditor(null)}
            onCreated={(createdCompetition) => {
              setEditor(null)
              setMsg({ type: 'success', text: 'Competencia creada' })
              load()
            }}
          />
        ) : (
          <CompetitionEditorModal
            mode={editor.mode}
            competition={editor.competition}
            onClose={() => setEditor(null)}
            onSaved={() => {
              setSuccessToast('Datos guardados correctamente')
              setTimeout(() => {
                load()
                if (selectedCompetition?.id === editor.competition?.id) {
                  api.get(`/competitions/${selectedCompetition.id}`).then(res => setSelectedCompetition(res.data)).catch(() => {})
                }
              }, 300)
            }}
          />
        )
      )}

      {enrollingComp && (
        <EnrollmentModal
          competition={enrollingComp}
          onClose={() => setEnrollingComp(null)}
          onSaved={() => {
            syncCompetitionParticipants(enrollingComp.id).then(items => {
              if (selectedCompetition?.id === enrollingComp.id) {
                setSelectedParticipants(items)
              }
            }).catch(() => {})
          }}
        />
      )}
      {ticketingModalOpen && selectedCompetition ? (
        <TicketingLaunchModal
          competition={selectedCompetition}
          onClose={() => setTicketingModalOpen(false)}
          onSaved={() => {
            load()
            setTicketingRefreshKey(prev => prev + 1)
            refreshSelectedCompetitionMeta(selectedCompetition.id).catch(() => {})
          }}
        />
      ) : null}
      {successToast && <SuccessToast text={successToast} onDone={() => setSuccessToast(null)} />}
    </div>
  )
}

// â”€â”€ Participants Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ParticipantsTab() {
  const [participants, setParticipants] = useState([])
  const [search, setSearch] = useState('')
  const [editingParticipant, setEditingParticipant] = useState(null)
  const [editForm, setEditForm] = useState({ cedula: '', nombre: '', apellido: '', email: '', celular: '', genero: 'M', categoria: 'Rx', box: '', talla_camiseta: '', fecha_nacimiento: '', ciudad_pais: '', city: '', countryCode: '', extra_role: '' })
  const [msg, setMsg] = useState(null)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const [countries, setCountries] = useState([])
  const [editCities, setEditCities] = useState([])
  const countryNameByCode = useMemo(() => Object.fromEntries(countries.map(c => [c.code, c.name])), [countries])
  const countryCodeByName = useMemo(() => Object.fromEntries(countries.map(c => [c.name.toLowerCase(), c.code])), [countries])
  const cityOptionsEdit = useMemo(() => {
    const list = editCities
    const query = (editForm.city || '').trim().toLowerCase()
    if (!query) return list.slice(0, 150)
    return list.filter(city => city.toLowerCase().includes(query)).slice(0, 150)
  }, [editCities, editForm.city])
  const filteredParticipants = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return participants
    return participants.filter((participant) => {
      const haystack = [
        participant.cedula,
        participant.nombre,
        participant.apellido,
        participant.email,
        participant.celular,
        participant.box,
        participant.ciudad_pais,
        participant.genero,
        participant.sexo,
        participant.categoria,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [participants, search])
  const totalUsers = participants.length

  const load = () => api.get('/users/admin').then(r => setParticipants(r.data))
  useEffect(() => {
    load()
  }, [])
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => {
    loadCountries().then(setCountries).catch(() => setCountries([]))
  }, [])
  useEffect(() => {
    if (!editForm.countryCode) {
      setEditCities([])
      return
    }
    loadCitiesByCountry(editForm.countryCode).then(setEditCities).catch(() => setEditCities([]))
  }, [editForm.countryCode])
  useEffect(() => {
    if (!countries.length || !editForm.ciudad_pais || editForm.countryCode) return
    const parsed = parseCityCountry(editForm.ciudad_pais)
    if (!parsed.countryName) return
    const countryCode = countryCodeByName[parsed.countryName.toLowerCase()] || ''
    if (countryCode) setEditForm(prev => ({ ...prev, countryCode }))
  }, [countries, countryCodeByName, editForm.ciudad_pais, editForm.countryCode])

  const startEdit = (p) => {
    const parsed = parseCityCountry(p.ciudad_pais || '')
    setEditingParticipant(p)
    setEditForm({
      cedula: cedulaInputValue(p.cedula),
      nombre: p.nombre || '',
      apellido: p.apellido || '',
      email: p.email || '',
      celular: p.celular || '',
      genero: p.genero || p.sexo || 'M',
      categoria: p.categoria || 'Rx',
      box: p.box || '',
      talla_camiseta: p.talla_camiseta || '',
      fecha_nacimiento: p.fecha_nacimiento || '',
      ciudad_pais: p.ciudad_pais || '',
      city: parsed.city,
      countryCode: '',
      extra_role: p.extra_role || '',
    })
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if (!editingParticipant) return
    try {
      const city = (editForm.city || '').trim()
      const countryCode = (editForm.countryCode || '').trim()
      const countryName = countryNameByCode[countryCode] || ''
      if ((city || countryCode) && !(city && countryCode)) {
        setMsg({ type: 'error', text: 'Selecciona pais y ciudad validos' })
        return
      }
      if (city && countryCode && !editCities.some(candidate => candidate.toLowerCase() === city.toLowerCase())) {
        setMsg({ type: 'error', text: 'La ciudad no pertenece al pais seleccionado' })
        return
      }
      const payload = {
        ...editForm,
        ciudad_pais: city && countryName ? buildCityCountry(city, countryName) : '',
      }
      const extraRole = payload.extra_role || 'user'
      delete payload.city
      delete payload.countryCode
      delete payload.extra_role
      await api.put(`/users/${editingParticipant.id}`, payload)
      await api.put(`/users/${editingParticipant.id}/role`, { extra_role: extraRole })
      setMsg({ type: 'success', text: 'Usuario actualizado' })
      setEditingParticipant(null)
      load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo actualizar' })
    }
  }

  const removeParticipant = async (p) => {
    if (!confirm(`Eliminar usuario "${p.nombre} ${p.apellido}"?`)) return
    try {
      await api.delete(`/users/${p.id}`)
      setMsg({ type: 'success', text: 'Usuario eliminado' })
      load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo eliminar' })
    }
  }

  const roleBadge = (extraRole) => {
    const value = String(extraRole || '').trim().toLowerCase()
    const map = {
      admin: { label: 'Admin', bg: 'rgba(214,217,224,0.14)', border: 'rgba(214,217,224,0.32)', color: '#FFB36F' },
      organizer: { label: 'Organizador', bg: 'rgba(94,234,212,0.12)', border: 'rgba(94,234,212,0.28)', color: '#8DF1E4' },
      judge: { label: 'Juez', bg: 'rgba(212,165,55,0.14)', border: 'rgba(212,165,55,0.28)', color: '#E9CB78' },
    }
    const item = map[value] || { label: 'Atleta', bg: 'rgba(255,255,255,0.04)', border: '#252A33', color: '#F5F7FA' }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 10px', borderRadius: 999, border: `1px solid ${item.border}`, background: item.bg, color: item.color, fontSize: 12, fontWeight: 700 }}>
        {item.label}
      </span>
    )
  }

  const categoryBadge = (cat) => {
    const map = { Rx: 'badge-rx', Scaled: 'badge-scaled', Masters: 'badge-masters' }
    return <span className={`badge ${map[cat] || 'badge-default'}`}>{cat || '-'}</span>
  }

  return (
    <div>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ color: '#AAB2C0', fontSize: 12, marginBottom: 4 }}>Usuarios base</div>
            <div style={{ color: '#F5F7FA', fontSize: 24, fontWeight: 800 }}>{totalUsers}</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ color: '#AAB2C0', fontSize: 12, marginBottom: 4 }}>Con email</div>
            <div style={{ color: '#F5F7FA', fontSize: 24, fontWeight: 800 }}>{participants.filter((participant) => !!participant.email).length}</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ color: '#AAB2C0', fontSize: 12, marginBottom: 4 }}>Con celular</div>
            <div style={{ color: '#F5F7FA', fontSize: 24, fontWeight: 800 }}>{participants.filter((participant) => !!participant.celular).length}</div>
          </div>
        </div>

        <div className="card" style={{ padding: isMobile ? 12 : 14 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <div style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 800 }}>Usuarios</div>
              <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>
                Todos son atletas. Desde aqui gestionas perfil y datos base.
              </div>
            </div>
            <input
              placeholder="Buscar por nombre, cedula, email, celular, box o ciudad"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </div>

      {isMobile ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {filteredParticipants.map((p, i) => (
            <div key={p.id} className="card" style={{ padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#F5F7FA' }}>{i + 1}. {p.nombre} {p.apellido}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#AAB2C0', marginTop: 2 }}>{formatCedula(p.cedula)}</div>
                </div>
              </div>
              <div style={{ color: '#AAB2C0', fontSize: 13 }}>
                <b style={{ color: '#F5F7FA' }}>Ciudad / Pais:</b> {p.ciudad_pais || '-'}
              </div>
              <div>{roleBadge(p.extra_role)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                <button className="btn-secondary btn-sm" onClick={() => startEdit(p)} title="Editar usuario" style={{ minHeight: 38 }}>
                  Editar usuario
                </button>
                <button className="btn-danger btn-sm" onClick={() => removeParticipant(p)} title="Eliminar usuario" style={{ minWidth: 42, minHeight: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {!filteredParticipants.length && <div className="card" style={{ color: '#AAB2C0', textAlign: 'center', padding: 24 }}>No hay usuarios</div>}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table>
          <thead>
            <tr><th>#</th><th>Cedula</th><th>Nombre</th><th>Ciudad / Pais</th><th>Rol</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {filteredParticipants.map((p, i) => (
              <tr key={p.id}>
                <td style={{ color: '#647063' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{formatCedula(p.cedula)}</td>
                <td>{p.nombre} {p.apellido}</td>
                <td>{p.ciudad_pais || '-'}</td>
                <td>{roleBadge(p.extra_role)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-secondary btn-sm" onClick={() => startEdit(p)} title="Editar usuario" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={14} /></button>
                    <button className="btn-danger btn-sm" onClick={() => removeParticipant(p)} title="Eliminar usuario" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!filteredParticipants.length && <tr><td colSpan={6} style={{ color: '#647063', textAlign: 'center', padding: 24 }}>No hay usuarios</td></tr>}
          </tbody>
        </table>
        </div>
      )}

      {editingParticipant && (
        <Modal title={`Editar usuario - ${editingParticipant.nombre} ${editingParticipant.apellido}`} onClose={() => setEditingParticipant(null)} width={760}>
          <form onSubmit={saveEdit}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 12 }}>
              <div className="form-group"><label>Cedula *</label><input value={editForm.cedula} onChange={e => setEditForm({ ...editForm, cedula: e.target.value })} required /></div>
              <div className="form-group"><label>Nombre *</label><input value={editForm.nombre} onChange={e => setEditForm({ ...editForm, nombre: e.target.value })} required /></div>
              <div className="form-group"><label>Apellido *</label><input value={editForm.apellido} onChange={e => setEditForm({ ...editForm, apellido: e.target.value })} required /></div>
              <div className="form-group"><label>Email</label><input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} /></div>
              <div className="form-group"><label>Celular</label><input value={editForm.celular} onChange={e => setEditForm({ ...editForm, celular: e.target.value })} /></div>
              <div className="form-group"><label>Genero</label>
                <select value={editForm.genero} onChange={e => setEditForm({ ...editForm, genero: e.target.value })}>
                  {GENEROS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Box</label><input value={editForm.box} onChange={e => setEditForm({ ...editForm, box: e.target.value })} /></div>
              <div className="form-group"><label>Talla camiseta</label>
                <select value={editForm.talla_camiseta} onChange={e => setEditForm({ ...editForm, talla_camiseta: e.target.value })}>
                  <option value="">-</option>
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                </select>
              </div>
              <div className="form-group"><label>Fecha nacimiento</label><input type="date" value={editForm.fecha_nacimiento} onChange={e => setEditForm({ ...editForm, fecha_nacimiento: e.target.value })} /></div>
              <div className="form-group" style={{ gridColumn: isMobile ? 'span 2' : 'span 3' }}>
                <label>Ciudad / Pais</label>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                  <select value={editForm.countryCode} onChange={e => setEditForm({ ...editForm, countryCode: e.target.value, city: '' })}>
                    <option value="">Selecciona pais</option>
                    {countries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}
                  </select>
                  <div>
                    <input
                      list="admin-edit-city-options"
                      value={editForm.city}
                      onChange={e => setEditForm({ ...editForm, city: e.target.value })}
                      placeholder={editForm.countryCode ? 'Escribe o selecciona ciudad' : 'Primero selecciona un pais'}
                      disabled={!editForm.countryCode}
                    />
                    <datalist id="admin-edit-city-options">
                      {cityOptionsEdit.map(city => <option key={city} value={city} />)}
                    </datalist>
                  </div>
                </div>
              </div>
              <div className="form-group"><label>Categoria</label>
                <select value={editForm.categoria} onChange={e => setEditForm({ ...editForm, categoria: e.target.value })}>
                  {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Rol extra</label>
                <select value={editForm.extra_role} onChange={e => setEditForm({ ...editForm, extra_role: e.target.value })}>
                  <option value="">Atleta</option>
                  <option value="organizer">Organizador</option>
                  <option value="judge">Juez</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn-secondary" onClick={() => setEditingParticipant(null)}>Cancelar</button>
              <button type="submit" className="btn-primary">Guardar cambios</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// â”€â”€ Results Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MAX_TEAM_SIZE = 10

function TeamsTab() {
  const { role, organizerEnabled } = useAuth()
  const isOrganizer = role === 'organizer' || organizerEnabled
  const [competitions, setCompetitions] = useState([])
  const [teams, setTeams] = useState([])
  const [filterComp, setFilterComp] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', competition_id: '', member_ids: [] })
  const [participantPool, setParticipantPool] = useState([])
  const [msg, setMsg] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [searchCreate, setSearchCreate] = useState('')
  const [editingTeam, setEditingTeam] = useState(null)
  const [editForm, setEditForm] = useState({ nombre: '', member_ids: [] })
  const [searchEdit, setSearchEdit] = useState('')

  useEffect(() => {
    api.get(isOrganizer ? '/competitions?scope=owned' : '/competitions').then(r => {
      setCompetitions(r.data)
      if (!filterComp && r.data.length) setFilterComp(String(r.data[0].id))
    })
  }, [isOrganizer])

  const loadTeams = async () => {
    const params = filterComp ? `?competition_id=${filterComp}` : ''
    const res = await api.get(`/teams${params}`)
    setTeams(res.data)
  }
  const loadParticipantPool = async (competitionId) => {
    if (!competitionId) {
      setParticipantPool([])
      return
    }
    const res = await api.get(`/competitions/${competitionId}/participants`)
    const confirmed = (res.data || []).filter(p => p.estado === 'confirmado')
    setParticipantPool(confirmed)
  }
  useEffect(() => {
    if (!filterComp) return
    loadTeams().catch(() => setMsg({ type: 'error', text: 'No se pudieron cargar equipos' }))
    loadParticipantPool(filterComp).catch(() => setMsg({ type: 'error', text: 'No se pudieron cargar participantes de la competencia' }))
    setForm(prev => ({ ...prev, competition_id: filterComp, member_ids: [] }))
  }, [filterComp])

  const toggleMember = (pid) => {
    const ids = form.member_ids
    if (ids.includes(pid)) {
      setForm({ ...form, member_ids: ids.filter(i => i !== pid) })
    } else {
      if (ids.length >= MAX_TEAM_SIZE) return
      setForm({ ...form, member_ids: [...ids, pid] })
    }
  }
  const toggleEditMember = (pid) => {
    const ids = editForm.member_ids
    if (ids.includes(pid)) {
      setEditForm({ ...editForm, member_ids: ids.filter(i => i !== pid) })
    } else {
      if (ids.length >= MAX_TEAM_SIZE) return
      setEditForm({ ...editForm, member_ids: [...ids, pid] })
    }
  }

  const create = async (e) => {
    e.preventDefault()
    if (form.member_ids.length < 2) {
      setMsg({ type: 'error', text: 'Se requieren al menos 2 miembros' })
      return
    }
    try {
      await api.post('/teams', {
        nombre: form.nombre,
        competition_id: Number(filterComp),
        member_ids: form.member_ids,
      })
      setMsg({ type: 'success', text: 'Equipo creado' })
      setShowForm(false)
      setForm({ nombre: '', competition_id: filterComp, member_ids: [] })
      setSearchCreate('')
      await loadTeams()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'Error' })
    }
  }
  const startEdit = (team) => {
    setEditingTeam(team)
    setEditForm({
      nombre: (team.nombre || '').trim(),
      member_ids: (team.members || []).map(m => m.id),
    })
    setSearchEdit('')
  }
  const saveEdit = async (e) => {
    e.preventDefault()
    if (!editingTeam) return
    if (editForm.member_ids.length < 2) {
      setMsg({ type: 'error', text: 'Se requieren al menos 2 miembros por equipo' })
      return
    }
    try {
      await api.put(`/teams/${editingTeam.id}`, {
        nombre: editForm.nombre,
        member_ids: editForm.member_ids,
      })
      setMsg({ type: 'success', text: 'Equipo actualizado' })
      setEditingTeam(null)
      await loadTeams()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo actualizar el equipo' })
    }
  }

  const deleteTeam = async (id) => {
    if (!confirm('Eliminar este equipo?')) return
    await api.delete(`/teams/${id}`)
    await loadTeams()
  }

  const usedIds = new Set(teams.flatMap(t => t.members.map(m => m.id)))
  const available = participantPool
    .filter(p => !usedIds.has(p.id) || form.member_ids.includes(p.id))
    .filter(p => `${p.nombre} ${p.apellido} ${formatCedula(p.cedula, '')}`.toLowerCase().includes(searchCreate.toLowerCase()))
  const usedIdsExceptEditing = new Set(
    teams
      .filter(t => t.id !== editingTeam?.id)
      .flatMap(t => t.members.map(m => m.id))
  )
  const availableForEdit = participantPool
    .filter(p => !usedIdsExceptEditing.has(p.id) || editForm.member_ids.includes(p.id))
    .filter(p => `${p.nombre} ${p.apellido} ${formatCedula(p.cedula, '')}`.toLowerCase().includes(searchEdit.toLowerCase()))

  return (
    <div>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <button className="btn-primary" onClick={() => { setShowForm(!showForm); setMsg(null) }} disabled={!filterComp}>
          {showForm ? 'Cancelar' : '+ Crear equipo'}
        </button>
        <select value={filterComp} onChange={e => setFilterComp(e.target.value)} style={{ width: 280 }}>
          <option value="">Seleccionar competencia...</option>
          {competitions.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {filterComp && <span style={{ fontSize: 12, color: '#647063' }}>{participantPool.length} inscritos confirmados</span>}
        <span style={{ fontSize: 12, color: '#647063' }}>Max. {MAX_TEAM_SIZE} miembros por equipo</span>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16, fontSize: 16 }}>Nuevo equipo</h3>
          <form onSubmit={create}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 16 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Nombre del equipo *</label>
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required placeholder="Ej: Team Fire" />
              </div>
            </div>

            <div className="form-group">
              <label>
                Miembros ({form.member_ids.length}/{MAX_TEAM_SIZE}) | minimo 2
              </label>
              <input
                placeholder="Buscar por nombre o cedula..."
                value={searchCreate}
                onChange={e => setSearchCreate(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, maxHeight: 220, overflowY: 'auto', padding: 4 }}>
                {available.map(p => {
                  const selected = form.member_ids.includes(p.id)
                  const disabled = !selected && form.member_ids.length >= MAX_TEAM_SIZE
                  return (
                    <label key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 6,
                      border: `1px solid ${selected ? '#284017' : '#d5ddd3'}`,
                      background: selected ? '#28401711' : 'transparent',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.4 : 1,
                    }}>
                      <input type="checkbox" checked={selected} onChange={() => !disabled && toggleMember(p.id)} style={{ width: 'auto' }} />
                      <span style={{ fontSize: 13 }}>{p.nombre} {p.apellido}</span>
                      <span className={`badge badge-default`} style={{ fontSize: 10, marginLeft: 'auto' }}>{p.categoria_competencia || p.categoria || '-'}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <button type="submit" className="btn-primary">Crear equipo</button>
          </form>
        </div>
      )}

      {teams.map(t => (
        <div key={t.id} className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              style={{ background: 'none', border: 'none', color: '#647063', fontSize: 16, padding: 0, lineHeight: 1 }}
              onClick={() => setExpanded(e => ({ ...e, [t.id]: !e[t.id] }))}
            >
              {expanded[t.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{t.nombre}</span>
            </div>
            <span style={{ color: '#647063', fontSize: 13 }}>{t.members.length} miembros</span>
            <button className="btn-secondary btn-sm" onClick={() => startEdit(t)}>Editar</button>
            <button className="btn-danger btn-sm" onClick={() => deleteTeam(t.id)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={14} /></button>
          </div>

          {expanded[t.id] && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #222' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {t.members.map(m => (
                  <div key={m.id} style={{ background: '#fff', border: '1px solid #d5ddd3', borderRadius: 6, padding: '6px 12px', fontSize: 13 }}>
                    {m.nombre} {m.apellido}
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#647063' }}>{m.categoria}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      {!teams.length && (
        <div style={{ color: '#647063', textAlign: 'center', padding: 40 }}>
          {filterComp ? 'No hay equipos en esta competencia' : 'Selecciona una competencia para gestionar equipos'}
        </div>
      )}

      {editingTeam && (
        <Modal title={`Editar equipo - ${(editingTeam.nombre || '').trim() || `Equipo ${editingTeam.id}`}`} onClose={() => setEditingTeam(null)} width={720}>
          <form onSubmit={saveEdit}>
            <div className="form-group">
              <label>Nombre del equipo *</label>
              <input value={editForm.nombre} onChange={e => setEditForm({ ...editForm, nombre: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Miembros ({editForm.member_ids.length}/{MAX_TEAM_SIZE}) | minimo 2</label>
              <input
                placeholder="Buscar por nombre o cedula..."
                value={searchEdit}
                onChange={e => setSearchEdit(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, maxHeight: 280, overflowY: 'auto', padding: 4 }}>
                {availableForEdit.map(p => {
                  const selected = editForm.member_ids.includes(p.id)
                  const disabled = !selected && editForm.member_ids.length >= MAX_TEAM_SIZE
                  return (
                    <label key={`edit-member-${p.id}`} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 6,
                      border: `1px solid ${selected ? '#284017' : '#d5ddd3'}`,
                      background: selected ? '#28401711' : 'transparent',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.4 : 1,
                    }}>
                      <input type="checkbox" checked={selected} onChange={() => !disabled && toggleEditMember(p.id)} style={{ width: 'auto' }} />
                      <span style={{ fontSize: 13 }}>{p.nombre} {p.apellido}</span>
                      <span className={`badge badge-default`} style={{ fontSize: 10, marginLeft: 'auto' }}>{p.categoria_competencia || p.categoria || '-'}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn-secondary" onClick={() => setEditingTeam(null)}>Cancelar</button>
              <button type="submit" className="btn-primary">Guardar cambios</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function FinanceTab() {
  const { role, organizerEnabled, adminEnabled } = useAuth()
  const isOrganizer = role === 'organizer' || organizerEnabled
  const isAdmin = role === 'admin' || adminEnabled
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Platform config (admin only: fee rate editor)
  const [pricingConfig, setPricingConfig] = useState(null)
  const [editingConfig, setEditingConfig] = useState(false)
  const [configForm, setConfigForm] = useState({ default_platform_fee_rate: '', bold_processor_rate: '', bold_processor_fixed_fee: '', min_platform_fee: '' })
  const [savingConfig, setSavingConfig] = useState(false)
  const [configMsg, setConfigMsg] = useState(null)

  useEffect(() => {
    api.get('/config/pricing').then(({ data }) => {
      setPricingConfig(data)
      setConfigForm({
        default_platform_fee_rate: String(Math.round((data.default_platform_fee_rate || 0.05) * 1000) / 10),
        bold_processor_rate: String(data.bold_processor_rate ?? 0.0269),
        bold_processor_fixed_fee: String(data.bold_processor_fixed_fee ?? 300),
        min_platform_fee: String(data.min_platform_fee ?? 5000),
      })
    }).catch(() => {})
  }, [])

  const saveConfig = async () => {
    setSavingConfig(true)
    setConfigMsg(null)
    try {
      const rate = parseFloat(configForm.default_platform_fee_rate) / 100
      const procRate = parseFloat(configForm.bold_processor_rate)
      const procFixed = parseInt(configForm.bold_processor_fixed_fee, 10)
      const minFee = parseInt(configForm.min_platform_fee, 10)
      if (!Number.isFinite(rate) || rate < 0 || rate > 1) { setConfigMsg({ type: 'error', text: 'Tasa invalida (0-100%)' }); return }
      if (!Number.isFinite(procRate) || procRate < 0) { setConfigMsg({ type: 'error', text: 'Tasa procesador invalida' }); return }
      if (!Number.isFinite(procFixed) || procFixed < 0) { setConfigMsg({ type: 'error', text: 'Fee fijo invalido' }); return }
      if (!Number.isFinite(minFee) || minFee < 0) { setConfigMsg({ type: 'error', text: 'Comision minima invalida' }); return }
      const { data } = await api.put('/config/pricing', {
        default_platform_fee_rate: rate,
        bold_processor_rate: procRate,
        bold_processor_fixed_fee: procFixed,
        min_platform_fee: minFee,
      })
      setPricingConfig(data.config)
      setEditingConfig(false)
      setConfigMsg({ type: 'success', text: 'Configuracion guardada.' })
    } catch (err) {
      setConfigMsg({ type: 'error', text: err.response?.data?.detail || 'Error guardando config.' })
    } finally {
      setSavingConfig(false)
    }
  }

  const withdrawalTerms = [
    'El retiro solicitado corresponde al saldo disponible total de la competencia.',
    'FinalRep procesa la transferencia una vez iniciada la competencia y validada la solicitud.',
    'El organizador debe haber cerrado inscripciones y suministrar correctamente su destino de pago.',
    'Despues de enviada la transferencia, cualquier reclamo con atletas, equipos o terceros sera gestionado directamente por el organizador.',
    'FinalRep no asume responsabilidad por errores en la informacion bancaria o digital entregada por el organizador.',
  ]
  const detailRef = useRef(null)
  const [overview, setOverview] = useState({ totals: null, competitions: [] })
  const [competitionSearch, setCompetitionSearch] = useState('')
  const [selectedCompetitionId, setSelectedCompetitionId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [destinationNote, setDestinationNote] = useState('')
  const [requesterNote, setRequesterNote] = useState('')
  const [savingRequest, setSavingRequest] = useState(false)
  const [termsReachedEnd, setTermsReachedEnd] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)

  const loadOverview = async (preferredCompetitionId = null) => {
    setLoading(true)
    try {
      const { data } = await api.get('/finance/overview')
      const competitions = Array.isArray(data?.competitions) ? data.competitions : []
      setOverview({ totals: data?.totals || null, competitions })
      const nextId = preferredCompetitionId || selectedCompetitionId || competitions[0]?.competition_id || null
      setSelectedCompetitionId(nextId)
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo cargar el panel financiero.' })
    } finally {
      setLoading(false)
    }
  }

  const loadDetail = async (competitionId) => {
    if (!competitionId) {
      setDetail(null)
      return
    }
    setDetailLoading(true)
    try {
      const { data } = await api.get(`/finance/competitions/${competitionId}`)
      setDetail(data || null)
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo cargar el bolsillo de la competencia.' })
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    loadOverview()
  }, [])

  useEffect(() => {
    if (selectedCompetitionId) loadDetail(selectedCompetitionId)
    else setDetail(null)
  }, [selectedCompetitionId])

  useEffect(() => {
    setTermsReachedEnd(false)
    setTermsAccepted(false)
  }, [selectedCompetitionId])

  const submitWithdrawalRequest = async () => {
    if (!selectedCompetitionId) return
    if (!summary?.available_balance) {
      setMsg({ type: 'error', text: 'No hay saldo disponible para retirar.' })
      return
    }
    if (!summary?.withdrawal_request_allowed) {
      setMsg({ type: 'error', text: 'Solo puedes solicitar retiro cuando las inscripciones esten cerradas.' })
      return
    }
    if (!termsAccepted) {
      setMsg({ type: 'error', text: 'Debes aceptar las condiciones de retiro para continuar.' })
      return
    }
    setSavingRequest(true)
    setMsg(null)
    try {
      await api.post(`/finance/competitions/${selectedCompetitionId}/withdrawals`, {
        destination_note: destinationNote || null,
        requester_note: requesterNote || null,
        terms_accepted: termsAccepted ? 1 : 0,
      })
      setDestinationNote('')
      setRequesterNote('')
      setTermsReachedEnd(false)
      setTermsAccepted(false)
      setMsg({ type: 'success', text: 'Solicitud de retiro registrada.' })
      await loadOverview(selectedCompetitionId)
      await loadDetail(selectedCompetitionId)
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo registrar la solicitud de retiro.' })
    } finally {
      setSavingRequest(false)
    }
  }

  const reviewWithdrawal = async (item, status) => {
    const promptValue = window.prompt('Nota interna', item.review_note || '')
    const reviewNote = promptValue ?? item.review_note ?? ''
    let payoutReference = item.payout_reference || ''
    if (status === 'paid') {
      const value = window.prompt('Referencia del pago al organizador', item.payout_reference || '')
      if (!value) return
      payoutReference = value
    }
    try {
      await api.put(`/finance/withdrawals/${item.id}`, {
        status,
        review_note: reviewNote || null,
        payout_reference: payoutReference || null,
      })
      setMsg({ type: 'success', text: `Solicitud actualizada a ${status}.` })
      await loadOverview(selectedCompetitionId)
      await loadDetail(selectedCompetitionId)
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo actualizar la solicitud.' })
    }
  }

  const totals = overview.totals || {}
  const competitions = overview.competitions || []
  const summary = detail?.summary || null
  const withdrawals = detail?.withdrawals || []
  const headlineCollected = isOrganizer ? totals.organizer_revenue : totals.total_collected
  const canRequestWithdrawal = Boolean(summary?.withdrawal_request_allowed)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {msg ? (
        <div style={{ borderRadius: 14, border: `1px solid ${msg.type === 'success' ? 'rgba(94,234,212,0.26)' : 'rgba(214,217,224,0.26)'}`, background: msg.type === 'success' ? 'rgba(94,234,212,0.08)' : 'rgba(214,217,224,0.08)', padding: '12px 14px', color: '#F5F7FA', fontSize: 14 }}>
          {msg.text}
        </div>
      ) : null}

      {isAdmin && pricingConfig && (
        <div className="card" style={{ background: '#171B21', border: '1px solid #252A33', borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 800 }}>Configuracion de comisiones</div>
            {!editingConfig && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => { setEditingConfig(true); setConfigMsg(null) }}>Editar</button>
            )}
          </div>
          {configMsg && (
            <div style={{ borderRadius: 10, border: `1px solid ${configMsg.type === 'success' ? 'rgba(94,234,212,0.26)' : 'rgba(214,217,224,0.26)'}`, background: configMsg.type === 'success' ? 'rgba(94,234,212,0.08)' : 'rgba(214,217,224,0.08)', padding: '8px 12px', color: '#F5F7FA', fontSize: 13, marginBottom: 10 }}>
              {configMsg.text}
            </div>
          )}
          {!editingConfig ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <div style={{ borderRadius: 12, border: '1px solid #252A33', background: '#0D0F12', padding: '10px 12px' }}>
                <div style={{ color: '#AAB2C0', fontSize: 11 }}>Comision FinalRep (default)</div>
                <div style={{ color: '#FFB36F', fontSize: 20, fontWeight: 800, marginTop: 4 }}>{Math.round((pricingConfig.default_platform_fee_rate || 0) * 1000) / 10}%</div>
              </div>
              <div style={{ borderRadius: 12, border: '1px solid #252A33', background: '#0D0F12', padding: '10px 12px' }}>
                <div style={{ color: '#AAB2C0', fontSize: 11 }}>Tasa Bold</div>
                <div style={{ color: '#F5F7FA', fontSize: 20, fontWeight: 800, marginTop: 4 }}>{((pricingConfig.bold_processor_rate || 0) * 100).toFixed(2)}%</div>
              </div>
              <div style={{ borderRadius: 12, border: '1px solid #252A33', background: '#0D0F12', padding: '10px 12px' }}>
                <div style={{ color: '#AAB2C0', fontSize: 11 }}>Fee fijo Bold</div>
                <div style={{ color: '#F5F7FA', fontSize: 20, fontWeight: 800, marginTop: 4 }}>{formatCop(pricingConfig.bold_processor_fixed_fee)}</div>
              </div>
              <div style={{ borderRadius: 12, border: '1px solid #252A33', background: '#0D0F12', padding: '10px 12px' }}>
                <div style={{ color: '#AAB2C0', fontSize: 11 }}>Comision minima FinalRep</div>
                <div style={{ color: '#FFB36F', fontSize: 20, fontWeight: 800, marginTop: 4 }}>{formatCop(pricingConfig.min_platform_fee)}</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <div>
                  <div style={{ color: '#AAB2C0', fontSize: 12, marginBottom: 4 }}>Comision FinalRep % (default)</div>
                  <input type="number" min="0" max="100" step="0.1" value={configForm.default_platform_fee_rate} onChange={e => setConfigForm(p => ({ ...p, default_platform_fee_rate: e.target.value }))} placeholder="5" />
                </div>
                <div>
                  <div style={{ color: '#AAB2C0', fontSize: 12, marginBottom: 4 }}>Tasa Bold (decimal, ej: 0.0269)</div>
                  <input type="number" min="0" max="1" step="0.0001" value={configForm.bold_processor_rate} onChange={e => setConfigForm(p => ({ ...p, bold_processor_rate: e.target.value }))} placeholder="0.0269" />
                </div>
                <div>
                  <div style={{ color: '#AAB2C0', fontSize: 12, marginBottom: 4 }}>Fee fijo Bold (COP)</div>
                  <input type="number" min="0" step="1" value={configForm.bold_processor_fixed_fee} onChange={e => setConfigForm(p => ({ ...p, bold_processor_fixed_fee: e.target.value }))} placeholder="300" />
                </div>
                <div>
                  <div style={{ color: '#AAB2C0', fontSize: 12, marginBottom: 4 }}>Comision minima FinalRep (COP)</div>
                  <input type="number" min="0" step="100" value={configForm.min_platform_fee} onChange={e => setConfigForm(p => ({ ...p, min_platform_fee: e.target.value }))} placeholder="5000" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingConfig(false)}>Cancelar</button>
                <button type="button" className="btn-primary btn-sm" onClick={saveConfig} disabled={savingConfig}>{savingConfig ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </div>
          )}

        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div className="card" style={{ background: '#171B21', border: '1px solid #252A33', borderRadius: 16, padding: 16 }}>
          <div style={{ color: '#AAB2C0', fontSize: 12 }}>{isOrganizer ? 'Total recaudado' : 'Ingresos totales'}</div>
          <div style={{ color: '#F5F7FA', fontSize: 24, fontWeight: 800, marginTop: 6 }}>{formatCop(headlineCollected)}</div>
        </div>
        {!isOrganizer && (
          <div className="card" style={{ background: '#171B21', border: '1px solid #252A33', borderRadius: 16, padding: 16 }}>
            <div style={{ color: '#AAB2C0', fontSize: 12 }}>Saldo esperado en Bold</div>
            <div style={{ color: '#8DF1E4', fontSize: 24, fontWeight: 800, marginTop: 6 }}>{formatCop(totals.expected_bold_balance)}</div>
          </div>
        )}
        {!isOrganizer && (
          <div className="card" style={{ background: '#171B21', border: '1px solid #252A33', borderRadius: 16, padding: 16 }}>
            <div style={{ color: '#AAB2C0', fontSize: 12 }}>Saldo retenido organizadores</div>
            <div style={{ color: '#FFB36F', fontSize: 24, fontWeight: 800, marginTop: 6 }}>{formatCop(totals.organizer_balance_held)}</div>
          </div>
        )}
        {!isOrganizer && (
          <div className="card" style={{ background: '#171B21', border: '1px solid #252A33', borderRadius: 16, padding: 16 }}>
            <div style={{ color: '#AAB2C0', fontSize: 12 }}>Libre FinalRep</div>
            <div style={{ color: '#F5F7FA', fontSize: 24, fontWeight: 800, marginTop: 6 }}>{formatCop(totals.finalrep_available_balance)}</div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(280px, 360px) minmax(0, 1fr)', gap: 16 }}>
        <div className="card" style={{ background: '#171B21', border: '1px solid #252A33', borderRadius: 18, padding: 16, display: 'grid', gridTemplateRows: 'auto auto 1fr', minHeight: 0 }}>
          <div style={{ color: '#F5F7FA', fontSize: 17, fontWeight: 800, marginBottom: 10 }}>Competencias</div>
          {competitions.length > 4 && (
            <input
              value={competitionSearch}
              onChange={e => setCompetitionSearch(e.target.value)}
              placeholder="Buscar competencia..."
              style={{ marginBottom: 10, fontSize: 13 }}
            />
          )}
          {loading ? <div style={{ color: '#AAB2C0', fontSize: 14 }}>Cargando...</div> : null}
          {!loading && !competitions.length ? <div style={{ color: '#AAB2C0', fontSize: 14 }}>No hay competencias con ingresos todavia.</div> : null}
          <div style={{ display: 'grid', gap: 10, overflowY: 'auto', maxHeight: isMobile ? 'none' : 520, paddingRight: 2 }}>
            {competitions.filter(item =>
              !competitionSearch.trim() || item.competition_name?.toLowerCase().includes(competitionSearch.trim().toLowerCase())
            ).map((item) => (
              <button
                key={item.competition_id}
                type="button"
                onClick={() => {
                  setSelectedCompetitionId(item.competition_id)
                  if (isMobile) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
                }}
                style={{
                  textAlign: 'left',
                  borderRadius: 14,
                  border: `1px solid ${selectedCompetitionId === item.competition_id ? 'rgba(214,217,224,0.38)' : '#252A33'}`,
                  background: selectedCompetitionId === item.competition_id ? 'rgba(214,217,224,0.08)' : 'rgba(13,15,18,0.62)',
                  padding: 14,
                  color: '#F5F7FA',
                  cursor: 'pointer',
                }}
              >
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{item.competition_name}</div>
                  <div style={{ display: 'grid', gap: 4, marginTop: 8, color: '#AAB2C0', fontSize: 12 }}>
                  <div>Total recaudado: {formatCop(isOrganizer ? item.organizer_revenue : item.total_collected)}</div>
                  {isOrganizer
                    ? <div>Desembolso: <span style={{ color: item.disbursement_status === 'paid' ? '#8DF1E4' : item.disbursement_status === 'approved' ? '#FFB36F' : '#AAB2C0', fontWeight: 700, textTransform: 'uppercase' }}>{item.disbursement_status === 'paid' ? 'Transferido' : item.disbursement_status === 'approved' ? 'Aprobado' : item.disbursement_status === 'pending' ? 'En revision' : 'Pendiente solicitud'}</span></div>
                    : <>
                        <div>Bold esperado: {formatCop(item.expected_bold_balance)}</div>
                        <div>Libre FinalRep: {formatCop(item.finalrep_available_balance)}</div>
                      </>
                  }
                </div>
              </button>
            ))}
            {!loading && competitions.length > 0 && competitionSearch.trim() &&
              !competitions.some(item => item.competition_name?.toLowerCase().includes(competitionSearch.trim().toLowerCase())) && (
              <div style={{ color: '#AAB2C0', fontSize: 13, padding: '8px 4px' }}>Sin resultados para "{competitionSearch}"</div>
            )}
          </div>
        </div>

        <div ref={detailRef} className="card" style={{ background: '#171B21', border: '1px solid #252A33', borderRadius: 18, padding: 16 }}>
          {detailLoading ? <div style={{ color: '#AAB2C0', fontSize: 14 }}>Cargando detalle financiero...</div> : null}
          {!detailLoading && !summary ? <div style={{ color: '#AAB2C0', fontSize: 14 }}>Selecciona una competencia.</div> : null}
          {!detailLoading && summary ? (
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <div style={{ color: '#F5F7FA', fontSize: 22, fontWeight: 800 }}>{detail?.competition?.nombre}</div>
                <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                  <div style={{ color: summary.can_release_funds ? '#8DF1E4' : '#FFB36F', fontSize: 13 }}>
                    {summary.can_release_funds
                      ? 'La competencia ya inicio. Se pueden liberar retiros.'
                      : 'Los retiros solo se liberan cuando la competencia inicia.'}
                  </div>
                  <div style={{ color: summary.enrollment_closed ? '#8DF1E4' : '#AAB2C0', fontSize: 13 }}>
                    {summary.enrollment_closed
                      ? 'Las inscripciones ya estan cerradas.'
                      : 'Las solicitudes de retiro se habilitan cuando las inscripciones se cierren.'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14 }}>
                  <div style={{ color: '#AAB2C0', fontSize: 12 }}>Total recaudado ({summary.approved_payments} inscritos)</div>
                  <div style={{ color: '#F5F7FA', fontSize: 20, fontWeight: 800, marginTop: 6 }}>{formatCop(summary.organizer_revenue)}</div>
                </div>
                {isOrganizer ? (
                  <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14 }}>
                    <div style={{ color: '#AAB2C0', fontSize: 12 }}>Estado del desembolso</div>
                    <div style={{ fontSize: 16, fontWeight: 800, marginTop: 6, color: summary.disbursement_status === 'paid' ? '#8DF1E4' : summary.disbursement_status === 'approved' ? '#FFB36F' : '#AAB2C0' }}>
                      {summary.disbursement_status === 'paid' ? 'Transferido' : summary.disbursement_status === 'approved' ? 'Aprobado, en transferencia' : summary.disbursement_status === 'pending' ? 'En revision' : 'Sin solicitud'}
                    </div>
                    {summary.paid_out_total > 0 && <div style={{ color: '#8DF1E4', fontSize: 13, marginTop: 4 }}>{formatCop(summary.paid_out_total)}</div>}
                  </div>
                ) : (
                  <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14 }}>
                    <div style={{ color: '#AAB2C0', fontSize: 12 }}>Saldo esperado en Bold</div>
                    <div style={{ color: '#8DF1E4', fontSize: 20, fontWeight: 800, marginTop: 6 }}>{formatCop(summary.expected_bold_balance)}</div>
                  </div>
                )}
                {!isOrganizer && (
                  <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14 }}>
                    <div style={{ color: '#AAB2C0', fontSize: 12 }}>Retiros pagados</div>
                    <div style={{ color: '#F5F7FA', fontSize: 20, fontWeight: 800, marginTop: 6 }}>{formatCop(summary.paid_out_total)}</div>
                  </div>
                )}
                {!isOrganizer ? (
                  <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14 }}>
                    <div style={{ color: '#AAB2C0', fontSize: 12 }}>Comision FinalRep bruta</div>
                    <div style={{ color: '#F5F7FA', fontSize: 20, fontWeight: 800, marginTop: 6 }}>{formatCop(summary.platform_revenue_gross)}</div>
                  </div>
                ) : null}
                {!isOrganizer ? (
                  <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14 }}>
                    <div style={{ color: '#AAB2C0', fontSize: 12 }}>Costo Bold</div>
                    <div style={{ color: '#F5F7FA', fontSize: 20, fontWeight: 800, marginTop: 6 }}>{formatCop(summary.processor_fees)}</div>
                  </div>
                ) : null}
                {!isOrganizer ? (
                  <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14 }}>
                    <div style={{ color: '#AAB2C0', fontSize: 12 }}>Comision FinalRep neta</div>
                    <div style={{ color: '#8DF1E4', fontSize: 20, fontWeight: 800, marginTop: 6 }}>{formatCop(summary.platform_revenue_net)}</div>
                  </div>
                ) : null}
                {!isOrganizer ? (
                  <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14 }}>
                    <div style={{ color: '#AAB2C0', fontSize: 12 }}>Saldo retenido organizadores</div>
                    <div style={{ color: '#FFB36F', fontSize: 20, fontWeight: 800, marginTop: 6 }}>{formatCop(summary.organizer_balance_held)}</div>
                  </div>
                ) : null}
                {!isOrganizer ? (
                  <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14 }}>
                    <div style={{ color: '#AAB2C0', fontSize: 12 }}>Libre FinalRep</div>
                    <div style={{ color: '#F5F7FA', fontSize: 20, fontWeight: 800, marginTop: 6 }}>{formatCop(summary.finalrep_available_balance)}</div>
                  </div>
                ) : null}
              </div>

              {isOrganizer ? (
                <div style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 16, display: 'grid', gap: 10 }}>
                  <div style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 800 }}>Solicitar retiro</div>
                  <div style={{ color: '#AAB2C0', fontSize: 13 }}>
                    El retiro siempre se solicita por el saldo total disponible de esta competencia.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                    <div style={{ borderRadius: 12, border: '1px solid #252A33', background: '#0D0F12', padding: '11px 12px' }}>
                      <div style={{ color: '#AAB2C0', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 }}>Valor a retirar</div>
                      <div style={{ color: '#F5F7FA', fontSize: 18, fontWeight: 800, marginTop: 4 }}>{formatCop(summary.available_balance)}</div>
                    </div>
                    <input value={destinationNote} onChange={(e) => setDestinationNote(e.target.value)} placeholder="Cuenta, nequi o banco destino" />
                  </div>
                  <textarea value={requesterNote} onChange={(e) => setRequesterNote(e.target.value)} placeholder="Nota opcional para el retiro" rows={3} style={{ resize: 'vertical' }} />
                  <div style={{ borderRadius: 14, border: '1px solid #252A33', background: '#0D0F12', padding: 12, display: 'grid', gap: 10 }}>
                    <div style={{ color: '#F5F7FA', fontSize: 14, fontWeight: 700 }}>Condiciones de retiro</div>
                    <div
                      onScroll={(e) => {
                        const node = e.currentTarget
                        if (node.scrollTop + node.clientHeight >= node.scrollHeight - 8) {
                          setTermsReachedEnd(true)
                        }
                      }}
                      style={{ maxHeight: 132, overflowY: 'auto', paddingRight: 4, color: '#AAB2C0', fontSize: 13, lineHeight: 1.5 }}
                    >
                      {withdrawalTerms.map((item, idx) => (
                        <div key={idx} style={{ marginBottom: idx === withdrawalTerms.length - 1 ? 0 : 8 }}>
                          {idx + 1}. {item}
                        </div>
                      ))}
                    </div>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: termsReachedEnd ? '#F5F7FA' : '#6B7280', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={termsAccepted}
                        disabled={!termsReachedEnd}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        style={{ width: 'auto', marginTop: 2 }}
                      />
                      <span>{termsReachedEnd ? 'Lei y acepto las condiciones de retiro.' : 'Desplazate hasta el final para habilitar la aceptacion.'}</span>
                    </label>
                  </div>
                  {!summary.enrollment_closed ? (
                    <div style={{ color: '#FFB36F', fontSize: 13 }}>
                      Debes cerrar las inscripciones antes de solicitar el retiro.
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn-primary" type="button" onClick={submitWithdrawalRequest} disabled={savingRequest || !canRequestWithdrawal || !termsAccepted}>
                      {savingRequest ? 'Guardando...' : 'Solicitar retiro'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 16, color: '#AAB2C0', fontSize: 13 }}>
                  Administra las solicitudes y libera el dinero solo cuando la competencia haya iniciado.
                </div>
              )}

              <div style={{ display: 'grid', gap: 10 }}>
                {withdrawals.length ? withdrawals.map((item) => (
                  <div key={item.id} style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14, display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ color: '#F5F7FA', fontSize: 15, fontWeight: 800 }}>{formatCop(item.amount)}</div>
                      <div style={{ color: item.status === 'paid' ? '#8DF1E4' : item.status === 'rejected' ? '#FF8B8B' : '#FFB36F', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>{item.status}</div>
                    </div>
                    <div style={{ color: '#AAB2C0', fontSize: 13 }}>
                      Destino: {item.destination_note || 'Sin dato'}{item.payout_reference ? ` | Ref pago: ${item.payout_reference}` : ''}
                    </div>
                    {item.requester_note ? <div style={{ color: '#AAB2C0', fontSize: 13 }}>Nota: {item.requester_note}</div> : null}
                    {item.terms_accepted_at ? <div style={{ color: '#AAB2C0', fontSize: 13 }}>Condiciones aceptadas: {formatDate(item.terms_accepted_at)}</div> : null}
                    {item.review_note ? <div style={{ color: '#AAB2C0', fontSize: 13 }}>Revision: {item.review_note}</div> : null}
                    {!isOrganizer ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => reviewWithdrawal(item, 'approved')}>Aprobar</button>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => reviewWithdrawal(item, 'rejected')}>Rechazar</button>
                        <button type="button" className="btn-primary btn-sm" onClick={() => reviewWithdrawal(item, 'paid')}>Marcar pagado</button>
                      </div>
                    ) : null}
                  </div>
                )) : (
                  <div style={{ color: '#AAB2C0', fontSize: 14 }}>Aun no hay solicitudes para esta competencia.</div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function OrganizerApplicationsTab() {
  const [items, setItems] = useState([])
  const [statusFilter, setStatusFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : ''
      const { data } = await api.get(`/organizer-applications${query}`)
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudieron cargar las solicitudes' })
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [statusFilter])

  const review = async (item, status) => {
    const review_note = window.prompt(
      status === 'approved'
        ? 'Nota opcional para aprobar y promover a organizador:'
        : 'Motivo o nota de rechazo:'
    ) || ''
    setBusyId(item.id)
    setMsg(null)
    try {
      await api.put(`/organizer-applications/${item.id}/review`, { status, review_note })
      setMsg({ type: 'success', text: status === 'approved' ? 'Solicitud aprobada y cuenta actualizada.' : 'Solicitud rechazada.' })
      load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo actualizar la solicitud' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ borderRadius: 22, border: '1px solid #252A33', background: '#171B21', padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#F5F7FA', fontSize: 20, fontWeight: 800 }}>Solicitudes de organizador</div>
            <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>Revisa perfiles completos, contexto del evento y decide si la cuenta pasa a organizador.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['pending', 'approved', 'rejected'].map(status => (
              <button key={status} type="button" className="btn-secondary btn-sm" onClick={() => setStatusFilter(status)} style={{ opacity: statusFilter === status ? 1 : 0.72 }}>
                {status === 'pending' ? 'Pendientes' : status === 'approved' ? 'Aprobadas' : 'Rechazadas'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {msg ? <div className={`alert alert-${msg.type}`}>{msg.text}</div> : null}
      {loading ? <div style={{ color: '#AAB2C0', fontSize: 14 }}>Cargando solicitudes...</div> : null}
      {!loading && !items.length ? <div style={{ color: '#AAB2C0', fontSize: 14 }}>No hay solicitudes en este estado.</div> : null}

      <div style={{ display: 'grid', gap: 14 }}>
        {items.map((item) => {
          const snapshot = item.profile_snapshot || {}
          const applicantName = snapshot.nombre && snapshot.apellido ? `${snapshot.nombre} ${snapshot.apellido}` : (item.user?.display_name || 'Usuario')
          const statusTone = item.status === 'approved' ? '#22C55E' : item.status === 'rejected' ? '#EF4444' : '#F59E0B'
          return (
            <div key={item.id} style={{ borderRadius: 22, border: '1px solid #252A33', background: '#171B21', padding: 18, display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: '#F5F7FA', fontSize: 18, fontWeight: 800 }}>{applicantName}</div>
                  <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>{item.user?.username || snapshot.email || 'Sin usuario'}</div>
                  <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4 }}>Recibida: {formatDate(item.created_at)}</div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 999, border: `1px solid ${statusTone}55`, background: `${statusTone}1A`, color: statusTone, fontSize: 12, fontWeight: 800 }}>
                  {item.status === 'pending' ? 'Pendiente' : item.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.58)', padding: 12 }}>
                  <div style={{ color: '#AAB2C0', fontSize: 11 }}>Cedula</div>
                  <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 700, marginTop: 4 }}>{formatCedula(snapshot.cedula)}</div>
                </div>
                <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.58)', padding: 12 }}>
                  <div style={{ color: '#AAB2C0', fontSize: 11 }}>Celular</div>
                  <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 700, marginTop: 4 }}>{snapshot.celular || '-'}</div>
                </div>
                <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.58)', padding: 12 }}>
                  <div style={{ color: '#AAB2C0', fontSize: 11 }}>Ciudad / Pais</div>
                  <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 700, marginTop: 4 }}>{snapshot.ciudad_pais || '-'}</div>
                </div>
                <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.58)', padding: 12 }}>
                  <div style={{ color: '#AAB2C0', fontSize: 11 }}>Fecha nacimiento</div>
                  <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 700, marginTop: 4 }}>{snapshot.fecha_nacimiento || '-'}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.58)', padding: 14 }}>
                  <div style={{ color: '#FFB36F', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>Evento propuesto</div>
                  <div style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 800, marginTop: 6 }}>{item.requested_event_name}</div>
                  <div style={{ color: '#D7DEE8', fontSize: 13, marginTop: 6 }}>
                  {[item.requested_event_location, item.requested_event_date].filter(Boolean).join(' · ') || 'Sin fecha o lugar definidos'}
                  </div>
                  {item.requested_event_description ? <div style={{ color: '#AAB2C0', fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>{item.requested_event_description}</div> : null}
                </div>
                <div style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.58)', padding: 14 }}>
                  <div style={{ color: '#5EEAD4', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>Por que quiere ser organizador</div>
                  <div style={{ color: '#D7DEE8', fontSize: 13, lineHeight: 1.7, marginTop: 8 }}>{item.why_organizer}</div>
                </div>
                {item.prior_events_summary ? (
                  <div style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.58)', padding: 14 }}>
                    <div style={{ color: '#F5F7FA', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>Experiencia previa</div>
                    <div style={{ color: '#D7DEE8', fontSize: 13, lineHeight: 1.7, marginTop: 8 }}>{item.prior_events_summary}</div>
                  </div>
                ) : null}
                <div style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.58)', padding: 14 }}>
                  <div style={{ color: '#F5F7FA', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>Por que con FinalRep</div>
                  <div style={{ color: '#D7DEE8', fontSize: 13, lineHeight: 1.7, marginTop: 8 }}>{item.why_finalrep}</div>
                </div>
                {item.review_note ? (
                  <div style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.58)', padding: 14 }}>
                    <div style={{ color: '#F5F7FA', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>Nota de revision</div>
                    <div style={{ color: '#D7DEE8', fontSize: 13, lineHeight: 1.7, marginTop: 8 }}>{item.review_note}</div>
                  </div>
                ) : null}
              </div>

              {item.status === 'pending' ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn-danger btn-sm" onClick={() => review(item, 'rejected')} disabled={busyId === item.id}>
                    {busyId === item.id ? 'Guardando...' : 'Rechazar'}
                  </button>
                  <button type="button" className="btn-primary btn-sm" onClick={() => review(item, 'approved')} disabled={busyId === item.id}>
                    {busyId === item.id ? 'Guardando...' : 'Aprobar'}
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SystemStatusCard({ title, value, tone = '#F5F7FA', hint, children }) {
  return (
    <div style={{
      background: '#171B21',
      border: '1px solid #252A33',
      borderRadius: 8,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minWidth: 0,
    }}>
      <div style={{ color: '#AAB2C0', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.2 }}>{title}</div>
      <div style={{ color: tone, fontSize: 28, fontWeight: 800, lineHeight: 1.05 }}>{value}</div>
      {hint ? <div style={{ color: '#6B7280', fontSize: 12 }}>{hint}</div> : null}
      {children}
    </div>
  )
}

function SystemStatusTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const res = await api.get('/system/status')
      setData(res.data)
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo cargar el estado del sistema')
    } finally {
      if (silent) setRefreshing(false)
      else setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const db = data?.database
  const pool = data?.pool
  const app = data?.app
  const cache = data?.cache
  const server = data?.server

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#F5F7FA', fontSize: 22, fontWeight: 800 }}>Estado del sistema</div>
          <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>
            Backend, base de datos, pool de conexiones y cache en tiempo real.
          </div>
        </div>
        <button type="button" className="btn-secondary" onClick={() => load({ silent: true })} disabled={loading || refreshing}>
          {loading || refreshing ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {error ? (
        <div style={{ background: 'rgba(239,68,68,0.12)', color: '#FFB4B4', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 8, padding: 14 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        <SystemStatusCard
          title="Backend"
          value={app ? 'Operativo' : loading ? '...' : 'Sin datos'}
          tone={app ? '#22C55E' : '#AAB2C0'}
          hint={app ? `PID ${app.process_id} | uptime ${formatDurationShort(app.uptime_seconds)}` : ''}
        />
        <SystemStatusCard
          title="Base de datos"
          value={db?.ok ? 'Conectada' : loading ? '...' : 'Con error'}
          tone={db?.ok ? '#22C55E' : '#EF4444'}
          hint={db?.target?.host ? `${db.target.host}:${db.target.port || ''}` : db?.error || ''}
        />
        <SystemStatusCard
          title="Conexiones activas"
          value={db?.activity_totals?.active ?? (loading ? '...' : '0')}
          tone="#00C2A8"
          hint={`Total ${db?.activity_totals?.total ?? 0} | idle ${db?.activity_totals?.idle ?? 0}`}
        />
        <SystemStatusCard
          title="Pool checkout"
          value={pool?.checked_out ?? (loading ? '...' : '0')}
          tone={Number(pool?.checked_out || 0) > Number(pool?.configured_pool_size || 0) ? '#F59E0B' : '#FF6B00'}
          hint={`pool ${pool?.size ?? 0} | overflow ${pool?.overflow ?? 0}`}
        />
        <SystemStatusCard
          title="Latencia DB"
          value={db?.latency_ms != null ? `${db.latency_ms} ms` : (loading ? '...' : '--')}
          tone="#F5F7FA"
          hint={db?.server_version ? `PostgreSQL ${db.server_version}` : ''}
        />
        <SystemStatusCard
          title="Cache"
          value={cache?.connected ? 'Redis OK' : cache?.redis_url_configured ? 'Sin conexion' : 'Desactivada'}
          tone={cache?.connected ? '#22C55E' : cache?.redis_url_configured ? '#F59E0B' : '#AAB2C0'}
          hint={cache?.redis_url_configured ? 'CACHE_ENABLED activo' : 'Sin REDIS_URL configurado'}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <div style={{ background: '#171B21', border: '1px solid #252A33', borderRadius: 8, padding: 16 }}>
          <div style={{ color: '#F5F7FA', fontWeight: 800, marginBottom: 12 }}>Servidor</div>
          <div style={{ display: 'grid', gap: 8, color: '#AAB2C0', fontSize: 13 }}>
            <div><span style={{ color: '#6B7280' }}>Entorno:</span> {app?.environment || '--'}</div>
            <div><span style={{ color: '#6B7280' }}>Python:</span> {app?.python_version || '--'}</div>
            <div><span style={{ color: '#6B7280' }}>Plataforma:</span> {app?.platform || '--'}</div>
            <div><span style={{ color: '#6B7280' }}>Host / puerto:</span> {server?.host || '--'}:{server?.port || '--'}</div>
            <div><span style={{ color: '#6B7280' }}>Inicio:</span> {formatDate(app?.started_at)}</div>
            <div><span style={{ color: '#6B7280' }}>Generado:</span> {formatDate(data?.generated_at)}</div>
          </div>
        </div>

        <div style={{ background: '#171B21', border: '1px solid #252A33', borderRadius: 8, padding: 16 }}>
          <div style={{ color: '#F5F7FA', fontWeight: 800, marginBottom: 12 }}>Pool de conexiones</div>
          <div style={{ display: 'grid', gap: 8, color: '#AAB2C0', fontSize: 13 }}>
            <div><span style={{ color: '#6B7280' }}>Pool configurado:</span> {pool?.configured_pool_size ?? '--'}</div>
            <div><span style={{ color: '#6B7280' }}>Max overflow:</span> {pool?.configured_max_overflow ?? '--'}</div>
            <div><span style={{ color: '#6B7280' }}>Checkout actual:</span> {pool?.checked_out ?? '--'}</div>
            <div><span style={{ color: '#6B7280' }}>Overflow actual:</span> {pool?.overflow ?? '--'}</div>
            <div><span style={{ color: '#6B7280' }}>Timeout pool:</span> {pool?.configured_pool_timeout_seconds ?? '--'} s</div>
            <div><span style={{ color: '#6B7280' }}>Recycle pool:</span> {pool?.configured_pool_recycle_seconds ?? '--'} s</div>
            <div style={{ color: '#6B7280', marginTop: 4 }}>{pool?.status_text || 'Sin datos del pool'}</div>
          </div>
        </div>

        <div style={{ background: '#171B21', border: '1px solid #252A33', borderRadius: 8, padding: 16 }}>
          <div style={{ color: '#F5F7FA', fontWeight: 800, marginBottom: 12 }}>Base de datos</div>
          <div style={{ display: 'grid', gap: 8, color: '#AAB2C0', fontSize: 13 }}>
            <div><span style={{ color: '#6B7280' }}>Driver:</span> {db?.target?.driver || '--'}</div>
            <div><span style={{ color: '#6B7280' }}>Host:</span> {db?.target?.host || '--'}</div>
            <div><span style={{ color: '#6B7280' }}>Base:</span> {db?.current_database || db?.target?.database || '--'}</div>
            <div><span style={{ color: '#6B7280' }}>Usuario:</span> {db?.current_user || '--'}</div>
            <div><span style={{ color: '#6B7280' }}>Max connections:</span> {db?.max_connections ?? '--'}</div>
            <div><span style={{ color: '#6B7280' }}>Reservadas superuser:</span> {db?.superuser_reserved_connections ?? '--'}</div>
            {db?.error ? <div style={{ color: '#FF8B8B' }}>{db.error}</div> : null}
          </div>
        </div>
      </div>

      <div style={{ background: '#171B21', border: '1px solid #252A33', borderRadius: 8, padding: 16 }}>
        <div style={{ color: '#F5F7FA', fontWeight: 800, marginBottom: 12 }}>Resumen de conexiones en PostgreSQL</div>
        {loading ? (
          <div style={{ color: '#AAB2C0', fontSize: 13 }}>Cargando estado...</div>
        ) : !db?.activity_summary?.length ? (
          <div style={{ color: '#AAB2C0', fontSize: 13 }}>No hay datos de actividad disponibles.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Aplicacion</th>
                <th>Estado</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {db.activity_summary.map((row, index) => (
                <tr key={`${row.application_name}-${row.state}-${index}`}>
                  <td>{row.application_name}</td>
                  <td style={{ textTransform: 'lowercase' }}>{row.state}</td>
                  <td>{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// â”€â”€ Main AdminDashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function AdminDashboard() {
  const { role, organizerEnabled } = useAuth()
  const isOrganizer = role === 'organizer' || organizerEnabled
  const [mainTab, setMainTab] = useState('competitions')
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  return (
    <div className="app-shell">
      <div className="app-container" style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: isMobile ? '14px 12px' : '24px 20px' }}>
        <div className="tabs" style={{ marginBottom: 16, overflowX: 'auto', whiteSpace: 'nowrap', flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', paddingBottom: isMobile ? 4 : 0 }}>
          <button className={`tab ${mainTab === 'competitions' ? 'active' : ''}`} onClick={() => setMainTab('competitions')} style={{ flexShrink: 0 }}>
            Competencias
          </button>
          <button className={`tab ${mainTab === 'finance' ? 'active' : ''}`} onClick={() => setMainTab('finance')} style={{ flexShrink: 0 }}>
            Finanzas
          </button>
          {!isOrganizer && (
            <button className={`tab ${mainTab === 'system' ? 'active' : ''}`} onClick={() => setMainTab('system')} style={{ flexShrink: 0 }}>
              Estado del sistema
            </button>
          )}
          {!isOrganizer && (
            <button className={`tab ${mainTab === 'athletes' ? 'active' : ''}`} onClick={() => setMainTab('athletes')} style={{ flexShrink: 0 }}>
              Usuarios
            </button>
          )}
          {!isOrganizer && (
            <button className={`tab ${mainTab === 'gyms' ? 'active' : ''}`} onClick={() => setMainTab('gyms')} style={{ flexShrink: 0 }}>
              Gyms
            </button>
          )}
          {!isOrganizer && (
            <button className={`tab ${mainTab === 'organizer-requests' ? 'active' : ''}`} onClick={() => setMainTab('organizer-requests')} style={{ flexShrink: 0 }}>
              Solicitudes organizador
            </button>
          )}
        </div>
        {mainTab === 'competitions' && <CompetitionsTab />}
        {mainTab === 'finance' && <FinanceTab />}
        {!isOrganizer && mainTab === 'system' && <SystemStatusTab />}
        {!isOrganizer && mainTab === 'athletes' && <ParticipantsTab />}
        {!isOrganizer && mainTab === 'gyms' && <AdminGymsPanel />}
        {!isOrganizer && mainTab === 'organizer-requests' && <OrganizerApplicationsTab />}
      </div>
    </div>
  )
}

















