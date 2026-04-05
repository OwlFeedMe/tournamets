import { Download, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

function isStandaloneMode() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const [installed, setInstalled] = useState(isStandaloneMode())

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setDeferredPrompt(event)
      setInstalled(false)
    }

    const onAppInstalled = () => {
      setDeferredPrompt(null)
      setInstalled(true)
      setDismissed(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia?.('(display-mode: standalone)')
    if (!media) return undefined
    const handleChange = () => setInstalled(media.matches)
    handleChange()
    media.addEventListener?.('change', handleChange)
    return () => media.removeEventListener?.('change', handleChange)
  }, [])

  const canShow = useMemo(() => Boolean(deferredPrompt && !dismissed && !installed), [deferredPrompt, dismissed, installed])

  if (!canShow) return null

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setDismissed(true)
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(128px + env(safe-area-inset-bottom, 0px))',
        transform: 'translateX(-50%)',
        width: 'min(100vw - 16px, 420px)',
        zIndex: 60,
        borderRadius: 18,
        background: 'rgba(9, 11, 14, 0.94)',
        border: '1px solid rgba(255, 107, 0, 0.24)',
        boxShadow: '0 18px 48px rgba(0, 0, 0, 0.42)',
        backdropFilter: 'blur(18px)',
        padding: 14,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          background: 'linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Download size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--oa-text)', fontWeight: 700, fontSize: 14 }}>Instalar FinalRep</div>
        <div style={{ color: 'var(--oa-text-secondary)', fontSize: 12, marginTop: 2 }}>
          Acceso rapido desde el inicio del celular.
        </div>
      </div>
      <button
        type="button"
        onClick={handleInstall}
        className="btn-primary btn-sm"
        style={{ minWidth: 92 }}
      >
        Instalar
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Cerrar aviso de instalacion"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--oa-text-secondary)',
          padding: 6,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={16} />
      </button>
    </div>
  )
}
