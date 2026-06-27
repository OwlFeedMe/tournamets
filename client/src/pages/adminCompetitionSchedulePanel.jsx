import { useEffect, useMemo, useState } from 'react'
import { Clock3, MapPin, Users } from 'lucide-react'
import api from '../api/axios'

function toLocalDateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16)
  const offsetMs = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function fromLocalDateTimeInput(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function heatSortMs(item) {
  const date = new Date(item?.start_at || item?.end_at || '')
  if (!Number.isNaN(date.getTime())) return date.getTime()
  return Number.MAX_SAFE_INTEGER
}

function formatDateTime(value) {
  if (!value) return 'Por confirmar'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function secondsToMinutesInput(value) {
  const seconds = Number(value || 0)
  return seconds > 0 ? String(Math.round(seconds / 60)) : ''
}

function minutesInputToSeconds(value) {
  const minutes = parseInt(value, 10)
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : 0
}

function formatTransitionMinutes(value) {
  const minutes = Math.round(Number(value || 0) / 60)
  return minutes > 0 ? `${minutes} min` : 'Sin pausa'
}

function categoriesForPhase(phases, categories, phaseId) {
  const phase = (phases || []).find((item) => String(item.id) === String(phaseId))
  const modality = String(phase?.modality || 'individual').trim().toLowerCase()
  return (categories || [])
    .filter((category) => String(category?.modality || 'individual').trim().toLowerCase() === modality)
    .sort((a, b) => {
      const orderDiff = Number(a?.orden || 0) - Number(b?.orden || 0)
      if (orderDiff !== 0) return orderDiff
      return String(a?.nombre || '').localeCompare(String(b?.nombre || ''))
    })
}

function HelpLabel({ children, help }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ display: 'grid', gap: 5, minWidth: 0 }}>
      <span style={{ color: '#AAB2C0', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span>{children}</span>
        <button
          type="button"
          title={help}
          aria-label={help}
          aria-expanded={open}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setOpen(prev => !prev)
          }}
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            border: '1px solid #252A33',
            background: 'rgba(0,194,168,0.08)',
            color: '#00C2A8',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 900,
            lineHeight: 1,
            cursor: 'pointer',
            flex: '0 0 auto',
            padding: 0,
            touchAction: 'manipulation',
          }}
        >
          i
        </button>
      </span>
      {open ? (
        <span style={{ color: '#F5F7FA', fontSize: 12, lineHeight: 1.35, border: '1px solid #252A33', background: 'rgba(9,11,14,0.92)', borderRadius: 8, padding: '8px 10px', overflowWrap: 'anywhere' }}>
          {help}
        </span>
      ) : null}
    </span>
  )
}

