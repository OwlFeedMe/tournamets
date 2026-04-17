import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Clock3, XCircle } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import { COMPETITION_PAGE_MAX_WIDTH } from '../utils/competitionLayout'

const pageBg = 'radial-gradient(circle at top, rgba(255,107,0,0.18), transparent 28%), radial-gradient(circle at 85% 20%, rgba(0,194,168,0.12), transparent 24%), #0D0F12'

function normalizeStatus(status) {
  const value = String(status || '').trim().toLowerCase()
  if (['approved', 'aprobado'].includes(value)) return 'approved'
  if (['pending', 'created', 'processing'].includes(value)) return 'pending'
  if (['rejected', 'failed', 'voided', 'void_rejected', 'rechazado', 'approved_no_capacity'].includes(value)) return 'rejected'
  return 'unknown'
}

function statusCopy(status) {
  if (status === 'approved') {
    return {
      title: 'Pago aprobado',
      text: 'Tu compra fue confirmada. Enviamos las boletas en PDF al correo registrado.',
      tone: '#5EEAD4',
      icon: CheckCircle2,
    }
  }
  if (status === 'rejected') {
    return {
      title: 'Pago no aprobado',
      text: 'Bold reporto que la transaccion no fue aprobada o no fue posible emitir las boletas automaticamente.',
      tone: '#EF4444',
      icon: XCircle,
    }
  }
  return {
    title: 'Pago en proceso',
    text: 'Estamos consultando el estado de la transaccion con Bold.',
    tone: '#F59E0B',
    icon: Clock3,
  }
}

export default function CompetitionTicketsPaymentResultPage() {
  const { competitionId } = useParams()
  const [searchParams] = useSearchParams()
  const [syncState, setSyncState] = useState({ loading: true, status: 'pending', reference: '', tx: '', error: '', emailSent: false })

  const boldOrderId = searchParams.get('bold-order-id') || ''
  const boldTxStatus = searchParams.get('bold-tx-status') || ''

  useEffect(() => {
    let active = true
    const fallbackStatus = normalizeStatus(boldTxStatus)
    if (!boldOrderId) {
      setSyncState({ loading: false, status: fallbackStatus, reference: '', tx: '', error: 'No se encontro la referencia de pago.', emailSent: false })
      return () => { active = false }
    }
    const run = async () => {
      try {
        const { data } = await api.post(`/competitions/${competitionId}/spectator-payment-status/sync`, { reference: boldOrderId })
        if (!active) return
        setSyncState({
          loading: false,
          status: normalizeStatus(data?.payment_status || fallbackStatus),
          reference: data?.payment_reference || boldOrderId,
          tx: data?.payment_transaction_id || '',
          error: '',
          emailSent: !!data?.tickets_email_sent,
        })
      } catch (err) {
        if (!active) return
        setSyncState({
          loading: false,
          status: fallbackStatus,
          reference: boldOrderId,
          tx: '',
          error: err.response?.data?.detail || 'No se pudo sincronizar el estado del pago.',
          emailSent: false,
        })
      }
    }
    run()
    return () => { active = false }
  }, [boldOrderId, boldTxStatus, competitionId])

  const effectiveStatus = useMemo(() => normalizeStatus(syncState.status), [syncState.status])
  const copy = statusCopy(effectiveStatus)
  const StatusIcon = copy.icon

  return (
    <div style={{ minHeight: '100vh', background: pageBg, color: '#F5F7FA' }}>
      <div style={{ maxWidth: COMPETITION_PAGE_MAX_WIDTH, margin: '0 auto', padding: '24px 18px 72px' }}>
        <Link to={`/competitions/${competitionId}`} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 6, border: '1px solid #252A33', color: '#F5F7FA', background: 'rgba(13,15,18,0.4)', marginBottom: 18 }}>
          <ArrowLeft size={16} /> Volver a la competencia
        </Link>

        <section className="fr-cut-card" style={{ border: '1px solid #252A33', background: '#171B21', padding: 24, display: 'grid', gap: 16 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: copy.tone }}>
            <StatusIcon size={22} />
            <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{copy.title}</span>
          </div>
          <div style={{ color: '#D7DEE8', fontSize: 15, lineHeight: 1.7 }}>
            {syncState.loading ? 'Consultando el estado de la transaccion con Bold...' : copy.text}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div className="fr-cut-card" style={{ border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14 }}>
              <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 6 }}>Referencia</div>
              <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 700, wordBreak: 'break-word' }}>{syncState.reference || 'Sin referencia'}</div>
            </div>
            <div className="fr-cut-card" style={{ border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14 }}>
              <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 6 }}>Estado</div>
              <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 700 }}>{effectiveStatus}</div>
            </div>
            {syncState.tx ? (
              <div className="fr-cut-card" style={{ border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14 }}>
                <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 6 }}>Transaccion Bold</div>
                <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 700 }}>{syncState.tx}</div>
              </div>
            ) : null}
          </div>
          {effectiveStatus === 'approved' ? (
            <div style={{ borderRadius: 12, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.10)', padding: 12, fontSize: 14 }}>
              {syncState.emailSent ? 'Las boletas ya fueron enviadas a tu correo.' : 'Tu pago esta aprobado. El correo con boletas se esta procesando.'}
            </div>
          ) : null}
          {syncState.error ? (
            <div style={{ borderRadius: 12, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)', padding: 12, fontSize: 14 }}>
              {syncState.error}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>
              Consultar otra vez
            </button>
            <Link to={`/competitions/${competitionId}/tickets`} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center' }}>
              Comprar mas boletas
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
