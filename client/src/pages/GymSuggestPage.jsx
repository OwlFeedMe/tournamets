import { AlertTriangle, ArrowLeft, Check, Dumbbell, MapPin, Search, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

function Field({ label, value, onChange, placeholder, textarea = false, type = 'text' }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 700, color: '#AAB2C0' }}>{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={4}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: '#0D0F12',
            border: '1px solid #252A33',
            borderRadius: 12,
            padding: '11px 12px',
            color: '#F5F7FA',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: '#0D0F12',
            border: '1px solid #252A33',
            borderRadius: 12,
            padding: '11px 12px',
            color: '#F5F7FA',
          }}
        />
      )}
    </label>
  )
}

function DuplicateCard({ gym, onClaim }) {
  return (
    <div
      style={{
        background: '#171B21',
        border: '1px solid #252A33',
        borderRadius: 14,
        padding: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: gym.logo_url ? `url(${gym.logo_url}) center/cover no-repeat` : '#252A33',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        {!gym.logo_url && <Dumbbell size={16} color="#AAB2C0" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#F5F7FA' }}>{gym.display_name}</span>
          {gym.ownership_status === 'verified' && <ShieldCheck size={13} color="#00C2A8" />}
        </div>
        <div style={{ fontSize: 12, color: '#AAB2C0', marginTop: 3 }}>
          {[gym.city, gym.country].filter(Boolean).join(', ') || 'Ubicacion sin definir'}
        </div>
      </div>
      <button
        type="button"
        onClick={onClaim}
        className="btn-secondary btn-sm"
        style={{ flexShrink: 0 }}
      >
        Ver gym
      </button>
    </div>
  )
}

export default function GymSuggestPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    proposed_name: '',
    country: '',
    state_region: '',
    city: '',
    instagram_url: '',
    website_url: '',
    contact_name: '',
    contact_email: '',
    notes: '',
  })
  const [checking, setChecking] = useState(false)
  const [duplicates, setDuplicates] = useState([])
  const [forceSubmit, setForceSubmit] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)

  const canCheckDuplicates = useMemo(
    () => form.proposed_name.trim().length >= 3,
    [form.proposed_name],
  )

  useEffect(() => {
    if (!canCheckDuplicates || forceSubmit) {
      setDuplicates([])
      return undefined
    }

    const timer = setTimeout(async () => {
      setChecking(true)
      try {
        const params = new URLSearchParams({
          name: form.proposed_name.trim(),
          city: form.city.trim(),
        })
        const { data } = await api.get(`/gym-submissions/check-duplicates?${params}`)
        setDuplicates(data?.candidates || [])
      } catch {
        setDuplicates([])
      } finally {
        setChecking(false)
      }
    }, 320)

    return () => clearTimeout(timer)
  }, [canCheckDuplicates, forceSubmit, form.city, form.proposed_name])

  const setField = (field) => (value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setMessage(null)
    if (field === 'proposed_name' || field === 'city') {
      setForceSubmit(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.proposed_name.trim()) {
      setMessage({ type: 'error', text: 'Escribe el nombre del gym.' })
      return
    }

    setSubmitting(true)
    setMessage(null)
    try {
      const payload = {
        ...form,
        proposed_name: form.proposed_name.trim(),
        force_submit: forceSubmit,
      }
      const { data } = await api.post('/gym-submissions', payload)
      if (data?.ok === false && Array.isArray(data?.duplicate_candidates) && data.duplicate_candidates.length) {
        setDuplicates(data.duplicate_candidates)
        setMessage({ type: 'warning', text: 'Encontramos gyms parecidos. Revisa si alguno ya existe antes de enviar.' })
        return
      }
      setMessage({ type: 'success', text: 'Tu sugerencia fue enviada. El equipo la revisara antes de publicarla.' })
      setForm({
        proposed_name: '',
        country: '',
        state_region: '',
        city: '',
        instagram_url: '',
        website_url: '',
        contact_name: '',
        contact_email: '',
        notes: '',
      })
      setDuplicates([])
      setForceSubmit(false)
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'No se pudo enviar la sugerencia.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0D0F12', paddingBottom: 120 }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 20px 0' }}>
        <button
          type="button"
          onClick={() => navigate('/gyms')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'transparent',
            border: 'none',
            color: '#AAB2C0',
            cursor: 'pointer',
            padding: 0,
            marginBottom: 18,
          }}
        >
          <ArrowLeft size={16} />
          Volver a gyms
        </button>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Dumbbell size={22} color="#FF6B00" />
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#F5F7FA', fontFamily: 'Bebas Neue, sans-serif', letterSpacing: 1 }}>
              Sugerir gym
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: '#AAB2C0', lineHeight: 1.6 }}>
            Si el gym aun no aparece en FinalRep, envialo para revision. Si ya existe, es mejor reclamarlo o unirte al perfil actual.
          </p>
        </div>

        {message && (
          <div
            style={{
              marginBottom: 16,
              borderRadius: 14,
              padding: '12px 14px',
              border: message.type === 'error'
                ? '1px solid rgba(239,68,68,0.28)'
                : message.type === 'warning'
                  ? '1px solid rgba(245,158,11,0.28)'
                  : '1px solid rgba(34,197,94,0.28)',
              background: message.type === 'error'
                ? 'rgba(239,68,68,0.08)'
                : message.type === 'warning'
                  ? 'rgba(245,158,11,0.08)'
                  : 'rgba(34,197,94,0.08)',
              color: message.type === 'error' ? '#EF4444' : message.type === 'warning' ? '#F59E0B' : '#22C55E',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {message.text}
          </div>
        )}

        {canCheckDuplicates && !forceSubmit && (
          <div
            style={{
              marginBottom: 18,
              padding: '14px 16px',
              borderRadius: 16,
              border: '1px solid #252A33',
              background: '#171B21',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: duplicates.length ? 12 : 0 }}>
              <Search size={15} color="#AAB2C0" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#F5F7FA' }}>
                {checking ? 'Buscando gyms parecidos...' : 'Revisamos si ya existe un gym parecido'}
              </span>
            </div>

            {!checking && duplicates.length > 0 && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#F59E0B' }}>
                  <AlertTriangle size={14} />
                  Puede que el gym ya exista en el directorio.
                </div>
                {duplicates.map((gym) => (
                  <DuplicateCard
                    key={gym.id}
                    gym={gym}
                    onClaim={() => navigate(`/gyms/${gym.slug}`)}
                  />
                ))}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 4, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={forceSubmit}
                    onChange={(event) => setForceSubmit(event.target.checked)}
                    style={{ marginTop: 2, accentColor: '#FF6B00' }}
                  />
                  <span style={{ fontSize: 12, color: '#AAB2C0', lineHeight: 1.5 }}>
                    Ya revise y aun asi quiero enviar esta sugerencia para que el equipo la evalúe.
                  </span>
                </label>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <div
            style={{
              background: '#171B21',
              border: '1px solid #252A33',
              borderRadius: 18,
              padding: 18,
              display: 'grid',
              gap: 14,
            }}
          >
            <Field label="Nombre del gym *" value={form.proposed_name} onChange={setField('proposed_name')} placeholder="FinalRep Downtown Box" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Field label="Pais" value={form.country} onChange={setField('country')} placeholder="Colombia" />
              <Field label="Region o estado" value={form.state_region} onChange={setField('state_region')} placeholder="Cundinamarca" />
              <Field label="Ciudad" value={form.city} onChange={setField('city')} placeholder="Bogota" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <Field label="Instagram" value={form.instagram_url} onChange={setField('instagram_url')} placeholder="https://instagram.com/..." />
              <Field label="Sitio web" value={form.website_url} onChange={setField('website_url')} placeholder="https://..." />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <Field label="Persona de contacto" value={form.contact_name} onChange={setField('contact_name')} placeholder="Nombre del owner o manager" />
              <Field label="Email de contacto" value={form.contact_email} onChange={setField('contact_email')} placeholder="contacto@gym.com" type="email" />
            </div>
            <Field label="Notas para revision" value={form.notes} onChange={setField('notes')} placeholder="Comparte contexto util: si ya compite, si tiene sede activa, red principal, etc." textarea />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#AAB2C0', fontSize: 12 }}>
              <MapPin size={13} />
              El equipo revisa nombre, ciudad y posibles duplicados antes de publicar.
            </div>
            <button
              type="submit"
              disabled={submitting || !form.proposed_name.trim() || (duplicates.length > 0 && !forceSubmit)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 20px',
                borderRadius: 12,
                border: 'none',
                background: '#FF6B00',
                color: '#0D0F12',
                fontSize: 14,
                fontWeight: 800,
                cursor: submitting ? 'default' : 'pointer',
              }}
            >
              <Check size={15} />
              {submitting ? 'Enviando...' : 'Enviar sugerencia'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
