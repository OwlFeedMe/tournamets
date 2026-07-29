import { CheckCircle2, CreditCard, RefreshCw, Settings2, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import api from '../api/axios'
import { AdminToolsNav } from '../components/admin/AdminToolsNav'
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
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
}

function formatMoney(value) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value || 0))
}

function statusLabel(status) {
  return {
    none: 'Sin solicitud',
    pending: 'Pendiente',
    approved: 'Aprobado',
    paid: 'Pagado',
    rejected: 'Rechazado',
  }[status] || status || 'Sin estado'
}

function statusTone(status) {
  if (status === 'paid') return colors.success
  if (status === 'approved') return colors.accent
  if (status === 'pending') return colors.warning
  if (status === 'rejected') return colors.error
  return colors.muted
}

function percentageFromRate(value) {
  const percentage = Number(value || 0) * 100
  return Number.isFinite(percentage) ? String(Number(percentage.toFixed(4))) : '0'
}

export default function AdminFinancePanel() {
  const [overview, setOverview] = useState({ totals: {}, competitions: [] })
  const [withdrawals, setWithdrawals] = useState([])
  const [pricing, setPricing] = useState(null)
  const [pricingForm, setPricingForm] = useState({
    platformFeePercentage: '',
    minPlatformFee: '',
    processorPercentage: '',
    processorFixedFee: '',
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [savingPricing, setSavingPricing] = useState(false)

  const loadFinance = async () => {
    setLoading(true)
    setError('')
    try {
      const [overviewResult, withdrawalsResult, pricingResult] = await Promise.allSettled([
        api.get('/finance/overview'),
        api.get('/finance/withdrawals'),
        api.get('/config/pricing'),
      ])
      const failures = []

      if (overviewResult.status === 'fulfilled') {
        setOverview(overviewResult.value.data || { totals: {}, competitions: [] })
      } else {
        setOverview({ totals: {}, competitions: [] })
        failures.push(overviewResult.reason?.response?.data?.detail || 'No se pudo cargar el resumen financiero.')
      }

      if (withdrawalsResult.status === 'fulfilled') {
        const data = withdrawalsResult.value.data
        setWithdrawals(Array.isArray(data) ? data : [])
      } else {
        setWithdrawals([])
        failures.push(withdrawalsResult.reason?.response?.data?.detail || 'No se pudieron cargar los retiros.')
      }

      if (pricingResult.status === 'fulfilled') {
        const nextPricing = pricingResult.value.data || {}
        setPricing(nextPricing)
        setPricingForm({
          platformFeePercentage: percentageFromRate(nextPricing.default_platform_fee_rate),
          minPlatformFee: String(nextPricing.min_platform_fee ?? 0),
          processorPercentage: percentageFromRate(nextPricing.bold_processor_rate),
          processorFixedFee: String(nextPricing.bold_processor_fixed_fee ?? 0),
        })
      } else {
        failures.push(pricingResult.reason?.response?.data?.detail || 'No se pudo cargar la configuración de cobros.')
      }

      setError(failures[0] || '')
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cargar finanzas.')
      setOverview({ totals: {}, competitions: [] })
      setWithdrawals([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFinance()
  }, [])

  const pendingWithdrawals = useMemo(
    () => withdrawals.filter((item) => item.status === 'pending'),
    [withdrawals],
  )

  const approvedWithdrawals = useMemo(
    () => withdrawals.filter((item) => item.status === 'approved'),
    [withdrawals],
  )

  const completedWithdrawals = useMemo(
    () => withdrawals.filter((item) => ['paid', 'rejected'].includes(item.status)).slice(0, 5),
    [withdrawals],
  )

  const updateWithdrawal = async (item, status) => {
    const payoutReference = status === 'paid'
      ? window.prompt('Referencia de pago')
      : ''
    if (status === 'paid' && !String(payoutReference || '').trim()) return

    setSavingId(item.id)
    setError('')
    setSuccess('')
    try {
      await api.put(`/finance/withdrawals/${item.id}`, {
        status,
        payout_reference: payoutReference || item.payout_reference || '',
      })
      setSuccess(
        status === 'approved'
          ? 'Solicitud aprobada. Ahora está en retiros por pagar.'
          : status === 'paid'
            ? 'Retiro marcado como pagado.'
            : 'Solicitud rechazada.',
      )
      await loadFinance()
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo actualizar el retiro.')
    } finally {
      setSavingId(null)
    }
  }

  const updatePricingField = (field) => (event) => {
    setPricingForm((current) => ({ ...current, [field]: event.target.value }))
  }

  const savePricing = async (event) => {
    event.preventDefault()
    const platformFeePercentage = Number(pricingForm.platformFeePercentage)
    const minPlatformFee = Number(pricingForm.minPlatformFee)
    const processorPercentage = Number(pricingForm.processorPercentage)
    const processorFixedFee = Number(pricingForm.processorFixedFee)

    if (
      !Number.isFinite(platformFeePercentage)
      || platformFeePercentage < 0
      || platformFeePercentage > 100
      || !Number.isInteger(minPlatformFee)
      || minPlatformFee < 0
      || !Number.isFinite(processorPercentage)
      || processorPercentage < 0
      || processorPercentage > 100
      || !Number.isInteger(processorFixedFee)
      || processorFixedFee < 0
    ) {
      setError('Revisa los valores: los porcentajes deben estar entre 0 y 100 y los cargos deben ser enteros no negativos.')
      return
    }

    setSavingPricing(true)
    setError('')
    setSuccess('')
    try {
      const { data } = await api.put('/config/pricing', {
        default_platform_fee_rate: platformFeePercentage / 100,
        min_platform_fee: minPlatformFee,
        bold_processor_rate: processorPercentage / 100,
        bold_processor_fixed_fee: processorFixedFee,
      })
      const nextPricing = data?.config || {}
      setPricing(nextPricing)
      setPricingForm({
        platformFeePercentage: percentageFromRate(nextPricing.default_platform_fee_rate),
        minPlatformFee: String(nextPricing.min_platform_fee ?? 0),
        processorPercentage: percentageFromRate(nextPricing.bold_processor_rate),
        processorFixedFee: String(nextPricing.bold_processor_fixed_fee ?? 0),
      })
      setSuccess('Configuración de cobros actualizada.')
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo guardar la configuración de cobros.')
    } finally {
      setSavingPricing(false)
    }
  }

  const totals = overview.totals || {}
  const competitions = Array.isArray(overview.competitions) ? overview.competitions : []
  const exampleBase = 100000
  const exampleFee = Math.max(
    Math.round(exampleBase * (Number(pricingForm.platformFeePercentage || 0) / 100)),
    Number(pricingForm.minPlatformFee || 0),
  )

  return (
    <main style={{ minHeight: '100%', background: colors.bg, color: colors.text }}>
      <div style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: '22px 16px 120px', display: 'grid', gap: 16 }}>
        <AdminToolsNav />

        <section style={{ border: `1px solid ${colors.border}`, borderRadius: 8, background: 'linear-gradient(135deg, rgba(255,107,0,0.18), rgba(23,27,33,0.96) 48%, rgba(0,194,168,0.10))', padding: 18, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#FFB36F', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Admin</div>
              <h1 style={{ marginTop: 6, fontSize: 'clamp(32px, 5vw, 56px)', lineHeight: 0.95, fontFamily: 'Bebas Neue, Poppins, sans-serif', letterSpacing: 0 }}>Finanzas</h1>
              <p style={{ marginTop: 10, maxWidth: 680, color: colors.secondary, fontSize: 14, lineHeight: 1.55 }}>
                Revisa recaudo, comisiones, balance retenido y solicitudes de retiro.
              </p>
            </div>
            <button type="button" onClick={loadFinance} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.top, color: colors.text, fontWeight: 900 }}>
              <RefreshCw size={16} /> Refrescar
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Stat label="Recaudo" value={formatMoney(totals.total_collected)} tone={colors.primary} />
            <Stat label="Ingreso FinalRep" value={formatMoney(totals.platform_revenue_net)} tone={colors.accent} />
            <Stat label="Fees procesador" value={formatMoney(totals.processor_fees)} tone={colors.warning} />
            <Stat label="Saldo solicitado" value={formatMoney(totals.pending_withdrawals)} tone={colors.warning} />
          </div>
        </section>

        {error ? <div style={{ border: `1px solid ${colors.error}`, background: 'rgba(239,68,68,0.12)', color: '#FCA5A5', borderRadius: 8, padding: 10 }}>{error}</div> : null}
        {success ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${colors.success}`, background: 'rgba(34,197,94,0.10)', color: '#86EFAC', borderRadius: 8, padding: 10 }}><CheckCircle2 size={16} /> {success}</div> : null}
        {loading ? <div style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 18, color: colors.secondary }}>Cargando finanzas...</div> : null}

        {!loading ? (
          <>
            <section style={{ border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.surface, overflow: 'hidden' }}>
              <div style={{ padding: 14, borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 950 }}>
                <Settings2 size={17} color={colors.primary} />
                Configuración de cobros
              </div>
              <form onSubmit={savePricing} style={{ padding: 14, display: 'grid', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                  <PricingField
                    label="Comisión FinalRep"
                    suffix="%"
                    value={pricingForm.platformFeePercentage}
                    onChange={updatePricingField('platformFeePercentage')}
                    step="0.01"
                    max="100"
                  />
                  <PricingField
                    label="Comisión mínima"
                    prefix="$"
                    suffix="COP"
                    value={pricingForm.minPlatformFee}
                    onChange={updatePricingField('minPlatformFee')}
                    step="1"
                  />
                  <PricingField
                    label="Comisión Bold"
                    suffix="%"
                    value={pricingForm.processorPercentage}
                    onChange={updatePricingField('processorPercentage')}
                    step="0.0001"
                    max="100"
                  />
                  <PricingField
                    label="Cargo fijo Bold"
                    prefix="$"
                    suffix="COP"
                    value={pricingForm.processorFixedFee}
                    onChange={updatePricingField('processorFixedFee')}
                    step="1"
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ color: colors.secondary, fontSize: 13, lineHeight: 1.5 }}>
                    Ejemplo sobre {formatMoney(exampleBase)}: comisión FinalRep <strong style={{ color: colors.primary }}>{formatMoney(exampleFee)}</strong>. Los cambios aplican a inscripciones y boletería nuevas.
                  </div>
                  <button type="submit" disabled={savingPricing} style={{ minHeight: 42, border: 0, borderRadius: 8, padding: '9px 16px', background: colors.primary, color: colors.text, fontWeight: 950, cursor: savingPricing ? 'wait' : 'pointer', opacity: savingPricing ? 0.65 : 1 }}>
                    {savingPricing ? 'Guardando...' : 'Guardar configuración'}
                  </button>
                </div>
                {pricing ? <div style={{ color: colors.muted, fontSize: 11 }}>Valores activos cargados desde la configuración global de FinalRep.</div> : null}
              </form>
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 14, alignItems: 'start' }} className="fr-admin-finance-grid">
            <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.surface, overflow: 'hidden' }}>
              <div style={{ padding: 14, borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 950 }}>
                <CreditCard size={17} color={colors.accent} />
                Competencias
              </div>
              <div style={{ overflowX: 'auto' }} className="fr-finance-table-wrap">
                <table className="fr-finance-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                  <thead>
                    <tr style={{ background: colors.top, color: colors.muted, fontSize: 12, textAlign: 'left' }}>
                      <th style={{ padding: 12 }}>Competencia</th>
                      <th style={{ padding: 12 }}>Recaudo</th>
                      <th style={{ padding: 12 }}>Organizador</th>
                      <th style={{ padding: 12 }}>FinalRep neto</th>
                      <th style={{ padding: 12 }}>Retiro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {competitions.map((competition) => (
                      <tr key={competition.competition_id} style={{ borderTop: `1px solid ${colors.border}` }}>
                        <td data-label="Competencia" style={{ padding: 12 }}>
                          <div style={{ fontWeight: 900 }}>{competition.competition_name}</div>
                          <div style={{ color: colors.muted, fontSize: 12 }}>#{competition.competition_id}</div>
                        </td>
                        <td data-label="Recaudo" style={{ padding: 12, color: colors.primary, fontWeight: 900 }}>{formatMoney(competition.total_collected)}</td>
                        <td data-label="Organizador" style={{ padding: 12, color: colors.secondary }}>{formatMoney(competition.organizer_revenue)}</td>
                        <td data-label="FinalRep neto" style={{ padding: 12, color: colors.accent, fontWeight: 900 }}>{formatMoney(competition.platform_revenue_net)}</td>
                        <td data-label="Retiro" style={{ padding: 12 }}>
                          <Badge tone={statusTone(competition.disbursement_status)}>{statusLabel(competition.disbursement_status)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!competitions.length ? <div style={{ padding: 18, color: colors.secondary }}>Sin competencias para mostrar.</div> : null}
              </div>
            </div>

            <aside style={{ border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.surface, overflow: 'hidden' }}>
              <div style={{ padding: 14, borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 950 }}>
                <Wallet size={17} color={colors.primary} />
                Retiros
              </div>
              <div style={{ display: 'grid', gap: 10, padding: 12 }}>
                <div style={{ color: colors.muted, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Solicitudes pendientes</div>
                {pendingWithdrawals.map((item) => (
                  <div key={item.id} style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 12, display: 'grid', gap: 9 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{item.competition_name}</div>
                      <div style={{ color: colors.secondary, fontSize: 12 }}>{formatMoney(item.amount)} · {statusLabel(item.status)}</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button type="button" disabled={savingId === item.id} onClick={() => updateWithdrawal(item, 'approved')} style={{ borderRadius: 8, border: '1px solid rgba(0,194,168,0.32)', background: 'rgba(0,194,168,0.10)', color: colors.accent, fontWeight: 900 }}>
                        Aprobar
                      </button>
                      <button type="button" disabled={savingId === item.id} onClick={() => updateWithdrawal(item, 'rejected')} style={{ borderRadius: 8, border: '1px solid rgba(239,68,68,0.32)', background: 'rgba(239,68,68,0.10)', color: '#FCA5A5', fontWeight: 900 }}>
                        Rechazar
                      </button>
                    </div>
                  </div>
                ))}
                {!pendingWithdrawals.length ? <div style={{ color: colors.secondary, fontSize: 13 }}>No hay solicitudes pendientes.</div> : null}

                <div style={{ height: 1, background: colors.border, margin: '4px 0' }} />
                <div style={{ color: colors.muted, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Aprobados por pagar</div>
                {approvedWithdrawals.map((item) => (
                  <div key={item.id} style={{ border: '1px solid rgba(0,194,168,0.28)', background: 'rgba(0,194,168,0.07)', borderRadius: 8, padding: 12, display: 'grid', gap: 9 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{item.competition_name}</div>
                      <div style={{ color: colors.secondary, fontSize: 12 }}>{formatMoney(item.amount)} · Aprobado</div>
                    </div>
                    <button type="button" disabled={savingId === item.id} onClick={() => updateWithdrawal(item, 'paid')} style={{ minHeight: 38, borderRadius: 8, border: '1px solid rgba(34,197,94,0.32)', background: 'rgba(34,197,94,0.10)', color: colors.success, fontWeight: 900 }}>
                      Registrar pago
                    </button>
                  </div>
                ))}
                {!approvedWithdrawals.length ? <div style={{ color: colors.secondary, fontSize: 13 }}>No hay retiros aprobados por pagar.</div> : null}

                {completedWithdrawals.length ? (
                  <>
                    <div style={{ height: 1, background: colors.border, margin: '4px 0' }} />
                    <div style={{ color: colors.muted, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Historial reciente</div>
                    {completedWithdrawals.map((item) => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 2px' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: colors.text, fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.competition_name}</div>
                          <div style={{ color: colors.muted, fontSize: 11 }}>{formatMoney(item.amount)}</div>
                        </div>
                        <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                      </div>
                    ))}
                  </>
                ) : null}
              </div>
            </aside>
          </section>
          </>
        ) : null}
      </div>
      <style>{`
        @media (max-width: 980px) {
          .fr-admin-finance-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 760px) {
          .fr-finance-table-wrap {
            overflow-x: visible !important;
          }
          .fr-finance-table {
            min-width: 0 !important;
            border-collapse: separate !important;
            border-spacing: 0 10px !important;
          }
          .fr-finance-table thead {
            display: none !important;
          }
          .fr-finance-table tbody,
          .fr-finance-table tr,
          .fr-finance-table td {
            display: block !important;
            width: 100% !important;
          }
          .fr-finance-table tr {
            border: 1px solid ${colors.border};
            border-radius: 8px;
            background: ${colors.top};
            overflow: hidden;
          }
          .fr-finance-table td {
            display: grid !important;
            grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
            gap: 10px;
            align-items: center;
            padding: 10px 12px !important;
            border-bottom: 1px solid ${colors.border};
            overflow-wrap: anywhere;
          }
          .fr-finance-table td:last-child {
            border-bottom: 0;
          }
          .fr-finance-table td::before {
            content: attr(data-label);
            color: ${colors.muted};
            font-size: 10px;
            font-weight: 900;
            text-transform: uppercase;
          }
        }
      `}</style>
    </main>
  )
}

function PricingField({ label, prefix, suffix, value, onChange, step, max }) {
  return (
    <label style={{ display: 'grid', gap: 7, color: colors.secondary, fontSize: 12, fontWeight: 900 }}>
      {label}
      <span style={{ display: 'flex', alignItems: 'center', minHeight: 42, border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.top, overflow: 'hidden' }}>
        {prefix ? <span style={{ paddingLeft: 11, color: colors.muted }}>{prefix}</span> : null}
        <input
          type="number"
          min="0"
          max={max}
          step={step}
          required
          value={value}
          onChange={onChange}
          style={{ width: '100%', minWidth: 0, border: 0, outline: 0, background: 'transparent', color: colors.text, padding: '10px 8px', font: 'inherit', fontSize: 14 }}
        />
        {suffix ? <span style={{ paddingRight: 11, color: colors.muted, whiteSpace: 'nowrap' }}>{suffix}</span> : null}
      </span>
    </label>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 11, minWidth: 0 }}>
      <div style={{ color: colors.muted, fontSize: 11, fontWeight: 900 }}>{label}</div>
      <div style={{ color: tone, fontSize: 22, lineHeight: 1.1, fontWeight: 950, marginTop: 5, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

function Badge({ tone, children }) {
  return (
    <span style={{ display: 'inline-flex', padding: '5px 9px', borderRadius: 999, border: `1px solid ${tone}55`, background: `${tone}18`, color: tone, fontSize: 12, fontWeight: 900, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

