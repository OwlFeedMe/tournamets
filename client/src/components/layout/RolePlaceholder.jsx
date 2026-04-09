import { useNavigate } from 'react-router-dom'
import { Crown, LayoutDashboard, LogOut, Trophy } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { APP_CONTENT_MAX_WIDTH } from '../../utils/competitionLayout'

export function RolePlaceholder({ role }) {
  const navigate = useNavigate()
  const { displayName, signOut } = useAuth()

  const meta =
    role === 'organizer'
      ? {
          title: 'Panel de Organizador',
          subtitle: 'Zona reservada para gestion de competencias, inscripciones y resultados.',
          icon: Crown,
        }
      : {
          title: 'Panel de Acceso',
          subtitle: 'Espacio reservado para funciones avanzadas del sistema.',
          icon: LayoutDashboard,
        }

  const Icon = meta.icon

  return (
    <div style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: '20px 16px 32px' }}>
      <div
        style={{
          borderRadius: 24,
          padding: '24px 20px',
          background: 'linear-gradient(135deg, rgba(255,107,0,0.16), rgba(23,27,33,0.96) 50%, rgba(0,194,168,0.10))',
          border: '1px solid rgba(37,42,51,0.95)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 18,
              background: 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={24} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ color: 'var(--oa-text)', fontSize: 28, fontWeight: 800, lineHeight: 1.05 }}>{meta.title}</div>
            <div style={{ color: 'var(--oa-text-secondary)', marginTop: 6 }}>{meta.subtitle}</div>
            <div style={{ marginTop: 8, color: 'var(--oa-text-muted)', fontSize: 12 }}>
              Sesion activa: {displayName || role}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary btn-sm" onClick={() => navigate('/leaderboard')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Trophy size={14} /> Leaderboard
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={signOut} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <LogOut size={14} /> Salir
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {[
            ['Navegacion', 'Dock inferior listo para acciones por rol.'],
            ['Instalacion', 'La app ya expone soporte PWA para instalar desde el navegador.'],
            ['Roles', 'La capa de acceso reconoce admin, organizer y user.'],
          ].map(([title, text]) => (
            <div key={title} style={{ background: 'rgba(13,15,18,0.55)', border: '1px solid rgba(37,42,51,0.9)', borderRadius: 18, padding: 14 }}>
              <div style={{ color: 'var(--oa-text)', fontWeight: 700 }}>{title}</div>
              <div style={{ color: 'var(--oa-text-secondary)', fontSize: 13, marginTop: 6 }}>{text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
