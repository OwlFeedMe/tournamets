import { Link } from 'react-router-dom'
import { participationTasks } from '../../utils/participationTasks'
import '../competition/OpenQualifier.css'

const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)

export default function ParticipationTasks({ competitions }) {
  const tasks = participationTasks(competitions)
  if (!tasks.length) return null
  return <section className="fr-open" aria-label="Pendientes de tus competencias" style={{ padding: 0, marginBottom: 18 }}>
    {tasks.map(({ competition, needsPayment, needsPhoto, href }) => <div key={competition.id} className="fr-open-card" style={{ borderTop: '3px solid #FF6B00', marginBottom: 12 }}>
      <div className="fr-open-status">{needsPayment ? '¡CLASIFICASTE!' : 'COMPLETA TU PARTICIPACIÓN'}</div>
      <h2 style={{ margin: 0 }}>{competition.nombre}</h2>
      {competition.enrollment_categoria && <strong style={{ color: '#00C2A8' }}>{competition.enrollment_categoria}</strong>}
      <p>{needsPayment ? `Confirma tu cupo${competition.open_final_total != null ? ` con el pago restante de ${money(competition.open_final_total)}` : ' con el pago restante'}.` : 'Tu cupo está confirmado.'}{needsPhoto ? ' Sube tu foto para que la organización cree tu avatar.' : ''}</p>
      <div className="fr-open-actions">
        {needsPayment && <Link className="fr-open-button" to={href}>Confirmar participación</Link>}
        {needsPhoto && <Link className={!needsPayment ? 'fr-open-button' : undefined} to={`${href}#avatar-photo`}>Subir foto para avatar</Link>}
      </div>
    </div>)}
  </section>
}
