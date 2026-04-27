import { useEffect, useState } from 'react'
import { Plus, Trash2, ToggleLeft, ToggleRight, Eye, X, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../api/axios'

const MAX_DISCOUNT_PERCENTAGE = 80

function formatCop(value) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value || 0))
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function StatusBadge({ active }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800,
      background: active ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.05)',
      color: active ? '#8DF1E4' : '#7E8796',
      border: `1px solid ${active ? 'rgba(94,234,212,0.3)' : '#252A33'}`,
    }}>
      {active ? 'Activo' : 'Inactivo'}
    </span>
  )
}

function UsageBar({ uses_count, max_uses }) {
  if (!max_uses) return <span style={{ color: '#7E8796', fontSize: 12 }}>{uses_count} usos / ilimitado</span>
  const pct = Math.min(100, Math.round((uses_count / max_uses) * 100))
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#AAB2C0' }}>
        <span>{uses_count} / {max_uses} usos</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: 4, borderRadius: 4, background: '#252A33', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: pct >= 100 ? '#FFB36F' : '#5EEAD4', transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

function DiscountFormModal({ competition, categories, onSave, onClose }) {
  const [form, setForm] = useState({
    code: '',
    description: '',
    discount_type: 'percentage',
    discount_value: '',
    max_uses: '',
    max_uses_per_user: 1,
    applies_to_category_id: '',
    valid_from: '',
    valid_until: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const value = parseInt(form.discount_value, 10)
    if (!form.code.trim()) { setError('El codigo es obligatorio'); return }
    if (!value || value <= 0) { setError('El valor del descuento debe ser mayor a 0'); return }
    if (form.discount_type === 'percentage' && value > MAX_DISCOUNT_PERCENTAGE) {
      setError(`El descuento maximo permitido es ${MAX_DISCOUNT_PERCENTAGE}%`); return
    }
    setSaving(true)
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || null,
        discount_type: form.discount_type,
        discount_value: value,
        max_uses: form.max_uses ? parseInt(form.max_uses, 10) : null,
        max_uses_per_user: parseInt(form.max_uses_per_user, 10) || 1,
        applies_to_category_id: form.applies_to_category_id ? parseInt(form.applies_to_category_id, 10) : null,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
      }
      const { data } = await api.post(`/competitions/${competition.id}/discounts`, payload)
      onSave(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al crear el codigo')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', background: 'rgba(13,15,18,0.7)', border: '1px solid #252A33',
    borderRadius: 10, padding: '9px 12px', color: '#F5F7FA', fontSize: 14, outline: 'none',
    boxSizing: 'border-box',
  }
  const labelStyle = { color: '#AAB2C0', fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 520, background: '#171B21', border: '1px solid #252A33', borderRadius: 20, overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #252A33' }}>
          <div style={{ color: '#F5F7FA', fontSize: 18, fontWeight: 800 }}>Nuevo codigo de descuento</div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7E8796', display: 'flex' }}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Codigo *</label>
              <input style={inputStyle} value={form.code} onChange={e => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_\-]/g, ''))} placeholder="PROMO20" maxLength={50} required />
              <div style={{ color: '#7E8796', fontSize: 11, marginTop: 4 }}>Solo letras, numeros, - y _</div>
            </div>
            <div>
              <label style={labelStyle}>Tipo *</label>
              <select style={inputStyle} value={form.discount_type} onChange={e => set('discount_type', e.target.value)}>
                <option value="percentage">Porcentaje (%)</option>
                <option value="fixed">Monto fijo (COP)</option>
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>
              Valor del descuento *
              {form.discount_type === 'percentage'
                ? ` (maximo ${MAX_DISCOUNT_PERCENTAGE}%)`
                : ' (centavos COP)'}
            </label>
            <input
              style={inputStyle}
              type="number"
              min={1}
              max={form.discount_type === 'percentage' ? MAX_DISCOUNT_PERCENTAGE : undefined}
              value={form.discount_value}
              onChange={e => set('discount_value', e.target.value)}
              placeholder={form.discount_type === 'percentage' ? 'Ej: 20' : 'Ej: 30000'}
              required
            />
          </div>

          <div>
            <label style={labelStyle}>Descripcion (nota interna)</label>
            <input style={inputStyle} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Para atletas early-bird" maxLength={200} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Limite de usos total</label>
              <input style={inputStyle} type="number" min={1} value={form.max_uses} onChange={e => set('max_uses', e.target.value)} placeholder="Sin limite" />
            </div>
            <div>
              <label style={labelStyle}>Usos por participante</label>
              <input style={inputStyle} type="number" min={1} value={form.max_uses_per_user} onChange={e => set('max_uses_per_user', e.target.value)} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Aplica solo a categoria (opcional)</label>
            <select style={inputStyle} value={form.applies_to_category_id} onChange={e => set('applies_to_category_id', e.target.value)}>
              <option value="">Todas las categorias</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.nombre} — {formatCop(cat.enrollment_price)}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Vigente desde</label>
              <input style={inputStyle} type="datetime-local" value={form.valid_from} onChange={e => set('valid_from', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Vigente hasta</label>
              <input style={inputStyle} type="datetime-local" value={form.valid_until} onChange={e => set('valid_until', e.target.value)} />
            </div>
          </div>

          {error ? <div style={{ color: '#FFB36F', fontSize: 13, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,107,0,0.08)', border: '1px solid rgba(255,107,0,0.3)' }}>{error}</div> : null}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #252A33', background: 'transparent', color: '#AAB2C0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: saving ? 'rgba(214,217,224,0.08)' : 'linear-gradient(135deg,#D6D9E0,#F1F4F8)', color: '#0D0F12', fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Creando...' : 'Crear codigo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function UsageLogModal({ discount, competitionId, onClose }) {
  const [usages, setUsages] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/competitions/${competitionId}/discounts/${discount.id}/usages`)
      .then(({ data }) => setUsages(data))
      .catch(() => setUsages([]))
      .finally(() => setLoading(false))
  }, [competitionId, discount.id])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 680, background: '#171B21', border: '1px solid #252A33', borderRadius: 20, overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #252A33' }}>
          <div>
            <div style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 800 }}>Log de usos — {discount.code}</div>
            <div style={{ color: '#7E8796', fontSize: 12, marginTop: 2 }}>{discount.uses_count} uso{discount.uses_count !== 1 ? 's' : ''} registrado{discount.uses_count !== 1 ? 's' : ''}</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7E8796', display: 'flex' }}><X size={20} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading ? (
            <div style={{ color: '#7E8796', fontSize: 14 }}>Cargando...</div>
          ) : !usages.length ? (
            <div style={{ color: '#7E8796', fontSize: 14 }}>Nadie ha usado este codigo todavia.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {usages.map(u => (
                <div key={u.id} style={{ borderRadius: 12, border: '1px solid #252A33', background: 'rgba(255,255,255,0.02)', padding: '12px 14px', display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ color: '#F5F7FA', fontSize: 14, fontWeight: 700 }}>{u.user_name}</div>
                      <div style={{ color: '#7E8796', fontSize: 12 }}>{u.user_email}</div>
                    </div>
                    <span style={{
                      padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800,
                      background: u.enrollment_status === 'confirmed' ? 'rgba(94,234,212,0.12)' : u.enrollment_status === 'cancelled' ? 'rgba(255,107,0,0.1)' : 'rgba(255,255,255,0.05)',
                      color: u.enrollment_status === 'confirmed' ? '#8DF1E4' : u.enrollment_status === 'cancelled' ? '#FFB36F' : '#AAB2C0',
                      border: `1px solid ${u.enrollment_status === 'confirmed' ? 'rgba(94,234,212,0.3)' : u.enrollment_status === 'cancelled' ? 'rgba(255,107,0,0.3)' : '#252A33'}`,
                    }}>
                      {u.enrollment_status === 'confirmed' ? 'Confirmado' : u.enrollment_status === 'cancelled' ? 'Cancelado' : 'Pendiente'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#AAB2C0' }}>
                    <span>Precio original: {formatCop(u.base_price_before)}</span>
                    <span style={{ color: '#8DF1E4' }}>Descuento: -{formatCop(u.discount_amount_applied)}</span>
                    <span>Final: {formatCop(u.final_base_price)}</span>
                    <span>{formatDate(u.applied_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CompetitionDiscountsPage({ competition }) {
  const [discounts, setDiscounts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [viewingUsages, setViewingUsages] = useState(null)
  const [togglingId, setTogglingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const competitionId = competition?.id

  useEffect(() => {
    if (!competitionId) return
    Promise.all([
      api.get(`/competitions/${competitionId}/discounts`),
      api.get(`/competitions/${competitionId}/categories`).catch(() => ({ data: [] })),
    ])
      .then(([discountsRes, categoriesRes]) => {
        setDiscounts(discountsRes.data || [])
        setCategories(Array.isArray(categoriesRes.data) ? categoriesRes.data : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [competitionId])

  const handleToggle = async (discount) => {
    setTogglingId(discount.id)
    try {
      const { data } = await api.patch(`/competitions/${competitionId}/discounts/${discount.id}`, {
        is_active: discount.is_active ? 0 : 1,
      })
      setDiscounts(prev => prev.map(d => d.id === discount.id ? data : d))
    } catch {
      // silencioso
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async (discount) => {
    if (!window.confirm(`Eliminar el codigo "${discount.code}"? Esta accion no se puede deshacer.`)) return
    setDeletingId(discount.id)
    try {
      await api.delete(`/competitions/${competitionId}/discounts/${discount.id}`)
      setDiscounts(prev => prev.filter(d => d.id !== discount.id))
    } catch (err) {
      alert(err.response?.data?.detail || 'No se pudo eliminar el codigo')
    } finally {
      setDeletingId(null)
    }
  }

  const card = { borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.55)', padding: '14px 16px', display: 'grid', gap: 10 }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#F5F7FA', fontSize: 22, fontWeight: 800 }}>Codigos de descuento</div>
          <div style={{ color: '#7E8796', fontSize: 13, marginTop: 3 }}>Crea codigos para que los participantes los apliquen en la inscripcion. Maximo {MAX_DISCOUNT_PERCENTAGE}% de descuento.</div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#D6D9E0,#F1F4F8)', color: '#0D0F12', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
        >
          <Plus size={16} />
          Nuevo codigo
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#7E8796', fontSize: 14 }}>Cargando codigos...</div>
      ) : !discounts.length ? (
        <div style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.55)', padding: 24, textAlign: 'center', color: '#7E8796', fontSize: 14 }}>
          Todavia no hay codigos de descuento para esta competencia.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {discounts.map(discount => {
            const valueLabel = discount.discount_type === 'percentage'
              ? `${discount.discount_value}% de descuento`
              : `${formatCop(discount.discount_value)} de descuento`

            return (
              <div key={discount.id} style={card}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 800, letterSpacing: 0.5 }}>{discount.code}</span>
                      <StatusBadge active={discount.is_active} />
                      {discount.applies_to_category_name ? (
                        <span style={{ fontSize: 11, color: '#AAB2C0', padding: '3px 8px', borderRadius: 999, border: '1px solid #252A33', background: 'rgba(255,255,255,0.03)' }}>
                          Solo: {discount.applies_to_category_name}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ color: '#8DF1E4', fontSize: 14, fontWeight: 700 }}>{valueLabel}</div>
                    {discount.description ? <div style={{ color: '#7E8796', fontSize: 12 }}>{discount.description}</div> : null}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      type="button"
                      title="Ver log de usos"
                      onClick={() => setViewingUsages(discount)}
                      style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid #252A33', background: 'transparent', color: '#AAB2C0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                    >
                      <Eye size={14} />
                      Log
                    </button>
                    <button
                      type="button"
                      title={discount.is_active ? 'Desactivar' : 'Activar'}
                      disabled={togglingId === discount.id}
                      onClick={() => handleToggle(discount)}
                      style={{ padding: '7px 10px', borderRadius: 10, border: '1px solid #252A33', background: 'transparent', color: discount.is_active ? '#5EEAD4' : '#7E8796', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      {discount.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>
                    {discount.uses_count === 0 ? (
                      <button
                        type="button"
                        title="Eliminar"
                        disabled={deletingId === discount.id}
                        onClick={() => handleDelete(discount)}
                        style={{ padding: '7px 10px', borderRadius: 10, border: '1px solid rgba(255,107,0,0.3)', background: 'transparent', color: '#FFB36F', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                </div>

                <UsageBar uses_count={discount.uses_count} max_uses={discount.max_uses} />

                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#7E8796' }}>
                  <span>Por usuario: max {discount.max_uses_per_user} uso{discount.max_uses_per_user !== 1 ? 's' : ''}</span>
                  {discount.valid_from ? <span>Desde: {formatDate(discount.valid_from)}</span> : null}
                  {discount.valid_until ? <span>Hasta: {formatDate(discount.valid_until)}</span> : null}
                  {!discount.valid_from && !discount.valid_until ? <span>Sin restriccion de fechas</span> : null}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showCreate ? (
        <DiscountFormModal
          competition={competition}
          categories={categories}
          onSave={(newDiscount) => { setDiscounts(prev => [newDiscount, ...prev]); setShowCreate(false) }}
          onClose={() => setShowCreate(false)}
        />
      ) : null}

      {viewingUsages ? (
        <UsageLogModal
          discount={viewingUsages}
          competitionId={competitionId}
          onClose={() => setViewingUsages(null)}
        />
      ) : null}
    </div>
  )
}
