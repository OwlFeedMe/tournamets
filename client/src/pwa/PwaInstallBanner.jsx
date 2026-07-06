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
        background: '#171B21',
        color: '#F5F7FA',
        borderRadius: 18,
        padding: '14px 14px 14px 16px',
        boxShadow: '0 22px 42px rgba(0,0,0,0.48)',
        border: '1px solid #252A33',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        pointerEvents: 'auto',
      }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(255,107,0,0.2) 0%, rgba(0,194,168,0.16) 100%)',
          border: '1px solid rgba(255,107,0,0.28)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: '#FF9A3D',
        }}>
          <Sparkles size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2, color: '#F5F7FA' }}>Instalar FinalRep</div>
          <div style={{ fontSize: 12, color: '#AAB2C0', marginTop: 2 }}>Acceso rapido desde la pantalla de inicio.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={dismissInstallPrompt}
            aria-label="Cerrar aviso de instalacion"
            style={{
              background: '#0D0F12',
              color: '#AAB2C0',
              border: '1px solid #252A33',
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
              background: '#FF6B00',
              color: '#0D0F12',
              borderColor: '#FF6B00',
              borderRadius: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
              fontWeight: 800,
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
