import {
  ArrowLeft,
  Check,
  Dumbbell,
  MapPin,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  UserMinus,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'

const TABS = ['Perfil', 'Afiliaciones', 'Staff', 'Sedes']

const MEMBERSHIP_STATUS_LABELS = {
  declared: { label: 'Declarado', color: '#8b94a3' },
  pending_approval: { label: 'Pendiente', color: '#cdaa6b' },
  approved: { label: 'Aprobado', color: '#22c55e' },
  rejected: { label: 'Rechazado', color: '#ef4444' },
  removed: { label: 'Removido', color: '#8b94a3' },
}

const STAFF_ROLE_LABELS = {
  owner: 'Dueño',
  manager: 'Manager',
  coach: 'Coach',
  staff: 'Staff',
}

// ── Shared input style ─────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%',
  background: '#0d0f12',
  border: '1px solid var(--oa-border)',
  borderRadius: 10,
  padding: '10px 12px',
  color: 'var(--oa-text)',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--oa-text-muted)',
  display: 'block',
  marginBottom: 6,
}

function Field({ label, value, onChange, placeholder, type = 'text', textarea }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={labelStyle}>{label}</span>
      {textarea ? (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={inputStyle}
        />
      )}
    </label>
  )
}

function SaveBar({ dirty, saving, onSave }) {
  if (!dirty) return null
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 80,
        background: '#171a20',
        border: '1px solid var(--oa-border)',
        borderRadius: 14,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 24,
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--oa-text-muted)' }}>Cambios sin guardar</span>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        style={{
          padding: '8px 20px',
          borderRadius: 10,
          border: 'none',
          background: 'var(--oa-accent)',
          color: '#0d0f12',
          fontSize: 13,
          fontWeight: 800,
          cursor: saving ? 'default' : 'pointer',
        }}
      >
        {saving ? 'Guardando...' : 'Guardar'}
      </button>
    </div>
  )
}

// ── Tab: Perfil ────────────────────────────────────────────────────────────────

