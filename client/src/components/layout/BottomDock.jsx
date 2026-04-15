import { CalendarDays, House, LogIn, UserCircle2 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const DOCKS = {
  public: [
    { label: 'Inicio', icon: House, to: '/' },
    { label: 'Eventos', icon: CalendarDays, to: '/events' },
    { label: 'Ingresar', icon: LogIn, to: '/login' },
  ],
  user: [
    { label: 'Inicio', icon: House, to: '/' },
    { label: 'Eventos', icon: CalendarDays, to: '/events' },
    { label: 'Mis eventos', icon: CalendarDays, to: '/my-events' },
    { label: 'Perfil', icon: UserCircle2, to: '/profile' },
  ],
  organizer: [
    { label: 'Inicio', icon: House, to: '/' },
    { label: 'Eventos', icon: CalendarDays, to: '/events' },
    { label: 'Perfil', icon: UserCircle2, to: '/organizer' },
  ],
  admin: [
    { label: 'Inicio', icon: House, to: '/' },
    { label: 'Eventos', icon: CalendarDays, to: '/events' },
    { label: 'Mis eventos', icon: CalendarDays, to: '/my-events' },
    { label: 'Perfil', icon: UserCircle2, to: '/profile' },
    { label: 'Admin', icon: UserCircle2, to: '/admin' },
  ],
}

function isActivePath(pathname, target) {
  if (!target) return false
  if (target === '/events') return pathname.startsWith('/events')
  if (target === '/my-events') return pathname.startsWith('/my-events')
  if (target === '/admin') return pathname.startsWith('/admin')
  if (target === '/organizer') return pathname.startsWith('/organizer')
  if (target === '/profile') return pathname.startsWith('/profile')
  return pathname === target || pathname.startsWith(`${target}?`)
}

export function BottomDock() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()

  const items = (() => {
    if (!session) return DOCKS.public
    if (session.role === 'user' && session.organizerEnabled) {
      return [
        { label: 'Inicio', icon: House, to: '/' },
        { label: 'Mis eventos', icon: CalendarDays, to: '/my-events' },
        { label: 'Panel', icon: UserCircle2, to: '/organizer' },
        { label: 'Perfil', icon: UserCircle2, to: '/profile' },
      ]
    }
    return DOCKS[session.role] || DOCKS.user
  })()

  return (
    <nav
      aria-label="Navegacion principal"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '10px',
        transform: 'translateX(-50%)',
        width: 'min(100vw - 16px, 760px)',
        zIndex: 50,
        borderRadius: 22,
        border: '1px solid rgba(37, 42, 51, 0.92)',
        background: 'rgba(23, 27, 33, 0.92)',
        backdropFilter: 'blur(18px)',
        boxShadow: '0 18px 50px rgba(0, 0, 0, 0.38)',
        padding: '8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
        {items.map((item) => {
          const Icon = item.icon
          const active = isActivePath(location.pathname, item.to)
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                if (item.to) navigate(item.to)
              }}
              style={{
                flex: 1,
                minHeight: 56,
                borderRadius: 16,
                padding: '8px 10px',
                border: active ? '1px solid rgba(255, 107, 0, 0.4)' : '1px solid transparent',
                background: active
                  ? 'linear-gradient(135deg, rgba(255,107,0,0.22), rgba(255,154,61,0.14))'
                  : 'transparent',
                color: active ? 'var(--oa-text)' : 'var(--oa-text-secondary)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <Icon size={18} />
              <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
