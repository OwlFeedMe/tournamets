import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, MailCheck, MailX, Clock, X } from 'lucide-react'
import api from '../api/axios'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ status }) {
  const map = {
    pending: { label: 'Pendiente', bg: 'rgba(255,179,111,0.12)', color: '#FFB36F', border: 'rgba(255,179,111,0.3)' },
    accepted: { label: 'Aceptada', bg: 'rgba(94,234,212,0.12)', color: '#8DF1E4', border: 'rgba(94,234,212,0.3)' },
    rejected: { label: 'Rechazada', bg: 'rgba(255,69,58,0.1)', color: '#FF6B6B', border: 'rgba(255,69,58,0.3)' },
    revoked: { label: 'Revocada', bg: 'rgba(255,255,255,0.04)', color: '#7E8796', border: '#252A33' },
  }
  const s = map[status] || map.pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      {s.label}
    </span>
  )
}

function InviteFormModal({ competition, onSave, onClose }) {
  const [form, setForm] = useState({ invited_email: '', categoria: '', note: '' })
  const [categories, setCategories] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get(`/competitions/${competition.id}/categories`)
      .then(({ data }) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [competition.id])

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErr('')
    if (!form.invited_email.trim()) { setErr('Ingresa un email'); return }
    if (!form.categoria) { setErr('Selecciona una categoria'); return }
    setBusy(true)
    try {
      const { data } = await api.post(`/competitions/${competition.id}/competitor-invitations`, {
        invited_email: form.invited_email.trim(),
        categoria: form.categoria || null,
        note: form.note.trim() || null,
      })
      onSave(data)
      onClose()
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Error al enviar la invitacion')
    } finally {
      setBusy(false)
    }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: '#0D0F12', border: '1px solid #252A33', borderRadius: 10,
    color: '#F5F7FA', padding: '10px 12px', fontSize: 14,
  }
  const labelStyle = { fontSize: 12, fontWeight: 700, color: '#AAB2C0', display: 'block', marginBottom: 6 }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.76)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#171B21', border: '1px solid #252A33', borderRadius: 20, padding: 24, maxWidth: 480, width: '100%', display: 'grid', gap: 18 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Invitar competidor</div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#AAB2C0', lineHeight: 0 }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={labelStyle}>Email del competidor *</label>
            <input style={inputStyle} type="email" value={form.invited_email} onChange={e => set('invited_email', e.target.value)} placeholder="competidor@email.com" required />
          </div>
          <div>
            <label style={labelStyle}>Categoria *</label>
            <select style={inputStyle} value={form.categoria} onChange={e => set('categoria', e.target.value)} required>
              <option value="">Selecciona una categoria...</option>
              {categories.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Nota para el competidor (opcional)</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }} value={form.note} onChange={e => set('note', e.target.value)} placeholder="Mensaje adicional..." />
          </div>
          {err && <div style={{ fontSize: 13, color: '#FF6B6B', background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}
          <button type="submit" disabled={busy} style={{ background: '#FF6B00', border: 'none', borderRadius: 10, color: '#fff', padding: '11px 0', fontWeight: 800, fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Enviando...' : 'Enviar invitacion'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function CompetitorInvitationsPage({ competition }) {
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState(null)
  const [revokeBusy, setRevokeBusy] = useState(false)
  const [err, setErr] = useState('')

  const enabled = Boolean(competition?.invitations_enabled)

  useEffect(() => {
    if (!competition?.id || !enabled) { setLoading(false); return }
    api.get(`/competitions/${competition.id}/competitor-invitations`)
      .then(({ data }) => setInvitations(Array.isArray(data) ? data : []))
      .catch(() => setErr('No se pudo cargar la lista de invitaciones'))
      .finally(() => setLoading(false))
  }, [competition?.id, enabled])

  const handleSaved = (inv) => {
    setInvitations(prev => [inv, ...prev])
  }

  const handleRevoke = async () => {
    if (!revokeTarget) return
    setRevokeBusy(true)
    try {
      await api.delete(`/competitions/${competition.id}/competitor-invitations/${revokeTarget.id}`)
      setInvitations(prev => prev.map(i => i.id === revokeTarget.id ? { ...i, status: 'revoked' } : i))
      setRevokeTarget(null)
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Error al revocar')
    } finally {
      setRevokeBusy(false)
    }
  }

  if (!enabled) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#7E8796' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#AAB2C0', marginBottom: 8 }}>Invitaciones no habilitadas</div>
        <div style={{ fontSize: 13 }}>El administrador de FinalRep debe habilitar las invitaciones de competidores para esta competencia.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 16 }}>Invitaciones de competidores</h4>
          <div style={{ fontSize: 13, color: '#7E8796', marginTop: 4 }}>Invita competidores por email. Quedan inscritos sin pasar por pasarela de pago.</div>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FF6B00', border: 'none', borderRadius: 10, color: '#fff', padding: '9px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
        >
          <Plus size={15} /> Invitar competidor
        </button>
      </div>

      {err && <div style={{ fontSize: 13, color: '#FF6B6B', background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)', borderRadius: 8, padding: '10px 14px' }}>{err}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#7E8796', padding: 32, fontSize: 13 }}>Cargando...</div>
      ) : invitations.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#7E8796', padding: 32, fontSize: 13 }}>No hay invitaciones enviadas todavia.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {invitations.map(inv => (
            <div key={inv.id} style={{ background: '#0D0F12', border: '1px solid #252A33', borderRadius: 14, padding: 16, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#F5F7FA' }}>{inv.invited_email}</div>
                  {inv.categoria && <div style={{ fontSize: 12, color: '#AAB2C0', marginTop: 2 }}>Categoria: {inv.categoria}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <StatusBadge status={inv.status} />
                  {inv.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => setRevokeTarget(inv)}
                      style={{ background: 'none', border: '1px solid rgba(255,69,58,0.28)', borderRadius: 8, padding: '4px 10px', color: '#FF6B6B', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Revocar
                    </button>
                  )}
                </div>
              </div>
              {inv.note && <div style={{ fontSize: 12, color: '#7E8796', fontStyle: 'italic' }}>"{inv.note}"</div>}
              <div style={{ fontSize: 11, color: '#4A5568', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span>Enviada: {formatDate(inv.created_at)}</span>
                {inv.accepted_at && <span>Aceptada: {formatDate(inv.accepted_at)}</span>}
                {inv.rejected_at && <span>Rechazada: {formatDate(inv.rejected_at)}</span>}
                {inv.revoked_at && <span>Revocada: {formatDate(inv.revoked_at)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && createPortal(
        <InviteFormModal competition={competition} onSave={handleSaved} onClose={() => setShowForm(false)} />,
        document.body
      )}

      {revokeTarget && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.76)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setRevokeTarget(null)}>
          <div style={{ background: '#171B21', border: '1px solid #252A33', borderRadius: 20, padding: 24, maxWidth: 420, width: '100%', display: 'grid', gap: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Revocar invitacion</div>
            <div style={{ fontSize: 14, color: '#AAB2C0' }}>¿Seguro que quieres revocar la invitacion para <strong style={{ color: '#F5F7FA' }}>{revokeTarget.invited_email}</strong>? El competidor no podra aceptarla.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setRevokeTarget(null)} style={{ background: '#252A33', border: 'none', borderRadius: 10, color: '#AAB2C0', padding: '9px 18px', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
              <button type="button" onClick={handleRevoke} disabled={revokeBusy} style={{ background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 10, color: '#FF6B6B', padding: '9px 18px', fontWeight: 700, cursor: revokeBusy ? 'not-allowed' : 'pointer', opacity: revokeBusy ? 0.7 : 1 }}>
                {revokeBusy ? 'Revocando...' : 'Revocar'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
