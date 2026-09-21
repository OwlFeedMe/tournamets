import { useEffect, useState } from 'react'
import api from '../../api/axios'
import { competitionDateTimeInputToUtc, utcToCompetitionDateTimeInput, competitionTimeZone } from '../../utils/competitionTimeZone'
import './OpenQualifier.css'

export const openStatus = { preregistered: 'Preinscrito · Open pendiente de pago', paid: 'Open pagado · Entrega pendiente', submitted: 'Entrega recibida · En revisión', missing: 'Sin entrega', qualified: 'Clasificado · Pago pendiente', rejected: 'No clasificado', confirmed: 'Cupo confirmado' }
export const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value || 0)
const defaults = { enabled: false, price: 0, deadline: '', submissions_open_at: '', instructions: '', final_payment: 'full', discount_percent: 0, fields: [] }

export default function OpenAdminPanel({ competition, reload }) {
  const [config, setConfig] = useState(defaults)
  const [entries, setEntries] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('')
  const [categories, setCategories] = useState([])
  const [finalPrices, setFinalPrices] = useState({})
  const tz = competitionTimeZone(competition.timezone)
  const load = async () => {
    const cfg = JSON.parse(competition.open_config || '{}')
    setConfig({ ...defaults, ...cfg })
    setCategories((await api.get(`/competitions/${competition.id}/categories`)).data.filter(c => c.modality === 'individual'))
    if (cfg.enabled) setEntries((await api.get(`/competitions/${competition.id}/open/entries`)).data)
    else setEntries([])
  }
  useEffect(() => { load().catch(err => setMessage(err.response?.data?.detail || 'No se pudo cargar el Open')) }, [competition.id, competition.open_config])
  const change = (key, value) => setConfig(old => ({ ...old, [key]: value }))
  const act = async fn => {
    setBusy(true); setMessage('')
    try { await fn() } catch (err) { setMessage(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Revisa los datos e intenta nuevamente') }
    finally { setBusy(false) }
  }
  const save = event => {
    event.preventDefault()
    act(async () => {
      await api.put(`/competitions/${competition.id}/open`, { ...config, deadline: config.deadline || null, submissions_open_at: config.submissions_open_at || null })
      await reload(); setMessage('Configuración del Open guardada')
    })
  }
  const decision = (entry, qualify) => act(async () => {
    await api.post(`/competitions/${competition.id}/open/entries/${entry.user_id}/decision`, { qualify })
    await load(); await reload(); setMessage(qualify ? 'Clasificación registrada' : 'Entrega marcada como no clasificada')
  })
  return <section className="fr-open">
    <h2>Open clasificatorio</h2>
    {message && <div role="status" className="fr-open-message">{message}</div>}
    <form className="fr-open-card" onSubmit={save}>
      <label className="fr-open-check"><input type="checkbox" checked={config.enabled} disabled={entries.length > 0} onChange={e => change('enabled', e.target.checked)} />Activar Open para esta competencia</label>
      <p>La preinscripción es gratuita y queda visible aquí. El pago habilita la participación en el Open. Solo quienes clasifiquen y completen el pago final tendrán un cupo en la competencia.</p>
      <p>Disponible para categorías individuales. Configura el Open antes de recibir inscripciones; las condiciones se bloquean con la primera preinscripción o intento de pago.</p>
      {config.enabled && <>
        <div className="fr-open-grid">
          <label>Precio del Open (COP)<input type="number" min="1" max="100000000" required value={config.price} onChange={e => change('price', Number(e.target.value))} /></label>
          <label>Apertura de entregas ({tz})<input type="datetime-local" value={utcToCompetitionDateTimeInput(config.submissions_open_at, tz)} onChange={e => change('submissions_open_at', competitionDateTimeInputToUtc(e.target.value, tz))} /><small>Sin fecha: se puede entregar desde el pago aprobado.</small></label>
          <label>Fecha límite de entrega ({tz})<input type="datetime-local" required value={utcToCompetitionDateTimeInput(config.deadline, tz)} onChange={e => change('deadline', competitionDateTimeInputToUtc(e.target.value, tz))} /></label>
          <label>Pago al clasificar<select value={config.final_payment} onChange={e => change('final_payment', e.target.value)}>
            <option value="pending">Precio por confirmar</option><option value="full">Precio completo de la categoría</option><option value="difference">Diferencia: precio completo menos Open</option><option value="discount">Precio completo con descuento</option><option value="none">Sin pago adicional</option>
          </select></label>
          {config.final_payment === 'discount' && <label>Descuento (%)<input type="number" min="0" max="100" step="0.01" value={config.discount_percent} onChange={e => change('discount_percent', Number(e.target.value))} /></label>}
        </div>
        <label>Instrucciones del Open<textarea required maxLength={10000} value={config.instructions} onChange={e => change('instructions', e.target.value)} placeholder="Movimiento, repeticiones, estándares y requisitos del video" /></label>
        <h3>Datos de la entrega</h3><p>El video o enlace es obligatorio. Agrega los resultados que necesitas revisar.</p>
        {config.fields.map((field, index) => <div className="fr-open-grid" key={field.id}>
          <label>Nombre del dato<input required maxLength={150} value={field.label} onChange={e => change('fields', config.fields.map((f, i) => i === index ? { ...f, label: e.target.value } : f))} /></label>
          <label>Tipo<select value={field.field_type} onChange={e => change('fields', config.fields.map((f, i) => i === index ? { ...f, field_type: e.target.value } : f))}><option value="text">Texto</option><option value="number">Número</option></select></label>
          <div className="fr-open-actions"><label className="fr-open-check"><input type="checkbox" checked={field.required} onChange={e => change('fields', config.fields.map((f, i) => i === index ? { ...f, required: e.target.checked } : f))} />Obligatorio</label><button type="button" className="secondary" onClick={() => change('fields', config.fields.filter((_, i) => i !== index))}>Quitar</button></div>
        </div>)}
        <div><button type="button" className="secondary" disabled={config.fields.length >= 30} onClick={() => change('fields', [...config.fields, { id: `f_${crypto.randomUUID().replaceAll('-', '')}`, label: '', field_type: 'number', required: true }])}>Agregar dato</button></div>
      </>}
      <div><button disabled={busy || entries.length > 0 || !!config.final_prices}>Guardar Open</button></div>
    </form>
    {config.enabled && config.final_payment === 'pending' && !config.final_prices && <form className="fr-open-card" onSubmit={e => { e.preventDefault(); act(async () => {
      await api.post(`/competitions/${competition.id}/open/final-prices`, { prices: Object.fromEntries(categories.map(c => [c.nombre, Number(finalPrices[c.nombre])])) })
      await load(); await reload(); setMessage('Precios finales publicados. Los clasificados ya pueden confirmar su cupo.')
    }) }}>
      <h3>Publicar precio del Qualifier</h3><p>Completa el valor adicional por categoría, sin cargo de servicio. Publica cuando los precios sean definitivos: después quedarán bloqueados. Un valor de cero confirma sin pago adicional a quienes ya clasificaron.</p>
      <div className="fr-open-grid">{categories.map(c => <label key={c.id}>{c.nombre} (COP)<input required type="number" min="0" max="100000000" step="1" value={finalPrices[c.nombre] ?? ''} onChange={e => setFinalPrices(old => ({ ...old, [c.nombre]: e.target.value }))} /></label>)}</div>
      <button disabled={busy || !categories.length}>Publicar precios definitivos</button>
    </form>}
    {config.enabled && <div className="fr-open-card">
      <div className="fr-open-actions"><h3>Inscripciones al Open ({entries.length})</h3><button className="secondary" disabled={busy} onClick={() => act(load)}>Actualizar</button><a href={`/competitions/${competition.id}/open`}>Ver Open</a></div>
      <label>Estado<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">Todos</option>{Object.entries(openStatus).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {!entries.length && <p>Aún no hay preinscripciones al Open.</p>}
      {entries.filter(e => !filter || e.status === filter).map(entry => <article className="fr-open-card" key={entry.user_id}>
        <h3>{entry.name} · {entry.categoria}</h3><div className="fr-open-status">{openStatus[entry.status]}</div>
        <p>{entry.status === 'preregistered' ? 'Open pendiente' : 'Open pagado'}: {money(entry.open_price)} · Pago al clasificar: {entry.final_amount == null ? 'Por confirmar' : money(entry.final_amount)}</p>
        {entry.registered_at && <p>Preinscripción: {new Date(entry.registered_at).toLocaleString('es-CO', { timeZone: tz })}</p>}
        {entry.submitted_at && <p>Entregado: {new Date(entry.submitted_at).toLocaleString('es-CO', { timeZone: tz })}</p>}
        {entry.video_url && <a href={entry.video_url} target="_blank" rel="noopener noreferrer">Ver video</a>}
        {config.fields.map(field => <p key={field.id}><strong>{field.label}:</strong> {entry.answers[field.id] || '—'}</p>)}
        {entry.status === 'submitted' && <div className="fr-open-actions"><button disabled={busy} onClick={() => decision(entry, true)}>Clasificar</button><button disabled={busy} className="secondary" onClick={() => decision(entry, false)}>No clasifica</button></div>}
      </article>)}
    </div>}
  </section>
}
