import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Clock3, XCircle } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { COMPETITION_PAGE_MAX_WIDTH } from '../utils/competitionLayout'

const pageBg =
  'radial-gradient(circle at top, rgba(214,217,224,0.18), transparent 28%), radial-gradient(circle at 85% 20%, rgba(94,234,212,0.12), transparent 24%), #0D0F12'

function normalizeStatus(status) {
  const value = String(status || '').trim().toLowerCase()
  if (['approved', 'aprobado'].includes(value)) return 'approved'
  if (['pending', 'prepared', 'created', 'processing', 'pago_pendiente'].includes(value)) return 'pending'
  if (['rejected', 'failed', 'voided', 'void_rejected', 'rechazado'].includes(value)) return 'rejected'
  return 'unknown'
}

function statusCopy(status) {
  if (status === 'approved') {
    return {
      title: 'Pago aprobado',
      text: 'Tu pago fue confirmado y tu inscripcion quedo activa en esta competencia.',
      tone: '#5EEAD4',
      icon: CheckCircle2,
    }
  }
  if (status === 'rejected') {
    return {
      title: 'Pago no aprobado',
      text: 'Bold reporto que la transaccion no fue aprobada. Puedes volver al registro e intentarlo de nuevo.',
      tone: '#EF4444',
      icon: XCircle,
    }
  }
  return {
    title: 'Pago en proceso',
    text: 'Estamos consultando el estado de la transaccion con Bold. Si aun no aparece aprobada, puedes volver a consultar en unos segundos.',
    tone: '#F59E0B',
    icon: Clock3,
  }
}

function friendlySyncError(message) {
  const value = String(message || '').trim()
  if (!value) return ''
  if (value.includes('execute-api:Invoke')) {
    return 'No pudimos validar el pago con el backend en este momento. El cobro no se marcara como aprobado hasta confirmar la respuesta de Bold.'
  }
  return value
}

export default function CompetitionPaymentResultPage() {
  const { competitionId } = useParams()
  const navigate = useNavigate()
  const { session, isAthlete } = useAuth()
  const [searchParams] = useSearchParams()
  const [competition, setCompetition] = useState(null)
  const [syncState, setSyncState] = useState({ loading: true, status: 'pending', enrollmentState: null, reference: '', tx: '', error: '' })

  const boldOrderId = searchParams.get('bold-order-id') || ''
  const boldTxStatus = searchParams.get('bold-tx-status') || ''

  useEffect(() => {
    let active = true
    api.get(`/competitions/${competitionId}/public`)
      .then((res) => {
        if (active) setCompetition(res.data?.competition || null)
      })
      .catch(() => {
        if (active) setCompetition(null)
      })
    return () => { active = false }
  }, [competitionId])

  useEffect(() => {
    let active = true
    const fallbackStatus = normalizeStatus(boldTxStatus)
    if (!session || !isAthlete) {
      setSyncState((prev) => ({
        ...prev,
        loading: false,
        status: fallbackStatus,
        error: 'Inicia sesion para consultar el estado final del pago.',
      }))
      return () => { active = false }
    }

    const run = async () => {
      try {
        const { data } = await api.post(`/competitions/${competitionId}/payment-status/sync`)
        if (!active) return
        const finalStatus = normalizeStatus(data?.payment_status || boldTxStatus)
        setSyncState({
          loading: false,
          status: finalStatus,
          enrollmentState: data?.estado || null,
          reference: data?.payment_reference || boldOrderId,
          tx: data?.payment_transaction_id || '',
          error: '',
        })
      } catch (err) {
        if (!active) return
        setSyncState({
          loading: false,
          status: 'pending',
          enrollmentState: null,
          reference: boldOrderId,
          tx: '',
          error: friendlySyncError(err.response?.data?.detail || err.response?.data?.Message || err.message || ''),
        })
      }
    }
    run()
    return () => { active = false }
  }, [boldOrderId, boldTxStatus, competitionId, isAthlete, session])

  const effectiveStatus = useMemo(() => normalizeStatus(syncState.status), [syncState.status])
  const copy = statusCopy(effectiveStatus)
  const StatusIcon = copy.icon

  return (
    <div style={{ minHeight: '100vh', background: pageBg, color: '#F5F7FA' }}>
      <div style={{ maxWidth: COMPETITION_PAGE_MAX_WIDTH, margin: '0 auto', padding: '24px 18px 72px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
          <Link to={`/competitions/${competitionId}`} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 6, border: '1px solid #252A33', color: '#F5F7FA', background: 'rgba(13,15,18,0.4)' }}>
            <ArrowLeft size={16} />
            Volver a la competencia
          </Link>
        </div>

        <section className="fr-cut-card" style={{ border: '1px solid #252A33', background: '#171B21', padding: 24, display: 'grid', gap: 16 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: copy.tone }}>
            <StatusIcon size={22} />
            <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{copy.title}</span>
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.02, fontWeight: 900 }}>{competition?.nombre || 'Estado del pago'}</div>
          <div style={{ color: '#D7DEE8', fontSize: 15, lineHeight: 1.7 }}>
            {syncState.loading ? 'Consultando el estado de la transaccion con Bold...' : copy.text}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div className="fr-cut-card" style={{ border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14 }}>
              <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 6 }}>Referencia</div>
              <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 700, wordBreak: 'break-word' }}>{syncState.reference || boldOrderId || 'Sin referencia'}</div>
            </div>
            <div className="fr-cut-card" style={{ border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14 }}>
              <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 6 }}>Estado reportado</div>
              <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 700 }}>{effectiveStatus}</div>
            </div>
            {syncState.tx ? (
              <div className="fr-cut-card" style={{ border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14 }}>
                <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 6 }}>Transaccion Bold</div>
                <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 700 }}>{syncState.tx}</div>
              </div>
            ) : null}
          </div>

          {syncState.error ? (
            <div className="fr-cut-card" style={{ border: '1px solid rgba(245,158,11,0.28)', background: 'rgba(245,158,11,0.08)', padding: 14, color: '#F5F7FA', fontSize: 14 }}>
              {syncState.error}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" onClick={() => navigate(`/competitions/${competitionId}/register`)}>
              Volver al registro
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate(`/competitions/${competitionId}`)}>
              Ver competencia
            </button>
            <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>
              Consultar otra vez
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
