import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Paperclip, Pencil, Save, Send, Trophy } from 'lucide-react'
import api from '../api/axios'
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
  error: '#EF4444',
}

const DNF_MARK_HIGH = 2147483647
const DNF_MARK_LOW = -2147483648

function Pill({ children, tone = colors.border }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 26, padding: '5px 9px', borderRadius: 999, border: `1px solid ${tone}66`, background: `${tone}18`, color: colors.text, fontSize: 11, fontWeight: 850, whiteSpace: 'nowrap' }}>{children}</span>
}

function Button({ children, tone = 'default', ...props }) {
  const bg = tone === 'primary' ? colors.primary : tone === 'danger' ? colors.error : tone === 'accent' ? 'rgba(0,194,168,0.14)' : colors.top
  const border = tone === 'accent' ? 'rgba(0,194,168,0.48)' : tone === 'default' ? colors.border : bg
  return <button {...props} type="button" style={{ border: `1px solid ${border}`, background: bg, color: colors.text, borderRadius: 8, minHeight: 38, padding: '8px 11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontWeight: 900, opacity: props.disabled ? 0.5 : 1 }}>{children}</button>
}

function Field({ label, children }) {
  return <label style={{ display: 'grid', gap: 6, minWidth: 0 }}><span style={{ color: colors.secondary, fontSize: 12, fontWeight: 850 }}>{label}</span>{children}</label>
}

function inputStyle() {
  return { width: '100%', minHeight: 38, border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.top, color: colors.text, padding: '8px 10px', fontWeight: 750 }
}

function preventNumberInputWheel(event) {
  if (event.currentTarget?.type !== 'number') return
  event.currentTarget.blur()
}

function isTimePhase(phase) {
  return ['for_time', 'tiempo_hms', 'tiempo'].includes(String(phase?.measurement_method || phase?.tipo || '').toLowerCase())
}

function formatSeconds(totalSeconds) {
  if (!Number.isFinite(Number(totalSeconds))) return ''
  const safe = Math.max(0, Math.round(Number(totalSeconds)))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
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

function parseTimeInput(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (/^\d+$/.test(raw)) {
    const parts = clockPartsFromDigits(raw)
    if (parts) return (parts.hours * 3600) + (parts.minutes * 60) + parts.seconds
    return Number(raw)
  }
  const parts = raw.split(':').map((item) => item.trim())
  if (parts.length !== 2 && parts.length !== 3) return null
  const nums = parts.map(Number)
  if (nums.some((item) => !Number.isFinite(item) || item < 0)) return null
  let hours = 0
  let minutes = 0
  let seconds = 0
  if (nums.length === 2) {
    ;[minutes, seconds] = nums
  } else {
    ;[hours, minutes, seconds] = nums
  }
  if (minutes > 59 || seconds > 59) return null
  return (hours * 3600) + (minutes * 60) + seconds
}

function lowerIsBetter(phase) {
  const winner = String(phase?.winner_rule || '').toLowerCase()
  if (winner === 'lower_wins') return true
  if (winner === 'higher_wins') return false
  return isTimePhase(phase) || String(phase?.tipo || '').toLowerCase() === 'posicion'
}

function tiebreakLowerIsBetter(phase) {
  return ['for_time', 'tiempo_hms', 'tiempo', 'posicion'].includes(String(phase?.tie_break_method || 'for_time').toLowerCase())
}

function entityKey(item) {
  return item.team_id ? `team-${item.team_id}` : `user-${item.user_id}`
}

function rowKey(phaseId, item) {
  return `${phaseId}:${entityKey(item)}`
}

function isDnfMark(value) {
  return Number(value) === DNF_MARK_HIGH || Number(value) === DNF_MARK_LOW
}

function compactHeatLabel(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const match = raw.match(/heat\s*\d+/i)
  return match ? match[0].replace(/\s+/, ' ').replace(/^heat/i, 'Heat') : raw
}

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

function scoringTablePoints(table, position) {
  const rows = Array.isArray(table) && table.length ? table : defaultScoringTable
  const row = rows.find((item) => Number(item.rank) === Number(position))
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

function previewPointsForScoring(config, position, totalRanked, mark) {
  if (isDnfMark(mark)) return 0
  const system = String(config?.system || 'dynamic_points').trim().toLowerCase()
  let base = Math.max(0, Number(totalRanked || 0) - Number(position || 0) + 1)
  if (system === 'placement') base = Number(position || 0)
  if (system === 'fixed_table') base = scoringTablePoints(config?.table, position)
  if (system === 'auto_table') base = autoTablePoints(position, totalRanked)
  if (system === 'dynamic_step') base = Math.max(0, Number(totalRanked || 0) - Number(position || 0) + 1) * normalizePointStep(config?.point_step ?? config?.scoring_point_step)
  if (system === 'cumulative') base = Number(mark || 0)
  const weight = Number(config?.weight_percent ?? 100)
  return Math.round(base * weight / 100)
}

function ScoreTable({ assignment, phases, notify }) {
  const [phaseId, setPhaseId] = useState(phases[0]?.id ? String(phases[0].id) : '')
  const [options, setOptions] = useState({ items: [], heats: [] })
  const [category, setCategory] = useState('')
  const [heatId, setHeatId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [marks, setMarks] = useState({})
  const [editing, setEditing] = useState({})
  const [activeEditor, setActiveEditor] = useState(null)

  useEffect(() => {
    if (!phaseId && phases[0]?.id) setPhaseId(String(phases[0].id))
  }, [phaseId, phases])

  const phase = phases.find((item) => String(item.id) === String(phaseId))
  const loadOptions = async () => {
    if (!assignment?.competition_id || !phaseId) return
    setLoading(true)
    try {
      const { data } = await api.get(`/judge/competitions/${assignment.competition_id}/score/manual-options`, {
        params: { phase_id: Number(phaseId), status: 'all' },
      })
      setOptions({
        items: Array.isArray(data?.items) ? data.items : [],
        heats: Array.isArray(data?.heats) ? data.heats : [],
      })
      setMarks({})
      setEditing({})
      setActiveEditor(null)
      setSearch('')
    } catch (error) {
      setOptions({ items: [], heats: [] })
      notify(error.response?.data?.detail || 'No se pudo cargar la lista de atletas.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.competition_id, phaseId])

  useEffect(() => {
    if (!activeEditor) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.classList.add('fr-modal-open')
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.classList.remove('fr-modal-open')
      document.body.style.overflow = previousOverflow
    }
  }, [activeEditor])

  const categories = useMemo(() => (
    Array.from(new Set((options.items || []).map((item) => String(item.category || 'Sin categoria').trim() || 'Sin categoria')))
      .sort((a, b) => a.localeCompare(b))
  ), [options.items])
  const activeCategory = categories.includes(category) ? category : categories[0] || ''
  const categoryRows = (options.items || []).filter((item) => String(item.category || 'Sin categoria') === String(activeCategory || 'Sin categoria'))
  const heatOptions = useMemo(() => {
    const map = new Map()
    categoryRows.forEach((item) => {
      if (!item.heat_id) return
      map.set(String(item.heat_id), {
        id: String(item.heat_id),
        nombre: compactHeatLabel(item.heat_name || options.heats.find((heat) => String(heat.id) === String(item.heat_id))?.nombre || `Heat ${item.heat_id}`),
      })
    })
    return Array.from(map.values()).sort((a, b) => Number(a.id) - Number(b.id))
  }, [categoryRows, options.heats])
  const activeHeatId = heatOptions.some((heat) => String(heat.id) === String(heatId)) ? heatId : (heatOptions[0]?.id || '')
  const heatLabelForRow = (row) => compactHeatLabel(row?.heat_name || options.heats.find((heat) => String(heat.id) === String(row?.heat_id))?.nombre || '')
  const heatRows = activeHeatId
    ? categoryRows.filter((item) => String(item.heat_id || '') === String(activeHeatId))
    : categoryRows
  const normalizedSearch = search.trim().toLowerCase()
  const rows = normalizedSearch
    ? heatRows.filter((item) => [
        item.display_name,
        item.heat_name,
        item.category,
        item.lane_number ? `carril ${item.lane_number}` : '',
        item.lane_number ? String(item.lane_number) : '',
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch)))
    : heatRows

  const setField = (row, field, value) => {
    const key = rowKey(phaseId, row)
    setMarks((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }))
  }
  const setMarkField = (row, value) => {
    const nextValue = isTimePhase(phase) ? formatTimeEntryInput(value) : value
    const parsed = isTimePhase(phase) ? parseTimeInput(nextValue) : null
    if (timeCapSeconds && parsed !== null && parsed > timeCapSeconds) {
      setField(row, 'marca', timeCapLabel)
      return
    }
    setField(row, 'marca', nextValue)
  }
  const dnfMark = () => lowerIsBetter(phase) ? DNF_MARK_HIGH : DNF_MARK_LOW
  const markValue = (row) => {
    const key = rowKey(phaseId, row)
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'capDnf') && marks[key].capDnf === true) return timeCapLabel
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'marca')) return marks[key].marca
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'dnf') && marks[key].dnf === false && isDnfMark(row.existing_mark)) return ''
    if (isTimePhase(phase) && row.existing_mark != null && !isDnfMark(row.existing_mark)) return row.existing_formatted || formatSeconds(row.existing_mark)
    return row.existing_mark ?? ''
  }
  const tbValue = (row) => {
    const key = rowKey(phaseId, row)
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'tiebreak')) return marks[key].tiebreak
    return row.existing_tiebreak ?? ''
  }
  const extraValue = (row) => {
    const key = rowKey(phaseId, row)
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'extra')) return marks[key].extra
    return row.existing_extra ?? ''
  }
  const isDnf = (row) => {
    const key = rowKey(phaseId, row)
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'capDnf') && marks[key].capDnf === true) return false
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'dnf')) return !!marks[key].dnf
    return isDnfMark(row.existing_mark)
  }
  const parseMark = (value) => {
    if (isTimePhase(phase)) return parseTimeInput(value)
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  const timeCapSeconds = isTimePhase(phase) && Number(phase?.time_cap_seconds) > 0 ? Number(phase.time_cap_seconds) : null
  const timeCapLabel = timeCapSeconds ? formatSeconds(timeCapSeconds) : ''
  const showCapReps = !!timeCapSeconds
  const isCapDnf = (row) => {
    if (!showCapReps) return false
    const key = rowKey(phaseId, row)
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'capDnf')) return !!marks[key].capDnf
    return Number(row.existing_mark) === Number(timeCapSeconds) && row.existing_extra !== null && row.existing_extra !== undefined
  }
  const isAtTimeCap = (row) => showCapReps && parseMark(markValue(row)) === timeCapSeconds
  const setDnfResult = (row, currentDnf) => {
    if (showCapReps) {
      const key = rowKey(phaseId, row)
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
    setField(row, 'dnf', !currentDnf)
  }
  const openScoreEditor = (row) => {
    setActiveEditor(row)
  }
  const closeScoreEditor = () => {
    setActiveEditor(null)
  }

  const preview = useMemo(() => {
    const lb = lowerIsBetter(phase)
    const tbLb = tiebreakLowerIsBetter(phase)
    const scoring = phase?.scoring || { system: 'dynamic_points', scope: 'category', weight_percent: 100, table: [] }
    const pool = (options.items || []).map((item) => {
      const key = rowKey(phaseId, item)
      const draft = marks[key] || {}
      const capDnf = !!draft.capDnf
      const dnf = !!draft.dnf && !capDnf
      const marca = dnf ? dnfMark() : capDnf ? timeCapLabel : Object.prototype.hasOwnProperty.call(draft, 'marca') ? draft.marca : item.existing_mark
      const extra = phase?.extra_enabled && !dnf
        ? Object.prototype.hasOwnProperty.call(draft, 'extra') ? draft.extra : item.existing_extra
        : null
      const tiebreak = phase?.tie_break_enabled && !dnf
        ? Object.prototype.hasOwnProperty.call(draft, 'tiebreak') ? draft.tiebreak : item.existing_tiebreak
        : null
      return {
        key,
        category: scoring.scope === 'global' ? '__global__' : (item.category || 'Sin categoria'),
        marca: marca === '' || marca == null ? null : (isTimePhase(phase) && !isDnfMark(Number(marca)) ? parseTimeInput(marca) : Number(marca)),
        extra: extra === '' || extra == null || (isTimePhase(phase) && (!timeCapSeconds || parseMark(marca) !== timeCapSeconds)) ? null : Number(extra),
        tiebreak: tiebreak === '' || tiebreak == null ? null : Number(tiebreak),
      }
    }).filter((item) => item.marca !== null && !Number.isNaN(item.marca))
    const groups = pool.reduce((map, item) => {
      map[item.category] = map[item.category] || []
      map[item.category].push(item)
      return map
    }, {})
    const out = {}
    Object.values(groups).forEach((group) => {
      const ordered = [...group].sort((a, b) => a.marca !== b.marca ? (lb ? a.marca - b.marca : b.marca - a.marca) : 0)
      let pos = 1
      let index = 0
      while (index < ordered.length) {
        const mark = ordered[index].marca
        const sameMark = []
        while (index < ordered.length && ordered[index].marca === mark) sameMark.push(ordered[index++])
        const extraChunks = sameMark.length > 1 && sameMark.every((item) => item.extra != null && !Number.isNaN(item.extra))
          ? [...sameMark].sort((a, b) => a.extra - b.extra).reduce((list, item) => {
              const last = list[list.length - 1]
              if (last && last[0].extra === item.extra) last.push(item)
              else list.push([item])
              return list
            }, [])
          : [sameMark]
        const chunks = extraChunks.flatMap((extraChunk) => extraChunk.length > 1 && extraChunk.every((item) => item.tiebreak != null && !Number.isNaN(item.tiebreak))
          ? [...extraChunk].sort((a, b) => tbLb ? a.tiebreak - b.tiebreak : b.tiebreak - a.tiebreak).reduce((list, item) => {
              const last = list[list.length - 1]
              if (last && last[0].tiebreak === item.tiebreak) last.push(item)
              else list.push([item])
              return list
            }, [])
          : [extraChunk])
        chunks.forEach((chunk) => {
          const points = previewPointsForScoring(scoring, pos, ordered.length, chunk[0]?.marca)
          chunk.forEach((item) => { out[item.key] = { posicion: pos, puntos: points } })
          pos += chunk.length
        })
      }
    })
    return out
  }, [options.items, marks, phase, phaseId])

  const saveRow = async (row) => {
    const capDnf = isCapDnf(row)
    const dnf = isDnf(row) && !capDnf
    const mark = markValue(row)
    if (!dnf && mark === '') {
      notify('Ingresa una marca o DNF', 'error')
      return false
    }
    const parsedMark = dnf ? dnfMark() : capDnf ? timeCapSeconds : parseMark(mark)
    if (!dnf && parsedMark === null) {
      notify(isTimePhase(phase) ? 'Tiempo invalido. Usa MM:SS o HH:MM:SS' : 'Marca invalida', 'error')
      return false
    }
    if (!dnf && timeCapSeconds && parsedMark > timeCapSeconds) {
      notify(`El tiempo no puede superar el cap de ${timeCapLabel}`, 'error')
      return false
    }
    const extra = extraValue(row)
    if (capDnf && extra === '') {
      notify('Ingresa reps faltantes. Usa 0 si termino justo en el cap.', 'error')
      return false
    }
    const parsedExtra = capDnf ? Number(extra) : null
    if (parsedExtra !== null && (!Number.isInteger(parsedExtra) || parsedExtra < 0)) {
      notify('Reps faltantes debe ser un entero mayor o igual a 0', 'error')
      return false
    }
    const tiebreak = tbValue(row)
    const existing = row.status === 'scored' || row.existing_mark != null
    try {
      await api.post(existing ? '/judge/score/edit' : '/judge/score/submit', {
        competition_id: Number(assignment.competition_id),
        phase_id: Number(phaseId),
        user_id: row.user_id ?? null,
        team_id: row.team_id ?? null,
        marca_raw: String(dnf ? dnfMark() : mark).trim(),
        extra_raw: parsedExtra !== null ? String(parsedExtra).trim() : undefined,
        tiebreak_raw: phase?.tie_break_enabled && !dnf && tiebreak !== '' ? String(tiebreak).trim() : undefined,
        station: 'Panel juez',
      })
      notify(existing ? 'Resultado actualizado' : 'Resultado guardado')
      setActiveEditor(null)
      await loadOptions()
      return true
    } catch (error) {
      notify(error.response?.data?.detail || 'No se pudo guardar el resultado.', 'error')
      return false
    }
  }

  const markLabel = isTimePhase(phase) ? 'Tiempo' : String(phase?.tipo || '').toLowerCase() === 'posicion' ? 'Posicion' : 'Marca'
  const extraLabel = showCapReps ? 'Reps faltantes' : 'Extra'
  const loadedCount = rows.filter((row) => row.status === 'scored' || row.existing_mark != null).length
  const scoreGridColumns = phase?.tie_break_enabled
    ? '56px minmax(180px, 1fr) 120px 170px 120px 120px 90px 90px 120px'
    : '56px minmax(180px, 1fr) 120px 170px 120px 90px 90px 120px'
  const activeEditorKey = activeEditor ? rowKey(phaseId, activeEditor) : ''
  const activeEditorCap = activeEditor ? isCapDnf(activeEditor) : false
  const activeEditorDnf = activeEditor ? isDnf(activeEditor) && !activeEditorCap : false
  const activeEditorRank = activeEditor ? preview[activeEditorKey] : null
  const activeEditorExisting = activeEditor ? activeEditor.status === 'scored' || activeEditor.existing_mark != null : false

  return (
    <section className="fr-judge-score-panel" style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 12, display: 'grid', gap: 12 }}>
      <style>{`
        .fr-judge-mobile-summary,
        .fr-judge-mobile-actions {
          display: none !important;
        }
        @media (max-width: 760px) {
          .fr-judge-score-panel {
            padding: 10px !important;
            gap: 10px !important;
            border-radius: 8px !important;
          }
          .fr-judge-filter-grid {
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
          }
          .fr-judge-filter-grid label span {
            font-size: 11px !important;
          }
          .fr-judge-filter-grid select {
            min-height: 38px !important;
            padding: 8px 9px !important;
            font-size: 13px !important;
          }
          .fr-judge-filter-stats {
            align-items: end !important;
            justify-content: flex-start !important;
          }
          .fr-judge-search {
            grid-column: 1 / -1;
          }
          .fr-judge-rules {
            padding: 9px !important;
            gap: 7px !important;
          }
          .fr-judge-rules-text {
            width: 100%;
            font-size: 11px !important;
            line-height: 1.4 !important;
          }
          .fr-judge-score-scroll {
            overflow: visible !important;
            border: 0 !important;
            border-radius: 0 !important;
          }
          .fr-judge-score-table {
            min-width: 0 !important;
            display: grid !important;
            gap: 10px !important;
          }
          .fr-judge-score-header {
            display: none !important;
          }
          .fr-judge-score-row {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 10px !important;
            align-items: stretch !important;
            padding: 12px !important;
            border: 1px solid #252A33 !important;
            border-radius: 8px !important;
            background: #171B21 !important;
          }
          .fr-judge-score-row.is-dirty {
            border-color: rgba(255,107,0,0.55) !important;
            background: rgba(255,107,0,0.08) !important;
          }
          .fr-judge-lane {
            display: none;
          }
          .fr-judge-lane::before {
            content: none;
          }
          .fr-judge-athlete {
            grid-column: 1 / -1;
            grid-row: 1;
            padding: 0 0 8px;
            min-height: 0;
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: baseline;
            gap: 10px;
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: clip !important;
            overflow-wrap: anywhere;
            font-size: 15px;
            border-bottom: 1px solid #252A33;
          }
          .fr-judge-athlete-name {
            min-width: 0;
            overflow-wrap: anywhere;
          }
          .fr-judge-athlete-meta {
            display: inline !important;
            color: #AAB2C0;
            font-size: 11px;
            font-weight: 850;
            white-space: nowrap;
          }
          .fr-judge-athlete-meta strong {
            color: #FF6B00;
            font-weight: 950;
          }
          .fr-judge-heat {
            display: none;
          }
          .fr-judge-desktop-field,
          .fr-judge-desktop-actions {
            display: none !important;
          }
          .fr-judge-mobile-summary {
            display: grid !important;
          }
          .fr-judge-mobile-actions {
            display: grid !important;
          }
          .fr-judge-field,
          .fr-judge-result-meta {
            display: grid !important;
            gap: 5px !important;
            min-width: 0;
          }
          .fr-judge-field::before,
          .fr-judge-result-meta::before {
            content: attr(data-label);
            color: #AAB2C0;
            font-size: 11px;
            font-weight: 850;
          }
          .fr-judge-field input {
            min-height: 42px !important;
            font-size: 15px !important;
          }
          .fr-judge-actions {
            grid-column: 1 / -1;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
          }
          .fr-judge-actions button {
            width: 100%;
            min-height: 42px !important;
          }
          .fr-judge-readonly-mark {
            min-height: 42px;
            display: flex;
            align-items: center;
            padding: 8px 10px;
            border: 1px solid #252A33;
            border-radius: 8px;
            background: #090B0E;
          }
          .fr-judge-editor-backdrop {
            align-items: end !important;
            padding: 0 14px 10px !important;
          }
          .fr-judge-editor-sheet {
            width: min(420px, calc(100vw - 28px)) !important;
            max-width: none !important;
            border-radius: 18px !important;
            max-height: 86vh !important;
          }
          .fr-judge-editor-actions {
            grid-template-columns: 1fr 1.45fr !important;
          }
        }
      `}</style>
      <div className="fr-judge-filter-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
        <Field label="WOD"><select style={inputStyle()} value={phaseId} onChange={(event) => { setPhaseId(event.target.value); setCategory(''); setHeatId('') }}>{phases.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></Field>
        <Field label="Categoria"><select style={inputStyle()} value={activeCategory} onChange={(event) => { setCategory(event.target.value); setHeatId('') }}>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
        <Field label="Heat"><select style={inputStyle()} value={activeHeatId} onChange={(event) => setHeatId(event.target.value)}>{heatOptions.length ? heatOptions.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>) : <option value="">Sin heats</option>}</select></Field>
        <div className="fr-judge-filter-stats" style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}><Pill tone={colors.primary}>{rows.length}/{heatRows.length} atletas</Pill><Pill tone={colors.accent}>{loadedCount} cargados</Pill></div>
        <Field label="Buscar atleta"><input className="fr-judge-search" style={inputStyle()} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o carril" /></Field>
      </div>
      <div className="fr-judge-rules" style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Pill tone={colors.primary}>{lowerIsBetter(phase) ? 'Menor marca gana' : 'Mayor marca gana'}</Pill>
        {isTimePhase(phase) && timeCapSeconds ? <Pill tone={colors.accent}>Cap {timeCapLabel}</Pill> : null}
        {isTimePhase(phase) && timeCapSeconds ? <span className="fr-judge-rules-text" style={{ color: colors.secondary, fontSize: 12 }}>CAP coloca el time cap y habilita reps faltantes.</span> : null}
        {isTimePhase(phase) && !timeCapSeconds ? <span className="fr-judge-rules-text" style={{ color: colors.secondary, fontSize: 12 }}>Configura el time cap del WOD para cargar reps faltantes.</span> : null}
        {phase?.tie_break_enabled ? <Pill tone={colors.accent}>{tiebreakLowerIsBetter(phase) ? 'Menor tiebreak gana' : 'Mayor tiebreak gana'}</Pill> : null}
        {loading ? <span style={{ color: colors.secondary, fontSize: 12 }}>Cargando atletas...</span> : null}
      </div>
      <div className="fr-judge-score-scroll" style={{ overflow: 'auto', border: `1px solid ${colors.border}`, borderRadius: 8 }}>
        <div className="fr-judge-score-table" style={{ minWidth: 900 }}>
          <div className="fr-judge-score-header" style={{ display: 'grid', gridTemplateColumns: scoreGridColumns, gap: 8, padding: 10, borderBottom: `1px solid ${colors.border}`, color: colors.secondary, fontSize: 12, fontWeight: 900 }}>
            <span>Carril</span><span>Atleta</span><span>Heat</span><span>{markLabel}</span><span>{extraLabel}</span>{phase?.tie_break_enabled ? <span>Tiebreak</span> : null}<span>Pos</span><span>Puntos</span><span>Accion</span>
          </div>
          {rows.length ? rows.map((row) => {
            const key = rowKey(phaseId, row)
            const dirty = Object.prototype.hasOwnProperty.call(marks, key)
            const capDnf = isCapDnf(row)
            const dnf = isDnf(row) && !capDnf
            const rank = preview[key]
            const existing = row.status === 'scored' || row.existing_mark != null
            const editable = !existing || editing[key] || dirty
            return (
              <div key={key} className={`fr-judge-score-row${dirty ? ' is-dirty' : ''}`} style={{ display: 'grid', gridTemplateColumns: scoreGridColumns, gap: 8, alignItems: 'center', padding: 10, borderBottom: `1px solid ${colors.border}`, background: dirty ? 'rgba(255,107,0,0.08)' : colors.surface }}>
                <span className="fr-judge-lane" style={{ color: colors.muted, fontWeight: 900 }}>{row.lane_number || '-'}</span>
                <span className="fr-judge-athlete" style={{ fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span className="fr-judge-athlete-name">{row.display_name || 'Atleta'}</span>
                  <span className="fr-judge-athlete-meta" style={{ display: 'none' }}>Carril <strong>{row.lane_number || '-'}</strong> · {heatLabelForRow(row) || '-'}</span>
                </span>
                <span className="fr-judge-heat" style={{ color: colors.secondary, fontSize: 12 }}>{heatLabelForRow(row) || '-'}</span>
                {editable ? (
                  <span className="fr-judge-desktop-field" style={{ display: 'grid', gap: 6 }}>
                    <input style={inputStyle()} type={isTimePhase(phase) ? 'text' : 'number'} value={dnf ? '' : capDnf ? timeCapLabel : markValue(row)} disabled={dnf || capDnf} placeholder={dnf ? 'DNF' : isTimePhase(phase) ? (timeCapLabel || '07:33') : 'Valor'} onWheel={preventNumberInputWheel} onChange={(event) => setMarkField(row, event.target.value)} />
                  </span>
                ) : (
                  <span className="fr-judge-desktop-field" style={{ color: dnf ? colors.error : colors.text, fontWeight: 850 }}>{dnf ? 'DNF' : row.existing_formatted || markValue(row) || '-'}</span>
                )}
                <span className="fr-judge-field fr-judge-mobile-summary" data-label={markLabel}>
                  <span className="fr-judge-readonly-mark" style={{ color: dnf ? colors.error : colors.text, fontWeight: 850 }}>{dnf ? 'DNF' : row.existing_formatted || markValue(row) || '-'}</span>
                </span>
                {editable && showCapReps && capDnf ? (
                  <span className="fr-judge-desktop-field" style={{ display: 'grid', gap: 6 }}>
                    <input style={inputStyle()} type="number" step="1" min="0" value={extraValue(row)} placeholder="Faltantes" onWheel={preventNumberInputWheel} onChange={(event) => setField(row, 'extra', event.target.value)} />
                  </span>
                ) : (
                  <span className="fr-judge-desktop-field" style={{ color: colors.secondary }}>{showCapReps && !dnf && isAtTimeCap(row) ? extraValue(row) || '0' : '-'}</span>
                )}
                <span className="fr-judge-result-meta fr-judge-mobile-summary" data-label={extraLabel} style={{ color: colors.secondary }}>{showCapReps && !dnf && isAtTimeCap(row) ? extraValue(row) || '0' : '-'}</span>
                {phase?.tie_break_enabled ? (
                  editable ? (
                    <span className="fr-judge-desktop-field" style={{ display: 'grid', gap: 6 }}>
                      <input style={inputStyle()} type="number" value={dnf ? '' : tbValue(row)} disabled={dnf} placeholder="Opcional" onWheel={preventNumberInputWheel} onChange={(event) => setField(row, 'tiebreak', event.target.value)} />
                    </span>
                  ) : (
                    <span className="fr-judge-desktop-field" style={{ color: colors.secondary }}>{!dnf ? row.existing_tiebreak_formatted || tbValue(row) || '-' : '-'}</span>
                  )
                ) : null}
                {phase?.tie_break_enabled ? <span className="fr-judge-result-meta fr-judge-mobile-summary" data-label="Tiebreak" style={{ color: colors.secondary }}>{!dnf ? row.existing_tiebreak_formatted || tbValue(row) || '-' : '-'}</span> : null}
                <span className="fr-judge-result-meta" data-label="Pos" style={{ color: dirty ? colors.primary : colors.secondary, fontWeight: 850 }}>{rank?.posicion ?? '-'}</span>
                <span className="fr-judge-result-meta" data-label="Puntos" style={{ color: dirty ? colors.primary : colors.secondary, fontWeight: 850 }}>{rank?.puntos ?? '-'}</span>
                <div className="fr-judge-desktop-actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {editable ? (
                    <>
                      <Button tone={(showCapReps ? capDnf : dnf) ? 'danger' : 'default'} onClick={() => setDnfResult(row, showCapReps ? capDnf : dnf)}>{showCapReps ? 'CAP' : 'DNF'}</Button>
                      <Button tone="primary" onClick={() => saveRow(row)}><Save size={14} /></Button>
                    </>
                  ) : (
                    <Button tone="accent" onClick={() => setEditing((prev) => ({ ...prev, [key]: true }))}><Pencil size={14} />Editar</Button>
                  )}
                </div>
                <div className="fr-judge-actions fr-judge-mobile-actions" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <Button tone={dirty || !existing ? 'primary' : 'accent'} onClick={() => openScoreEditor(row)}>{existing ? <Pencil size={14} /> : null}{existing ? 'Editar' : 'Cargar'}</Button>
                </div>
              </div>
            )
          }) : <div style={{ padding: 16, color: colors.secondary }}>{loading ? 'Cargando...' : normalizedSearch ? 'No hay atletas con ese filtro.' : 'No hay atletas para esta categoria y heat.'}</div>}
        </div>
      </div>
      {activeEditor ? (
        <div className="fr-judge-editor-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={closeScoreEditor}>
          <div role="dialog" aria-modal="true" aria-label={activeEditorExisting ? 'Editar resultado' : 'Cargar resultado'} className="fr-judge-editor-sheet" style={{ width: 'min(520px, 100%)', maxHeight: 'min(720px, calc(100vh - 32px))', overflowY: 'auto', border: `1px solid ${colors.border}`, borderRadius: 12, background: colors.surface, boxShadow: '0 24px 70px rgba(0,0,0,0.45)' }} onClick={(event) => event.stopPropagation()}>
            <div style={{ position: 'sticky', top: 0, zIndex: 1, background: colors.surface, borderBottom: `1px solid ${colors.border}`, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
              <div>
                <div style={{ fontWeight: 950 }}>{activeEditorExisting ? 'Editar resultado' : 'Cargar resultado'}</div>
                <div style={{ color: colors.secondary, fontSize: 12, marginTop: 4 }}>{activeEditor.display_name || 'Atleta'} · Carril {activeEditor.lane_number || '-'} · {heatLabelForRow(activeEditor) || '-'}</div>
              </div>
              <button type="button" onClick={closeScoreEditor} aria-label="Cerrar editor" style={{ border: 0, background: 'transparent', color: colors.secondary, fontSize: 22, lineHeight: 1, padding: 2, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 14, display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Pill tone={colors.primary}>{markLabel}: {activeEditorDnf ? 'DNF' : activeEditorCap ? timeCapLabel : markValue(activeEditor) || '-'}</Pill>
                <Pill tone={colors.accent}>Pos {activeEditorRank?.posicion ?? '-'} · {activeEditorRank?.puntos ?? '-'} pts</Pill>
              </div>
              <Field label={markLabel}>
                <input style={inputStyle()} autoFocus type={isTimePhase(phase) ? 'text' : 'number'} value={activeEditorDnf ? '' : activeEditorCap ? timeCapLabel : markValue(activeEditor)} disabled={activeEditorDnf || activeEditorCap} placeholder={activeEditorDnf ? 'DNF' : isTimePhase(phase) ? (timeCapLabel || '07:33') : 'Valor'} onWheel={preventNumberInputWheel} onChange={(event) => setMarkField(activeEditor, event.target.value)} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: showCapReps ? '1fr 1fr' : '1fr', gap: 8 }}>
                <Button tone={(showCapReps ? activeEditorCap : activeEditorDnf) ? 'danger' : 'default'} onClick={() => setDnfResult(activeEditor, showCapReps ? activeEditorCap : activeEditorDnf)}>{showCapReps ? 'CAP' : 'DNF'}</Button>
                {showCapReps ? <span style={{ color: colors.secondary, fontSize: 12, alignSelf: 'center' }}>CAP habilita reps faltantes.</span> : null}
              </div>
              {showCapReps && activeEditorCap ? (
                <Field label={extraLabel}>
                  <input style={inputStyle()} type="number" step="1" min="0" value={extraValue(activeEditor)} placeholder="Faltantes" onWheel={preventNumberInputWheel} onChange={(event) => setField(activeEditor, 'extra', event.target.value)} />
                </Field>
              ) : null}
              {phase?.tie_break_enabled ? (
                <Field label="Tie-break">
                  <input style={inputStyle()} type="number" value={activeEditorDnf ? '' : tbValue(activeEditor)} disabled={activeEditorDnf} placeholder="Opcional" onWheel={preventNumberInputWheel} onChange={(event) => setField(activeEditor, 'tiebreak', event.target.value)} />
                </Field>
              ) : null}
              <div className="fr-judge-editor-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8, paddingTop: 4 }}>
                <Button onClick={closeScoreEditor}>Cancelar</Button>
                <Button tone="primary" onClick={() => saveRow(activeEditor)}><Save size={14} />Guardar resultado</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function AppealsPanel({ assignment, notify }) {
  const [appeals, setAppeals] = useState([])
  const [active, setActive] = useState(null)
  const [loading, setLoading] = useState(false)
  const [reply, setReply] = useState({ message: '' })
  const [resolution, setResolution] = useState({ marca: '', tiebreak: '', resolution_note: '' })
  const [decisionOpen, setDecisionOpen] = useState(false)
  const [decisionMode, setDecisionMode] = useState('score_adjusted')
  const [busy, setBusy] = useState(false)

  const loadAppeals = async () => {
    if (!assignment?.competition_id) return
    setLoading(true)
    try {
      const { data } = await api.get('/appeals', { params: { competition_id: assignment.competition_id } })
      setAppeals(Array.isArray(data) ? data : [])
    } catch (error) {
      notify(error.response?.data?.detail || 'No se pudieron cargar las reclamaciones.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const openAppeal = async (appeal) => {
    try {
      const { data } = await api.get(`/appeals/${appeal.id}`)
      setActive(data)
      setResolution({ marca: data.current_marca ?? '', tiebreak: data.current_tiebreak ?? '', resolution_note: '' })
      setReply({ message: '' })
      setDecisionOpen(false)
      setDecisionMode('score_adjusted')
    } catch (error) {
      notify(error.response?.data?.detail || 'No se pudo abrir la reclamacion.', 'error')
    }
  }

  useEffect(() => {
    loadAppeals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.competition_id])

  const sendReply = async () => {
    if (!active) return
    setBusy(true)
    try {
      const { data } = await api.post(`/appeals/${active.id}/messages`, {
        message: reply.message.trim(),
      })
      setActive(data)
      setReply({ message: '' })
      await loadAppeals()
    } catch (error) {
      notify(error.response?.data?.detail || 'No se pudo enviar el mensaje.', 'error')
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
        if (resolution.tiebreak !== '') payload.tiebreak = resolution.tiebreak
      }
      const { data } = await api.post(`/appeals/${active.id}/resolve`, payload)
      setActive(data)
      setDecisionOpen(false)
      notify(resolutionType === 'rejected' ? 'Reclamacion rechazada' : resolutionType === 'needs_evidence' ? 'Evidencia solicitada' : 'Resultado actualizado')
      await loadAppeals()
    } catch (error) {
      notify(error.response?.data?.detail || 'No se pudo cerrar la reclamacion.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const activeItems = appeals.filter((item) => ['submitted', 'under_review', 'needs_evidence', 'escalated'].includes(item.status))

  return (
    <section style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 12, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Reclamaciones</h2>
          <div style={{ color: colors.secondary, fontSize: 12, marginTop: 4 }}>{activeItems.length} abiertas</div>
        </div>
        <Button onClick={loadAppeals} disabled={loading}>{loading ? 'Cargando...' : 'Actualizar'}</Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: active ? 'minmax(260px, 360px) minmax(0, 1fr)' : '1fr', gap: 12 }}>
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {appeals.length ? appeals.map((appeal) => (
            <button key={appeal.id} type="button" onClick={() => openAppeal(appeal)} style={{ width: '100%', border: 0, borderBottom: `1px solid ${colors.border}`, background: active?.id === appeal.id ? 'rgba(255,107,0,0.12)' : colors.top, color: colors.text, textAlign: 'left', padding: 12, display: 'grid', gap: 5 }}>
              <span style={{ fontWeight: 900 }}>{appeal.user_name || 'Atleta'}</span>
              <span style={{ color: colors.secondary, fontSize: 12 }}>{appeal.phase_name || 'Workout'} - {appeal.status}</span>
              <span style={{ color: colors.muted, fontSize: 11 }}>Solicita: {appeal.user_requested_score || '-'}</span>
            </button>
          )) : <div style={{ padding: 14, color: colors.secondary }}>{loading ? 'Cargando...' : 'Sin reclamaciones.'}</div>}
        </div>

        {active ? (
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.top, padding: 12, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 950 }}>{active.user_name || 'Atleta'}</div>
                <div style={{ color: colors.secondary, fontSize: 12 }}>{active.phase_name || 'Workout'} - Estado: {active.status}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {active.evidence_url ? <a href={active.evidence_url} target="_blank" rel="noreferrer" style={{ color: colors.accent, fontWeight: 850 }}>Ver evidencia</a> : null}
                {['submitted', 'under_review', 'needs_evidence', 'escalated'].includes(active.status) ? <Button tone="primary" onClick={() => setDecisionOpen(true)}>Resolver reclamacion</Button> : null}
              </div>
            </div>
            <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10, color: colors.secondary, fontSize: 13, lineHeight: 1.55 }}>
              {active.description}
            </div>
            <div style={{ display: 'grid', gap: 8, maxHeight: 300, overflowY: 'auto', padding: 10, border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.bg }}>
              {(active.messages || []).map((message) => {
                const isAthlete = message.author_role === 'athlete'
                return (
                  <div key={message.id} style={{ justifySelf: isAthlete ? 'start' : 'end', width: 'fit-content', maxWidth: 'min(84%, 460px)', border: `1px solid ${isAthlete ? colors.border : 'rgba(0,194,168,0.24)'}`, borderRadius: isAthlete ? '14px 14px 14px 4px' : '14px 14px 4px 14px', padding: '9px 11px', background: isAthlete ? colors.surface : '#005A4F', display: 'grid', gap: 5 }}>
                    <div style={{ color: isAthlete ? colors.secondary : '#BFFAF1', fontSize: 10, fontWeight: 850 }}>{isAthlete ? (message.author_name || 'Atleta') : 'Organizacion'}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.message}</div>
                    {message.evidence_url ? <a href={message.evidence_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: isAthlete ? colors.accent : '#DFFFF9', fontSize: 12, fontWeight: 850, textDecoration: 'none' }}><Paperclip size={12} /> Abrir link</a> : null}
                  </div>
                )
              })}
            </div>
            {['submitted', 'under_review', 'needs_evidence', 'escalated'].includes(active.status) ? (
              <>
                <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 42px', gap: 8, alignItems: 'end' }}>
                    <textarea style={{ ...inputStyle(), minHeight: 42, maxHeight: 100, resize: 'none', borderRadius: 20 }} value={reply.message} onChange={(event) => setReply((prev) => ({ ...prev, message: event.target.value }))} placeholder="Responder al atleta" />
                    <button type="button" aria-label="Enviar mensaje" onClick={sendReply} disabled={busy || !reply.message.trim()} style={{ width: 42, height: 42, minWidth: 42, minHeight: 42, padding: 0, lineHeight: 0, borderRadius: '50%', border: 'none', background: colors.primary, color: colors.bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: busy || !reply.message.trim() ? 'not-allowed' : 'pointer', opacity: busy || !reply.message.trim() ? 0.55 : 1 }}>
                      <Send size={18} style={{ display: 'block' }} />
                    </button>
                  </div>
                </div>
                {decisionOpen ? (
                  <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.74)', display: 'grid', placeItems: 'center', padding: 16 }} onClick={() => !busy && setDecisionOpen(false)}>
                    <div style={{ width: 'min(620px, 100%)', border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.surface, overflow: 'hidden' }} onClick={(event) => event.stopPropagation()}>
                      <div style={{ borderBottom: `1px solid ${colors.border}`, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 950 }}>Resolver reclamacion</div>
                        <Button onClick={() => setDecisionOpen(false)} disabled={busy}>Cerrar</Button>
                      </div>
                      <div style={{ padding: 14, display: 'grid', gap: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                          <Button tone={decisionMode === 'rejected' ? 'danger' : 'secondary'} onClick={() => setDecisionMode('rejected')}>Rechazar</Button>
                          <Button tone={decisionMode === 'score_adjusted' ? 'primary' : 'secondary'} onClick={() => setDecisionMode('score_adjusted')}>Ajustar resultado</Button>
                        </div>
                        {decisionMode === 'score_adjusted' ? (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <Field label="Nueva marca"><input style={inputStyle()} type="number" value={resolution.marca} onChange={(event) => setResolution((prev) => ({ ...prev, marca: event.target.value }))} /></Field>
                            <Field label="Tiebreak"><input style={inputStyle()} type="number" value={resolution.tiebreak} onChange={(event) => setResolution((prev) => ({ ...prev, tiebreak: event.target.value }))} /></Field>
                          </div>
                        ) : null}
                        <Field label={decisionMode === 'rejected' ? 'Mensaje de cierre' : 'Nota para resolver'}><textarea style={{ ...inputStyle(), minHeight: 92 }} value={resolution.resolution_note} onChange={(event) => setResolution((prev) => ({ ...prev, resolution_note: event.target.value }))} placeholder={decisionMode === 'rejected' ? 'Explica por que se rechaza la reclamacion' : 'Motivo del ajuste'} /></Field>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                          <Button onClick={() => setDecisionOpen(false)} disabled={busy}>Cancelar</Button>
                          <Button tone={decisionMode === 'rejected' ? 'danger' : 'primary'} onClick={() => resolveAppeal(decisionMode)} disabled={busy}>{decisionMode === 'rejected' ? 'Enviar cierre' : 'Resolver'}</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div style={{ color: colors.secondary, fontSize: 13 }}>Decision: {active.resolution_note || '-'}</div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default function JudgeResultsPanel() {
  const [assignments, setAssignments] = useState([])
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('')
  const [phases, setPhases] = useState([])
  const [loadingAssignments, setLoadingAssignments] = useState(true)
  const [loadingPhases, setLoadingPhases] = useState(false)
  const [toast, setToast] = useState(null)
  const assignment = useMemo(
    () => assignments.find((item) => String(item.id) === String(selectedAssignmentId)) || assignments[0] || null,
    [assignments, selectedAssignmentId],
  )
  const loading = loadingAssignments || loadingPhases
  const notify = (text, type = 'ok') => {
    setToast({ text, type })
    window.setTimeout(() => setToast(null), 2800)
  }

  useEffect(() => {
    let cancelled = false
    setLoadingAssignments(true)
    api.get('/me/judge-assignments')
      .then(({ data }) => {
        if (cancelled) return
        const active = (Array.isArray(data) ? data : []).filter((item) => item.status === 'active')
        setAssignments(active)
        setSelectedAssignmentId((current) => (
          active.some((item) => String(item.id) === String(current))
            ? current
            : (active[0]?.id ? String(active[0].id) : '')
        ))
      })
      .catch((error) => {
        if (!cancelled) setAssignments([])
        if (!cancelled) notify(error.response?.data?.detail || 'No se pudo cargar la asignacion de juez.', 'error')
      })
      .finally(() => {
        if (!cancelled) setLoadingAssignments(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!assignment?.competition_id) {
      setPhases([])
      setLoadingPhases(false)
      return undefined
    }
    let cancelled = false
    setLoadingPhases(true)
    setPhases([])
    api.get(`/judge/competitions/${assignment.competition_id}/score/phases`)
      .then(({ data }) => {
        if (!cancelled) setPhases(Array.isArray(data) ? data : [])
      })
      .catch((error) => {
        if (!cancelled) {
          setPhases([])
          notify(error.response?.data?.detail || 'No se pudieron cargar los WODs.', 'error')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPhases(false)
      })
    return () => { cancelled = true }
  }, [assignment?.competition_id])

  return (
    <main style={{ minHeight: '100vh', background: colors.bg, color: colors.text, padding: 18 }}>
      <div style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', display: 'grid', gap: 14 }}>
        {toast ? <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 50, border: `1px solid ${toast.type === 'error' ? colors.error : colors.accent}`, background: colors.surface, borderRadius: 8, padding: '10px 12px', fontWeight: 850 }}>{toast.text}</div> : null}
        <header style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ color: colors.primary, fontSize: 12, fontWeight: 950, textTransform: 'uppercase' }}>Panel de juez</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 28 }}>Carga de resultados</h1>
            <div style={{ color: colors.secondary, fontSize: 13, marginTop: 4 }}>{assignment?.competition_name || 'Competencia asignada'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {assignments.length > 1 ? (
              <label style={{ display: 'grid', gap: 4, minWidth: 0, maxWidth: '100%', flex: '1 1 260px', margin: 0 }}>
                <span style={{ color: colors.muted, fontSize: 11, fontWeight: 850 }}>Competencia</span>
                <select
                  aria-label="Competencia asignada"
                  value={assignment?.id ? String(assignment.id) : ''}
                  onChange={(event) => setSelectedAssignmentId(event.target.value)}
                  style={{
                    width: '100%',
                    maxWidth: 360,
                    minWidth: 0,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    background: colors.top,
                    color: colors.text,
                    padding: '9px 11px',
                    fontWeight: 800,
                  }}
                >
                  {assignments.map((item) => (
                    <option key={item.id} value={item.id}>{item.competition_name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {assignment?.competition_id ? <Link target="_blank" to={`/leaderboard/${assignment.competition_id}`} style={{ textDecoration: 'none' }}><Button><Trophy size={16} />Leaderboard</Button></Link> : null}
          </div>
        </header>
        {assignment ? (
          <section style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Pill tone={colors.primary}>{assignment.competition_name}</Pill>
            <Pill tone={colors.accent}>{phases.length} WODs</Pill>
            <span style={{ color: colors.secondary, fontSize: 13 }}>Selecciona WOD, categoria y heat para cargar resultados.</span>
          </section>
        ) : null}
        {loading ? <section style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 16, color: colors.secondary }}>Cargando...</section> : assignment && phases.length ? <><ScoreTable assignment={assignment} phases={phases} notify={notify} /><AppealsPanel assignment={assignment} notify={notify} /></> : <section style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 16, color: colors.secondary }}>{assignment ? 'Esta competencia no tiene WODs configurados.' : 'No tienes una competencia activa como juez.'}</section>}
      </div>
    </main>
  )
}
