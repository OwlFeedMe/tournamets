import { CalendarDays, Gavel, House, LogIn, ShieldCheck, UserCircle2 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const PUBLIC_ITEMS = [
  { label: 'Inicio', icon: House, to: '/' },
  { label: 'Eventos', icon: CalendarDays, to: '/events' },
  { label: 'Ingresar', icon: LogIn, to: '/login' },
]

function buildDockItems(session) {
  if (!session) return PUBLIC_ITEMS

  if (session.role === 'admin') {
    return [
      { label: 'Inicio', icon: House, to: '/' },
      { label: 'Eventos', icon: CalendarDays, to: '/events' },
      { label: 'Mis eventos', icon: CalendarDays, to: '/my-events' },
      { label: 'Perfil', icon: UserCircle2, to: '/profile' },
      { label: 'Admin', icon: ShieldCheck, to: '/admin' },
    ]
  }

  const hasExtra = !!(session.organizerEnabled || session.judgeEnabled)
  const items = [{ label: 'Inicio', icon: House, to: '/' }]
  if (!hasExtra) {
    items.push({ label: 'Eventos', icon: CalendarDays, to: '/events' })
  }
  if (session.participantId) {
    items.push({ label: 'Mis eventos', icon: CalendarDays, to: '/my-events' })
  } else if (hasExtra) {
    items.push({ label: 'Eventos', icon: CalendarDays, to: '/events' })
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
  if (target === '/events') return pathname.startsWith('/events')
  if (target === '/my-events') return pathname.startsWith('/my-events')
  if (target === '/admin') return pathname.startsWith('/admin')
  if (target === '/organizer') return pathname.startsWith('/organizer')
  if (target === '/judge') return pathname.startsWith('/judge')
  if (target === '/profile') return pathname.startsWith('/profile')
  return pathname === target || pathname.startsWith(`${target}?`)
}

export function BottomDock() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()

  const items = buildDockItems(session)

  return (
    <nav
      className="fr-bottom-dock"
      aria-label="Navegacion principal"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '10px',
        transform: 'translateX(-50%)',
        width: 'min(100vw - 16px, 760px)',
        zIndex: 50,
        borderRadius: 22,
        border: '1px solid var(--oa-border)',
        background: 'rgba(23, 26, 32, 0.92)',
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
                border: active ? '1px solid rgba(214, 217, 224, 0.28)' : '1px solid transparent',
                background: active
                  ? 'linear-gradient(135deg, rgba(214,217,224,0.14), rgba(94,234,212,0.10))'
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
