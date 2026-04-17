import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

const STORAGE_KEYS = {
  token: 'token',
  role: 'role',
  baseRole: 'base_role',
  extraRoles: 'extra_roles',
  nombre: 'nombre',
  participantId: 'participant_id',
  organizerEnabled: 'organizer_enabled',
  judgeEnabled: 'judge_enabled',
  adminEnabled: 'admin_enabled',
}

const SESSION_EVENT = 'finalrep:session-changed'

const ROLE_ORDER = {
  user: 1,
  organizer: 2,
  judge: 2,
  admin: 3,
}

const AuthContext = createContext(null)

export function normalizeRole(role) {
  const raw = (role || '').toString().trim().toLowerCase()
  if (raw === 'participant' || raw === 'user') return 'user'
  if (raw === 'organiser' || raw === 'organizer') return 'organizer'
  if (raw === 'judge' || raw === 'juez') return 'judge'
  if (raw === 'admin') return 'admin'
  return null
}

function normalizeFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function normalizeExtraRoles(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeRole).filter(Boolean)
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map(normalizeRole).filter(Boolean) : []
    } catch {
      return value
        .split(',')
        .map((item) => normalizeRole(item))
        .filter(Boolean)
    }
  }
  return []
}

function getEffectiveRole(baseRole, extraRoles = []) {
  if (extraRoles.includes('admin')) return 'admin'
  if (extraRoles.includes('organizer')) return 'organizer'
  if (extraRoles.includes('judge')) return 'judge'
  return normalizeRole(baseRole) || 'user'
}

function decodeBase64Url(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return atob(padded)
}

export function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(decodeBase64Url(parts[1]))
  } catch {
    return null
  }
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function getHomePath(role) {
  const normalized = normalizeRole(role)
  if (normalized === 'admin') return '/admin'
  if (normalized === 'organizer') return '/organizer'
  if (normalized === 'judge') return '/judge'
  return '/profile'
}

function storeSessionPayload(payload, token) {
  if (typeof window === 'undefined') return
  const baseRole = normalizeRole(payload?.base_role || payload?.role) || 'user'
  const organizerEnabled = normalizeFlag(payload?.organizer_enabled)
  const judgeEnabled = normalizeFlag(payload?.judge_enabled)
  const adminEnabled = normalizeFlag(payload?.admin_enabled)
  const extraRoles = Array.from(new Set([
    ...normalizeExtraRoles(payload?.extra_roles),
    ...(organizerEnabled ? ['organizer'] : []),
    ...(judgeEnabled ? ['judge'] : []),
    ...(adminEnabled ? ['admin'] : []),
  ]))
  const role = getEffectiveRole(baseRole, extraRoles)
  if (!token || !role) return

  const displayName = payload?.display_name || payload?.nombre || payload?.displayName || ''
  const participantId = toNumber(payload?.participant_id)

  window.localStorage.setItem(STORAGE_KEYS.token, token)
  window.localStorage.setItem(STORAGE_KEYS.role, role)
  window.localStorage.setItem(STORAGE_KEYS.baseRole, baseRole)
  window.localStorage.setItem(STORAGE_KEYS.extraRoles, JSON.stringify(extraRoles))
  window.localStorage.setItem(STORAGE_KEYS.nombre, displayName)
  window.localStorage.setItem(STORAGE_KEYS.organizerEnabled, organizerEnabled ? '1' : '0')
  window.localStorage.setItem(STORAGE_KEYS.judgeEnabled, judgeEnabled ? '1' : '0')
  window.localStorage.setItem(STORAGE_KEYS.adminEnabled, adminEnabled ? '1' : '0')
  if (participantId != null) {
    window.localStorage.setItem(STORAGE_KEYS.participantId, String(participantId))
  } else {
    window.localStorage.removeItem(STORAGE_KEYS.participantId)
  }
  window.dispatchEvent(new Event(SESSION_EVENT))
}

export function readStoredSession() {
  if (typeof window === 'undefined') return null
  const token = window.localStorage.getItem(STORAGE_KEYS.token)
  if (!token) return null

  const payload = decodeJwtPayload(token)
  const exp = toNumber(payload?.exp)
  if (exp && Date.now() >= exp * 1000) return null

  const baseRole = normalizeRole(window.localStorage.getItem(STORAGE_KEYS.baseRole) || payload?.base_role || payload?.role) || 'user'
  const organizerEnabled = normalizeFlag(window.localStorage.getItem(STORAGE_KEYS.organizerEnabled) ?? payload?.organizer_enabled)
  const judgeEnabled = normalizeFlag(window.localStorage.getItem(STORAGE_KEYS.judgeEnabled) ?? payload?.judge_enabled)
  const adminEnabled = normalizeFlag(window.localStorage.getItem(STORAGE_KEYS.adminEnabled) ?? payload?.admin_enabled)
  const extraRoles = Array.from(new Set([
    ...normalizeExtraRoles(window.localStorage.getItem(STORAGE_KEYS.extraRoles) ?? payload?.extra_roles),
    ...(organizerEnabled ? ['organizer'] : []),
    ...(judgeEnabled ? ['judge'] : []),
    ...(adminEnabled ? ['admin'] : []),
  ]))

  const payloadRole = normalizeRole(payload?.role)
  const storedRole = normalizeRole(window.localStorage.getItem(STORAGE_KEYS.role))
  const role = payloadRole || storedRole || getEffectiveRole(baseRole, extraRoles)
  if (!role) return null

  const participantId = toNumber(window.localStorage.getItem(STORAGE_KEYS.participantId) || payload?.participant_id || payload?.sub)
  const displayName =
    window.localStorage.getItem(STORAGE_KEYS.nombre) ||
    payload?.display_name ||
    payload?.nombre ||
    (role === 'admin' ? 'Administrador' : role === 'organizer' ? 'Organizador' : role === 'judge' ? 'Juez' : 'Usuario')

  return {
    token,
    role,
    baseRole,
    extraRoles,
    displayName,
    participantId,
    organizerEnabled,
    judgeEnabled,
    adminEnabled,
    claims: payload,
  }
}

