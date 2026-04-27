import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api/axios'
import { getHomePath, useAuth } from '../context/AuthContext'
import { buildCityCountry, loadCitiesByCountry, loadCountries, parseCityCountry } from '../utils/locations'
import { cedulaInputValue, formatCedula, getMissingParticipantProfileFields } from '../utils/participantProfile'

const pageBg =
  'radial-gradient(circle at top, rgba(214,217,224,0.10), transparent 28%), radial-gradient(circle at 85% 20%, rgba(94,234,212,0.10), transparent 24%), #0D0F12'

function parseEnrollmentQuestions(raw) {
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed.map((item, idx) => ({
      id: String(item?.id || `q_${idx + 1}`),
      label: String(item?.label || '').trim(),
      field_type: String(item?.field_type || 'text').trim().toLowerCase() || 'text',
      required: Number(item?.required) ? 1 : 0,
      placeholder: String(item?.placeholder || '').trim(),
    })).filter(item => item.label)
  } catch {
    return []
  }
}

function normalizeProfileDraft(profile) {
  const parsedCityCountry = parseCityCountry(profile?.ciudad_pais || '')
  return {
    nombre: String(profile?.nombre || '').trim(),
    apellido: String(profile?.apellido || '').trim(),
    email: String(profile?.email || '').trim(),
    celular: String(profile?.celular || '').trim(),
    cedula: String(profile?.cedula || '').trim(),
    sexo: String(profile?.sexo || '').trim(),
    genero: String(profile?.genero || '').trim(),
    fecha_nacimiento: profile?.fecha_nacimiento ? String(profile.fecha_nacimiento).slice(0, 10) : '',
    ciudad_pais: String(profile?.ciudad_pais || '').trim(),
    box: String(profile?.box || '').trim(),
    talla_camiseta: String(profile?.talla_camiseta || '').trim(),
    _city: parsedCityCountry.city || '',
    _country: parsedCityCountry.countryCode || '',
  }
}

const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(13,15,18,0.6)', border: '1px solid #252A33', borderRadius: 10,
  color: '#F5F7FA', padding: '11px 14px', fontSize: 14, outline: 'none',
}
const labelStyle = { fontSize: 12, fontWeight: 700, color: '#AAB2C0', display: 'block', marginBottom: 6 }