export function CompetitionSchedulePanel({ competition }) {
  const [payload, setPayload] = useState({ phases: [], items: [], categories: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [editingHeat, setEditingHeat] = useState(null)
  const [preview, setPreview] = useState(null)
  const [moveDraft, setMoveDraft] = useState(null)
  const [orderOpen, setOrderOpen] = useState(false)
  const [orderDraft, setOrderDraft] = useState([])
  const [orderBusy, setOrderBusy] = useState(false)
  const [editBusy, setEditBusy] = useState(false)
  const [form, setForm] = useState({
    phase_id: '',
    generation_mode: 'by_category',
    categoria: '',
    lane_count: 8,
    heat_count: '',
    first_heat_start_at: '',
    heat_duration_minutes: 15,
    heat_transition_minutes: 5,
    category_transition_minutes: '',
    location_name: '',
    location_detail: '',
    note: '',
    is_published: true,
  })

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/competitions/${competition.id}/heats`)
      const categoriesRes = await api.get(`/competitions/${competition.id}/categories`)
      setPayload({
        phases: Array.isArray(data?.phases) ? data.phases : [],
        items: Array.isArray(data?.items) ? data.items : [],
        categories: Array.isArray(categoriesRes?.data) ? categoriesRes.data : [],
      })
    } catch (error) {
      setMsg({ type: 'error', text: error?.response?.data?.detail || 'No se pudo cargar el cronograma operativo' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [competition.id])

  useEffect(() => {
    if (!form.phase_id && payload.phases.length) {
      setForm(prev => ({ ...prev, phase_id: String(payload.phases[0].id) }))
    }
  }, [payload.phases, form.phase_id])

  useEffect(() => {
    if (!orderOpen && !moveDraft) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [orderOpen, moveDraft])

  const grouped = useMemo(() => {
    const map = new Map()
    const orderedItems = [...(payload.items || [])].sort((a, b) => (
      heatSortMs(a) - heatSortMs(b)
      || Number(a.phase_id || 0) - Number(b.phase_id || 0)
      || Number(a.heat_number || 0) - Number(b.heat_number || 0)
      || Number(a.id || 0) - Number(b.id || 0)
    ))
    orderedItems.forEach((item) => {
      const key = String(item.phase_id || 'sin-fase')
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: item.phase_name || 'Sin fase',
          items: [],
        })
      }
      map.get(key).items.push(item)
    })
    return Array.from(map.values()).map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => (
        heatSortMs(a) - heatSortMs(b)
        || Number(a.heat_number || 0) - Number(b.heat_number || 0)
        || Number(a.id || 0) - Number(b.id || 0)
      )),
    }))
  }, [payload.items])

  const selectedPhase = useMemo(
    () => payload.phases.find((phase) => String(phase.id) === String(form.phase_id)) || null,
    [payload.phases, form.phase_id]
  )

  const categoryOptions = useMemo(() => {
    return categoriesForPhase(payload.phases, payload.categories, form.phase_id)
  }, [payload.categories, selectedPhase])

  const editCategoryOptions = useMemo(() => {
    return categoriesForPhase(payload.phases, payload.categories, editingHeat?.phase_id)
  }, [payload.phases, payload.categories, editingHeat?.phase_id])

  const openOrderModal = () => {
    setOrderDraft(categoryOptions.map((category, index) => ({
      ...category,
      orden: Number(category?.orden || index + 1),
    })))
    setOrderOpen(true)
    setMsg(null)
  }

  const moveOrderCategory = (id, direction) => {
    setOrderDraft(prev => {
      const next = [...prev].sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0))
      const index = next.findIndex((item) => String(item.id) === String(id))
      const targetIndex = index + direction
      if (index < 0 || targetIndex < 0 || targetIndex >= next.length) return prev
      const current = next[index]
      next[index] = next[targetIndex]
      next[targetIndex] = current
      return next.map((item, itemIndex) => ({ ...item, orden: itemIndex + 1 }))
    })
  }

  const updateOrderValue = (id, value) => {
    setOrderDraft(prev => prev.map((item) => (
      String(item.id) === String(id) ? { ...item, orden: Math.max(1, Number(value || 1)) } : item
    )))
  }

  const saveCategoryOrder = async () => {
    setOrderBusy(true)
    setMsg(null)
    try {
      const ordered = [...orderDraft].sort((a, b) => {
        const orderDiff = Number(a.orden || 0) - Number(b.orden || 0)
        if (orderDiff !== 0) return orderDiff
        return String(a.nombre || '').localeCompare(String(b.nombre || ''))
      })
      await api.put(`/competitions/${competition.id}/categories/order`, {
        items: ordered.map((category, index) => ({
          id: Number(category.id),
          orden: index + 1,
        })),
      })
      setOrderOpen(false)
      setPreview(null)
      setMsg({ type: 'success', text: 'Orden de salida actualizado.' })
      await load()
    } catch (error) {
      setMsg({ type: 'error', text: error?.response?.data?.detail || 'No se pudo guardar el orden de salida' })
    } finally {
      setOrderBusy(false)
    }
  }

  const generatePayload = () => ({
    phase_id: Number(form.phase_id),
    generation_mode: form.generation_mode,
    categoria: form.generation_mode === 'single_category' ? form.categoria.trim() || null : null,
    lane_count: Number(form.lane_count || 0),
    heat_count: form.generation_mode === 'by_category' ? null : (form.heat_count ? Number(form.heat_count) : null),
    first_heat_start_at: fromLocalDateTimeInput(form.first_heat_start_at),
    heat_duration_minutes: Number(form.heat_duration_minutes || 15),
    heat_gap_minutes: 0,
    heat_transition_seconds: minutesInputToSeconds(form.heat_transition_minutes),
    category_transition_seconds: minutesInputToSeconds(form.category_transition_minutes),
    location_name: form.location_name.trim() || null,
    location_detail: form.location_detail.trim() || null,
    note: form.note.trim() || null,
    is_published: form.is_published ? 1 : 0,
    delete_existing: 1,
  })

  const handlePreview = async () => {
    if (!form.phase_id) return
    setBusy(true)
    setMsg(null)
    try {
      const { data } = await api.post(`/competitions/${competition.id}/heats/generate/preview`, generatePayload())
      setPreview(data)
    } catch (error) {
      setPreview(null)
      setMsg({ type: 'error', text: error?.response?.data?.detail || 'No se pudo preparar el resumen de heats' })
    } finally {
      setBusy(false)
    }
  }

  const handleGenerate = async (event) => {
    event.preventDefault()
    if (!form.phase_id) return
    if (form.generation_mode === 'single_category' && !form.categoria.trim()) {
      setMsg({ type: 'error', text: 'Selecciona una categoria para generar solo esa categoria.' })
      return
    }
    if (form.generation_mode === 'mixed') {
      const ok = window.confirm('Esto puede mezclar atletas de distintas categorias en los mismos heats. Continuar?')
      if (!ok) return
    }
    if (preview?.existing?.heats) {
      const ok = window.confirm(`Se reemplazaran ${preview.existing.heats} heats existentes de este evento. Continuar?`)
      if (!ok) return
    }
    setBusy(true)
    setMsg(null)
    try {
      const { data } = await api.post(`/competitions/${competition.id}/heats/generate`, generatePayload())
      setMsg({
        type: 'success',
        text: `Heats generados: ${data.generated_heats}. Regla usada: ${data.seed_mode === 'leaderboard' ? 'leaderboard' : 'inscripcion'}.`,
      })
      setPreview(null)
      await load()
    } catch (error) {
      setMsg({ type: 'error', text: error?.response?.data?.detail || 'No se pudieron generar los heats' })
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (item) => {
    setEditingHeat({
      id: item.id,
      phase_id: String(item.phase_id || ''),
      categoria: item.categoria || item.participants?.find((participant) => participant.categoria)?.categoria || '',
      nombre: item.heat_label || '',
      heat_number: item.heat_number || 1,
      lane_count: item.lane_count || Math.max((item.participants || []).length, 1),
      start_at: toLocalDateTimeInput(item.start_at),
      end_at: toLocalDateTimeInput(item.end_at),
      heat_transition_minutes: secondsToMinutesInput(item.heat_transition_seconds),
      category_transition_minutes: secondsToMinutesInput(item.category_transition_seconds),
      location_name: item.location_name || '',
      location_detail: item.location_detail || '',
      note: item.note || '',
      is_published: !!item.is_published,
      assignments: (item.participants || []).map((participant, index) => ({
      user_id: participant.user_id,
        team_id: participant.team_id,
        lane_number: participant.lane_number || index + 1,
        seed_order: participant.seed_order || index + 1,
      })),
    })
    setMsg(null)
  }

  const targetHeatOptions = useMemo(() => {
    if (!moveDraft) return []
    return payload.items
      .filter((item) => String(item.phase_id) === String(moveDraft.phase_id) && String(item.id) !== String(moveDraft.source_heat_id))
      .sort((a, b) => {
        const sameA = (a.categoria || '') === (moveDraft.categoria || '')
        const sameB = (b.categoria || '') === (moveDraft.categoria || '')
        if (sameA !== sameB) return sameA ? -1 : 1
        return Number(a.heat_number || 0) - Number(b.heat_number || 0)
      })
  }, [payload.items, moveDraft])

  const moveSourceHeat = useMemo(() => (
    moveDraft ? payload.items.find((item) => String(item.id) === String(moveDraft.source_heat_id)) || null : null
  ), [payload.items, moveDraft])

  const moveTargetHeat = useMemo(() => (
    moveDraft ? payload.items.find((item) => String(item.id) === String(moveDraft.target_heat_id)) || null : null
  ), [payload.items, moveDraft])

  const moveWarnings = useMemo(() => {
    if (!moveDraft) return []
    const warnings = []
    const sourceCount = (moveSourceHeat?.participants || []).length
    const targetCount = (moveTargetHeat?.participants || []).length
    const targetLaneCount = Number(moveTargetHeat?.lane_count || 0)
    if (sourceCount <= 1) {
      warnings.push({
        tone: 'warning',
        text: moveDraft.delete_empty_source
          ? 'Este movimiento dejara el heat origen vacio y se eliminara al confirmar.'
          : 'Este movimiento dejara el heat origen vacio. Si no lo eliminas, quedara como heat vacio.',
      })
    }
    if (moveTargetHeat && targetLaneCount > 0 && targetCount >= targetLaneCount) {
      warnings.push({
        tone: 'warning',
        text: `El heat destino ya tiene ${targetCount}/${targetLaneCount} atletas. El atleta se agregara como lane adicional.`,
      })
    }
    if (moveTargetHeat && (moveTargetHeat.categoria || '') !== (moveDraft.categoria || '')) {
      warnings.push({
        tone: 'danger',
        text: 'El heat destino pertenece a otra categoria. Este movimiento mezclara categorias.',
      })
    }
    return warnings
  }, [moveDraft, moveSourceHeat, moveTargetHeat])

  const handleMoveParticipant = async () => {
    if (!moveDraft?.source_heat_id || !moveDraft?.target_heat_id) return
    setEditBusy(true)
    setMsg(null)
    try {
      const { data } = await api.put(`/competitions/${competition.id}/heats/${moveDraft.source_heat_id}/move-assignment`, {
        user_id: moveDraft.user_id,
        team_id: moveDraft.team_id,
        target_heat_id: Number(moveDraft.target_heat_id),
      })
      if (data?.source_empty && moveDraft.delete_empty_source) {
        await api.delete(`/competitions/${competition.id}/heats/${moveDraft.source_heat_id}`)
      }
      setMoveDraft(null)
      setMsg({ type: 'success', text: 'Atleta reubicado.' })
      await load()
    } catch (error) {
      setMsg({ type: 'error', text: error?.response?.data?.detail || 'No se pudo mover el atleta' })
    } finally {
      setEditBusy(false)
    }
  }

  const handleUpdateHeat = async (event) => {
    event.preventDefault()
    if (!editingHeat?.id || !editingHeat.phase_id) return
    setEditBusy(true)
    setMsg(null)
    try {
      await api.put(`/competitions/${competition.id}/heats/${editingHeat.id}`, {
        phase_id: Number(editingHeat.phase_id),
        categoria: editingHeat.categoria.trim() || null,
        nombre: editingHeat.nombre.trim(),
        heat_number: Number(editingHeat.heat_number || 1),
        lane_count: Number(editingHeat.lane_count || 1),
        start_at: fromLocalDateTimeInput(editingHeat.start_at),
        end_at: fromLocalDateTimeInput(editingHeat.end_at),
        heat_transition_seconds: minutesInputToSeconds(editingHeat.heat_transition_minutes),
        category_transition_seconds: minutesInputToSeconds(editingHeat.category_transition_minutes),
        location_name: editingHeat.location_name.trim() || null,
        location_detail: editingHeat.location_detail.trim() || null,
        note: editingHeat.note.trim() || null,
        is_published: editingHeat.is_published ? 1 : 0,
        assignments: editingHeat.assignments || [],
      })
      setEditingHeat(null)
      setMsg({ type: 'success', text: 'Heat actualizado.' })
      await load()
    } catch (error) {
      setMsg({ type: 'error', text: error?.response?.data?.detail || 'No se pudo actualizar el heat' })
    } finally {
      setEditBusy(false)
    }
  }

  const handleDeleteHeat = async (heatId) => {
    if (!window.confirm('Este heat se eliminara con sus asignaciones. Continuar?')) return
    setBusy(true)
    setMsg(null)
    try {
      await api.delete(`/competitions/${competition.id}/heats/${heatId}`)
      if (String(editingHeat?.id || '') === String(heatId)) {
        setEditingHeat(null)
      }
      setMsg({ type: 'success', text: 'Heat eliminado.' })
      await load()
    } catch (error) {
      setMsg({ type: 'error', text: error?.response?.data?.detail || 'No se pudo eliminar el heat' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {orderOpen ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(9,11,14,0.78)', display: 'grid', placeItems: 'center', padding: 14 }}>
          <div style={{ width: 'min(560px, 100%)', maxHeight: '88vh', overflow: 'auto', borderRadius: 14, border: '1px solid #252A33', background: '#171B21', boxShadow: '0 24px 80px rgba(0,0,0,0.48)' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 1, background: '#171B21', borderBottom: '1px solid #252A33', padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
              <div style={{ minWidth: 0 }}>
                <h4 style={{ margin: 0, fontSize: 16, color: '#F5F7FA' }}>Orden de salida</h4>
                <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4 }}>
                  Las categorias con menor numero salen primero. Deja las categorias mas fuertes al final.
                </div>
              </div>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setOrderOpen(false)} disabled={orderBusy}>Cerrar</button>
            </div>
            <div style={{ padding: 14, display: 'grid', gap: 10 }}>
              {[...orderDraft].sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0)).map((category, index) => (
                <div key={category.id} style={{ border: '1px solid #252A33', background: 'rgba(13,15,18,0.68)', borderRadius: 10, padding: 10, display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr) auto auto', gap: 8, alignItems: 'center' }}>
                  <input
                    type="number"
                    min="1"
                    value={Number(category.orden || index + 1)}
                    onChange={(event) => updateOrderValue(category.id, event.target.value)}
                    aria-label={`Orden de salida de ${category.nombre}`}
                  />
                  <div title={category.nombre} style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 13, minWidth: 0, overflowWrap: 'anywhere' }}>
                    {category.nombre}
                  </div>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => moveOrderCategory(category.id, -1)} disabled={orderBusy || index === 0}>
                    Subir
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => moveOrderCategory(category.id, 1)} disabled={orderBusy || index === orderDraft.length - 1}>
                    Bajar
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'end', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setOrderOpen(false)} disabled={orderBusy}>Cancelar</button>
                <button type="button" className="btn-primary btn-sm" onClick={saveCategoryOrder} disabled={orderBusy || !orderDraft.length}>
                  {orderBusy ? 'Guardando...' : 'Guardar orden'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: 16 }}>Cronograma y heats</h4>
            <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>
              Genera el primer armado por inscripcion y deja que los siguientes eventos usen leaderboard.
            </div>
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={load} disabled={loading || busy}>Recargar</button>
        </div>

        <form onSubmit={handleGenerate} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#AAB2C0', fontSize: 12 }}>Evento</span>
            <select value={form.phase_id} onChange={(e) => setForm(prev => ({ ...prev, phase_id: e.target.value }))}>
              <option value="">Selecciona un evento</option>
              {payload.phases.map((phase) => (
                <option key={phase.id} value={phase.id}>{phase.nombre}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#AAB2C0', fontSize: 12 }}>Modo</span>
            <select value={form.generation_mode} onChange={(e) => {
              setPreview(null)
              setForm(prev => ({ ...prev, generation_mode: e.target.value, categoria: e.target.value === 'single_category' ? prev.categoria : '' }))
            }}>
              <option value="by_category">Generar por categoria</option>
              <option value="single_category">Generar una categoria</option>
              <option value="mixed">Generar todos mezclados</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#AAB2C0', fontSize: 12 }}>Categoria</span>
            <select value={form.categoria} disabled={form.generation_mode !== 'single_category'} onChange={(e) => {
              setPreview(null)
              setForm(prev => ({ ...prev, categoria: e.target.value }))
            }}>
              <option value="">Selecciona una categoria</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.nombre}>{category.nombre}</option>
              ))}
            </select>
          </label>
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#AAB2C0', fontSize: 12 }}>Orden de salida</span>
            <button type="button" className="btn-secondary btn-sm" onClick={openOrderModal} disabled={!form.phase_id || !categoryOptions.length}>
              Configurar orden
            </button>
          </div>
          <label style={{ display: 'grid', gap: 6 }}>
            <HelpLabel help="Cantidad maxima de atletas que caben en cada salida o tanda. Ejemplo: 10 lanes crea heats de hasta 10 atletas.">Lanes por heat</HelpLabel>
            <input type="number" min="1" max="20" value={form.lane_count} onChange={(e) => setForm(prev => ({ ...prev, lane_count: e.target.value }))} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <HelpLabel help="Dejalo en Auto para que FinalRep calcule cuantos heats necesita segun atletas y lanes. Usalo solo si quieres forzar una cantidad.">Cantidad de heats</HelpLabel>
            <input type="number" min="1" value={form.heat_count} onChange={(e) => setForm(prev => ({ ...prev, heat_count: e.target.value }))} placeholder="Auto" />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <HelpLabel help="Hora en la que sale el primer heat generado. Los siguientes se calculan sumando duracion y gap.">Inicio del primer heat</HelpLabel>
            <input type="datetime-local" value={form.first_heat_start_at} onChange={(e) => setForm(prev => ({ ...prev, first_heat_start_at: e.target.value }))} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <HelpLabel help="Minutos que dura cada heat desde que inicia hasta que termina.">Duracion</HelpLabel>
            <input type="number" min="1" value={form.heat_duration_minutes} onChange={(e) => setForm(prev => ({ ...prev, heat_duration_minutes: e.target.value }))} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <HelpLabel help="Minutos entre el final de un heat y el inicio del siguiente dentro de la misma categoria.">Cambio heat</HelpLabel>
            <input type="number" min="0" max="999" value={form.heat_transition_minutes} onChange={(e) => setForm(prev => ({ ...prev, heat_transition_minutes: e.target.value.replace(/\D/g, '') }))} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <HelpLabel help="Minutos cuando el siguiente heat cambia de categoria y hay que ajustar implementos, pesos o carriles.">Cambio categoria</HelpLabel>
            <input type="number" min="0" max="999" value={form.category_transition_minutes} onChange={(e) => setForm(prev => ({ ...prev, category_transition_minutes: e.target.value.replace(/\D/g, '') }))} placeholder="Opcional" />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#AAB2C0', fontSize: 12 }}>Ubicacion</span>
            <input value={form.location_name} onChange={(e) => setForm(prev => ({ ...prev, location_name: e.target.value }))} placeholder="Arena Norte" />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#AAB2C0', fontSize: 12 }}>Detalle</span>
            <input value={form.location_detail} onChange={(e) => setForm(prev => ({ ...prev, location_detail: e.target.value }))} placeholder="Lado warmup" />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#AAB2C0', fontSize: 12 }}>Nota</span>
            <input value={form.note} onChange={(e) => setForm(prev => ({ ...prev, note: e.target.value }))} placeholder="Check-in 20 min antes" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'end', minHeight: 42 }}>
            <input type="checkbox" checked={form.is_published} onChange={(e) => setForm(prev => ({ ...prev, is_published: e.target.checked }))} />
            <span style={{ color: '#F5F7FA', fontSize: 13 }}>Publicar al generar</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button type="button" className="btn-secondary btn-sm" onClick={handlePreview} disabled={busy || !form.phase_id}>
              {busy ? 'Calculando...' : 'Ver resumen'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button type="submit" className="btn-primary btn-sm" disabled={busy || !form.phase_id || (form.generation_mode === 'single_category' && !form.categoria.trim())}>
              {busy ? 'Generando...' : 'Generar heats'}
            </button>
          </div>
        </form>

        {preview ? (
          <div style={{ marginTop: 14, border: '1px solid #252A33', background: 'rgba(9,11,14,0.68)', borderRadius: 12, padding: 12, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 14 }}>Resumen antes de generar</div>
                <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 3 }}>
                  {preview.generation_mode === 'mixed' ? 'Todos mezclados' : preview.generation_mode === 'single_category' ? 'Una categoria' : 'Por categoria'} · {preview.lane_count} lanes
                </div>
              </div>
              <div style={{ color: preview?.existing?.heats ? '#F59E0B' : '#00C2A8', fontSize: 12, fontWeight: 800 }}>
                {preview?.existing?.heats ? `${preview.existing.heats} heats existentes se reemplazaran` : 'Sin heats previos'}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              {(preview.plan || []).map((item) => (
                <div key={item.categoria} style={{ border: '1px solid #252A33', borderRadius: 10, padding: 10, minWidth: 0 }}>
                  <div title={item.categoria} style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 13, minWidth: 0, overflowWrap: 'anywhere' }}>{item.categoria}</div>
                  <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4 }}>{item.participants} atletas · {item.heats} heats</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {msg ? (
          <div style={{ marginTop: 12, color: msg.type === 'error' ? '#EF4444' : '#5EEAD4', fontSize: 13 }}>
            {msg.text}
          </div>
        ) : null}
      </div>

      {editingHeat ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 16 }}>Editar heat</h4>
              <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>
                Ajusta horario, evento, ubicacion o publicacion sin perder la asignacion actual.
              </div>
            </div>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingHeat(null)} disabled={editBusy}>Cerrar</button>
          </div>

          <form onSubmit={handleUpdateHeat} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#AAB2C0', fontSize: 12 }}>Evento</span>
              <select value={editingHeat.phase_id} onChange={(e) => setEditingHeat(prev => ({ ...prev, phase_id: e.target.value, categoria: '' }))}>
                <option value="">Selecciona un evento</option>
                {payload.phases.map((phase) => (
                  <option key={phase.id} value={phase.id}>{phase.nombre}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#AAB2C0', fontSize: 12 }}>Categoria</span>
              <select value={editingHeat.categoria} onChange={(e) => setEditingHeat(prev => ({ ...prev, categoria: e.target.value }))}>
                <option value="">Sin categoria asignada</option>
                {editCategoryOptions.map((category) => (
                  <option key={category.id} value={category.nombre}>{category.nombre}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#AAB2C0', fontSize: 12 }}>Nombre</span>
              <input value={editingHeat.nombre} onChange={(e) => setEditingHeat(prev => ({ ...prev, nombre: e.target.value }))} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#AAB2C0', fontSize: 12 }}>Numero</span>
              <input type="number" min="1" value={editingHeat.heat_number} onChange={(e) => setEditingHeat(prev => ({ ...prev, heat_number: e.target.value }))} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#AAB2C0', fontSize: 12 }}>Lanes</span>
              <input type="number" min="1" value={editingHeat.lane_count} onChange={(e) => setEditingHeat(prev => ({ ...prev, lane_count: e.target.value }))} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#AAB2C0', fontSize: 12 }}>Inicio</span>
              <input type="datetime-local" value={editingHeat.start_at} onChange={(e) => setEditingHeat(prev => ({ ...prev, start_at: e.target.value }))} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#AAB2C0', fontSize: 12 }}>Fin</span>
              <input type="datetime-local" value={editingHeat.end_at} onChange={(e) => setEditingHeat(prev => ({ ...prev, end_at: e.target.value }))} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <HelpLabel help="Minutos de pausa antes del siguiente heat de la misma categoria.">Cambio heat</HelpLabel>
              <input type="number" min="0" max="999" value={editingHeat.heat_transition_minutes || ''} onChange={(e) => setEditingHeat(prev => ({ ...prev, heat_transition_minutes: e.target.value.replace(/\D/g, '') }))} placeholder="Sin pausa" />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <HelpLabel help="Minutos de pausa antes del siguiente heat cuando cambia la categoria.">Cambio categoria</HelpLabel>
              <input type="number" min="0" max="999" value={editingHeat.category_transition_minutes || ''} onChange={(e) => setEditingHeat(prev => ({ ...prev, category_transition_minutes: e.target.value.replace(/\D/g, '') }))} placeholder="Sin pausa" />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#AAB2C0', fontSize: 12 }}>Ubicacion</span>
              <input value={editingHeat.location_name} onChange={(e) => setEditingHeat(prev => ({ ...prev, location_name: e.target.value }))} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#AAB2C0', fontSize: 12 }}>Detalle</span>
              <input value={editingHeat.location_detail} onChange={(e) => setEditingHeat(prev => ({ ...prev, location_detail: e.target.value }))} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#AAB2C0', fontSize: 12 }}>Nota</span>
              <input value={editingHeat.note} onChange={(e) => setEditingHeat(prev => ({ ...prev, note: e.target.value }))} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'end', minHeight: 42 }}>
              <input type="checkbox" checked={editingHeat.is_published} onChange={(e) => setEditingHeat(prev => ({ ...prev, is_published: e.target.checked }))} />
              <span style={{ color: '#F5F7FA', fontSize: 13 }}>Publicado</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'end', gap: 8 }}>
              <button type="submit" className="btn-primary btn-sm" disabled={editBusy || !editingHeat.phase_id || !editingHeat.nombre.trim()}>
                {editBusy ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button type="button" className="btn-danger btn-sm" onClick={() => handleDeleteHeat(editingHeat.id)} disabled={editBusy || busy}>
                Eliminar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {moveDraft ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(9,11,14,0.78)', display: 'grid', placeItems: 'center', padding: 14 }}>
          <div style={{ width: 'min(620px, 100%)', maxHeight: '88vh', overflow: 'auto', borderRadius: 14, border: '1px solid #252A33', background: '#171B21', boxShadow: '0 24px 80px rgba(0,0,0,0.48)' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 1, background: '#171B21', borderBottom: '1px solid #252A33', padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
              <div style={{ minWidth: 0 }}>
                <h4 style={{ margin: 0, fontSize: 16 }}>Mover atleta</h4>
                <div title={moveDraft.name} style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4, overflowWrap: 'anywhere' }}>
                  {moveDraft.name} · {moveDraft.categoria || 'Sin categoria'}
                </div>
              </div>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setMoveDraft(null)} disabled={editBusy}>Cerrar</button>
            </div>
            <div style={{ padding: 14, display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.72)', padding: 12, minWidth: 0 }}>
                  <div style={{ color: '#AAB2C0', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>Origen</div>
                  <div title={moveSourceHeat?.heat_label || ''} style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 14, marginTop: 6, overflowWrap: 'anywhere' }}>
                    {moveSourceHeat?.heat_label || `Heat ${moveSourceHeat?.heat_number || ''}`}
                  </div>
                  <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4 }}>
                    {(moveSourceHeat?.participants || []).length} atletas
                  </div>
                </div>
                <div style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(13,15,18,0.72)', padding: 12, minWidth: 0 }}>
                  <div style={{ color: '#AAB2C0', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>Destino</div>
                  <div title={moveTargetHeat?.heat_label || ''} style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 14, marginTop: 6, overflowWrap: 'anywhere' }}>
                    {moveTargetHeat ? moveTargetHeat.heat_label || `Heat ${moveTargetHeat.heat_number}` : 'Sin seleccionar'}
                  </div>
                  <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4 }}>
                    {moveTargetHeat ? `${(moveTargetHeat.participants || []).length}/${Number(moveTargetHeat.lane_count || 0) || (moveTargetHeat.participants || []).length} atletas` : 'Selecciona un heat'}
                  </div>
                </div>
              </div>

              <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                <span style={{ color: '#AAB2C0', fontSize: 12 }}>Heat destino</span>
                <select value={moveDraft.target_heat_id || ''} onChange={(e) => setMoveDraft(prev => ({ ...prev, target_heat_id: e.target.value }))}>
                  <option value="">Selecciona un heat</option>
                  {targetHeatOptions.map((item) => {
                    const count = (item.participants || []).length
                    const cap = Number(item.lane_count || 0)
                    const label = `${item.categoria || 'Todos mezclados'} · Heat ${item.heat_number} · ${count}/${cap || count} atletas`
                    return <option key={item.id} value={item.id}>{label}</option>
                  })}
                </select>
              </label>

              {(moveSourceHeat?.participants || []).length <= 1 ? (
                <label style={{ display: 'flex', alignItems: 'start', gap: 10, borderRadius: 12, border: '1px solid rgba(245,158,11,0.34)', background: 'rgba(245,158,11,0.08)', padding: 12 }}>
                  <input
                    type="checkbox"
                    checked={!!moveDraft.delete_empty_source}
                    onChange={(e) => setMoveDraft(prev => ({ ...prev, delete_empty_source: e.target.checked }))}
                    style={{ marginTop: 2 }}
                  />
                  <span style={{ color: '#F5F7FA', fontSize: 13, lineHeight: 1.35 }}>
                    Eliminar el heat origen si queda vacio
                  </span>
                </label>
              ) : null}

              {moveWarnings.length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {moveWarnings.map((warning, index) => (
                    <div
                      key={`${warning.tone}-${index}`}
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${warning.tone === 'danger' ? 'rgba(239,68,68,0.34)' : 'rgba(245,158,11,0.34)'}`,
                        background: warning.tone === 'danger' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                        color: warning.tone === 'danger' ? '#FECACA' : '#FDE68A',
                        padding: 12,
                        fontSize: 13,
                        lineHeight: 1.35,
                      }}
                    >
                      {warning.text}
                    </div>
                  ))}
                </div>
              ) : null}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #252A33', paddingTop: 12 }}>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setMoveDraft(null)} disabled={editBusy}>
                  Cancelar
                </button>
                <button type="button" className="btn-primary btn-sm" onClick={handleMoveParticipant} disabled={editBusy || !moveDraft.target_heat_id}>
                  {editBusy ? 'Moviendo...' : 'Confirmar movimiento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {false && moveDraft ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ minWidth: 0 }}>
              <h4 style={{ margin: 0, fontSize: 16 }}>Mover atleta</h4>
              <div title={moveDraft.name} style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4, overflowWrap: 'anywhere' }}>
                {moveDraft.name} · {moveDraft.categoria || 'Sin categoria'}
              </div>
            </div>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setMoveDraft(null)} disabled={editBusy}>Cerrar</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) auto', gap: 10, alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
              <span style={{ color: '#AAB2C0', fontSize: 12 }}>Heat destino</span>
              <select value={moveDraft.target_heat_id || ''} onChange={(e) => setMoveDraft(prev => ({ ...prev, target_heat_id: e.target.value }))}>
                <option value="">Selecciona un heat</option>
                {targetHeatOptions.map((item) => {
                  const count = (item.participants || []).length
                  const cap = Number(item.lane_count || 0)
                  const label = `${item.categoria || 'Todos mezclados'} · Heat ${item.heat_number} · ${count}/${cap || count} atletas`
                  return <option key={item.id} value={item.id}>{label}</option>
                })}
              </select>
            </label>
            <button type="button" className="btn-primary btn-sm" onClick={handleMoveParticipant} disabled={editBusy || !moveDraft.target_heat_id}>
              {editBusy ? 'Moviendo...' : 'Mover'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: 16 }}>Heats cargados</h4>
            <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>
              Vista rapida del cronograma operativo ya guardado.
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ color: '#AAB2C0', fontSize: 14 }}>Cargando heats...</div>
        ) : !grouped.length ? (
          <div style={{ color: '#AAB2C0', fontSize: 14 }}>Todavia no hay heats configurados.</div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {grouped.map((group) => (
              <div key={group.key} style={{ display: 'grid', gap: 10 }}>
                <div style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 15 }}>{group.title}</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {group.items.map((item) => (
                    <div key={item.id} style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.72)', padding: 14, display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: '#5EEAD4', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            Heat {item.heat_number}
                          </div>
                          <div title={item.heat_label} style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 15, marginTop: 4, minWidth: 0, overflowWrap: 'anywhere' }}>{item.heat_label}</div>
                          {item.categoria ? (
                            <div title={item.categoria} style={{ color: '#AAB2C0', fontSize: 12, marginTop: 3, overflowWrap: 'anywhere' }}>{item.categoria}</div>
                          ) : null}
                        </div>
                        <span style={{ padding: '6px 10px', borderRadius: 999, border: `1px solid ${item.is_published ? 'rgba(94,234,212,0.28)' : 'rgba(214,217,224,0.28)'}`, color: item.is_published ? '#9AF7EA' : '#FFD0AE', background: item.is_published ? 'rgba(94,234,212,0.08)' : 'rgba(214,217,224,0.10)', fontSize: 12, fontWeight: 800 }}>
                          {item.is_published ? 'Publicado' : 'Borrador'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => startEdit(item)} disabled={busy || editBusy}>
                          Editar
                        </button>
                        <button type="button" className="btn-danger btn-sm" onClick={() => handleDeleteHeat(item.id)} disabled={busy || editBusy}>
                          Eliminar
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', color: '#AAB2C0', fontSize: 13 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Clock3 size={14} />{formatDateTime(item.start_at)}{item.end_at ? ` - ${formatDateTime(item.end_at)}` : ''}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Clock3 size={14} />Cambio heat {formatTransitionMinutes(item.heat_transition_seconds)} · categoria {formatTransitionMinutes(item.category_transition_seconds)}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><MapPin size={14} />{item.location_name || 'Ubicacion por confirmar'}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Users size={14} />{(item.participants || []).length} asignados</span>
                      </div>
                      {(item.participants || []).length ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                          {item.participants.map((participant) => (
                            <div key={participant.id} style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(255,255,255,0.03)', padding: '10px 12px', minWidth: 0, display: 'grid', gap: 8 }}>
                              <div title={participant.participant_name} style={{ color: '#F5F7FA', fontWeight: 700, fontSize: 13, minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.25 }}>{participant.participant_name}</div>
                              <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4 }}>
                    Lane {participant.lane_number}{participant.categoria ? ` · ${participant.categoria}` : ''}
                              </div>
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                onClick={() => setMoveDraft({
                                  source_heat_id: item.id,
                                  phase_id: item.phase_id,
                                  user_id: participant.user_id,
                                  team_id: participant.team_id,
                                  name: participant.participant_name,
                                  categoria: participant.categoria || item.categoria || '',
                                  target_heat_id: '',
                                  delete_empty_source: (item.participants || []).length <= 1,
                                })}
                                disabled={busy || editBusy}
                              >
                                Mover
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
