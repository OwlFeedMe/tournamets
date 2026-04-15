import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import api from '../api/axios'
import { buildCityCountry, loadCitiesByCountry, loadCountries, parseCityCountry } from '../utils/locations'
import { APP_CONTENT_MAX_WIDTH } from '../utils/competitionLayout'
import { useAuth } from '../context/AuthContext'
import { formatMissingParticipantProfileFields } from '../utils/participantProfile'
import {
  Trophy, PlusCircle, Medal,
  X, Users, Crown, UserPlus, Pencil, Check, ChevronRight, Bell, UserCog, Clock3, KeyRound, Eye, EyeOff,
} from 'lucide-react'

const PENDING_CEDULA_PREFIX = 'pending:'

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(estado) {
  if (estado === 'confirmado') return { label: 'Confirmado', cls: 'badge-confirmado' }
  if (estado === 'pendiente') return { label: 'Pendiente', cls: 'badge-pendiente' }
  if (estado === 'rechazado') return { label: 'Rechazado', cls: 'badge-rechazado' }
  return { label: estado || 'No inscrito', cls: 'badge-default' }
}

function formatDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString()
}

function formatBirthDate(value) {
  if (!value) return '-'
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString()
}

function resolveProfilePhoto(url) {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url
  }
  return url
}

function displayCedula(value) {
  if (!value || value.startsWith(PENDING_CEDULA_PREFIX)) return ''
  return value
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function centerCropToBlob(image, zoom = 1, outputSize = 512) {
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const context = canvas.getContext('2d')
  const minSide = Math.min(image.width, image.height)
  const cropSize = minSide / Math.max(zoom, 1)
  const sx = (image.width - cropSize) / 2
  const sy = (image.height - cropSize) / 2
  context.drawImage(image, sx, sy, cropSize, cropSize, 0, 0, outputSize, outputSize)
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.84)
  })
}

function parseTimeToSeconds(value) {
  const raw = (value ?? '').toString().trim()
  if (!raw) return null
  if (/^\d+$/.test(raw)) return Number(raw)
  const parts = raw.split(':').map(p => p.trim())
  if (parts.length !== 2 && parts.length !== 3) return null
  const nums = parts.map(Number)
  if (nums.some(n => !Number.isFinite(n) || n < 0)) return null
  let h = 0, m = 0, s = 0
  if (nums.length === 2) { [m, s] = nums } else { [h, m, s] = nums }
  if (m > 59 || s > 59) return null
  return (h * 3600) + (m * 60) + s
}

function normalizeMeasurementMethod(raw, tipo) {
  const value = (raw || '').toString().trim().toLowerCase()
  if (value === 'tiempo_hms' || value === 'hh:mm:ss' || value === 'hms') return 'tiempo_hms'
  if (value === 'posicion' || value === 'posición') return 'posicion'
  if (value) return value
  const t = (tipo || '').toString().trim().toLowerCase()
  if (t === 'tiempo') return 'tiempo_hms'
  if (t === 'posicion') return 'posicion'
  return 'unidades'
}

function phaseTypeFromMethod(method) {
  const m = normalizeMeasurementMethod(method)
  if (m === 'tiempo_hms') return 'tiempo'
  if (m === 'posicion') return 'posicion'
  return 'cantidad'
}

function getCompetitionScheduleHref(competitionId, personal = false) {
  if (!competitionId) return '/profile'
  return personal ? `/competitions/${competitionId}/my-schedule` : `/competitions/${competitionId}/schedule`
}

function organizerApplicationBadge(status) {
  if (status === 'approved') return { label: 'Aprobada', color: '#22C55E', border: 'rgba(34,197,94,0.28)', background: 'rgba(34,197,94,0.12)' }
  if (status === 'rejected') return { label: 'Rechazada', color: '#EF4444', border: 'rgba(239,68,68,0.28)', background: 'rgba(239,68,68,0.12)' }
  return { label: 'Pendiente', color: '#F59E0B', border: 'rgba(245,158,11,0.28)', background: 'rgba(245,158,11,0.12)' }
}

// ── Competition Detail Modal ──────────────────────────────────────────────────

