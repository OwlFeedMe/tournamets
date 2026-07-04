import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { registerServiceWorker } from './pwa/registerServiceWorker'
import { PwaInstallBanner } from './pwa/PwaInstallBanner'
import { installStaleBuildRecovery, markBuildLoaded, recoverFromStaleBuild } from './pwa/staleBuildRecovery'

if (import.meta.env.PROD) {
  installStaleBuildRecovery()
  registerServiceWorker()
}

markBuildLoaded()

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    recoverFromStaleBuild(error)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="app-error-fallback">
        <div>
          <strong>No pudimos cargar esta vista.</strong>
          <button type="button" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </div>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
      <PwaInstallBanner />
    </AppErrorBoundary>
  </React.StrictMode>
)
