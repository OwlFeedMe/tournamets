import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { House, LogOut, X, Trash2, Pencil, ChevronDown, ChevronRight, Trophy, ClipboardList, Clock3, Hourglass, Play, Pause, RotateCcw, ArrowLeft, Crown } from 'lucide-react'

const CATEGORIAS = ['Rx', 'Scaled', 'Masters', 'Teens', 'Otro']
const SEXOS = ['M', 'F', 'Otro']
const CATEGORY_ORDER = ['Rx', 'Scaled', 'Masters', 'Teens', 'Otro', 'Sin categoria']

function orderCategories(data) {
  const keys = Object.keys(data || {})
  return CATEGORY_ORDER.filter(c => keys.includes(c)).concat(keys.filter(c => !CATEGORY_ORDER.includes(c)))
}

function NavBar({ onLogout }) {
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return (
    <nav className="app-nav" style={{ background: '#fff', borderBottom: '1px solid #d7ddd7', padding: isMobile ? '10px 12px' : '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: 1, fontWeight: 800, fontSize: isMobile ? 20 : 28, color: '#284017', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Trophy size={isMobile ? 18 : 24} />{isMobile ? 'Admin' : 'Loyalty Race - Admin'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <a href="/" className="btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><House size={14} />{!isMobile && 'Inicio'}</a>
        <button className="btn-secondary btn-sm" onClick={onLogout} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LogOut size={14} />{!isMobile && 'Salir'}</button>
      </div>
    </nav>
  )
}

// ── Generic small modal ───────────────────────────────────────────────────────
function Modal({ title, onClose, width = 480, children }) {
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0006', display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'center', zIndex: 1000, padding: isMobile ? 8 : 0 }}>
      <div style={{ background: '#fff', border: '1px solid #d5ddd3', borderRadius: isMobile ? 10 : 12, padding: isMobile ? 14 : 24, width: isMobile ? 'calc(100vw - 16px)' : width, maxWidth: isMobile ? 'calc(100vw - 16px)' : width, maxHeight: isMobile ? '92vh' : '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, paddingRight: 8 }}>{title}</h3>
          <button style={{ background: 'none', border: 'none', color: '#607060', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }} onClick={onClose}><X size={18} /></button>
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

  const load = () => api.get(`/competitions/${competition.id}/categories`).then(r => setCats(r.data))
  useEffect(() => { load() }, [competition.id])

  const add = async (e) => {
    e.preventDefault()
    if (!nombre.trim()) return
    await api.post(`/competitions/${competition.id}/categories`, { nombre: nombre.trim() })
    setNombre('')
    load()
  }

  const remove = async (id) => {
    await api.delete(`/competitions/${competition.id}/categories/${id}`)
    load()
  }

  return (
    <Modal title={`Categorias - ${competition.nombre}`} onClose={onClose}>
      <form onSubmit={add} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Hombres, Mujeres, Master..." style={{ flex: 1 }} />
        <button type="submit" className="btn-primary btn-sm">Agregar</button>
      </form>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {cats.length === 0 && <p style={{ color: '#647063', textAlign: 'center', padding: 20 }}>Sin categorias definidas</p>}
        {cats.map(c => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 6, border: '1px solid #d5ddd3', marginBottom: 6 }}>
            <span style={{ fontSize: 14 }}>{c.nombre}</span>
            <button className="btn-danger btn-sm" onClick={() => remove(c.id)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={14} /></button>
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
  const [form, setForm] = useState({ nombre: '', measurement_method: 'unidades', winner_rule: 'higher_wins', descripcion: '', allow_multiple_results: 0, team_result_mode: 'sum_two', estado: 'pendiente' })
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
      drafts[ph.id] = {
        nombre: ph.nombre || '',
        measurement_method: normalizeMeasurementMethod(ph.measurement_method, ph.tipo),
        winner_rule: normalizeWinnerRule(ph.winner_rule, phaseTypeFromPhase(ph)),
        descripcion: ph.descripcion || '',
        allow_multiple_results: Number(ph.allow_multiple_results || 0),
        team_result_mode: ph.team_result_mode || 'sum_two',
        estado: ph.estado || 'pendiente',
      }
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
    await api.post(`/competitions/${competition.id}/phases`, { ...form, orden: phases.length })
    setForm({ nombre: '', measurement_method: 'unidades', winner_rule: 'higher_wins', descripcion: '', allow_multiple_results: 0, team_result_mode: 'sum_two', estado: 'pendiente' })
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

  const savePhase = async (phase) => {
    const d = phaseDrafts[phase.id] || {}
    setSavingPhaseId(phase.id)
    try {
      await api.put(`/competitions/${competition.id}/phases/${phase.id}`, {
        nombre: (d.nombre || '').trim() || phase.nombre,
        measurement_method: normalizeMeasurementMethod(d.measurement_method ?? phase.measurement_method, phaseTypeFromPhase(phase)),
        winner_rule: normalizeWinnerRule(d.winner_rule ?? phase.winner_rule, phaseTypeFromMethod(d.measurement_method ?? phase.measurement_method)),
        descripcion: (d.descripcion || '').trim() || null,
        allow_multiple_results: Number(d.allow_multiple_results || 0),
        team_result_mode: d.team_result_mode || 'sum_two',
        estado: d.estado || 'pendiente',
      })
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

  const phaseManagerContent = (
    <>
      <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr auto auto auto auto auto', gap: 8, marginBottom: 16, alignItems: 'end' }}>
        <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? '1 / -1' : 'auto' }}>
          <label>Nombre *</label>
          <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Fase 1: Carrera" required />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Metodo</label>
          <select value={form.measurement_method} onChange={e => setForm({ ...form, measurement_method: e.target.value, winner_rule: defaultWinnerRuleForType(phaseTypeFromMethod(e.target.value)) })}>
            {PHASE_MEASUREMENT_METHODS.map(m => <option key={m} value={m}>{PHASE_MEASUREMENT_LABELS[m] || m}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Gana</label>
          <select value={form.winner_rule} onChange={e => setForm({ ...form, winner_rule: e.target.value })}>
            <option value="higher_wins">Mayor valor</option>
            <option value="lower_wins">Menor valor</option>
          </select>
        </div>
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
        <button type="submit" className="btn-primary btn-sm" style={{ alignSelf: 'flex-end', width: isMobile ? '100%' : 'auto', gridColumn: isMobile ? '1 / -1' : 'auto' }}>
          + Agregar fase
        </button>
      </form>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {phases.length === 0 && <p style={{ color: '#647063', textAlign: 'center', padding: 20 }}>Sin fases definidas</p>}
        {phases.map((ph, i) => (
          <div key={ph.id} style={{ display: 'grid', gap: 8, padding: '10px', borderRadius: 8, border: '1px solid #d5ddd3', marginBottom: 8 }}>
            <span style={{ color: '#647063', fontSize: 12, width: 20 }}>{i + 1}</span>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Nombre</label>
              <input
                value={phaseDrafts[ph.id]?.nombre ?? ph.nombre}
                onChange={e => patchPhaseDraft(ph.id, 'nombre', e.target.value)}
              />
            </div>
            <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Metodo</label>
                <select
                  value={phaseDrafts[ph.id]?.measurement_method ?? normalizeMeasurementMethod(ph.measurement_method, phaseTypeFromPhase(ph))}
                  onChange={e => {
                    patchPhaseDraft(ph.id, 'measurement_method', e.target.value)
                    patchPhaseDraft(ph.id, 'winner_rule', defaultWinnerRuleForType(phaseTypeFromMethod(e.target.value)))
                  }}
                >
                  {PHASE_MEASUREMENT_METHODS.map(m => <option key={`phase-method-${ph.id}-${m}`} value={m}>{PHASE_MEASUREMENT_LABELS[m] || m}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Gana</label>
                <select
                  value={phaseDrafts[ph.id]?.winner_rule ?? normalizeWinnerRule(ph.winner_rule, phaseTypeFromPhase(ph))}
                  onChange={e => patchPhaseDraft(ph.id, 'winner_rule', e.target.value)}
                >
                  <option value="higher_wins">Mayor valor</option>
                  <option value="lower_wins">Menor valor</option>
                </select>
              </div>
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
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Descripcion</label>
              <input
                value={phaseDrafts[ph.id]?.descripcion ?? (ph.descripcion || '')}
                onChange={e => patchPhaseDraft(ph.id, 'descripcion', e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-primary btn-sm" onClick={() => savePhase(ph)} disabled={savingPhaseId === ph.id}>
                {savingPhaseId === ph.id ? 'Guardando...' : 'Guardar fase'}
              </button>
              <button className="btn-danger btn-sm" onClick={() => remove(ph.id)}>Eliminar</button>
              <span style={{ fontSize: 11, color: '#647063', alignSelf: 'center' }}>
                {`Actual: ${phaseTypeFromPhase(ph)} | ${PHASE_MEASUREMENT_LABELS[normalizeMeasurementMethod(ph.measurement_method, ph.tipo)] || normalizeMeasurementMethod(ph.measurement_method, ph.tipo)} | ${normalizeWinnerRule(ph.winner_rule, phaseTypeFromPhase(ph)) === 'lower_wins' ? 'gana menor' : 'gana mayor'} | ${Number(ph.allow_multiple_results) ? 'multiples' : 'unico'} | ${(ph.team_result_mode || 'sum_two') === 'single_member' ? 'equipo uno' : ((ph.team_result_mode || 'sum_two') === 'total' ? 'equipo total' : 'equipo ambos')} | ${ph.estado || 'pendiente'}${parseScoringRules(ph.scoring_rules).length ? ` | reglas: ${parseScoringRules(ph.scoring_rules).length}` : ''}`}
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
        <h4 style={{ marginBottom: 12, fontSize: 15 }}>Fases</h4>
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
  const toLocal = (iso) => iso ? iso.slice(0, 16) : ''
  const [form, setForm] = useState({
    enrollment_open: competition.enrollment_open || 0,
    enrollment_start: toLocal(competition.enrollment_start),
    enrollment_end: toLocal(competition.enrollment_end),
  })
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put(`/competitions/${competition.id}`, {
        enrollment_open: form.enrollment_open,
        enrollment_start: form.enrollment_start || null,
        enrollment_end: form.enrollment_end || null,
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', marginBottom: 12, borderBottom: '1px solid #222' }}>
          <span style={{ fontSize: 14 }}>Inscripciones abiertas</span>
          <button type="button"
            className={form.enrollment_open ? 'btn-success btn-sm' : 'btn-secondary btn-sm'}
            onClick={() => setForm(f => ({ ...f, enrollment_open: f.enrollment_open ? 0 : 1 }))}>
            {form.enrollment_open ? '? Abiertas' : 'Cerradas'}
          </button>
        </div>
        <div className="form-group">
          <label>Fecha inicio inscripciones</label>
          <input type="datetime-local" value={form.enrollment_start} onChange={e => setForm(f => ({ ...f, enrollment_start: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Fecha cierre inscripciones</label>
          <input type="datetime-local" value={form.enrollment_end} onChange={e => setForm(f => ({ ...f, enrollment_end: e.target.value }))} />
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
  const [modalTab, setModalTab] = useState('pendientes')
  const [allParticipants, setAllParticipants] = useState([])
  const [categories, setCategories] = useState([])
  const [enrollMap, setEnrollMap] = useState({})   // confirmed: pid -> { selected, categoria }
  const [pendingList, setPendingList] = useState([])
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const load = () => Promise.all([
    api.get('/participants'),
    api.get(`/competitions/${competition.id}/participants`),
    api.get(`/competitions/${competition.id}/categories`),
  ]).then(([pRes, eRes, cRes]) => {
    setAllParticipants(pRes.data)
    setCategories(cRes.data)
    const pending = eRes.data.filter(e => e.estado === 'pendiente')
    const confirmed = eRes.data.filter(e => e.estado === 'confirmado')
    setPendingList(pending)
    const map = {}
    confirmed.forEach(e => { map[e.id] = { selected: true, categoria: e.categoria_competencia || '' } })
    setEnrollMap(map)
    setModalTab(pending.length > 0 ? 'pendientes' : 'gestion')
  })

  useEffect(() => { load() }, [competition.id])

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
  const selectedCount = Object.values(enrollMap).filter(v => v.selected).length

  return (
    <Modal title={`Inscripciones - ${competition.nombre}`} onClose={onClose} width={640}>
      <div className="tabs" style={{ margin: '0 0 14px', border: 'none', gap: 4 }}>
        <button className={`tab ${modalTab === 'pendientes' ? 'active' : ''}`} onClick={() => setModalTab('pendientes')} style={{ padding: '4px 14px', fontSize: 13, position: 'relative' }}>
          Solicitudes
          {pendingList.length > 0 && (
            <span style={{ background: '#284017', color: '#fff', borderRadius: 10, padding: '0 6px', fontSize: 10, fontWeight: 700, marginLeft: 6 }}>
              {pendingList.length}
            </span>
          )}
        </button>
        <button className={`tab ${modalTab === 'gestion' ? 'active' : ''}`} onClick={() => setModalTab('gestion')} style={{ padding: '4px 14px', fontSize: 13 }}>
          Gestionar inscriptos
        </button>
      </div>

      {modalTab === 'pendientes' && (
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {pendingList.length === 0 ? (
            <p style={{ color: '#647063', textAlign: 'center', padding: 40 }}>No hay solicitudes pendientes</p>
          ) : (
            pendingList.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 6,
                border: '1px solid #f5a60033', background: '#f5a60011', marginBottom: 8
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nombre} {p.apellido}</div>
                  <div style={{ fontSize: 12, color: '#647063', marginTop: 2 }}>
                    {p.cedula}
                    {p.categoria_competencia && <span style={{ marginLeft: 8 }}>| Categoria: <b style={{ color: '#4d564b' }}>{p.categoria_competencia}</b></span>}
                  </div>
                </div>
                <button className="btn-success btn-sm" onClick={() => approveOrReject(p.id, 'confirmado')}>? Confirmar</button>
                <button className="btn-danger btn-sm" onClick={() => approveOrReject(p.id, 'rechazado')}>? Rechazar</button>
              </div>
            ))
          )}
        </div>
      )}

      {modalTab === 'gestion' && (
        <>
          <input placeholder="Buscar participante..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
          <div style={{ fontSize: 12, color: '#647063', marginBottom: 8 }}>{selectedCount} confirmados seleccionados</div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.map(p => {
              const enrolled = enrollMap[p.id]
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, marginBottom: 4,
                  border: `1px solid ${enrolled ? '#284017' : '#d5ddd3'}`,
                  background: enrolled ? '#28401711' : 'transparent',
                }}>
                  <input type="checkbox" checked={!!enrolled} onChange={() => toggle(p.id)} style={{ width: 'auto', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13 }}>{p.nombre} {p.apellido}</div>
                    <div style={{ fontSize: 11, color: '#647063' }}>{p.cedula}</div>
                  </div>
                  {enrolled && (
                    <select value={enrolled.categoria} onChange={e => setCategoria(p.id, e.target.value)}
                      style={{ fontSize: 12, width: 130, background: '#fff', border: '1px solid #cfd8ce', borderRadius: 4, padding: '3px 6px', color: '#4d564b' }}>
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
            {!filtered.length && <div style={{ color: '#647063', padding: 20, textAlign: 'center' }}>Sin resultados</div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar inscripciones'}</button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ── Competitions Tab ──────────────────────────────────────────────────────────
function CompetitionEditorModal({ mode, competition, onClose, onSaved }) {
  const isEdit = mode === 'edit'
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    activa: 0,
    allow_user_results: 0,
    show_individual_leaderboard: 1,
    show_team_all_by_category_option: 1,
    show_team_all_global_option: 1,
    enrollment_open: 0,
    enrollment_start: '',
    enrollment_end: '',
    scoring_mode: 'highest_wins',
  })
  const [cats, setCats] = useState([])
  const [newCat, setNewCat] = useState('')
  const [phases, setPhases] = useState([])
  const [newPhase, setNewPhase] = useState({ nombre: '', measurement_method: 'unidades', descripcion: '', team_result_mode: 'sum_two' })

  useEffect(() => {
    if (!isEdit || !competition) return
    const toLocal = (iso) => (iso ? iso.slice(0, 16) : '')
    setForm({
      nombre: competition.nombre || '',
      descripcion: competition.descripcion || '',
      activa: competition.activa || 0,
      allow_user_results: competition.allow_user_results || 0,
      show_individual_leaderboard: competition.show_individual_leaderboard == null ? 1 : competition.show_individual_leaderboard,
      show_team_all_by_category_option: competition.show_team_all_by_category_option == null ? 1 : competition.show_team_all_by_category_option,
      show_team_all_global_option: competition.show_team_all_global_option == null ? 1 : competition.show_team_all_global_option,
      enrollment_open: competition.enrollment_open || 0,
      enrollment_start: toLocal(competition.enrollment_start),
      enrollment_end: toLocal(competition.enrollment_end),
      scoring_mode: competition.scoring_mode || 'highest_wins',
    })
    Promise.all([
      api.get(`/competitions/${competition.id}/categories`),
      api.get(`/competitions/${competition.id}/phases`),
    ]).then(([catRes, phRes]) => {
      setCats(catRes.data.map(c => ({ id: c.id, nombre: c.nombre })))
      setPhases(phRes.data.map(p => ({
        id: p.id,
        nombre: p.nombre,
        measurement_method: normalizeMeasurementMethod(p.measurement_method, p.tipo),
        tipo: phaseTypeFromMethod(normalizeMeasurementMethod(p.measurement_method, p.tipo)),
        descripcion: p.descripcion || '',
        team_result_mode: p.team_result_mode || 'sum_two',
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
    const nombre = newCat.trim()
    if (!nombre) return
    setCats(prev => [...prev, { id: `new-cat-${Date.now()}`, nombre }])
    setNewCat('')
  }

  const removeCategory = (id) => {
    setCats(prev => prev.filter(c => c.id !== id))
  }

  const updateCategoryName = (id, value) => {
    setCats(prev => prev.map(c => (c.id === id ? { ...c, nombre: value } : c)))
  }

  const addPhase = () => {
    const nombre = newPhase.nombre.trim()
    if (!nombre) return
    setPhases(prev => [...prev, { id: `new-phase-${Date.now()}`, tipo: phaseTypeFromMethod(newPhase.measurement_method), nombre, measurement_method: newPhase.measurement_method, descripcion: newPhase.descripcion.trim(), team_result_mode: newPhase.team_result_mode }])
    setNewPhase({ nombre: '', measurement_method: 'unidades', descripcion: '', team_result_mode: 'sum_two' })
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

    const cleanCats = cats.map(c => c.nombre.trim()).filter(Boolean)
    const cleanPhases = phases
      .map(p => ({ ...p, nombre: p.nombre.trim(), descripcion: (p.descripcion || '').trim() }))
      .filter(p => p.nombre)

    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      activa: form.activa ? 1 : 0,
      allow_user_results: form.allow_user_results ? 1 : 0,
      show_individual_leaderboard: form.show_individual_leaderboard ? 1 : 0,
      show_team_all_by_category_option: form.show_team_all_by_category_option ? 1 : 0,
      show_team_all_global_option: form.show_team_all_global_option ? 1 : 0,
      enrollment_open: form.enrollment_open ? 1 : 0,
      enrollment_start: form.enrollment_start || null,
      enrollment_end: form.enrollment_end || null,
      scoring_mode: form.scoring_mode || 'highest_wins',
    }

    setSaving(true)
    try {
      let competitionId = competition?.id
      if (isEdit) {
        await api.put(`/competitions/${competition.id}`, payload)
      } else {
        const { data } = await api.post('/competitions', payload)
        competitionId = data.id
      }

      const existingCats = isEdit ? (await api.get(`/competitions/${competitionId}/categories`)).data : []
      await Promise.all(existingCats.map(c => api.delete(`/competitions/${competitionId}/categories/${c.id}`)))
      for (let i = 0; i < cleanCats.length; i += 1) {
        await api.post(`/competitions/${competitionId}/categories`, { nombre: cleanCats[i], orden: i })
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
          measurement_method: normalizeMeasurementMethod(phase.measurement_method, phaseTypeFromMethod(phase.measurement_method)),
          descripcion: phase.descripcion || null,
          team_result_mode: phase.team_result_mode || 'sum_two',
          orden: i,
        }
        if (Number.isInteger(phase.id)) {
          await api.put(`/competitions/${competitionId}/phases/${phase.id}`, phasePayload)
        } else {
          await api.post(`/competitions/${competitionId}/phases`, phasePayload)
        }
      }

      onSaved(isEdit ? 'Competencia actualizada' : 'Competencia creada')
      onClose()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo guardar la competencia' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={isEdit ? `Editar competencia - ${competition?.nombre || ''}` : 'Nueva competencia'} onClose={onClose} width={760}>
      <form onSubmit={save} style={{ overflowY: 'auto', paddingRight: 4 }}>
        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Nombre *</label>
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Descripcion</label>
            <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
          <button type="button" className={form.activa ? 'btn-success btn-sm' : 'btn-secondary btn-sm'} onClick={() => setForm(f => ({ ...f, activa: f.activa ? 0 : 1 }))}>
            {form.activa ? 'Publicada' : 'Borrador'}
          </button>
          <button type="button" className={form.allow_user_results ? 'btn-success btn-sm' : 'btn-secondary btn-sm'} onClick={() => setForm(f => ({ ...f, allow_user_results: f.allow_user_results ? 0 : 1 }))}>
            {form.allow_user_results ? 'Resultados de usuario: SI' : 'Resultados de usuario: NO'}
          </button>
          <button type="button" className={form.show_individual_leaderboard ? 'btn-success btn-sm' : 'btn-secondary btn-sm'} onClick={() => setForm(f => ({ ...f, show_individual_leaderboard: f.show_individual_leaderboard ? 0 : 1 }))}>
            {form.show_individual_leaderboard ? 'Leaderboard individual: SI' : 'Leaderboard individual: NO'}
          </button>
          <button type="button" className={form.show_team_all_by_category_option ? 'btn-success btn-sm' : 'btn-secondary btn-sm'} onClick={() => setForm(f => ({ ...f, show_team_all_by_category_option: f.show_team_all_by_category_option ? 0 : 1 }))}>
            {form.show_team_all_by_category_option ? 'Equipos: Todos por categoria SI' : 'Equipos: Todos por categoria NO'}
          </button>
          <button type="button" className={form.show_team_all_global_option ? 'btn-success btn-sm' : 'btn-secondary btn-sm'} onClick={() => setForm(f => ({ ...f, show_team_all_global_option: f.show_team_all_global_option ? 0 : 1 }))}>
            {form.show_team_all_global_option ? 'Equipos: Todos global SI' : 'Equipos: Todos global NO'}
          </button>
          <button type="button" className={form.enrollment_open ? 'btn-success btn-sm' : 'btn-secondary btn-sm'} onClick={() => setForm(f => ({ ...f, enrollment_open: f.enrollment_open ? 0 : 1 }))}>
            {form.enrollment_open ? 'Inscripciones abiertas' : 'Inscripciones cerradas'}
          </button>
          <button type="button" className={form.scoring_mode === 'lowest_wins' ? 'btn-success btn-sm' : 'btn-secondary btn-sm'} onClick={() => setForm(f => ({ ...f, scoring_mode: f.scoring_mode === 'lowest_wins' ? 'highest_wins' : 'lowest_wins' }))}>
            {form.scoring_mode === 'lowest_wins' ? 'Menor puntaje gana' : 'Mayor puntaje gana'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div className="form-group">
            <label>Inicio de inscripciones</label>
            <input type="datetime-local" value={form.enrollment_start} onChange={e => setForm(f => ({ ...f, enrollment_start: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Cierre de inscripciones</label>
            <input type="datetime-local" value={form.enrollment_end} onChange={e => setForm(f => ({ ...f, enrollment_end: e.target.value }))} />
          </div>
        </div>

        <div style={{ borderTop: '1px solid #222', paddingTop: 14, marginTop: 6 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 14 }}>Categorias</h4>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Ej: Elite, Open, Masters..." />
            <button type="button" className="btn-secondary btn-sm" onClick={addCategory}>Agregar</button>
          </div>
          {cats.length === 0 && <div style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>Sin categorias</div>}
          <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
            {cats.map((cat, idx) => (
              <div key={cat.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 8, alignItems: 'center' }}>
                <span style={{ color: '#666', fontSize: 12 }}>{idx + 1}</span>
                <input value={cat.nombre} onChange={e => updateCategoryName(cat.id, e.target.value)} />
                <button type="button" className="btn-danger btn-sm" onClick={() => removeCategory(cat.id)}>x</button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderTop: '1px solid #222', paddingTop: 14, marginTop: 6 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 14 }}>Fases</h4>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr 2fr auto', gap: 8, marginBottom: 8 }}>
            <input value={newPhase.nombre} onChange={e => setNewPhase(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre de fase" />
            <select value={newPhase.measurement_method} onChange={e => setNewPhase(p => ({ ...p, measurement_method: e.target.value }))}>
              {PHASE_MEASUREMENT_METHODS.map(m => <option key={m} value={m}>{PHASE_MEASUREMENT_LABELS[m] || m}</option>)}
            </select>
            <select value={newPhase.team_result_mode} onChange={e => setNewPhase(p => ({ ...p, team_result_mode: e.target.value }))}>
              <option value="sum_two">Equipo: ambos</option>
              <option value="total">Equipo: total</option>
              <option value="single_member">Equipo: uno</option>
            </select>
            <input value={newPhase.descripcion} onChange={e => setNewPhase(p => ({ ...p, descripcion: e.target.value }))} placeholder="Descripcion (opcional)" />
            <button type="button" className="btn-secondary btn-sm" onClick={addPhase}>Agregar</button>
          </div>
          {phases.length === 0 && <div style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>Sin fases</div>}
          <div style={{ display: 'grid', gap: 6 }}>
            {phases.map((phase, idx) => (
              <div key={phase.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '28px 2fr 1fr 1fr 2fr auto', gap: 8, alignItems: 'center' }}>
                <span style={{ color: '#666', fontSize: 12 }}>{idx + 1}</span>
                <input value={phase.nombre} onChange={e => updatePhase(phase.id, 'nombre', e.target.value)} />
                <select value={normalizeMeasurementMethod(phase.measurement_method, phase.tipo)} onChange={e => updatePhase(phase.id, 'measurement_method', e.target.value)}>
                  {PHASE_MEASUREMENT_METHODS.map(m => <option key={m} value={m}>{PHASE_MEASUREMENT_LABELS[m] || m}</option>)}
                </select>
                <select value={phase.team_result_mode || 'sum_two'} onChange={e => updatePhase(phase.id, 'team_result_mode', e.target.value)}>
                  <option value="sum_two">Equipo: ambos</option>
                  <option value="total">Equipo: total</option>
                  <option value="single_member">Equipo: uno</option>
                </select>
                <input value={phase.descripcion} onChange={e => updatePhase(phase.id, 'descripcion', e.target.value)} />
                <button type="button" className="btn-danger btn-sm" onClick={() => removePhase(phase.id)}>x</button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear competencia'}
          </button>
        </div>
      </form>
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
  const [catsComp, setCatsComp] = useState(null)
  const [enrollCounts, setEnrollCounts] = useState({})
  const [selectedCompetition, setSelectedCompetition] = useState(null)
  const [selectedTab, setSelectedTab] = useState('details')
  const [selectedParticipants, setSelectedParticipants] = useState([])
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))

  const load = () => api.get('/competitions').then(r => {
    setCompetitions(r.data)
    r.data.forEach(c => {
      api.get(`/competitions/${c.id}/participants`).then(res =>
        setEnrollCounts(prev => ({ ...prev, [c.id]: res.data.length }))
      )
    })
  })
  useEffect(() => { load() }, [])

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
    setSelectedTab('details')
    try {
      const res = await api.get(`/competitions/${comp.id}/participants`)
      setSelectedParticipants(res.data || [])
    } catch {
      setSelectedParticipants([])
    }
  }

  const refreshSelectedParticipants = async () => {
    if (!selectedCompetition) return
    try {
      const res = await api.get(`/competitions/${selectedCompetition.id}/participants`)
      setSelectedParticipants(res.data || [])
      setEnrollCounts(prev => ({ ...prev, [selectedCompetition.id]: (res.data || []).length }))
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
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div>
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
            {competitions.map(c => (
              <div key={c.id} className="card" style={{ padding: 14, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{c.nombre}</div>
                    <div style={{ color: '#647063', fontSize: 12, marginTop: 2 }}>{c.descripcion || 'Sin descripcion'}</div>
                  </div>
                  <span className={c.activa ? 'badge badge-masters' : 'badge badge-default'}>
                    {c.activa ? 'Activa' : 'Inactiva'}
                  </span>
                </div>

                <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ border: '1px solid #d5ddd3', borderRadius: 8, padding: '8px 10px', background: '#fff' }}>
                    <div style={{ color: '#647063', fontSize: 11, marginBottom: 2 }}>Resultados de usuario</div>
                    <div style={{ fontWeight: 600 }}>{c.allow_user_results ? 'Habilitado' : 'Deshabilitado'}</div>
                  </div>
                  <div style={{ border: '1px solid #d5ddd3', borderRadius: 8, padding: '8px 10px', background: '#fff' }}>
                    <div style={{ color: '#647063', fontSize: 11, marginBottom: 2 }}>Inscripciones</div>
                    <div style={{ fontWeight: 600 }}>{enrollCounts[c.id] ?? '-'} registrados</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn-primary btn-sm" onClick={() => openCompetition(c)}>Gestionar</button>
                  <button className="btn-secondary btn-sm" onClick={() => setEnrollingComp(c)}>Inscripciones</button>
                  <button className="btn-secondary btn-sm" onClick={() => setEditor({ mode: 'edit', competition: c })}>Editar</button>
                  <button className="btn-danger btn-sm" onClick={() => deleteCompetition(c)}>Eliminar</button>
                </div>
              </div>
            ))}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-secondary btn-sm" onClick={() => setSelectedCompetition(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <ArrowLeft size={14} />
                Volver
              </button>
              <span style={{ fontWeight: 700, fontSize: isMobile ? 15 : 17 }}>{selectedCompetition.nombre}</span>
            </div>
            <a href={`/leaderboard/${selectedCompetition.id}`} target="_blank" rel="noreferrer" style={{ color: '#284017', fontSize: 13, whiteSpace: 'nowrap' }}>Abrir leaderboard</a>
          </div>

          {isMobile ? (
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Seccion de la competencia</label>
              <select value={selectedTab} onChange={e => setSelectedTab(e.target.value)}>
                <option value="details">Detalles</option>
                <option value="phases">Fases</option>
                <option value="participants">Participantes</option>
                <option value="teams">Equipos</option>
                <option value="results">Resultados</option>
                <option value="timer">Cronometro</option>
                <option value="tv">Modo TV</option>
                <option value="summary">Resumen</option>
              </select>
            </div>
          ) : (
            <div className="tabs" style={{ marginBottom: 14 }}>
              <button className={`tab ${selectedTab === 'details' ? 'active' : ''}`} onClick={() => setSelectedTab('details')}>Detalles</button>
              <button className={`tab ${selectedTab === 'phases' ? 'active' : ''}`} onClick={() => setSelectedTab('phases')}>Fases</button>
              <button className={`tab ${selectedTab === 'participants' ? 'active' : ''}`} onClick={() => setSelectedTab('participants')}>Participantes</button>
              <button className={`tab ${selectedTab === 'teams' ? 'active' : ''}`} onClick={() => setSelectedTab('teams')}>Equipos</button>
              <button className={`tab ${selectedTab === 'results' ? 'active' : ''}`} onClick={() => setSelectedTab('results')}>Resultados</button>
              <button className={`tab ${selectedTab === 'timer' ? 'active' : ''}`} onClick={() => setSelectedTab('timer')}>Cronometro</button>
              <button className={`tab ${selectedTab === 'tv' ? 'active' : ''}`} onClick={() => setSelectedTab('tv')}>Modo TV</button>
              <button className={`tab ${selectedTab === 'summary' ? 'active' : ''}`} onClick={() => setSelectedTab('summary')}>Resumen</button>
            </div>
          )}

          {selectedTab === 'details' && (
            <div className="card">
              <h4 style={{ marginBottom: 10, fontSize: 15 }}>Configuracion</h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <button className="btn-secondary btn-sm" onClick={() => setEditor({ mode: 'edit', competition: selectedCompetition })}>Editar datos</button>
                <button className="btn-secondary btn-sm" onClick={() => setCatsComp(selectedCompetition)}>Categorias</button>
                <button className="btn-secondary btn-sm" onClick={() => setSelectedTab('phases')}>Fases</button>
                <button className="btn-secondary btn-sm" onClick={() => setEnrollingComp(selectedCompetition)}>Inscripciones</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 6 : 10, fontSize: isMobile ? 13 : 14 }}>
                <div><b>Descripcion:</b> {selectedCompetition.descripcion || '-'}</div>
                <div><b>Inscritos:</b> {enrollCounts[selectedCompetition.id] ?? 0}</div>
                <div><b>Estado:</b> {selectedCompetition.activa ? 'Activa' : 'Inactiva'}</div>
                <div><b>Modo de puntuacion:</b> {selectedCompetition.scoring_mode === 'lowest_wins' ? 'Menor puntaje gana' : 'Mayor puntaje gana'}</div>
                <div><b>Resultados usuario:</b> {selectedCompetition.allow_user_results ? 'Si' : 'No'}</div>
                <div><b>Leaderboard individual:</b> {selectedCompetition.show_individual_leaderboard ? 'Si' : 'No'}</div>
                <div><b>Equipos - Todos por categoria:</b> {selectedCompetition.show_team_all_by_category_option ? 'Si' : 'No'}</div>
                <div><b>Equipos - Todos global:</b> {selectedCompetition.show_team_all_global_option ? 'Si' : 'No'}</div>
                <div><b>TV - Mostrar QR:</b> {selectedCompetition.tv_show_qr ? 'Si' : 'No'}</div>
                <div><b>TV - Mostrar cronometro:</b> {selectedCompetition.tv_show_timer ? 'Si' : 'No'}</div>
                <div><b>TV - Incluir vista Total:</b> {selectedCompetition.tv_include_total_slide ? 'Si' : 'No'}</div>
                <div><b>TV - Solo fases finalizadas:</b> {selectedCompetition.tv_only_finalized_phases ? 'Si' : 'No'}</div>
                <div><b>TV - Modo:</b> {selectedCompetition.tv_mode === 'static' ? 'Estatico' : 'Ciclico'}</div>
                <div><b>TV - Vista fija:</b> {selectedCompetition.tv_static_view === 'teams' ? 'Equipos' : 'Individual'}</div>
                <div><b>TV - Rotacion:</b> {selectedCompetition.tv_rotation_interval_seconds || 24}s</div>
                <div><b>TV - Refresco:</b> {selectedCompetition.tv_data_refresh_interval_seconds || 5}s</div>
              </div>
            </div>
          )}

          {selectedTab === 'phases' && <PhasesModal competition={selectedCompetition} inline />}
          {selectedTab === 'participants' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h4 style={{ margin: 0, fontSize: 15 }}>Participantes de la competencia</h4>
                <button className="btn-primary btn-sm" onClick={() => setEnrollingComp(selectedCompetition)}>Gestionar inscripciones</button>
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
                    </div>
                  ))}
                </div>
              ) : (
                <table>
                  <thead><tr><th>Participante</th><th>Cedula</th><th>Categoria</th><th>Estado</th></tr></thead>
                  <tbody>
                    {selectedParticipants.map(p => (
                      <tr key={p.id}>
                        <td>{p.nombre} {p.apellido}</td>
                        <td>{p.cedula}</td>
                        <td>{p.categoria_competencia || '-'}</td>
                        <td>{p.estado}</td>
                      </tr>
                    ))}
                    {!selectedParticipants.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#666', padding: 16 }}>Sin participantes</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {selectedTab === 'teams' && <CompetitionTeamsPanel competition={selectedCompetition} />}
          {selectedTab === 'results' && <CompetitionResultsPanel competition={selectedCompetition} />}
          {selectedTab === 'timer' && <CompetitionTimerPanel competition={selectedCompetition} />}
          {selectedTab === 'tv' && (
            <CompetitionTvPanel
              competition={selectedCompetition}
              onSaved={(updated) => setSelectedCompetition(updated)}
            />
          )}
          {selectedTab === 'summary' && <CompetitionSummaryPanel competitionId={selectedCompetition.id} />}
        </div>
      )}

      {catsComp && <CategoriesModal competition={catsComp} onClose={() => setCatsComp(null)} />}
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
            api.get(`/competitions/${enrollingComp.id}/participants`).then(res => {
              setEnrollCounts(prev => ({ ...prev, [enrollingComp.id]: res.data.length }))
              if (selectedCompetition?.id === enrollingComp.id) {
                setSelectedParticipants(res.data || [])
              }
            })
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
  const [form, setForm] = useState({ cedula: '', nombre: '', apellido: '', email: '', celular: '', sexo: 'M', categoria: 'Rx', estado: 'activo' })
  const [editingParticipant, setEditingParticipant] = useState(null)
  const [editForm, setEditForm] = useState({ cedula: '', nombre: '', apellido: '', email: '', celular: '', sexo: 'M', categoria: 'Rx', estado: 'activo' })
  const [msg, setMsg] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [importCompId, setImportCompId] = useState('')
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const fileRef = useRef()

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

  const create = async (e) => {
    e.preventDefault()
    try {
      await api.post('/participants', form)
      setMsg({ type: 'success', text: 'Participante creado' })
      setShowForm(false)
      setForm({ cedula: '', nombre: '', apellido: '', email: '', celular: '', sexo: 'M', categoria: 'Rx', estado: 'activo' })
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
    setEditingParticipant(p)
    setEditForm({
      cedula: p.cedula || '',
      nombre: p.nombre || '',
      apellido: p.apellido || '',
      email: p.email || '',
      celular: p.celular || '',
      sexo: p.sexo || 'M',
      categoria: p.categoria || 'Rx',
      estado: p.estado || 'activo',
    })
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if (!editingParticipant) return
    try {
      await api.put(`/participants/${editingParticipant.id}`, editForm)
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
              <div className="form-group"><label>Sexo</label>
                <select value={form.sexo} onChange={e => setForm({ ...form, sexo: e.target.value })}>
                  {SEXOS.map(s => <option key={s}>{s}</option>)}
                </select>
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
                <div><b>Sexo:</b> {p.sexo || '-'}</div>
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
            <tr><th>#</th><th>Cedula</th><th>Nombre</th><th>Categoria</th><th>Sexo</th><th>Email</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {participants.map((p, i) => (
              <tr key={p.id}>
                <td style={{ color: '#647063' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{p.cedula}</td>
                <td>{p.nombre} {p.apellido}</td>
                <td>{categoryBadge(p.categoria)}</td>
                <td>{p.sexo || '-'}</td>
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
            {!participants.length && <tr><td colSpan={8} style={{ color: '#647063', textAlign: 'center', padding: 24 }}>No hay participantes</td></tr>}
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
              <div className="form-group"><label>Sexo</label>
                <select value={editForm.sexo} onChange={e => setEditForm({ ...editForm, sexo: e.target.value })}>
                  {SEXOS.map(s => <option key={s}>{s}</option>)}
                </select>
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
        {filterComp && <span style={{ fontSize: 12, color: '#647063' }}>{participantPool.length} inscriptos confirmados</span>}
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
  const navigate = useNavigate()
  const [mainTab, setMainTab] = useState('competitions')
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const logout = () => {
    localStorage.clear()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <NavBar onLogout={logout} />
      <div className="app-container" style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '14px 12px' : '24px 20px' }}>
        <div className="tabs" style={{ marginBottom: 16, overflowX: 'auto', whiteSpace: 'nowrap', flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          <button className={`tab ${mainTab === 'competitions' ? 'active' : ''}`} onClick={() => setMainTab('competitions')} style={{ flexShrink: 0 }}>
            Competencias
          </button>
          <button className={`tab ${mainTab === 'athletes' ? 'active' : ''}`} onClick={() => setMainTab('athletes')} style={{ flexShrink: 0 }}>
            Atletas / Usuarios
          </button>
        </div>
        {mainTab === 'competitions' && <CompetitionsTab />}
        {mainTab === 'athletes' && <ParticipantsTab />}
      </div>
    </div>
  )
}

















