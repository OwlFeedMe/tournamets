const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000

function installUpdateChecks(registration) {
  let lastUpdateCheck = 0

  const checkForUpdate = () => {
    const now = Date.now()
    if (now - lastUpdateCheck < UPDATE_CHECK_INTERVAL_MS) return
    lastUpdateCheck = now
    registration.update().catch(() => {})
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      checkForUpdate()
    }
  }

  window.addEventListener('focus', checkForUpdate)
  window.addEventListener('online', checkForUpdate)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS)
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null

  try {
    const registration = await navigator.serviceWorker.register('/sw.js?v=5', { scope: '/' })
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })
    registration.update().catch(() => {})
    installUpdateChecks(registration)
    return registration
  } catch {
    return null
  }
}
