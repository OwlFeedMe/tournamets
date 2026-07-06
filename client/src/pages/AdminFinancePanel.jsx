import { CreditCard, RefreshCw, Wallet } from 'lucide-react'
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

export default function AdminFinancePanel() {
  const [overview, setOverview] = useState({ totals: {}, competitions: [] })
  const [withdrawals, setWithdrawals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)

  const loadFinance = async () => {
    setLoading(true)
    setError('')
    try {
      const [overviewRes, withdrawalsRes] = await Promise.all([
        api.get('/finance/overview'),
        api.get('/finance/withdrawals'),
      ])
      setOverview(overviewRes.data || { totals: {}, competitions: [] })
      setWithdrawals(Array.isArray(withdrawalsRes.data) ? withdrawalsRes.data : [])
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
    () => withdrawals.filter((item) => ['pending', 'approved'].includes(item.status)),
    [withdrawals],
  )

  const updateWithdrawal = async (item, status) => {
    const payoutReference = status === 'paid'
      ? window.prompt('Referencia de pago')
      : ''
    if (status === 'paid' && !String(payoutReference || '').trim()) return

    setSavingId(item.id)
    setError('')
    try {
      await api.put(`/finance/withdrawals/${item.id}`, {
        status,
        payout_reference: payoutReference || item.payout_reference || '',
      })
      await loadFinance()
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo actualizar el retiro.')
    } finally {
      setSavingId(null)
    }
  }

  const totals = overview.totals || {}
  const competitions = Array.isArray(overview.competitions) ? overview.competitions : []

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
            <Stat label="Retiros pendientes" value={formatMoney(totals.pending_withdrawals)} tone={colors.warning} />
          </div>
        </section>

        {error ? <div style={{ border: `1px solid ${colors.error}`, background: 'rgba(239,68,68,0.12)', color: '#FCA5A5', borderRadius: 8, padding: 10 }}>{error}</div> : null}
        {loading ? <div style={{ border: `1px solid ${colors.border}`, background: colors.surface, borderRadius: 8, padding: 18, color: colors.secondary }}>Cargando finanzas...</div> : null}

        {!loading ? (
          <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 14, alignItems: 'start' }} className="fr-admin-finance-grid">
            <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.surface, overflow: 'hidden' }}>
              <div style={{ padding: 14, borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 950 }}>
                <CreditCard size={17} color={colors.accent} />
                Competencias
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
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
                        <td style={{ padding: 12 }}>
                          <div style={{ fontWeight: 900 }}>{competition.competition_name}</div>
                          <div style={{ color: colors.muted, fontSize: 12 }}>#{competition.competition_id}</div>
                        </td>
                        <td style={{ padding: 12, color: colors.primary, fontWeight: 900 }}>{formatMoney(competition.total_collected)}</td>
                        <td style={{ padding: 12, color: colors.secondary }}>{formatMoney(competition.organizer_revenue)}</td>
                        <td style={{ padding: 12, color: colors.accent, fontWeight: 900 }}>{formatMoney(competition.platform_revenue_net)}</td>
                        <td style={{ padding: 12 }}>
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
                      <button type="button" disabled={savingId === item.id} onClick={() => updateWithdrawal(item, 'paid')} style={{ borderRadius: 8, border: '1px solid rgba(34,197,94,0.32)', background: 'rgba(34,197,94,0.10)', color: colors.success, fontWeight: 900 }}>
                        Pagado
                      </button>
                    </div>
                  </div>
                ))}
                {!pendingWithdrawals.length ? <div style={{ color: colors.secondary, fontSize: 13 }}>No hay retiros pendientes.</div> : null}
              </div>
            </aside>
          </section>
        ) : null}
      </div>
      <style>{`
        @media (max-width: 980px) {
          .fr-admin-finance-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
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

