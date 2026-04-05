import { useEffect, useMemo, useState } from 'react'
import { Bell, ChevronRight, LogOut } from 'lucide-react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { BottomDock } from './BottomDock'
import { useAuth } from '../../context/AuthContext'

function NotificationSheet({ open, onClose, session, displayName }) {
  const items = useMemo(() => {
    if (session) {
      return [
        {
          title: 'Competencias y resultados',
          text: 'Aqui veras avisos de aperturas, cambios de fase y movimientos relevantes del leaderboard.',
        },
        {
          title: 'Tu cuenta',
          text: `Las notificaciones personalizadas apareceran aqui para ${displayName || 'tu perfil'}.`,
        },
      ]
    }
    return [
      {
        title: 'Novedades de eventos',
        text: 'Consulta aperturas, nuevas competencias visibles y cambios importantes del calendario.',
      },
      {
        title: 'Acceso personal',
        text: 'Ingresa para recibir notificaciones asociadas a tu perfil y a tus competencias.',
      },
    ]
  }, [displayName, session])

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
          top: 'calc(62px + env(safe-area-inset-top, 0px))',
          right: 12,
          left: 12,
          zIndex: 70,
          borderRadius: 24,
          border: '1px solid rgba(37, 42, 51, 0.96)',
          background: 'rgba(23, 27, 33, 0.98)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 28px 80px rgba(0, 0, 0, 0.38)',
          padding: 18,
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
          {items.map((item) => (
            <div key={item.title} style={{ borderRadius: 18, border: '1px solid rgba(37,42,51,0.92)', background: 'rgba(13,15,18,0.5)', padding: 14 }}>
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
                color: '#FF9A3D',
                fontWeight: 800,
              }}
            >
              Ir a ingresar
              <ChevronRight size={16} />
            </Link>
          </div>
        )}
      </div>
    </>
  )
}

export function AuthenticatedShell() {
  const navigate = useNavigate()
  const { session, displayName, signOut } = useAuth()
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)

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

  const modalVisible = notificationsOpen || overlayOpen

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, rgba(255,107,0,0.10), transparent 26%), radial-gradient(circle at bottom right, rgba(0,194,168,0.08), transparent 24%), var(--oa-bg)',
        paddingTop: isMobile ? 'calc(68px + env(safe-area-inset-top, 0px))' : 0,
        paddingBottom: isMobile ? 'calc(112px + env(safe-area-inset-bottom, 0px))' : 0,
      }}
    >
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
            borderBottom: '1px solid rgba(37, 42, 51, 0.92)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <Link
              to="/"
              style={{
                textDecoration: 'none',
                color: '#FF6B00',
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
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  border: '1px solid rgba(37,42,51,0.96)',
                  background: 'rgba(23,27,33,0.96)',
                  color: 'var(--oa-text)',
                  display: 'grid',
                  placeItems: 'center',
                  padding: 0,
                  lineHeight: 0,
                }}
              >
                <Bell size={18} />
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
                    border: '1px solid rgba(37,42,51,0.96)',
                    background: 'rgba(23,27,33,0.96)',
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
      <div style={{ minHeight: '100vh' }}>
        <Outlet />
      </div>
      {isMobile && !modalVisible && <BottomDock />}
      {isMobile && (
        <NotificationSheet
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          session={session}
          displayName={displayName}
        />
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
