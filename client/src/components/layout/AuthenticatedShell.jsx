import { useEffect, useMemo, useState } from 'react'
import { Bell, ChevronRight, LogOut, Mail, Phone, Upload } from 'lucide-react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BottomDock } from './BottomDock'
import { DesktopHeader } from './DesktopHeader'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/axios'

const IUBENDA_SCRIPT_SRC = 'https://cdn.iubenda.com/iubenda.js'
const footerLegalLinks = [
  {
    href: 'https://www.iubenda.com/privacy-policy/54305130',
    label: 'Política de Privacidad',
  },
  {
    href: 'https://www.iubenda.com/privacy-policy/54305130/cookie-policy',
    label: 'Política de Cookies',
  },
]

function NotificationSheet({ open, onClose, session, displayName, items = [], busyActionId = '', onAction = null }) {
  const fallbackItems = useMemo(() => {
    if (session) {
      return [
        {
          title: 'Competencias y resultados',
          text: 'Aqui veras avisos de aperturas, cambios de evento y movimientos relevantes del leaderboard.',
          tone: 'neutral',
        },
        {
          title: 'Tu cuenta',
          text: `Las notificaciones personalizadas apareceran aqui para ${displayName || 'tu perfil'}.`,
          tone: 'neutral',
        },
      ]
    }
    return [
      {
        title: 'Novedades de eventos',
        text: 'Consulta aperturas, nuevas competencias visibles y cambios importantes del calendario.',
        tone: 'neutral',
      },
      {
        title: 'Acceso personal',
        text: 'Ingresa para recibir notificaciones asociadas a tu perfil y a tus competencias.',
        tone: 'neutral',
      },
    ]
  }, [displayName, session])
  const renderedItems = items.length ? items : fallbackItems

  if (!open) return null

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar notificaciones"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.56)',
          border: 'none',
          zIndex: 69,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notificaciones"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 70,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'calc(20px + env(safe-area-inset-top, 0px)) 12px calc(20px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 460,
            borderRadius: 24,
            border: '1px solid var(--oa-border)',
            background: 'rgba(23, 26, 32, 0.98)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 28px 80px rgba(0, 0, 0, 0.38)',
            padding: 18,
            maxHeight: '100%',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ color: 'var(--oa-text)', fontWeight: 800, fontSize: 18 }}>Notificaciones</div>
              <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, marginTop: 4 }}>
                {session ? 'Avisos de tu cuenta y de las competencias activas.' : 'Novedades generales y acceso personal.'}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: '1px solid rgba(37,42,51,0.96)',
                background: 'transparent',
                color: 'var(--oa-text)',
                borderRadius: 12,
                padding: '8px 10px',
                fontWeight: 700,
              }}
            >
              Cerrar
            </button>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {renderedItems.map((item, idx) => (
              <div
                key={`${item.title}-${idx}`}
                style={{
                  borderRadius: 18,
                  border: `1px solid ${item.tone === 'danger' ? 'rgba(255,69,58,0.28)' : item.tone === 'success' ? 'rgba(94,234,212,0.28)' : 'var(--oa-border)'}`,
                  background: item.tone === 'danger' ? 'rgba(255,69,58,0.08)' : item.tone === 'success' ? 'rgba(94,234,212,0.08)' : 'rgba(13,15,18,0.5)',
                  padding: 14,
                }}
              >
                <div style={{ color: 'var(--oa-text)', fontWeight: 700 }}>{item.title}</div>
                <div style={{ color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.6, marginTop: 6 }}>{item.text}</div>
                {Array.isArray(item.actions) && item.actions.length ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {item.actions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        disabled={busyActionId === action.id}
                        onClick={() => onAction && onAction(action)}
                        style={{
                          borderRadius: 999,
                          border: `1px solid ${action.tone === 'danger' ? 'rgba(239,68,68,0.28)' : action.tone === 'secondary' ? 'var(--oa-border)' : 'rgba(255,107,0,0.32)'}`,
                          background: action.tone === 'danger' ? 'rgba(239,68,68,0.12)' : action.tone === 'secondary' ? 'rgba(13,15,18,0.64)' : 'rgba(255,107,0,0.16)',
                          color: 'var(--oa-text)',
                          padding: '8px 12px',
                          fontWeight: 800,
                          fontSize: 12,
                        }}
                      >
                        {busyActionId === action.id ? 'Procesando...' : action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {!session && (
            <div style={{ marginTop: 14 }}>
              <Link
                to="/login"
                onClick={onClose}
                style={{
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--oa-primary)',
                  fontWeight: 800,
                }}
              >
                Ir a ingresar
                <ChevronRight size={16} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function PendingQuestionsModal({
  task,
  draft,
  onChange,
  onUpload,
  uploadingQuestionId,
  saving,
  error,
  onClose,
  onSubmit,
}) {
  useEffect(() => {
    if (!task) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.dispatchEvent(new CustomEvent('finalrep:overlay-visibility', { detail: { open: true } }))
    return () => {
      document.body.style.overflow = previousOverflow
      window.dispatchEvent(new CustomEvent('finalrep:overlay-visibility', { detail: { open: false } }))
    }
  }, [task])

  if (!task) return null
  const questions = Array.isArray(task.questions) ? task.questions : []

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Completar preguntas"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(0,0,0,0.68)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'calc(14px + env(safe-area-inset-top, 0px)) 12px calc(14px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 540,
          maxHeight: 'calc(100dvh - 28px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 20,
          border: '1px solid var(--oa-border)',
          background: '#171B21',
          color: 'var(--oa-text)',
          boxShadow: '0 28px 80px rgba(0,0,0,0.42)',
        }}
      >
        <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', padding: '16px 18px', borderBottom: '1px solid var(--oa-border)', background: 'rgba(23,27,33,0.98)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 900 }}>Completa datos del evento</div>
            <div style={{ color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>{task.competition_name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: '1px solid var(--oa-border)', background: 'rgba(13,15,18,0.64)', color: 'var(--oa-text)', borderRadius: 12, padding: '8px 10px', fontWeight: 800 }}
          >
            Cerrar
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ overflowY: 'auto', padding: 18, display: 'grid', gap: 14 }}>
          <div style={{ color: 'var(--oa-text-secondary)', fontSize: 13, lineHeight: 1.55 }}>
            El organizador necesita esta informacion para confirmar datos operativos del evento.
          </div>
          {questions.map((question) => (
            <div key={question.id} style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 800 }}>
                {question.label}{question.required ? ' *' : ''}
              </label>
              {question.field_type === 'image' ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <label htmlFor={`pending-question-upload-${question.id}`} style={{ borderRadius: 14, border: '1px dashed #3B4452', background: 'rgba(13,15,18,0.55)', padding: '14px', display: 'flex', alignItems: 'center', gap: 10, color: '#D7DEE8', cursor: 'pointer' }}>
                    <Upload size={16} color="#00C2A8" />
                    <span>{uploadingQuestionId === question.id ? 'Subiendo imagen...' : 'Seleccionar imagen'}</span>
                  </label>
                  <input
                    id={`pending-question-upload-${question.id}`}
                    type="file"
                    accept="image/*"
                    onChange={(event) => onUpload(question, event.target.files?.[0])}
                    required={!!question.required && !draft[question.id]}
                  />
                  <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12 }}>{draft[question.id] ? 'Imagen cargada correctamente.' : (question.placeholder || 'Sube una imagen clara y legible.')}</div>
                  {draft[question.id] ? <a href={draft[question.id]} target="_blank" rel="noreferrer" style={{ color: '#00C2A8', fontSize: 12 }}>Ver archivo cargado</a> : null}
                </div>
              ) : question.field_type === 'number' ? (
                <input
                  value={draft[question.id] || ''}
                  onChange={(event) => onChange(question.id, event.target.value.replace(/[^\d]/g, ''))}
                  placeholder={question.placeholder || ''}
                  inputMode="numeric"
                  required={!!question.required}
                  style={{ border: '1px solid var(--oa-border)', background: '#0D0F12', color: 'var(--oa-text)', borderRadius: 12, padding: '12px 13px' }}
                />
              ) : (
                <input
                  value={draft[question.id] || ''}
                  onChange={(event) => onChange(question.id, event.target.value)}
                  placeholder={question.placeholder || ''}
                  required={!!question.required}
                  style={{ border: '1px solid var(--oa-border)', background: '#0D0F12', color: 'var(--oa-text)', borderRadius: 12, padding: '12px 13px' }}
                />
              )}
            </div>
          ))}
          {error ? <div style={{ color: '#FCA5A5', fontSize: 13, lineHeight: 1.5 }}>{error}</div> : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ border: '1px solid var(--oa-border)', background: 'rgba(13,15,18,0.64)', color: 'var(--oa-text)', borderRadius: 12, padding: '10px 14px', fontWeight: 800 }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving || !!uploadingQuestionId} style={{ border: '1px solid rgba(255,107,0,0.32)', background: '#FF6B00', color: '#0D0F12', borderRadius: 12, padding: '10px 14px', fontWeight: 900 }}>
              {saving ? 'Guardando...' : 'Guardar respuestas'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function AuthenticatedShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, displayName, signOut, userId, role, isAthlete, persistSession: persistAuthSession } = useAuth()
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [notificationItems, setNotificationItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationActionBusyId, setNotificationActionBusyId] = useState('')
  const [pendingQuestionTask, setPendingQuestionTask] = useState(null)
  const [pendingQuestionDraft, setPendingQuestionDraft] = useState({})
  const [pendingQuestionSaving, setPendingQuestionSaving] = useState(false)
  const [pendingQuestionUploadId, setPendingQuestionUploadId] = useState('')
  const [pendingQuestionError, setPendingQuestionError] = useState('')
  const [notificationsRefreshTick, setNotificationsRefreshTick] = useState(0)
  const isLoginRoute = location.pathname === '/login'
  const topInset = isMobile
    ? 'calc(68px + env(safe-area-inset-top, 0px))'
    : '72px'
  const bottomInset = isMobile ? 'calc(112px + env(safe-area-inset-bottom, 0px))' : '0px'
  const contentMinHeight = isMobile
    ? `calc(100dvh - ${topInset} - ${bottomInset})`
    : `calc(100vh - ${topInset})`

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined' || isMobile || isLoginRoute) return
    if (document.querySelector("script[data-iubenda-loader='true']")) return

    const script = document.createElement('script')
    script.src = IUBENDA_SCRIPT_SRC
    script.async = true
    script.dataset.iubendaLoader = 'true'
    document.body.appendChild(script)
  }, [isLoginRoute, isMobile])

  useEffect(() => {
    const handleOverlayVisibility = (event) => {
      setOverlayOpen(Boolean(event.detail?.open))
    }
    window.addEventListener('finalrep:overlay-visibility', handleOverlayVisibility)
    return () => window.removeEventListener('finalrep:overlay-visibility', handleOverlayVisibility)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const { body } = document
    const previousOverflow = body.style.overflow
    if (notificationsOpen) {
      body.style.overflow = 'hidden'
    } else {
      body.style.overflow = previousOverflow || ''
    }
    return () => {
      body.style.overflow = previousOverflow
    }
  }, [notificationsOpen])

  useEffect(() => {
    if (!session) return undefined
    const intervalId = window.setInterval(() => {
      setNotificationsRefreshTick((current) => current + 1)
    }, 60000)
    return () => window.clearInterval(intervalId)
  }, [session])

  useEffect(() => {
    if (!session) {
      setNotificationItems([])
      setUnreadCount(0)
      return
    }
    let active = true
    const storageKey = `finalrep:enrollment-status:${userId}`
    const requests = []
    if (isAthlete && userId) {
      requests.push(
        api.get(`/users/${userId}/competitions`)
          .then(({ data }) => ({ kind: 'athlete', data }))
          .catch(() => ({ kind: 'athlete', data: [] }))
      )
    }
    requests.push(
      api.get('/me/judge-assignments')
        .then(({ data }) => ({ kind: 'judge', data }))
        .catch(() => ({ kind: 'judge', data: [] }))
    )
    requests.push(
      api.get('/me/competitor-invitations')
        .then(({ data }) => ({ kind: 'competitor', data }))
        .catch(() => ({ kind: 'competitor', data: [] }))
    )
    if (session) {
      requests.push(
        api.get('/users/me/profile-completeness')
          .then(({ data }) => ({ kind: 'profile', data }))
          .catch(() => ({ kind: 'profile', data: { complete: true } }))
      )
      requests.push(
        api.get('/me/enrollment-question-tasks')
          .then(({ data }) => ({ kind: 'enrollmentQuestions', data }))
          .catch(() => ({ kind: 'enrollmentQuestions', data: [] }))
      )
    }

    Promise.all(requests).then((results) => {
      if (!active) return
      const dynamicItems = []
      let unread = 0

      const athleteResult = results.find((item) => item.kind === 'athlete')
      if (athleteResult) {
        const list = Array.isArray(athleteResult.data) ? athleteResult.data : []
        const currentMap = {}
        let previousMap = {}
        try {
          previousMap = JSON.parse(window.localStorage.getItem(storageKey) || '{}')
        } catch {
          previousMap = {}
        }
        for (const item of list) {
          const currentStatus = item.enrollment_estado || ''
          currentMap[String(item.id)] = currentStatus
          if (currentStatus === 'confirmado') {
            dynamicItems.push({
              title: `Inscripcion confirmada: ${item.nombre}`,
              text: `Tu pago fue aprobado${item.enrollment_categoria ? ` en la categoria ${item.enrollment_categoria}` : ''} y tu cupo ya esta activo.`,
              tone: 'success',
            })
          } else if (currentStatus === 'rechazado') {
            dynamicItems.push({
              title: `Registro rechazado: ${item.nombre}`,
              text: 'Tu registro fue rechazado. Puedes revisar la inscripcion e intentarlo de nuevo si sigue abierto.',
              tone: 'danger',
            })
          }
          if (
            previousMap[String(item.id)] &&
            previousMap[String(item.id)] !== currentStatus &&
            (currentStatus === 'confirmado' || currentStatus === 'rechazado')
          ) {
            unread += 1
          }
        }
        if (userId && !window.localStorage.getItem(storageKey)) {
          window.localStorage.setItem(storageKey, JSON.stringify(currentMap))
        }
      }

      const judgeResult = results.find((item) => item.kind === 'judge')
      if (judgeResult) {
        const pendingInvites = (Array.isArray(judgeResult.data) ? judgeResult.data : []).filter((item) => item.status === 'pending')
        for (const invite of pendingInvites) {
          dynamicItems.unshift({
            title: `Invitacion de juez: ${invite.competition_name}`,
            text: 'Te invitaron a operar esta competencia como juez. Puedes aceptar o rechazar ahora.',
            tone: 'neutral',
            actions: [
              { id: `accept-${invite.id}`, label: 'Aceptar', tone: 'primary', assignmentId: invite.id, actionType: 'accept' },
              { id: `reject-${invite.id}`, label: 'Rechazar', tone: 'secondary', assignmentId: invite.id, actionType: 'reject' },
            ],
          })
        }
        unread += pendingInvites.length
      }

      const competitorResult = results.find((item) => item.kind === 'competitor')
      if (competitorResult) {
        const pendingCompetitorInvites = (Array.isArray(competitorResult.data) ? competitorResult.data : []).filter((item) => item.status === 'pending')
        for (const invite of pendingCompetitorInvites) {
          dynamicItems.unshift({
            title: `Invitacion a competencia: ${invite.competition_name}`,
            text: `Te invitaron a competir${invite.categoria ? ` en la categoria ${invite.categoria}` : ''}. Completa tu inscripcion o rechaza la invitacion.`,
            tone: 'neutral',
            actions: [
              { id: `competitor-enroll-${invite.id}`, label: 'Completar inscripción', tone: 'primary', invitationId: invite.id, competitionId: invite.competition_id, actionType: 'competitor-enroll' },
              { id: `competitor-reject-${invite.id}`, label: 'Rechazar', tone: 'danger', invitationId: invite.id, actionType: 'competitor-reject' },
            ],
          })
        }
        unread += pendingCompetitorInvites.length
      }

      const profileResult = results.find((item) => item.kind === 'profile')
      if (profileResult && !profileResult.data.complete) {
        const { missing_fields: missing = [], total_fields: total = 6, filled_fields: filled = 0 } = profileResult.data
        const profileMissingKey = [...missing].sort().join(',') || 'profile'
        const profileSeenKey = `finalrep:profile-notif-seen:${userId}:${profileMissingKey}`
        dynamicItems.push({
          title: 'Completa tu perfil',
          text: `Tienes ${missing.length} campo${missing.length !== 1 ? 's' : ''} pendiente${missing.length !== 1 ? 's' : ''} (${filled}/${total} completado${filled !== 1 ? 's' : ''}). Completar tu perfil mejora tu experiencia y te permite recibir invitaciones correctamente.`,
          tone: 'neutral',
          actions: [
            { id: 'go-to-profile', label: 'Ir a mi perfil', tone: 'primary', actionType: 'go-to-profile', profileSeenKey },
          ],
        })
        if (!window.localStorage.getItem(profileSeenKey)) {
          unread += 1
        }
      }

      const enrollmentQuestionsResult = results.find((item) => item.kind === 'enrollmentQuestions')
      if (enrollmentQuestionsResult) {
        const tasks = Array.isArray(enrollmentQuestionsResult.data) ? enrollmentQuestionsResult.data : []
        const seenKey = `finalrep:enrollment-question-tasks-seen:${userId}`
        let seenMap = {}
        try {
          seenMap = JSON.parse(window.localStorage.getItem(seenKey) || '{}')
        } catch {
          seenMap = {}
        }
        tasks.forEach((task) => {
          const taskKey = `${task.competition_id}:${(task.questions || []).map((question) => question.id).join(',')}`
          dynamicItems.unshift({
            title: `Datos pendientes: ${task.competition_name}`,
            text: `${task.missing_count || 1} pregunta${Number(task.missing_count || 1) !== 1 ? 's' : ''} pendiente${Number(task.missing_count || 1) !== 1 ? 's' : ''}. Completa la informacion solicitada por el organizador.`,
            tone: 'neutral',
            actions: [
              { id: `answer-enrollment-questions-${taskKey}`, label: 'Completar ahora', tone: 'primary', actionType: 'answer-enrollment-questions', task, taskKey },
            ],
          })
          if (!seenMap[taskKey]) unread += 1
        })
      }

      setNotificationItems(dynamicItems)
      setUnreadCount(unread)
    })

    return () => {
      active = false
    }
  }, [isAthlete, userId, role, session, location.pathname, notificationsRefreshTick])

  const openNotifications = () => {
    setNotificationsRefreshTick((current) => current + 1)
    setNotificationsOpen(true)
  }

  useEffect(() => {
    if (!notificationsOpen || !session || !userId) return
    notificationItems.forEach((item) => {
      ;(item.actions || []).forEach((action) => {
        if (action.actionType === 'go-to-profile' && action.profileSeenKey) {
          window.localStorage.setItem(action.profileSeenKey, '1')
        }
      })
    })
    const questionSeenKey = `finalrep:enrollment-question-tasks-seen:${userId}`
    const questionSeenMap = {}
    notificationItems.forEach((item) => {
      ;(item.actions || []).forEach((action) => {
        if (action.actionType === 'answer-enrollment-questions' && action.taskKey) {
          questionSeenMap[action.taskKey] = 1
        }
      })
    })
    if (Object.keys(questionSeenMap).length) {
      window.localStorage.setItem(questionSeenKey, JSON.stringify(questionSeenMap))
    }

    if (!isAthlete) return
    api.get(`/users/${userId}/competitions`)
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : []
        const currentMap = {}
        for (const item of list) {
          currentMap[String(item.id)] = item.enrollment_estado || ''
        }
        window.localStorage.setItem(`finalrep:enrollment-status:${userId}`, JSON.stringify(currentMap))
        setUnreadCount(0)
      })
      .catch(() => {})
  }, [isAthlete, notificationsOpen, userId, role, session, notificationItems])

  const handleNotificationAction = async (action) => {
    if (!action?.actionType) return
    setNotificationActionBusyId(action.id)
    try {
      if (action.actionType === 'accept') {
        await api.post(`/judge-assignments/${action.assignmentId}/accept`)
        const me = await api.get('/auth/me')
        persistAuthSession({ ...me.data, access_token: session?.token })
        setNotificationItems((current) => current.filter((item) => !Array.isArray(item.actions) || !item.actions.some((row) => row.assignmentId === action.assignmentId)))
        setUnreadCount((current) => Math.max(0, current - 1))
      } else if (action.actionType === 'reject') {
        await api.post(`/judge-assignments/${action.assignmentId}/reject`)
        setNotificationItems((current) => current.filter((item) => !Array.isArray(item.actions) || !item.actions.some((row) => row.assignmentId === action.assignmentId)))
        setUnreadCount((current) => Math.max(0, current - 1))
      } else if (action.actionType === 'competitor-enroll') {
        setNotificationsOpen(false)
        navigate(`/competitions/${action.competitionId}/invitation/${action.invitationId}`)
      } else if (action.actionType === 'competitor-reject') {
        await api.post(`/competitor-invitations/${action.invitationId}/reject`)
        setNotificationItems((current) => current.filter((item) => !Array.isArray(item.actions) || !item.actions.some((row) => row.invitationId === action.invitationId)))
        setUnreadCount((current) => Math.max(0, current - 1))
      } else if (action.actionType === 'go-to-profile') {
        if (action.profileSeenKey) {
          window.localStorage.setItem(action.profileSeenKey, '1')
        }
        setNotificationsOpen(false)
        navigate('/profile')
      } else if (action.actionType === 'answer-enrollment-questions') {
        setPendingQuestionTask(action.task)
        setPendingQuestionDraft({})
        setPendingQuestionError('')
        setNotificationsOpen(false)
      }
    } catch {
    } finally {
      setNotificationActionBusyId('')
    }
  }

  const handlePendingQuestionUpload = async (question, file) => {
    if (!file || !question?.id) return
    setPendingQuestionUploadId(question.id)
    setPendingQuestionError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post('/enrollment-answers/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPendingQuestionDraft((current) => ({ ...current, [question.id]: data.url || '' }))
    } catch (err) {
      setPendingQuestionError(err.response?.data?.detail || 'No se pudo subir la imagen.')
    } finally {
      setPendingQuestionUploadId('')
    }
  }

  const handlePendingQuestionsSubmit = async (event) => {
    event.preventDefault()
    if (!pendingQuestionTask?.competition_id) return
    const questions = Array.isArray(pendingQuestionTask.questions) ? pendingQuestionTask.questions : []
    for (const question of questions) {
      if (question.required && !String(pendingQuestionDraft[question.id] || '').trim()) {
        setPendingQuestionError(`Responde la pregunta obligatoria: ${question.label}`)
        return
      }
    }
    setPendingQuestionSaving(true)
    setPendingQuestionError('')
    try {
      await api.post(`/competitions/${pendingQuestionTask.competition_id}/enrollment-answers`, {
        answers: questions.map((question) => ({
          question_id: question.id,
          question_label: question.label,
          question_type: question.field_type || 'text',
          answer: pendingQuestionDraft[question.id] || '',
        })),
        terms_accepted: 1,
      })
      setNotificationItems((current) => current.filter((item) => {
        const actions = item.actions || []
        return !actions.some((action) => action.actionType === 'answer-enrollment-questions' && action.task?.competition_id === pendingQuestionTask.competition_id)
      }))
      setUnreadCount((current) => Math.max(0, current - 1))
      setPendingQuestionTask(null)
      setPendingQuestionDraft({})
    } catch (err) {
      setPendingQuestionError(err.response?.data?.detail || 'No se pudieron guardar las respuestas.')
    } finally {
      setPendingQuestionSaving(false)
    }
  }

  const modalVisible = notificationsOpen || overlayOpen || !!pendingQuestionTask

  return (
    <div
      style={{
        minHeight: '100dvh',
        ...(isLoginRoute ? { height: '100dvh', overflow: 'hidden' } : {}),
        background:
          'radial-gradient(circle at top, rgba(214,217,224,0.10), transparent 26%), radial-gradient(circle at bottom right, rgba(94,234,212,0.08), transparent 24%), var(--oa-bg)',
        paddingTop: topInset,
        paddingBottom: bottomInset,
      }}
    >
      {!isMobile && (
        <DesktopHeader onOpenNotifications={openNotifications} unreadCount={unreadCount} />
      )}
      {isMobile && (
        <header
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 60,
            padding: 'calc(10px + env(safe-area-inset-top, 0px)) 14px 10px',
            background: 'rgba(9, 11, 14, 0.92)',
            backdropFilter: 'blur(18px)',
            borderBottom: '1px solid var(--oa-border)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <Link
              to="/"
              style={{
                textDecoration: 'none',
                color: 'var(--oa-primary)',
                fontFamily: 'Bebas Neue, sans-serif',
                fontSize: 30,
                letterSpacing: 1,
                lineHeight: 1,
              }}
            >
              FinalRep
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                aria-label="Abrir notificaciones"
                onClick={openNotifications}
                style={{
                  position: 'relative',
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  border: '1px solid var(--oa-border)',
                  background: 'rgba(23,26,32,0.96)',
                  color: 'var(--oa-text)',
                  display: 'grid',
                  placeItems: 'center',
                  padding: 0,
                  lineHeight: 0,
                }}
              >
                <Bell size={18} />
                {unreadCount > 0 ? (
                  <span
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      minWidth: 18,
                      height: 18,
                      padding: '0 5px',
                      borderRadius: 999,
                      background: '#FF453A',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 800,
                      display: 'grid',
                      placeItems: 'center',
                    border: '2px solid rgba(23,26,32,0.96)',
                    }}
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                ) : null}
              </button>
              {session && (
                <button
                  type="button"
                  aria-label="Cerrar sesion"
                  onClick={() => {
                    signOut()
                    navigate('/login', { replace: true })
                  }}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    border: '1px solid var(--oa-border)',
                    background: 'rgba(23,26,32,0.96)',
                    color: 'var(--oa-text)',
                    display: 'grid',
                    placeItems: 'center',
                    padding: 0,
                    lineHeight: 0,
                  }}
                >
                  <LogOut size={18} />
                </button>
              )}
            </div>
          </div>
        </header>
      )}
      <div style={isLoginRoute ? { height: contentMinHeight, overflow: 'hidden' } : { minHeight: contentMinHeight }}>
        <Outlet />
      </div>
      {isMobile && !modalVisible && <BottomDock />}
      <NotificationSheet
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        session={session}
        displayName={displayName}
        items={notificationItems}
        busyActionId={notificationActionBusyId}
        onAction={handleNotificationAction}
      />
      <PendingQuestionsModal
        task={pendingQuestionTask}
        draft={pendingQuestionDraft}
        onChange={(questionId, value) => setPendingQuestionDraft((current) => ({ ...current, [questionId]: value }))}
        onUpload={handlePendingQuestionUpload}
        uploadingQuestionId={pendingQuestionUploadId}
        saving={pendingQuestionSaving}
        error={pendingQuestionError}
        onClose={() => {
          setPendingQuestionTask(null)
          setPendingQuestionDraft({})
          setPendingQuestionError('')
        }}
        onSubmit={handlePendingQuestionsSubmit}
      />

      {!isMobile && !isLoginRoute && (
        <footer
          style={{
            borderTop: '1px solid var(--oa-border)',
            padding: '18px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <small style={{ color: '#AAB2C0', fontSize: 12 }}>
            © {new Date().getFullYear()} FinalRep. All Rights Reserved.
          </small>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <small style={{ fontSize: 12 }}>
              <a
                href="mailto:support@finalrep.co"
                style={{ color: '#AAB2C0', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <Mail size={13} />
                support@finalrep.co
              </a>
            </small>
            <small style={{ fontSize: 12 }}>
              <a
                href="tel:+573185781385"
                style={{ color: '#AAB2C0', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <Phone size={13} />
                +57 318 5781385
              </a>
            </small>
            {footerLegalLinks.map((item) => (
              <small key={item.href} style={{ fontSize: 12 }}>
                <a
                  href={item.href}
                  className="iubenda-white iubenda-noiframe iubenda-embed"
                  title={item.label}
                  style={{ color: '#AAB2C0', textDecoration: 'none' }}
                >
                  {item.label}
                </a>
              </small>
            ))}
          </div>
        </footer>
      )}
      {isMobile && !modalVisible && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 'auto 0 0 0',
            height: '28px',
            pointerEvents: 'none',
            background: 'linear-gradient(180deg, transparent, rgba(13, 15, 18, 0.96))',
          }}
        />
      )}
    </div>
  )
}
