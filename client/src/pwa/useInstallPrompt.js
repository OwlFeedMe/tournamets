import { useCallback, useEffect, useState } from 'react'

const DISMISS_KEY = 'openarena-pwa-install-dismissed'

function isStandaloneMode() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled] = useState(() => isStandaloneMode())
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(DISMISS_KEY) === '1'
  })

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setDeferredPrompt(event)
    }

    const onAppInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
      setDismissed(false)
      window.localStorage.removeItem(DISMISS_KEY)
    }

    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const onMediaChange = () => setInstalled(isStandaloneMode())

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    mediaQuery.addEventListener?.('change', onMediaChange)
    mediaQuery.addListener?.(onMediaChange)

    onMediaChange()

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
      mediaQuery.removeEventListener?.('change', onMediaChange)
      mediaQuery.removeListener?.(onMediaChange)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false

    deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    setDeferredPrompt(null)

    if (choice?.outcome === 'accepted') {
      setDismissed(false)
      return true
    }

    return false
  }, [deferredPrompt])

  const dismissInstallPrompt = useCallback(() => {
    setDismissed(true)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, '1')
    }
  }, [])

  return {
    canInstall: Boolean(deferredPrompt) && !installed && !dismissed,
    installed,
    promptInstall,
    dismissInstallPrompt,
  }
}
