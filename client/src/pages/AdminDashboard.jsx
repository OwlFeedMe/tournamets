import { useState, useEffect, useRef, useMemo } from 'react'
import api from '../api/axios'
import { buildCityCountry, loadCitiesByCountry, loadCountries, parseCityCountry } from '../utils/locations'
import { X, Trash2, Pencil, ChevronDown, ChevronRight, ClipboardList, Clock3, Hourglass, Play, Pause, RotateCcw, ArrowLeft, Crown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { COMPETITION_WORKSPACE_SECTIONS } from './adminCompetitionWorkspace'
import { CompetitionSchedulePanel } from './adminCompetitionSchedulePanel'

const CATEGORIAS = ['Rx', 'Scaled', 'Masters', 'Teens', 'Otro']
const GENEROS = ['M', 'F', 'Otro']
const CATEGORY_ORDER = ['Rx', 'Scaled', 'Masters', 'Teens', 'Otro', 'Sin categoria']

function orderCategories(data) {
  const keys = Object.keys(data || {})
  return CATEGORY_ORDER.filter(c => keys.includes(c)).concat(keys.filter(c => !CATEGORY_ORDER.includes(c)))
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

function parseEnrollmentPaymentMethods(raw) {
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item, idx) => ({
        id: String(item?.id || `pm_${idx + 1}`),
        label: String(item?.label || '').trim(),
        account_name: String(item?.account_name || '').trim(),
        account_number: String(item?.account_number || '').trim(),
        notes: String(item?.notes || '').trim(),
      }))
      .filter(item => item.label || item.account_name || item.account_number || item.notes)
  } catch {
    return []
  }
}

function toLocalDateTimeInput(value) {
  return value ? String(value).slice(0, 16) : ''
}

