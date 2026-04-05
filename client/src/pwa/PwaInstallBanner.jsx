import { Download, Sparkles, X } from 'lucide-react'
import { useInstallPrompt } from './useInstallPrompt'

export function PwaInstallBanner() {
  const { canInstall, promptInstall, dismissInstallPrompt } = useInstallPrompt()

  if (!canInstall) return null

  return (
    <div style={{
      position: 'fixed',
      left: 0,
      right: 0,
      bottom: 'calc(116px + env(safe-area-inset-bottom))',
      padding: '0 12px',
      zIndex: 1300,
      pointerEvents: 'none',
    }}>
      <div style={{
        maxWidth: 460,
        marginLeft: 'auto',
        background: 'linear-gradient(135deg, rgba(255,107,0,0.98) 0%, rgba(255,154,61,0.96) 100%)',
        color: '#fff',
        borderRadius: 18,
        padding: '14px 14px 14px 16px',
        boxShadow: '0 18px 40px rgba(0,0,0,0.32)',
        border: '1px solid rgba(255,255,255,0.16)',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        pointerEvents: 'auto',
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: 'rgba(9,11,14,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Sparkles size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>Instalar FinalRep</div>
          <div style={{ fontSize: 12, opacity: 0.92, marginTop: 2 }}>Acceso rapido desde la pantalla de inicio.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={dismissInstallPrompt}
            aria-label="Cerrar aviso de instalacion"
            style={{
              background: 'rgba(255,255,255,0.12)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 12,
              width: 36,
              height: 36,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            <X size={16} />
          </button>
          <button
            type="button"
            onClick={promptInstall}
            className="btn-secondary"
            style={{
              background: '#090B0E',
              color: '#fff',
              borderColor: 'rgba(255,255,255,0.12)',
              borderRadius: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
            }}
          >
            <Download size={15} />
            Instalar
          </button>
        </div>
      </div>
    </div>
  )
}
