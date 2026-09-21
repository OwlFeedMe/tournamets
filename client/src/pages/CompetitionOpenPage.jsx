import { openRegistrationState, openSubmissionState, openProfileStates } from '../utils/openQualifier'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { isStageEnvironment, paymentsDisabled } from '../utils/environment'
import { money } from '../components/competition/OpenAdminPanel'
import BoldPaymentButton from '../components/enrollment/BoldPaymentButton'
import OpenConsent from '../components/competition/OpenConsent'
import { ArrowRight, Check, CalendarDays, ClipboardCheck, CreditCard, Upload } from 'lucide-react'
import '../components/competition/OpenQualifier.css'

export default function CompetitionOpenPage() {
  const { competitionId } = useParams()
  const { session } = useAuth()
  const [data, setData] = useState(null)
  const [entry, setEntry] = useState(null)
  const [category, setCategory] = useState('')
  const [division, setDivision] = useState('')
  const [video, setVideo] = useState('')
  const [answers, setAnswers] = useState({})
  const [registrationAnswers, setRegistrationAnswers] = useState({})
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [bold, setBold] = useState(null)
  const [pricing, setPricing] = useState(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const reload = useCallback(async () => {
    const result = await api.get(`/competitions/${competitionId}`)
    const config = JSON.parse(result.data.open_config || '{}')
    const cats = await api.get(`/competitions/${competitionId}/categories`)
    const fees = await api.get('/config/pricing')
    setPricing(fees.data)
    if (session && config.enabled) {
      const mine = (await api.get(`/competitions/${competitionId}/open/me`)).data
      setEntry(mine)
      if (mine) { setVideo(mine.video_url || ''); setAnswers(mine.answers || {}); setCategory(mine.categoria || ''); setDivision(mine.division || '') }
    } else setEntry(null)
    setData({ ...result.data, config, categories: cats.data })
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
  const organizerAssignsCategory = cfg.category_assignment === 'organizer'
  if (!cfg.enabled) return <main className="fr-open"><h1>Esta competencia no tiene Open</h1><Link to={`/competitions/${competitionId}/register`}>Ir a inscripción</Link></main>
  const submissionState = openSubmissionState(cfg, now)
  const closed = submissionState === 'closed'
  const preregistered = entry?.status === 'preregistered'
  const finalPayment = entry?.status === 'qualified'
  const registration = openRegistrationState(data, cfg, data.categories)
  const canSubmit = entry && ['paid', 'submitted'].includes(entry.status) && submissionState === 'open'
  const full = Number(data.categories.find(c => c.nombre === category)?.enrollment_price || 0)
  const finalAmount = entry ? entry.final_amount : organizerAssignsCategory ? null : cfg.final_payment === 'pending' ? (cfg.final_prices?.[category] ?? null) : (cfg.final_payment === 'none' ? 0 : cfg.final_payment === 'difference' ? Math.max(0, full - cfg.price) : cfg.final_payment === 'discount' ? Math.round(full * (100 - cfg.discount_percent) / 100) : full)
  const base = finalPayment ? entry.final_amount : cfg.price
  const fee = base > 0 ? Math.max(Number(pricing.min_platform_fee), Math.round(base * Number(pricing.default_platform_fee_rate))) : 0
  const questions = JSON.parse(data.enrollment_questions || '[]')
  const pay = event => {
    event.preventDefault()
    act(async () => {
      const result = (await api.post(`/competitions/${competitionId}/open/checkout`, {
        categoria: organizerAssignsCategory ? '' : category, terms_accepted: accepted, final: finalPayment, stage_test: isStageEnvironment,
        answers: questions.map(q => ({ question_id: q.id, answer: registrationAnswers[q.id] || '' })),
      })).data
      if (result.stage_test) { await reload(); setMessage('Pago de prueba aprobado en stage.'); setAccepted(false) }
      else setBold(result)
    })
  }
  const preregister = event => {
    event.preventDefault()
    act(async () => {
      await api.post(`/competitions/${competitionId}/open/preregister`, {
        ...(organizerAssignsCategory ? { division } : { categoria: category }), terms_accepted: accepted,
        answers: questions.map(q => ({ question_id: q.id, answer: registrationAnswers[q.id] || '' })),
      })
      await reload(); setAccepted(false)
      setMessage('Preinscripción guardada. Puedes pagar más adelante.')
    })
  }
  const tz = data.timezone || 'America/Bogota'
  const date = value => new Date(value).toLocaleDateString('es-CO', { timeZone: tz, day: 'numeric', month: 'long' })
  const dateTime = value => new Date(value).toLocaleString('es-CO', { timeZone: tz, dateStyle: 'long', timeStyle: 'short' })
  const stateLabel = entry ? openProfileStates[`open_${entry.status}`]?.label : 'Open clasificatorio'
  const progress = !entry ? 0 : preregistered ? 1 : ['paid', 'missing'].includes(entry.status) ? 2 : 3
  const steps = [{ label: 'Registro', icon: ClipboardCheck }, { label: 'Pago del Open', icon: CreditCard }, { label: 'Entrega', icon: Upload }]
  return <main className="fr-open fr-open-workspace">
    <Link to={`/competitions/${competitionId}`}>← {data.nombre}</Link>
    <header className="fr-open-hero">
      <div className="fr-open-eyebrow">{data.nombre} · OPEN</div>
      <div className="fr-open-hero-title"><h1>{entry ? 'Mi Open' : 'Participa en el Open'}</h1><span className="fr-open-pill">{stateLabel}</span></div>
      <p>{preregistered ? 'Ya estás registrado. El pago del Open sigue pendiente.' : entry ? openProfileStates[`open_${entry.status}`]?.copy : 'Regístrate gratis. Paga cuando decidas participar.'}</p>
      {entry && <small>{entry.categoria || `${entry.division || ''} · Categoría por asignar según tu resultado`}</small>}
      <ol className="fr-open-steps" aria-label="Tu avance en el Open">{steps.map((step, index) => <li key={step.label} className={index < progress ? 'complete' : index === progress ? 'current' : ''} aria-current={index === progress ? 'step' : undefined}><span className="fr-open-step-icon" aria-hidden="true">{index < progress ? <Check size={16} /> : <step.icon size={16} />}</span><span>{step.label}<small>{index < progress ? 'Completado' : index === progress ? (closed ? 'Plazo cerrado' : 'Siguiente paso') : 'Pendiente'}</small></span></li>)}</ol>
      <div className={`fr-open-window ${submissionState}`} role="status">
        <span><CalendarDays size={14} aria-hidden="true" />{submissionState === 'upcoming' ? 'ENTREGAS PRÓXIMAMENTE' : closed ? 'ENTREGAS CERRADAS' : 'ENTREGAS ABIERTAS'}</span>
        <strong>{submissionState === 'upcoming' ? `Podrás enviar tu Open desde el ${date(cfg.submissions_open_at)}` : closed ? 'El plazo de entrega terminó' : `Envía tu Open antes del ${date(cfg.deadline)}`}</strong>
        <small>{submissionState === 'upcoming' ? `${dateTime(cfg.submissions_open_at)} · ` : ''}Cierre: {dateTime(cfg.deadline)} · {tz}</small>
      </div>
      {entry?.status === 'qualified' && <p>{entry.final_amount == null ? 'El precio del Qualifier está por confirmar. Te mostraremos aquí el valor cuando esté publicado.' : 'Completa el pago para confirmar tu cupo.'}</p>}
      <div className="fr-open-actions">{entry?.video_url && <a href={entry.video_url} target="_blank" rel="noopener noreferrer">Ver mi video</a>}{entry?.status === 'confirmed' && <Link to="/my-events">Ver mi competencia</Link>}</div>
    </header>
    {message && <div role="status" className="fr-open-message">{message}</div>}
    {!session ? <Link className="fr-open-button" to="/login">Crear cuenta o iniciar sesión para preinscribirme</Link> : ((!entry && registration.available) || (preregistered && !closed && !!data.activa) || (finalPayment && entry.final_amount != null)) && <form className="fr-open-card" onSubmit={!entry ? preregister : pay}>
      <div className="fr-open-form-heading"><span className="fr-open-form-icon" aria-hidden="true">{entry ? <CreditCard size={22} /> : <ClipboardCheck size={22} />}</span><div><small>{finalPayment ? 'CLASIFICACIÓN' : entry ? 'PASO 02 · PAGO' : 'PASO 01 · REGISTRO'}</small><h2>{finalPayment ? 'Confirma tu cupo' : preregistered ? 'Paga tu Open' : 'Reserva tu registro'}</h2></div></div>
      {preregistered && <p>{submissionState === 'upcoming' ? 'Puedes pagar ahora y entregar a partir de la fecha indicada.' : 'Paga para habilitar tu entrega antes del cierre.'}</p>}
      {!entry && organizerAssignsCategory && <p>La organización asignará tu nivel según el resultado del Open.</p>}
      {!entry && (organizerAssignsCategory ? <label>Rama<select required disabled={busy} value={division} onChange={e => setDivision(e.target.value)}><option value="">Selecciona femenino o masculino</option>{['Femenino', 'Masculino'].filter(group => data.categories.some(c => c.registration_enabled && cfg.category_divisions?.[c.nombre] === group)).map(group => <option key={group} value={group}>{group}</option>)}</select></label> : <label>Categoría<select required disabled={busy || !!bold} value={category} onChange={e => setCategory(e.target.value)}><option value="">Selecciona tu categoría</option>{data.categories.filter(c => c.registration_enabled && c.modality === 'individual').map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}</select></label>)}
      <div className="fr-open-price"><div className="fr-open-total"><span>{!entry ? 'Registro gratuito' : 'Total a pagar'}<small>{!entry ? 'Paga el Open cuando decidas participar' : 'Pesos colombianos · COP'}</small></span><strong>{money(!entry ? 0 : base + fee)}</strong></div><dl className="fr-open-breakdown"><div><dt>{finalPayment ? 'Clasificación' : 'Open'}</dt><dd>{money(base)}</dd></div><div><dt>Cargo de servicio</dt><dd>{money(fee)}</dd></div>{!entry && <div><dt>Total cuando pagues el Open</dt><dd>{money(base + fee)}</dd></div>}</dl>
        <details><summary>Pago al clasificar · {finalAmount == null ? 'Por confirmar' : money(finalAmount)}</summary><p>Al clasificar: <strong>{finalAmount == null ? 'Por confirmar' : category ? money(finalAmount) : 'Selecciona una categoría'}</strong>{finalAmount > 0 && ' + servicio'}<br />{({ full: 'Precio completo de la categoría.', difference: 'Se descuenta lo pagado por el Open (sin cargos de servicio).', discount: `${cfg.discount_percent}% de descuento sobre el precio completo.`, none: 'Sin pago adicional.', pending: finalAmount == null ? 'El precio del Qualifier se publicará antes de habilitar su pago.' : 'Valor adicional publicado para tu categoría.' })[cfg.final_payment]}</p></details></div>
      {!entry && questions.map(q => <label key={q.id}>{q.label}{q.required ? ' *' : ''}{q.field_type === 'image' ? <input type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (!file) return; act(async () => { const form = new FormData(); form.append('file', file); const result = await api.post('/enrollment-answers/upload', form); setRegistrationAnswers(old => ({ ...old, [q.id]: result.data.url })) }) }} /> : <input required={!!q.required} value={registrationAnswers[q.id] || ''} onChange={e => setRegistrationAnswers(old => ({ ...old, [q.id]: e.target.value }))} />}</label>)}
      {data.enrollment_terms_text && <details><summary>Condiciones de la competencia</summary><p style={{ whiteSpace: 'pre-wrap' }}>{data.enrollment_terms_text}</p></details>}
      <OpenConsent accepted={accepted} onChange={setAccepted} disabled={busy || !!bold} pendingPrice={cfg.final_payment === 'pending' && finalAmount == null} registering={!entry} />
      {!bold && <div className="fr-open-submit"><button disabled={busy || !accepted || (!(organizerAssignsCategory ? division : category) && !entry) || (!!entry && paymentsDisabled && !isStageEnvironment)}>{busy ? 'Procesando…' : !entry ? 'Registrarme gratis' : isStageEnvironment ? `Probar pago · ${money(base + fee)}` : `Continuar al pago · ${money(base + fee)}`}<ArrowRight size={18} aria-hidden="true" /></button>{!accepted && <small>Acepta las condiciones para continuar.</small>}</div>}
      {bold && <BoldPaymentButton config={bold} onError={onBoldError} onPaymentClick={onBoldClick} />}
      {isStageEnvironment && !!entry && <small className="fr-open-stage">Entorno de prueba · Este pago no cobra dinero real.</small>}
    </form>}
    {!entry && !registration.available && <p role="status">{closed ? 'El plazo del Open terminó. No se aceptan nuevos registros.' : `${registration.label}. Puedes consultar los requisitos; el pago estará disponible cuando el registro esté habilitado y haya categorías abiertas dentro del plazo.`}</p>}
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
    {!isStageEnvironment && (bold || preregistered || (finalPayment && entry.final_amount != null)) && <div className="fr-open-payment-help"><span>¿Ya pagaste y aún no aparece?</span><button className="secondary" disabled={busy} onClick={() => act(async () => { await api.post(`/competitions/${competitionId}/payment-status/sync`).catch(err => { if (err.response?.status !== 404) throw err }); await reload(); setMessage('Estado del pago actualizado') })}>Verificar mi pago</button></div>}
    <section className="fr-open-card fr-open-details" aria-label="Información del Open">
      <details open={canSubmit || undefined}><summary>WOD y requisitos de entrega</summary><div><p style={{ whiteSpace: 'pre-wrap' }}>{cfg.instructions}</p><p>Envía el video completo o su enlace junto con tu resultado. Archivos MP4, MOV o WebM de hasta 100 MB.</p>{cfg.fields?.length > 0 && <ul>{cfg.fields.map(field => <li key={field.id}>{field.label}{field.required ? ' · Obligatorio' : ' · Opcional'}</li>)}</ul>}</div></details>
      <details><summary>Cómo funciona la clasificación</summary><div><p>El organizador revisa tu video y resultados para determinar quiénes clasifican.{organizerAssignsCategory && ' Tu categoría la asigna la organización según tu desempeño.'}</p><p>Pagar el Open no garantiza un cupo en la competencia. {cfg.final_payment === 'pending' ? 'El precio adicional del Qualifier se publicará antes de habilitar su pago.' : 'Consulta el valor al clasificar antes de confirmar tu cupo.'}</p></div></details>
      <Link to={`/competitions/${competitionId}`}>Ver información y cronograma del evento →</Link>
    </section>
  </main>
}
