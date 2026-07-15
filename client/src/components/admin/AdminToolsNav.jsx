import { CreditCard, Dumbbell, ShieldCheck, Trophy, Users } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const adminItems = [
  { label: 'Competencias', icon: Trophy, to: '/admin' },
  { label: 'Gyms', icon: Dumbbell, to: '/admin/gyms' },
  { label: 'Finanzas', icon: CreditCard, to: '/admin/finance' },
  { label: 'Usuarios', icon: Users, to: '/admin/users' },
]

function isActive(pathname, target) {
  if (target === '/admin') return pathname === '/admin'
  return pathname === target || pathname.startsWith(`${target}/`)
}

export function AdminToolsNav({ compact = false }) {
  const location = useLocation()
  const navigate = useNavigate()
  const activeItemRef = useRef(null)

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [location.pathname])

  return (
    <nav
      aria-label="Menu admin"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        overflowX: 'auto',
        padding: compact ? 0 : 4,
        scrollbarWidth: 'none',
      }}
    >
      {!compact ? (
        <span
          style={{
            flex: '0 0 auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            minHeight: 38,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid #252A33',
            color: '#AAB2C0',
            background: '#090B0E',
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          <ShieldCheck size={15} color="#FF6B00" />
          Admin
        </span>
      ) : null}
      {adminItems.map((item) => {
        const Icon = item.icon
        const active = isActive(location.pathname, item.to)
        return (
          <button
            key={item.to}
            ref={active ? activeItemRef : null}
            type="button"
            onClick={() => navigate(item.to)}
            style={{
              flex: '0 0 auto',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              minHeight: 38,
              borderRadius: 8,
              border: active ? '1px solid rgba(255,107,0,0.62)' : '1px solid #252A33',
              background: active ? 'rgba(255,107,0,0.15)' : '#171B21',
              color: active ? '#F5F7FA' : '#AAB2C0',
              padding: '8px 11px',
              fontWeight: 900,
              whiteSpace: 'nowrap',
            }}
          >
            <Icon size={15} />
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

