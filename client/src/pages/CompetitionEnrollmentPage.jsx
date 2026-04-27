import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronUp, Lock, MapPin, Medal, ShieldCheck, Upload } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api/axios'
import { getHomePath, useAuth } from '../context/AuthContext'
import { COMPETITION_PAGE_MAX_WIDTH } from '../utils/competitionLayout'
import { formatCalendarDateRange } from '../utils/calendarDate'
import { buildCityCountry, loadCitiesByCountry, loadCountries, parseCityCountry } from '../utils/locations'
import { cedulaInputValue, formatCedula, getMissingParticipantProfileFields } from '../utils/participantProfile'
import DiscountInput from '../components/enrollment/DiscountInput'

const pageBg =
  'radial-gradient(circle at top, rgba(214,217,224,0.10), transparent 28%), radial-gradient(circle at 85% 20%, rgba(94,234,212,0.10), transparent 24%), #0D0F12'

function formatDateRange(start, end) {
  return formatCalendarDateRange(start, end)
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

function normalizeEnrollmentPrice(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.round(parsed))
}

function calculateEnrollmentPricing(basePrice, feeRate = 0.05, minPlatformFee = 5000) {
  const organizerPrice = normalizeEnrollmentPrice(basePrice)
  let platformFee = Math.round(organizerPrice * feeRate)
  if (organizerPrice > 0 && platformFee < minPlatformFee) platformFee = minPlatformFee
  return {
    organizerPrice,
    platformFee,
    totalPrice: organizerPrice + platformFee,
  }
}

function formatCop(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

const BOLD_BUTTON_LIBRARY_SRC = 'https://checkout.bold.co/library/boldPaymentButton.js'
const BOLD_BUTTON_LIBRARY_ID = 'bold-payment-button-library'
const ENROLLMENT_INTRO_COPY = 'Selecciona tu categoria, completa tu informacion y finaliza el pago para confirmar tu inscripcion.'
const PROFILE_FIELD_CONFIG = [
  { key: 'nombre', label: 'Nombre', type: 'text', requiredMessage: 'Completa tu nombre para continuar.' },
  { key: 'apellido', label: 'Apellido', type: 'text', requiredMessage: 'Completa tu apellido para continuar.' },
  { key: 'email', label: 'Email', type: 'email', requiredMessage: 'Completa tu email para continuar.' },
  { key: 'celular', label: 'Celular', type: 'tel', requiredMessage: 'Completa tu celular para continuar.' },
  { key: 'genero', label: 'Genero', type: 'select', requiredMessage: 'Selecciona tu genero para continuar.' },
  { key: 'cedula', label: 'Cedula', type: 'text', requiredMessage: 'Completa tu cedula para continuar.' },
  { key: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date', requiredMessage: 'Completa tu fecha de nacimiento para continuar.' },
  { key: 'ciudad_pais', label: 'Ciudad / pais', type: 'text', requiredMessage: 'Completa tu ciudad / pais para continuar.' },
]

function normalizeProfileDraft(profile) {
  const parsedCityCountry = parseCityCountry(profile?.ciudad_pais || '')
  return {
    nombre: String(profile?.nombre || '').trim(),
    apellido: String(profile?.apellido || '').trim(),
    email: String(profile?.email || '').trim(),
    celular: String(profile?.celular || '').trim(),
    genero: String(profile?.genero || profile?.sexo || '').trim(),
    cedula: cedulaInputValue(profile?.cedula),
    fecha_nacimiento: String(profile?.fecha_nacimiento || '').slice(0, 10),
    ciudad_pais: String(profile?.ciudad_pais || '').trim(),
    city: parsedCityCountry.city,
    countryCode: '',
  }
}

function profileFieldValue(profile, key) {
  if (!profile) return '-'
  if (key === 'cedula') return formatCedula(profile.cedula)
  if (key === 'fecha_nacimiento') return String(profile.fecha_nacimiento || '').slice(0, 10) || '-'
  if (key === 'genero') return String(profile.genero || profile.sexo || '').trim() || '-'
  return String(profile[key] || '').trim() || '-'
}

function isProfileDraftFieldComplete(fieldKey, profileDraft) {
  if (fieldKey === 'ciudad_pais') {
    return !!String(profileDraft?.city || '').trim() && !!String(profileDraft?.countryCode || '').trim()
  }
  const rawValue = profileDraft?.[fieldKey]
  const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue
  if (!value) return false
  if (fieldKey === 'cedula') return /^\d{6,11}$/.test(value)
  return true
}

function ensureBoldButtonLibrary({ reload = false } = {}) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(BOLD_BUTTON_LIBRARY_ID)
    if (reload && existing) existing.remove()
    if (!reload && document.getElementById(BOLD_BUTTON_LIBRARY_ID)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.id = BOLD_BUTTON_LIBRARY_ID
    script.src = BOLD_BUTTON_LIBRARY_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar el boton de Bold'))
    document.head.appendChild(script)
  })
}

