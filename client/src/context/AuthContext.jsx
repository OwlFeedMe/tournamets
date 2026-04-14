import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

const STORAGE_KEYS = {
  token: 'token',
  role: 'role',
  nombre: 'nombre',
  participantId: 'participant_id',
  organizerEnabled: 'organizer_enabled',
}

const SESSION_EVENT = 'openarena:session-changed'

const ROLE_ORDER = {
  user: 1,
  organizer: 2,
  admin: 3,
}

const AuthContext = createContext(null)

export function normalizeRole(role) {
  const raw = (role || '').toString().trim().toLowerCase()
  if (raw === 'participant' || raw === 'user') return 'user'
  if (raw === 'organiser' || raw === 'organizer') return 'organizer'
  if (raw === 'admin') return 'admin'
  return null
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

function normalizeOrganizerEnabled(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true
  return false
}

export function getHomePath(role) {
  const normalized = normalizeRole(role)
  if (normalized === 'admin') return '/admin'
  if (normalized === 'organizer') return '/organizer'
  return '/profile'
}

function storeSessionPayload(payload, token) {
  if (typeof window === 'undefined') return
  const role = normalizeRole(payload?.role)
  if (!token || !role) return
  const displayName = payload?.display_name || payload?.nombre || payload?.displayName || ''
  const participantId = toNumber(payload?.participant_id)
  const organizerEnabled = normalizeOrganizerEnabled(payload?.organizer_enabled)

  window.localStorage.setItem(STORAGE_KEYS.token, token)
  window.localStorage.setItem(STORAGE_KEYS.role, role)
  window.localStorage.setItem(STORAGE_KEYS.nombre, displayName)
  window.localStorage.setItem(STORAGE_KEYS.organizerEnabled, organizerEnabled ? '1' : '0')
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

  const payloadRole = normalizeRole(payload?.role)
  const storedRole = normalizeRole(window.localStorage.getItem(STORAGE_KEYS.role))
  const role = payloadRole || storedRole
  if (!role) return null

  const participantId = toNumber(window.localStorage.getItem(STORAGE_KEYS.participantId) || payload?.participant_id || payload?.sub)
  const organizerEnabled = normalizeOrganizerEnabled(
    window.localStorage.getItem(STORAGE_KEYS.organizerEnabled) ?? payload?.organizer_enabled
  )
  const displayName =
    window.localStorage.getItem(STORAGE_KEYS.nombre) ||
    payload?.display_name ||
    payload?.nombre ||
    (role === 'admin' ? 'Administrador' : role === 'organizer' ? 'Organizador' : 'Usuario')

  return {
    token,
    role,
    displayName,
    participantId,
    organizerEnabled,
    claims: payload,
  }
}

export function persistSession(payload) {
  storeSessionPayload(payload, payload?.access_token || payload?.token)
}

export function AuthProvider({ children }) {
  const location = useLocation()
  const [session, setSession] = useState(() => readStoredSession())

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

  const refreshSession = useCallback(() => {
    setSession(readStoredSession())
  }, [])

  const persistAndRefreshSession = useCallback((payload) => {
    persistSession(payload)
    setSession(readStoredSession())
  }, [])

  useEffect(() => {
    if (!session?.token) return

    let cancelled = false
    fetch('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Session ${response.status}`)
        }
        return response.json()
      })
      .then((payload) => {
        if (cancelled) return
        storeSessionPayload(payload, session.token)
        setSession(readStoredSession())
      })
      .catch((err) => {
        if (cancelled) return
        // Solo limpiar sesión si el servidor explícitamente rechaza el token (401)
        // Errores de red o timing no deben desloguear al usuario
        if (err?.message?.includes('401')) {
          window.localStorage.removeItem(STORAGE_KEYS.token)
          window.localStorage.removeItem(STORAGE_KEYS.role)
          window.localStorage.removeItem(STORAGE_KEYS.nombre)
          window.localStorage.removeItem(STORAGE_KEYS.participantId)
          window.localStorage.removeItem(STORAGE_KEYS.organizerEnabled)
          setSession(null)
          window.dispatchEvent(new Event(SESSION_EVENT))
        }
      })

    return () => {
      cancelled = true
    }
  }, [session?.token])

  const signOut = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEYS.token)
    window.localStorage.removeItem(STORAGE_KEYS.role)
    window.localStorage.removeItem(STORAGE_KEYS.nombre)
    window.localStorage.removeItem(STORAGE_KEYS.participantId)
    window.localStorage.removeItem(STORAGE_KEYS.organizerEnabled)
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
      roleRank,
      displayName: session?.displayName || '',
      participantId: session?.participantId || null,
      organizerEnabled: !!session?.organizerEnabled,
      refreshSession,
      persistSession: persistAndRefreshSession,
      signOut,
      canAccess: (allowedRoles = []) => {
        if (!session) return false
        if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) return true
        if (allowedRoles.includes(session.role)) return true
        if (allowedRoles.includes('organizer') && session.organizerEnabled) return true
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
