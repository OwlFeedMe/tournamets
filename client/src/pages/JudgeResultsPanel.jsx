import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Save, Trophy } from 'lucide-react'
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
  const bg = tone === 'primary' ? colors.primary : tone === 'danger' ? colors.error : colors.top
  return <button {...props} type="button" style={{ border: `1px solid ${tone === 'default' ? colors.border : bg}`, background: bg, color: colors.text, borderRadius: 8, minHeight: 38, padding: '8px 11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontWeight: 900, opacity: props.disabled ? 0.5 : 1 }}>{children}</button>
}

function Field({ label, children }) {
  return <label style={{ display: 'grid', gap: 6, minWidth: 0 }}><span style={{ color: colors.secondary, fontSize: 12, fontWeight: 850 }}>{label}</span>{children}</label>
}

function inputStyle() {
  return { width: '100%', minHeight: 38, border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.top, color: colors.text, padding: '8px 10px', fontWeight: 750 }
}

function isTimePhase(phase) {
  return ['for_time', 'tiempo_hms', 'tiempo'].includes(String(phase?.measurement_method || phase?.tipo || '').toLowerCase())
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

function ScoreTable({ assignment, phases, notify }) {
  const [phaseId, setPhaseId] = useState(phases[0]?.id ? String(phases[0].id) : '')
  const [options, setOptions] = useState({ items: [], heats: [] })
  const [category, setCategory] = useState('')
  const [heatId, setHeatId] = useState('')
  const [loading, setLoading] = useState(false)
  const [marks, setMarks] = useState({})
  const [editing, setEditing] = useState({})

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
        nombre: item.heat_name || options.heats.find((heat) => String(heat.id) === String(item.heat_id))?.nombre || `Heat ${item.heat_id}`,
      })
    })
    return Array.from(map.values()).sort((a, b) => Number(a.id) - Number(b.id))
  }, [categoryRows, options.heats])
  const activeHeatId = heatOptions.some((heat) => String(heat.id) === String(heatId)) ? heatId : (heatOptions[0]?.id || '')
  const rows = activeHeatId
    ? categoryRows.filter((item) => String(item.heat_id || '') === String(activeHeatId))
    : categoryRows

  const setField = (row, field, value) => {
    const key = rowKey(phaseId, row)
    setMarks((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }))
  }
  const dnfMark = () => lowerIsBetter(phase) ? DNF_MARK_HIGH : DNF_MARK_LOW
  const markValue = (row) => {
    const key = rowKey(phaseId, row)
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'marca')) return marks[key].marca
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'dnf') && marks[key].dnf === false && isDnfMark(row.existing_mark)) return ''
    return row.existing_mark ?? ''
  }
  const tbValue = (row) => {
    const key = rowKey(phaseId, row)
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'tiebreak')) return marks[key].tiebreak
    return row.existing_tiebreak ?? ''
  }
  const isDnf = (row) => {
    const key = rowKey(phaseId, row)
    if (Object.prototype.hasOwnProperty.call(marks[key] || {}, 'dnf')) return !!marks[key].dnf
    return isDnfMark(row.existing_mark)
  }

  const preview = useMemo(() => {
    const lb = lowerIsBetter(phase)
    const tbLb = tiebreakLowerIsBetter(phase)
    const pool = (options.items || []).map((item) => {
      const key = rowKey(phaseId, item)
      const draft = marks[key] || {}
      const dnf = !!draft.dnf
      const marca = dnf ? dnfMark() : Object.prototype.hasOwnProperty.call(draft, 'marca') ? draft.marca : item.existing_mark
      const tiebreak = phase?.tie_break_enabled && !dnf
        ? Object.prototype.hasOwnProperty.call(draft, 'tiebreak') ? draft.tiebreak : item.existing_tiebreak
        : null
      return {
        key,
        category: item.category || 'Sin categoria',
        marca: marca === '' || marca == null ? null : Number(marca),
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
        const chunks = sameMark.length > 1 && sameMark.every((item) => item.tiebreak != null && !Number.isNaN(item.tiebreak))
          ? [...sameMark].sort((a, b) => tbLb ? a.tiebreak - b.tiebreak : b.tiebreak - a.tiebreak).reduce((list, item) => {
              const last = list[list.length - 1]
              if (last && last[0].tiebreak === item.tiebreak) last.push(item)
              else list.push([item])
              return list
            }, [])
          : [sameMark]
        chunks.forEach((chunk) => {
          const points = ordered.length - pos + 1
          chunk.forEach((item) => { out[item.key] = { posicion: pos, puntos: points } })
          pos += chunk.length
        })
      }
    })
    return out
  }, [options.items, marks, phase, phaseId])

  const saveRow = async (row) => {
    const dnf = isDnf(row)
    const mark = markValue(row)
    if (!dnf && mark === '') return notify('Ingresa una marca o DNF', 'error')
    const tiebreak = tbValue(row)
    const existing = row.status === 'scored' || row.existing_mark != null
    try {
      await api.post(existing ? '/judge/score/edit' : '/judge/score/submit', {
        competition_id: Number(assignment.competition_id),
        phase_id: Number(phaseId),
        user_id: row.user_id ?? null,
        team_id: row.team_id ?? null,
        marca_raw: String(dnf ? dnfMark() : mark).trim(),
        tiebreak_raw: phase?.tie_break_enabled && !dnf && tiebreak !== '' ? String(tiebreak).trim() : undefined,
        station: 'Panel juez',
      })
      notify(existing ? 'Resultado actualizado' : 'Resultado guardado')
      await loadOptions()
    } catch (error) {
      notify(error.response?.data?.detail || 'No se pudo guardar el resultado.', 'error')
    }
  }

  const markLabel = isTimePhase(phase) ? 'Tiempo' : String(phase?.tipo || '').toLowerCase() === 'posicion' ? 'Posicion' : 'Marca'
  const loadedCount = rows.filter((row) => row.status === 'scored' || row.existing_mark != null).length

  return (
    <section style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 12, display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        <Field label="WOD"><select style={inputStyle()} value={phaseId} onChange={(event) => { setPhaseId(event.target.value); setCategory(''); setHeatId('') }}>{phases.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></Field>
        <Field label="Categoria"><select style={inputStyle()} value={activeCategory} onChange={(event) => { setCategory(event.target.value); setHeatId('') }}>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
        <Field label="Heat"><select style={inputStyle()} value={activeHeatId} onChange={(event) => setHeatId(event.target.value)}>{heatOptions.length ? heatOptions.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>) : <option value="">Sin heats</option>}</select></Field>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}><Pill tone={colors.primary}>{rows.length} atletas</Pill><Pill tone={colors.accent}>{loadedCount} cargados</Pill></div>
      </div>
      <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Pill tone={colors.primary}>{lowerIsBetter(phase) ? 'Menor marca gana' : 'Mayor marca gana'}</Pill>
        {phase?.tie_break_enabled ? <Pill tone={colors.accent}>{tiebreakLowerIsBetter(phase) ? 'Menor tiebreak gana' : 'Mayor tiebreak gana'}</Pill> : <Pill>Sin tiebreak</Pill>}
        {loading ? <span style={{ color: colors.secondary, fontSize: 12 }}>Cargando atletas...</span> : null}
      </div>
      <div style={{ overflow: 'auto', border: `1px solid ${colors.border}`, borderRadius: 8 }}>
        <div style={{ minWidth: 900 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '56px minmax(180px, 1fr) 120px 130px 130px 90px 90px 120px', gap: 8, padding: 10, borderBottom: `1px solid ${colors.border}`, color: colors.secondary, fontSize: 12, fontWeight: 900 }}>
            <span>Carril</span><span>Atleta</span><span>Heat</span><span>{markLabel}</span><span>Tiebreak</span><span>Pos</span><span>Puntos</span><span>Accion</span>
          </div>
          {rows.length ? rows.map((row) => {
            const key = rowKey(phaseId, row)
            const dirty = Object.prototype.hasOwnProperty.call(marks, key)
            const editable = row.status !== 'scored' || editing[key] || dirty
            const dnf = isDnf(row)
            const rank = preview[key]
            return (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: '56px minmax(180px, 1fr) 120px 130px 130px 90px 90px 120px', gap: 8, alignItems: 'center', padding: 10, borderBottom: `1px solid ${colors.border}`, background: dirty ? 'rgba(255,107,0,0.08)' : colors.surface }}>
                <span style={{ color: colors.muted, fontWeight: 900 }}>{row.lane_number || '-'}</span>
                <span style={{ fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.display_name || 'Atleta'}</span>
                <span style={{ color: colors.secondary, fontSize: 12 }}>{row.heat_name || '-'}</span>
                {editable ? <input style={inputStyle()} type="number" value={dnf ? '' : markValue(row)} disabled={dnf} placeholder={dnf ? 'DNF' : 'Valor'} onChange={(event) => setField(row, 'marca', event.target.value)} /> : <span style={{ color: dnf ? colors.error : colors.text, fontWeight: 850 }}>{dnf ? 'DNF' : row.existing_formatted || markValue(row) || '-'}</span>}
                {editable && phase?.tie_break_enabled ? <input style={inputStyle()} type="number" value={dnf ? '' : tbValue(row)} disabled={dnf} placeholder="Opcional" onChange={(event) => setField(row, 'tiebreak', event.target.value)} /> : <span style={{ color: colors.secondary }}>{phase?.tie_break_enabled && !dnf ? row.existing_tiebreak_formatted || tbValue(row) || '-' : '-'}</span>}
                <span style={{ color: dirty ? colors.primary : colors.secondary, fontWeight: 850 }}>{rank?.posicion ?? '-'}</span>
                <span style={{ color: dirty ? colors.primary : colors.secondary, fontWeight: 850 }}>{rank?.puntos ?? '-'}</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {editable ? <><Button tone={dnf ? 'danger' : 'default'} onClick={() => setField(row, 'dnf', !dnf)}>DNF</Button><Button tone="primary" onClick={() => saveRow(row)}><Save size={14} /></Button></> : <Button onClick={() => setEditing((prev) => ({ ...prev, [key]: true }))}><Pencil size={14} /></Button>}
                </div>
              </div>
            )
          }) : <div style={{ padding: 16, color: colors.secondary }}>{loading ? 'Cargando...' : 'No hay atletas para esta categoria y heat.'}</div>}
        </div>
      </div>
    </section>
  )
}