export function persistSession(payload) {
  storeSessionPayload(payload, payload?.access_token || payload?.token)
}

export function AuthProvider({ children }) {
  const location = useLocation()
  const [session, setSession] = useState(() => readStoredSession())
  const lastServerRefreshRef = useRef(0)

  useLayoutEffect(() => {
    setSession(readStoredSession())
  }, [location.pathname, location.search, location.hash])

  useEffect(() => {
    const syncSession = () => setSession(readStoredSession())
    window.addEventListener('storage', syncSession)
    window.addEventListener(SESSION_EVENT, syncSession)
    return () => {
      window.removeEventListener('storage', syncSession)
      window.removeEventListener(SESSION_EVENT, syncSession)
    }
  }, [])

  const persistAndRefreshSession = useCallback((payload) => {
    persistSession(payload)
    setSession(readStoredSession())
  }, [])

  const refreshSession = useCallback(
    async ({ force = false } = {}) => {
      if (typeof window === 'undefined') return
      const token = window.localStorage.getItem(STORAGE_KEYS.token)
      if (!token) {
        setSession(null)
        return
      }
      const now = Date.now()
      if (!force && now - lastServerRefreshRef.current < 8000) {
        setSession(readStoredSession())
        return
      }
      lastServerRefreshRef.current = now
      try {
        const response = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) {
          if (response.status === 401) {
            Object.values(STORAGE_KEYS).forEach((key) => window.localStorage.removeItem(key))
            setSession(null)
            window.dispatchEvent(new Event(SESSION_EVENT))
          }
          return
        }
        const payload = await response.json()
        storeSessionPayload(payload, token)
        setSession(readStoredSession())
      } catch {
        setSession(readStoredSession())
      }
    },
    [],
  )

  useEffect(() => {
    if (!session?.token) return
    refreshSession({ force: true })
  }, [session?.token, refreshSession])

  useEffect(() => {
    if (!session?.token) return
    refreshSession()
  }, [location.pathname, refreshSession, session?.token])

  const signOut = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEYS.token)
    window.localStorage.removeItem(STORAGE_KEYS.role)
    window.localStorage.removeItem(STORAGE_KEYS.baseRole)
    window.localStorage.removeItem(STORAGE_KEYS.extraRoles)
    window.localStorage.removeItem(STORAGE_KEYS.nombre)
    window.localStorage.removeItem(STORAGE_KEYS.participantId)
    window.localStorage.removeItem(STORAGE_KEYS.organizerEnabled)
    window.localStorage.removeItem(STORAGE_KEYS.judgeEnabled)
    window.localStorage.removeItem(STORAGE_KEYS.adminEnabled)
    setSession(null)
    window.dispatchEvent(new Event(SESSION_EVENT))
  }, [])

  const value = useMemo(() => {
    const role = session?.role || null
    const roleRank = role ? (ROLE_ORDER[role] || 0) : 0
    return {
      session,
      ready: true,
      isAuthenticated: !!session,
      role,
      baseRole: session?.baseRole || 'user',
      extraRoles: session?.extraRoles || [],
      roleRank,
      displayName: session?.displayName || '',
      participantId: session?.participantId || null,
      appUserId: session?.claims?.app_user_id || null,
      organizerEnabled: !!session?.organizerEnabled,
      judgeEnabled: !!session?.judgeEnabled,
      adminEnabled: !!session?.adminEnabled,
      isAthlete: !!session?.participantId && (session?.role === 'user' || session?.baseRole === 'user'),
      refreshSession,
      persistSession: persistAndRefreshSession,
      signOut,
      canAccess: (allowedRoles = []) => {
        if (!session) return false
        if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) return true
        if (allowedRoles.includes(session.role)) return true
        if (allowedRoles.includes('organizer') && session.organizerEnabled) return true
        if (allowedRoles.includes('judge') && session.judgeEnabled) return true
        if (allowedRoles.includes('admin') && session.adminEnabled) return true
        if (allowedRoles.includes('user') && session.participantId) return true
        return false
      },
    }
  }, [persistAndRefreshSession, refreshSession, session, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
