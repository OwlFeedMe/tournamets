import { RefreshCw, Search, ShieldCheck, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import api from '../api/axios'
import { AdminToolsNav } from '../components/admin/AdminToolsNav'
import { APP_CONTENT_MAX_WIDTH } from '../utils/competitionLayout'

const colors = {
  bg: '#0D0F12',
  top: '#090B0E',
  surface: '#171B21',
  border: '#252A33',
  primary: '#FF6B00',
  accent: '#00C2A8',
  text: '#F5F7FA',
  secondary: '#AAB2C0',
  muted: '#6B7280',
  error: '#EF4444',
}

const roleOptions = [
  { value: '', label: 'Usuario' },
  { value: 'organizer', label: 'Organizador' },
  { value: 'judge', label: 'Juez' },
  { value: 'announcer', label: 'Locutor' },
  { value: 'admin', label: 'Admin' },
]

function displayName(user) {
  return user.display_name || [user.nombre, user.apellido].filter(Boolean).join(' ') || `Usuario #${user.user_id || user.id}`
}

function roleLabel(value) {
  return roleOptions.find((item) => item.value === (value || ''))?.label || value || 'Usuario'
}

export default function AdminUsersPanel() {
  const [users, setUsers] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)

  const loadUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/users/admin')
      setUsers(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudieron cargar los usuarios.')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const filteredUsers = useMemo(() => {
    const raw = query.trim().toLowerCase()
    if (!raw) return users
    return users.filter((user) => {
      const haystack = [
        displayName(user),
        user.email,
        user.celular,
        user.cedula,
        user.username,
        roleLabel(user.extra_role),
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(raw)
    })
  }, [query, users])

  const updateRole = async (user, extraRole) => {
    const userId = user.user_id || user.id
    setSavingId(userId)
    setError('')
    try {
      await api.put(`/users/${userId}/role`, { extra_role: extraRole })
      setUsers((current) => current.map((item) => (
        (item.user_id || item.id) === userId
          ? {
            ...item,
            extra_role: extraRole || null,
            organizer_enabled: extraRole === 'organizer',
            judge_enabled: extraRole === 'judge',
            announcer_enabled: extraRole === 'announcer',
            admin_enabled: extraRole === 'admin',
          }
          : item
      )))
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo actualizar el rol.')
    } finally {
      setSavingId(null)
    }
  }

  const counts = users.reduce((acc, user) => {
    const key = user.extra_role || ''
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  return (
    <main style={{ minHeight: '100%', background: colors.bg, color: colors.text }}>
      <div style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: '22px 16px 120px', display: 'grid', gap: 16 }}>
        <AdminToolsNav />

        <section style={{ border: `1px solid ${colors.border}`, borderRadius: 8, background: 'linear-gradient(135deg, rgba(255,107,0,0.18), rgba(23,27,33,0.96) 48%, rgba(0,194,168,0.10))', padding: 18, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#FFB36F', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Admin</div>
              <h1 style={{ marginTop: 6, fontSize: 'clamp(32px, 5vw, 56px)', lineHeight: 0.95, fontFamily: 'Bebas Neue, Poppins, sans-serif', letterSpacing: 0 }}>Usuarios</h1>
              <p style={{ marginTop: 10, maxWidth: 680, color: colors.secondary, fontSize: 14, lineHeight: 1.55 }}>
                Gestiona accesos operativos para organizadores, jueces, locutores y admins.
              </p>
            </div>
            <button type="button" onClick={loadUsers} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.top, color: colors.text, fontWeight: 900 }}>
              <RefreshCw size={16} /> Refrescar
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            <Stat label="Total" value={users.length} tone={colors.primary} />
            <Stat label="Admins" value={counts.admin || 0} tone={colors.primary} />
            <Stat label="Organizadores" value={counts.organizer || 0} tone={colors.accent} />
            <Stat label="Staff" value={(counts.judge || 0) + (counts.announcer || 0)} tone="#F59E0B" />
          </div>
        </section>

        <section style={{ border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.surface, overflow: 'hidden' }}>
          <div style={{ padding: 14, borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 950 }}>
              <Users size={17} color={colors.accent} />
              Directorio
            </div>
            <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
              <Search size={15} color={colors.muted} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre, email, cedula o rol"
                style={{ paddingLeft: 34, background: colors.top, borderColor: colors.border, borderRadius: 8 }}
              />
            </div>
          </div>

          {error ? <div style={{ margin: 14, border: `1px solid ${colors.error}`, background: 'rgba(239,68,68,0.12)', color: '#FCA5A5', borderRadius: 8, padding: 10 }}>{error}</div> : null}
          {loading ? <div style={{ padding: 18, color: colors.secondary }}>Cargando usuarios...</div> : null}
          {!loading && filteredUsers.length === 0 ? <div style={{ padding: 18, color: colors.secondary }}>Sin usuarios para mostrar.</div> : null}

          {!loading && filteredUsers.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead>
                  <tr style={{ background: colors.top, color: colors.muted, fontSize: 12, textAlign: 'left' }}>
                    <th style={{ padding: 12 }}>Usuario</th>
                    <th style={{ padding: 12 }}>Contacto</th>
                    <th style={{ padding: 12 }}>Username</th>
                    <th style={{ padding: 12 }}>Rol operativo</th>
                    <th style={{ padding: 12 }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const userId = user.user_id || user.id
                    return (
                      <tr key={userId} style={{ borderTop: `1px solid ${colors.border}` }}>
                        <td style={{ padding: 12 }}>
                          <div style={{ fontWeight: 900 }}>{displayName(user)}</div>
                          <div style={{ color: colors.muted, fontSize: 12 }}>#{userId}{user.cedula ? ` · ${user.cedula}` : ''}</div>
                        </td>
                        <td style={{ padding: 12, color: colors.secondary, fontSize: 13 }}>
                          <div>{user.email || 'Sin email'}</div>
                          <div style={{ color: colors.muted }}>{user.celular || 'Sin celular'}</div>
                        </td>
                        <td style={{ padding: 12, color: colors.secondary, fontSize: 13 }}>{user.username || '-'}</td>
                        <td style={{ padding: 12, width: 190 }}>
                          <select
                            value={user.extra_role || ''}
                            disabled={savingId === userId}
                            onChange={(event) => updateRole(user, event.target.value)}
                            style={{ background: colors.top, borderColor: colors.border, borderRadius: 8 }}
                          >
                            {roleOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: 12 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 999, border: `1px solid ${user.extra_role ? 'rgba(0,194,168,0.36)' : colors.border}`, background: user.extra_role ? 'rgba(0,194,168,0.10)' : colors.top, color: user.extra_role ? colors.accent : colors.secondary, fontSize: 12, fontWeight: 900 }}>
                            {user.extra_role ? <ShieldCheck size={13} /> : null}
                            {roleLabel(user.extra_role)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div style={{ border: `1px solid ${colors.border}`, background: colors.top, borderRadius: 8, padding: 11 }}>
      <div style={{ color: colors.muted, fontSize: 11, fontWeight: 900 }}>{label}</div>
      <div style={{ color: tone, fontSize: 24, lineHeight: 1.1, fontWeight: 950, marginTop: 5 }}>{value}</div>
    </div>
  )
}

