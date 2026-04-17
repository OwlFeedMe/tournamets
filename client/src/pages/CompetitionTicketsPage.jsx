import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Ticket } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/axios'
import { COMPETITION_PAGE_MAX_WIDTH } from '../utils/competitionLayout'

const pageBg = 'radial-gradient(circle at top, rgba(255,107,0,0.16), transparent 28%), radial-gradient(circle at 85% 20%, rgba(0,194,168,0.12), transparent 24%), #0D0F12'
const BOLD_BUTTON_LIBRARY_SRC = 'https://checkout.bold.co/library/boldPaymentButton.js'
const BOLD_BUTTON_LIBRARY_ID = 'bold-payment-button-library'

function formatCop(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function ensureBoldButtonLibrary({ reload = false } = {}) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(BOLD_BUTTON_LIBRARY_ID)
    if (reload && existing) existing.remove()
    if (!reload && document.getElementById(BOLD_BUTTON_LIBRARY_ID)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.id = BOLD_BUTTON_LIBRARY_ID
    script.src = BOLD_BUTTON_LIBRARY_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar la libreria de pago de Bold'))
    document.body.appendChild(script)
  })
}

function BoldPaymentButton({ config, onError }) {
  const containerRef = useRef(null)
  useEffect(() => {
    if (!config || !containerRef.current) return undefined
    let active = true
    const render = async () => {
      try {
        if (!active || !containerRef.current) return
        containerRef.current.innerHTML = ''
        const script = document.createElement('script')
        script.setAttribute('data-bold-button', 'dark-L')
        script.setAttribute('data-api-key', config.api_key)
        script.setAttribute('data-order-id', config.order_id)
        script.setAttribute('data-currency', config.currency)
        script.setAttribute('data-amount', config.amount)
        script.setAttribute('data-integrity-signature', config.integrity_signature)
        script.setAttribute('data-description', config.description)
        script.setAttribute('data-redirection-url', config.redirection_url)
        script.setAttribute('data-render-mode', 'embedded')
        if (config.customer_data) script.setAttribute('data-customer-data', JSON.stringify(config.customer_data))
        containerRef.current.appendChild(script)
        await new Promise((resolve) => window.requestAnimationFrame(resolve))
        await ensureBoldButtonLibrary({ reload: true })
      } catch (err) {
        onError?.(err)
      }
    }
    render()
    return () => {
      active = false
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [config, onError])
  return <div ref={containerRef} />
}

function pickUnitPrice(quantity, cfg) {
  const base = Number(cfg?.price_unit || 0)
  const tiers = Array.isArray(cfg?.bulk_pricing_tiers) ? cfg.bulk_pricing_tiers : []
  let selected = base
  tiers
    .filter(item => Number(item?.min_quantity || 0) > 0 && Number(item?.unit_price || 0) > 0)
    .sort((a, b) => Number(a.min_quantity) - Number(b.min_quantity))
    .forEach((tier) => {
      if (quantity >= Number(tier.min_quantity)) selected = Number(tier.unit_price)
    })
  return Math.max(0, Math.round(selected))
}

function parseTicketProducts(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item, index) => ({
      id: String(item?.id || `product_${index + 1}`).trim(),
      label: String(item?.label || '').trim(),
      price_unit: Number(item?.price_unit || 0),
      access_days: Array.isArray(item?.access_days) ? item.access_days.map(day => String(day || '').trim()).filter(Boolean) : [],
      is_all_days: Number(item?.is_all_days || 0) ? 1 : 0,
    }))
    .filter(item => item.id && item.label && item.price_unit > 0)
}