function ProfileTab({ gym, gymId, myRole, onUpdated }) {
  const [form, setForm] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingAsset, setUploadingAsset] = useState('')
  const [error, setError] = useState('')
  const logoInputRef = useRef(null)
  const coverInputRef = useRef(null)

  useEffect(() => {
    setForm({
      display_name: gym.display_name || '',
      short_description: gym.short_description || '',
      full_description: gym.full_description || '',
      logo_url: gym.logo_url || '',
      cover_image_url: gym.cover_image_url || '',
      website_url: gym.website_url || '',
      instagram_url: gym.instagram_url || '',
      whatsapp_url: gym.whatsapp_url || '',
      contact_email: gym.contact_email || '',
      contact_phone: gym.contact_phone || '',
      head_coach_name: gym.head_coach_name || '',
      founded_year: gym.founded_year || '',
    })
    setDirty(false)
  }, [gym])

  const set = (field) => (value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const { data } = await api.patch(`/gyms/${gymId}`, form)
      onUpdated(data.gym)
      setDirty(false)
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const uploadAsset = async (assetType, file) => {
    if (!file) return
    setUploadingAsset(assetType)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post(`/gyms/${gymId}/assets?asset_type=${assetType}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onUpdated(data.gym)
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al subir imagen')
    } finally {
      setUploadingAsset('')
      if (logoInputRef.current) logoInputRef.current.value = ''
      if (coverInputRef.current) coverInputRef.current.value = ''
    }
  }

  const removeAsset = async (assetType) => {
    setUploadingAsset(assetType)
    setError('')
    try {
      const { data } = await api.delete(`/gyms/${gymId}/assets?asset_type=${assetType}`)
      onUpdated(data.gym)
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al eliminar imagen')
    } finally {
      setUploadingAsset('')
    }
  }

  const isOwner = myRole === 'owner'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {isOwner && <Field label="Nombre del gym" value={form.display_name} onChange={set('display_name')} />}
      <Field label="Descripción corta" value={form.short_description} onChange={set('short_description')} placeholder="Frase que aparece en las cards" />
      <Field label="Descripción completa" value={form.full_description} onChange={set('full_description')} textarea placeholder="Descripción completa del gym" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--oa-text-muted)' }}>Logo</div>
          <div style={{ fontSize: 11, color: 'var(--oa-text-muted)' }}>Recomendado 512 x 512 px. Formato cuadrado.</div>
          <div style={{ height: 120, borderRadius: 14, border: '1px solid var(--oa-border)', background: form.logo_url ? `#0d0f12 url(${form.logo_url}) center/cover no-repeat` : '#171a20', display: 'grid', placeItems: 'center' }}>
            {!form.logo_url && <Dumbbell size={24} color="var(--oa-text-muted)" />}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploadingAsset === 'logo'} style={{ flex: 1, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--oa-border)', background: 'transparent', color: 'var(--oa-text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Upload size={14} /> {uploadingAsset === 'logo' ? 'Subiendo...' : 'Subir'}
            </button>
            {form.logo_url && (
              <button type="button" onClick={() => removeAsset('logo')} disabled={uploadingAsset === 'logo'} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.24)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Quitar
              </button>
            )}
            <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadAsset('logo', e.target.files?.[0])} />
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--oa-text-muted)' }}>Cover</div>
          <div style={{ fontSize: 11, color: 'var(--oa-text-muted)' }}>Recomendado 1600 x 900 px. Formato horizontal 16:9.</div>
          <div style={{ height: 120, borderRadius: 14, border: '1px solid var(--oa-border)', background: form.cover_image_url ? `#0d0f12 url(${form.cover_image_url}) center/cover no-repeat` : 'linear-gradient(135deg, #1e2229 0%, #252b35 100%)' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => coverInputRef.current?.click()} disabled={uploadingAsset === 'cover'} style={{ flex: 1, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--oa-border)', background: 'transparent', color: 'var(--oa-text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Upload size={14} /> {uploadingAsset === 'cover' ? 'Subiendo...' : 'Subir'}
            </button>
            {form.cover_image_url && (
              <button type="button" onClick={() => removeAsset('cover')} disabled={uploadingAsset === 'cover'} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.24)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Quitar
              </button>
            )}
            <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadAsset('cover', e.target.files?.[0])} />
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Sitio web" value={form.website_url} onChange={set('website_url')} placeholder="https://..." />
        <Field label="Instagram" value={form.instagram_url} onChange={set('instagram_url')} placeholder="https://instagram.com/..." />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="WhatsApp" value={form.whatsapp_url} onChange={set('whatsapp_url')} placeholder="https://wa.me/..." />
        <Field label="Email de contacto" value={form.contact_email} onChange={set('contact_email')} type="email" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Teléfono" value={form.contact_phone} onChange={set('contact_phone')} placeholder="+57 300..." />
        <Field label="Head Coach" value={form.head_coach_name} onChange={set('head_coach_name')} />
      </div>
      <Field label="Año de fundación" value={form.founded_year} onChange={set('founded_year')} type="number" placeholder="2018" />

      {error && <p style={{ fontSize: 13, color: 'var(--oa-error)' }}>{error}</p>}
      <SaveBar dirty={dirty} saving={saving} onSave={save} />
    </div>
  )
}

// ── Tab: Afiliaciones ──────────────────────────────────────────────────────────