function AppealsPanel({ assignment, notify }) {
  const [appeals, setAppeals] = useState([])
  const [active, setActive] = useState(null)
  const [loading, setLoading] = useState(false)
  const [reply, setReply] = useState({ message: '', evidence_url: '' })
  const [resolution, setResolution] = useState({ marca: '', tiebreak: '', resolution_note: '' })
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
      setReply({ message: '', evidence_url: '' })
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
        evidence_url: reply.evidence_url.trim() || null,
      })
      setActive(data)
      setReply({ message: '', evidence_url: '' })
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
              {active.evidence_url ? <a href={active.evidence_url} target="_blank" rel="noreferrer" style={{ color: colors.accent, fontWeight: 850 }}>Ver evidencia</a> : null}
            </div>
            <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10, color: colors.secondary, fontSize: 13, lineHeight: 1.55 }}>
              {active.description}
            </div>
            <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
              {(active.messages || []).map((message) => (
                <div key={message.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10, background: colors.surface }}>
                  <div style={{ color: colors.secondary, fontSize: 11, fontWeight: 850 }}>{message.author_name || message.author_role} - {message.author_role}</div>
                  <div style={{ marginTop: 5, fontSize: 13, lineHeight: 1.5 }}>{message.message}</div>
                  {message.evidence_url ? <a href={message.evidence_url} target="_blank" rel="noreferrer" style={{ color: colors.accent, fontSize: 12, fontWeight: 850 }}>Abrir link</a> : null}
                </div>
              ))}
            </div>
            {['submitted', 'under_review', 'needs_evidence', 'escalated'].includes(active.status) ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Field label="Mensaje"><input style={inputStyle()} value={reply.message} onChange={(event) => setReply((prev) => ({ ...prev, message: event.target.value }))} placeholder="Responder al atleta" /></Field>
                  <Field label="Link"><input style={inputStyle()} value={reply.evidence_url} onChange={(event) => setReply((prev) => ({ ...prev, evidence_url: event.target.value }))} placeholder="Drive o YouTube" /></Field>
                </div>
                <Button onClick={sendReply} disabled={busy}>Enviar mensaje</Button>
                <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <Field label="Nueva marca"><input style={inputStyle()} type="number" value={resolution.marca} onChange={(event) => setResolution((prev) => ({ ...prev, marca: event.target.value }))} /></Field>
                    <Field label="Tiebreak"><input style={inputStyle()} type="number" value={resolution.tiebreak} onChange={(event) => setResolution((prev) => ({ ...prev, tiebreak: event.target.value }))} /></Field>
                  </div>
                  <Field label="Decision"><textarea style={{ ...inputStyle(), minHeight: 78 }} value={resolution.resolution_note} onChange={(event) => setResolution((prev) => ({ ...prev, resolution_note: event.target.value }))} placeholder="Motivo de la decision" /></Field>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button onClick={() => resolveAppeal('needs_evidence')} disabled={busy}>Pedir evidencia</Button>
                    <Button tone="danger" onClick={() => resolveAppeal('rejected')} disabled={busy}>Rechazar</Button>
                    <Button tone="primary" onClick={() => resolveAppeal('score_adjusted')} disabled={busy}>Ajustar resultado</Button>
                  </div>
                </div>
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
  const [assignment, setAssignment] = useState(null)
  const [phases, setPhases] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const notify = (text, type = 'ok') => {
    setToast({ text, type })
    window.setTimeout(() => setToast(null), 2800)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.get('/me/judge-assignments')
      .then(async ({ data }) => {
        if (cancelled) return
        const active = (Array.isArray(data) ? data : []).find((item) => item.status === 'active') || null
        setAssignment(active)
        if (!active?.competition_id) {
          setPhases([])
          return
        }
        const phasesRes = await api.get(`/judge/competitions/${active.competition_id}/score/phases`)
        if (!cancelled) setPhases(Array.isArray(phasesRes.data) ? phasesRes.data : [])
      })
      .catch((error) => {
        if (!cancelled) notify(error.response?.data?.detail || 'No se pudo cargar la asignacion de juez.', 'error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

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
        {loading ? <section style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 16, color: colors.secondary }}>Cargando...</section> : assignment && phases.length ? <><ScoreTable assignment={assignment} phases={phases} notify={notify} /><AppealsPanel assignment={assignment} notify={notify} /></> : <section style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 16, color: colors.secondary }}>No tienes una competencia activa como juez.</section>}
      </div>
    </main>
  )
}