export default function CompetitionTicketsPage() {
  const { competitionId } = useParams()
  const [ticketing, setTicketing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [checkoutConfig, setCheckoutConfig] = useState(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [form, setForm] = useState({
    buyer_full_name: '',
    buyer_email: '',
    buyer_phone: '',
    buyer_document: '',
    product_id: '',
    quantity: 1,
  })

  useEffect(() => {
    let active = true
    setLoading(true)
    setMsg(null)
    api.get(`/competitions/${competitionId}/ticketing-public`)
      .then(({ data }) => {
        if (!active) return
        setTicketing(data || null)
      })
      .catch((err) => {
        if (!active) return
        setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo cargar la boleteria.' })
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => { active = false }
  }, [competitionId])

  useEffect(() => {
    const products = parseTicketProducts(ticketing?.ticket_products)
    if (!products.length) return
    setForm(prev => {
      const alreadySelected = products.some(product => product.id === prev.product_id)
      if (alreadySelected) return prev
      return { ...prev, product_id: products[0].id }
    })
  }, [ticketing])

  const quantity = Math.max(1, Number(form.quantity || 1))
  const ticketProducts = useMemo(() => parseTicketProducts(ticketing?.ticket_products), [ticketing?.ticket_products])
  const selectedProduct = useMemo(
    () => ticketProducts.find(product => product.id === form.product_id) || ticketProducts[0] || null,
    [ticketProducts, form.product_id],
  )
  const unitPrice = useMemo(() => {
    const cfg = {
      ...ticketing,
      price_unit: selectedProduct ? selectedProduct.price_unit : ticketing?.price_unit,
    }
    return pickUnitPrice(quantity, cfg)
  }, [quantity, ticketing, selectedProduct])
  const [pricingCfg, setPricingCfg] = useState(null)
  useEffect(() => {
    api.get('/config/pricing').then(({ data }) => setPricingCfg(data)).catch(() => {})
  }, [])
  const estimatedTotal = useMemo(() => {
    const platformRate = pricingCfg?.default_platform_fee_rate ?? 0.05
    const minFee = pricingCfg?.min_platform_fee ?? 5000
    const baseAmount = Math.round(unitPrice * quantity)
    let fee = Math.round(baseAmount * platformRate)
    if (baseAmount > 0 && fee < minFee) fee = minFee
    return { baseAmount, fee, total: baseAmount + fee }
  }, [quantity, unitPrice, pricingCfg])

  const startCheckout = async () => {
    setCheckoutLoading(true)
    setMsg(null)
    try {
      const payload = {
        ...form,
        product_id: selectedProduct?.id || null,
        quantity,
      }
      const { data } = await api.post(`/competitions/${competitionId}/spectator-checkout`, payload)
      setCheckoutConfig(data || null)
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo preparar el pago.' })
    } finally {
      setCheckoutLoading(false)
    }
  }

  if (loading) return <div style={{ minHeight: '100vh', background: pageBg, color: '#AAB2C0', padding: '28px 18px' }}>Cargando boleteria...</div>
  const hasProducts = Array.isArray(ticketing?.ticket_products) && ticketing.ticket_products.length > 0
  if (!hasProducts) return (
    <div style={{ minHeight: '100vh', background: pageBg, color: '#F5F7FA', padding: '28px 18px' }}>
      <div style={{ maxWidth: COMPETITION_PAGE_MAX_WIDTH, margin: '0 auto' }}>
        <Link to={`/competitions/${competitionId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#F5F7FA', border: '1px solid #252A33', padding: '10px 14px', borderRadius: 6 }}>
          <ArrowLeft size={16} /> Volver
        </Link>
        <div style={{ marginTop: 18, border: '1px solid #252A33', borderRadius: 16, background: '#171B21', padding: 18 }}>
          La boleteria para espectadores no esta disponible en este momento.
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: pageBg, color: '#F5F7FA' }}>
      <div style={{ maxWidth: COMPETITION_PAGE_MAX_WIDTH, margin: '0 auto', padding: '24px 18px 72px' }}>
        <Link to={`/competitions/${competitionId}`} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 6, border: '1px solid #252A33', color: '#F5F7FA', background: 'rgba(13,15,18,0.4)', marginBottom: 18 }}>
          <ArrowLeft size={16} /> Volver a la competencia
        </Link>
        <section className="fr-cut-card" style={{ border: '1px solid #252A33', background: '#171B21', padding: 22, display: 'grid', gap: 16 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#FF9A3D', fontWeight: 800 }}>
            <Ticket size={16} /> Boleteria espectadores
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, lineHeight: 1 }}>{ticketing?.competition_name || 'Evento'}</div>
          {ticketing?.product_description ? <div style={{ color: '#D7DEE8', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{ticketing.product_description}</div> : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <div className="fr-cut-card" style={{ border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 12 }}>
              <div style={{ fontSize: 11, color: '#AAB2C0' }}>Aforo disponible</div>
              <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>{ticketing.remaining_capacity ?? 0}</div>
            </div>
            <div className="fr-cut-card" style={{ border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 12 }}>
              <div style={{ fontSize: 11, color: '#AAB2C0' }}>Precio por boleta</div>
              <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>{formatCop(unitPrice)}</div>
              {selectedProduct ? (
                <div style={{ marginTop: 4, fontSize: 12, color: '#AAB2C0' }}>{selectedProduct.label}</div>
              ) : null}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {ticketProducts.length ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ color: '#F5F7FA', fontSize: 12, fontWeight: 700 }}>Tipo de entrada</label>
                <select
                  value={selectedProduct?.id || ''}
                  onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
                >
                  {ticketProducts.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.label} · {formatCop(product.price_unit)}
                    </option>
                  ))}
                </select>
                {selectedProduct ? (
                  <div style={{ color: '#AAB2C0', fontSize: 12 }}>
                    {selectedProduct.is_all_days
                      ? 'Acceso a todos los dias del evento.'
                      : `Acceso: ${selectedProduct.access_days.join(', ')}`}
                  </div>
                ) : null}
              </div>
            ) : null}
            <input placeholder="Nombre completo" value={form.buyer_full_name} onChange={(e) => setForm((f) => ({ ...f, buyer_full_name: e.target.value }))} />
            <input placeholder="Correo electronico" value={form.buyer_email} onChange={(e) => setForm((f) => ({ ...f, buyer_email: e.target.value }))} />
            <input placeholder="Telefono" value={form.buyer_phone} onChange={(e) => setForm((f) => ({ ...f, buyer_phone: e.target.value }))} />
            <input placeholder="Documento de identidad" value={form.buyer_document} onChange={(e) => setForm((f) => ({ ...f, buyer_document: e.target.value }))} />
            <input type="number" min="1" step="1" placeholder="Cantidad" value={quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
          </div>

          <div style={{ border: '1px solid #252A33', borderRadius: 12, background: 'rgba(13,15,18,0.62)', padding: 12, display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: '#AAB2C0', fontSize: 13 }}><span>Base</span><span>{formatCop(estimatedTotal.baseAmount)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: '#AAB2C0', fontSize: 13 }}><span>Comision plataforma (estimada)</span><span>{formatCop(estimatedTotal.fee)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: '#F5F7FA', fontSize: 15, fontWeight: 800 }}><span>Total a pagar</span><span>{formatCop(estimatedTotal.total)}</span></div>
          </div>

          {!checkoutConfig ? (
            <button type="button" className="btn-primary" onClick={startCheckout} disabled={checkoutLoading}>
              {checkoutLoading ? 'Preparando pago...' : 'Continuar a pago con Bold'}
            </button>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <BoldPaymentButton config={checkoutConfig} onError={(err) => setMsg({ type: 'error', text: err.message || 'No se pudo cargar el boton de pago.' })} />
              <div style={{ color: '#AAB2C0', fontSize: 12 }}>Completa el pago y espera la confirmacion. Te enviaremos las boletas al correo.</div>
            </div>
          )}
          {msg ? (
            <div style={{ border: `1px solid ${msg.type === 'error' ? 'rgba(239,68,68,0.32)' : 'rgba(34,197,94,0.32)'}`, borderRadius: 12, background: msg.type === 'error' ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.10)', padding: 12, fontSize: 14 }}>
              {msg.text}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