function ConfirmCancelEnrollmentModal({ competition, busy, onClose, onConfirm }) {
  if (!competition) return null
  const paymentStatus = String(competition.payment_status || '').trim().toLowerCase()
  const paidOrInProgress = !!competition.payment_reference && !['', 'rejected', 'failed', 'voided', 'void_rejected'].includes(paymentStatus)

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.68)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 'calc(20px + env(safe-area-inset-top, 0px)) 12px calc(20px + env(safe-area-inset-bottom, 0px))',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 440,
        borderRadius: 22,
        background: '#171B21',
        border: '1px solid #252A33',
        boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #252A33', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 18 }}>Cancelar inscripcion</div>
            <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 4 }}>{competition.nombre}</div>
          </div>
          <button type="button" onClick={onClose} style={{ width: 34, height: 34, borderRadius: 12, border: '1px solid #252A33', background: 'transparent', color: '#F5F7FA', display: 'grid', placeItems: 'center' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ color: '#AAB2C0', fontSize: 14, lineHeight: 1.6 }}>
            {paidOrInProgress
              ? 'Ya existe un pago asociado a esta inscripcion. Si deseas devolucion, debes solicitarla directamente al organizador despues del cierre de inscripciones.'
              : 'Esta accion retirara tu inscripcion de la competencia.'}
          </div>
          <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(255,107,0,0.24)', background: 'linear-gradient(135deg, rgba(255,107,0,0.12), rgba(255,154,61,0.04))', color: '#F5F7FA', fontSize: 14, fontWeight: 700 }}>
            {competition.nombre}
          </div>
          {paidOrInProgress ? (
            <div style={{ marginTop: 12, color: '#AAB2C0', fontSize: 13, lineHeight: 1.6 }}>
              Estado del pago: <span style={{ color: '#F5F7FA', fontWeight: 700 }}>{competition.payment_status || 'en proceso'}</span>
            </div>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Volver</button>
            {!paidOrInProgress ? (
              <button type="button" className="btn-danger" onClick={() => onConfirm(competition)} disabled={busy}>
                {busy ? 'Cancelando...' : 'Confirmar cancelacion'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function CompetitionDetailModal({ comp, participantId, allResults, onClose, isMobile }) {
  const [team, setTeam] = useState(null)
  const [teamLoading, setTeamLoading] = useState(true)
  const [pendingInvites, setPendingInvites] = useState([])
  const [renameValue, setRenameValue] = useState('')
  const [showRename, setShowRename] = useState(false)
  const [inviteCedula, setInviteCedula] = useState('')
  const [inviteMsg, setInviteMsg] = useState(null)
  const [renameMsg, setRenameMsg] = useState(null)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [renameBusy, setRenameBusy] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(null)
  const [transferBusy, setTransferBusy] = useState(null)
  const [transferMsg, setTransferMsg] = useState(null)

  const compResults = allResults.filter(r => r.competition_id === comp.id)

  const loadTeam = useCallback(async () => {
    setTeamLoading(true)
    try {
      const res = await api.get(`/teams?competition_id=${comp.id}`)
      const myTeam = (res.data || []).find(t => (t.members || []).some(m => m.id === participantId))
      setTeam(myTeam || null)
      if (myTeam) setRenameValue(myTeam.nombre)
    } catch {
      setTeam(null)
    } finally {
      setTeamLoading(false)
    }
  }, [comp.id, participantId])

  const loadPendingInvites = useCallback(async (teamId) => {
    try {
      const res = await api.get(`/teams/${teamId}/invitations`)
      setPendingInvites(res.data || [])
    } catch {
      setPendingInvites([])
    }
  }, [])

  useEffect(() => {
    loadTeam()
  }, [loadTeam])

  useEffect(() => {
    if (team && team.captain_id === participantId) {
      loadPendingInvites(team.id)
    }
  }, [team, participantId, loadPendingInvites])

  const isCaptain = team?.captain_id === participantId
  const canSeeMySchedule = String(comp?.enrollment_estado || '').trim().toLowerCase() === 'confirmado'

  const handleRename = async (e) => {
    e.preventDefault()
    if (!renameValue.trim()) return
    setRenameBusy(true)
    setRenameMsg(null)
    try {
      await api.put(`/teams/${team.id}/rename`, { nombre: renameValue.trim() })
      setRenameMsg({ type: 'success', text: 'Nombre actualizado' })
      setShowRename(false)
      await loadTeam()
    } catch (err) {
      setRenameMsg({ type: 'error', text: err.response?.data?.detail || 'Error al renombrar' })
    } finally {
      setRenameBusy(false)
    }
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    if (!inviteCedula.trim()) return
    setInviteBusy(true)
    setInviteMsg(null)
    try {
      const res = await api.post(`/teams/${team.id}/invite`, { invitee_cedula: inviteCedula.trim() })
      const name = res.data?.invitee ? `${res.data.invitee.nombre} ${res.data.invitee.apellido}` : inviteCedula
      setInviteMsg({ type: 'success', text: `Invitacion enviada a ${name}` })
      setInviteCedula('')
      await loadPendingInvites(team.id)
    } catch (err) {
      setInviteMsg({ type: 'error', text: err.response?.data?.detail || 'Error al enviar invitacion' })
    } finally {
      setInviteBusy(false)
    }
  }

  const handleCancelInvite = async (invId) => {
    setCancelBusy(invId)
    try {
      await api.delete(`/teams/${team.id}/invitations/${invId}`)
      await loadPendingInvites(team.id)
    } catch {
      // silent
    } finally {
      setCancelBusy(null)
    }
  }

  const handleTransferCaptain = async (newCaptainId) => {
    if (!window.confirm('¿Seguro que quieres transferir la capitanía?')) return
    setTransferBusy(newCaptainId)
    setTransferMsg(null)
    try {
      await api.put(`/teams/${team.id}/transfer-captain`, { captain_id: newCaptainId })
      setTransferMsg({ type: 'success', text: 'Capitanía transferida' })
      await loadTeam()
    } catch (err) {
      setTransferMsg({ type: 'error', text: err.response?.data?.detail || 'Error al transferir' })
    } finally {
      setTransferBusy(null)
    }
  }

  const badge = statusBadge(comp.enrollment_estado)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000,
      padding: 'calc(20px + env(safe-area-inset-top, 0px)) 12px calc(20px + env(safe-area-inset-bottom, 0px))',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16,
        width: '100%', maxWidth: 600,
        maxHeight: '100%',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{
          padding: isMobile ? '16px 16px 12px' : '20px 24px 14px',
          borderBottom: '1px solid var(--oa-border)',
          background: '#171B21',
          borderRadius: '16px 16px 0 0',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              <div style={{ fontWeight: 800, fontSize: isMobile ? 17 : 20, color: '#fff', lineHeight: 1.2 }}>{comp.nombre}</div>
              {comp.descripcion && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>{comp.descripcion}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className={`badge ${badge.cls}`} style={{ fontSize: 11 }}>{badge.label}</span>
                {comp.activa === 1 && <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>ACTIVA</span>}
                {comp.enrollment_categoria && (
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Cat: <b style={{ color: '#fff' }}>{comp.enrollment_categoria}</b></span>
                )}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: isMobile ? '14px 16px' : '18px 24px' }}>

          {/* Team section */}
          {teamLoading ? (
            <div style={{ color: 'var(--oa-text-secondary)', fontSize: 13, textAlign: 'center', padding: '14px 0' }}>Cargando equipo...</div>
          ) : team ? (
            <div style={{ marginBottom: 18 }}>
              {/* Team header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Users size={15} color="#FF6B00" />
                <span style={{ fontWeight: 700, fontSize: 14, color: '#FF6B00' }}>Tu equipo</span>
                {isCaptain && (
                  <span style={{ fontSize: 10, background: '#fff3cd', color: '#664d03', borderRadius: 4, padding: '2px 7px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Crown size={10} /> CAPITAN
                  </span>
                )}
              </div>

              {/* Team name + rename */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                {showRename ? (
                  <form onSubmit={handleRename} style={{ display: 'flex', gap: 6, flex: 1 }}>
                    <input
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      style={{ flex: 1, fontSize: 14, padding: '6px 10px' }}
                      placeholder="Nuevo nombre..."
                      autoFocus
                    />
                    <button type="submit" className="btn-primary btn-sm" disabled={renameBusy}>
                      {renameBusy ? '...' : <Check size={14} />}
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => { setShowRename(false); setRenameMsg(null) }}>
                      <X size={14} />
                    </button>
                  </form>
                ) : (
                  <>
                    <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--oa-text)' }}>{team.nombre}</span>
                    {isCaptain && (
                      <button className="btn-secondary btn-sm" onClick={() => setShowRename(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Pencil size={12} /> Renombrar
                      </button>
                    )}
                  </>
                )}
              </div>
              {renameMsg && <div className={`alert alert-${renameMsg.type}`} style={{ marginBottom: 8, fontSize: 12 }}>{renameMsg.text}</div>}

              {/* Members list */}
              {transferMsg && <div className={`alert alert-${transferMsg.type}`} style={{ marginBottom: 8, fontSize: 12 }}>{transferMsg.text}</div>}
              <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                {(team.members || []).map(m => (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    borderRadius: 8, border: `1px solid ${m.is_captain ? 'rgba(245, 158, 11, 0.32)' : 'var(--oa-border)'}`,
                    background: m.is_captain ? 'rgba(245, 158, 11, 0.12)' : m.id === participantId ? 'rgba(0, 194, 168, 0.12)' : 'rgba(255,255,255,0.03)',
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: m.is_captain ? 'rgba(245, 158, 11, 0.18)' : 'rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: m.is_captain ? '#fbbf24' : '#FF6B00',
                    }}>
                      {m.is_captain ? <Crown size={14} /> : (m.nombre?.charAt(0) || '?')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{m.nombre} {m.apellido}</span>
                      {m.id === participantId && <span style={{ fontSize: 11, color: '#FF6B00', marginLeft: 6 }}>(tú)</span>}
                    </div>
                    {m.is_captain ? (
                      <span style={{ fontSize: 10, background: '#fff3cd', color: '#664d03', borderRadius: 4, padding: '2px 6px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                        <Crown size={9} /> Capitán
                      </span>
                    ) : isCaptain && (
                      <button
                        className="btn-secondary btn-sm"
                        title="Transferir capitanía a este miembro"
                        onClick={() => handleTransferCaptain(m.id)}
                        disabled={transferBusy === m.id}
                        style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
                      >
                        <Crown size={11} /> {transferBusy === m.id ? '...' : 'Dar capitanía'}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Captain: invite section */}
              {isCaptain && (
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--oa-border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#FF6B00', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <UserPlus size={14} /> Invitar participante
                  </div>
                  <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={inviteCedula}
                      onChange={e => setInviteCedula(e.target.value)}
                      placeholder="Cedula del participante..."
                      style={{ flex: 1, fontSize: 14 }}
                    />
                    <button type="submit" className="btn-primary btn-sm" disabled={inviteBusy || !inviteCedula.trim()}>
                      {inviteBusy ? '...' : 'Invitar'}
                    </button>
                  </form>
                  {inviteMsg && <div className={`alert alert-${inviteMsg.type}`} style={{ marginTop: 8, fontSize: 12 }}>{inviteMsg.text}</div>}

                  {/* Pending invites sent */}
                  {pendingInvites.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--oa-text-secondary)', marginBottom: 6 }}>Invitaciones pendientes:</div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        {pendingInvites.map(inv => (
                          <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '5px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid var(--oa-border)' }}>
                            <span>{inv.invitee_nombre || inv.invitee_cedula}</span>
                            <button className="btn-secondary btn-sm" onClick={() => handleCancelInvite(inv.id)} disabled={cancelBusy === inv.id} style={{ fontSize: 11, padding: '2px 8px' }}>
                              {cancelBusy === inv.id ? '...' : 'Cancelar'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {/* Results section */}
          {compResults.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#FF6B00', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Trophy size={14} /> Tus resultados
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {compResults.map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--oa-border)', background: 'rgba(255,255,255,0.03)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{r.fase || 'Sin fase'}</div>
                      {r.equipo && <div style={{ fontSize: 11, color: 'var(--oa-text-secondary)', marginTop: 2 }}>Equipo: {r.equipo}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                      {r.posicion ? (
                        <>
                          <div style={{ fontWeight: 800, color: '#FF6B00', fontSize: 20 }}>#{r.posicion}</div>
                          <div style={{ fontSize: 10, color: 'var(--oa-text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>posicion</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontWeight: 800, color: '#FF6B00', fontSize: 22 }}>{r.puntos}</div>
                          <div style={{ fontSize: 10, color: 'var(--oa-text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>puntos</div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!teamLoading && !team && compResults.length === 0 && (
            <div style={{ color: 'var(--oa-text-muted)', textAlign: 'center', padding: '20px 0', fontSize: 13 }}>
              Aun no hay resultados registrados para esta competencia
            </div>
          )}

          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            {canSeeMySchedule ? (
              <Link
                to={getCompetitionScheduleHref(comp.id, true)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 10, border: '1px solid rgba(0,194,168,0.24)', background: 'linear-gradient(135deg, rgba(0,194,168,0.12), rgba(13,15,18,0.92))', color: '#DFFFF9', fontWeight: 800, fontSize: 14, textDecoration: 'none' }}
              >
                <Clock3 size={16} /> Mi cronograma <ChevronRight size={14} />
              </Link>
            ) : null}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <Link
                to={getCompetitionScheduleHref(comp.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 10, border: '1px solid #252A33', background: '#171B21', color: '#F5F7FA', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}
              >
                <Users size={16} /> Cronograma
              </Link>
              <a
                href={`/leaderboard/${comp.id}`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 10, border: '1px solid #252A33', background: '#171B21', color: '#FF6B00', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}
              >
                <Medal size={16} /> Leaderboard
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ParticipantProfile() {
  const location = useLocation()
  const { participantId, displayName, organizerEnabled } = useAuth()
  const nombre = displayName || 'Participante'

  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  const [results, setResults] = useState([])
  const [myComps, setMyComps] = useState([])
  const [phasesByComp, setPhasesByComp] = useState({})
  const [myTeamByComp, setMyTeamByComp] = useState({})
  const [form, setForm] = useState({ competition_id: '', phase_id: '', puntos: '', posicion: '' })
  const [msg, setMsg] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [cancelEnrollmentBusy, setCancelEnrollmentBusy] = useState(null)
  const [cancelEnrollmentTarget, setCancelEnrollmentTarget] = useState(null)

  // Modal state
  const [selectedComp, setSelectedComp] = useState(null)

  // Pending invitations received
  const [pendingInvitations, setPendingInvitations] = useState([])
  const [invBusy, setInvBusy] = useState(null)
  const [invMsg, setInvMsg] = useState(null)

  // Edit profile
  const [myProfile, setMyProfile] = useState(null)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editMsg, setEditMsg] = useState(null)
  const [editBusy, setEditBusy] = useState(false)
  const [photoMsg, setPhotoMsg] = useState(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoEditorOpen, setPhotoEditorOpen] = useState(false)
  const [photoDraftUrl, setPhotoDraftUrl] = useState('')
  const [photoDraftImage, setPhotoDraftImage] = useState(null)
  const [photoZoom, setPhotoZoom] = useState(1.15)
  const [changePwOpen, setChangePwOpen] = useState(false)
  const [changePwForm, setChangePwForm] = useState({ current: '', next: '', confirm: '' })
  const [changePwShow, setChangePwShow] = useState({ current: false, next: false, confirm: false })
  const [changePwMsg, setChangePwMsg] = useState(null)
  const [changePwBusy, setChangePwBusy] = useState(false)
  const [organizerApplication, setOrganizerApplication] = useState(null)
  const [organizerMissingFields, setOrganizerMissingFields] = useState([])
  const [organizerRequestOpen, setOrganizerRequestOpen] = useState(false)
  const [organizerRequestBusy, setOrganizerRequestBusy] = useState(false)
  const [organizerRequestMsg, setOrganizerRequestMsg] = useState(null)
  const [organizerRequestForm, setOrganizerRequestForm] = useState({
    requested_event_name: '',
    requested_event_location: '',
    requested_event_date: '',
    requested_event_description: '',
    why_organizer: '',
    prior_events_summary: '',
    why_finalrep: '',
  })
  const displayGenero = myProfile?.genero || myProfile?.sexo || '-'
  const [countries, setCountries] = useState([])
  const [allCities, setAllCities] = useState([])
  const [showCitySuggestions, setShowCitySuggestions] = useState(false)
  const photoInputRef = useRef(null)
  const countryNameByCode = useMemo(() => Object.fromEntries(countries.map(c => [c.code, c.name])), [countries])
  const countryCodeByName = useMemo(() => Object.fromEntries(countries.map(c => [c.name.toLowerCase(), c.code])), [countries])
  const cityOptions = useMemo(() => {
    const list = allCities
    const query = (editForm.city || '').trim().toLowerCase()
    if (!query) return list.slice(0, 5)
    return list.filter(city => city.toLowerCase().includes(query)).slice(0, 5)
  }, [allCities, editForm.city])

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    return () => {
      if (photoDraftUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(photoDraftUrl)
      }
    }
  }, [photoDraftUrl])

  useEffect(() => {
    const hasOverlay = Boolean(selectedComp || photoEditorOpen || showEditProfile || cancelEnrollmentTarget || organizerRequestOpen)
    window.dispatchEvent(new CustomEvent('finalrep:overlay-visibility', { detail: { open: hasOverlay } }))
    if (!hasOverlay || typeof document === 'undefined') {
      return () => {
        window.dispatchEvent(new CustomEvent('finalrep:overlay-visibility', { detail: { open: false } }))
      }
    }

    const { body, documentElement } = document
    const previousBodyOverflow = body.style.overflow
    const previousBodyTouchAction = body.style.touchAction
    const previousHtmlOverflow = documentElement.style.overflow
    const previousHtmlOverscroll = documentElement.style.overscrollBehavior

    body.style.overflow = 'hidden'
    body.style.touchAction = 'none'
    documentElement.style.overflow = 'hidden'
    documentElement.style.overscrollBehavior = 'none'

    return () => {
      body.style.overflow = previousBodyOverflow
      body.style.touchAction = previousBodyTouchAction
      documentElement.style.overflow = previousHtmlOverflow
      documentElement.style.overscrollBehavior = previousHtmlOverscroll
      window.dispatchEvent(new CustomEvent('finalrep:overlay-visibility', { detail: { open: false } }))
    }
  }, [selectedComp, photoEditorOpen, showEditProfile, cancelEnrollmentTarget, organizerRequestOpen])

  useEffect(() => {
    loadCountries().then(setCountries).catch(() => setCountries([]))
  }, [])

  useEffect(() => {
    if (!editForm.countryCode) {
      setAllCities([])
      setShowCitySuggestions(false)
      return
    }
    loadCitiesByCountry(editForm.countryCode).then(setAllCities).catch(() => setAllCities([]))
  }, [editForm.countryCode])

  useEffect(() => {
    if (!showEditProfile) {
      setShowCitySuggestions(false)
    }
  }, [showEditProfile])

  const loadResults = () => api.get('/results').then(r => setResults(r.data))
  const loadMyCompetitions = async () => { const res = await api.get(`/participants/${participantId}/competitions`); setMyComps(res.data) }
  const loadMyInvitations = async () => {
    try {
      const res = await api.get('/teams/my-invitations')
      setPendingInvitations(res.data || [])
    } catch { setPendingInvitations([]) }
  }
  const loadMyProfile = async () => {
    try {
      const res = await api.get('/participants/me')
      setMyProfile(res.data)
      setEditForm({
        nombre: res.data.nombre || '',
        apellido: res.data.apellido || '',
        cedula: displayCedula(res.data.cedula),
        email: res.data.email || '',
        celular: res.data.celular || '',
        genero: res.data.genero || res.data.sexo || '',
        categoria: res.data.categoria || '',
        box: res.data.box || '',
        fecha_nacimiento: res.data.fecha_nacimiento || '',
        ciudad_pais: res.data.ciudad_pais || '',
        ...(() => {
          const parsed = parseCityCountry(res.data.ciudad_pais || '')
          return { city: parsed.city }
        })(),
      })
    } catch { /* silent */ }
  }
  const loadOrganizerApplication = async () => {
    try {
      const res = await api.get('/organizer-applications/me')
      setOrganizerApplication(res.data?.application || null)
      setOrganizerMissingFields(Array.isArray(res.data?.missing_profile_fields) ? res.data.missing_profile_fields : [])
    } catch {
      setOrganizerApplication(null)
      setOrganizerMissingFields([])
    }
  }

  useEffect(() => {
    if (!countries.length || !editForm.ciudad_pais || editForm.countryCode) return
    const parsed = parseCityCountry(editForm.ciudad_pais)
    if (!parsed.countryName) return
    const countryCode = countryCodeByName[parsed.countryName.toLowerCase()] || ''
    if (countryCode) {
      setEditForm(f => ({ ...f, countryCode }))
    }
  }, [countries, countryCodeByName, editForm.ciudad_pais, editForm.countryCode])

  useEffect(() => {
    loadMyProfile().catch(() => {})
    loadOrganizerApplication().catch(() => {})
    if (!participantId) {
      setMyComps([])
      setPendingInvitations([])
      setResults([])
      return
    }
    Promise.all([loadResults(), loadMyCompetitions(), loadMyInvitations()]).catch(() => {})
  }, [participantId])

  const enrollmentByComp = useMemo(() => {
    const map = {}
    for (const c of myComps) map[c.id] = c
    return map
  }, [myComps])

  const confirmedComps = useMemo(
    () => myComps.filter(c => c.enrollment_estado === 'confirmado'),
    [myComps]
  )

  const resultEnabledComps = useMemo(
    () => confirmedComps.filter(c => c.activa && c.allow_user_results),
    [confirmedComps]
  )

  useEffect(() => {
    if (!resultEnabledComps.length) { setForm(f => ({ ...f, competition_id: '', phase_id: '' })); return }
    const current = Number(form.competition_id)
    const exists = resultEnabledComps.some(c => c.id === current)
    if (!exists) setForm(f => ({ ...f, competition_id: resultEnabledComps[0].id, phase_id: '' }))
  }, [resultEnabledComps, form.competition_id])

  useEffect(() => {
    if (!showForm || !resultEnabledComps.length) return
    resultEnabledComps.forEach(async (c) => {
      if (!(c.id in phasesByComp)) {
        try {
          const res = await api.get(`/competitions/${c.id}/phases?estado=en_progreso`)
          setPhasesByComp(prev => ({ ...prev, [c.id]: res.data }))
        } catch { setPhasesByComp(prev => ({ ...prev, [c.id]: [] })) }
      }
      if (!(c.id in myTeamByComp)) {
        try {
          const res = await api.get(`/teams?competition_id=${c.id}`)
          const myTeam = res.data.find(t => t.members.some(m => m.id === participantId))
          setMyTeamByComp(prev => ({ ...prev, [c.id]: myTeam || null }))
        } catch { setMyTeamByComp(prev => ({ ...prev, [c.id]: null })) }
      }
    })
  }, [showForm, resultEnabledComps])

  const saveProfile = async (e) => {
    e.preventDefault()
    setEditBusy(true)
    setEditMsg(null)
    const payload = {}
    for (const [k, v] of Object.entries(editForm)) {
      if (['city', 'countryCode', 'ciudad_pais'].includes(k)) continue
      const trimmed = typeof v === 'string' ? v.trim() : v
      if (trimmed) payload[k] = trimmed
    }
    const city = (editForm.city || '').trim()
    const countryCode = (editForm.countryCode || '').trim()
    const countryName = countryNameByCode[countryCode] || ''
    if ((city || countryCode) && !(city && countryCode)) {
      setEditBusy(false)
      setEditMsg({ type: 'error', text: 'Selecciona pais y ciudad validos' })
      return
    }
    if (city && countryCode && !allCities.some(candidate => candidate.toLowerCase() === city.toLowerCase())) {
      setEditBusy(false)
      setEditMsg({ type: 'error', text: 'La ciudad no pertenece al pais seleccionado' })
      return
    }
    if (city && countryName) payload.ciudad_pais = buildCityCountry(city, countryName)
    try {
      const res = await api.patch('/participants/me', payload)
      setMyProfile(res.data)
      localStorage.setItem('nombre', `${res.data.nombre} ${res.data.apellido}`)
      setEditForm((current) => ({
        ...current,
        nombre: res.data.nombre || '',
        apellido: res.data.apellido || '',
        cedula: displayCedula(res.data.cedula),
        email: res.data.email || '',
        celular: res.data.celular || '',
        genero: res.data.genero || res.data.sexo || '',
        categoria: res.data.categoria || '',
        box: res.data.box || '',
        fecha_nacimiento: res.data.fecha_nacimiento || '',
        ciudad_pais: res.data.ciudad_pais || '',
      }))
      setEditMsg({ type: 'success', text: 'Datos actualizados correctamente' })
      loadOrganizerApplication()
      setShowEditProfile(false)
    } catch (err) {
      setEditMsg({ type: 'error', text: err.response?.data?.detail || 'Error al guardar' })
    } finally {
      setEditBusy(false)
    }
  }

  const submitOrganizerApplication = async (e) => {
    e.preventDefault()
    setOrganizerRequestBusy(true)
    setOrganizerRequestMsg(null)
    try {
      const payload = {
        requested_event_name: organizerRequestForm.requested_event_name.trim(),
        requested_event_location: organizerRequestForm.requested_event_location.trim() || null,
        requested_event_date: organizerRequestForm.requested_event_date || null,
        requested_event_description: organizerRequestForm.requested_event_description.trim() || null,
        why_organizer: organizerRequestForm.why_organizer.trim(),
        prior_events_summary: organizerRequestForm.prior_events_summary.trim() || null,
        why_finalrep: organizerRequestForm.why_finalrep.trim(),
      }
      const { data } = await api.post('/organizer-applications', payload)
      setOrganizerApplication(data?.application || null)
      setOrganizerRequestMsg({ type: 'success', text: 'Tu solicitud fue enviada para revision del equipo FinalRep.' })
      setOrganizerRequestOpen(false)
      setOrganizerRequestForm({
        requested_event_name: '',
        requested_event_location: '',
        requested_event_date: '',
        requested_event_description: '',
        why_organizer: '',
        prior_events_summary: '',
        why_finalrep: '',
      })
      loadOrganizerApplication()
    } catch (err) {
      setOrganizerRequestMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo enviar la solicitud' })
    } finally {
      setOrganizerRequestBusy(false)
    }
  }

  const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/

  const submitChangePassword = async (e) => {
    e.preventDefault()
    setChangePwMsg(null)
    if (!STRONG_PASSWORD_REGEX.test(changePwForm.next)) {
      setChangePwMsg({ type: 'error', text: 'La contrasena debe tener minimo 8 caracteres, mayuscula, minuscula, numero y caracter especial' })
      return
    }
    if (changePwForm.next !== changePwForm.confirm) {
      setChangePwMsg({ type: 'error', text: 'Las contrasenas no coinciden' })
      return
    }
    setChangePwBusy(true)
    try {
      await api.post('/auth/change-password', { current_password: changePwForm.current, new_password: changePwForm.next })
      setChangePwMsg({ type: 'success', text: 'Contrasena actualizada correctamente' })
      setChangePwForm({ current: '', next: '', confirm: '' })
      setChangePwOpen(false)
    } catch (err) {
      setChangePwMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo cambiar la contrasena' })
    } finally {
      setChangePwBusy(false)
    }
  }

  const closePhotoEditor = useCallback(() => {
    setPhotoEditorOpen(false)
    setPhotoDraftImage(null)
    setPhotoZoom(1.15)
    if (photoDraftUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(photoDraftUrl)
    }
    setPhotoDraftUrl('')
    if (photoInputRef.current) {
      photoInputRef.current.value = ''
    }
  }, [photoDraftUrl])

  const onSelectProfilePhoto = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setPhotoMsg({ type: 'error', text: 'Selecciona una imagen valida' })
      return
    }

    try {
      const url = URL.createObjectURL(file)
      const image = await loadImageElement(url)
      setPhotoMsg(null)
      setPhotoDraftUrl((previous) => {
        if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous)
        return url
      })
      setPhotoDraftImage(image)
      setPhotoZoom(1.15)
      setPhotoEditorOpen(true)
    } catch {
      setPhotoMsg({ type: 'error', text: 'No se pudo abrir la imagen' })
    }
  }

  const saveProfilePhoto = async () => {
    if (!photoDraftImage) return
    setPhotoBusy(true)
    setPhotoMsg(null)
    try {
      const blob = await centerCropToBlob(photoDraftImage, photoZoom, 512)
      if (!blob) {
        throw new Error('No se pudo preparar la imagen')
      }
      const formData = new FormData()
      formData.append('file', blob, 'profile-photo.jpg')
      const { data } = await api.post('/participants/me/photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setMyProfile(data)
      setPhotoMsg({ type: 'success', text: 'Foto actualizada' })
      closePhotoEditor()
    } catch (err) {
      setPhotoMsg({ type: 'error', text: err.response?.data?.detail || err.message || 'No se pudo guardar la foto' })
    } finally {
      setPhotoBusy(false)
    }
  }

  const submitResult = async (e) => {
    e.preventDefault()
    setMsg(null)
    const compId = Number(form.competition_id)
    const phaseObj = (phasesByComp[compId] || []).find(p => p.id === Number(form.phase_id))
    const measurementMethod = normalizeMeasurementMethod(phaseObj?.measurement_method, phaseObj?.tipo)
    const isPosition = phaseTypeFromMethod(measurementMethod) === 'posicion'
    const isTime = measurementMethod === 'tiempo_hms'
    const metricValue = isPosition ? null : (isTime ? parseTimeToSeconds(form.puntos) : Number(form.puntos || 0))
    if (!isPosition && (metricValue == null || Number.isNaN(metricValue))) {
      setMsg({ type: 'error', text: isTime ? 'Tiempo invalido. Usa HH:MM:SS' : 'Valor invalido' })
      return
    }
    const payload = {
      participant_id: participantId,
      competition_id: compId,
      marca: isPosition ? undefined : metricValue,
      puntos: isPosition ? 0 : metricValue,
    }
    if (form.phase_id) payload.phase_id = Number(form.phase_id)
    if (isPosition) payload.posicion = Number(form.posicion)
    try {
      await api.post('/results', payload)
      setMsg({ type: 'success', text: 'Resultado cargado correctamente' })
      setShowForm(false)
      loadResults()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'Error al cargar resultado' })
    }
  }

  const acceptInvitation = async (invId) => {
    setInvBusy(invId)
    setInvMsg(null)
    try {
      await api.post(`/teams/invitations/${invId}/accept`)
      setInvMsg({ type: 'success', text: 'Te has unido al equipo' })
      await loadMyInvitations()
    } catch (err) {
      setInvMsg({ type: 'error', text: err.response?.data?.detail || 'Error al aceptar' })
    } finally { setInvBusy(null) }
  }

  const rejectInvitation = async (invId) => {
    setInvBusy(invId)
    setInvMsg(null)
    try {
      await api.delete(`/teams/invitations/${invId}`)
      await loadMyInvitations()
    } catch (err) {
      setInvMsg({ type: 'error', text: err.response?.data?.detail || 'Error al rechazar' })
    } finally { setInvBusy(null) }
  }

  const totalPuntos = results.reduce((acc, r) => acc + (r.puntos || 0), 0)
  const initial = nombre.trim().charAt(0).toUpperCase() || 'P'
  const profilePhotoUrl = resolveProfilePhoto(myProfile?.profile_photo_url)
  const organizerBadge = organizerApplication ? organizerApplicationBadge(organizerApplication.status) : null
  const canOpenOrganizerRequest = !organizerApplication || organizerApplication.status === 'rejected'
  const profileRequirementNotice = location.state?.profileRequiredForEnrollment
    ? `Completa tu perfil antes de participar${location.state?.competitionName ? ` en ${location.state.competitionName}` : ''}. Faltan: ${formatMissingParticipantProfileFields(location.state?.missingFields || [])}.`
    : ''

  const compId = Number(form.competition_id)
  const phasesRaw = phasesByComp[compId]
  const phasesLoading = phasesRaw === undefined
  const phasesEmpty = Array.isArray(phasesRaw) && phasesRaw.length === 0
  const phasesForComp = phasesRaw || []
  const phaseObj = phasesForComp.find(p => p.id === Number(form.phase_id))
  const measurementMethod = normalizeMeasurementMethod(phaseObj?.measurement_method, phaseObj?.tipo)
  const isPosition = phaseTypeFromMethod(measurementMethod) === 'posicion'
  const isTime = measurementMethod === 'tiempo_hms'
  const myTeam = myTeamByComp[compId]
  const teamMode = phaseObj?.team_result_mode

  // Open modal with enriched comp (merge enrollment data)
  const openModal = (c) => {
    const enrolled = enrollmentByComp[c.id]
    setSelectedComp({ ...c, enrollment_estado: enrolled?.enrollment_estado, enrollment_categoria: enrolled?.enrollment_categoria })
  }

  const cancelEnrollment = async (competition) => {
    setCancelEnrollmentBusy(competition.id)
    setMsg(null)
    try {
      await api.delete(`/competitions/${competition.id}/enroll`)
      if (selectedComp?.id === competition.id) {
        setSelectedComp(null)
      }
      setCancelEnrollmentTarget(null)
      setMsg({ type: 'success', text: `Inscripcion cancelada en ${competition.nombre}` })
      await loadMyCompetitions()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo cancelar la inscripcion' })
    } finally {
      setCancelEnrollmentBusy(null)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0D0F12' }}>

      {/* Modal */}
      {cancelEnrollmentTarget && (
        <ConfirmCancelEnrollmentModal
          competition={cancelEnrollmentTarget}
          busy={cancelEnrollmentBusy === cancelEnrollmentTarget.id}
          onClose={() => !cancelEnrollmentBusy && setCancelEnrollmentTarget(null)}
          onConfirm={cancelEnrollment}
        />
      )}

      {selectedComp && (
        <CompetitionDetailModal
          comp={selectedComp}
          participantId={participantId}
          allResults={results}
          onClose={() => setSelectedComp(null)}
          isMobile={isMobile}
        />
      )}

      {photoEditorOpen && photoDraftUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.68)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(20px + env(safe-area-inset-top, 0px)) 12px calc(20px + env(safe-area-inset-bottom, 0px))' }}>
          <div style={{ width: '100%', maxWidth: 420, maxHeight: '100%', overflowY: 'auto', borderRadius: 22, background: '#171B21', border: '1px solid #252A33', padding: 18, boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 18 }}>Ajustar foto</div>
                <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4 }}>Vista previa del recorte circular antes de guardar.</div>
              </div>
              <button type="button" onClick={closePhotoEditor} style={{ width: 34, height: 34, borderRadius: 12, border: '1px solid #252A33', background: 'transparent', color: '#F5F7FA', display: 'grid', placeItems: 'center' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', placeItems: 'center', marginBottom: 16 }}>
              <div style={{ width: 220, height: 220, borderRadius: '50%', overflow: 'hidden', border: '4px solid rgba(255,255,255,0.12)', background: '#0D0F12', position: 'relative' }}>
                <img
                  src={photoDraftUrl}
                  alt="Vista previa de foto de perfil"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: `scale(${photoZoom})`,
                    transformOrigin: 'center center',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', color: '#AAB2C0', fontSize: 12, marginBottom: 8 }}>Zoom</label>
              <input type="range" min="1" max="2.4" step="0.05" value={photoZoom} onChange={e => setPhotoZoom(Number(e.target.value))} style={{ width: '100%' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn-secondary btn-sm" onClick={closePhotoEditor}>Cancelar</button>
              <button type="button" className="btn-primary btn-sm" onClick={saveProfilePhoto} disabled={photoBusy}>
                {photoBusy ? 'Guardando...' : 'Guardar foto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {organizerRequestOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.68)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(20px + env(safe-area-inset-top, 0px)) 12px calc(20px + env(safe-area-inset-bottom, 0px))' }}>
          <div style={{ width: '100%', maxWidth: 760, height: 'min(88dvh, 88vh)', maxHeight: '100%', borderRadius: 22, background: '#171B21', border: '1px solid #252A33', boxShadow: '0 24px 80px rgba(0,0,0,0.35)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '16px 18px', background: 'rgba(23,27,33,0.98)', borderBottom: '1px solid #252A33' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#F5F7FA' }}>Crear competencia</div>
                <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4 }}>Solicitud para convertir tu cuenta en organizador.</div>
              </div>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setOrganizerRequestOpen(false)}>Cerrar</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18, WebkitOverflowScrolling: 'touch' }}>
              {organizerRequestMsg && <div className={`alert alert-${organizerRequestMsg.type}`} style={{ marginBottom: 12 }}>{organizerRequestMsg.text}</div>}
              <div style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14, color: '#D7DEE8', fontSize: 13, lineHeight: 1.65, marginBottom: 14 }}>
                FinalRep tomara una captura de tu perfil actual para revisar la solicitud. Debes tener completos cedula, email, celular, genero, fecha de nacimiento y ciudad o pais.
              </div>
              {!!organizerMissingFields.length && (
                <div style={{ borderRadius: 16, border: '1px solid rgba(239,68,68,0.28)', background: 'rgba(239,68,68,0.08)', padding: 14, color: '#F5F7FA', fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
                  Antes de enviar esta solicitud completa tu perfil. Faltan: {organizerMissingFields.join(', ')}.
                </div>
              )}
              <form onSubmit={submitOrganizerApplication}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Evento que quieres hacer</label>
                    <input value={organizerRequestForm.requested_event_name} onChange={e => setOrganizerRequestForm(f => ({ ...f, requested_event_name: e.target.value }))} placeholder="Nombre tentativo del evento" required />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Lugar estimado</label>
                    <input value={organizerRequestForm.requested_event_location} onChange={e => setOrganizerRequestForm(f => ({ ...f, requested_event_location: e.target.value }))} placeholder="Ciudad, box o sede" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Fecha estimada</label>
                    <input type="date" value={organizerRequestForm.requested_event_date} onChange={e => setOrganizerRequestForm(f => ({ ...f, requested_event_date: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? undefined : 'span 2' }}>
                    <label>Que evento quieres hacer</label>
                    <textarea rows={4} value={organizerRequestForm.requested_event_description} onChange={e => setOrganizerRequestForm(f => ({ ...f, requested_event_description: e.target.value }))} placeholder="Formato, categoria de atletas, volumen esperado, sede o enfoque del evento" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? undefined : 'span 2' }}>
                    <label>Por que quieres ser organizador</label>
                    <textarea rows={4} value={organizerRequestForm.why_organizer} onChange={e => setOrganizerRequestForm(f => ({ ...f, why_organizer: e.target.value }))} placeholder="Cuentanos por que quieres organizar dentro de FinalRep" required />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? undefined : 'span 2' }}>
                    <label>Ya has hecho eventos</label>
                    <textarea rows={4} value={organizerRequestForm.prior_events_summary} onChange={e => setOrganizerRequestForm(f => ({ ...f, prior_events_summary: e.target.value }))} placeholder="Describe eventos previos, resultados, volumen o experiencia organizando" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? undefined : 'span 2' }}>
                    <label>Por que quieres hacerlo con FinalRep</label>
                    <textarea rows={4} value={organizerRequestForm.why_finalrep} onChange={e => setOrganizerRequestForm(f => ({ ...f, why_finalrep: e.target.value }))} placeholder="Cuentanos por que elegiste FinalRep" required />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setOrganizerRequestOpen(false)}>Cancelar</button>
                  <button type="submit" className="btn-primary" disabled={organizerRequestBusy || !!organizerMissingFields.length}>
                    {organizerRequestBusy ? 'Enviando...' : 'Enviar solicitud'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: isMobile ? '14px 12px' : '24px 20px' }}>
        {profileRequirementNotice ? (
          <div style={{ marginBottom: 16, borderRadius: 16, border: '1px solid rgba(255,107,0,0.28)', background: 'rgba(255,107,0,0.08)', padding: '14px 16px', color: '#F5F7FA', fontSize: 14, lineHeight: 1.6 }}>
            {profileRequirementNotice}
          </div>
        ) : null}

        {/* Profile hero */}
        <div style={{
          background: 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)', borderRadius: 14,
          padding: isMobile ? '18px 16px' : '24px',
          marginBottom: 16, display: 'flex', alignItems: 'center', gap: isMobile ? 14 : 20,
        }}>
          <div style={{
            width: isMobile ? 50 : 62, height: isMobile ? 50 : 62, flexShrink: 0,
            borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: isMobile ? 20 : 26, fontWeight: 800, color: '#fff', overflow: 'hidden',
          }}>
            {profilePhotoUrl ? (
              <img
                src={profilePhotoUrl}
                alt={myProfile ? `${myProfile.nombre} ${myProfile.apellido}` : nombre}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : initial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: isMobile ? 16 : 20, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{myProfile ? `${myProfile.nombre} ${myProfile.apellido}` : nombre}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Participante{displayCedula(myProfile?.cedula) ? ` · ${displayCedula(myProfile?.cedula)}` : ''}</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {myProfile?.categoria && <span style={{ fontSize: 11, color: '#fff', background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '3px 8px' }}>{myProfile.categoria}</span>}
              {myProfile?.box && <span style={{ fontSize: 11, color: '#fff', background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '3px 8px' }}>{myProfile.box}</span>}
              {myProfile?.ciudad_pais && <span style={{ fontSize: 11, color: '#fff', background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '3px 8px' }}>{myProfile.ciudad_pais}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'Bebas Neue, monospace', fontSize: isMobile ? 44 : 56, lineHeight: 1, color: '#0D0F12' }}>{totalPuntos}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>puntos</div>
            </div>
            <button
              onClick={() => { setShowEditProfile(v => !v); setEditMsg(null) }}
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, padding: '5px 10px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <UserCog size={13} /> {showEditProfile ? 'Cerrar' : 'Editar datos'}
            </button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16, padding: isMobile ? 14 : 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Ficha del atleta</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div><div style={{ fontSize: 11, color: 'var(--oa-text-secondary)', marginBottom: 4 }}>Box</div><div style={{ fontWeight: 600 }}>{myProfile?.box || '-'}</div></div>
            <div><div style={{ fontSize: 11, color: 'var(--oa-text-secondary)', marginBottom: 4 }}>Fecha nacimiento</div><div style={{ fontWeight: 600 }}>{formatBirthDate(myProfile?.fecha_nacimiento)}</div></div>
            <div><div style={{ fontSize: 11, color: 'var(--oa-text-secondary)', marginBottom: 4 }}>Ciudad / Pais</div><div style={{ fontWeight: 600 }}>{myProfile?.ciudad_pais || '-'}</div></div>
            <div><div style={{ fontSize: 11, color: 'var(--oa-text-secondary)', marginBottom: 4 }}>Genero</div><div style={{ fontWeight: 600 }}>{displayGenero}</div></div>
            <div><div style={{ fontSize: 11, color: 'var(--oa-text-secondary)', marginBottom: 4 }}>Contacto</div><div style={{ fontWeight: 600 }}>{myProfile?.email || myProfile?.celular || '-'}</div></div>
          </div>
        </div>

        {msg && <div className={`alert alert-${msg.type}`} style={{ marginBottom: 12 }}>{msg.text}</div>}

        {/* Edit profile form */}
        {showEditProfile && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.68)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(20px + env(safe-area-inset-top, 0px)) 12px calc(20px + env(safe-area-inset-bottom, 0px))' }}>
            <div style={{ width: '100%', maxWidth: 760, height: 'min(86dvh, 86vh)', maxHeight: '100%', borderRadius: 22, background: '#171B21', border: '1px solid #252A33', boxShadow: '0 24px 80px rgba(0,0,0,0.35)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '16px 18px', background: 'rgba(23,27,33,0.98)', borderBottom: '1px solid #252A33' }}>
                <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, color: '#F5F7FA' }}>
                  <UserCog size={15} /> Mis datos
                </div>
                <button type="button" className="btn-secondary btn-sm" onClick={() => { setShowEditProfile(false); setEditMsg(null) }}>Cerrar</button>
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18, WebkitOverflowScrolling: 'touch' }}>
                {(editMsg || photoMsg) && <div className={`alert alert-${(editMsg || photoMsg).type}`} style={{ marginBottom: 12 }}>{(editMsg || photoMsg).text}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
                  <div style={{ width: 92, height: 92, borderRadius: '50%', overflow: 'hidden', background: 'rgba(255,255,255,0.05)', border: '3px solid var(--oa-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: '#FF6B00' }}>
                    {profilePhotoUrl ? (
                      <img src={profilePhotoUrl} alt="Foto de perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : initial}
                  </div>
                  <div style={{ minWidth: 220, flex: 1 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4, color: '#F5F7FA' }}>Foto de perfil</div>
                    <div style={{ color: '#AAB2C0', fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
                      Elige una imagen, revisa como quedara dentro del circulo y guardala optimizada en almacenamiento local.
                    </div>
                    <input ref={photoInputRef} type="file" accept="image/*" onChange={onSelectProfilePhoto} style={{ display: 'none' }} />
                    <button type="button" className="btn-secondary btn-sm" onClick={() => photoInputRef.current?.click()}>
                      {profilePhotoUrl ? 'Cambiar foto' : 'Subir foto'}
                    </button>
                  </div>
                </div>
                <form onSubmit={saveProfile}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Nombre</label>
                  <input value={editForm.nombre || ''} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre" required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Apellido</label>
                  <input value={editForm.apellido || ''} onChange={e => setEditForm(f => ({ ...f, apellido: e.target.value }))} placeholder="Apellido" required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Cédula</label>
                  <input value={editForm.cedula || ''} onChange={e => setEditForm(f => ({ ...f, cedula: e.target.value.replace(/\D/g, '') }))} placeholder="Cédula" inputMode="numeric" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Celular</label>
                  <input value={editForm.celular || ''} onChange={e => setEditForm(f => ({ ...f, celular: e.target.value.replace(/\D/g, '') }))} placeholder="Celular" inputMode="tel" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Email</label>
                  <input value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" type="email" inputMode="email" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Genero</label>
                  <select value={editForm.genero || ''} onChange={e => setEditForm(f => ({ ...f, genero: e.target.value }))}>
                    <option value="">Sin especificar</option>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Box</label>
                  <input value={editForm.box || ''} onChange={e => setEditForm(f => ({ ...f, box: e.target.value }))} placeholder="Lugar donde entrenas" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Fecha nacimiento</label>
                  <input type="date" value={editForm.fecha_nacimiento || ''} onChange={e => setEditForm(f => ({ ...f, fecha_nacimiento: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? undefined : 'span 2' }}>
                  <label>Ciudad / Pais</label>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                    <select value={editForm.countryCode || ''} onChange={e => { setShowCitySuggestions(false); setEditForm(f => ({ ...f, countryCode: e.target.value, city: '' })) }}>
                      <option value="">Selecciona pais</option>
                      {countries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}
                    </select>
                    <div style={{ position: 'relative' }}>
                      <input
                        value={editForm.city || ''}
                        onChange={e => {
                          setEditForm(f => ({ ...f, city: e.target.value }))
                          setShowCitySuggestions(true)
                        }}
                        onFocus={() => {
                          if (editForm.countryCode) setShowCitySuggestions(true)
                        }}
                        onBlur={() => {
                          window.setTimeout(() => setShowCitySuggestions(false), 120)
                        }}
                        placeholder={editForm.countryCode ? 'Escribe o selecciona ciudad' : 'Primero selecciona un pais'}
                        disabled={!editForm.countryCode}
                      />
                      {showCitySuggestions && editForm.countryCode && cityOptions.length > 0 ? (
                        <div style={{
                          position: 'absolute',
                          top: 'calc(100% + 6px)',
                          left: 0,
                          right: 0,
                          zIndex: 30,
                          background: '#171B21',
                          border: '1px solid #252A33',
                          borderRadius: 8,
                          boxShadow: '0 16px 32px rgba(0,0,0,0.28)',
                          overflow: 'hidden',
                        }}>
                          {cityOptions.map(city => (
                            <button
                              key={city}
                              type="button"
                              onMouseDown={() => {
                                setEditForm(f => ({ ...f, city }))
                                setShowCitySuggestions(false)
                              }}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '10px 12px',
                                border: 'none',
                                borderBottom: city === cityOptions[cityOptions.length - 1] ? 'none' : '1px solid #252A33',
                                background: '#171B21',
                                color: '#F5F7FA',
                                cursor: 'pointer',
                              }}
                            >
                              {city}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? undefined : 'span 2' }}>
                  <label>Categoría</label>
                  <input value={editForm.categoria || ''} onChange={e => setEditForm(f => ({ ...f, categoria: e.target.value }))} placeholder="Ej: Rx, Scaled, Masters..." />
                </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => { setShowEditProfile(false); setEditMsg(null) }}>Cancelar</button>
                    <button type="submit" className="btn-primary" disabled={editBusy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Check size={14} /> {editBusy ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Pending invitations */}
        {pendingInvitations.length > 0 && (
          <div className="card" style={{ marginBottom: 16, padding: isMobile ? 14 : 20, border: '1px solid rgba(245, 158, 11, 0.35)' }}>
            <h3 style={{ marginBottom: 12, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: '#fbbf24' }}>
              <Bell size={15} />
              Invitaciones de equipo
              <span style={{ background: 'var(--oa-warning)', color: '#0D0F12', borderRadius: '50%', width: 20, height: 20, fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {pendingInvitations.length}
              </span>
            </h3>
            {invMsg && <div className={`alert alert-${invMsg.type}`} style={{ marginBottom: 10, fontSize: 13 }}>{invMsg.text}</div>}
            <div style={{ display: 'grid', gap: 8 }}>
              {pendingInvitations.map(inv => (
                <div key={inv.id} style={{ padding: '12px', borderRadius: 8, border: '1px solid rgba(245, 158, 11, 0.32)', background: 'rgba(245, 158, 11, 0.12)', display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {inv.team?.nombre || 'Equipo'}
                    </div>
                    {inv.captain_nombre && (
                      <div style={{ fontSize: 12, color: 'var(--oa-text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Crown size={11} color="#e8a800" /> Capitán: {inv.captain_nombre}
                      </div>
                    )}
                    {inv.team?.members?.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--oa-text-muted)', marginTop: 3 }}>
                        {inv.team.members.map(m => m.nombre).join(', ')}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexDirection: isMobile ? 'column' : 'row' }}>
                    <button className="btn-primary btn-sm" onClick={() => acceptInvitation(inv.id)} disabled={invBusy === inv.id} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, flex: isMobile ? 1 : undefined }}>
                      <Check size={13} /> Aceptar
                    </button>
                    <button className="btn-secondary btn-sm" onClick={() => rejectInvitation(inv.id)} disabled={invBusy === inv.id} style={{ flex: isMobile ? 1 : undefined }}>
                      Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Load result CTA */}
        {resultEnabledComps.length > 0 && !showForm && (
          <button
            className="btn-primary"
            onClick={() => setShowForm(true)}
            style={{ width: '100%', padding: '14px', fontSize: 15, borderRadius: 10, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <PlusCircle size={18} /> Cargar resultado
          </button>
        )}

        {/* Result form */}
        {showForm && (
          <div className="card" style={{ marginBottom: 16, padding: isMobile ? 14 : 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Cargar resultado</h3>
              <button className="btn-secondary btn-sm" onClick={() => setShowForm(false)}>✕ Cancelar</button>
            </div>
            <form onSubmit={submitResult}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Competencia</label>
                  <select value={form.competition_id} onChange={e => setForm({ ...form, competition_id: e.target.value, phase_id: '', puntos: '', posicion: '' })}>
                    {resultEnabledComps.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Evento en progreso</label>
                  {phasesLoading
                    ? <div style={{ padding: '10px 0', color: 'var(--oa-text-secondary)', fontSize: 13 }}>Cargando eventos...</div>
                    : phasesEmpty
                      ? <div style={{ padding: '10px 0', color: 'var(--oa-error)', fontSize: 13, fontWeight: 600 }}>Sin eventos en progreso</div>
                      : (
                        <select value={form.phase_id} onChange={e => setForm({ ...form, phase_id: e.target.value, puntos: '', posicion: '' })} required>
                          <option value="">Seleccionar evento...</option>
                          {phasesForComp.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                      )
                  }
                </div>
              </div>

              {phaseObj && (
                <>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                    <span style={{ fontSize: 12, background: 'rgba(255, 107, 0, 0.14)', color: '#FF9A3D', borderRadius: 6, padding: '4px 10px', fontWeight: 600 }}>
                      {isPosition ? 'Por posicion' : isTime ? 'Por tiempo' : 'Por cantidad'}
                    </span>
                    {teamMode && (
                      <span style={{ fontSize: 12, background: 'rgba(0, 194, 168, 0.14)', color: 'var(--oa-accent)', borderRadius: 6, padding: '4px 10px', fontWeight: 600 }}>
                        {teamMode === 'sum_two' ? 'Equipo: suma' : 'Equipo: individual'}
                      </span>
                    )}
                    {myTeam && (
                      <span style={{ fontSize: 12, background: '#fff3cd', color: '#664d03', borderRadius: 6, padding: '4px 10px' }}>
                        Equipo: <b>{myTeam.nombre}</b>
                      </span>
                    )}
                  </div>
                  <div className="form-group">
                    <label>{isPosition ? 'Posicion obtenida' : isTime ? 'Tiempo (HH:MM:SS)' : 'Valor'}</label>
                    <input
                      type={isPosition ? 'number' : (isTime ? 'text' : 'number')}
                      min={isPosition ? 1 : (isTime ? undefined : 0)}
                      placeholder={isPosition ? 'Ej: 1, 2, 3...' : isTime ? 'Ej: 00:03:05' : 'Ej: 42'}
                      value={isPosition ? form.posicion : form.puntos}
                      onChange={e => setForm({ ...form, [isPosition ? 'posicion' : 'puntos']: e.target.value })}
                      style={{ fontSize: 20, padding: '14px', textAlign: 'center' }}
                      required
                    />
                    {phaseObj.descripcion && <div style={{ fontSize: 12, color: 'var(--oa-text-secondary)', marginTop: 6 }}>{phaseObj.descripcion}</div>}
                  </div>
                </>
              )}

              <button
                type="submit" className="btn-primary"
                disabled={phasesLoading || phasesEmpty || !form.phase_id}
                style={{ width: '100%', padding: '14px', fontSize: 15, marginTop: 4 }}
              >
                Guardar resultado
              </button>
            </form>
          </div>
        )}

        {/* My enrollments */}
        {myComps.length > 0 && (
          <div className="card" style={{ marginBottom: 16, padding: isMobile ? 14 : 20 }}>
            <h3 style={{ marginBottom: 12, fontSize: 15, fontWeight: 700 }}>Mis inscripciones</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {myComps.map(c => {
                const badge = statusBadge(c.enrollment_estado)
                const isConfirmed = c.enrollment_estado === 'confirmado'
                const isBusy = cancelEnrollmentBusy === c.id
                const paymentStatus = String(c.payment_status || '').trim().toLowerCase()
                const canCancel = !c.payment_reference || ['', 'rejected', 'failed', 'voided', 'void_rejected'].includes(paymentStatus)
                return (
                  <div
                    key={c.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--oa-border)', background: 'rgba(255,255,255,0.03)', justifyContent: 'space-between', minHeight: isMobile ? 56 : undefined }}
                  >
                    <div style={{ minWidth: 0, flex: 1, cursor: isConfirmed ? 'pointer' : 'default' }} onClick={() => isConfirmed && openModal(c)}>
                      <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</div>
                      {c.enrollment_categoria && <div style={{ fontSize: 11, color: 'var(--oa-text-secondary)', marginTop: 1 }}>Cat: {c.enrollment_categoria}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span className={`badge ${badge.cls}`}>{badge.label}</span>
                      <button type="button" className="btn-secondary btn-sm" onClick={() => setCancelEnrollmentTarget(c)} disabled={isBusy || !canCancel} title={canCancel ? 'Cancelar inscripcion' : 'Debes solicitar la devolucion al organizador despues del cierre de inscripciones'}>
                        {isBusy ? 'Cancelando...' : 'Cancelar'}
                      </button>
                      {isConfirmed && <ChevronRight size={14} color="var(--oa-text-secondary)" />}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 16, padding: isMobile ? 14 : 18, border: '1px dashed rgba(170,178,192,0.22)', background: 'rgba(23,27,33,0.78)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#6B7280', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Acceso especial</div>
              <div style={{ color: '#F5F7FA', fontSize: 14, fontWeight: 700, marginTop: 6 }}>Crear competencia</div>
              <div style={{ color: '#AAB2C0', fontSize: 13, lineHeight: 1.55, marginTop: 6 }}>
                Si quieres organizar un evento dentro de FinalRep, envia una solicitud con tu perfil completo y el contexto del evento.
              </div>
              {organizerBadge && (
                <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 999, border: `1px solid ${organizerBadge.border}`, background: organizerBadge.background, color: organizerBadge.color, fontSize: 12, fontWeight: 800 }}>
                  <Clock3 size={13} />
                  Solicitud {organizerBadge.label.toLowerCase()}
                </div>
              )}
              {organizerApplication?.review_note ? (
                <div style={{ marginTop: 10, color: '#D7DEE8', fontSize: 13, lineHeight: 1.55 }}>
                  Nota de revision: {organizerApplication.review_note}
                </div>
              ) : null}
            </div>
            {organizerEnabled ? (
              <Link to="/organizer" className="btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
                Ir al panel
              </Link>
            ) : canOpenOrganizerRequest ? (
              <button type="button" className="btn-secondary btn-sm" onClick={() => { setOrganizerRequestMsg(null); setOrganizerRequestOpen(true) }}>
                Crear competencia
              </button>
            ) : null}
          </div>
        </div>

        {/* Change password */}
        <div className="card" style={{ marginBottom: 16, padding: isMobile ? 14 : 18, border: '1px dashed rgba(170,178,192,0.22)', background: 'rgba(23,27,33,0.78)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <KeyRound size={16} color="#AAB2C0" />
              <div>
                <div style={{ color: '#F5F7FA', fontSize: 14, fontWeight: 700 }}>Contrasena</div>
                <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 2 }}>Cambia tu contrasena de acceso</div>
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => { setChangePwOpen(v => !v); setChangePwMsg(null); setChangePwForm({ current: '', next: '', confirm: '' }) }}
            >
              {changePwOpen ? 'Cancelar' : 'Cambiar'}
            </button>
          </div>

          {changePwOpen && (
            <form onSubmit={submitChangePassword} style={{ marginTop: 16, borderTop: '1px solid #252A33', paddingTop: 16 }}>
              {changePwMsg && <div className={`alert alert-${changePwMsg.type}`} style={{ marginBottom: 12, fontSize: 13 }}>{changePwMsg.text}</div>}

              {[
                { field: 'current', label: 'Contrasena actual', key: 'current' },
                { field: 'next', label: 'Nueva contrasena', key: 'next' },
                { field: 'confirm', label: 'Confirmar nueva contrasena', key: 'confirm' },
              ].map(({ field, label, key }) => (
                <div key={key} className="form-group" style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 13 }}>{label}</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={changePwShow[field] ? 'text' : 'password'}
                      value={changePwForm[field]}
                      onChange={(e) => setChangePwForm(f => ({ ...f, [field]: e.target.value }))}
                      required
                      style={{ paddingRight: 44 }}
                    />
                    <button
                      type="button"
                      onClick={() => setChangePwShow(s => ({ ...s, [field]: !s[field] }))}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#AAB2C0', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                    >
                      {changePwShow[field] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {field === 'next' && (
                    <small style={{ color: '#AAB2C0', display: 'block', marginTop: 4 }}>
                      Minimo 8 caracteres, mayuscula, minuscula, numero y caracter especial.
                    </small>
                  )}
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn-primary" disabled={changePwBusy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Check size={14} /> {changePwBusy ? 'Guardando...' : 'Guardar contrasena'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* My results */}
        <div className="card" style={{ padding: isMobile ? 14 : 20 }}>
          <h3 style={{ marginBottom: 14, fontSize: 15, fontWeight: 700 }}>Mis resultados</h3>
          {results.length === 0 ? (
            <p style={{ color: 'var(--oa-text-secondary)', textAlign: 'center', padding: 24, fontSize: 14 }}>Aun no tienes resultados cargados</p>
          ) : isMobile ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {results.map(r => (
                <div key={r.id} style={{ border: '1px solid var(--oa-border)', borderRadius: 8, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.competencia}</div>
                    <div style={{ fontSize: 12, color: 'var(--oa-text-secondary)', marginTop: 2 }}>{r.fase || 'Sin fase'}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                    {r.posicion ? (
                      <>
                        <div style={{ fontWeight: 700, color: 'var(--oa-accent)', fontSize: 18 }}>#{r.posicion}</div>
                        <div style={{ fontSize: 10, color: 'var(--oa-text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>posicion</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontWeight: 700, color: 'var(--oa-accent)', fontSize: 22 }}>{r.puntos}</div>
                        <div style={{ fontSize: 10, color: 'var(--oa-text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>puntos</div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <table>
              <thead>
                <tr><th>Competencia</th><th>Evento</th><th style={{ textAlign: 'right' }}>Puntos</th><th style={{ textAlign: 'right' }}>Posicion</th></tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.id}>
                    <td>{r.competencia}</td>
                    <td style={{ color: 'var(--oa-text-secondary)', fontSize: 13 }}>{r.fase || '-'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--oa-accent)' }}>{r.posicion ? '-' : r.puntos}</td>
                    <td style={{ textAlign: 'right' }}>{r.posicion || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}
