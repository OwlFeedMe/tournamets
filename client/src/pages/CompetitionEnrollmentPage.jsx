import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronUp, MapPin, Medal, ShieldCheck, Upload } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api/axios'
import { getHomePath, useAuth } from '../context/AuthContext'
import { COMPETITION_PAGE_MAX_WIDTH } from '../utils/competitionLayout'

const pageBg =
  'radial-gradient(circle at top, rgba(255,107,0,0.18), transparent 28%), radial-gradient(circle at 85% 20%, rgba(0,194,168,0.12), transparent 24%), #0D0F12'

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function formatDateRange(start, end) {
  const startLabel = formatDate(start)
  const endLabel = formatDate(end)
  if (!startLabel && !endLabel) return 'Fechas por confirmar'
  if (!startLabel) return `Hasta ${endLabel}`
  if (!endLabel) return `Desde ${startLabel}`
  return `${startLabel} - ${endLabel}`
}

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

function parseEnrollmentPaymentMethods(raw) {
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed.map((item, idx) => ({
      id: String(item?.id || `pm_${idx + 1}`),
      label: String(item?.label || '').trim(),
      account_name: String(item?.account_name || '').trim(),
      account_number: String(item?.account_number || '').trim(),
      notes: String(item?.notes || '').trim(),
    })).filter(item => item.label || item.account_name || item.account_number || item.notes)
  } catch {
    return []
  }
}

function parseScheduleItems(raw) {
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed.map((item, idx) => ({
      id: String(item?.id || `date_${idx + 1}`),
      label: String(item?.label || '').trim(),
      start_at: item?.start_at || null,
      end_at: item?.end_at || null,
      note: String(item?.note || '').trim(),
    })).filter(item => item.label || item.start_at || item.end_at || item.note)
  } catch {
    return []
  }
}

function resolveCompetitionAsset(competition, asset) {
  if (!competition) return ''
  const profile = competition.profile_image_url || ''
  const banner = competition.banner_image_url || ''
  const desktop = competition.banner_desktop_url || ''
  const mobile = competition.banner_mobile_url || ''
  const legacy = competition.imagen_url || ''
  if (asset === 'profile') return profile || legacy
  if (asset === 'banner') return banner || desktop || mobile || legacy
  return legacy
}

const APP_TERMS_TEXT = `
Uso de la app

1. Esta plataforma se ofrece para consultar competencias, gestionar inscripciones y revisar resultados.
2. Debes usar informacion veraz, completa y actualizada al registrarte o participar en un evento.
3. No debes usar la app para suplantar identidad, alterar resultados, cargar archivos fraudulentos o afectar el funcionamiento del servicio.
4. El acceso a ciertas funciones depende del rol asignado a tu cuenta y del estado de cada competencia.

Datos personales

5. Autorizas el tratamiento de los datos que diligencias en la app para gestionar tu cuenta, tu inscripcion, validar informacion del evento y comunicarnos contigo sobre tu participacion.
6. Los archivos e imagenes que cargues, incluido el comprobante de pago cuando aplique, podran ser revisados por el organizador del evento y por el equipo administrador de la plataforma para fines operativos y de validacion.
7. Tus datos no deben incluir informacion falsa ni de terceros sin autorizacion.

Responsabilidad y disponibilidad

8. La app facilita el proceso de registro y seguimiento, pero las condiciones de cada evento, aprobacion de solicitudes y validacion final dependen del organizador.
9. Podemos actualizar funciones, textos o medidas de seguridad para mejorar la operacion del servicio.
10. Si no estas de acuerdo con estos terminos, no debes continuar con el registro en la plataforma.
`.trim()

function enrollmentStateLabel(value) {
  if (value === 'confirmado') return 'Ya estas inscrito en esta competencia.'
  if (value === 'pendiente') return 'Tu solicitud ya fue enviada y esta pendiente de revision.'
  if (value === 'rechazado') return 'Tu solicitud anterior fue rechazada. Puedes volver a intentarlo si las inscripciones siguen abiertas.'
  return ''
}