function BoldPaymentButton({ config, onError, onPaymentClick }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!config || !containerRef.current) return undefined
    const containerNode = containerRef.current
    let active = true
    let observer = null
    const boundNodes = new Set()
    let clickReported = false
    const handlePaymentClick = () => {
      if (clickReported) return
      clickReported = true
      onPaymentClick?.(config.order_id)
    }
    const bindContainerInteractionHandler = () => {
      if (!containerNode) return
      containerNode.addEventListener('pointerdown', handlePaymentClick, true)
      containerNode.addEventListener('mousedown', handlePaymentClick, true)
      containerNode.addEventListener('click', handlePaymentClick, true)
    }
    const unbindContainerInteractionHandler = () => {
      if (!containerNode) return
      containerNode.removeEventListener('pointerdown', handlePaymentClick, true)
      containerNode.removeEventListener('mousedown', handlePaymentClick, true)
      containerNode.removeEventListener('click', handlePaymentClick, true)
    }
    const bindClickHandler = () => {
      if (!containerRef.current) return false
      const nodes = containerRef.current.querySelectorAll('button, a, [role="button"], iframe')
      if (!nodes.length) return false
      nodes.forEach((node) => {
        if (boundNodes.has(node)) return
        node.addEventListener('pointerdown', handlePaymentClick, { once: true })
        node.addEventListener('mousedown', handlePaymentClick, { once: true })
        node.addEventListener('click', handlePaymentClick, { once: true })
        boundNodes.add(node)
      })
      return true
    }
    const render = async () => {
      try {
        if (!active || !containerRef.current) return
        containerRef.current.innerHTML = ''
        const script = document.createElement('script')
        script.setAttribute('data-bold-button', 'dark-L')
        script.setAttribute('data-api-key', config.api_key)
        script.setAttribute('data-order-id', config.order_id)
        script.setAttribute('data-currency', config.currency)
        script.setAttribute('data-amount', config.amount)
        script.setAttribute('data-integrity-signature', config.integrity_signature)
        script.setAttribute('data-description', config.description)
        script.setAttribute('data-redirection-url', config.redirection_url)
        script.setAttribute('data-render-mode', 'embedded')
        if (config.customer_data) {
          script.setAttribute('data-customer-data', JSON.stringify(config.customer_data))
        }
        containerRef.current.appendChild(script)
        await new Promise((resolve) => window.requestAnimationFrame(resolve))
        await ensureBoldButtonLibrary({ reload: true })
        if (bindClickHandler()) return
        observer = new MutationObserver(() => {
          if (bindClickHandler() && observer) {
            observer.disconnect()
            observer = null
          }
        })
        observer.observe(containerRef.current, { childList: true, subtree: true })
      } catch (err) {
        onError?.(err)
      }
    }
    bindContainerInteractionHandler()
    render()
    return () => {
      active = false
      if (observer) observer.disconnect()
      unbindContainerInteractionHandler()
      boundNodes.forEach((node) => {
        node.removeEventListener('pointerdown', handlePaymentClick)
        node.removeEventListener('mousedown', handlePaymentClick)
        node.removeEventListener('click', handlePaymentClick)
      })
      boundNodes.clear()
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [config, onError, onPaymentClick])

  return <div ref={containerRef} />
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
6. Los archivos e imagenes que cargues podran ser revisados por el organizador del evento y por el equipo administrador de la plataforma para fines operativos y de validacion.
7. Tus datos no deben incluir informacion falsa ni de terceros sin autorizacion.

Responsabilidad y disponibilidad

