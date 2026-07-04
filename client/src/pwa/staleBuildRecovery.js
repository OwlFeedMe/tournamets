const RELOAD_FLAG = 'finalrep:stale-build-reload'
const RELOAD_COOLDOWN_MS = 5 * 60 * 1000

function isStaleBuildError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return message.includes('failed to fetch dynamically imported module')
    || message.includes('importing a module script failed')
    || message.includes('error loading dynamically imported module')
    || message.includes('chunkloaderror')
}

async function clearBrowserCaches() {
  if ('caches' in window) {
    const cacheNames = await window.caches.keys()
    await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)))
  }

  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration('/')
    await registration?.update().catch(() => {})
  }
}

export async function recoverFromStaleBuild(error) {
  if (!isStaleBuildError(error)) return false
  const lastReload = Number(sessionStorage.getItem(RELOAD_FLAG) || 0)
  if (lastReload && Date.now() - lastReload < RELOAD_COOLDOWN_MS) return false

  sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
  await clearBrowserCaches().catch(() => {})
  window.location.reload()
  return true
}

export function markBuildLoaded() {
  const lastReload = Number(sessionStorage.getItem(RELOAD_FLAG) || 0)
  if (lastReload && Date.now() - lastReload > RELOAD_COOLDOWN_MS) {
    sessionStorage.removeItem(RELOAD_FLAG)
  }
}

export function installStaleBuildRecovery() {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    recoverFromStaleBuild(event.payload)
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (isStaleBuildError(event.reason)) {
      event.preventDefault()
      recoverFromStaleBuild(event.reason)
    }
  })
}
