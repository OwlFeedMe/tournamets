import { useEffect, useMemo, useState } from 'react'
import { Clock3, MapPin, Users } from 'lucide-react'
import api from '../api/axios'

function toLocalDateTimeInput(value) {
  return value ? String(value).slice(0, 16) : ''
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

export function CompetitionSchedulePanel({ competition }) {
  const [payload, setPayload] = useState({ phases: [], items: [], categories: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [editingHeat, setEditingHeat] = useState(null)
  const [editBusy, setEditBusy] = useState(false)
  const [form, setForm] = useState({
    phase_id: '',
    categoria: '',
    lane_count: 8,
    heat_count: '',
    first_heat_start_at: '',
    heat_duration_minutes: 15,
    heat_gap_minutes: 5,
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

  const grouped = useMemo(() => {
    const map = new Map()
    payload.items.forEach((item) => {
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
    return Array.from(map.values())
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

  const handleGenerate = async (event) => {
    event.preventDefault()
    if (!form.phase_id) return
    setBusy(true)
    setMsg(null)
    try {
      const { data } = await api.post(`/competitions/${competition.id}/heats/generate`, {
        phase_id: Number(form.phase_id),
        categoria: form.categoria.trim() || null,
        lane_count: Number(form.lane_count || 0),
        heat_count: form.heat_count ? Number(form.heat_count) : null,
        first_heat_start_at: form.first_heat_start_at || null,
        heat_duration_minutes: Number(form.heat_duration_minutes || 15),
        heat_gap_minutes: Number(form.heat_gap_minutes || 0),
        location_name: form.location_name.trim() || null,
        location_detail: form.location_detail.trim() || null,
        note: form.note.trim() || null,
        is_published: form.is_published ? 1 : 0,
        delete_existing: 1,
      })
      setMsg({
        type: 'success',
        text: `Heats generados: ${data.generated_heats}. Regla usada: ${data.seed_mode === 'leaderboard' ? 'leaderboard' : 'inscripcion'}.`,
      })
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
      categoria: item.participants?.find((participant) => participant.categoria)?.categoria || '',
      nombre: item.heat_label || '',
      heat_number: item.heat_number || 1,
      lane_count: item.lane_count || Math.max((item.participants || []).length, 1),
      start_at: toLocalDateTimeInput(item.start_at),
      end_at: toLocalDateTimeInput(item.end_at),
      location_name: item.location_name || '',
      location_detail: item.location_detail || '',
      note: item.note || '',
      is_published: !!item.is_published,
      assignments: (item.participants || []).map((participant, index) => ({
        participant_id: participant.participant_id,
        team_id: participant.team_id,
        lane_number: participant.lane_number || index + 1,
        seed_order: participant.seed_order || index + 1,
      })),
    })
    setMsg(null)
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
        start_at: editingHeat.start_at || null,
        end_at: editingHeat.end_at || null,
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
            <span style={{ color: '#AAB2C0', fontSize: 12 }}>Categoria</span>
            <select value={form.categoria} onChange={(e) => setForm(prev => ({ ...prev, categoria: e.target.value }))}>
              <option value="">Todas / sin categoria</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.nombre}>{category.nombre}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#AAB2C0', fontSize: 12 }}>Lanes por heat</span>
            <input type="number" min="1" max="20" value={form.lane_count} onChange={(e) => setForm(prev => ({ ...prev, lane_count: e.target.value }))} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#AAB2C0', fontSize: 12 }}>Cantidad de heats</span>
            <input type="number" min="1" value={form.heat_count} onChange={(e) => setForm(prev => ({ ...prev, heat_count: e.target.value }))} placeholder="Auto" />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#AAB2C0', fontSize: 12 }}>Inicio del primer heat</span>
            <input type="datetime-local" value={form.first_heat_start_at} onChange={(e) => setForm(prev => ({ ...prev, first_heat_start_at: e.target.value }))} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#AAB2C0', fontSize: 12 }}>Duracion</span>
            <input type="number" min="1" value={form.heat_duration_minutes} onChange={(e) => setForm(prev => ({ ...prev, heat_duration_minutes: e.target.value }))} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#AAB2C0', fontSize: 12 }}>Gap</span>
            <input type="number" min="0" value={form.heat_gap_minutes} onChange={(e) => setForm(prev => ({ ...prev, heat_gap_minutes: e.target.value }))} />
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
            <button type="submit" className="btn-primary btn-sm" disabled={busy || !form.phase_id}>
              {busy ? 'Generando...' : 'Generar heats'}
            </button>
          </div>
        </form>

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
                <option value="">Todas / sin categoria</option>
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
                        <div>
                          <div style={{ color: '#5EEAD4', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            Heat {item.heat_number}
                          </div>
                          <div style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 15, marginTop: 4 }}>{item.heat_label}</div>
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
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><MapPin size={14} />{item.location_name || 'Ubicacion por confirmar'}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Users size={14} />{(item.participants || []).length} asignados</span>
                      </div>
                      {(item.participants || []).length ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                          {item.participants.map((participant) => (
                            <div key={participant.id} style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(255,255,255,0.03)', padding: '10px 12px' }}>
                              <div style={{ color: '#F5F7FA', fontWeight: 700, fontSize: 13 }}>{participant.participant_name}</div>
                              <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4 }}>
                    Lane {participant.lane_number}{participant.categoria ? ` · ${participant.categoria}` : ''}
                              </div>
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
