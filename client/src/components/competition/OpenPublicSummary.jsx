import { Link } from 'react-router-dom'
import { openFinalPaymentLabel, openRegistrationState, openLandingAction } from '../../utils/openQualifier'
import './OpenQualifier.css'

const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value || 0)

export default function OpenPublicSummary({ competition, config, categories, pricing, showLink = true, compact = false, entry = null, entryLoading = false, onNotify, notificationBusy = false, notificationMessage = null }) {
  const status = openRegistrationState(competition, config, categories)
  const fee = pricing ? Math.max(pricing.min_platform_fee, Math.round(config.price * pricing.default_platform_fee_rate)) : null
  const action = openLandingAction(status, entry)
  if (compact) return <section className="fr-open" id="open-clasificatorio" aria-label="Inscripción al Open" style={{ marginBottom: 18, padding: 0, background: 'transparent' }}>
    <div className="fr-open-card" style={{ borderTop: '4px solid #FF6B00' }}>
      <div className="fr-open-status">OPEN CLASIFICATORIO</div>
      <div className="fr-open-grid" style={{ alignItems: 'center' }}>
        <div><h2>{entry ? 'Tu participación en el Open' : 'Clasifica a la competencia'}</h2>
          <p>{entry ? entry.status === 'preregistered' ? 'Tu preinscripción está guardada. Paga el Open cuando decidas participar.' : 'Consulta tu entrega y el estado de tu clasificación.' : 'Participa en el Open para competir por un cupo.'}</p>
        </div>
        <div><strong style={{ fontSize: 30, color: '#FF6B00' }}>{money(config.price)}</strong><p>{fee === null ? '+ cargo de servicio' : `+ ${money(fee)} de servicio · Total: ${money(config.price + fee)}`}</p></div>
      </div>
      <div className="fr-open-actions">
        {entryLoading ? <button disabled>Consultando inscripción…</button> : action.mode === 'notify' ? <button disabled={notificationBusy || notificationMessage?.type === 'success'} onClick={onNotify}>{notificationBusy ? 'Guardando…' : notificationMessage?.type === 'success' ? 'Aviso activado' : action.label}</button> : action.mode === 'closed' ? <p>{action.label}</p> : <Link className="fr-open-button" to={`/competitions/${competition.id}/open`}>{action.label}</Link>}
        <Link to={`/competitions/${competition.id}/schedule`}>Ver cronograma</Link>
        <Link to={`/leaderboard/${competition.id}`}>Ver leaderboard</Link>
      </div>
      {notificationMessage && <p role="status">{notificationMessage.text}</p>}
    </div>
  </section>
  return <section id="open-clasificatorio" className="fr-open" aria-label="Open clasificatorio" style={{ marginBottom: 18, padding: 0, background: 'transparent' }}>
    <div className="fr-open-card" style={{ borderTop: '4px solid #FF6B00' }}>
      <div className="fr-open-status">OPEN CLASIFICATORIO · {status.label}</div>
      <h2>Tu camino a {competition.nombre}</h2>
      <p>Preinscríbete gratis y paga el Open cuando decidas participar. Envía tu video y tus resultados dentro del plazo; el organizador elegirá quiénes avanzan a la competencia.</p>
      {config.category_assignment === 'organizer' && <p>Solo seleccionas femenino o masculino. La organización asigna tu categoría según tu resultado del Open.</p>}
      <div className="fr-open-grid">
        <div><h3>Inscripción al Open</h3><strong style={{ fontSize: 30, color: '#FF6B00' }}>{money(config.price)}</strong><p>{fee === null ? '+ cargo de servicio' : `Servicio: ${money(fee)} · Total: ${money(config.price + fee)}`}</p></div>
        {config.submissions_open_at && <div><h3>Apertura de entregas</h3><p>{new Date(config.submissions_open_at).toLocaleString('es-CO', { timeZone: competition.timezone || 'America/Bogota', dateStyle: 'long', timeStyle: 'short' })}<br />{competition.timezone || 'America/Bogota'}</p></div>}
        <div><h3>Fecha límite de entrega</h3><p>{new Date(config.deadline).toLocaleString('es-CO', { timeZone: competition.timezone || 'America/Bogota', dateStyle: 'long', timeStyle: 'short' })}<br />{competition.timezone || 'America/Bogota'}</p></div>
        <div><h3>Pago al clasificar</h3><p>{openFinalPaymentLabel(config)} {config.final_payment !== 'none' && 'Se suma el cargo de servicio al pago adicional.'}</p></div>
      </div>
      {!categories?.length && <p>Las categorías y sus precios para la competencia principal aún no están publicados.</p>}
      <h3>Qué debes entregar</h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{config.instructions}</p>
      <p><strong>Video o enlace del video (obligatorio)</strong>{config.fields?.length > 0 && ` · ${config.fields.map(f => `${f.label}${f.required ? ' (obligatorio)' : ' (opcional)'}`).join(' · ')}`}</p>
      <p>Tu preinscripción es gratuita. Para enviar el Open necesitas el pago aprobado y estar dentro del período de entregas. Pagar el Open no garantiza clasificar. Si no entregas dentro del plazo, no avanzas y no se genera un reembolso automático.</p>
      {showLink && <div className="fr-open-actions">
        <Link className="fr-open-button" to={`/competitions/${competition.id}/open`}>{status.available ? 'Participar en el Open' : 'Ver mi Open y requisitos'}</Link>
        <Link to={`/competitions/${competition.id}/schedule`}>Ver cronograma</Link>
        <Link to={`/leaderboard/${competition.id}`}>Ver leaderboard</Link>
      </div>}
    </div>
  </section>
}
