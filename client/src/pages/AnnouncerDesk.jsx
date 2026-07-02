import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Radio, RefreshCw, Trophy, Users } from 'lucide-react'
import api from '../api/axios'

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

function Pill({ children, tone = colors.border }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 26, padding: '5px 9px', borderRadius: 999, border: `1px solid ${tone}66`, background: `${tone}18`, color: colors.text, fontSize: 11, fontWeight: 850, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function Button({ children, tone = 'default', ...props }) {
  const bg = tone === 'primary' ? colors.primary : tone === 'danger' ? colors.error : colors.top
  return <button {...props} type="button" style={{ border: `1px solid ${tone === 'default' ? colors.border : bg}`, background: bg, color: colors.text, borderRadius: 8, minHeight: 38, padding: '8px 11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontWeight: 900, opacity: props.disabled ? 0.5 : 1, cursor: props.disabled ? 'not-allowed' : 'pointer' }}>{children}</button>
}

function athleteName(item) {
  return item?.display_name || item?.team_name || 'Participante'
}

function scoreLabel(result) {
  if (!result) return 'Pendiente'
  if (result.marca === 2147483647 || result.marca === -2147483648) return 'DNF'
  return [result.marca, result.extra != null ? `+${result.extra}` : null].filter(Boolean).join(' ') || 'Cargado'
}

function timeCapLabel(seconds) {
  const value = Number(seconds || 0)
  if (!Number.isFinite(value) || value <= 0) return ''
  const minutes = Math.floor(value / 60)
  const rest = value % 60
  return rest ? `${minutes}:${String(rest).padStart(2, '0')}` : `${minutes}:00`
}

function WodBrief({ wod }) {
  const parts = Array.isArray(wod?.parts) ? wod.parts.filter((item) => item?.description) : []
  return (
    <section style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 12, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>WOD de la categoria</h3>
        <Pill tone={wod?.source === 'category' ? colors.accent : colors.border}>{wod?.source === 'category' ? 'Especifico' : 'Base'}</Pill>
      </div>
      {parts.length ? parts.map((part, index) => {
        const cap = timeCapLabel(part.time_cap)
        return (
          <div key={`${part.label || 'wod'}-${index}`} style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <div style={{ color: colors.primary, fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: 0.8 }}>{part.label || 'WOD'}</div>
              {cap ? <div style={{ color: colors.secondary, fontSize: 11, fontWeight: 850 }}>Cap {cap}</div> : null}
            </div>
            <div style={{ color: colors.secondary, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{part.description}</div>
          </div>
        )
      }) : <div style={{ color: colors.secondary, fontSize: 13 }}>WOD por publicar.</div>}
    </section>
  )
}

function flattenIndividual(individual = {}) {
  return Object.entries(individual).flatMap(([category, rows]) => (rows || []).map((row) => ({ ...row, category })))
}

function rankRowsForHeat(live, heat) {
  if (!live || !heat) return []
  const phase = (live.leaderboard?.phases || []).find((item) => String(item.id) === String(heat.phase_id))
  const category = String(heat.category || '').trim()
  const phaseRows = category && Array.isArray(phase?.individual?.[category]) ? phase.individual[category] : null
  const totalRows = category && Array.isArray(live.leaderboard?.individual?.[category]) ? live.leaderboard.individual[category] : null
  if (phaseRows) return phaseRows.slice(0, 8)
  if (totalRows) return totalRows.slice(0, 8)

  const source = phase?.individual && Object.keys(phase.individual || {}).length ? phase.individual : live.leaderboard?.individual
  return flattenIndividual(source).slice(0, 8)
}

function selectCurrentHeat(heats = []) {
  const now = Date.now()
  const running = heats.find((heat) => heat.phase_status === 'en_progreso')
  if (running) return running
  const activeByTime = heats.find((heat) => {
    const start = heat.start_at ? new Date(heat.start_at).getTime() : null
    const end = heat.end_at ? new Date(heat.end_at).getTime() : null
    return start && start <= now && (!end || end >= now)
  })
  if (activeByTime) return activeByTime
  return heats.find((heat) => Number(heat.scored_lanes || 0) < Number(heat.total_lanes || 0)) || heats[0] || null
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 780 : false))
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onResize = () => setIsMobile(window.innerWidth < 780)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

export default function AnnouncerDesk() {
  const isMobile = useIsMobile()
  const [assignments, setAssignments] = useState([])
  const [competitionId, setCompetitionId] = useState('')
  const [live, setLive] = useState(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [liveMode, setLiveMode] = useState(true)
  const [manualHeatId, setManualHeatId] = useState('')

  const activeAssignments = assignments.filter((item) => item.status === 'active')
  const pendingAssignments = assignments.filter((item) => item.status === 'pending')
  const activeAssignment = activeAssignments[0] || null

  const loadAssignments = async () => {
    const { data } = await api.get('/me/announcer-assignments')
    const items = Array.isArray(data) ? data : []
    setAssignments(items)
    const active = items.find((item) => item.status === 'active')
    setCompetitionId(active?.competition_id || '')
  }

  const loadLive = async (id = competitionId) => {
    if (!id) return
    setLoading(true)
    try {
      const { data } = await api.get(`/announcer/competitions/${id}/live`)
      setLive(data)
      setMsg(null)
    } catch (error) {
      setMsg({ type: 'error', text: error.response?.data?.detail || 'No se pudo cargar la vista en vivo.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAssignments().catch((error) => setMsg({ type: 'error', text: error.response?.data?.detail || 'No se pudieron cargar tus invitaciones.' }))
  }, [])

  useEffect(() => {
    if (!competitionId) return undefined
    loadLive(competitionId)
    const id = setInterval(() => loadLive(competitionId), 5000)
    return () => clearInterval(id)
  }, [competitionId])

  const acceptAssignment = async (assignment) => {
    try {
      await api.post(`/announcer-assignments/${assignment.id}/accept`)
      setMsg({ type: 'success', text: 'Invitacion aceptada.' })
      await loadAssignments()
      setCompetitionId(assignment.competition_id)
      await loadLive(assignment.competition_id)
    } catch (error) {
      setMsg({ type: 'error', text: error.response?.data?.detail || 'No se pudo aceptar la invitacion.' })
    }
  }

  const rejectAssignment = async (assignment) => {
    try {
      await api.post(`/announcer-assignments/${assignment.id}/reject`)
      setMsg({ type: 'success', text: 'Invitacion rechazada.' })
      await loadAssignments()
    } catch (error) {
      setMsg({ type: 'error', text: error.response?.data?.detail || 'No se pudo rechazar la invitacion.' })
    }
  }

  const heatItems = live?.heats || []
  const liveHeat = useMemo(() => selectCurrentHeat(heatItems), [heatItems])
  const currentHeat = useMemo(() => {
    if (liveMode) return liveHeat
    return heatItems.find((heat) => String(heat.id) === String(manualHeatId)) || liveHeat
  }, [heatItems, liveHeat, liveMode, manualHeatId])
  const currentHeatIndex = useMemo(
    () => heatItems.findIndex((heat) => String(heat.id) === String(currentHeat?.id)),
    [heatItems, currentHeat],
  )
  const nextHeat = useMemo(() => {
    return currentHeatIndex >= 0 ? heatItems[currentHeatIndex + 1] : null
  }, [currentHeatIndex, heatItems])
  const rankRows = useMemo(() => rankRowsForHeat(live, currentHeat), [live, currentHeat])

  useEffect(() => {
    if (!manualHeatId || !heatItems.length) return
    if (!heatItems.some((heat) => String(heat.id) === String(manualHeatId))) {
      setManualHeatId('')
      setLiveMode(true)
    }
  }, [heatItems, manualHeatId])

  const goToHeat = (heatId) => {
    if (!heatId) return
    setManualHeatId(String(heatId))
    setLiveMode(false)
  }

  const goLive = () => {
    setManualHeatId('')
    setLiveMode(true)
  }

  return (
    <main style={{ minHeight: '100vh', background: colors.bg, color: colors.text, padding: isMobile ? '12px 12px 104px' : 18 }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gap: 16 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: isMobile ? 12 : 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: colors.primary, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: 1.2 }}>Locutor</div>
            <h1 style={{ margin: '4px 0 0', fontSize: isMobile ? 23 : 28, lineHeight: 1.08 }}>Cabina en vivo</h1>
            <div style={{ color: colors.secondary, marginTop: 4, overflowWrap: 'anywhere' }}>{live?.competition?.nombre || activeAssignment?.competition_name || 'Sin competencia activa'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
            <Button onClick={() => loadLive()} disabled={!competitionId || loading}><RefreshCw size={15} />Actualizar</Button>
            {competitionId ? <Link to={`/leaderboard/${competitionId}`} target="_blank" style={{ textDecoration: 'none' }}><Button><Trophy size={15} />Leaderboard</Button></Link> : null}
          </div>
        </header>

        {msg ? <div style={{ border: `1px solid ${msg.type === 'error' ? 'rgba(239,68,68,0.42)' : 'rgba(0,194,168,0.35)'}`, background: msg.type === 'error' ? 'rgba(239,68,68,0.10)' : 'rgba(0,194,168,0.10)', color: msg.type === 'error' ? '#FCA5A5' : '#9AF7EA', borderRadius: 8, padding: 12, fontWeight: 800 }}>{msg.text}</div> : null}

        {pendingAssignments.length ? (
          <section style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 14, display: 'grid', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Invitaciones pendientes</h2>
            {pendingAssignments.map((item) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 10 }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{item.competition_name}</div>
                  <div style={{ color: colors.secondary, fontSize: 12 }}>Invitado como locutor</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button onClick={() => rejectAssignment(item)}>Rechazar</Button>
                  <Button tone="primary" onClick={() => acceptAssignment(item)}>Aceptar</Button>
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {!activeAssignments.length && !pendingAssignments.length ? (
          <section style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 18, color: colors.secondary }}>
            No tienes competencias asignadas como locutor.
          </section>
        ) : null}

        {live && heatItems.length ? (
          <section style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: isMobile ? 12 : 14, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Pill tone={liveMode ? colors.accent : colors.border}>{liveMode ? 'En vivo' : 'Explorando'}</Pill>
                <span style={{ color: colors.secondary, fontSize: 13 }}>{heatItems.length} heats disponibles</span>
              </div>
              <Button tone="primary" onClick={goLive} disabled={liveMode}><Radio size={15} />En vivo</Button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'auto minmax(260px, 1fr) auto auto', gap: 8, alignItems: 'center' }}>
              <Button onClick={() => currentHeatIndex > 0 && goToHeat(heatItems[currentHeatIndex - 1]?.id)} disabled={currentHeatIndex <= 0}>
                <ChevronLeft size={15} />Anterior
              </Button>
              <select
                value={currentHeat?.id || ''}
                onChange={(event) => goToHeat(event.target.value)}
                style={{ minHeight: 38, border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.top, color: colors.text, padding: '8px 10px', fontWeight: 800, minWidth: 0, width: '100%' }}
                aria-label="Seleccionar heat"
              >
                {heatItems.map((heat) => (
                  <option key={heat.id} value={heat.id}>
                    {`${heat.phase_name || 'WOD'} - ${heat.category || 'Sin categoria'} - Heat ${heat.heat_number}`}
                  </option>
                ))}
              </select>
              <Button onClick={() => currentHeatIndex >= 0 && currentHeatIndex < heatItems.length - 1 && goToHeat(heatItems[currentHeatIndex + 1]?.id)} disabled={currentHeatIndex < 0 || currentHeatIndex >= heatItems.length - 1}>
                Siguiente<ChevronRight size={15} />
              </Button>
              <Button onClick={() => loadLive()} disabled={!competitionId || loading}><RefreshCw size={15} />Actualizar</Button>
            </div>
          </section>
        ) : null}

        {live && currentHeat ? (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1.45fr) minmax(320px, 0.8fr)', gap: 16 }}>
            <section style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: isMobile ? 12 : 16, display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Pill tone={colors.primary}><Radio size={13} /> Heat {currentHeat.heat_number}</Pill>
                    <Pill tone={colors.accent}>{currentHeat.category || 'Sin categoria'}</Pill>
                    <Pill>{currentHeat.scored_lanes}/{currentHeat.total_lanes} resultados</Pill>
                  </div>
                  <h2 style={{ margin: '10px 0 0', fontSize: isMobile ? 20 : 24, lineHeight: 1.12, overflowWrap: 'anywhere' }}>{currentHeat.phase_name}</h2>
                  <div style={{ color: colors.secondary, marginTop: 4 }}>{currentHeat.name || `Heat ${currentHeat.heat_number}`}{currentHeat.location_name ? ` - ${currentHeat.location_name}` : ''}</div>
                </div>
                {nextHeat ? (
                  <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 10, minWidth: isMobile ? 0 : 220, width: isMobile ? '100%' : 'auto' }}>
                    <div style={{ color: colors.muted, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Siguiente</div>
                    <div style={{ fontWeight: 900, marginTop: 4 }}>{nextHeat.phase_name}</div>
                    <div style={{ color: colors.secondary, fontSize: 12 }}>{nextHeat.category || 'Sin categoria'} - Heat {nextHeat.heat_number}</div>
                  </div>
                ) : null}
              </div>

              <WodBrief wod={currentHeat.wod} />

              <div style={{ display: 'grid', gap: 8 }}>
                {currentHeat.assignments.map((item) => (
                  <div key={`${item.lane_number}-${item.user_id || item.team_id}`} style={{ display: 'grid', gridTemplateColumns: isMobile ? '44px minmax(0, 1fr)' : '70px minmax(0, 1fr) 120px 100px', gap: 10, alignItems: 'center', border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 10 }}>
                    <div style={{ color: colors.primary, fontSize: isMobile ? 16 : 18, fontWeight: 950 }}>#{item.lane_number || '-'}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{athleteName(item)}</div>
                      <div style={{ color: colors.secondary, fontSize: 12, marginTop: 3 }}>{[item.box, item.team_name].filter(Boolean).join(' - ') || 'Sin box confirmado'}</div>
                    </div>
                    <div style={{ color: item.result ? colors.accent : colors.secondary, fontWeight: 900, gridColumn: isMobile ? '1 / span 1' : 'auto' }}>{scoreLabel(item.result)}</div>
                    <div style={{ textAlign: isMobile ? 'left' : 'right', color: colors.secondary, fontWeight: 850 }}>{item.result?.posicion ? `P${item.result.posicion}` : '-'}</div>
                  </div>
                ))}
              </div>
            </section>

            <aside style={{ display: 'grid', gap: 16 }}>
              <section style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 14 }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 16 }}><Trophy size={17} />Top de categoria</h2>
                <div style={{ marginTop: 6, color: colors.secondary, fontSize: 12 }}>{currentHeat.category || 'Categoria general'} - {currentHeat.phase_name}</div>
                <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                  {rankRows.map((row) => (
                    <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) auto', gap: 8, alignItems: 'center', borderBottom: `1px solid ${colors.border}`, paddingBottom: 8 }}>
                      <div style={{ color: Number(row.rank) <= 3 ? '#FF9A3D' : colors.secondary, fontWeight: 950 }}>#{row.rank}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{`${row.nombre || ''} ${row.apellido || ''}`.trim()}</div>
                        <div style={{ color: colors.secondary, fontSize: 11 }}>{row.box || 'Sin box'}</div>
                      </div>
                      <div style={{ color: colors.primary, fontWeight: 950 }}>{row.total_puntos}</div>
                    </div>
                  ))}
                  {!rankRows.length ? <div style={{ color: colors.secondary }}>Sin ranking para esta categoria.</div> : null}
                </div>
              </section>

              <section style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 14 }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 16 }}><Users size={17} />Datos de cabina</h2>
                <div style={{ display: 'grid', gap: 8, marginTop: 12, color: colors.secondary, fontSize: 13 }}>
                  <div>WOD: <strong style={{ color: colors.text }}>{currentHeat.phase_name}</strong></div>
                  <div>Estado: <strong style={{ color: colors.text }}>{currentHeat.phase_status || 'pendiente'}</strong></div>
                  <div>Carriles: <strong style={{ color: colors.text }}>{currentHeat.assignments.length}</strong></div>
                  <div>Resultados pendientes: <strong style={{ color: colors.text }}>{Math.max(0, Number(currentHeat.total_lanes || 0) - Number(currentHeat.scored_lanes || 0))}</strong></div>
                  {currentHeat.note ? <div>Nota: <strong style={{ color: colors.text }}>{currentHeat.note}</strong></div> : null}
                </div>
              </section>
            </aside>
          </div>
        ) : activeAssignments.length ? (
          <section style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 18, color: colors.secondary }}>
            {loading ? 'Cargando cabina...' : 'No hay heats publicados para narrar.'}
          </section>
        ) : null}
      </div>
    </main>
  )
}