function MembershipsTab({ gymId }) {
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending_approval')
  const [acting, setActing] = useState(null)

  const load = async (statusFilter) => {
    setLoading(true)
    try {
      const { data } = await api.get(`/gyms/${gymId}/memberships?status=${statusFilter}`)
      setMemberships(data)
    } catch {
      setMemberships([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(filter) }, [gymId, filter])

  const act = async (membershipId, action) => {
    setActing(membershipId)
    try {
      if (action === 'approve') {
        await api.post(`/gyms/${gymId}/memberships/${membershipId}/approve`)
      } else if (action === 'reject') {
        await api.post(`/gyms/${gymId}/memberships/${membershipId}/reject`)
      } else if (action === 'remove') {
        await api.delete(`/gyms/${gymId}/memberships/${membershipId}`)
      }
      load(filter)
    } catch {
      // silent
    } finally {
      setActing(null)
    }
  }

  const statusLabel = MEMBERSHIP_STATUS_LABELS[filter] || { label: filter }

  return (
    <div>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {['pending_approval', 'declared', 'approved', 'rejected', 'all'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              border: filter === s ? '1px solid var(--oa-accent)' : '1px solid var(--oa-border)',
              background: filter === s ? 'rgba(94,234,212,0.1)' : 'transparent',
              color: filter === s ? 'var(--oa-accent)' : 'var(--oa-text-muted)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {MEMBERSHIP_STATUS_LABELS[s]?.label || 'Todos'}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--oa-text-muted)', fontSize: 13 }}>Cargando...</p>
      ) : memberships.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--oa-text-muted)', fontSize: 13 }}>
          No hay afiliaciones con estado "{statusLabel.label}"
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {memberships.map((m) => {
            const sl = MEMBERSHIP_STATUS_LABELS[m.status] || { label: m.status, color: '#8b94a3' }
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: '#171a20',
                  border: '1px solid var(--oa-border)',
                  borderRadius: 12,
                  padding: '10px 14px',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: '#252b35',
                    flexShrink: 0,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Users size={14} color="var(--oa-text-muted)" />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--oa-text)' }}>
                    Usuario #{m.user_id}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--oa-text-muted)' }}>
                    {m.membership_type} · {m.is_primary ? 'Gym principal' : ''}
                  </div>
                </div>

                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: sl.color,
                    padding: '2px 8px',
                    borderRadius: 999,
                    border: `1px solid ${sl.color}33`,
                    background: `${sl.color}11`,
                    flexShrink: 0,
                  }}
                >
                  {sl.label}
                </span>

                {m.status === 'pending_approval' && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => act(m.id, 'approve')}
                      disabled={acting === m.id}
                      title="Aprobar"
                      style={{
                        width: 28, height: 28, borderRadius: 8, border: 'none',
                        background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                        display: 'grid', placeItems: 'center', cursor: 'pointer',
                      }}
                    >
                      <Check size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => act(m.id, 'reject')}
                      disabled={acting === m.id}
                      title="Rechazar"
                      style={{
                        width: 28, height: 28, borderRadius: 8, border: 'none',
                        background: 'rgba(239,68,68,0.15)', color: '#ef4444',
                        display: 'grid', placeItems: 'center', cursor: 'pointer',
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}

                {m.status === 'approved' && (
                  <button
                    type="button"
                    onClick={() => act(m.id, 'remove')}
                    disabled={acting === m.id}
                    title="Remover"
                    style={{
                      width: 28, height: 28, borderRadius: 8, border: 'none',
                      background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                      display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    <UserMinus size={13} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tab: Staff ─────────────────────────────────────────────────────────────────

function StaffTab({ gymId, myRole }) {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState({ email: '', role: 'coach' })
  const [addError, setAddError] = useState('')
  const [acting, setActing] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/gyms/${gymId}/staff`)
      setStaff(data)
    } catch {
      setStaff([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [gymId])

  const addStaff = async () => {
    if (!addForm.email.trim()) { setAddError('Ingresa un email'); return }
    setActing('add')
    setAddError('')
    try {
      await api.post(`/gyms/${gymId}/staff`, addForm)
      setAdding(false)
      setAddForm({ email: '', role: 'coach' })
      load()
    } catch (err) {
      setAddError(err.response?.data?.detail || 'Usuario no encontrado o ya es staff')
    } finally {
      setActing(null)
    }
  }

  const removeStaff = async (staffId) => {
    setActing(staffId)
    try {
      await api.delete(`/gyms/${gymId}/staff/${staffId}`)
      load()
    } catch {
      // silent
    } finally {
      setActing(null)
    }
  }

  const updateRole = async (staffId, newRole) => {
    try {
      await api.patch(`/gyms/${gymId}/staff/${staffId}`, { role: newRole })
      load()
    } catch {
      // silent
    }
  }

  const isOwner = myRole === 'owner'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 10,
            border: '1px solid var(--oa-border)',
            background: 'transparent',
            color: 'var(--oa-text-secondary)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Agregar staff
        </button>
      </div>

      {adding && (
        <div
          style={{
            background: '#171a20', border: '1px solid var(--oa-border)',
            borderRadius: 12, padding: '16px', marginBottom: 16,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          <input
            value={addForm.email}
            onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="Email del usuario"
            style={inputStyle}
          />
          <select
            value={addForm.role}
            onChange={(e) => setAddForm((p) => ({ ...p, role: e.target.value }))}
            style={{ ...inputStyle }}
          >
            <option value="manager">Manager</option>
            <option value="coach">Coach</option>
            <option value="staff">Staff</option>
          </select>
          {addError && <p style={{ fontSize: 12, color: 'var(--oa-error)', margin: 0 }}>{addError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setAdding(false)}
              style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid var(--oa-border)', background: 'transparent', color: 'var(--oa-text-secondary)', fontSize: 13, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button type="button" onClick={addStaff} disabled={acting === 'add'}
              style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: 'var(--oa-accent)', color: '#0d0f12', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
              {acting === 'add' ? 'Agregando...' : 'Agregar'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--oa-text-muted)', fontSize: 13 }}>Cargando...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {staff.map((s) => (
            <div
              key={s.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#171a20', border: '1px solid var(--oa-border)',
                borderRadius: 12, padding: '10px 14px',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: s.profile_photo_url ? `url(${s.profile_photo_url}) center/cover no-repeat` : '#252b35',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--oa-text)' }}>{s.display_name}</div>
                <div style={{ fontSize: 11, color: 'var(--oa-text-muted)' }}>{s.email}</div>
              </div>

              {isOwner && s.role !== 'owner' ? (
                <select
                  value={s.role}
                  onChange={(e) => updateRole(s.id, e.target.value)}
                  style={{
                    background: '#0d0f12', border: '1px solid var(--oa-border)',
                    borderRadius: 8, padding: '4px 8px',
                    color: 'var(--oa-text)', fontSize: 12, outline: 'none',
                  }}
                >
                  <option value="manager">Manager</option>
                  <option value="coach">Coach</option>
                  <option value="staff">Staff</option>
                </select>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--oa-text-muted)', flexShrink: 0 }}>
                  {STAFF_ROLE_LABELS[s.role] || s.role}
                </span>
              )}

              {isOwner && s.role !== 'owner' && (
                <button
                  type="button"
                  onClick={() => removeStaff(s.id)}
                  disabled={acting === s.id}
                  style={{
                    width: 28, height: 28, borderRadius: 8, border: 'none',
                    background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                    display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
          {staff.length === 0 && (
            <p style={{ color: 'var(--oa-text-muted)', fontSize: 13, textAlign: 'center', padding: '30px 0' }}>
              No hay staff registrado
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab: Sedes ─────────────────────────────────────────────────────────────────

function LocationsTab({ gymId }) {
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newLoc, setNewLoc] = useState({ name: '', city: '', address_line: '', contact_phone: '', schedule_summary: '' })
  const [addError, setAddError] = useState('')
  const [acting, setActing] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/gyms/${gymId}/locations`)
      setLocations(data.items || [])
    } catch {
      setLocations([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [gymId])

  const addLocation = async () => {
    if (!newLoc.city.trim()) { setAddError('Ingresa la ciudad'); return }
    setActing('add')
    setAddError('')
    try {
      await api.post(`/gyms/${gymId}/locations`, newLoc)
      setAdding(false)
      setNewLoc({ name: '', city: '', address_line: '', contact_phone: '', schedule_summary: '' })
      load()
    } catch (err) {
      setAddError(err.response?.data?.detail || 'Error al agregar sede')
    } finally {
      setActing(null)
    }
  }

  const deleteLocation = async (locId) => {
    setActing(locId)
    try {
      await api.delete(`/gyms/${gymId}/locations/${locId}`)
      load()
    } catch {
      // silent
    } finally {
      setActing(null)
    }
  }

  const setField = (f) => (v) => setNewLoc((p) => ({ ...p, [f]: v }))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 10,
            border: '1px solid var(--oa-border)',
            background: 'transparent',
            color: 'var(--oa-text-secondary)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Agregar sede
        </button>
      </div>

      {adding && (
        <div style={{
          background: '#171a20', border: '1px solid var(--oa-border)',
          borderRadius: 12, padding: 16, marginBottom: 16,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <Field label="Nombre de la sede" value={newLoc.name} onChange={setField('name')} placeholder="Sede Norte" />
          <Field label="Ciudad *" value={newLoc.city} onChange={setField('city')} placeholder="Bogotá" />
          <Field label="Dirección" value={newLoc.address_line} onChange={setField('address_line')} />
          <Field label="Teléfono" value={newLoc.contact_phone} onChange={setField('contact_phone')} />
          <Field label="Horarios" value={newLoc.schedule_summary} onChange={setField('schedule_summary')} placeholder="Lun-Vie 6am-9pm" />
          {addError && <p style={{ fontSize: 12, color: 'var(--oa-error)', margin: 0 }}>{addError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setAdding(false)}
              style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid var(--oa-border)', background: 'transparent', color: 'var(--oa-text-secondary)', fontSize: 13, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button type="button" onClick={addLocation} disabled={acting === 'add'}
              style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: 'var(--oa-accent)', color: '#0d0f12', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
              {acting === 'add' ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--oa-text-muted)', fontSize: 13 }}>Cargando...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {locations.map((loc) => (
            <div key={loc.id} style={{
              background: '#171a20', border: '1px solid var(--oa-border)',
              borderRadius: 12, padding: '12px 14px',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <MapPin size={16} color="var(--oa-text-muted)" style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {loc.name && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--oa-text)', marginBottom: 2 }}>{loc.name}</div>}
                <div style={{ fontSize: 12, color: 'var(--oa-text-muted)' }}>
                  {[loc.address_line, loc.city, loc.country].filter(Boolean).join(', ')}
                </div>
                {loc.schedule_summary && <div style={{ fontSize: 12, color: 'var(--oa-text-secondary)', marginTop: 4 }}>{loc.schedule_summary}</div>}
              </div>
              <button
                type="button"
                onClick={() => deleteLocation(loc.id)}
                disabled={acting === loc.id}
                style={{
                  width: 28, height: 28, borderRadius: 8, border: 'none',
                  background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, padding: 0, lineHeight: 0,
                  appearance: 'none', WebkitAppearance: 'none',
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {locations.length === 0 && (
            <p style={{ color: 'var(--oa-text-muted)', fontSize: 13, textAlign: 'center', padding: '30px 0' }}>
              No hay sedes registradas
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main console ───────────────────────────────────────────────────────────────

export default function GymConsole() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { userId, role: userRole } = useAuth()

  const [gym, setGym] = useState(null)
  const [myRole, setMyRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [activeTab, setActiveTab] = useState(0)

  useEffect(() => {
    let active = true
    Promise.all([
      api.get(`/gyms/${slug}`),
      api.get('/me/managed-gyms'),
    ])
      .then(([gymRes, managedRes]) => {
        if (!active) return
        const gymData = gymRes.data
        setGym(gymData)
        const managed = managedRes.data.find((g) => g.id === gymData.id)
        if (!managed && userRole !== 'admin') {
          setForbidden(true)
        } else {
          setMyRole(managed?.my_role || 'admin')
        }
      })
      .catch(() => { if (active) setForbidden(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [slug, userId, userRole])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0f12', display: 'grid', placeItems: 'center', color: 'var(--oa-text-muted)', fontSize: 14 }}>
        Cargando consola...
      </div>
    )
  }

  if (forbidden || !gym) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0f12', display: 'grid', placeItems: 'center', padding: 20 }}>
        <div style={{ textAlign: 'center' }}>
          <ShieldCheck size={40} color="var(--oa-border)" style={{ margin: '0 auto 16px' }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--oa-text-secondary)', marginBottom: 8 }}>
            Acceso restringido
          </p>
          <p style={{ fontSize: 13, color: 'var(--oa-text-muted)' }}>
            Necesitas ser staff de este gym para acceder a la consola.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/gyms/${slug}`)}
            style={{ marginTop: 16, padding: '8px 20px', borderRadius: 10, border: '1px solid var(--oa-border)', background: 'transparent', color: 'var(--oa-text-secondary)', fontSize: 13, cursor: 'pointer' }}
          >
            Ver ficha pública
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d0f12', paddingBottom: 120 }}>
      {/* Header */}
      <div
        style={{
          background: '#171a20',
          borderBottom: '1px solid var(--oa-border)',
          padding: '16px 20px',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <button
              type="button"
              onClick={() => navigate(`/gyms/${slug}`)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--oa-text-muted)', display: 'flex', padding: 0 }}
            >
              <ArrowLeft size={18} />
            </button>
            {gym.logo_url && (
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `url(${gym.logo_url}) center/cover no-repeat`, flexShrink: 0 }} />
            )}
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--oa-text)' }}>{gym.display_name}</div>
              <div style={{ fontSize: 11, color: 'var(--oa-text-muted)' }}>
                Consola · {STAFF_ROLE_LABELS[myRole] || myRole}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginTop: 12, overflowX: 'auto' }}>
            {TABS.map((tab, i) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(i)}
                style={{
                  padding: '7px 16px',
                  borderRadius: 10,
                  border: activeTab === i ? '1px solid rgba(214,217,224,0.28)' : '1px solid transparent',
                  background: activeTab === i
                    ? 'linear-gradient(135deg,rgba(214,217,224,0.14),rgba(94,234,212,0.10))'
                    : 'transparent',
                  color: activeTab === i ? 'var(--oa-text)' : 'var(--oa-text-secondary)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        {activeTab === 0 && (
          <ProfileTab gym={gym} gymId={gym.id} myRole={myRole} onUpdated={setGym} />
        )}
        {activeTab === 1 && <MembershipsTab gymId={gym.id} />}
        {activeTab === 2 && <StaffTab gymId={gym.id} myRole={myRole} />}
        {activeTab === 3 && <LocationsTab gymId={gym.id} />}
      </div>
    </div>
  )
}