function Modal({ title, onClose, children, width = 760 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(18px + env(safe-area-inset-top, 0px)) 12px calc(18px + env(safe-area-inset-bottom, 0px))' }}>
      <div style={{ width: '100%', maxWidth: width, maxHeight: '100%', overflow: 'hidden', borderRadius: 24, border: '1px solid #252A33', background: '#171B21', boxShadow: '0 24px 80px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '18px 20px', borderBottom: '1px solid #252A33' }}>
          <div style={{ color: '#F5F7FA', fontSize: 18, fontWeight: 800 }}>{title}</div>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>Cerrar</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function StepCard({ number, title, hint, children }) {
  return (
    <section style={{ borderRadius: 24, border: '1px solid #252A33', background: '#171B21', padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'rgba(255,107,0,0.16)', color: '#FFB36F', fontSize: 13, fontWeight: 800 }}>{number}</div>
        <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.05 }}>{title}</h2>
      </div>
      {hint ? <div style={{ color: '#AAB2C0', fontSize: 14, lineHeight: 1.6, marginBottom: 14 }}>{hint}</div> : null}
      {children}
    </section>
  )
}

function TermsContent({ text, onReachedEnd }) {
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      const node = document.getElementById('terms-scroll-container')
      if (!node) return
      if (node.scrollHeight <= node.clientHeight + 2) onReachedEnd()
    })
    return () => window.cancelAnimationFrame(id)
  }, [onReachedEnd, text])

  return (
    <div
      id="terms-scroll-container"
      onScroll={(e) => {
        const node = e.currentTarget
        if (node.scrollTop + node.clientHeight >= node.scrollHeight - 12) onReachedEnd()
      }}
      style={{ maxHeight: '42vh', overflowY: 'auto', borderRadius: 18, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 18, color: '#D7DEE8', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}
    >
      {text}
    </div>
  )
}

