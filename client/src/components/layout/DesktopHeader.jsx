import { Bell, CalendarDays, Gavel, House, LogIn, LogOut, ShieldCheck, UserCircle2 } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { APP_CONTENT_MAX_WIDTH } from '../../utils/competitionLayout'

const PUBLIC_NAV = [
  { label: 'Inicio', icon: House, to: '/' },
  { label: 'Eventos', icon: CalendarDays, to: '/events' },
]

function buildNavItems(session) {
  if (!session) return PUBLIC_NAV

  if (session.role === 'admin') {
    return [
      { label: 'Inicio', icon: House, to: '/' },
      { label: 'Eventos', icon: CalendarDays, to: '/events' },
      { label: 'Mis eventos', icon: CalendarDays, to: '/my-events' },
      { label: 'Perfil', icon: UserCircle2, to: '/profile' },
      { label: 'Admin', icon: ShieldCheck, to: '/admin' },
    ]
  }

  const items = [
    { label: 'Inicio', icon: House, to: '/' },
    { label: 'Eventos', icon: CalendarDays, to: '/events' },
  ]
  if (session.participantId) {
    items.push({ label: 'Mis eventos', icon: CalendarDays, to: '/my-events' })
  }
  if (session.organizerEnabled) {
    items.push({ label: 'Panel', icon: UserCircle2, to: '/organizer' })
  }
  if (session.judgeEnabled) {
    items.push({ label: 'Juez', icon: Gavel, to: '/judge' })
  }
  items.push({ label: 'Perfil', icon: UserCircle2, to: '/profile' })
  return items
}

function isActivePath(pathname, target) {
  if (!target) return false
  if (target === '/') return pathname === '/'
  if (target === '/events') return pathname.startsWith('/events')
  if (target === '/my-events') return pathname.startsWith('/my-events')
  if (target === '/admin') return pathname.startsWith('/admin')
  if (target === '/organizer') return pathname.startsWith('/organizer')
  if (target === '/judge') return pathname.startsWith('/judge')
  if (target === '/profile') return pathname.startsWith('/profile')
  return pathname === target || pathname.startsWith(`${target}?`)
}

export function DesktopHeader({ onOpenNotifications, unreadCount = 0 }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, signOut } = useAuth()

  const items = buildNavItems(session)

  const iconButtonStyle = {
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
    cursor: 'pointer',
  }

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        padding: '12px 24px',
        background: 'rgba(9, 11, 14, 0.92)',
        backdropFilter: 'blur(18px)',
        borderBottom: '1px solid var(--oa-border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          maxWidth: APP_CONTENT_MAX_WIDTH,
          margin: '0 auto',
        }}
      >
        <Link
          to="/"
          style={{
            textDecoration: 'none',
            color: 'var(--oa-primary)',
            fontFamily: 'Bebas Neue, sans-serif',
            fontSize: 32,
            letterSpacing: 1,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          FinalRep
        </Link>

        <nav
          aria-label="Navegacion principal"
          style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}
        >
          {items.map((item) => {
            const Icon = item.icon
            const active = isActivePath(location.pathname, item.to)
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => navigate(item.to)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  borderRadius: 14,
                  border: active ? '1px solid rgba(214, 217, 224, 0.28)' : '1px solid transparent',
                  background: active
                    ? 'linear-gradient(135deg, rgba(214,217,224,0.14), rgba(94,234,212,0.10))'
                    : 'transparent',
                  color: active ? 'var(--oa-text)' : 'var(--oa-text-secondary)',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            aria-label="Abrir notificaciones"
            onClick={onOpenNotifications}
            style={{ ...iconButtonStyle, position: 'relative' }}
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
                  border: '2px solid rgba(23,27,33,0.96)',
                }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : null}
          </button>
          {session ? (
            <button
              type="button"
              aria-label="Cerrar sesion"
              onClick={() => {
                signOut()
                navigate('/login', { replace: true })
              }}
              style={iconButtonStyle}
            >
              <LogOut size={18} />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Ingresar"
              onClick={() => navigate('/login')}
              style={{
                ...iconButtonStyle,
                width: 'auto',
                padding: '0 14px',
                gap: 8,
                display: 'inline-flex',
                alignItems: 'center',
                background: 'linear-gradient(135deg, rgba(214,217,224,0.18), rgba(199,205,214,0.12))',
                border: '1px solid rgba(214, 217, 224, 0.28)',
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              <LogIn size={16} />
              <span>Ingresar</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
