import { Check, ShieldCheck } from 'lucide-react'

export default function OpenConsent({ accepted, onChange, disabled, pendingPrice, registering }) {
  return <label className={`fr-open-consent${accepted ? ' is-accepted' : ''}`}>
    <input type="checkbox" required checked={accepted} disabled={disabled} onChange={event => onChange(event.target.checked)} />
    <span className="fr-open-consent-box" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
    <span className="fr-open-consent-copy">
      <strong>Acepto las condiciones del Open</strong>
      <span>Me comprometo a enviar mi video y resultado dentro del plazo.{pendingPrice ? ' El precio del Qualifier está por confirmar y lo aceptaré por separado antes de pagarlo.' : ' Acepto el valor indicado y las condiciones de clasificación.'}</span>
      <small><ShieldCheck size={14} aria-hidden="true" />{registering ? 'Este registro es gratuito. No se realiza ningún cobro.' : 'El pago del Open no garantiza la clasificación.'}</small>
    </span>
  </label>
}
