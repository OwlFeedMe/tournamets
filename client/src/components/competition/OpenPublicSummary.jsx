import { Link } from 'react-router-dom'
import { openFinalPaymentLabel, openRegistrationState } from '../../utils/openQualifier'
import './OpenQualifier.css'

const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value || 0)

export default function OpenPublicSummary({ competition, config, categories, pricing, showLink = true }) {
  const status = openRegistrationState(competition, config, categories)
  const fee = pricing ? Math.max(pricing.min_platform_fee, Math.round(config.price * pricing.default_platform_fee_rate)) : null
  return <section id="open-clasificatorio" className="fr-open" aria-label="Open clasificatorio" style={{ marginBottom: 18, padding: 0, background: 'transparent' }}>
    <div className="fr-open-card" style={{ borderTop: '4px solid #FF6B00' }}>
      <div className="fr-open-status">OPEN CLASIFICATORIO · {status.label}</div>
      <h2>Tu camino a {competition.nombre}</h2>
      <p>Primero participa en el Open. Envía tu video y tus resultados; el organizador elegirá quiénes avanzan a la competencia.</p>
      <div className="fr-open-grid">
        <div><h3>Inscripción al Open</h3><strong style={{ fontSize: 30, color: '#FF6B00' }}>{money(config.price)}</strong><p>{fee === null ? '+ cargo de servicio' : `Servicio: ${money(fee)} · Total: ${money(config.price + fee)}`}</p></div>
        <div><h3>Fecha límite de entrega</h3><p>{new Date(config.deadline).toLocaleString('es-CO', { timeZone: competition.timezone || 'America/Bogota', dateStyle: 'long', timeStyle: 'short' })}<br />{competition.timezone || 'America/Bogota'}</p></div>
        <div><h3>Pago al clasificar</h3><p>{openFinalPaymentLabel(config)} {config.final_payment !== 'none' && 'Se suma el cargo de servicio al pago adicional.'}</p></div>
      </div>
      {!categories?.length && <p>Las categorías y sus precios para la competencia principal aún no están publicados.</p>}
      <h3>Qué debes entregar</h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{config.instructions}</p>
      <p><strong>Video o enlace del video (obligatorio)</strong>{config.fields?.length > 0 && ` · ${config.fields.map(f => `${f.label}${f.required ? ' (obligatorio)' : ' (opcional)'}`).join(' · ')}`}</p>
      <p>Tu inscripción se confirma únicamente con el pago aprobado. Pagar el Open no garantiza clasificar. Si no entregas dentro del plazo, no avanzas y no se genera un reembolso automático.</p>
      {showLink && <div className="fr-open-actions">
        <Link className="fr-open-button" to={`/competitions/${competition.id}/open`}>{status.available ? 'Participar en el Open' : 'Ver mi Open y requisitos'}</Link>
        <Link to={`/competitions/${competition.id}/schedule`}>Ver cronograma</Link>
        <Link to={`/leaderboard/${competition.id}`}>Ver leaderboard</Link>
      </div>}
    </div>
  </section>
}
