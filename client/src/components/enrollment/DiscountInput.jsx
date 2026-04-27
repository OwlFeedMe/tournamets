import { useState } from 'react'
import { Tag, X, CheckCircle2, Loader } from 'lucide-react'
import api from '../../api/axios'

function formatCop(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

/**
 * Props:
 *   competitionId  – id de la competencia
 *   categoria      – nombre de la categoría seleccionada
 *   onApply(result) – callback con { code, discount_type, discount_value, discount_amount }
 *   onClear()       – callback al quitar el código
 *   applied         – objeto de descuento ya aplicado (o null)
 */
export default function DiscountInput({ competitionId, categoria, onApply, onClear, applied }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleApply = async () => {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return
    if (!categoria) {
      setError('Selecciona una categoria antes de aplicar el codigo.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post(`/competitions/${competitionId}/validate-discount`, {
        code: trimmed,
        categoria,
      })
      onApply(data)
      setCode('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Codigo invalido o no aplicable.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleApply()
    }
  }

  if (applied) {
    const label =
      applied.discount_type === 'percentage'
        ? `${applied.discount_value}% de descuento`
        : `${formatCop(applied.discount_value)} de descuento`

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 14,
        border: '1px solid rgba(94,234,212,0.40)',
        background: 'rgba(94,234,212,0.07)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle2 size={18} color="#5EEAD4" />
          <div>
            <div style={{ color: '#8DF1E4', fontSize: 13, fontWeight: 800 }}>
              {applied.code}
            </div>
            <div style={{ color: '#AAB2C0', fontSize: 12 }}>
              {label} — ahorras {formatCop(applied.discount_amount)}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#7E8796',
            display: 'flex',
            alignItems: 'center',
            padding: 4,
          }}
          title="Quitar codigo"
        >
          <X size={16} />
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
          borderRadius: 12,
          border: `1px solid ${error ? 'rgba(255,107,0,0.5)' : '#252A33'}`,
          background: 'rgba(13,15,18,0.6)',
        }}>
          <Tag size={15} color="#7E8796" />
          <input
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError('') }}
            onKeyDown={handleKeyDown}
            placeholder="Codigo de descuento"
            maxLength={50}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#F5F7FA',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 1,
              padding: '11px 0',
            }}
          />
        </div>
        <button
          type="button"
          onClick={handleApply}
          disabled={loading || !code.trim()}
          style={{
            padding: '0 18px',
            borderRadius: 12,
            border: '1px solid #252A33',
            background: loading || !code.trim() ? 'rgba(255,255,255,0.04)' : 'rgba(214,217,224,0.12)',
            color: loading || !code.trim() ? '#7E8796' : '#F5F7FA',
            fontWeight: 800,
            fontSize: 13,
            cursor: loading || !code.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
          Aplicar
        </button>
      </div>
      {error ? (
        <div style={{ color: '#FFB36F', fontSize: 12, paddingLeft: 4 }}>{error}</div>
      ) : null}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