8. La app facilita el proceso de registro y seguimiento, pero las condiciones operativas de cada evento y la validacion del pago dependen del evento y de Bold.
9. Podemos actualizar funciones, textos o medidas de seguridad para mejorar la operacion del servicio.
10. Si no estas de acuerdo con estos terminos, no debes continuar con el registro en la plataforma.
`.trim()

function enrollmentStateLabel(value, paymentStatus) {
  if (value === 'confirmado') return 'Ya estas inscrito en esta competencia.'
  if (value === 'pendiente') return 'Tu inscripcion ya esta registrada. Estamos actualizando el estado final.'
  if (value === 'pago_en_verificacion') {
    if (paymentStatus === 'approved') return 'Pago confirmado. Estamos activando tu inscripcion en esta competencia.'
    if (['rejected', 'failed', 'voided', 'void_rejected'].includes(paymentStatus)) return 'El pago no fue aprobado por Bold. Puedes intentarlo de nuevo mientras las inscripciones sigan abiertas.'
    return 'Estamos validando tu pago con Bold. Tu cupo se activara cuando quede confirmado.'
  }
  if (value === 'pago_pendiente') {
    if (['rejected', 'failed', 'voided', 'void_rejected'].includes(paymentStatus)) return 'El pago no fue aprobado por Bold. Puedes intentarlo de nuevo mientras las inscripciones sigan abiertas.'
    return 'Tu pago esta en proceso. Cuando Bold lo apruebe activaremos tu inscripcion automaticamente.'
  }
  if (value === 'rechazado') return 'Tu registro anterior fue rechazado. Puedes volver a intentarlo si las inscripciones siguen abiertas.'
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
        <div style={{ width: 30, height: 30, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'rgba(214,217,224,0.16)', color: '#FFB36F', fontSize: 13, fontWeight: 800 }}>{number}</div>
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
  const { session, role, userId, isAthlete } = useAuth()
  const [payload, setPayload] = useState(null)
  const [categories, setCategories] = useState([])
  const [enrollmentState, setEnrollmentState] = useState(null)
  const [paymentStatus, setPaymentStatus] = useState(null)
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentTransactionId, setPaymentTransactionId] = useState('')
  const [boldButtonConfig, setBoldButtonConfig] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [expandedCategoryId, setExpandedCategoryId] = useState(null)
  const [answers, setAnswers] = useState({})
  const [uploadingQuestionId, setUploadingQuestionId] = useState(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [syncingPayment, setSyncingPayment] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [showTermsModal, setShowTermsModal] = useState(false)
  const [pricingCfg, setPricingCfg] = useState(null)
  const [activeTermsModal, setActiveTermsModal] = useState('competition')
  const [competitionTermsScrolledToEnd, setCompetitionTermsScrolledToEnd] = useState(false)
  const [appTermsScrolledToEnd, setAppTermsScrolledToEnd] = useState(false)
  const [competitionTermsAccepted, setCompetitionTermsAccepted] = useState(false)
  const [appTermsAccepted, setAppTermsAccepted] = useState(false)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const [profileData, setProfileData] = useState(null)
  const [profileDraft, setProfileDraft] = useState(() => normalizeProfileDraft(null))
  const [profileMissingFields, setProfileMissingFields] = useState([])
  const [editableProfileFields, setEditableProfileFields] = useState([])
  const [savingProfile, setSavingProfile] = useState(false)
  const [countries, setCountries] = useState([])
  const [allCities, setAllCities] = useState([])
  const [appliedDiscount, setAppliedDiscount] = useState(null)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    api.get('/config/pricing').then(({ data }) => setPricingCfg(data)).catch(() => {})
  }, [])

  useEffect(() => {
    loadCountries().then(setCountries).catch(() => setCountries([]))
  }, [])

  useEffect(() => {
    if (!profileDraft.countryCode) {
      setAllCities([])
      return
    }
    loadCitiesByCountry(profileDraft.countryCode).then(setAllCities).catch(() => setAllCities([]))
  }, [profileDraft.countryCode])

  useEffect(() => {
    let active = true
    setLoading(true)
    setMsg(null)
    Promise.all([
      api.get(`/competitions/${competitionId}/public`),
      api.get(`/competitions/${competitionId}/categories?modality=individual`).catch(() => ({ data: [] })),
    isAthlete && userId
      ? api.get(`/users/${userId}/competitions`).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
      isAthlete ? api.get('/users/me').catch(() => ({ data: null })) : Promise.resolve({ data: null }),
    ]).then(([publicRes, categoriesRes, mineRes, profileRes]) => {
      if (!active) return
      const publicPayload = publicRes.data || null
      const categoryItems = Array.isArray(categoriesRes.data) ? categoriesRes.data : []
      const mine = Array.isArray(mineRes.data) ? mineRes.data : []
      const mineRecord = mine.find(item => String(item.id) === String(competitionId))
      const profile = profileRes.data || null
      const missingFields = isAthlete ? getMissingParticipantProfileFields(profile) : []
      setPayload(publicPayload)
      setCategories(categoryItems)
      setSelectedCategory(mineRecord?.enrollment_categoria || categoryItems[0]?.nombre || '')
      setExpandedCategoryId(categoryItems[0]?.id ?? null)
      setEnrollmentState(mineRecord?.enrollment_estado || null)
      setPaymentStatus(mineRecord?.payment_status || null)
      setPaymentReference(mineRecord?.payment_reference || '')
      setPaymentTransactionId(mineRecord?.payment_transaction_id || '')
      setProfileData(profile)
      setProfileDraft(normalizeProfileDraft(profile))
      setProfileMissingFields(missingFields)
      setEditableProfileFields(missingFields.filter((fieldKey) => fieldKey !== 'perfil'))
    }).catch((err) => {
      if (!active) return
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo cargar la informacion de inscripcion' })
    }).finally(() => {
      if (!active) return
      setLoading(false)
    })
    return () => { active = false }
  }, [competitionId, isAthlete, userId, role])

  const competition = payload?.competition || null
  const questions = useMemo(() => parseEnrollmentQuestions(competition?.enrollment_questions), [competition])
  const bannerUrl = resolveCompetitionAsset(competition, 'banner')
  const profileImageUrl = resolveCompetitionAsset(competition, 'profile')
  const selectedCategoryData = useMemo(() => categories.find(category => category.nombre === selectedCategory) || null, [categories, selectedCategory])
  const termsText = (competition?.enrollment_terms_text || '').trim()
  const appTermsText = APP_TERMS_TEXT
  const countryNameByCode = useMemo(() => Object.fromEntries(countries.map((country) => [country.code, country.name])), [countries])
  const countryCodeByName = useMemo(() => Object.fromEntries(countries.map((country) => [country.name.toLowerCase(), country.code])), [countries])
  const cityCountryComplete = !!String(profileDraft.countryCode || '').trim() && !!String(profileDraft.city || '').trim()
  const platformFeeRate = Number(pricingCfg?.default_platform_fee_rate || 0.05)
  const minPlatformFee = pricingCfg?.min_platform_fee ?? 5000
  const pricing = useMemo(() => {
    const basePrice = normalizeEnrollmentPrice(selectedCategoryData?.enrollment_price)
    const discountAmount = appliedDiscount?.discount_amount ?? 0
    const effectiveBase = Math.max(0, basePrice - discountAmount)
    return {
      ...calculateEnrollmentPricing(effectiveBase, platformFeeRate, minPlatformFee),
      originalBasePrice: basePrice,
      discountAmount,
    }
  }, [selectedCategoryData?.enrollment_price, platformFeeRate, minPlatformFee, appliedDiscount])
  const userCanSubmit = !!session && isAthlete
  const enrollmentClosed = !competition?.enrollment_open
  const paymentInProgress = enrollmentState === 'pago_pendiente' || enrollmentState === 'pago_en_verificacion'
  const submissionBlocked = enrollmentState === 'confirmado' || enrollmentState === 'pendiente' || paymentInProgress || enrollmentClosed || !userCanSubmit
  const outstandingProfileMissingFields = useMemo(() => profileMissingFields.filter((fieldKey) => {
    if (fieldKey === 'perfil') return true
    if (fieldKey === 'ciudad_pais') return !cityCountryComplete
    return !isProfileDraftFieldComplete(fieldKey, profileDraft)
  }), [cityCountryComplete, profileDraft, profileMissingFields])
  const profileFields = useMemo(() => PROFILE_FIELD_CONFIG.map(field => ({
    ...field,
    missing: outstandingProfileMissingFields.includes(field.key),
    originallyMissing: editableProfileFields.includes(field.key),
    value: profileFieldValue(profileData, field.key),
  })), [editableProfileFields, outstandingProfileMissingFields, profileData])
  const hasOrganizerQuestions = questions.length > 0
  const stepTwoBlocked = currentStep === 2 && (
    submissionBlocked
    || syncingPayment
    || checkoutLoading
    || savingProfile
    || !!uploadingQuestionId
    || outstandingProfileMissingFields.length > 0
    || questions.some((question) => question.required && !String(answers[question.id] || '').trim())
  )

  useEffect(() => {
    setSubmitted(enrollmentState === 'pendiente' || enrollmentState === 'confirmado')
  }, [enrollmentState])

  useEffect(() => {
    if (!countries.length || !profileDraft.ciudad_pais || profileDraft.countryCode) return
    const parsed = parseCityCountry(profileDraft.ciudad_pais)
    if (!parsed.countryName) return
    const inferredCountryCode = countryCodeByName[parsed.countryName.toLowerCase()] || ''
    if (!inferredCountryCode) return
    setProfileDraft((prev) => ({ ...prev, countryCode: inferredCountryCode, city: parsed.city }))
  }, [countries, countryCodeByName, profileDraft.ciudad_pais, profileDraft.countryCode])

  useEffect(() => {
    setBoldButtonConfig(null)
    setAppliedDiscount(null)
  }, [selectedCategory, competitionTermsAccepted, appTermsAccepted, JSON.stringify(answers)])

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

  const validateMissingProfileFields = () => {
    if (outstandingProfileMissingFields.includes('perfil')) {
      return 'No pudimos cargar tu perfil en este momento. Recarga la pagina para continuar.'
    }
    for (const field of PROFILE_FIELD_CONFIG) {
      if (!outstandingProfileMissingFields.includes(field.key)) continue
      if (field.key === 'ciudad_pais') {
        const city = String(profileDraft.city || '').trim()
        const countryCode = String(profileDraft.countryCode || '').trim()
        if (!city || !countryCode) return 'Selecciona pais y ciudad validos para continuar.'
        if (!allCities.includes(city)) {
          return 'La ciudad no pertenece al pais seleccionado.'
        }
        continue
      }
      const rawValue = profileDraft[field.key]
      const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue
      if (!value) return field.requiredMessage
      if (field.key === 'cedula' && !/^\d+$/.test(value)) return 'La cedula debe contener solo numeros.'
      if (field.key === 'cedula' && (value.length < 6 || value.length > 11)) return 'La cedula debe tener entre 6 y 11 numeros.'
    }
    return ''
  }

  const saveMissingProfileFields = async () => {
    const validationError = validateMissingProfileFields()
    if (validationError) {
      setMsg({ type: 'error', text: validationError })
      return false
    }
    if (!editableProfileFields.length) return true

    const profilePayload = {}
    for (const field of PROFILE_FIELD_CONFIG) {
      if (!editableProfileFields.includes(field.key)) continue
      if (field.key === 'ciudad_pais') continue
      const value = profileDraft[field.key]
      profilePayload[field.key] = typeof value === 'string' ? value.trim() : value
    }

    if (editableProfileFields.includes('ciudad_pais')) {
      const city = String(profileDraft.city || '').trim()
      const countryCode = String(profileDraft.countryCode || '').trim()
      const countryName = countryNameByCode[countryCode] || ''
      if (city && countryName) {
        profilePayload.ciudad_pais = buildCityCountry(city, countryName)
      }
    }

    if (!Object.keys(profilePayload).length) return true

    setSavingProfile(true)
    setMsg(null)
    try {
      const { data: savedProfile } = await api.patch('/users/me', profilePayload)
      setProfileData(savedProfile)
      setProfileDraft(normalizeProfileDraft(savedProfile))
      setProfileMissingFields(getMissingParticipantProfileFields(savedProfile))
      return true
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo guardar tu perfil.' })
      return false
    } finally {
      setSavingProfile(false)
    }
  }

  const validateBeforeConfirmation = () => {
    if (categories.length > 0 && !selectedCategory) return 'Selecciona una categoria para continuar.'
    if (outstandingProfileMissingFields.length) return 'Completa los datos obligatorios del atleta antes de continuar.'
    for (const question of questions) {
      const value = String(answers[question.id] || '').trim()
      if (question.required && !value) return `Responde la pregunta obligatoria: ${question.label}`
    }
    if (termsText && !competitionTermsAccepted) return 'Debes leer y aceptar los terminos y condiciones de la competencia.'
    if (appTermsText && !appTermsAccepted) return 'Debes leer y aceptar los terminos de uso de la app.'
    return ''
  }

  const validateStep = (step) => {
    if (step === 1 && categories.length > 0 && !selectedCategory) return 'Selecciona una categoria para continuar.'
    if (step === 2) {
      const profileError = validateMissingProfileFields()
      if (profileError) return profileError
      for (const question of questions) {
        const value = String(answers[question.id] || '').trim()
        if (question.required && !value) return `Responde la pregunta obligatoria: ${question.label}`
      }
    }
    if (step === 3) {
      if (termsText && !competitionTermsAccepted) return 'Debes leer y aceptar los terminos y condiciones de la competencia.'
      if (appTermsText && !appTermsAccepted) return 'Debes leer y aceptar los terminos de uso de la app.'
    }
    return ''
  }

  const goPrevStep = () => {
    setMsg(null)
    setCurrentStep(step => Math.max(1, step - 1))
  }

  const buildEnrollmentPayload = () => ({
    categoria: selectedCategory || null,
    answers: questions.map(question => ({
      question_id: question.id,
      question_label: question.label,
      question_type: question.field_type || 'text',
      answer: answers[question.id] || '',
    })),
    terms_accepted: competitionTermsAccepted && appTermsAccepted ? 1 : 0,
    discount_code: appliedDiscount?.code || null,
  })

  const syncPaymentStatus = async ({ silent = false } = {}) => {
    if (!competition) return null
    setSyncingPayment(true)
    if (!silent) setMsg(null)
    try {
      const { data } = await api.post(`/competitions/${competition.id}/payment-status/sync`)
      const nextState = data?.estado || null
      const nextPaymentStatus = data?.payment_status || null
      setEnrollmentState(nextState)
      setPaymentStatus(nextPaymentStatus)
      setPaymentReference(data?.payment_reference || '')
      setPaymentTransactionId(data?.payment_transaction_id || '')
      if (nextState === 'pendiente' || nextState === 'confirmado') {
        setMsg({ type: 'success', text: 'Pago aprobado. Tu inscripcion ya quedo confirmada.' })
      } else if (!silent) {
        const waitingMessage = ['rejected', 'failed', 'voided', 'void_rejected'].includes(nextPaymentStatus)
          ? 'Bold reporto que el pago no fue aprobado. Puedes intentarlo de nuevo.'
          : 'El pago aun no aparece aprobado en Bold. Consulta de nuevo en unos segundos.'
        setMsg({ type: 'error', text: waitingMessage })
      }
      return data
    } catch (err) {
      if (!silent) {
        setMsg({ type: 'error', text: err.response?.data?.detail || 'No se pudo consultar el estado del pago en Bold.' })
      }
      return null
    } finally {
      setSyncingPayment(false)
    }
  }

  useEffect(() => {
    if (!competition?.id || !paymentInProgress || !userCanSubmit) return
    syncPaymentStatus({ silent: true })
  }, [competition?.id, paymentInProgress, userCanSubmit])

  const prepareBoldCheckout = async () => {
    if (!competition) return false
    const validationError = validateBeforeConfirmation()
    if (validationError) {
      setMsg({ type: 'error', text: validationError })
      return false
    }
    if (!selectedCategoryData) {
      setMsg({ type: 'error', text: 'Selecciona una categoria antes de pagar.' })
      return false
    }
    if (pricing.totalPrice <= 0) {
      setMsg({ type: 'error', text: 'Esta categoria no tiene un precio de inscripcion valido.' })
      return false
    }
    setCheckoutLoading(true)
    setMsg(null)
    try {
      const { data } = await api.post(`/competitions/${competition.id}/bold-checkout`, buildEnrollmentPayload())
      setPaymentStatus(null)
      setPaymentReference('')
      setPaymentTransactionId('')
      setBoldButtonConfig(data || null)
      return true
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || err.message || 'No se pudo preparar el pago con Bold.' })
      return false
    } finally {
      setCheckoutLoading(false)
    }
  }

  const markBoldIntentAsStarted = async (reference) => {
    if (!competition?.id) return
    const refValue = String(reference || '').trim()
    if (!refValue) return
    try {
      await api.post(`/competitions/${competition.id}/bold-intent/activate`, { reference: refValue })
    } catch {
      // Ignorado: el webhook/sync sigue siendo la fuente final de estado.
    }
  }

  const handleNextStep = async () => {
    const validationError = validateStep(currentStep)
    if (validationError) {
      setMsg({ type: 'error', text: validationError })
      return
    }
    if (currentStep === 2) {
      const saved = await saveMissingProfileFields()
      if (!saved) return
    }
    if (currentStep === 3 && !paymentInProgress && !boldButtonConfig) {
      const ready = await prepareBoldCheckout()
      if (!ready) return
    }
    setMsg(null)
    setCurrentStep(step => Math.min(4, step + 1))
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
          <Link to={`/leaderboard/${competition.id}`} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 14, background: 'linear-gradient(135deg, #D6D9E0 0%, #F1F4F8 100%)', color: '#0D0F12', fontWeight: 800 }}>
            Ver leaderboard
            <ArrowRight size={16} />
          </Link>
        </div>

        <section style={{ position: 'relative', overflow: 'hidden', borderRadius: 28, border: '1px solid rgba(37,42,51,0.96)', background: bannerUrl ? `linear-gradient(180deg, rgba(13,15,18,0.2), rgba(13,15,18,0.84)), url("${bannerUrl}") center/cover` : 'linear-gradient(135deg, rgba(214,217,224,0.22), rgba(94,234,212,0.12) 55%, rgba(23,27,33,0.98) 100%)', padding: isMobile ? '20px 18px 22px' : 'clamp(24px, 5vw, 42px)', boxShadow: '0 20px 70px rgba(0,0,0,0.28)', marginBottom: 18 }}>
          <div style={{ maxWidth: 860 }}>
            {profileImageUrl ? <div style={{ width: isMobile ? 84 : 96, height: isMobile ? 84 : 96, borderRadius: 24, background: `#0D0F12 url("${profileImageUrl}") center/cover no-repeat`, border: '1px solid rgba(245,247,250,0.18)', boxShadow: '0 10px 30px rgba(0,0,0,0.24)', marginBottom: 16 }} /> : null}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: 'rgba(9,11,14,0.7)', border: `1px solid ${competition.enrollment_open ? '#5EEAD466' : '#7E879666'}`, color: '#F5F7FA', fontSize: 12, fontWeight: 800, marginBottom: 16, flexWrap: 'wrap' }}>
              <ShieldCheck size={14} color={competition.enrollment_open ? '#5EEAD4' : '#7E8796'} />
              {competition.enrollment_open ? 'Inscripciones abiertas' : 'Inscripciones cerradas'}
            </span>
            <h1 style={{ margin: 0, fontSize: isMobile ? 34 : 'clamp(34px, 6vw, 60px)', lineHeight: 0.95 }}>Registro a {competition.nombre}</h1>
            <p style={{ margin: '14px 0 0', maxWidth: 720, color: '#D7DEE8', fontSize: isMobile ? 14 : 16, lineHeight: 1.7 }}>
              {ENROLLMENT_INTRO_COPY}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 999, background: 'rgba(9,11,14,0.62)', border: '1px solid #252A33', color: '#F5F7FA', fontSize: 13 }}><MapPin size={14} color="#5EEAD4" />{competition.lugar || 'Lugar por confirmar'}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 999, background: 'rgba(9,11,14,0.62)', border: '1px solid #252A33', color: '#F5F7FA', fontSize: 13 }}><CalendarDays size={14} color="#5EEAD4" />{formatDateRange(competition.enrollment_start, competition.enrollment_end)}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 999, background: 'rgba(9,11,14,0.62)', border: '1px solid #252A33', color: '#F5F7FA', fontSize: 13 }}><Medal size={14} color="#5EEAD4" />{categories.length || 0} categorias disponibles</span>
            </div>
          </div>
        </section>

        {msg ? <div style={{ borderRadius: 18, border: `1px solid ${msg.type === 'success' ? 'rgba(94,234,212,0.32)' : 'rgba(214,217,224,0.32)'}`, background: msg.type === 'success' ? 'rgba(94,234,212,0.08)' : 'rgba(214,217,224,0.08)', padding: '14px 16px', color: '#F5F7FA', fontSize: 14, marginBottom: 18 }}>{msg.text}{submitted ? <div style={{ marginTop: 10 }}><button type="button" className="btn-secondary btn-sm" onClick={() => navigate('/profile')}>Ir a mi perfil</button></div> : null}</div> : null}

        {submitted ? (
          <section style={{ borderRadius: 24, border: '1px solid rgba(94,234,212,0.28)', background: 'linear-gradient(180deg, rgba(94,234,212,0.08), rgba(23,27,33,0.96))', padding: isMobile ? 18 : 24 }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ color: '#8DF1E4', fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                Pago aprobado
              </div>
              <div style={{ color: '#F5F7FA', fontSize: isMobile ? 24 : 30, fontWeight: 800, lineHeight: 1.05 }}>
                Tu inscripcion quedo confirmada.
              </div>
              <div style={{ color: '#D7DEE8', fontSize: 14, lineHeight: 1.7 }}>
                Bold aprobo el pago y FinalRep activo tu cupo en esta competencia.
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
                <div key={step} style={{ width: 30, height: 30, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, background: step === currentStep ? 'linear-gradient(135deg, #D6D9E0 0%, #F1F4F8 100%)' : 'rgba(255,255,255,0.06)', color: step === currentStep ? '#0D0F12' : '#F5F7FA', border: step === currentStep ? 'none' : '1px solid #252A33' }}>
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
                      <div key={category.id} style={{ borderRadius: 18, border: `1px solid ${isSelected ? 'rgba(94,234,212,0.55)' : '#252A33'}`, background: isSelected ? 'linear-gradient(180deg, rgba(94,234,212,0.08), rgba(13,15,18,0.72))' : 'rgba(13,15,18,0.62)', overflow: 'hidden' }}>
                        <button type="button" onClick={() => { setSelectedCategory(category.nombre); setExpandedCategoryId(prev => (prev === category.id ? null : category.id)) }} style={{ width: '100%', background: 'transparent', border: 'none', color: 'inherit', padding: '16px', textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                            <div>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 800 }}>{category.nombre}</span>
                                {isSelected ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 999, background: 'rgba(94,234,212,0.16)', color: '#8DF1E4', fontSize: 11, fontWeight: 800 }}><Check size={12} />Seleccionada</span> : null}
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 999, background: 'rgba(214,217,224,0.14)', color: '#FFB36F', fontSize: 11, fontWeight: 800 }}>
                                  {formatCop(calculateEnrollmentPricing(category.enrollment_price, platformFeeRate, minPlatformFee).totalPrice)}
                                </span>
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
              ) : <div style={{ borderRadius: 18, border: '1px solid #252A33', background: 'rgba(13,15,18,0.6)', padding: 16, color: '#AAB2C0', fontSize: 14 }}>Esta competencia no tiene categorias configuradas. Tu inscripcion se registrara sin categoria.</div>}
            </StepCard>
          ) : null}

          {currentStep === 2 ? (
            <StepCard number="2" title="Completar inscripcion" hint="Revisa tus datos, completa lo que falta y responde las preguntas necesarias para continuar.">
              <div style={{ display: 'grid', gap: 18 }}>
                <section style={{ borderRadius: 20, border: '1px solid #252A33', background: 'rgba(13,15,18,0.46)', padding: 18, display: 'grid', gap: 14 }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ color: '#F5F7FA', fontSize: 18, fontWeight: 800 }}>Datos del atleta</div>
                    <div style={{ color: '#AAB2C0', fontSize: 13, lineHeight: 1.6 }}>
                      Los datos ya registrados quedan bloqueados. Solo debes completar lo que falta para continuar.
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    {profileFields.map((field) => (
                      <div key={field.key} style={{ borderRadius: 16, border: `1px solid ${field.missing ? 'rgba(255,107,0,0.38)' : 'rgba(94,234,212,0.18)'}`, background: field.missing ? 'rgba(255,107,0,0.08)' : 'linear-gradient(180deg, rgba(94,234,212,0.08), rgba(255,255,255,0.02))', boxShadow: field.missing ? 'none' : 'inset 0 1px 0 rgba(94,234,212,0.08)', padding: 14, display: 'grid', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ color: '#AAB2C0', fontSize: 12, fontWeight: 700 }}>{field.label}</div>
                          {!field.originallyMissing ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 999, background: 'rgba(94,234,212,0.14)', color: '#8DF1E4', fontSize: 11, fontWeight: 800 }}>
                              <CheckCircle2 size={12} />
                              Registrado
                            </span>
                          ) : field.missing ? null : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 999, background: 'rgba(94,234,212,0.14)', color: '#8DF1E4', fontSize: 11, fontWeight: 800 }}>
                              <CheckCircle2 size={12} />
                              Listo
                            </span>
                          )}
                        </div>
                        {field.originallyMissing ? (
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            {field.key === 'ciudad_pais' ? (
                              <div style={{ display: 'grid', gap: 10 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(180px, 220px) minmax(0, 1fr)', gap: 10 }}>
                                  <select
                                    value={profileDraft.countryCode || ''}
                                    onChange={(e) => {
                                      const nextCountryCode = e.target.value
                                      setProfileDraft((prev) => ({
                                        ...prev,
                                        countryCode: nextCountryCode,
                                        city: '',
                                        ciudad_pais: '',
                                      }))
                                    }}
                                  >
                                    <option value="">Pais</option>
                                    {countries.map((country) => (
                                      <option key={country.code} value={country.code}>{country.name}</option>
                                    ))}
                                  </select>
                                  <select
                                    value={profileDraft.city || ''}
                                    onChange={(e) => {
                                      const nextCity = e.target.value
                                      setProfileDraft((prev) => ({
                                        ...prev,
                                        city: nextCity,
                                        ciudad_pais: nextCity && prev.countryCode ? buildCityCountry(nextCity, countryNameByCode[prev.countryCode] || '') : '',
                                      }))
                                    }}
                                    disabled={!profileDraft.countryCode || !allCities.length}
                                  >
                                    <option value="">{profileDraft.countryCode ? 'Ciudad / pais' : 'Selecciona primero el pais'}</option>
                                    {allCities.map((city) => (
                                      <option key={city} value={city}>{city}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            ) : field.type === 'select' ? (
                              <select value={profileDraft[field.key] || ''} onChange={(e) => setProfileDraft(prev => ({ ...prev, [field.key]: e.target.value }))}>
                                <option value="">Selecciona una opcion</option>
                                <option value="M">M</option>
                                <option value="F">F</option>
                                <option value="Otro">Otro</option>
                              </select>
                            ) : (
                              <input
                                type={field.type}
                                value={profileDraft[field.key] || ''}
                                onChange={(e) => {
                                  const nextValue = field.key === 'cedula' ? e.target.value.replace(/[^\d]/g, '') : e.target.value
                                  setProfileDraft(prev => ({ ...prev, [field.key]: nextValue }))
                                }}
                                inputMode={field.key === 'cedula' || field.key === 'celular' ? 'numeric' : undefined}
                                placeholder={field.label}
                                minLength={field.key === 'cedula' ? 6 : undefined}
                                maxLength={field.key === 'cedula' ? 11 : undefined}
                              />
                            )}
                            <div style={{ color: field.missing ? '#FFB36F' : '#8DF1E4', fontSize: 12 }}>
                              {field.key === 'cedula' && field.missing
                                ? 'Necesario para continuar. Usa entre 6 y 11 numeros.'
                                : field.key === 'ciudad_pais' && field.missing
                                  ? 'Necesario para continuar. Elige una ciudad valida del pais seleccionado.'
                                  : (field.missing ? 'Necesario para continuar' : 'Listo para continuar')}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 800, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                              {field.value}
                            </div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#AAB2C0', fontSize: 12, fontWeight: 600 }}>
                              <Lock size={12} color="#8DF1E4" />
                              Bloqueado en esta inscripcion
                            </div>
                            <div style={{ color: '#AAB2C0', fontSize: 12, lineHeight: 1.5 }}>
                              Estos datos ya estaban registrados. Si necesitas corregirlos, hazlo desde tu perfil.
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <section style={{ borderRadius: 20, border: '1px solid #252A33', background: 'rgba(13,15,18,0.46)', padding: 18, display: 'grid', gap: 14 }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ color: '#F5F7FA', fontSize: 18, fontWeight: 800 }}>Preguntas de la competencia</div>
                    <div style={{ color: '#AAB2C0', fontSize: 13, lineHeight: 1.6 }}>
                      {hasOrganizerQuestions ? 'Responde las preguntas definidas por el organizador. Los campos marcados con * son obligatorios.' : 'No hay preguntas adicionales para esta competencia.'}
                    </div>
                  </div>
                  {questions.length ? (
                    <div style={{ display: 'grid', gap: 14 }}>
                      {questions.map((question) => (
                        <div key={question.id} className="form-group" style={{ marginBottom: 0 }}>
                          <label>{question.label}{question.required ? ' *' : ''}</label>
                          {question.field_type === 'image' ? (
                            <div style={{ display: 'grid', gap: 10 }}>
                              <label htmlFor={`upload-${question.id}`} style={{ borderRadius: 16, border: '1px dashed #3B4452', background: 'rgba(13,15,18,0.55)', padding: '16px 14px', display: 'flex', alignItems: 'center', gap: 10, color: '#D7DEE8', cursor: 'pointer' }}>
                                <Upload size={16} color="#5EEAD4" />
                                <span>{uploadingQuestionId === question.id ? 'Subiendo imagen...' : 'Seleccionar imagen'}</span>
                              </label>
                              <input id={`upload-${question.id}`} type="file" accept="image/*" onChange={e => uploadAnswerImage(question, e.target.files?.[0])} required={!!question.required && !answers[question.id]} />
                              <div style={{ color: '#AAB2C0', fontSize: 12 }}>{answers[question.id] ? 'Imagen cargada correctamente.' : (question.placeholder || 'Sube una imagen clara y legible.')}</div>
                              {answers[question.id] ? <a href={answers[question.id]} target="_blank" rel="noreferrer" style={{ color: '#5EEAD4', fontSize: 12 }}>Ver archivo cargado</a> : null}
                            </div>
                          ) : question.field_type === 'number' ? (
                            <input
                              value={answers[question.id] || ''}
                              onChange={e => setAnswers(prev => ({ ...prev, [question.id]: e.target.value.replace(/[^\d]/g, '') }))}
                              placeholder={question.placeholder || ''}
                              inputMode="numeric"
                              required={!!question.required}
                            />
                          ) : (
                            <input value={answers[question.id] || ''} onChange={e => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))} placeholder={question.placeholder || ''} required={!!question.required} />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(255,255,255,0.02)', padding: 14, color: '#AAB2C0', fontSize: 14 }}>
                      No hay preguntas adicionales para esta competencia.
                    </div>
                  )}
                </section>
              </div>
            </StepCard>
          ) : null}

          {currentStep === 3 ? (
            <StepCard number="3" title="Terminos y condiciones" hint="Debes abrirlos, leerlos y aceptarlos para continuar con la inscripcion.">
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
                      <CheckCircle2 size={14} color={competitionTermsAccepted ? '#5EEAD4' : '#AAB2C0'} />
                      {competitionTermsAccepted ? 'Terminos de competencia aceptados' : 'Competencia pendiente'}
                    </div>
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" className="btn-secondary" onClick={() => { setActiveTermsModal('app'); setAppTermsScrolledToEnd(false); setShowTermsModal(true) }}>Ver terminos de la app</button>
                  <div style={{ color: appTermsAccepted ? '#8DF1E4' : '#AAB2C0', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={14} color={appTermsAccepted ? '#5EEAD4' : '#AAB2C0'} />
                    {appTermsAccepted ? 'Terminos de la app aceptados' : 'App pendiente'}
                  </div>
                </div>
              </div>
            </StepCard>
          ) : null}

          {currentStep === 4 ? (
            <StepCard number="4" title="Pago de inscripcion" hint="FinalRep te redirige al checkout seguro de Bold. Cuando el pago quede aprobado, tu inscripcion se confirma automaticamente.">
              <div style={{ display: 'grid', gap: 14 }}>
                {!selectedCategoryData ? (
                  <div style={{ borderRadius: 16, border: '1px solid rgba(214,217,224,0.28)', background: 'rgba(214,217,224,0.08)', padding: 14, color: '#F5F7FA', fontSize: 14 }}>
                    Selecciona una categoria para habilitar el pago.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ borderRadius: 18, border: '1px solid #252A33', background: 'rgba(13,15,18,0.58)', padding: 16, display: 'grid', gap: 12 }}>
                      <div style={{ color: '#F5F7FA', fontWeight: 800, fontSize: 16 }}>{selectedCategoryData.nombre}</div>

                      {!boldButtonConfig && !paymentInProgress ? (
                        <div>
                          <div style={{ color: '#AAB2C0', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Codigo de descuento (opcional)</div>
                          <DiscountInput
                            competitionId={competition.id}
                            categoria={selectedCategory}
                            applied={appliedDiscount}
                            onApply={(result) => { setAppliedDiscount(result); setBoldButtonConfig(null) }}
                            onClear={() => { setAppliedDiscount(null); setBoldButtonConfig(null) }}
                          />
                        </div>
                      ) : null}

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${pricing.discountAmount > 0 ? 4 : 3}, minmax(0, 1fr))`, gap: 10 }}>
                        <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(255,255,255,0.02)', padding: 12 }}>
                          <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 4 }}>Precio inscripcion</div>
                          <div style={{ color: pricing.discountAmount > 0 ? '#7E8796' : '#F5F7FA', fontSize: 16, fontWeight: 800, textDecoration: pricing.discountAmount > 0 ? 'line-through' : 'none' }}>{formatCop(pricing.originalBasePrice)}</div>
                          {pricing.discountAmount > 0 ? <div style={{ color: '#F5F7FA', fontSize: 15, fontWeight: 800 }}>{formatCop(pricing.organizerPrice)}</div> : null}
                        </div>
                        {pricing.discountAmount > 0 ? (
                          <div style={{ borderRadius: 14, border: '1px solid rgba(94,234,212,0.28)', background: 'rgba(94,234,212,0.06)', padding: 12 }}>
                            <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 4 }}>Descuento ({appliedDiscount?.code})</div>
                            <div style={{ color: '#8DF1E4', fontSize: 16, fontWeight: 800 }}>-{formatCop(pricing.discountAmount)}</div>
                          </div>
                        ) : null}
                        <div style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(255,255,255,0.02)', padding: 12 }}>
                          <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 4 }}>Comision FinalRep</div>
                          <div style={{ color: '#FFB36F', fontSize: 16, fontWeight: 800 }}>{formatCop(pricing.platformFee)}</div>
                        </div>
                        <div style={{ borderRadius: 14, border: '1px solid rgba(94,234,212,0.24)', background: 'rgba(94,234,212,0.08)', padding: 12 }}>
                          <div style={{ color: '#AAB2C0', fontSize: 11, marginBottom: 4 }}>Total a pagar</div>
                          <div style={{ color: '#8DF1E4', fontSize: 18, fontWeight: 900 }}>{formatCop(pricing.totalPrice)}</div>
                        </div>
                      </div>
                      <div style={{ color: '#AAB2C0', fontSize: 13, lineHeight: 1.6 }}>
                        El pago se procesa en Bold. FinalRep calcula automaticamente la comision de plataforma sobre el valor base de la categoria.
                      </div>
                      {paymentReference && paymentInProgress ? (
                        <div style={{ display: 'grid', gap: 6, borderRadius: 14, border: '1px solid #252A33', background: 'rgba(255,255,255,0.02)', padding: 12 }}>
                          <div style={{ color: '#AAB2C0', fontSize: 11 }}>Referencia</div>
                          <div style={{ color: '#F5F7FA', fontSize: 13, fontWeight: 700, wordBreak: 'break-word' }}>{paymentReference}</div>
                          {paymentTransactionId ? <div style={{ color: '#AAB2C0', fontSize: 12 }}>Transaccion Bold: {paymentTransactionId}</div> : null}
                        </div>
                      ) : null}
                      {boldButtonConfig ? (
                        <div style={{ display: 'grid', gap: 10 }}>
                          <BoldPaymentButton
                            config={boldButtonConfig}
                            onPaymentClick={markBoldIntentAsStarted}
                            onError={(err) => setMsg({ type: 'error', text: err.message || 'No se pudo cargar el boton de Bold.' })}
                          />
                          <div style={{ color: '#AAB2C0', fontSize: 12, lineHeight: 1.5 }}>
                            Completa el pago con Bold. Solo cuando Bold confirme la transaccion activaremos la inscripcion.
                          </div>
                        </div>
                      ) : paymentInProgress ? (
                        <div style={{ color: '#AAB2C0', fontSize: 13, lineHeight: 1.6 }}>
                          Estamos validando el estado de tu pago. Esta vista se actualizara automaticamente cuando llegue la confirmacion.
                        </div>
                      ) : (
                        <div style={{ color: '#AAB2C0', fontSize: 13 }}>
                          {checkoutLoading ? 'Cargando boton de Bold...' : 'Estamos preparando el checkout de Bold...'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </StepCard>
          ) : null}

          <section style={{ borderRadius: 24, border: '1px solid #252A33', background: '#171B21', padding: 22 }}>
              {!session ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ borderRadius: 16, border: '1px solid rgba(214,217,224,0.28)', background: 'rgba(214,217,224,0.08)', padding: 14, color: '#F5F7FA', fontSize: 14 }}>
                    Debes iniciar sesion como participante para completar la inscripcion.
                  </div>
                  <button type="button" className="btn-primary" onClick={() => navigate('/login')}>Iniciar sesion</button>
                </div>
              ) : !isAthlete ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ borderRadius: 16, border: '1px solid rgba(214,217,224,0.28)', background: 'rgba(214,217,224,0.08)', padding: 14, color: '#F5F7FA', fontSize: 14 }}>
                    Solo las cuentas de participante pueden inscribirse en competencias.
                  </div>
                  <button type="button" className="btn-secondary" onClick={() => navigate(getHomePath(role))}>Ir a mi panel</button>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {enrollmentStateLabel(enrollmentState, paymentStatus) ? (
                    <div
                      style={{
                        borderRadius: 16,
                        border: `1px solid ${
                          enrollmentState === 'rechazado' || ['rejected', 'failed', 'voided', 'void_rejected'].includes(paymentStatus)
                            ? 'rgba(255,69,58,0.28)'
                            : 'rgba(94,234,212,0.22)'
                        }`,
                        background: enrollmentState === 'rechazado' || ['rejected', 'failed', 'voided', 'void_rejected'].includes(paymentStatus)
                          ? 'rgba(255,69,58,0.08)'
                          : 'rgba(94,234,212,0.08)',
                        padding: 14,
                        color: '#F5F7FA',
                        fontSize: 14,
                      }}
                    >
                      {enrollmentStateLabel(enrollmentState, paymentStatus)}
                    </div>
                  ) : null}
                  {enrollmentClosed ? <div style={{ borderRadius: 16, border: '1px solid rgba(126,135,150,0.24)', background: 'rgba(126,135,150,0.08)', padding: 14, color: '#D7DEE8', fontSize: 14 }}>Las inscripciones estan cerradas en este momento.</div> : null}
                  {savingProfile ? <div style={{ borderRadius: 16, border: '1px solid rgba(255,107,0,0.24)', background: 'rgba(255,107,0,0.08)', padding: 14, color: '#F5F7FA', fontSize: 14 }}>Guardando datos del atleta...</div> : null}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" className="btn-secondary" onClick={goPrevStep} disabled={currentStep === 1 || syncingPayment || checkoutLoading || savingProfile}>Anterior</button>
                    {currentStep < 4 ? (
                      <button type="button" className="btn-primary" onClick={handleNextStep} disabled={(currentStep === 2 ? stepTwoBlocked : submissionBlocked || syncingPayment || checkoutLoading || savingProfile || !!uploadingQuestionId)}>Siguiente</button>
                    ) : null}
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
                  <CheckCircle2 size={16} color={(activeTermsModal === 'competition' ? competitionTermsAccepted : appTermsAccepted) ? '#5EEAD4' : '#AAB2C0'} />
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

      </div>
    </div>
  )
}
