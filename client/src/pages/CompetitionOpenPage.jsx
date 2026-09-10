import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { isStageEnvironment, paymentsDisabled } from '../utils/environment'
import { openStatus, money } from '../components/competition/OpenAdminPanel'
import BoldPaymentButton from '../components/enrollment/BoldPaymentButton'
import '../components/competition/OpenQualifier.css'

export default function CompetitionOpenPage() {
  const { competitionId } = useParams()
  const { session } = useAuth()
  const [data, setData] = useState(null)
  const [entry, setEntry] = useState(null)
  const [category, setCategory] = useState('')
  const [video, setVideo] = useState('')
  const [answers, setAnswers] = useState({})
  const [registrationAnswers, setRegistrationAnswers] = useState({})
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [bold, setBold] = useState(null)
  const [pricing, setPricing] = useState(null)
  const reload = useCallback(async () => {
    const result = await api.get(`/competitions/${competitionId}`)
    const config = JSON.parse(result.data.open_config || '{}')
    const cats = await api.get(`/competitions/${competitionId}/categories`)
    const fees = await api.get('/config/pricing')
    setPricing(fees.data)
    setData({ ...result.data, config, categories: cats.data })
    if (session && config.enabled) {
      const mine = (await api.get(`/competitions/${competitionId}/open/me`)).data
      setEntry(mine)
      if (mine) { setVideo(mine.video_url || ''); setAnswers(mine.answers || {}); setCategory(mine.categoria) }
    }
  }, [competitionId, session])
  useEffect(() => { reload().catch(err => setMessage(err.response?.data?.detail || 'No se pudo cargar el Open')) }, [reload])
  const act = async fn => {
    setBusy(true); setMessage('')
    try { await fn() } catch (err) { setMessage(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Revisa los datos e intenta nuevamente') }
    finally { setBusy(false) }
  }
  const onBoldError = useCallback(() => setMessage('No se pudo cargar el pago. Intenta nuevamente.'), [])
  const onBoldClick = useCallback(reference => {
    api.post(`/competitions/${competitionId}/bold-intent/activate`, { reference }).catch(() => setMessage('Consulta el estado del pago antes de intentar otra vez.'))
  }, [competitionId])
  if (!data) return <main className="fr-open"><p>{message || 'Cargando Open…'}</p></main>
  const cfg = data.config
  if (!cfg.enabled) return <main className="fr-open"><h1>Esta competencia no tiene Open</h1><Link to={`/competitions/${competitionId}/register`}>Ir a inscripción</Link></main>
  const closed = Date.now() > Date.parse(cfg.deadline)
  const canSubmit = entry && ['paid', 'submitted'].includes(entry.status) && !closed
  const full = Number(data.categories.find(c => c.nombre === category)?.enrollment_price || 0)
  const finalAmount = entry?.final_amount ?? (cfg.final_payment === 'none' ? 0 : cfg.final_payment === 'difference' ? Math.max(0, full - cfg.price) : cfg.final_payment === 'discount' ? Math.round(full * (100 - cfg.discount_percent) / 100) : full)
  const base = entry ? entry.final_amount : cfg.price
  const fee = base > 0 ? Math.max(Number(pricing.min_platform_fee), Math.round(base * Number(pricing.default_platform_fee_rate))) : 0
  const questions = JSON.parse(data.enrollment_questions || '[]')
  const pay = event => {
    event.preventDefault()
    act(async () => {
      const result = (await api.post(`/competitions/${competitionId}/open/checkout`, {
        categoria: category, terms_accepted: accepted, final: !!entry, stage_test: isStageEnvironment,
        answers: questions.map(q => ({ question_id: q.id, answer: registrationAnswers[q.id] || '' })),
      })).data
      if (result.stage_test) { await reload(); setMessage('Pago de prueba aprobado en stage.'); setAccepted(false) }
      else setBold(result)
    })
  }
  return <main className="fr-open" style={{ maxWidth: 960, margin: '0 auto', minHeight: '70vh' }}>
    <Link to={`/competitions/${competitionId}`}>← {data.nombre}</Link>
    <header className="fr-open-card" style={{ background: 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)', color: '#090B0E' }}><h1>Open clasificatorio</h1><strong>Entrega hasta el {new Date(cfg.deadline).toLocaleString('es-CO', { timeZone: data.timezone || 'America/Bogota' })} ({data.timezone || 'America/Bogota'})</strong></header>
    {message && <div role="status" className="fr-open-message">{message}</div>}
    <section className="fr-open-card"><h2>Tu reto</h2><p style={{ whiteSpace: 'pre-wrap' }}>{cfg.instructions}</p>
      <p>Envía tu video o enlace y completa los resultados dentro del plazo. El pago no garantiza clasificar. Si no entregas, quedarás sin entrega y no avanzarás; no se genera un reembolso automático por no enviar el Open.</p>
    </section>
    {entry && <section className="fr-open-card"><h2 className="fr-open-status">{openStatus[entry.status]}</h2><p>{entry.categoria} · Open pagado: {money(entry.open_price)}</p>
      {entry.status === 'qualified' && <p>Fuiste seleccionado. Completa el pago para confirmar tu cupo.</p>}
      {entry.status === 'missing' && <p>El plazo terminó sin una entrega. No clasificaste a la competencia.</p>}
      {entry.status === 'confirmed' && <Link to="/my-events">Ver mi competencia</Link>}
      {entry.video_url && <a href={entry.video_url} target="_blank" rel="noopener noreferrer">Ver mi video</a>}
    </section>}
    {!session ? <Link className="fr-open-button" to="/login">Iniciar sesión para participar</Link> : ((!entry && !closed) || entry?.status === 'qualified') && <form className="fr-open-card" onSubmit={pay}>
      <h2>{entry ? 'Confirma tu cupo' : 'Inscríbete al Open'}</h2>
      {!entry && <label>Categoría<select required disabled={busy || !!bold} value={category} onChange={e => setCategory(e.target.value)}><option value="">Selecciona tu categoría</option>{data.categories.filter(c => c.registration_enabled && c.modality === 'individual').map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}</select></label>}
      <div className="fr-open-grid"><p>{entry ? 'Clasificación' : 'Open'}: <strong>{money(base)}</strong><br />Servicio: {money(fee)}<br /><strong>Total: {money(base + fee)}</strong></p>
        <p>Al clasificar: <strong>{category ? money(finalAmount) : 'Selecciona una categoría'}</strong>{finalAmount > 0 && ' + servicio'}<br />{({ full: 'Precio completo de la categoría.', difference: 'Se descuenta lo pagado por el Open (sin cargos de servicio).', discount: `${cfg.discount_percent}% de descuento sobre el precio completo.`, none: 'Sin pago adicional.' })[cfg.final_payment]}</p></div>
      {!entry && questions.map(q => <label key={q.id}>{q.label}{q.required ? ' *' : ''}{q.field_type === 'image' ? <input type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (!file) return; act(async () => { const form = new FormData(); form.append('file', file); const result = await api.post('/enrollment-answers/upload', form); setRegistrationAnswers(old => ({ ...old, [q.id]: result.data.url })) }) }} /> : <input required={!!q.required} value={registrationAnswers[q.id] || ''} onChange={e => setRegistrationAnswers(old => ({ ...old, [q.id]: e.target.value }))} />}</label>)}
      {data.enrollment_terms_text && <details><summary>Condiciones de la competencia</summary><p style={{ whiteSpace: 'pre-wrap' }}>{data.enrollment_terms_text}</p></details>}
      <label className="fr-open-check"><input type="checkbox" required checked={accepted} disabled={!!bold} onChange={e => setAccepted(e.target.checked)} />Acepto las condiciones de la competencia, el plazo del Open, la responsabilidad de entregar y el valor adicional al clasificar.</label>
      {!bold && <button disabled={busy || !accepted || (!category && !entry) || (paymentsDisabled && !isStageEnvironment)}>{busy ? 'Procesando…' : isStageEnvironment ? 'Pagar con prueba de stage' : `Continuar al pago · ${money(base + fee)}`}</button>}
      {bold && <BoldPaymentButton config={bold} onError={onBoldError} onPaymentClick={onBoldClick} />}
      {isStageEnvironment && <p>Pago simulado de stage. No se cobra dinero real.</p>}
    </form>}
    {!entry && closed && <p>El plazo del Open terminó. No se aceptan nuevos registros.</p>}
    {canSubmit && <form className="fr-open-card" onSubmit={e => { e.preventDefault(); act(async () => { await api.put(`/competitions/${competitionId}/open/submission`, { video_url: video, answers }); await reload(); setMessage('Entrega guardada. Puedes editarla mientras el plazo siga abierto y no haya sido revisada.') }) }}>
      <h2>{entry.status === 'submitted' ? 'Editar mi entrega' : 'Enviar mi Open'}</h2>
      <label>Enlace del video<input required value={video} onChange={e => setVideo(e.target.value)} placeholder="https://…" /></label>
      <label>O sube tu video (MP4, MOV o WebM, máximo 100 MB)<input type="file" accept="video/mp4,video/quicktime,video/webm" disabled={busy} onChange={e => {
        const file = e.target.files?.[0]; if (!file) return
        if (file.size > 100 * 1024 * 1024) { setMessage('Máximo 100 MB. Para videos más grandes, comparte un enlace.'); return }
        act(async () => { const form = new FormData(); form.append('file', file); const result = await api.post(`/competitions/${competitionId}/open/video`, form); setVideo(result.data.url); setMessage('Video cargado. Completa los resultados y guarda tu entrega.') })
      }} /></label>
      {cfg.fields.map(field => <label key={field.id}>{field.label}{field.required ? ' *' : ''}<input required={field.required} type={field.field_type === 'number' ? 'number' : 'text'} step="any" maxLength={2000} value={answers[field.id] ?? ''} onChange={e => setAnswers(old => ({ ...old, [field.id]: e.target.value }))} /></label>)}
      <button disabled={busy}>{busy ? 'Guardando…' : 'Guardar entrega'}</button>
    </form>}
    {session && <button className="secondary" disabled={busy} onClick={() => act(async () => { await api.post(`/competitions/${competitionId}/payment-status/sync`).catch(err => { if (err.response?.status !== 404) throw err }); await reload(); setMessage('Estado actualizado') })}>Consultar estado</button>}
  </main>
}