export default function CompetitionInvitationEnrollPage() {
  const { competitionId, invitationId } = useParams()
  const navigate = useNavigate()
  const { session, userId } = useAuth()

  const [invitation, setInvitation] = useState(null)
  const [competition, setCompetition] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')

  const [step, setStep] = useState(1) // 1=profile, 2=questions, 3=terms, 4=confirm
  const [profileDraft, setProfileDraft] = useState(null)
  const [countries, setCountries] = useState([])
  const [cities, setCities] = useState([])
  const [answers, setAnswers] = useState({})
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [submitErr, setSubmitErr] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    loadCountries().then(setCountries).catch(() => {})
  }, [])

  useEffect(() => {
    if (!session) return
    const cid = parseInt(competitionId, 10)
    const iid = parseInt(invitationId, 10)
    Promise.all([
      api.get('/me/competitor-invitations').then(({ data }) => {
        const inv = (Array.isArray(data) ? data : []).find(i => i.id === iid)
        if (!inv) throw new Error('not_found')
        return { data: inv }
      }),
      api.get(`/competitions/${cid}`),
      api.get('/auth/me'),
    ]).then(([invRes, compRes, profileRes]) => {
      const inv = invRes.data
      if (!inv || inv.competition_id !== cid) { setLoadErr('Invitacion no encontrada'); return }
      if (inv.status === 'revoked') { setLoadErr('Esta invitacion fue revocada'); return }
      if (inv.status === 'rejected') { setLoadErr('Esta invitacion fue rechazada'); return }
      if (inv.status === 'accepted') { setDone(true); return }
      setInvitation(inv)
      setCompetition(compRes.data)
      const p = profileRes.data
      setProfile(p)
      setProfileDraft(normalizeProfileDraft(p))
    }).catch(ex => {
      setLoadErr(ex.message === 'not_found' ? 'Invitacion no encontrada' : 'No se pudo cargar la informacion')
    }).finally(() => setLoading(false))
  }, [competitionId, invitationId, session, userId])

  useEffect(() => {
    const country = profileDraft?._country
    if (!country) { setCities([]); return }
    loadCitiesByCountry(country).then(setCities).catch(() => setCities([]))
  }, [profileDraft?._country])

  const questions = useMemo(() => parseEnrollmentQuestions(competition?.enrollment_questions), [competition])
  const missingFields = useMemo(() => {
    if (!profileDraft) return []
    return getMissingParticipantProfileFields(profileDraft)
  }, [profileDraft])

  const setP = (k, v) => setProfileDraft(prev => ({ ...prev, [k]: v }))

  const handleProfileNext = () => {
    if (missingFields.length) { setSubmitErr(`Completa: ${missingFields.map(f => f.label).join(', ')}`); return }
    setSubmitErr('')
    setStep(questions.length ? 2 : 3)
  }

  const handleAnswerNext = () => {
    const missing = questions.filter(q => q.required && !String(answers[q.id] || '').trim())
    if (missing.length) { setSubmitErr(`Responde: ${missing.map(q => q.label).join(', ')}`); return }
    setSubmitErr('')
    setStep(3)
  }

  const handleSubmit = async () => {
    if (!termsAccepted) { setSubmitErr('Debes aceptar los terminos para continuar'); return }
    setSubmitErr('')
    setBusy(true)
    try {
      const selectedCountry = countries.find(c => c.code === profileDraft._country)
      const cityCountry = buildCityCountry(profileDraft._city, selectedCountry?.name || profileDraft._country)
      const profilePayload = {
        nombre: profileDraft.nombre,
        apellido: profileDraft.apellido,
        celular: profileDraft.celular,
        sexo: profileDraft.sexo,
        genero: profileDraft.genero,
        cedula: profileDraft.cedula,
        fecha_nacimiento: profileDraft.fecha_nacimiento || null,
        ciudad_pais: cityCountry || profileDraft.ciudad_pais || null,
        box: profileDraft.box || null,
        talla_camiseta: profileDraft.talla_camiseta || null,
      }
      const answersPayload = questions.map(q => ({
        question_id: q.id,
        question_label: q.label,
        question_type: q.field_type,
        answer: String(answers[q.id] || ''),
      }))
      await api.post(`/competitor-invitations/${invitationId}/complete`, {
        terms_accepted: 1,
        profile: profilePayload,
        answers: answersPayload,
        categoria: invitation?.categoria || null,
      })
      setDone(true)
    } catch (ex) {
      setSubmitErr(ex.response?.data?.detail || 'Error al confirmar la inscripcion')
    } finally {
      setBusy(false)
    }
  }

  if (!session) {
    return (
      <div style={{ minHeight: '100dvh', background: pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔐</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Inicia sesion para continuar</div>
          <div style={{ color: '#7E8796', fontSize: 14, marginBottom: 20 }}>Necesitas una cuenta para aceptar esta invitacion</div>
          <Link to="/login" style={{ display: 'inline-block', background: '#FF6B00', color: '#fff', padding: '10px 24px', borderRadius: 10, fontWeight: 800, textDecoration: 'none' }}>Ingresar</Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return <div style={{ minHeight: '100dvh', background: pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7E8796', fontSize: 14 }}>Cargando...</div>
  }

  if (loadErr) {
    return (
      <div style={{ minHeight: '100dvh', background: pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>{loadErr}</div>
          <button type="button" onClick={() => navigate('/')} style={{ background: '#252A33', border: 'none', borderRadius: 10, color: '#AAB2C0', padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}>Ir al inicio</button>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div style={{ minHeight: '100dvh', background: pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 460, width: '100%', background: '#171B21', border: '1px solid #252A33', borderRadius: 24, padding: 36, textAlign: 'center', display: 'grid', gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(94,234,212,0.12)', border: '2px solid rgba(94,234,212,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
            <CheckCircle2 size={32} color="#5EEAD4" />
          </div>
          <div style={{ fontWeight: 900, fontSize: 22, color: '#F5F7FA' }}>Inscripcion confirmada</div>
          <div style={{ color: '#AAB2C0', fontSize: 14, lineHeight: 1.6 }}>
            Ya estas inscrito en <strong style={{ color: '#F5F7FA' }}>{competition?.nombre}</strong>{invitation?.categoria ? ` — categoria ${invitation.categoria}` : ''}. ¡Buena suerte!
          </div>
          <Link to={`/competitions/${competitionId}`} style={{ display: 'inline-block', background: '#FF6B00', color: '#fff', padding: '12px 24px', borderRadius: 12, fontWeight: 800, textDecoration: 'none', fontSize: 14 }}>
            Ver competencia
          </Link>
        </div>
      </div>
    )
  }

  const steps = [
    { id: 1, label: 'Perfil' },
    ...(questions.length ? [{ id: 2, label: 'Preguntas' }] : []),
    { id: 3, label: 'Terminos' },
  ]

  return (
    <div style={{ minHeight: '100dvh', background: pageBg, padding: '28px 16px 60px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'grid', gap: 20 }}>

        {/* Header */}
        <div>
          <Link to={`/competitions/${competitionId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#AAB2C0', textDecoration: 'none', fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
            <ArrowLeft size={14} /> Volver
          </Link>
          <div style={{ fontWeight: 900, fontSize: 22, color: '#F5F7FA' }}>{competition?.nombre}</div>
          <div style={{ fontSize: 13, color: '#7E8796', marginTop: 4 }}>Inscripcion por invitacion{invitation?.categoria ? ` · ${invitation.categoria}` : ''}</div>
          {invitation?.note && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(255,107,0,0.08)', border: '1px solid rgba(255,107,0,0.2)', borderRadius: 10, fontSize: 13, color: '#FFB36F', fontStyle: 'italic' }}>
              "{invitation.note}"
            </div>
          )}
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {steps.map((s, idx) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800,
                background: step > s.id ? 'rgba(94,234,212,0.16)' : step === s.id ? '#FF6B00' : '#252A33',
                color: step > s.id ? '#5EEAD4' : step === s.id ? '#fff' : '#7E8796',
                border: `1px solid ${step > s.id ? 'rgba(94,234,212,0.3)' : step === s.id ? '#FF6B00' : '#252A33'}`,
              }}>
                {step > s.id ? <Check size={12} /> : s.id}
              </div>
              <span style={{ fontSize: 12, color: step === s.id ? '#F5F7FA' : '#7E8796', fontWeight: step === s.id ? 700 : 400 }}>{s.label}</span>
              {idx < steps.length - 1 && <div style={{ width: 20, height: 1, background: '#252A33' }} />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div style={{ background: '#171B21', border: '1px solid #252A33', borderRadius: 20, padding: 24, display: 'grid', gap: 18 }}>

          {/* Step 1: Profile */}
          {step === 1 && profileDraft && (
            <>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Completa tu perfil</div>
              <div style={{ display: 'grid', gap: 14 }}>
                {[
                  { k: 'nombre', label: 'Nombre *', type: 'text' },
                  { k: 'apellido', label: 'Apellido *', type: 'text' },
                  { k: 'celular', label: 'Celular *', type: 'tel' },
                  { k: 'cedula', label: 'Cédula *', type: 'text' },
                ].map(({ k, label, type }) => (
                  <div key={k}>
                    <label style={labelStyle}>{label}</label>
                    <input
                      style={inputStyle}
                      type={type}
                      value={profileDraft[k]}
                      onChange={e => setP(k, k === 'cedula' ? formatCedula(e.target.value) : e.target.value)}
                    />
                  </div>
                ))}
                <div>
                  <label style={labelStyle}>Género *</label>
                  <select style={inputStyle} value={profileDraft.genero} onChange={e => setP('genero', e.target.value)}>
                    <option value="">Selecciona...</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Femenino">Femenino</option>
                    <option value="No binario">No binario</option>
                    <option value="Prefiero no decir">Prefiero no decir</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Fecha de nacimiento *</label>
                  <input style={inputStyle} type="date" value={profileDraft.fecha_nacimiento} onChange={e => setP('fecha_nacimiento', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>País *</label>
                  <select style={inputStyle} value={profileDraft._country} onChange={e => { setP('_country', e.target.value); setP('_city', '') }}>
                    <option value="">Selecciona...</option>
                    {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Ciudad *</label>
                  {cities.length > 0 ? (
                    <select style={inputStyle} value={profileDraft._city} onChange={e => setP('_city', e.target.value)}>
                      <option value="">Selecciona...</option>
                      {cities.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <input style={inputStyle} type="text" value={profileDraft._city} onChange={e => setP('_city', e.target.value)} placeholder="Ciudad" />
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Box / Gym (opcional)</label>
                  <input style={inputStyle} type="text" value={profileDraft.box} onChange={e => setP('box', e.target.value)} placeholder="Nombre del gym" />
                </div>
                <div>
                  <label style={labelStyle}>Talla camiseta (opcional)</label>
                  <select style={inputStyle} value={profileDraft.talla_camiseta} onChange={e => setP('talla_camiseta', e.target.value)}>
                    <option value="">Sin especificar</option>
                    {SHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Step 2: Questions */}
          {step === 2 && (
            <>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Preguntas del evento</div>
              <div style={{ display: 'grid', gap: 14 }}>
                {questions.map(q => (
                  <div key={q.id}>
                    <label style={labelStyle}>{q.label}{q.required ? ' *' : ''}</label>
                    {q.field_type === 'textarea' ? (
                      <textarea
                        style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
                        value={answers[q.id] || ''}
                        onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder={q.placeholder || ''}
                      />
                    ) : (
                      <input
                        style={inputStyle}
                        type={q.field_type === 'number' ? 'number' : 'text'}
                        value={answers[q.id] || ''}
                        onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder={q.placeholder || ''}
                      />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Step 3: Terms */}
          {step === 3 && (
            <>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Terminos y condiciones</div>
              {competition?.enrollment_terms_text ? (
                <div style={{ background: '#0D0F12', border: '1px solid #252A33', borderRadius: 12, padding: 16, maxHeight: 280, overflowY: 'auto', fontSize: 13, color: '#AAB2C0', lineHeight: 1.7 }}>
                  {competition.enrollment_terms_text}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#7E8796' }}>Al completar tu inscripcion aceptas las condiciones del evento.</div>
              )}
              <label style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', padding: '12px 14px', background: termsAccepted ? 'rgba(94,234,212,0.06)' : 'rgba(13,15,18,0.6)', border: `1px solid ${termsAccepted ? 'rgba(94,234,212,0.28)' : '#252A33'}`, borderRadius: 12 }}>
                <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#5EEAD4', cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#F5F7FA', fontWeight: 700 }}>Acepto los terminos y condiciones</span>
              </label>
            </>
          )}

          {submitErr && (
            <div style={{ fontSize: 13, color: '#FF6B6B', background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)', borderRadius: 8, padding: '8px 12px' }}>{submitErr}</div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            {step > 1 ? (
              <button type="button" onClick={() => { setSubmitErr(''); setStep(s => s - 1) }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#252A33', border: 'none', borderRadius: 10, color: '#AAB2C0', padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                <ArrowLeft size={15} /> Atras
              </button>
            ) : <div />}

            {step < 3 ? (
              <button
                type="button"
                onClick={step === 1 ? handleProfileNext : handleAnswerNext}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FF6B00', border: 'none', borderRadius: 10, color: '#fff', padding: '10px 20px', fontWeight: 800, cursor: 'pointer', fontSize: 14 }}
              >
                Siguiente <ArrowRight size={15} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={busy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#FF6B00', border: 'none', borderRadius: 10, color: '#fff', padding: '12px 24px', fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer', fontSize: 14, opacity: busy ? 0.7 : 1 }}
              >
                {busy ? 'Confirmando...' : 'Confirmar inscripcion'}
                {!busy && <Check size={16} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
