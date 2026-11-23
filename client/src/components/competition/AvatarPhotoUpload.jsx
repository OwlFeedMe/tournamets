import { useState } from 'react'
import api from '../../api/axios'

export default function AvatarPhotoUpload({ competitionId, entry, onUploaded }) {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const uploaded = !!entry.avatar_photo_object_key
  const submit = async event => {
    event.preventDefault()
    if (!file || busy) return
    setMessage('')
    if (file.size > 10 * 1024 * 1024) { setMessage('La foto debe pesar como máximo 10 MB.'); return }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post(`/competitions/${competitionId}/avatar-photo`, form)
      onUploaded(data)
      setFile(null)
      event.target.reset()
      setMessage('Foto recibida. La organización ya puede usarla para crear tu avatar.')
    } catch (error) {
      setMessage(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'No pudimos guardar tu foto. Intenta nuevamente.')
    } finally { setBusy(false) }
  }
  return <section id="avatar-photo" className="fr-open-card" style={{ scrollMarginTop: 90 }} aria-label="Foto para tu avatar">
    <div className="fr-open-status">{uploaded ? 'FOTO RECIBIDA' : 'FOTO PENDIENTE'}</div>
    <h2>Foto para tu avatar</h2>
    <p>Sube una foto tuya de frente, con buena iluminación y sin filtros. La organización la usará para crear tu avatar de la competencia.</p>
    <p>Solo tú y la organización tienen acceso a esta foto. Tu foto pública de perfil se mantiene igual.</p>
    {entry.avatar_photo_url && <img src={entry.avatar_photo_url} referrerPolicy="no-referrer" alt="Tu foto para el avatar de la competencia" style={{ width: '100%', maxWidth: 300, maxHeight: 360, objectFit: 'contain', borderRadius: 10, background: '#0D0F12' }} />}
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <label>{uploaded ? 'Cambiar foto' : 'Seleccionar foto'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} required onChange={event => { setFile(event.target.files?.[0] || null); setMessage('') }} /></label>
      <small>JPG, PNG o WebP · Máximo 10 MB y 40 megapíxeles · Puedes subirla antes de pagar.</small>
      <button disabled={busy || !file}>{busy ? 'Subiendo foto…' : uploaded ? 'Actualizar foto' : 'Subir foto para avatar'}</button>
    </form>
    {message && <p role="status">{message}</p>}
  </section>
}