export default function CompetitionEnrollmentPage() {
  const { competitionId } = useParams()
  const navigate = useNavigate()
  const { session, role, participantId } = useAuth()
  const [payload, setPayload] = useState(null)
  const [categories, setCategories] = useState([])
  const [enrollmentState, setEnrollmentState] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [expandedCategoryId, setExpandedCategoryId] = useState(null)
  const [answers, setAnswers] = useState({})
  const [paymentReceiptUrl, setPaymentReceiptUrl] = useState('')
  const [uploadingQuestionId, setUploadingQuestionId] = useState(null)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [showTermsModal, setShowTermsModal] = useState(false)
  const [activeTermsModal, setActiveTermsModal] = useState('competition')
  const [competitionTermsScrolledToEnd, setCompetitionTermsScrolledToEnd] = useState(false)
  const [appTermsScrolledToEnd, setAppTermsScrolledToEnd] = useState(false)
  const [competitionTermsAccepted, setCompetitionTermsAccepted] = useState(false)
  const [appTermsAccepted, setAppTermsAccepted] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setMsg(null)
    Promise.all([
      api.get(`/competitions/${competitionId}/public`),
      api.get(`/competitions/${competitionId}/categories?modality=individual`).catch(() => ({ data: [] })),
      role === 'user' && participantId
        ? api.get(`/participants/${participantId}/competitions`).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
    ]).then(([publicRes, categoriesRes, mineRes]) => {
      if (!active) return
      const publicPayload = publicRes.data || null
      const categoryItems = Array.isArray(categoriesRes.data) ? categoriesRes.data : []
      const mine = Array.isArray(mineRes.data) ? mineRes.data : []
      const mineRecord = mine.find(item => String(item.id) === String(competitionId))
      setPayload(publicPayload)
      setCategories(categoryItems)
      setSelectedCategory(mineRecord?.enrollment_categoria || categoryItems[0]?.nombre || '')
      setExpandedCategoryId(categoryItems[0]?.id ?? null)
      setEnrollmentState(mineRecord?.enrollment_estado || null)
    }).catch((err) => {
      if (!active) return
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo cargar la informacion de inscripcion' })
    }).finally(() => {
      if (!active) return
      setLoading(false)
    })
    return () => { active = false }
  }, [competitionId, participantId, role])

  const competition = payload?.competition || null
  const questions = useMemo(() => parseEnrollmentQuestions(competition?.enrollment_questions), [competition])
  const paymentMethods = useMemo(() => parseEnrollmentPaymentMethods(competition?.enrollment_payment_methods), [competition])
  const bannerUrl = resolveCompetitionAsset(competition, 'banner')
  const profileImageUrl = resolveCompetitionAsset(competition, 'profile')
  const selectedCategoryData = useMemo(() => categories.find(category => category.nombre === selectedCategory) || null, [categories, selectedCategory])
  const termsText = (competition?.enrollment_terms_text || '').trim()
  const appTermsText = APP_TERMS_TEXT
  const requirePaymentReceipt = !!competition?.require_payment_receipt
  const userCanSubmit = !!session && role === 'user'
  const enrollmentClosed = !competition?.enrollment_open
  const submissionBlocked = enrollmentState === 'confirmado' || enrollmentState === 'pendiente' || enrollmentClosed || !userCanSubmit

  const questionAnswers = useMemo(() => (
    questions.map(question => ({
      id: question.id,
      label: question.label,
      value: answers[question.id] || '',
      type: question.field_type || 'text',
    }))
  ), [answers, questions])

  const uploadEnrollmentImage = async (file, onSuccess, onState) => {
    if (!file) return ''
    onState(true)
    setMsg(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post('/enrollment-answers/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const url = data?.url || ''
      onSuccess(url)
      return url
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo subir la imagen' })
      return ''
    } finally {
      onState(false)
    }
  }

  const uploadAnswerImage = async (question, file) => {
    setUploadingQuestionId(question.id)
    await uploadEnrollmentImage(file, (url) => setAnswers(prev => ({ ...prev, [question.id]: url })), () => {})
    setUploadingQuestionId(null)
  }

  const uploadReceiptImage = async (file) => {
    await uploadEnrollmentImage(file, setPaymentReceiptUrl, setUploadingReceipt)
  }

  const validateBeforeConfirmation = () => {
    if (categories.length > 0 && !selectedCategory) return 'Selecciona una categoria para continuar.'
    for (const question of questions) {
      const value = String(answers[question.id] || '').trim()
      if (question.required && !value) return `Responde la pregunta obligatoria: ${question.label}`
    }
    if (termsText && !competitionTermsAccepted) return 'Debes leer y aceptar los terminos y condiciones de la competencia.'
    if (appTermsText && !appTermsAccepted) return 'Debes leer y aceptar los terminos de uso de la app.'
    if (requirePaymentReceipt && !paymentReceiptUrl) return 'Debes adjuntar el comprobante de pago.'
    return ''
  }

  const validateStep = (step) => {
    if (step === 1 && categories.length > 0 && !selectedCategory) return 'Selecciona una categoria para continuar.'
    if (step === 2) {
      for (const question of questions) {
        const value = String(answers[question.id] || '').trim()
        if (question.required && !value) return `Responde la pregunta obligatoria: ${question.label}`
      }
    }
    if (step === 3) {
      if (termsText && !competitionTermsAccepted) return 'Debes leer y aceptar los terminos y condiciones de la competencia.'
      if (appTermsText && !appTermsAccepted) return 'Debes leer y aceptar los terminos de uso de la app.'
    }
    if (step === 5 && requirePaymentReceipt && !paymentReceiptUrl) return 'Debes adjuntar el comprobante de pago.'
    return ''
  }

  const goNextStep = () => {
    const validationError = validateStep(currentStep)
    if (validationError) {
      setMsg({ type: 'error', text: validationError })
      return
    }
    setMsg(null)
    setCurrentStep(step => Math.min(4, step + 1))
  }

  const goPrevStep = () => {
    setMsg(null)
    setCurrentStep(step => Math.max(1, step - 1))
  }

  const submit = async () => {
    if (!competition || submissionBlocked) return
    const validationError = validateBeforeConfirmation()
    if (validationError) {
      setMsg({ type: 'error', text: validationError })
      setShowConfirmModal(false)
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      await api.post(`/competitions/${competition.id}/enroll`, {
        categoria: selectedCategory || null,
        answers: questions.map(question => ({
          question_id: question.id,
          question_label: question.label,
          question_type: question.field_type || 'text',
          answer: answers[question.id] || '',
        })),
        payment_receipt_url: paymentReceiptUrl || null,
        terms_accepted: competitionTermsAccepted && appTermsAccepted ? 1 : 0,
      })
      setSubmitted(true)
      setEnrollmentState('pendiente')
      setShowConfirmModal(false)
      setMsg({ type: 'success', text: 'Solicitud enviada correctamente. El organizador la revisara.' })
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo enviar la solicitud' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ minHeight: '100vh', background: pageBg, color: '#AAB2C0', padding: '28px 18px' }}>Cargando pagina de inscripcion...</div>
  if (!competition) return <div style={{ minHeight: '100vh', background: pageBg, color: '#F5F7FA', padding: '28px 18px' }}>{msg?.text || 'No se encontro la competencia.'}</div>

  return (
    <div style={{ minHeight: '100vh', background: pageBg, color: '#F5F7FA' }}>
      <div style={{ maxWidth: COMPETITION_PAGE_MAX_WIDTH, margin: '0 auto', padding: isMobile ? '16px 14px 56px' : '24px 18px 72px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
          <Link to={`/competitions/${competition.id}`} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, border: '1px solid #252A33', color: '#F5F7FA', background: 'rgba(13,15,18,0.4)' }}>
            <ArrowLeft size={16} />
            Volver a la competencia
          </Link>
          <Link to={`/leaderboard/${competition.id}`} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 14, background: 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)', color: '#0D0F12', fontWeight: 800 }}>
            Ver leaderboard
            <ArrowRight size={16} />
          </Link>
        </div>

        <section style={{ position: 'relative', overflow: 'hidden', borderRadius: 28, border: '1px solid rgba(37,42,51,0.96)', background: bannerUrl ? `linear-gradient(180deg, rgba(13,15,18,0.2), rgba(13,15,18,0.84)), url("${bannerUrl}") center/cover` : 'linear-gradient(135deg, rgba(255,107,0,0.22), rgba(0,194,168,0.12) 55%, rgba(23,27,33,0.98) 100%)', padding: isMobile ? '20px 18px 22px' : 'clamp(24px, 5vw, 42px)', boxShadow: '0 20px 70px rgba(0,0,0,0.28)', marginBottom: 18 }}>
          <div style={{ maxWidth: 860 }}>
            {profileImageUrl ? <div style={{ width: isMobile ? 84 : 96, height: isMobile ? 84 : 96, borderRadius: 24, background: `#0D0F12 url("${profileImageUrl}") center/cover no-repeat`, border: '1px solid rgba(245,247,250,0.18)', boxShadow: '0 10px 30px rgba(0,0,0,0.24)', marginBottom: 16 }} /> : null}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: 'rgba(9,11,14,0.7)', border: `1px solid ${competition.enrollment_open ? '#00C2A866' : '#7E879666'}`, color: '#F5F7FA', fontSize: 12, fontWeight: 800, marginBottom: 16, flexWrap: 'wrap' }}>
              <ShieldCheck size={14} color={competition.enrollment_open ? '#00C2A8' : '#7E8796'} />
              {competition.enrollment_open ? 'Inscripciones abiertas' : 'Inscripciones cerradas'}
            </span>
            <h1 style={{ margin: 0, fontSize: isMobile ? 34 : 'clamp(34px, 6vw, 60px)', lineHeight: 0.95 }}>Registro a {competition.nombre}</h1>
            <p style={{ margin: '14px 0 0', maxWidth: 720, color: '#D7DEE8', fontSize: isMobile ? 14 : 16, lineHeight: 1.7 }}>
              {(competition.enrollment_intro_text || competition.descripcion || '').trim() || 'Selecciona tu categoria, completa tu informacion y envia la solicitud al organizador.'}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 999, background: 'rgba(9,11,14,0.62)', border: '1px solid #252A33', color: '#F5F7FA', fontSize: 13 }}><MapPin size={14} color="#00C2A8" />{competition.lugar || 'Lugar por confirmar'}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 999, background: 'rgba(9,11,14,0.62)', border: '1px solid #252A33', color: '#F5F7FA', fontSize: 13 }}><CalendarDays size={14} color="#00C2A8" />{formatDateRange(competition.enrollment_start, competition.enrollment_end)}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 999, background: 'rgba(9,11,14,0.62)', border: '1px solid #252A33', color: '#F5F7FA', fontSize: 13 }}><Medal size={14} color="#00C2A8" />{categories.length || 0} categorias disponibles</span>
            </div>
          </div>
        </section>

        {msg ? <div style={{ borderRadius: 18, border: `1px solid ${msg.type === 'success' ? 'rgba(0,194,168,0.32)' : 'rgba(255,107,0,0.32)'}`, background: msg.type === 'success' ? 'rgba(0,194,168,0.08)' : 'rgba(255,107,0,0.08)', padding: '14px 16px', color: '#F5F7FA', fontSize: 14, marginBottom: 18 }}>{msg.text}{submitted ? <div style={{ marginTop: 10 }}><button type="button" className="btn-secondary btn-sm" onClick={() => navigate('/profile')}>Ir a mi perfil</button></div> : null}</div> : null}

        {submitted ? (
          <section style={{ borderRadius: 24, border: '1px solid rgba(0,194,168,0.28)', background: 'linear-gradient(180deg, rgba(0,194,168,0.08), rgba(23,27,33,0.96))', padding: isMobile ? 18 : 24 }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ color: '#8DF1E4', fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                Solicitud enviada
              </div>
              <div style={{ color: '#F5F7FA', fontSize: isMobile ? 24 : 30, fontWeight: 800, lineHeight: 1.05 }}>
                Tu registro fue enviado correctamente.
              </div>
              <div style={{ color: '#D7DEE8', fontSize: 14, lineHeight: 1.7 }}>
                El organizador revisara tu solicitud y recibiras una notificacion cuando sea confirmada o rechazada.
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                <button type="button" className="btn-secondary" onClick={() => navigate('/profile')}>
                  Ir a mi perfil
                </button>
                <Link
                  to="/"
                  style={{
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: '1px solid #252A33',
                    color: '#F5F7FA',
                    fontWeight: 700,
                  }}
                >
                  Volver al inicio
                </Link>
              </div>
            </div>
          </section>
        ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ borderRadius: 18, border: '1px solid #252A33', background: '#171B21', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ color: '#AAB2C0', fontSize: 13 }}>Paso {currentStep} de 4</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4].map((step) => (
                <div key={step} style={{ width: 30, height: 30, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, background: step === currentStep ? 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)' : 'rgba(255,255,255,0.06)', color: step === currentStep ? '#0D0F12' : '#F5F7FA', border: step === currentStep ? 'none' : '1px solid #252A33' }}>
                  {step}
                </div>
              ))}
            </div>
          </div>

          {currentStep === 1 ? (
            <StepCard number="1" title="Elegir categoria" hint="Revisa cada descripcion y selecciona la categoria que mejor corresponda a tu inscripcion.">
              {categories.length ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {categories.map((category) => {
                    const isSelected = selectedCategory === category.nombre
                    const isExpanded = expandedCategoryId === category.id
                    return (
                      <div key={category.id} style={{ borderRadius: 18, border: `1px solid ${isSelected ? 'rgba(0,194,168,0.55)' : '#252A33'}`, background: isSelected ? 'linear-gradient(180deg, rgba(0,194,168,0.08), rgba(13,15,18,0.72))' : 'rgba(13,15,18,0.62)', overflow: 'hidden' }}>
                        <button type="button" onClick={() => { setSelectedCategory(category.nombre); setExpandedCategoryId(prev => (prev === category.id ? null : category.id)) }} style={{ width: '100%', background: 'transparent', border: 'none', color: 'inherit', padding: '16px', textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                            <div>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 800 }}>{category.nombre}</span>
                                {isSelected ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 999, background: 'rgba(0,194,168,0.16)', color: '#8DF1E4', fontSize: 11, fontWeight: 800 }}><Check size={12} />Seleccionada</span> : null}
                              </div>
                              <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
                                {category.descripcion?.trim() ? (category.descripcion.length > 120 ? `${category.descripcion.slice(0, 119)}...` : category.descripcion) : 'Sin descripcion adicional.'}
                              </div>
                            </div>
                            {isExpanded ? <ChevronUp size={18} color="#AAB2C0" /> : <ChevronDown size={18} color="#AAB2C0" />}
                          </div>
                        </button>
                        {isExpanded ? <div style={{ padding: '0 16px 16px', color: '#D7DEE8', fontSize: 14, lineHeight: 1.65 }}>{category.descripcion?.trim() || 'Esta categoria no tiene descripcion ampliada.'}</div> : null}
                      </div>
                    )
                  })}
                </div>
              ) : <div style={{ borderRadius: 18, border: '1px solid #252A33', background: 'rgba(13,15,18,0.6)', padding: 16, color: '#AAB2C0', fontSize: 14 }}>Esta competencia no tiene categorias configuradas. Tu solicitud se registrara sin categoria.</div>}
            </StepCard>
          ) : null}

          {currentStep === 2 ? (
            <StepCard number="2" title="Completar preguntas" hint="Responde las preguntas definidas por el organizador. Los campos marcados con * son obligatorios.">
              <div style={{ display: 'grid', gap: 14 }}>
                {questions.map((question) => (
                  <div key={question.id} className="form-group" style={{ marginBottom: 0 }}>
                    <label>{question.label}{question.required ? ' *' : ''}</label>
                    {question.field_type === 'image' ? (
                      <div style={{ display: 'grid', gap: 10 }}>
                        <label htmlFor={`upload-${question.id}`} style={{ borderRadius: 16, border: '1px dashed #3B4452', background: 'rgba(13,15,18,0.55)', padding: '16px 14px', display: 'flex', alignItems: 'center', gap: 10, color: '#D7DEE8', cursor: 'pointer' }}>
                          <Upload size={16} color="#00C2A8" />
                          <span>{uploadingQuestionId === question.id ? 'Subiendo imagen...' : 'Seleccionar imagen'}</span>
                        </label>
                        <input id={`upload-${question.id}`} type="file" accept="image/*" onChange={e => uploadAnswerImage(question, e.target.files?.[0])} required={!!question.required && !answers[question.id]} />
                        <div style={{ color: '#AAB2C0', fontSize: 12 }}>{answers[question.id] ? 'Imagen cargada correctamente.' : (question.placeholder || 'Sube una imagen clara y legible.')}</div>
                        {answers[question.id] ? <a href={answers[question.id]} target="_blank" rel="noreferrer" style={{ color: '#00C2A8', fontSize: 12 }}>Ver archivo cargado</a> : null}
                      </div>
                    ) : (
                      <input value={answers[question.id] || ''} onChange={e => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))} placeholder={question.placeholder || ''} required={!!question.required} />
                    )}
                  </div>
                ))}
                {!questions.length ? <div style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.6)', padding: 14, color: '#AAB2C0', fontSize: 14 }}>Esta competencia no tiene preguntas adicionales.</div> : null}
              </div>
            </StepCard>
          ) : null}

          {currentStep === 3 ? (
            <StepCard number="3" title="Terminos y condiciones" hint="Debes abrirlos, leerlos y aceptarlos para continuar con la solicitud.">
              <div style={{ display: 'grid', gap: 12 }}>
                {termsText ? (
                  <div style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 14, color: '#D7DEE8', fontSize: 14, lineHeight: 1.6 }}>
                    El evento tiene terminos y condiciones obligatorios. Al abrir el modal podras leerlos completos y confirmar tu aceptacion.
                  </div>
                ) : (
                  <div style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.6)', padding: 14, color: '#AAB2C0', fontSize: 14 }}>
                    El organizador no configuro terminos propios para este evento, pero aun debes aceptar los terminos de uso de la app.
                  </div>
                )}
                {termsText ? (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" className="btn-secondary" onClick={() => { setActiveTermsModal('competition'); setCompetitionTermsScrolledToEnd(false); setShowTermsModal(true) }}>Ver terminos de la competencia</button>
                    <div style={{ color: competitionTermsAccepted ? '#8DF1E4' : '#AAB2C0', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <CheckCircle2 size={14} color={competitionTermsAccepted ? '#00C2A8' : '#AAB2C0'} />
                      {competitionTermsAccepted ? 'Terminos de competencia aceptados' : 'Competencia pendiente'}
                    </div>
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" className="btn-secondary" onClick={() => { setActiveTermsModal('app'); setAppTermsScrolledToEnd(false); setShowTermsModal(true) }}>Ver terminos de la app</button>
                  <div style={{ color: appTermsAccepted ? '#8DF1E4' : '#AAB2C0', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={14} color={appTermsAccepted ? '#00C2A8' : '#AAB2C0'} />
                    {appTermsAccepted ? 'Terminos de la app aceptados' : 'App pendiente'}
                  </div>
                </div>
              </div>
            </StepCard>
          ) : null}

          {currentStep === 4 ? (
            <StepCard number="4" title="Metodos de pago y comprobante" hint="Revisa a donde realizar el pago. Si el evento exige comprobante, cargalo aqui antes de enviar la solicitud.">
              <div style={{ display: 'grid', gap: 14 }}>
                {paymentMethods.length ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {paymentMethods.map((method) => (
                      <div key={method.id} style={{ borderRadius: 18, border: '1px solid #252A33', background: 'rgba(13,15,18,0.58)', padding: 14 }}>
                        <div style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 14 }}>{method.label || 'Metodo de pago'}</div>
                        {method.account_name ? <div style={{ color: '#D7DEE8', fontSize: 13, marginTop: 8 }}>Titular: <b style={{ color: '#F5F7FA' }}>{method.account_name}</b></div> : null}
                        {method.account_number ? <div style={{ color: '#D7DEE8', fontSize: 13, marginTop: 4 }}>Cuenta: <b style={{ color: '#F5F7FA' }}>{method.account_number}</b></div> : null}
                        {method.notes ? <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 8, lineHeight: 1.55 }}>{method.notes}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : <div style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.6)', padding: 14, color: '#AAB2C0', fontSize: 14 }}>El organizador no ha publicado metodos de pago para esta competencia.</div>}

                {requirePaymentReceipt ? (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Comprobante de pago *</label>
                    <div style={{ display: 'grid', gap: 10 }}>
                      <label htmlFor="payment-receipt-upload" style={{ borderRadius: 16, border: '1px dashed #3B4452', background: 'rgba(13,15,18,0.55)', padding: '16px 14px', display: 'flex', alignItems: 'center', gap: 10, color: '#D7DEE8', cursor: 'pointer' }}>
                        <Upload size={16} color="#00C2A8" />
                        <span>{uploadingReceipt ? 'Subiendo comprobante...' : 'Seleccionar comprobante'}</span>
                      </label>
                      <input
                        id="payment-receipt-upload"
                        type="file"
                        accept="image/*"
                        onChange={e => uploadReceiptImage(e.target.files?.[0])}
                        style={{ display: 'none' }}
                      />
                      <div style={{ color: '#AAB2C0', fontSize: 12 }}>{paymentReceiptUrl ? 'Comprobante cargado correctamente.' : 'Debes subir el comprobante de pago para completar la solicitud.'}</div>
                      {paymentReceiptUrl ? <a href={paymentReceiptUrl} target="_blank" rel="noreferrer" style={{ color: '#00C2A8', fontSize: 12 }}>Ver comprobante cargado</a> : null}
                    </div>
                  </div>
                ) : <div style={{ borderRadius: 16, border: '1px solid rgba(0,194,168,0.22)', background: 'rgba(0,194,168,0.08)', padding: 14, color: '#D7DEE8', fontSize: 14 }}>Este evento no exige comprobante de pago obligatorio.</div>}
              </div>
            </StepCard>
          ) : null}

          <section style={{ borderRadius: 24, border: '1px solid #252A33', background: '#171B21', padding: 22 }}>
              {!session ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ borderRadius: 16, border: '1px solid rgba(255,107,0,0.28)', background: 'rgba(255,107,0,0.08)', padding: 14, color: '#F5F7FA', fontSize: 14 }}>
                    Debes iniciar sesion como participante para enviar la solicitud.
                  </div>
                  <button type="button" className="btn-primary" onClick={() => navigate('/login')}>Iniciar sesion</button>
                </div>
              ) : role !== 'user' ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ borderRadius: 16, border: '1px solid rgba(255,107,0,0.28)', background: 'rgba(255,107,0,0.08)', padding: 14, color: '#F5F7FA', fontSize: 14 }}>
                    Solo las cuentas de participante pueden inscribirse en competencias.
                  </div>
                  <button type="button" className="btn-secondary" onClick={() => navigate(getHomePath(role))}>Ir a mi panel</button>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {enrollmentStateLabel(enrollmentState) ? (
                    <div
                      style={{
                        borderRadius: 16,
                        border: `1px solid ${enrollmentState === 'rechazado' ? 'rgba(255,69,58,0.28)' : 'rgba(0,194,168,0.22)'}`,
                        background: enrollmentState === 'rechazado' ? 'rgba(255,69,58,0.08)' : 'rgba(0,194,168,0.08)',
                        padding: 14,
                        color: '#F5F7FA',
                        fontSize: 14,
                      }}
                    >
                      {enrollmentStateLabel(enrollmentState)}
                    </div>
                  ) : null}
                  {enrollmentClosed ? <div style={{ borderRadius: 16, border: '1px solid rgba(126,135,150,0.24)', background: 'rgba(126,135,150,0.08)', padding: 14, color: '#D7DEE8', fontSize: 14 }}>Las inscripciones estan cerradas en este momento.</div> : null}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" className="btn-secondary" onClick={goPrevStep} disabled={currentStep === 1 || saving}>Anterior</button>
                    {currentStep < 4 ? (
                      <button type="button" className="btn-primary" onClick={goNextStep} disabled={saving || submissionBlocked || uploadingReceipt || !!uploadingQuestionId}>Siguiente</button>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={saving || submissionBlocked || uploadingReceipt || !!uploadingQuestionId}
                        onClick={() => {
                          const validationError = validateBeforeConfirmation()
                          if (validationError) {
                            setMsg({ type: 'error', text: validationError })
                            return
                          }
                          setShowConfirmModal(true)
                        }}
                      >
                        {enrollmentState === 'rechazado' ? 'Revisar y reenviar solicitud' : 'Revisar y enviar solicitud'}
                      </button>
                    )}
                  </div>
                </div>
              )}
          </section>
        </div>
        )}

        {showTermsModal ? (
          <Modal title={activeTermsModal === 'competition' ? 'Terminos y condiciones de la competencia' : 'Terminos de uso de la app'} onClose={() => setShowTermsModal(false)}>
            <div style={{ padding: 20, display: 'grid', gap: 16, overflowY: 'auto' }}>
              <div style={{ color: '#AAB2C0', fontSize: 14, lineHeight: 1.6 }}>Desplaza hasta el final para habilitar la aceptacion.</div>
              <TermsContent
                text={activeTermsModal === 'competition' ? termsText : appTermsText}
                onReachedEnd={() => {
                  if (activeTermsModal === 'competition') setCompetitionTermsScrolledToEnd(true)
                  else setAppTermsScrolledToEnd(true)
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ color: (activeTermsModal === 'competition' ? competitionTermsAccepted : appTermsAccepted) ? '#8DF1E4' : '#AAB2C0', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={16} color={(activeTermsModal === 'competition' ? competitionTermsAccepted : appTermsAccepted) ? '#00C2A8' : '#AAB2C0'} />
                  {(activeTermsModal === 'competition' ? competitionTermsAccepted : appTermsAccepted)
                    ? 'Terminos aceptados'
                    : ((activeTermsModal === 'competition' ? competitionTermsScrolledToEnd : appTermsScrolledToEnd) ? 'Ya puedes confirmar la lectura' : 'Lee hasta el final para continuar')}
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!(activeTermsModal === 'competition' ? competitionTermsScrolledToEnd : appTermsScrolledToEnd)}
                  onClick={() => {
                    if (activeTermsModal === 'competition') setCompetitionTermsAccepted(true)
                    else setAppTermsAccepted(true)
                    setShowTermsModal(false)
                  }}
                >
                  Confirmar lectura y aceptar
                </button>
              </div>
            </div>
          </Modal>
        ) : null}

        {showConfirmModal ? (
          <Modal title="Confirmar solicitud" onClose={() => !saving && setShowConfirmModal(false)} width={820}>
            <div style={{ padding: 20, display: 'grid', gap: 16, overflowY: 'auto' }}>
              <div style={{ color: '#AAB2C0', fontSize: 14, lineHeight: 1.6 }}>Revisa la informacion antes de enviar. Esta accion registrara tu solicitud para revision del organizador.</div>
              <div style={{ borderRadius: 18, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 16 }}>
                <div style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 15 }}>Categoria</div>
                <div style={{ color: '#D7DEE8', fontSize: 14, marginTop: 8 }}>{selectedCategoryData?.nombre || 'Sin categoria'}</div>
                {selectedCategoryData?.descripcion ? <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>{selectedCategoryData.descripcion}</div> : null}
              </div>
              <div style={{ borderRadius: 18, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 16 }}>
                <div style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 15 }}>Respuestas</div>
                <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                  {questionAnswers.length ? questionAnswers.map((item) => (
                    <div key={item.id} style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(255,255,255,0.02)', padding: 12 }}>
                      <div style={{ color: '#F5F7FA', fontSize: 14, fontWeight: 700 }}>{item.label}</div>
                      <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>{item.type === 'image' ? (item.value ? 'Imagen cargada correctamente.' : 'Sin archivo adjunto.') : (item.value || 'Sin respuesta')}</div>
                    </div>
                  )) : <div style={{ color: '#AAB2C0', fontSize: 13 }}>No hay preguntas adicionales.</div>}
                </div>
              </div>
              <div style={{ borderRadius: 18, border: '1px solid #252A33', background: 'rgba(13,15,18,0.62)', padding: 16, display: 'grid', gap: 10 }}>
                <div style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 15 }}>Validaciones</div>
                <div style={{ color: competitionTermsAccepted || !termsText ? '#8DF1E4' : '#FFB36F', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}><CheckCircle2 size={14} />{termsText ? (competitionTermsAccepted ? 'Terminos de competencia aceptados' : 'Terminos de competencia pendientes') : 'Sin terminos de competencia obligatorios'}</div>
                <div style={{ color: appTermsAccepted ? '#8DF1E4' : '#FFB36F', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}><CheckCircle2 size={14} />{appTermsAccepted ? 'Terminos de la app aceptados' : 'Terminos de la app pendientes'}</div>
                <div style={{ color: !requirePaymentReceipt || paymentReceiptUrl ? '#8DF1E4' : '#FFB36F', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}><CheckCircle2 size={14} />{requirePaymentReceipt ? (paymentReceiptUrl ? 'Comprobante de pago adjunto' : 'Falta comprobante de pago') : 'Sin comprobante obligatorio'}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn-secondary" onClick={() => setShowConfirmModal(false)} disabled={saving}>Volver</button>
                <button type="button" className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Enviando solicitud...' : 'Confirmar y enviar'}</button>
              </div>
            </div>
          </Modal>
        ) : null}
      </div>
    </div>
  )
}