function toDateInput(value) {
  return value ? String(value).slice(0, 10) : ''
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

const COMPETITION_ASSET_RECOMMENDATIONS = {
  profile: 'Recomendado 512 x 512 px. Formato cuadrado.',
  banner: 'Recomendado 1920 x 1080 px. Banner horizontal.',
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

function getCompetitionVisibilitySummary(comp) {
  const items = []
  if (comp?.show_individual_leaderboard) items.push({ label: 'Individual visible', tone: 'teal' })
  if (comp?.show_team_all_by_category_option) items.push({ label: 'Equipos por categoria', tone: 'orange' })
  if (comp?.show_team_all_global_option) items.push({ label: 'Equipos globales', tone: 'slate' })
  if (!items.length) items.push({ label: 'Sin vistas publicas', tone: 'muted' })
  return items
}

function getPhaseModeSummary(phase) {
  const activityCount = Array.isArray(phase?.activities) && phase.activities.length ? phase.activities.length : 1
  const formatLabel = activityCount === 1 ? '1 actividad' : `${activityCount} actividades`
  const measurement = PHASE_MEASUREMENT_LABELS[normalizeMeasurementMethod(phase?.measurement_method, phase?.tipo)] || normalizeMeasurementMethod(phase?.measurement_method, phase?.tipo)
  const winner = normalizeWinnerRule(phase?.winner_rule, phaseTypeFromPhase(phase)) === 'lower_wins' ? 'Gana menor' : 'Gana mayor'
  const teamMode = (phase?.team_result_mode || 'sum_two') === 'single_member'
    ? 'Equipo: uno'
    : (phase?.team_result_mode || 'sum_two') === 'total'
      ? 'Equipo: total'
      : 'Equipo: ambos'
  const resultCount = Number(phase?.allow_multiple_results) ? 'Multiples' : 'Unico'
  const status = phase?.estado || 'pendiente'
  return [formatLabel, measurement, winner, teamMode, resultCount, status]
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

// ── Generic small modal ───────────────────────────────────────────────────────
function Modal({ title, onClose, width = 480, children, panelStyle = null, titleStyle = null, closeButtonStyle = null }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0006', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 'calc(20px + env(safe-area-inset-top, 0px)) 12px calc(20px + env(safe-area-inset-bottom, 0px))' }}>
      <div style={{ background: '#171B21', border: '1px solid #252A33', borderRadius: 18, padding: 24, width: '100%', maxWidth: width, maxHeight: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', color: 'var(--oa-text)', boxShadow: '0 24px 80px rgba(0,0,0,0.35)', ...panelStyle }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, paddingRight: 8, color: 'var(--oa-text)', ...titleStyle }}>{title}</h3>
          <button style={{ background: 'transparent', border: '1px solid #252A33', borderRadius: 10, color: 'var(--oa-text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, ...closeButtonStyle }} onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Categories Modal ──────────────────────────────────────────────────────────
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

// ── Phases Modal ──────────────────────────────────────────────────────────────
const PHASE_TIPOS = ['posicion', 'cantidad', 'tiempo']
const PHASE_MEASUREMENT_METHODS = ['unidades', 'metros', 'tiempo_hms', 'repeticiones', 'kilogramos', 'gramos', 'libras', 'posicion']
const PHASE_MEASUREMENT_LABELS = {
  unidades: 'Unidades',
  metros: 'Metros (m)',
  tiempo_hms: 'Tiempo (HH:MM:SS)',
  repeticiones: 'Repeticiones',
  kilogramos: 'Kilogramos (kg)',
  gramos: 'Gramos (g)',
  libras: 'Libras (lb)',
  posicion: 'Posicion',
}
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
  if (t === 'tiempo') return 'tiempo_hms'
  if (t === 'posicion') return 'posicion'
  return 'unidades'
}

function normalizeMeasurementMethod(raw, tipo) {
  const value = (raw || '').toString().trim().toLowerCase()
  if (PHASE_MEASUREMENT_METHODS.includes(value)) return value
  if (value === 'kg') return 'kilogramos'
  if (value === 'g') return 'gramos'
  if (value === 'lb' || value === 'lbs') return 'libras'
  if (value === 'hms' || value === 'hh:mm:ss') return 'tiempo_hms'
  if (value === 'reps' || value === 'rep') return 'repeticiones'
  if (value === 'metro') return 'metros'
  return defaultMeasurementMethodForType(tipo)
}

function isTimeMeasurement(method) {
  return normalizeMeasurementMethod(method) === 'tiempo_hms'
}

function phaseTypeFromMethod(method) {
  const m = normalizeMeasurementMethod(method)
  if (m === 'tiempo_hms') return 'tiempo'
  if (m === 'posicion') return 'posicion'
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
    measurement_method: 'unidades',
    winner_rule: 'higher_wins',
    points_mode: 'manual',
  }
}

function normalizePhaseActivities(raw, phaseFallback = null) {
  const source = Array.isArray(raw) && raw.length
    ? raw
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
    allow_multiple_results: 0,
    team_result_mode: 'sum_two',
    estado: 'pendiente',
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
    start_at: toDateInput(phase.start_at),
    end_at: toDateInput(phase.end_at),
    activities: normalizePhaseActivities(phase.activities, phase),
  }
}

function buildPhasePayload(values, orden = 0) {
  const activities = normalizePhaseActivities(values.activities).map((activity, index) => {
    const method = normalizeMeasurementMethod(activity.measurement_method, phaseTypeFromMethod(activity.measurement_method))
    return {
      nombre: String(activity.nombre || `Actividad ${index + 1}`) || `Actividad ${index + 1}`,
      descripcion: String(activity.descripcion || '') || null,
      measurement_method: method,
      tipo: phaseTypeFromMethod(method),
      winner_rule: normalizeWinnerRule(activity.winner_rule, phaseTypeFromMethod(method)),
      points_mode: activity.points_mode || 'manual',
      orden: index,
    }
  })
  const primary = activities[0] || {
    measurement_method: 'unidades',
    tipo: 'cantidad',
    winner_rule: 'higher_wins',
    points_mode: 'manual',
  }
  const payload = {
    nombre: String(values.nombre || '').trim(),
    phase_format: activities.length > 1 ? 'wod' : 'activity',
    descripcion: String(values.descripcion || '').trim() || null,
    allow_multiple_results: Number(values.allow_multiple_results || 0),
    team_result_mode: values.team_result_mode || 'sum_two',
    estado: values.estado || 'pendiente',
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
  const [rulesModalOpen, setRulesModalOpen] = useState(false)
  const [rulesPhaseId, setRulesPhaseId] = useState('')
  const [rulesDraft, setRulesDraft] = useState([])

  const load = async () => {
    const r = await api.get(`/competitions/${competition.id}/phases`)
    const items = r.data || []
    setPhases(items)
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

  const add = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) return
    await api.post(`/competitions/${competition.id}/phases`, buildPhasePayload(form, phases.length))
    setForm(createPhaseFormState())
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
      await api.put(`/competitions/${competition.id}/phases/${phase.id}`, buildPhasePayload({
        ...createPhaseDraftState(phase),
        ...d,
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
  const wizardSteps = [
    { id: 'overview', label: 'Resumen' },
    { id: 'settings', label: 'Ajustes' },
    { id: 'activities', label: 'Actividades' },
    { id: 'review', label: 'Revision' },
  ]
  const canAdvanceCreateStep = [
    form.nombre.trim().length > 0,
    !form.start_at || !form.end_at || form.start_at <= form.end_at,
    createActivities.length > 0 && createActivities.every(activity => String(activity.nombre || '').trim() || String(activity.descripcion || '').trim()),
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
        Crea cada fase paso a paso. Una fase puede tener una sola actividad o varios bloques dentro del mismo WOD.
      </div>
      <form onSubmit={add} style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
        <div style={{ borderRadius: 18, border: '1px solid #252A33', background: 'linear-gradient(180deg, rgba(23,27,33,0.98), rgba(13,15,18,0.92))', padding: isMobile ? 14 : 18, display: 'grid', gap: 14, boxShadow: '0 20px 50px rgba(0,0,0,0.22)' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: '#00C2A8', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.9 }}>Wizard de fase</div>
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
                    border: index === createStep ? '1px solid rgba(255,107,0,0.45)' : '1px solid #252A33',
                    background: index === createStep ? 'rgba(255,107,0,0.14)' : 'rgba(13,15,18,0.72)',
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

          {createStep === 0 && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Nombre *</label>
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: WOD 1, Sprint, Evento final" required />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Descripcion</label>
                <textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="Resumen visible de la fase" rows={4} style={{ resize: 'vertical' }} />
              </div>
            </div>
          )}

          {createStep === 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Resultados</label>
                <select value={form.allow_multiple_results} onChange={e => setForm({ ...form, allow_multiple_results: Number(e.target.value) })}>
                  <option value={0}>Uno por participante</option>
                  <option value={1}>Multiples por participante</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Puntaje equipo</label>
                <select value={form.team_result_mode} onChange={e => setForm({ ...form, team_result_mode: e.target.value })}>
                  <option value="sum_two">Suma de ambos</option>
                  <option value="total">Total de equipo</option>
                  <option value="single_member">Solo uno</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Estado</label>
                <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
                  {PHASE_ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Fecha inicial</label>
                <input type="date" value={form.start_at || ''} onChange={e => setForm(prev => ({ ...prev, start_at: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Fecha final</label>
                <input type="date" value={form.end_at || ''} onChange={e => setForm(prev => ({ ...prev, end_at: e.target.value }))} />
              </div>
              {form.start_at && form.end_at && form.start_at > form.end_at ? (
                <div style={{ gridColumn: '1 / -1', color: '#F59E0B', fontSize: 12 }}>
                  La fecha final no puede quedar antes de la inicial.
                </div>
              ) : null}
            </div>
          )}

          {createStep === 2 && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#00C2A8', textTransform: 'uppercase', letterSpacing: 0.8 }}>Actividades de la fase</div>
                  <div style={{ fontSize: 12, color: '#AAB2C0', marginTop: 4 }}>Usa una actividad para una prueba simple o varias para un WOD por bloques.</div>
                </div>
                <button type="button" className="btn-secondary btn-sm" onClick={appendFormActivity}>+ Actividad</button>
              </div>
              {createActivities.map((activity, activityIndex, activityList) => (
                <div key={`new-phase-activity-${activityIndex}`} style={{ display: 'grid', gap: 8, borderRadius: 12, border: '1px solid #252A33', background: '#171B21', padding: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.18)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#F5F7FA' }}>Actividad {activityIndex + 1}</div>
                    <button type="button" className="btn-danger btn-sm" onClick={() => removeFormActivity(activityIndex)} disabled={activityList.length <= 1}>Eliminar</button>
                  </div>
                  <input value={activity.nombre} onChange={e => patchFormActivity(activityIndex, 'nombre', e.target.value)} placeholder={`Nombre interno o visible de la actividad ${activityIndex + 1}`} />
                  <textarea value={activity.descripcion} onChange={e => patchFormActivity(activityIndex, 'descripcion', e.target.value)} placeholder="Describe el bloque con saltos de linea si hace falta" rows={4} style={{ resize: 'vertical' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 8 }}>
                    <select value={activity.measurement_method} onChange={e => patchFormActivity(activityIndex, 'measurement_method', e.target.value)}>
                      {PHASE_MEASUREMENT_METHODS.map(m => <option key={`new-phase-activity-method-${activityIndex}-${m}`} value={m}>{PHASE_MEASUREMENT_LABELS[m] || m}</option>)}
                    </select>
                    <select value={activity.winner_rule} onChange={e => patchFormActivity(activityIndex, 'winner_rule', e.target.value)}>
                      <option value="higher_wins">Mayor valor</option>
                      <option value="lower_wins">Menor valor</option>
                    </select>
                    <select value={activity.points_mode || 'manual'} onChange={e => patchFormActivity(activityIndex, 'points_mode', e.target.value)}>
                      <option value="manual">Puntaje manual</option>
                      <option value="position_direct">Por posicion directa</option>
                      <option value="position_rules">Por reglas</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}

          {createStep === 3 && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.72)', padding: 14, display: 'grid', gap: 10 }}>
                <div style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 800 }}>{form.nombre || 'Nueva fase'}</div>
                {form.descripcion ? <div style={{ color: '#AAB2C0', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{form.descripcion}</div> : null}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(0,194,168,0.12)', border: '1px solid rgba(0,194,168,0.22)', color: '#D9FFFA', fontSize: 12, fontWeight: 700 }}>{`${createActivities.length} ${createActivities.length === 1 ? 'actividad' : 'actividades'}`}</span>
                  <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(255,107,0,0.12)', border: '1px solid rgba(255,107,0,0.22)', color: '#FFD0AE', fontSize: 12, fontWeight: 700 }}>{form.estado || 'pendiente'}</span>
                </div>
                <div style={{ color: '#AAB2C0', fontSize: 13, lineHeight: 1.6 }}>
                  {form.start_at || form.end_at ? `Fechas: ${form.start_at || 'sin inicio'} a ${form.end_at || 'sin cierre'}` : 'Fechas: por definir'}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {createActivities.map((activity, index) => (
                  <div key={`create-review-${index}`} style={{ borderRadius: 12, border: '1px solid #252A33', background: '#171B21', padding: 12 }}>
                    <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 800 }}>{activity.nombre || `Actividad ${index + 1}`}</div>
                    {activity.descripcion ? <div style={{ marginTop: 4, color: '#AAB2C0', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{activity.descripcion}</div> : null}
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ color: '#D9FFFA', fontSize: 12 }}>{PHASE_MEASUREMENT_LABELS[activity.measurement_method] || activity.measurement_method}</span>
                      <span style={{ color: '#AAB2C0', fontSize: 12 }}>{activity.winner_rule === 'lower_wins' ? 'Gana menor' : 'Gana mayor'}</span>
                      <span style={{ color: '#AAB2C0', fontSize: 12 }}>{activity.points_mode || 'manual'}</span>
                    </div>
                  </div>
                ))}
              </div>
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
                <button type="submit" className="btn-primary btn-sm" disabled={!canAdvanceCreateStep.slice(0, 3).every(Boolean)}>
                  + Agregar fase
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {phases.length === 0 && <p style={{ color: '#647063', textAlign: 'center', padding: 20 }}>Sin fases definidas</p>}
        {phases.map((ph, i) => (
          <div key={ph.id} style={{ display: 'grid', gap: 10, padding: 14, borderRadius: 16, border: '1px solid #252A33', background: 'linear-gradient(180deg, rgba(23,27,33,0.98), rgba(13,15,18,0.92))', marginBottom: 10, boxShadow: '0 18px 40px rgba(0,0,0,0.22)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ color: '#AAB2C0', fontSize: 12, fontWeight: 700 }}>{`Fase ${i + 1}`}</span>
              <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(0,194,168,0.12)', border: '1px solid rgba(0,194,168,0.22)', color: '#D9FFFA', fontSize: 11, fontWeight: 800 }}>
                {normalizePhaseActivities(phaseDrafts[ph.id]?.activities, ph).length === 1 ? '1 actividad' : `${normalizePhaseActivities(phaseDrafts[ph.id]?.activities, ph).length} actividades`}
              </span>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Nombre</label>
              <input
                value={phaseDrafts[ph.id]?.nombre ?? ph.nombre}
                onChange={e => patchPhaseDraft(ph.id, 'nombre', e.target.value)}
              />
            </div>
            <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Resultados</label>
                <select
                  value={Number(phaseDrafts[ph.id]?.allow_multiple_results ?? ph.allow_multiple_results ?? 0)}
                  onChange={e => patchPhaseDraft(ph.id, 'allow_multiple_results', Number(e.target.value))}
                >
                  <option value={0}>Unico</option>
                  <option value={1}>Multiples</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Puntaje equipo</label>
                <select
                  value={phaseDrafts[ph.id]?.team_result_mode ?? (ph.team_result_mode || 'sum_two')}
                  onChange={e => patchPhaseDraft(ph.id, 'team_result_mode', e.target.value)}
                >
                  <option value="sum_two">Suma de ambos</option>
                  <option value="total">Total de equipo</option>
                  <option value="single_member">Solo uno</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Estado</label>
                <select
                  value={phaseDrafts[ph.id]?.estado ?? (ph.estado || 'pendiente')}
                  onChange={e => patchPhaseDraft(ph.id, 'estado', e.target.value)}
                >
                  {PHASE_ESTADOS.map(s => <option key={`phase-state-${ph.id}-${s}`} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Fecha inicial</label>
                <input
                  type="date"
                  value={phaseDrafts[ph.id]?.start_at ?? toDateInput(ph.start_at)}
                  onChange={e => patchPhaseDraft(ph.id, 'start_at', e.target.value)}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Fecha final</label>
                <input
                  type="date"
                  value={phaseDrafts[ph.id]?.end_at ?? toDateInput(ph.end_at)}
                  onChange={e => patchPhaseDraft(ph.id, 'end_at', e.target.value)}
                />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Descripcion</label>
              <textarea
                value={phaseDrafts[ph.id]?.descripcion ?? (ph.descripcion || '')}
                onChange={e => patchPhaseDraft(ph.id, 'descripcion', e.target.value)}
                rows={4}
                style={{ resize: 'vertical' }}
              />
            </div>
            <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.72)', padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#00C2A8', textTransform: 'uppercase', letterSpacing: 0.8 }}>Actividades de la fase</div>
                  <div style={{ fontSize: 12, color: '#AAB2C0', marginTop: 4 }}>La primera actividad define la medicion principal de la fase.</div>
                </div>
                <button type="button" className="btn-secondary btn-sm" onClick={() => appendDraftActivity(ph.id)}>+ Actividad</button>
              </div>
              {normalizePhaseActivities(phaseDrafts[ph.id]?.activities, ph).map((activity, activityIndex, activityList) => (
                <div key={`phase-${ph.id}-activity-${activityIndex}`} style={{ display: 'grid', gap: 8, borderRadius: 12, border: '1px solid #252A33', background: '#171B21', padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#F5F7FA' }}>{`Actividad ${activityIndex + 1}`}</div>
                    <button type="button" className="btn-danger btn-sm" onClick={() => removeDraftActivity(ph.id, activityIndex)} disabled={activityList.length <= 1}>Eliminar</button>
                  </div>
                  <input value={activity.nombre} onChange={e => patchDraftActivity(ph.id, activityIndex, 'nombre', e.target.value)} placeholder="Nombre de actividad" />
                  <textarea value={activity.descripcion} onChange={e => patchDraftActivity(ph.id, activityIndex, 'descripcion', e.target.value)} placeholder="Describe el bloque o esfuerzo" rows={4} style={{ resize: 'vertical' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 8 }}>
                    <select value={activity.measurement_method} onChange={e => patchDraftActivity(ph.id, activityIndex, 'measurement_method', e.target.value)}>
                      {PHASE_MEASUREMENT_METHODS.map(m => <option key={`phase-${ph.id}-activity-method-${activityIndex}-${m}`} value={m}>{PHASE_MEASUREMENT_LABELS[m] || m}</option>)}
                    </select>
                    <select value={activity.winner_rule} onChange={e => patchDraftActivity(ph.id, activityIndex, 'winner_rule', e.target.value)}>
                      <option value="higher_wins">Mayor valor</option>
                      <option value="lower_wins">Menor valor</option>
                    </select>
                    <select value={activity.points_mode || 'manual'} onChange={e => patchDraftActivity(ph.id, activityIndex, 'points_mode', e.target.value)}>
                      <option value="manual">Puntaje manual</option>
                      <option value="position_direct">Por posicion directa</option>
                      <option value="position_rules">Por reglas</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn-primary btn-sm" onClick={() => savePhase(ph)} disabled={savingPhaseId === ph.id}>
                {savingPhaseId === ph.id ? 'Guardando...' : 'Guardar fase'}
              </button>
              <button type="button" className="btn-danger btn-sm" onClick={() => remove(ph.id)}>Eliminar</button>
              <span style={{ fontSize: 11, color: '#647063', alignSelf: 'center' }}>
                {`Actual: ${normalizePhaseActivities(ph.activities, ph).length === 1 ? '1 actividad' : `${normalizePhaseActivities(ph.activities, ph).length} actividades`} | ${phaseTypeFromPhase(ph)} | ${PHASE_MEASUREMENT_LABELS[normalizeMeasurementMethod(ph.measurement_method, ph.tipo)] || normalizeMeasurementMethod(ph.measurement_method, ph.tipo)} | ${normalizeWinnerRule(ph.winner_rule, phaseTypeFromPhase(ph)) === 'lower_wins' ? 'gana menor' : 'gana mayor'} | ${Number(ph.allow_multiple_results) ? 'multiples' : 'unico'} | ${(ph.team_result_mode || 'sum_two') === 'single_member' ? 'equipo uno' : ((ph.team_result_mode || 'sum_two') === 'total' ? 'equipo total' : 'equipo ambos')} | ${ph.estado || 'pendiente'}${parseScoringRules(ph.scoring_rules).length ? ` | reglas: ${parseScoringRules(ph.scoring_rules).length}` : ''}`}
              </span>
            </div>
          </div>
        ))}
      </div>
      {rulesModalOpen && (
        <Modal title="Puntaje por posicion" onClose={() => setRulesModalOpen(false)} width={620}>
          <div style={{ fontSize: 12, color: '#647063', marginBottom: 8 }}>
            Define rangos de posiciones y puntos para esta fase.
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

  if (inline) {
    return (
      <div className="card">
        <h4 style={{ marginBottom: 12, fontSize: 15 }}>Bloques y fases</h4>
        {phaseManagerContent}
      </div>
    )
  }

  return (
    <Modal title={`Fases - ${competition.nombre}`} onClose={onClose} width={540}>
      {phaseManagerContent}
    </Modal>
  )
}

// ── Enrollment Dates Modal ────────────────────────────────────────────────────
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', marginBottom: 14, border: '1px solid #252A33', borderRadius: 14, background: form.enrollment_open ? 'linear-gradient(135deg, rgba(255,107,0,0.14), rgba(255,154,61,0.04))' : 'rgba(13,15,18,0.72)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--oa-text)' }}>Inscripciones habilitadas</div>
            <div style={{ fontSize: 12, color: 'var(--oa-text-secondary)', marginTop: 4 }}>Controla si esta competencia acepta nuevas solicitudes.</div>
          </div>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, enrollment_open: f.enrollment_open ? 0 : 1 }))}
            style={{
              width: 50,
              height: 30,
              borderRadius: 999,
              border: `1px solid ${form.enrollment_open ? 'rgba(255,154,61,0.95)' : '#313844'}`,
              background: form.enrollment_open ? 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)' : '#252A33',
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

// ── Enrollment Modal ──────────────────────────────────────────────────────────
function EnrollmentModal({ competition, onClose, onSaved }) {
  const { role } = useAuth()
  const isOrganizer = role === 'organizer'
  const [modalTab, setModalTab] = useState('pendientes')
  const [previewImage, setPreviewImage] = useState(null)
  const [viewedParticipant, setViewedParticipant] = useState(null)
  const [allParticipants, setAllParticipants] = useState([])
  const [competitionParticipants, setCompetitionParticipants] = useState([])
  const [categories, setCategories] = useState([])
  const [enrollMap, setEnrollMap] = useState({})   // confirmed: pid -> { selected, categoria }
  const [pendingList, setPendingList] = useState([])
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const load = () => {
    const requests = [
      api.get(`/competitions/${competition.id}/participants`),
      api.get(`/competitions/${competition.id}/categories`),
    ]
    if (!isOrganizer) requests.unshift(api.get('/participants'))
    return Promise.all(requests).then((responses) => {
      const pRes = isOrganizer ? { data: [] } : responses[0]
      const eRes = isOrganizer ? responses[0] : responses[1]
      const cRes = isOrganizer ? responses[1] : responses[2]
      setAllParticipants(pRes.data || [])
      setCompetitionParticipants(eRes.data || [])
      setCategories(cRes.data || [])
      const enrolled = eRes.data || []
      const pending = enrolled.filter(e => e.estado === 'pendiente')
      const confirmed = enrolled.filter(e => e.estado === 'confirmado')
      setPendingList(pending)
      const map = {}
      confirmed.forEach(e => { map[e.id] = { selected: true, categoria: e.categoria_competencia || '' } })
      setEnrollMap(map)
      setModalTab(pending.length > 0 ? 'pendientes' : (confirmed.length > 0 ? 'confirmados' : 'rechazados'))
      setViewedParticipant(null)
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

  const approveOrReject = async (pid, estado) => {
    await api.put(`/competitions/${competition.id}/participants/${pid}/status`, { estado })
    onSaved()
    load()
  }

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
      .map(([pid, v]) => ({ participant_id: Number(pid), categoria: v.categoria || null }))
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

  const pendingIds = new Set(pendingList.map(p => p.id))
  const filtered = allParticipants
    .filter(p => !pendingIds.has(p.id))
    .filter(p => `${p.nombre} ${p.apellido} ${p.cedula}`.toLowerCase().includes(search.toLowerCase()))
  const confirmedList = useMemo(
    () => competitionParticipants.filter(p => p.estado === 'confirmado'),
    [competitionParticipants]
  )
  const rejectedList = useMemo(
    () => competitionParticipants.filter(p => p.estado === 'rechazado'),
    [competitionParticipants]
  )
  const selectedCount = Object.values(enrollMap).filter(v => v.selected).length
  const currentOrganizerList = modalTab === 'pendientes'
    ? pendingList
    : modalTab === 'rechazados'
      ? rejectedList
      : confirmedList

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
          <div><b style={{ color: 'var(--oa-text)' }}>Cedula:</b> {viewedParticipant.cedula || '-'}</div>
          <div><b style={{ color: 'var(--oa-text)' }}>Categoria:</b> {viewedParticipant.categoria_competencia || '-'}</div>
          <div><b style={{ color: 'var(--oa-text)' }}>Estado:</b> {viewedParticipant.estado || '-'}</div>
        </div>
        <EnrollmentAnswersBlock raw={viewedParticipant.enrollment_answers} onPreviewImage={setPreviewImage} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        {viewedParticipant.estado !== 'confirmado' && (
          <button className="btn-success" onClick={async () => {
            await approveOrReject(viewedParticipant.id, 'confirmado')
            setModalTab('confirmados')
            setViewedParticipant(null)
          }}>
            Confirmar
          </button>
        )}
        {viewedParticipant.estado !== 'rechazado' && (
          <button className="btn-danger" onClick={async () => {
            await approveOrReject(viewedParticipant.id, 'rechazado')
            setModalTab('rechazados')
            setViewedParticipant(null)
          }}>
            Rechazar
          </button>
        )}
      </div>
    </div>
  )

  const organizerListView = (
    <div style={{ overflowY: 'auto', flex: 1, display: 'grid', gap: 10 }}>
      {!currentOrganizerList.length && (
        <div style={{ color: 'var(--oa-text-secondary)', textAlign: 'center', padding: 40 }}>
          {modalTab === 'pendientes'
            ? 'No hay solicitudes pendientes'
            : modalTab === 'rechazados'
              ? 'No hay rechazados'
              : 'No hay inscritos'}
        </div>
      )}
      {currentOrganizerList.map((p) => (
        <div key={p.id} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 14px',
          borderRadius: 12,
          border: modalTab === 'pendientes'
            ? '1px solid rgba(255,107,0,0.26)'
            : modalTab === 'rechazados'
              ? '1px solid rgba(239,68,68,0.26)'
              : '1px solid #252A33',
          background: modalTab === 'pendientes'
            ? 'linear-gradient(135deg, rgba(255,107,0,0.12), rgba(255,154,61,0.04))'
            : modalTab === 'rechazados'
              ? 'linear-gradient(135deg, rgba(239,68,68,0.10), rgba(127,29,29,0.04))'
              : 'rgba(13,15,18,0.72)',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--oa-text)' }}>{p.nombre} {p.apellido}</div>
            <div style={{ fontSize: 12, color: 'var(--oa-text-secondary)', marginTop: 4 }}>
              Categoria: <b style={{ color: 'var(--oa-text)' }}>{p.categoria_competencia || '-'}</b>
            </div>
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setViewedParticipant(p)}>Ver</button>
        </div>
      ))}
    </div>
  )

  return (
    <Modal title={`Inscripciones - ${competition.nombre}`} onClose={onClose} width={640}>
      {previewImage && <ImagePreviewModal item={previewImage} onClose={() => setPreviewImage(null)} />}
      <div className="tabs" style={{ margin: '0 0 14px', border: 'none', gap: 4 }}>
        <button className={`tab ${modalTab === 'pendientes' ? 'active' : ''}`} onClick={() => { setModalTab('pendientes'); setViewedParticipant(null) }} style={{ padding: '4px 14px', fontSize: 13, position: 'relative' }}>
          Solicitudes
          {pendingList.length > 0 && (
            <span style={{ background: '#284017', color: '#fff', borderRadius: 10, padding: '0 6px', fontSize: 10, fontWeight: 700, marginLeft: 6 }}>
              {pendingList.length}
            </span>
          )}
        </button>
        {isOrganizer ? (
          <>
            <button className={`tab ${modalTab === 'confirmados' ? 'active' : ''}`} onClick={() => { setModalTab('confirmados'); setViewedParticipant(null) }} style={{ padding: '4px 14px', fontSize: 13 }}>
              Inscritos
            </button>
            <button className={`tab ${modalTab === 'rechazados' ? 'active' : ''}`} onClick={() => { setModalTab('rechazados'); setViewedParticipant(null) }} style={{ padding: '4px 14px', fontSize: 13 }}>
              Rechazados
            </button>
          </>
        ) : (
          <button className={`tab ${modalTab === 'gestion' ? 'active' : ''}`} onClick={() => { setModalTab('gestion'); setViewedParticipant(null) }} style={{ padding: '4px 14px', fontSize: 13 }}>
            Gestionar inscritos
          </button>
        )}
      </div>

      {modalTab === 'pendientes' && (
        isOrganizer ? organizerDetailView || organizerListView : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {pendingList.length === 0 ? (
              <p style={{ color: 'var(--oa-text-secondary)', textAlign: 'center', padding: 40 }}>No hay solicitudes pendientes</p>
            ) : (
              pendingList.map(p => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12,
                  border: '1px solid rgba(255,107,0,0.26)', background: 'linear-gradient(135deg, rgba(255,107,0,0.12), rgba(255,154,61,0.04))', marginBottom: 10
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--oa-text)' }}>{p.nombre} {p.apellido}</div>
                    <div style={{ fontSize: 12, color: 'var(--oa-text-secondary)', marginTop: 2 }}>
                      {p.cedula}
                      {p.categoria_competencia && <span style={{ marginLeft: 8 }}>| Categoria: <b style={{ color: 'var(--oa-text)' }}>{p.categoria_competencia}</b></span>}
                    </div>
                    <EnrollmentAnswersBlock raw={p.enrollment_answers} compact onPreviewImage={setPreviewImage} />
                  </div>
                  <button className="btn-success btn-sm" onClick={() => approveOrReject(p.id, 'confirmado')}>Confirmar</button>
                  <button className="btn-danger btn-sm" onClick={() => approveOrReject(p.id, 'rechazado')}>Rechazar</button>
                </div>
              ))
            )}
          </div>
        )
      )}

      {((isOrganizer && (modalTab === 'confirmados' || modalTab === 'rechazados')) || (!isOrganizer && modalTab === 'gestion')) && (
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
                      border: `1px solid ${enrolled ? 'rgba(0,194,168,0.35)' : '#252A33'}`,
                      background: enrolled ? 'rgba(0,194,168,0.08)' : 'rgba(13,15,18,0.72)',
                    }}>
                      <input type="checkbox" checked={!!enrolled} onChange={() => toggle(p.id)} style={{ width: 'auto', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--oa-text)' }}>{p.nombre} {p.apellido}</div>
                        <div style={{ fontSize: 11, color: 'var(--oa-text-secondary)' }}>{p.cedula}</div>
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

// ── Competitions Tab ──────────────────────────────────────────────────────────
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
    website_url: '',
    imagen_url: '',
    activa: 0,
    individual_enabled: 1,
    team_enabled: 0,
    team_categories_enabled: 1,
    team_size: 2,
    team_membership_rule: 'free',
    allow_user_results: 0,
    show_individual_leaderboard: 1,
    show_team_all_by_category_option: 1,
    show_team_all_global_option: 1,
    enrollment_open: 0,
    enrollment_start: '',
    enrollment_end: '',
    competition_start: '',
    competition_end: '',
    enrollment_intro_text: '',
    enrollment_terms_text: '',
    require_payment_receipt: 0,
    scoring_mode: 'highest_wins',
  })
  const [cats, setCats] = useState([])
  const [newCat, setNewCat] = useState({ nombre: '', descripcion: '', modality: 'individual' })
  const [phases, setPhases] = useState([])
  const [newPhase, setNewPhase] = useState({ nombre: '', block_name: '', modality: 'individual', measurement_method: 'unidades', descripcion: '', team_result_mode: 'sum_two', start_at: '', end_at: '' })
  const [questions, setQuestions] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [scheduleItems, setScheduleItems] = useState([])
  const [socialLinks, setSocialLinks] = useState([])
  const [assetFiles, setAssetFiles] = useState({ profile: null, banner: null })
  const [assetPreviews, setAssetPreviews] = useState({ profile: '', banner: '' })
  const [uploadingAssets, setUploadingAssets] = useState(false)
  const [deletingAssetKey, setDeletingAssetKey] = useState('')

  useEffect(() => {
    if (!isEdit || !competition) return
    setForm({
      nombre: competition.nombre || '',
      descripcion: competition.descripcion || '',
      general_info_text: competition.general_info_text || '',
      lugar: competition.lugar || '',
      contact_phone: competition.contact_phone || '',
      website_url: competition.website_url || '',
      imagen_url: competition.imagen_url || '',
      activa: competition.activa || 0,
      individual_enabled: competition.individual_enabled == null ? 1 : competition.individual_enabled,
      team_enabled: competition.team_enabled || 0,
      team_categories_enabled: competition.team_categories_enabled == null ? 1 : competition.team_categories_enabled,
      team_size: Math.max(1, Number(competition.team_size || 2)),
      team_membership_rule: competition.team_membership_rule || 'free',
      allow_user_results: competition.allow_user_results || 0,
      show_individual_leaderboard: competition.show_individual_leaderboard == null ? 1 : competition.show_individual_leaderboard,
      show_team_all_by_category_option: competition.show_team_all_by_category_option == null ? 1 : competition.show_team_all_by_category_option,
      show_team_all_global_option: competition.show_team_all_global_option == null ? 1 : competition.show_team_all_global_option,
      enrollment_open: competition.enrollment_open || 0,
      enrollment_start: toDateInput(competition.enrollment_start),
      enrollment_end: toDateInput(competition.enrollment_end),
      competition_start: toDateInput(competition.competition_start),
      competition_end: toDateInput(competition.competition_end),
      enrollment_intro_text: competition.enrollment_intro_text || '',
      enrollment_terms_text: competition.enrollment_terms_text || '',
      require_payment_receipt: competition.require_payment_receipt || 0,
      scoring_mode: competition.scoring_mode || 'highest_wins',
    })
    setQuestions(parseEnrollmentQuestions(competition.enrollment_questions))
    setPaymentMethods(parseEnrollmentPaymentMethods(competition.enrollment_payment_methods))
    setScheduleItems(parseScheduleItems(competition.schedule_items))
    setSocialLinks(parseSocialLinks(competition.social_links))
    setAssetFiles({ profile: null, banner: null })
    setAssetPreviews({ profile: '', banner: '' })
    Promise.all([
      api.get(`/competitions/${competition.id}/categories`),
      api.get(`/competitions/${competition.id}/phases`),
    ]).then(([catRes, phRes]) => {
      setCats(catRes.data.map(c => ({
        id: c.id,
        nombre: c.nombre,
        descripcion: c.descripcion || '',
        modality: c.modality || 'individual',
      })))
      setPhases(phRes.data.map(p => ({
        id: p.id,
        modality: p.modality || 'individual',
        block_name: p.block_name || '',
        block_order: Number(p.block_order || 0),
        nombre: p.nombre,
        measurement_method: normalizeMeasurementMethod(p.measurement_method, p.tipo),
        tipo: phaseTypeFromMethod(normalizeMeasurementMethod(p.measurement_method, p.tipo)),
        descripcion: p.descripcion || '',
        team_result_mode: p.team_result_mode || 'sum_two',
        start_at: toDateInput(p.start_at),
        end_at: toDateInput(p.end_at),
      })))
    }).catch(() => {
      setMsg({ type: 'error', text: 'No se pudo cargar la configuracion actual' })
    })
  }, [isEdit, competition])
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const addCategory = () => {
    const nombre = newCat.nombre.trim()
    const descripcion = (newCat.descripcion || '').trim()
    if (!nombre) return
    setCats(prev => [...prev, { id: `new-cat-${Date.now()}`, nombre, descripcion, modality: newCat.modality || 'individual' }])
    setNewCat({ nombre: '', descripcion: '', modality: newCat.modality || 'individual' })
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

  const addPhase = () => {
    const nombre = newPhase.nombre.trim()
    if (!nombre) return
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
      start_at: newPhase.start_at || '',
      end_at: newPhase.end_at || '',
    }])
    setNewPhase(prev => ({ ...prev, nombre: '', block_name: prev.block_name || '', measurement_method: 'unidades', descripcion: '', team_result_mode: 'sum_two', start_at: '', end_at: '' }))
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
        nombre: String(c.nombre || '').trim(),
        descripcion: String(c.descripcion || '').trim(),
        modality: c.modality === 'teams' ? 'teams' : 'individual',
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
      show_team_all_by_category_option: form.show_team_all_by_category_option ? 1 : 0,
      show_team_all_global_option: form.show_team_all_global_option ? 1 : 0,
      enrollment_open: form.enrollment_open ? 1 : 0,
      enrollment_start: dateInputToStartOfDay(form.enrollment_start),
      enrollment_end: dateInputToEndOfDay(form.enrollment_end),
      competition_start: dateInputToStartOfDay(form.competition_start),
      competition_end: dateInputToEndOfDay(form.competition_end),
      schedule_items: cleanScheduleItems,
      enrollment_intro_text: form.enrollment_intro_text.trim() || null,
      enrollment_terms_text: form.enrollment_terms_text.trim() || null,
      require_payment_receipt: form.require_payment_receipt ? 1 : 0,
      enrollment_payment_methods: paymentMethods
        .map((method, idx) => ({
          id: String(method.id || `pm_${idx + 1}`),
          label: String(method.label || '').trim(),
          account_name: String(method.account_name || '').trim() || null,
          account_number: String(method.account_number || '').trim() || null,
          notes: String(method.notes || '').trim() || null,
        }))
        .filter(method => method.label || method.account_name || method.account_number || method.notes),
      enrollment_questions: questions
        .map((question, idx) => ({
          id: String(question.id || `q_${idx + 1}`),
          label: String(question.label || '').trim(),
          field_type: question.field_type === 'image' ? 'image' : 'text',
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
        await Promise.all(existingCats.map(c => api.delete(`/competitions/${competitionId}/categories/${c.id}`)))
        for (let i = 0; i < cleanCats.length; i += 1) {
          await api.post(`/competitions/${competitionId}/categories`, {
            nombre: cleanCats[i].nombre,
            descripcion: cleanCats[i].descripcion || null,
            modality: cleanCats[i].modality,
            orden: i,
          })
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
          const phasePayload = {
            nombre: phase.nombre,
            modality: phase.modality,
            block_name: phase.block_name,
            block_order: Number(phase.block_order || i),
            measurement_method: normalizeMeasurementMethod(phase.measurement_method, phaseTypeFromMethod(phase.measurement_method)),
            descripcion: phase.descripcion || null,
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
          const detail = syncErr.response?.data?.detail || 'no se pudieron guardar todas las categorias o fases'
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
    background: 'linear-gradient(180deg, rgba(255,107,0,0.08) 0%, rgba(23,27,33,0.98) 24%, rgba(9,11,14,0.98) 100%)',
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
    border: `1px solid ${enabled ? 'rgba(255,107,0,0.45)' : '#252A33'}`,
    background: enabled ? 'linear-gradient(135deg, rgba(255,107,0,0.14), rgba(255,154,61,0.04))' : 'rgba(13,15,18,0.72)',
    color: 'var(--oa-text)',
    textAlign: 'left',
    cursor: 'pointer',
  })
  const toggleTrackStyle = (enabled) => ({
    width: 50,
    height: 30,
    borderRadius: 999,
    background: enabled ? 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)' : '#252a33',
    border: `1px solid ${enabled ? 'rgba(255,154,61,0.95)' : '#313844'}`,
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
    setQuestions(prev => [...prev, { id: `q_${Date.now()}`, label: '', field_type: 'text', required: 0, placeholder: '' }])
  }
  const removeQuestion = (id) => {
    setQuestions(prev => prev.filter(question => question.id !== id))
  }
  const updatePaymentMethod = (id, field, value) => {
    setPaymentMethods(prev => prev.map(method => method.id === id ? { ...method, [field]: value } : method))
  }
  const addPaymentMethod = () => {
    setPaymentMethods(prev => [...prev, { id: `pm_${Date.now()}`, label: '', account_name: '', account_number: '', notes: '' }])
  }
  const removePaymentMethod = (id) => {
    setPaymentMethods(prev => prev.filter(method => method.id !== id))
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
  const addScheduleItem = () => {
    setScheduleItems(prev => [...prev, { id: `date_${Date.now()}`, label: '', kind: 'custom', start_at: '', end_at: '', phase_id: '', use_phase_dates: 0, note: '' }])
  }
  const removeScheduleItem = (id) => {
    setScheduleItems(prev => prev.filter(item => item.id !== id))
  }
  const updateSocialLink = (id, field, value) => {
    setSocialLinks(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item))
  }
  const addSocialLink = () => {
    setSocialLinks(prev => [...prev, { id: `social_${Date.now()}`, platform: 'instagram', custom_label: '', url: '' }])
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

  const formContent = (
      <form onSubmit={save} style={inline ? { display: 'grid', gap: 0 } : { overflowY: 'auto', paddingRight: 4 }}>
        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        <div style={{ ...sectionStyle, paddingBottom: isMobile ? 12 : 16 }}>
          <div style={{ marginBottom: 14 }}>
            <h4 style={sectionTitleStyle}>Informacion general</h4>
            <div style={sectionHintStyle}>Define el nombre, descripcion, contacto e imagenes que se mostraran en la portada publica.</div>
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
              <input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="Ej: +57 300 123 4567" />
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
                placeholder="Resumen amplio de la competencia, dinamica general, formato, ambiente, reglas base o lo que el atleta debe entender antes de ver fases y categorias."
              />
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            <div style={{ color: 'var(--oa-text)', fontSize: 14, fontWeight: 800 }}>Imagenes</div>
            <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, lineHeight: 1.5 }}>
              Puedes subir foto de perfil y un solo banner para toda la competencia.
              {!isEdit ? ' En competencias nuevas, las imagenes se cargan al guardar.' : ''}
            </div>
            {[
              { key: 'profile', label: 'Foto de perfil' },
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
                    aspectRatio: asset.key === 'profile' ? '1 / 1' : '16 / 9',
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
        </div>

        <div style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <h4 style={sectionTitleStyle}>Configuracion</h4>
            <div style={sectionHintStyle}>Define primero el alcance operativo y despues la salida publica. Las vistas individuales y de equipos se controlan desde aqui.</div>
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ ...listItemStyle, gridTemplateColumns: '1fr' }}>
              <div style={{ color: '#FF9A3D', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>Modelo activo</div>
              <div style={{ color: 'var(--oa-text)', fontSize: 14, fontWeight: 700 }}>Individual y equipos comparten el mismo evento, pero cada vista publica se puede encender o apagar por separado.</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                {getCompetitionVisibilitySummary(form).map(item => (
                  <span
                    key={item.label}
                    style={{
                      ...modeChipBaseStyle,
                      background: item.tone === 'teal'
                        ? 'rgba(0,194,168,0.14)'
                        : item.tone === 'orange'
                          ? 'rgba(255,107,0,0.14)'
                          : item.tone === 'slate'
                            ? 'rgba(170,178,192,0.12)'
                            : 'rgba(107,114,128,0.12)',
                      color: item.tone === 'teal'
                        ? '#8FF3E7'
                        : item.tone === 'orange'
                          ? '#FFB36F'
                          : item.tone === 'slate'
                            ? 'var(--oa-text-secondary)'
                            : '#AAB2C0',
                      border: `1px solid ${item.tone === 'teal'
                        ? 'rgba(0,194,168,0.22)'
                        : item.tone === 'orange'
                          ? 'rgba(255,107,0,0.22)'
                          : 'rgba(170,178,192,0.2)'}`,
                    }}
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div style={sectionRowLabelStyle}>Modelo activo</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
                {renderToggleCard({
                  label: 'Modalidad individual',
                  hint: 'Activa rankings y fases para atletas individuales.',
                  enabled: !!form.individual_enabled,
                  enabledText: 'Activa',
                  disabledText: 'Oculta',
                  onClick: () => setForm(f => ({ ...f, individual_enabled: f.individual_enabled ? 0 : 1 })),
                })}
                {renderToggleCard({
                  label: 'Modalidad equipos',
                  hint: 'Activa armado de equipos, categorias por equipos y rankings grupales.',
                  enabled: !!form.team_enabled,
                  enabledText: 'Activa',
                  disabledText: 'Oculta',
                  onClick: () => setForm(f => ({ ...f, team_enabled: f.team_enabled ? 0 : 1 })),
                })}
              </div>
              {form.team_enabled ? (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                  {renderToggleCard({
                    label: 'Categorias de equipos',
                    hint: 'Permite definir divisiones propias para equipos, separadas de las individuales.',
                    enabled: !!form.team_categories_enabled,
                    enabledText: 'Separadas',
                    disabledText: 'Inferidas',
                    onClick: () => setForm(f => ({ ...f, team_categories_enabled: f.team_categories_enabled ? 0 : 1 })),
                  })}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Tamano de equipo</label>
                    <input type="number" min="1" max="10" value={form.team_size} onChange={e => setForm(f => ({ ...f, team_size: Math.max(1, Number(e.target.value || 1)) }))} />
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

            <div>
              <div style={sectionRowLabelStyle}>Base operativa</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                {renderToggleCard({
                  label: 'Competencia publicada',
                  hint: 'Define si esta competencia ya debe operar como activa dentro de la plataforma.',
                  enabled: !!form.activa,
                  enabledText: 'Activa',
                  disabledText: 'Inactiva',
                  onClick: () => setForm(f => ({ ...f, activa: f.activa ? 0 : 1 })),
                })}
                {renderToggleCard({
                  label: 'Inscripciones habilitadas',
                  hint: 'Permite que el boton "Quiero participar" abra el formulario y reciba solicitudes.',
                  enabled: !!form.enrollment_open,
                  enabledText: 'Abiertas',
                  disabledText: 'Cerradas',
                  onClick: () => setForm(f => ({ ...f, enrollment_open: f.enrollment_open ? 0 : 1 })),
                })}
                {renderToggleCard({
                  label: 'Carga de resultados por usuario',
                  hint: 'Permite que los participantes carguen sus propios resultados cuando aplique.',
                  enabled: !!form.allow_user_results,
                  enabledText: 'Permitida',
                  disabledText: 'Bloqueada',
                  onClick: () => setForm(f => ({ ...f, allow_user_results: f.allow_user_results ? 0 : 1 })),
                })}
                <button type="button" className={form.scoring_mode === 'lowest_wins' ? 'btn-success btn-sm' : 'btn-secondary btn-sm'} onClick={() => setForm(f => ({ ...f, scoring_mode: f.scoring_mode === 'lowest_wins' ? 'highest_wins' : 'lowest_wins' }))} style={{ width: '100%', minHeight: 64 }}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--oa-text)' }}>
                      {form.scoring_mode === 'lowest_wins' ? 'Menor puntaje gana' : 'Mayor puntaje gana'}
                    </div>
                    <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, marginTop: 4 }}>Define el criterio global de puntaje para tablas y calculos.</div>
                  </div>
                </button>
              </div>
            </div>

            <div>
              <div style={sectionRowLabelStyle}>Salida publica</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                {renderToggleCard({
                  label: 'Leaderboard individual visible',
                  hint: 'Muestra la tabla individual de participantes en la experiencia publica.',
                  enabled: !!form.show_individual_leaderboard,
                  enabledText: 'Visible',
                  disabledText: 'Oculto',
                  onClick: () => setForm(f => ({ ...f, show_individual_leaderboard: f.show_individual_leaderboard ? 0 : 1 })),
                })}
                {renderToggleCard({
                  label: 'Equipos por categoria',
                  hint: 'Expone la opcion para ver todos los equipos agrupados por categoria.',
                  enabled: !!form.show_team_all_by_category_option,
                  enabledText: 'Visible',
                  disabledText: 'Oculto',
                  onClick: () => setForm(f => ({ ...f, show_team_all_by_category_option: f.show_team_all_by_category_option ? 0 : 1 })),
                })}
                {renderToggleCard({
                  label: 'Equipos globales',
                  hint: 'Expone la opcion para ver todos los equipos sin filtrar por categoria.',
                  enabled: !!form.show_team_all_global_option,
                  enabledText: 'Visible',
                  disabledText: 'Oculto',
                  onClick: () => setForm(f => ({ ...f, show_team_all_global_option: f.show_team_all_global_option ? 0 : 1 })),
                })}
              </div>
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <h4 style={sectionTitleStyle}>Redes y contacto</h4>
            <div style={sectionHintStyle}>Agrega links publicos de Instagram, TikTok, Facebook, WhatsApp o cualquier canal oficial de la competencia.</div>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {socialLinks.map((item, idx) => (
              <div key={item.id} style={{ ...listItemStyle, gridTemplateColumns: '32px 1fr', gap: 10 }}>
                <span style={{ color: '#FF6B00', fontSize: 12, fontWeight: 700 }}>{idx + 1}</span>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '0.8fr 1.2fr auto', gap: 8 }}>
                    <select value={item.platform || 'instagram'} onChange={e => updateSocialLink(item.id, 'platform', e.target.value)}>
                      {SOCIAL_PLATFORM_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <input value={item.url} onChange={e => updateSocialLink(item.id, 'url', e.target.value)} placeholder="https://..." />
                    <button type="button" className="btn-danger btn-sm" onClick={() => removeSocialLink(item.id)}>Eliminar</button>
                  </div>
                  {item.platform === 'other' ? (
                    <input value={item.custom_label || ''} onChange={e => updateSocialLink(item.id, 'custom_label', e.target.value)} placeholder="Nombre de la red o canal" />
                  ) : null}
                </div>
              </div>
            ))}
            <button type="button" className="btn-secondary btn-sm" onClick={addSocialLink}>
              + Agregar red social
            </button>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <h4 style={sectionTitleStyle}>Ventana de inscripcion</h4>
            <div style={sectionHintStyle}>Controla la logica de inscripcion y las fechas base de la competencia.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Inicio de inscripciones</label>
              <input type="date" value={form.enrollment_start} onChange={e => setForm(f => ({ ...f, enrollment_start: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Cierre de inscripciones</label>
              <input type="date" value={form.enrollment_end} onChange={e => setForm(f => ({ ...f, enrollment_end: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Inicio de competencia</label>
              <input type="date" value={form.competition_start} onChange={e => setForm(f => ({ ...f, competition_start: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Fin de competencia</label>
              <input type="date" value={form.competition_end} onChange={e => setForm(f => ({ ...f, competition_end: e.target.value }))} />
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <h4 style={sectionTitleStyle}>Fechas visibles</h4>
            <div style={sectionHintStyle}>Agrega hitos configurables para mostrar en portada: apertura, cierre, dia 1, final, briefing o cualquier otra fecha.</div>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {scheduleItems.map((item, idx) => (
              <div key={item.id} style={{ ...listItemStyle, gridTemplateColumns: '32px 1fr', gap: 10 }}>
                <span style={{ color: '#FF6B00', fontSize: 12, fontWeight: 700 }}>{idx + 1}</span>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr', gap: 8 }}>
                    <input value={item.label} onChange={e => updateScheduleItem(item.id, 'label', e.target.value)} placeholder="Ej: Inscripciones abiertas, Dia 1, Final..." />
                    <select value={item.kind} onChange={e => updateScheduleItem(item.id, 'kind', e.target.value)}>
                      <option value="custom">Personalizada</option>
                      <option value="enrollment_start">Apertura inscripciones</option>
                      <option value="enrollment_end">Cierre inscripciones</option>
                      <option value="competition_start">Inicio competencia</option>
                      <option value="competition_end">Fin competencia</option>
                      <option value="competition_day">Dia de competencia</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr', gap: 8 }}>
                    <select
                      value={item.phase_id || ''}
                      onChange={e => linkScheduleItemToPhase(item.id, e.target.value)}
                    >
                      <option value="">Sin fase enlazada</option>
                      {phases.map(phase => (
                        <option key={`schedule-phase-${item.id}-${phase.id}`} value={phase.id}>
                          {phase.nombre}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={item.phase_id && item.use_phase_dates ? 'btn-success btn-sm' : 'btn-secondary btn-sm'}
                      onClick={() => toggleScheduleItemPhaseDates(item.id)}
                      disabled={!item.phase_id}
                    >
                      {item.phase_id && item.use_phase_dates ? 'Usa fechas de fase' : 'Usar fechas de fase'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                    <input type="date" value={item.start_at} disabled={!!item.phase_id && !!item.use_phase_dates} onChange={e => updateScheduleItem(item.id, 'start_at', e.target.value)} />
                    <input type="date" value={item.end_at} disabled={!!item.phase_id && !!item.use_phase_dates} onChange={e => updateScheduleItem(item.id, 'end_at', e.target.value)} />
                  </div>
                  {item.phase_id && item.use_phase_dates ? (
                    <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12 }}>
                      Esta fecha visible usa el mismo rango de la fase enlazada.
                    </div>
                  ) : null}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', gap: 8 }}>
                    <input value={item.note} onChange={e => updateScheduleItem(item.id, 'note', e.target.value)} placeholder="Nota opcional. Ej: Clasificatorio online o puertas abiertas 7:00 am" />
                    <button type="button" className="btn-danger btn-sm" onClick={() => removeScheduleItem(item.id)}>Eliminar</button>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" className="btn-secondary btn-sm" onClick={addScheduleItem}>
              + Agregar fecha
            </button>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <h4 style={sectionTitleStyle}>Mensaje de confirmacion</h4>
            <div style={sectionHintStyle}>Aparece arriba del formulario de participacion. Puedes usarlo para explicar pagos, requisitos o instrucciones.</div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Texto informativo</label>
            <textarea
              value={form.enrollment_intro_text}
              onChange={e => setForm(f => ({ ...f, enrollment_intro_text: e.target.value }))}
              rows={4}
              placeholder="Ej: Revisa cada categoria, completa tus datos y sigue las instrucciones antes de enviar la solicitud."
            />
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <h4 style={sectionTitleStyle}>Terminos y condiciones</h4>
            <div style={sectionHintStyle}>Se mostraran como paso obligatorio dentro del registro. El participante debera abrirlos, leerlos y aceptarlos antes de enviar la solicitud.</div>
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

        <div style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <h4 style={sectionTitleStyle}>Metodos de pago</h4>
            <div style={sectionHintStyle}>Estos datos se muestran en el paso de pago del registro para que el participante sepa a donde consignar.</div>
          </div>
          <div style={{ marginBottom: 12 }}>
            {renderToggleCard({
              label: 'Solicitar comprobante de pago',
              hint: 'Si activas esta opcion, el formulario de inscripcion mostrara una seccion fija para cargar el comprobante. Ya no sera necesario crear una pregunta manual para eso.',
              enabled: !!form.require_payment_receipt,
              onClick: () => setForm(f => ({ ...f, require_payment_receipt: f.require_payment_receipt ? 0 : 1 })),
              enabledText: 'Comprobante obligatorio',
              disabledText: 'Comprobante opcional',
            })}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {paymentMethods.map((method, idx) => (
              <div key={method.id} style={{ ...listItemStyle, gridTemplateColumns: '32px 1fr', gap: 10 }}>
                <span style={{ color: '#FF6B00', fontSize: 12, fontWeight: 700 }}>{idx + 1}</span>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                  <input value={method.label} onChange={e => updatePaymentMethod(method.id, 'label', e.target.value)} placeholder="Nombre del metodo. Ej: Bancolombia ahorro" />
                  <input value={method.account_name} onChange={e => updatePaymentMethod(method.id, 'account_name', e.target.value)} placeholder="Titular de la cuenta" />
                  <input value={method.account_number} onChange={e => updatePaymentMethod(method.id, 'account_number', e.target.value)} placeholder="Numero de cuenta" />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={method.notes} onChange={e => updatePaymentMethod(method.id, 'notes', e.target.value)} placeholder="Nota opcional" />
                    <button type="button" className="btn-danger btn-sm" onClick={() => removePaymentMethod(method.id)}>x</button>
                  </div>
                </div>
              </div>
            ))}
            {!paymentMethods.length && <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12 }}>Sin metodos de pago configurados.</div>}
          </div>
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn-secondary btn-sm" onClick={addPaymentMethod}>+ Agregar metodo de pago</button>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <h4 style={sectionTitleStyle}>Divisiones</h4>
            <div style={sectionHintStyle}>Define categorias individuales y por equipos sin mezclar ambas logicas.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr auto', gap: 8, marginBottom: 8 }}>
            <input value={newCat.nombre} onChange={e => setNewCat(prev => ({ ...prev, nombre: e.target.value }))} placeholder="Ej: Elite, Open, Masters..." />
            <select value={newCat.modality} onChange={e => setNewCat(prev => ({ ...prev, modality: e.target.value }))}>
              <option value="individual">Individual</option>
              <option value="teams" disabled={!form.team_enabled}>Equipos</option>
            </select>
            <button type="button" className="btn-secondary btn-sm" onClick={addCategory}>Agregar</button>
          </div>
          <textarea value={newCat.descripcion} onChange={e => setNewCat(prev => ({ ...prev, descripcion: e.target.value }))} placeholder="Descripcion de la categoria" rows={3} style={{ width: '100%', resize: 'vertical', marginBottom: 8 }} />
          <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, marginBottom: 8 }}>{cats.length ? `${cats.length} division${cats.length === 1 ? '' : 'es'} configurada${cats.length === 1 ? '' : 's'}` : 'Sin divisiones'}</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {cats.map((cat, idx) => (
              <div key={cat.id} style={{ ...listItemStyle, gridTemplateColumns: '28px minmax(0, 1fr) auto' }}>
                <span style={{ color: '#00c2a8', fontSize: 12, fontWeight: 700 }}>{idx + 1}</span>
                <div style={{ display: 'grid', gap: 6 }}>
                  <input value={cat.nombre} onChange={e => updateCategoryName(cat.id, e.target.value)} placeholder="Nombre de la categoria" />
                  <select value={cat.modality || 'individual'} onChange={e => updateCategoryModality(cat.id, e.target.value)}>
                    <option value="individual">Individual</option>
                    <option value="teams" disabled={!form.team_enabled}>Equipos</option>
                  </select>
                  <textarea value={cat.descripcion || ''} onChange={e => updateCategoryDescription(cat.id, e.target.value)} placeholder="Descripcion de la categoria" rows={3} style={{ width: '100%', resize: 'vertical' }} />
                </div>
                <button type="button" className="btn-danger btn-sm" onClick={() => removeCategory(cat.id)}>x</button>
              </div>
            ))}
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ marginBottom: 14 }}>
            <h4 style={sectionTitleStyle}>Preguntas de participacion</h4>
            <div style={sectionHintStyle}>Se muestran en el formulario que abre el boton "Quiero participar". Puedes pedir texto o una imagen, por ejemplo un comprobante de pago.</div>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {questions.map((question, idx) => (
              <div key={question.id} style={{ ...listItemStyle, gridTemplateColumns: isMobile ? '1fr' : '32px 1.2fr 0.9fr 1fr auto auto' }}>
                <span style={{ color: '#00c2a8', fontSize: 12, fontWeight: 700 }}>{idx + 1}</span>
                <input value={question.label} onChange={e => updateQuestion(question.id, 'label', e.target.value)} placeholder="Pregunta" />
                <select value={question.field_type || 'text'} onChange={e => updateQuestion(question.id, 'field_type', e.target.value)}>
                  <option value="text">Texto</option>
                  <option value="image">Imagen</option>
                </select>
                <input value={question.placeholder} onChange={e => updateQuestion(question.id, 'placeholder', e.target.value)} placeholder={question.field_type === 'image' ? 'Ayuda opcional. Ej: Sube el comprobante legible' : 'Placeholder (opcional)'} />
                <button type="button" className={question.required ? 'btn-success btn-sm' : 'btn-secondary btn-sm'} onClick={() => updateQuestion(question.id, 'required', question.required ? 0 : 1)}>
                  {question.required ? 'Obligatoria' : 'Opcional'}
                </button>
                <button type="button" className="btn-danger btn-sm" onClick={() => removeQuestion(question.id)}>x</button>
              </div>
            ))}
            {!questions.length && <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12 }}>Sin preguntas configuradas.</div>}
          </div>
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn-secondary btn-sm" onClick={addQuestion}>+ Agregar pregunta</button>
          </div>
        </div>

        {(!inline || !isEdit) && (
          <div style={sectionStyle}>
            <div style={{ marginBottom: 14 }}>
              <h4 style={sectionTitleStyle}>Bloques y fases</h4>
              <div style={sectionHintStyle}>Cada fila representa una fase dentro de un bloque. Asigna modalidad para separar individual y equipos con claridad.</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1.1fr 0.9fr 1fr 1fr 1fr 1fr 2fr auto', gap: 8, marginBottom: 8 }}>
              <input value={newPhase.block_name || ''} onChange={e => setNewPhase(p => ({ ...p, block_name: e.target.value }))} placeholder="Bloque. Ej: Workout 1" />
              <input value={newPhase.nombre} onChange={e => setNewPhase(p => ({ ...p, nombre: e.target.value }))} placeholder="Bloque o fase" />
              <select value={newPhase.modality} onChange={e => setNewPhase(p => ({ ...p, modality: e.target.value }))}>
                <option value="individual">Individual</option>
                <option value="teams" disabled={!form.team_enabled}>Equipos</option>
              </select>
              <select value={newPhase.measurement_method} onChange={e => setNewPhase(p => ({ ...p, measurement_method: e.target.value }))}>
                {PHASE_MEASUREMENT_METHODS.map(m => <option key={m} value={m}>{PHASE_MEASUREMENT_LABELS[m] || m}</option>)}
              </select>
              <select value={newPhase.team_result_mode} onChange={e => setNewPhase(p => ({ ...p, team_result_mode: e.target.value }))}>
                <option value="sum_two">Equipo: ambos</option>
                <option value="total">Equipo: total</option>
                <option value="single_member">Equipo: uno</option>
              </select>
              <input type="date" value={newPhase.start_at || ''} onChange={e => setNewPhase(p => ({ ...p, start_at: e.target.value }))} />
              <input type="date" value={newPhase.end_at || ''} onChange={e => setNewPhase(p => ({ ...p, end_at: e.target.value }))} />
              <input value={newPhase.descripcion} onChange={e => setNewPhase(p => ({ ...p, descripcion: e.target.value }))} placeholder="Descripcion (opcional)" />
              <button type="button" className="btn-secondary btn-sm" onClick={addPhase}>Agregar</button>
            </div>
            {phases.length === 0 && <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, marginBottom: 8 }}>Sin fases</div>}
            <div style={{ display: 'grid', gap: 6 }}>
              {phases.map((phase, idx) => (
                <div key={phase.id} style={{ ...listItemStyle, gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0, flex: '1 1 320px' }}>
                      <span style={{ color: '#FF6B00', fontSize: 12, fontWeight: 800, letterSpacing: 0.6, paddingTop: 10 }}>{String(idx + 1).padStart(2, '0')}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <input value={phase.nombre} onChange={e => updatePhase(phase.id, 'nombre', e.target.value)} />
                        <input value={phase.block_name || ''} onChange={e => updatePhase(phase.id, 'block_name', e.target.value)} placeholder="Bloque. Ej: Workout 1" style={{ marginTop: 8 }} />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {getPhaseModeSummary(phaseDrafts[phase.id] || phase).map((item, chipIndex) => (
                            <span
                              key={`${phase.id}-chip-${chipIndex}`}
                              style={{
                                ...modeChipBaseStyle,
                                background: chipIndex === 0
                                  ? 'rgba(255,107,0,0.12)'
                                  : chipIndex === 1
                                    ? 'rgba(0,194,168,0.12)'
                                    : chipIndex === 5
                                      ? 'rgba(170,178,192,0.12)'
                                      : 'rgba(13,15,18,0.75)',
                                color: chipIndex === 0
                                  ? '#FFB36F'
                                  : chipIndex === 1
                                    ? '#8FF3E7'
                                    : 'var(--oa-text-secondary)',
                                border: `1px solid ${chipIndex === 0
                                  ? 'rgba(255,107,0,0.22)'
                                  : chipIndex === 1
                                    ? 'rgba(0,194,168,0.22)'
                                    : 'rgba(170,178,192,0.18)'}`,
                              }}
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button type="button" className="btn-danger btn-sm" onClick={() => removePhase(phase.id)}>Eliminar</button>
                  </div>
                  <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                    <select value={phase.modality || 'individual'} onChange={e => updatePhase(phase.id, 'modality', e.target.value)}>
                      <option value="individual">Individual</option>
                      <option value="teams" disabled={!form.team_enabled}>Equipos</option>
                    </select>
                    <select value={normalizeMeasurementMethod(phase.measurement_method, phase.tipo)} onChange={e => updatePhase(phase.id, 'measurement_method', e.target.value)}>
                      {PHASE_MEASUREMENT_METHODS.map(m => <option key={m} value={m}>{PHASE_MEASUREMENT_LABELS[m] || m}</option>)}
                    </select>
                    <select value={phase.team_result_mode || 'sum_two'} onChange={e => updatePhase(phase.id, 'team_result_mode', e.target.value)}>
                      <option value="sum_two">Equipo: ambos</option>
                      <option value="total">Equipo: total</option>
                      <option value="single_member">Equipo: uno</option>
                    </select>
                    <input type="date" value={phase.start_at || ''} onChange={e => updatePhase(phase.id, 'start_at', e.target.value)} />
                    <input type="date" value={phase.end_at || ''} onChange={e => updatePhase(phase.id, 'end_at', e.target.value)} />
                    <input style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }} value={phase.descripcion} onChange={e => updatePhase(phase.id, 'descripcion', e.target.value)} placeholder="Descripcion de bloque o fase" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          {!inline && <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>}
          <button type="submit" className="btn-primary" disabled={saving || uploadingAssets}>
            {(saving || uploadingAssets) ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear competencia'}
          </button>
        </div>
      </form>
  )

  if (inline) {
    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ margin: 0, fontSize: 16 }}>Setup del evento</h4>
          <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>
            Edita identidad, modelo de salida, registro, pagos, divisiones y fases directamente desde el workspace.
          </div>
        </div>
        {formContent}
      </div>
    )
  }

  return (
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
            {form.tv_only_finalized_phases ? 'TV: Solo fases finalizadas' : 'TV: Todas las fases'}
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
              <label>Fase fija</label>
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
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h4 style={{ marginBottom: 12, fontSize: 15 }}>Puntajes por fase</h4>
        {(data.phases || []).length === 0 ? (
          <div style={{ color: '#666' }}>Esta competencia no tiene fases</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {data.phases.map(ph => (
              <div key={ph.id}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{ph.nombre} <span style={{ color: '#647063', fontWeight: 400 }}>({ph.tipo})</span></div>
                {Object.keys(ph.individual || {}).length === 0 ? (
                  <div style={{ color: '#666' }}>Sin resultados en esta fase</div>
                ) : (
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
    .filter(p => `${p.nombre} ${p.apellido} ${p.cedula}`.toLowerCase().includes(searchCreate.toLowerCase()))
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
    .filter(p => `${p.nombre} ${p.apellido} ${p.cedula}`.toLowerCase().includes(searchEdit.toLowerCase()))

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
  const [form, setForm] = useState({ participant_id: '', phase_id: '', puntos: 0, posicion: '' })
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

  const load = async () => {
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
      const first = String(phases[0].id)
      setActivePhaseId(first)
      setQuick(prev => ({ ...prev, phase_id: first }))
      setTeamQuick(prev => ({ ...prev, phase_id: first }))
      setTeamMembersQuick(prev => ({ ...prev, phase_id: first }))
      setForm(prev => ({ ...prev, phase_id: first }))
    }
  }, [phases, activePhaseId])

  const applyPhaseSelection = (phaseId) => {
    const value = String(phaseId || '')
    setActivePhaseId(value)
    setQuick(prev => ({ ...prev, phase_id: value }))
    setTeamQuick(prev => ({ ...prev, phase_id: value }))
    setTeamMembersQuick(prev => ({ ...prev, phase_id: value }))
    setForm(prev => ({ ...prev, phase_id: value }))
  }

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
          Number(r.participant_id) === Number(form.participant_id) &&
          String(r.phase_id || '') === String(form.phase_id)
        )
        if (duplicate) {
          setMsg({ type: 'error', text: 'Esta fase permite un solo resultado por participante' })
          return
        }
      }
      await api.post('/results', {
        participant_id: Number(form.participant_id),
        competition_id: competition.id,
        phase_id: form.phase_id ? Number(form.phase_id) : null,
        marca: phaseType === 'posicion'
          ? (form.posicion ? Number(form.posicion) : null)
          : parsedMetric,
        puntos: autoPoints ?? parsedMetric,
        posicion: form.posicion ? Number(form.posicion) : null,
      })
      setMsg({ type: 'success', text: 'Resultado guardado' })
      setForm({ participant_id: '', phase_id: form.phase_id, puntos: 0, posicion: '' })
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
      setMsg({ type: 'error', text: 'Esta fase requiere posicion en todas las filas cargadas' })
      return
    }
    if (quick.phase_id && !quickAllowMultiple) {
      const blocked = rows.filter(({ p }) => results.some(r =>
        Number(r.participant_id) === Number(p.id) &&
        String(r.phase_id || '') === String(quick.phase_id)
      ))
      if (blocked.length > 0) {
        setMsg({ type: 'error', text: 'La fase seleccionada permite un solo resultado por participante' })
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
          participant_id: p.id,
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
      setMsg({ type: 'error', text: 'Esta fase requiere posicion en todas las filas de equipos' })
      return
    }
    if (teamQuick.phase_id && !teamQuickAllowMultiple) {
      const blocked = rows.filter(({ t }) => results.some(r =>
        Number(r.team_id) === Number(t.id) &&
        Number(r.participant_id || 0) === 0 &&
        String(r.phase_id || '') === String(teamQuick.phase_id)
      ))
      if (blocked.length > 0) {
        setMsg({ type: 'error', text: 'La fase seleccionada permite un solo resultado por equipo' })
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
      setMsg({ type: 'error', text: 'Selecciona una fase para cargar por integrantes' })
      return
    }
    if (teamMembersAutoByPhase && rows.some(({ r }) => r.posicion === '')) {
      setMsg({ type: 'error', text: 'Esta fase requiere posicion en todas las filas de equipos' })
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
            Number(x.participant_id || 0) === 0 &&
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
            Number(x.participant_id) === Number(pm.member.id) &&
            String(x.phase_id || '') === String(teamMembersQuick.phase_id)
          )
          const payload = {
            participant_id: Number(pm.member.id),
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
    if (!categoryFilter || !categories.includes(categoryFilter)) {
      setCategoryFilter(categories[0])
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
    const cat = r.participant_id
      ? (participantCategoryById[r.participant_id] || 'Sin categoria')
      : (teamCategoryById[r.team_id] || 'Sin categoria')
    const catMatch = !!categoryFilter && cat === categoryFilter
    return phaseMatch && catMatch
  }).sort((a, b) => (Number(b.puntos || 0) - Number(a.puntos || 0)))

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
      setMsg({ type: 'error', text: 'No hay fases de tipo posicion para configurar' })
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
        <div style={{ fontSize: 12, color: '#647063', marginBottom: 8 }}>Seleccion rapida de fase</div>
        {isMobile ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 12, color: '#647063' }}>Fase</label>
              <select value={activePhaseId} onChange={e => applyPhaseSelection(e.target.value)}>
                {phases.map(ph => <option key={`results-phase-mobile-${ph.id}`} value={ph.id}>{ph.nombre}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 12, color: '#647063' }}>Categoria</label>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                {categories.length
                  ? categories.map(cat => <option key={`results-cat-mobile-${cat}`} value={cat}>{cat}</option>)
                  : <option value="">Sin categorias</option>}
              </select>
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
                {categories.length
                  ? categories.map(cat => <option key={`results-cat-${cat}`} value={cat}>{cat}</option>)
                  : <option value="">Sin categorias</option>}
              </select>
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
                title={`Borrar resultados de la fase ${ph.nombre}`}
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
                No hay equipos pendientes por cargar en esta fase.
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
                    {teamMembersMode === 'single_member' && <th>Quien hizo la fase</th>}
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
              {teamMembersQuickSaving ? 'Guardando...' : 'Guardar por fase'}
            </button>
          </div>
        </div>
      )}

      {rulesModalOpen && (
        <Modal title="Configurar puntos por posicion" onClose={() => setRulesModalOpen(false)} width={620}>
          <div className="form-group">
            <label>Fase de posicion</label>
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
            Fase: <b style={{ color: '#ddd' }}>{activePhase?.nombre || '-'}</b>
            {categoryFilter ? ` | Categoria: ${categoryFilter}` : ' | Categoria: Sin categorias'}
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
                      {r.participant_id
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
            <table>
              <thead><tr><th>Participante / Equipo</th><th>Valor</th><th>Posicion</th><th></th></tr></thead>
              <tbody>
                {filteredResults.map(r => {
                  const draft = editRows[r.id] || {}
                  return (
                    <tr key={r.id}>
                      <td>
                        {r.participant_id
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
          )}
        </div>
      </div>
    </div>
  )
}

function CompetitionsTab() {
  const [competitions, setCompetitions] = useState([])
  const [msg, setMsg] = useState(null)
  const [editor, setEditor] = useState(null)
  const [enrollingComp, setEnrollingComp] = useState(null)
  const [enrollCounts, setEnrollCounts] = useState({})
  const [pendingCounts, setPendingCounts] = useState({})
  const [selectedCompetition, setSelectedCompetition] = useState(null)
  const [selectedTab, setSelectedTab] = useState('summary')
  const [competitionTab, setCompetitionTab] = useState('phases')
  const [selectedParticipants, setSelectedParticipants] = useState([])
  const [previewImage, setPreviewImage] = useState(null)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))

  const syncCompetitionParticipants = async (competitionId) => {
    const res = await api.get(`/competitions/${competitionId}/participants`)
    const items = res.data || []
    setEnrollCounts(prev => ({ ...prev, [competitionId]: items.filter(p => p.estado === 'confirmado').length }))
    setPendingCounts(prev => ({ ...prev, [competitionId]: items.filter(p => p.estado === 'pendiente').length }))
    return items
  }

  const load = () => api.get('/competitions').then(r => {
    setCompetitions(r.data)
    r.data.forEach(c => {
      syncCompetitionParticipants(c.id).catch(() => {})
    })
  })
  useEffect(() => { load() }, [])
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
    if (!confirm(`Eliminar competencia "${comp.nombre}"? Esta accion no se puede deshacer.`)) return
    try {
      await api.delete(`/competitions/${comp.id}`)
      setMsg({ type: 'success', text: 'Competencia eliminada' })
      if (selectedCompetition?.id === comp.id) {
        setSelectedCompetition(null)
      }
      load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo eliminar' })
    }
  }

  const openCompetition = async (comp) => {
    setSelectedCompetition(comp)
    setSelectedTab('summary')
    setCompetitionTab('phases')
    try {
      const items = await syncCompetitionParticipants(comp.id)
      setSelectedParticipants(items)
    } catch {
      setSelectedParticipants([])
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

  useEffect(() => {
    if (selectedCompetition?.id) {
      refreshSelectedParticipants()
    }
  }, [selectedCompetition?.id])
  useEffect(() => {
    if (!selectedCompetition?.id) return undefined
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

  const competitionCardStyle = {
    padding: 16,
    display: 'grid',
    gap: 12,
    borderRadius: 18,
    border: '1px solid #252A33',
    background: 'linear-gradient(135deg, rgba(255,107,0,0.10), rgba(23,27,33,0.96) 42%, rgba(0,194,168,0.06) 100%)',
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
    background: 'linear-gradient(135deg, rgba(255,107,0,0.14), rgba(23,27,33,0.96) 40%, rgba(0,194,168,0.08) 100%)',
    boxShadow: '0 22px 50px rgba(0,0,0,0.24)',
    marginBottom: 14,
  }
  const workspaceTopSectionStyle = {
    display: 'grid',
    gap: 14,
    marginBottom: 14,
  }
  const sectionTabStyle = (active) => ({
    border: `1px solid ${active ? 'rgba(255,107,0,0.45)' : '#252A33'}`,
    background: active ? 'linear-gradient(135deg, rgba(255,107,0,0.18), rgba(255,154,61,0.05))' : 'rgba(13,15,18,0.7)',
    color: active ? '#F5F7FA' : '#AAB2C0',
    borderRadius: 14,
    padding: isMobile ? '10px 12px' : '12px 14px',
    display: 'grid',
    gap: 4,
    minWidth: isMobile ? '100%' : 0,
    textAlign: 'left',
  })
  const subSectionBtnStyle = (active) => ({
    border: `1px solid ${active ? 'rgba(0,194,168,0.45)' : '#252A33'}`,
    background: active ? 'rgba(0,194,168,0.12)' : 'rgba(13,15,18,0.72)',
    color: active ? '#F5F7FA' : '#AAB2C0',
    borderRadius: 12,
    padding: '9px 12px',
    fontSize: 13,
    fontWeight: 700,
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
  const competitionSubSections = [
    { id: 'phases', label: 'Fases' },
    { id: 'schedule', label: 'Cronograma' },
    { id: 'teams', label: 'Equipos' },
    { id: 'results', label: 'Resultados' },
    { id: 'timer', label: 'Cronometro' },
  ]
  const currentPendingCount = selectedCompetition ? (pendingCounts[selectedCompetition.id] || 0) : 0
  const currentEnrollCount = selectedCompetition ? (enrollCounts[selectedCompetition.id] || 0) : 0
  const currentPhaseStateLabel = competitionTab === 'results'
    ? 'Carga y ajustes de puntaje'
    : competitionTab === 'teams'
      ? 'Armado y control de equipos'
      : competitionTab === 'timer'
        ? 'Control de tiempo en vivo'
        : 'Definicion de bloques y fases'

  return (
    <div>
      {previewImage && <ImagePreviewModal item={previewImage} onClose={() => setPreviewImage(null)} />}
      {!selectedCompetition && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Competencias</h3>
            <button className="btn-primary" onClick={() => setEditor({ mode: 'create', competition: null })}>
              + Nueva competencia
            </button>
          </div>
          {msg && <div className={`alert alert-${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
            {competitions.map(c => {
              const pendingCount = pendingCounts[c.id] || 0
              return (
              <div key={c.id} className="card" style={competitionCardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--oa-text)' }}>{c.nombre}</div>
                    <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{c.descripcion || 'Sin descripcion'}</div>
                    {pendingCount > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <span className="badge" style={{ background: 'rgba(245,158,11,0.14)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}>
                          {pendingCount} pendiente{pendingCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    )}
                  </div>
                  <span
                    className="badge"
                    style={c.activa
                      ? { background: 'rgba(255,107,0,0.14)', color: '#ff9a3d', border: '1px solid rgba(255,107,0,0.35)' }
                      : { background: 'rgba(170,178,192,0.12)', color: 'var(--oa-text-secondary)', border: '1px solid rgba(170,178,192,0.25)' }}
                  >
                    {c.activa ? 'Activa' : 'Inactiva'}
                  </span>
                </div>

                <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={statCardStyle}>
                    <div style={{ color: '#00C2A8', fontSize: 11, marginBottom: 4, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>Resultados</div>
                    <div style={{ fontWeight: 700, color: 'var(--oa-text)' }}>{c.allow_user_results ? 'Habilitado' : 'Deshabilitado'}</div>
                  </div>
                  <div style={statCardStyle}>
                    <div style={{ color: '#FF6B00', fontSize: 11, marginBottom: 4, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>Inscripciones</div>
                    <div style={{ fontWeight: 700, color: 'var(--oa-text)' }}>{enrollCounts[c.id] ?? 0} confirmados</div>
                    <div style={{ fontSize: 11, color: pendingCount > 0 ? '#fbbf24' : 'var(--oa-text-secondary)', marginTop: 4 }}>
                      {pendingCount} pendientes
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn-primary btn-sm" onClick={() => openCompetition(c)}>Abrir panel</button>
                  {pendingCount > 0 ? (
                    <button className="btn-secondary btn-sm" onClick={() => setEnrollingComp(c)}>
                      Inscripciones ({pendingCount})
                    </button>
                  ) : null}
                  <a
                    className="btn-secondary btn-sm"
                    href={`/competitions/${c.id}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: 'none' }}
                  >
                    Ver competencia
                  </a>
                  <a
                    className="btn-secondary btn-sm"
                    href={`/leaderboard/${c.id}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: 'none' }}
                  >
                    Leaderboard
                  </a>
                  <button className="btn-danger btn-sm" onClick={() => deleteCompetition(c)}>Eliminar</button>
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
            <div style={workspaceHeroCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: isMobile ? 'flex-start' : 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn-secondary btn-sm" onClick={() => setSelectedCompetition(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <ArrowLeft size={14} />
                      Volver
                    </button>
                    <span
                      className="badge"
                      style={selectedCompetition.activa
                        ? { background: 'rgba(255,107,0,0.14)', color: '#ff9a3d', border: '1px solid rgba(255,107,0,0.35)' }
                        : { background: 'rgba(170,178,192,0.12)', color: 'var(--oa-text-secondary)', border: '1px solid rgba(170,178,192,0.25)' }}
                    >
                      {selectedCompetition.activa ? 'Activa' : 'Inactiva'}
                    </span>
                    {currentPendingCount > 0 ? (
                      <span className="badge" style={{ background: 'rgba(245,158,11,0.14)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}>
                        {currentPendingCount} pendiente{currentPendingCount === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: isMobile ? 22 : 28, color: 'var(--oa-text)' }}>{selectedCompetition.nombre}</div>
                  <div style={{ color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.6, maxWidth: 760 }}>
                    {selectedCompetition.descripcion || 'Configura el evento, revisa inscripciones, opera fases y controla la salida publica desde un solo panel.'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    {getCompetitionVisibilitySummary(selectedCompetition).map(item => (
                      <span
                        key={`hero-${item.label}`}
                        style={{
                          ...SHARED_MODE_CHIP_BASE_STYLE,
                          background: item.tone === 'teal'
                            ? 'rgba(0,194,168,0.14)'
                            : item.tone === 'orange'
                              ? 'rgba(255,107,0,0.14)'
                              : item.tone === 'slate'
                                ? 'rgba(170,178,192,0.12)'
                                : 'rgba(107,114,128,0.12)',
                          color: item.tone === 'teal'
                            ? '#8FF3E7'
                            : item.tone === 'orange'
                              ? '#FFB36F'
                              : item.tone === 'slate'
                                ? '#AAB2C0'
                                : '#AAB2C0',
                          border: `1px solid ${item.tone === 'teal'
                            ? 'rgba(0,194,168,0.22)'
                            : item.tone === 'orange'
                              ? 'rgba(255,107,0,0.22)'
                              : 'rgba(170,178,192,0.2)'}`,
                        }}
                      >
                        {item.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn-secondary btn-sm" onClick={() => setSelectedTab('setup')}>Setup</button>
                  <button className="btn-secondary btn-sm" onClick={() => setSelectedTab('enrollments')}>
                    {currentPendingCount > 0 ? `Revisar pendientes (${currentPendingCount})` : 'Abrir inscripciones'}
                  </button>
                  <a
                    href={`/competitions/${selectedCompetition.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary btn-sm"
                    style={{ textDecoration: 'none' }}
                  >
                    Ver competencia
                  </a>
                  <a
                    href={`/leaderboard/${selectedCompetition.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary btn-sm"
                    style={{ textDecoration: 'none' }}
                  >
                    Abrir leaderboard
                  </a>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                <div style={workspaceStatTileStyle}>
                  <div style={{ color: '#AAB2C0', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>Inscritos</div>
                  <div style={{ color: '#F5F7FA', fontSize: 22, fontWeight: 800 }}>{currentEnrollCount}</div>
                  <div style={{ color: '#AAB2C0', fontSize: 12 }}>Confirmados en competencia</div>
                </div>
                <div style={workspaceStatTileStyle}>
                  <div style={{ color: '#AAB2C0', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>Pendientes</div>
                  <div style={{ color: currentPendingCount > 0 ? '#fbbf24' : '#F5F7FA', fontSize: 22, fontWeight: 800 }}>{currentPendingCount}</div>
                  <div style={{ color: '#AAB2C0', fontSize: 12 }}>{currentPendingCount > 0 ? 'Solicitudes por revisar' : 'Sin cola pendiente'}</div>
                </div>
                <div style={workspaceStatTileStyle}>
                  <div style={{ color: '#AAB2C0', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>Resultados usuario</div>
                  <div style={{ color: selectedCompetition.allow_user_results ? '#00C2A8' : '#F5F7FA', fontSize: 18, fontWeight: 800 }}>
                    {selectedCompetition.allow_user_results ? 'Habilitados' : 'Bloqueados'}
                  </div>
                  <div style={{ color: '#AAB2C0', fontSize: 12 }}>Carga directa desde atleta</div>
                </div>
                <div style={workspaceStatTileStyle}>
                  <div style={{ color: '#AAB2C0', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>Operacion</div>
                  <div style={{ color: '#F5F7FA', fontSize: 18, fontWeight: 800 }}>
                    {selectedTab === 'competition' ? currentPhaseStateLabel : selectedTab === 'broadcast' ? 'Salida publica' : 'Panel central'}
                  </div>
                  <div style={{ color: '#AAB2C0', fontSize: 12 }}>Seccion actual del workspace</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
              {COMPETITION_WORKSPACE_SECTIONS.map(section => (
                <button key={section.id} type="button" onClick={() => setSelectedTab(section.id)} style={sectionTabStyle(selectedTab === section.id)}>
                  <span style={{ color: selectedTab === section.id ? '#F5F7FA' : '#D7DEE8', fontSize: 14, fontWeight: 800 }}>{section.label}</span>
                  <span style={{ fontSize: 12, lineHeight: 1.45 }}>{section.description}</span>
                </button>
              ))}
            </div>
          </div>

          {selectedTab === 'summary' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 16 }}>Resumen operativo</h4>
                  <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>Lo urgente primero: solicitudes, setup pendiente y acceso rapido a la competencia.</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn-secondary btn-sm" onClick={() => setSelectedTab('setup')}>Ir a setup</button>
                  <button className="btn-secondary btn-sm" onClick={() => setSelectedTab('competition')}>Ir a competencia</button>
                  <button className="btn-primary btn-sm" onClick={() => setSelectedTab('enrollments')}>
                    {currentPendingCount > 0 ? `Atender ${currentPendingCount} pendiente${currentPendingCount === 1 ? '' : 's'}` : 'Ver inscripciones'}
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
                <div style={setupInfoCardStyle}>
                  <div style={{ color: '#FF9A3D', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>Alertas</div>
                  <div style={{ color: '#F5F7FA', fontWeight: 700 }}>{currentPendingCount > 0 ? `${currentPendingCount} solicitudes por revisar` : 'Sin solicitudes urgentes'}</div>
                  <div style={{ color: '#AAB2C0', fontSize: 13 }}>Controla aprobaciones y respuestas del registro desde una sola seccion.</div>
                </div>
                <div style={setupInfoCardStyle}>
                  <div style={{ color: '#00C2A8', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>Setup</div>
                  <div style={{ color: '#F5F7FA', fontWeight: 700 }}>{selectedCompetition.enrollment_open ? 'Inscripciones abiertas' : 'Inscripciones cerradas'}</div>
                  <div style={{ color: '#AAB2C0', fontSize: 13 }}>Ajusta identidad, copy, reglas, pagos y preguntas antes de operar el evento.</div>
                </div>
                <div style={setupInfoCardStyle}>
                  <div style={{ color: '#AAB2C0', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>Broadcast</div>
                  <div style={{ color: '#F5F7FA', fontWeight: 700 }}>{selectedCompetition.tv_mode === 'static' ? 'TV estatica' : 'TV ciclica'}</div>
                  <div style={{ color: '#AAB2C0', fontSize: 13 }}>Gestiona QR, refresco y la vista publica sin salir del workspace.</div>
                </div>
              </div>
              <CompetitionSummaryPanel competitionId={selectedCompetition.id} />
            </div>
          )}

          {selectedTab === 'setup' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 16 }}>Setup del evento</h4>
                  <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>La configuracion ya no abre otro flujo. Edita identidad, inscripciones, divisiones, modelo de salida y contenido directamente aqui.</div>
                </div>
              </div>
              <CompetitionEditorModal
                mode="edit"
                competition={selectedCompetition}
                inline
                onClose={() => {}}
                onSaved={(text) => {
                  setMsg({ type: 'success', text })
                  load()
                  api.get(`/competitions/${selectedCompetition.id}`).then(res => setSelectedCompetition(res.data)).catch(() => {})
                }}
              />
            </div>
          )}

          {selectedTab === 'enrollments' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 16 }}>Inscripciones</h4>
                  <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>Solicitudes, confirmados y respuestas del formulario en una sola vista.</div>
                </div>
                <button className="btn-primary btn-sm" onClick={() => setEnrollingComp(selectedCompetition)}>
                  {currentPendingCount > 0 ? `Gestionar solicitudes (${currentPendingCount})` : 'Gestionar inscripciones'}
                </button>
              </div>
              {isMobile ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {!selectedParticipants.length && <p style={{ textAlign: 'center', color: '#666', padding: 16 }}>Sin participantes</p>}
                  {selectedParticipants.map(p => (
                    <div key={p.id} style={{ border: '1px solid #d5ddd3', borderRadius: 8, padding: '10px 12px', background: '#fafafa' }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.nombre} {p.apellido}</div>
                      <div style={{ fontSize: 12, color: '#666', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span>Cedula: {p.cedula}</span>
                        <span>Categoria: {p.categoria_competencia || '-'}</span>
                        <span style={{ color: p.estado === 'activo' ? '#284017' : '#8a9489' }}>Estado: {p.estado}</span>
                      </div>
                      <EnrollmentAnswersBlock raw={p.enrollment_answers} compact onPreviewImage={setPreviewImage} />
                    </div>
                  ))}
                </div>
              ) : (
                <table>
                  <thead><tr><th>Participante</th><th>Cedula</th><th>Categoria</th><th>Estado</th><th>Respuestas</th></tr></thead>
                  <tbody>
                    {selectedParticipants.map(p => (
                      <tr key={p.id}>
                        <td>{p.nombre} {p.apellido}</td>
                        <td>{p.cedula}</td>
                        <td>{p.categoria_competencia || '-'}</td>
                        <td>{p.estado}</td>
                        <td>
                          {parseEnrollmentAnswers(p.enrollment_answers).length
                            ? parseEnrollmentAnswers(p.enrollment_answers).map(item => `${item.question_label || 'Respuesta'}: ${item.question_type === 'image' && item.answer ? 'Imagen adjunta' : (item.answer || '-')}`).join(' | ')
                            : '-'}
                        </td>
                      </tr>
                    ))}
                    {!selectedParticipants.length && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#666', padding: 16 }}>Sin participantes</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {selectedTab === 'competition' && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 16 }}>Operacion de competencia</h4>
                    <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>Separa la operacion por tipo de tarea para evitar botones que hacen lo mismo.</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {competitionSubSections.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setCompetitionTab(item.id)}
                        style={subSectionBtnStyle(competitionTab === item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ color: '#AAB2C0', fontSize: 13 }}>
                  {currentPhaseStateLabel}
                </div>
              </div>

              {competitionTab === 'phases' && <PhasesModal competition={selectedCompetition} inline />}
              {competitionTab === 'schedule' && <CompetitionSchedulePanel competition={selectedCompetition} />}
              {competitionTab === 'teams' && <CompetitionTeamsPanel competition={selectedCompetition} />}
              {competitionTab === 'results' && <CompetitionResultsPanel competition={selectedCompetition} />}
              {competitionTab === 'timer' && <CompetitionTimerPanel competition={selectedCompetition} />}
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

      {editor && (
        <CompetitionEditorModal
          mode={editor.mode}
          competition={editor.competition}
          onClose={() => setEditor(null)}
          onSaved={(text) => {
            setMsg({ type: 'success', text })
            load()
            if (selectedCompetition?.id === editor.competition?.id) {
              api.get(`/competitions/${selectedCompetition.id}`).then(res => setSelectedCompetition(res.data)).catch(() => {})
            }
          }}
        />
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
    </div>
  )
}

// ── Participants Tab ──────────────────────────────────────────────────────────
function ParticipantsTab() {
  const [participants, setParticipants] = useState([])
  const [competitions, setCompetitions] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ cedula: '', nombre: '', apellido: '', email: '', celular: '', genero: 'M', categoria: 'Rx', box: '', talla_camiseta: '', fecha_nacimiento: '', ciudad_pais: '', city: '', countryCode: '', estado: 'activo' })
  const [editingParticipant, setEditingParticipant] = useState(null)
  const [editForm, setEditForm] = useState({ cedula: '', nombre: '', apellido: '', email: '', celular: '', genero: 'M', categoria: 'Rx', box: '', talla_camiseta: '', fecha_nacimiento: '', ciudad_pais: '', city: '', countryCode: '', estado: 'activo' })
  const [msg, setMsg] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [importCompId, setImportCompId] = useState('')
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const fileRef = useRef()
  const [countries, setCountries] = useState([])
  const [createCities, setCreateCities] = useState([])
  const [editCities, setEditCities] = useState([])
  const countryNameByCode = useMemo(() => Object.fromEntries(countries.map(c => [c.code, c.name])), [countries])
  const countryCodeByName = useMemo(() => Object.fromEntries(countries.map(c => [c.name.toLowerCase(), c.code])), [countries])
  const cityOptionsCreate = useMemo(() => {
    const list = createCities
    const query = (form.city || '').trim().toLowerCase()
    if (!query) return list.slice(0, 150)
    return list.filter(city => city.toLowerCase().includes(query)).slice(0, 150)
  }, [createCities, form.city])
  const cityOptionsEdit = useMemo(() => {
    const list = editCities
    const query = (editForm.city || '').trim().toLowerCase()
    if (!query) return list.slice(0, 150)
    return list.filter(city => city.toLowerCase().includes(query)).slice(0, 150)
  }, [editCities, editForm.city])

  const load = () => api.get('/participants').then(r => setParticipants(r.data))
  useEffect(() => {
    load()
    api.get('/competitions').then(r => setCompetitions(r.data))
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
    if (!form.countryCode) {
      setCreateCities([])
      return
    }
    loadCitiesByCountry(form.countryCode).then(setCreateCities).catch(() => setCreateCities([]))
  }, [form.countryCode])
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

  const create = async (e) => {
    e.preventDefault()
    try {
      const city = (form.city || '').trim()
      const countryCode = (form.countryCode || '').trim()
      const countryName = countryNameByCode[countryCode] || ''
      if ((city || countryCode) && !(city && countryCode)) {
        setMsg({ type: 'error', text: 'Selecciona pais y ciudad validos' })
        return
      }
      if (city && countryCode && !createCities.some(candidate => candidate.toLowerCase() === city.toLowerCase())) {
        setMsg({ type: 'error', text: 'La ciudad no pertenece al pais seleccionado' })
        return
      }
      const payload = {
        ...form,
        ciudad_pais: city && countryName ? buildCityCountry(city, countryName) : '',
      }
      delete payload.city
      delete payload.countryCode
      await api.post('/participants', payload)
      setMsg({ type: 'success', text: 'Participante creado' })
      setShowForm(false)
      setForm({ cedula: '', nombre: '', apellido: '', email: '', celular: '', genero: 'M', categoria: 'Rx', box: '', talla_camiseta: '', fecha_nacimiento: '', ciudad_pais: '', city: '', countryCode: '', estado: 'activo' })
      load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'Error' })
    }
  }

  const downloadTemplate = async () => {
    const res = await api.get('/participants/template', { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = 'template_participantes.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const url = importCompId ? `/participants/import?competition_id=${importCompId}` : '/participants/import'
    try {
      const { data } = await api.post(url, fd)
      const enrolled = data.enrolled ? ` Inscritos en competencia: ${data.enrolled}.` : ''
      setMsg({ type: 'success', text: `Importados: ${data.inserted}. Saltados: ${data.skipped.length}.${enrolled}` })
      load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'Error al importar' })
    } finally {
      setUploading(false)
      fileRef.current.value = ''
    }
  }

  const toggleEstado = async (p) => {
    await api.put(`/participants/${p.id}`, { estado: p.estado === 'activo' ? 'inactivo' : 'activo' })
    load()
  }

  const startEdit = (p) => {
    const parsed = parseCityCountry(p.ciudad_pais || '')
    setEditingParticipant(p)
    setEditForm({
      cedula: p.cedula || '',
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
      estado: p.estado || 'activo',
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
      delete payload.city
      delete payload.countryCode
      await api.put(`/participants/${editingParticipant.id}`, payload)
      setMsg({ type: 'success', text: 'Atleta actualizado' })
      setEditingParticipant(null)
      load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo actualizar' })
    }
  }

  const removeParticipant = async (p) => {
    if (!confirm(`Eliminar atleta "${p.nombre} ${p.apellido}"?`)) return
    try {
      await api.delete(`/participants/${p.id}`)
      setMsg({ type: 'success', text: 'Atleta eliminado' })
      load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo eliminar' })
    }
  }

  const categoryBadge = (cat) => {
    const map = { Rx: 'badge-rx', Scaled: 'badge-scaled', Masters: 'badge-masters' }
    return <span className={`badge ${map[cat] || 'badge-default'}`}>{cat || '-'}</span>
  }

  return (
    <div>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Agregar participante'}
        </button>

        <button className="btn-secondary" onClick={downloadTemplate} title="Descarga el Excel de ejemplo con las columnas correctas">
          ? Template Excel
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #d5ddd3', borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ fontSize: 12, color: '#647063', whiteSpace: 'nowrap' }}>Inscribir en:</span>
          <select value={importCompId} onChange={e => setImportCompId(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: '#4d564b', fontSize: 13, width: 160, padding: 0 }}>
            <option value="">-- ninguna --</option>
            {competitions.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>

        <label style={{ display: 'flex', alignItems: 'center' }}>
          <button className="btn-secondary" onClick={() => fileRef.current.click()} disabled={uploading}>
            {uploading ? 'Importando...' : '? Importar CSV/Excel'}
          </button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleImport} />
        </label>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <form onSubmit={create}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 12 }}>
              <div className="form-group"><label>Cedula *</label><input value={form.cedula} onChange={e => setForm({ ...form, cedula: e.target.value })} required /></div>
              <div className="form-group"><label>Nombre *</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required /></div>
              <div className="form-group"><label>Apellido *</label><input value={form.apellido} onChange={e => setForm({ ...form, apellido: e.target.value })} required /></div>
              <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div className="form-group"><label>Celular</label><input value={form.celular} onChange={e => setForm({ ...form, celular: e.target.value })} /></div>
              <div className="form-group"><label>Genero</label>
                <select value={form.genero} onChange={e => setForm({ ...form, genero: e.target.value })}>
                  {GENEROS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Box</label><input value={form.box} onChange={e => setForm({ ...form, box: e.target.value })} /></div>
              <div className="form-group"><label>Talla camiseta</label>
                <select value={form.talla_camiseta} onChange={e => setForm({ ...form, talla_camiseta: e.target.value })}>
                  <option value="">-</option>
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                </select>
              </div>
              <div className="form-group"><label>Fecha nacimiento</label><input type="date" value={form.fecha_nacimiento} onChange={e => setForm({ ...form, fecha_nacimiento: e.target.value })} /></div>
              <div className="form-group" style={{ gridColumn: isMobile ? 'span 2' : 'span 3' }}>
                <label>Ciudad / Pais</label>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                  <select value={form.countryCode} onChange={e => setForm({ ...form, countryCode: e.target.value, city: '' })}>
                    <option value="">Selecciona pais</option>
                    {countries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}
                  </select>
                  <div>
                    <input
                      list="admin-create-city-options"
                      value={form.city}
                      onChange={e => setForm({ ...form, city: e.target.value })}
                      placeholder={form.countryCode ? 'Escribe o selecciona ciudad' : 'Primero selecciona un pais'}
                      disabled={!form.countryCode}
                    />
                    <datalist id="admin-create-city-options">
                      {cityOptionsCreate.map(city => <option key={city} value={city} />)}
                    </datalist>
                  </div>
                </div>
              </div>
              <div className="form-group"><label>Categoria</label>
                <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
                  {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <button type="submit" className="btn-primary">Guardar</button>
          </form>
        </div>
      )}

      {isMobile ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {participants.map((p, i) => (
            <div key={p.id} className="card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{i + 1}. {p.nombre} {p.apellido}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#647063', marginTop: 2 }}>{p.cedula}</div>
                </div>
                {categoryBadge(p.categoria)}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: '#555', display: 'grid', gap: 2 }}>
                <div><b>Genero:</b> {p.genero || p.sexo || '-'}</div>
                <div><b>Box:</b> {p.box || '-'}</div>
                <div><b>Ciudad / Pais:</b> {p.ciudad_pais || '-'}</div>
                <div><b>Contacto:</b> {p.email || p.celular || '-'}</div>
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className={p.estado === 'activo' ? 'btn-success btn-sm' : 'btn-danger btn-sm'} onClick={() => toggleEstado(p)}>
                  {p.estado}
                </button>
                <button className="btn-secondary btn-sm" onClick={() => startEdit(p)} title="Editar atleta">Editar</button>
                <button className="btn-danger btn-sm" onClick={() => removeParticipant(p)} title="Eliminar atleta">Eliminar</button>
              </div>
            </div>
          ))}
          {!participants.length && <div className="card" style={{ color: '#647063', textAlign: 'center', padding: 24 }}>No hay participantes</div>}
        </div>
      ) : (
        <table>
          <thead>
            <tr><th>#</th><th>Cedula</th><th>Nombre</th><th>Categoria</th><th>Genero</th><th>Box</th><th>Ciudad / Pais</th><th>Email</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {participants.map((p, i) => (
              <tr key={p.id}>
                <td style={{ color: '#647063' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{p.cedula}</td>
                <td>{p.nombre} {p.apellido}</td>
                <td>{categoryBadge(p.categoria)}</td>
                <td>{p.genero || p.sexo || '-'}</td>
                <td>{p.box || '-'}</td>
                <td>{p.ciudad_pais || '-'}</td>
                <td style={{ color: '#647063' }}>{p.email || p.celular || '-'}</td>
                <td>
                  <button className={p.estado === 'activo' ? 'btn-success btn-sm' : 'btn-danger btn-sm'} onClick={() => toggleEstado(p)}>
                    {p.estado}
                  </button>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-secondary btn-sm" onClick={() => startEdit(p)} title="Editar atleta" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={14} /></button>
                    <button className="btn-danger btn-sm" onClick={() => removeParticipant(p)} title="Eliminar atleta" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!participants.length && <tr><td colSpan={10} style={{ color: '#647063', textAlign: 'center', padding: 24 }}>No hay participantes</td></tr>}
          </tbody>
        </table>
      )}

      {editingParticipant && (
        <Modal title={`Editar atleta - ${editingParticipant.nombre} ${editingParticipant.apellido}`} onClose={() => setEditingParticipant(null)} width={760}>
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
              <div className="form-group"><label>Estado</label>
                <select value={editForm.estado} onChange={e => setEditForm({ ...editForm, estado: e.target.value })}>
                  <option value="activo">activo</option>
                  <option value="inactivo">inactivo</option>
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

// ── Results Tab ───────────────────────────────────────────────────────────────
const MAX_TEAM_SIZE = 10

function TeamsTab() {
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
    api.get('/competitions').then(r => {
      setCompetitions(r.data)
      if (!filterComp && r.data.length) setFilterComp(String(r.data[0].id))
    })
  }, [])

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
    .filter(p => `${p.nombre} ${p.apellido} ${p.cedula}`.toLowerCase().includes(searchCreate.toLowerCase()))
  const usedIdsExceptEditing = new Set(
    teams
      .filter(t => t.id !== editingTeam?.id)
      .flatMap(t => t.members.map(m => m.id))
  )
  const availableForEdit = participantPool
    .filter(p => !usedIdsExceptEditing.has(p.id) || editForm.member_ids.includes(p.id))
    .filter(p => `${p.nombre} ${p.apellido} ${p.cedula}`.toLowerCase().includes(searchEdit.toLowerCase()))

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

// ── Main AdminDashboard ───────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { role } = useAuth()
  const isOrganizer = role === 'organizer'
  const [mainTab, setMainTab] = useState('competitions')
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  return (
    <div className="app-shell">
      <div className="app-container" style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '14px 12px' : '24px 20px' }}>
        <div className="tabs" style={{ marginBottom: 16, overflowX: 'auto', whiteSpace: 'nowrap', flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          <button className={`tab ${mainTab === 'competitions' ? 'active' : ''}`} onClick={() => setMainTab('competitions')} style={{ flexShrink: 0 }}>
            Competencias
          </button>
          {!isOrganizer && (
            <button className={`tab ${mainTab === 'athletes' ? 'active' : ''}`} onClick={() => setMainTab('athletes')} style={{ flexShrink: 0 }}>
              Atletas / Usuarios
            </button>
          )}
        </div>
        {mainTab === 'competitions' && <CompetitionsTab />}
        {!isOrganizer && mainTab === 'athletes' && <ParticipantsTab />}
      </div>
    </div>
  )
}

















