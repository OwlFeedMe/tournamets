import { useEffect, useMemo, useState } from 'react'
import { Bell, ChevronRight, LogOut } from 'lucide-react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BottomDock } from './BottomDock'
import { DesktopHeader } from './DesktopHeader'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/axios'

function NotificationSheet({ open, onClose, session, displayName, items = [] }) {
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

export function AuthenticatedShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, displayName, signOut, participantId, role, isAthlete } = useAuth()
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [notificationItems, setNotificationItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
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
    if (!session || !isAthlete || !participantId) {
      setNotificationItems([])
      setUnreadCount(0)
      return
    }
    let active = true
    const storageKey = `finalrep:enrollment-status:${participantId}`

    api.get(`/participants/${participantId}/competitions`)
      .then(({ data }) => {
        if (!active) return
        const list = Array.isArray(data) ? data : []
        const currentMap = {}
        const dynamicItems = []
        let unread = 0
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
        setNotificationItems(dynamicItems)
        setUnreadCount(unread)
        if (!window.localStorage.getItem(storageKey)) {
          window.localStorage.setItem(storageKey, JSON.stringify(currentMap))
        }
      })
      .catch(() => {
        if (!active) return
        setNotificationItems([])
        setUnreadCount(0)
      })

    return () => {
      active = false
    }
  }, [isAthlete, participantId, role, session, location.pathname])

  useEffect(() => {
    if (!notificationsOpen || !session || !isAthlete || !participantId) return
    api.get(`/participants/${participantId}/competitions`)
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : []
        const currentMap = {}
        for (const item of list) {
          currentMap[String(item.id)] = item.enrollment_estado || ''
        }
        window.localStorage.setItem(`finalrep:enrollment-status:${participantId}`, JSON.stringify(currentMap))
        setUnreadCount(0)
      })
      .catch(() => {})
  }, [isAthlete, notificationsOpen, participantId, role, session])

  const modalVisible = notificationsOpen || overlayOpen

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
        <DesktopHeader onOpenNotifications={() => setNotificationsOpen(true)} unreadCount={unreadCount} />
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
                onClick={() => setNotificationsOpen(true)}
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
      />

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
