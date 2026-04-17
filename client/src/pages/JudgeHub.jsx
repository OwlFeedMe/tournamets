import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Camera, CheckCircle2, ChevronRight, QrCode, ShieldAlert, XCircle } from 'lucide-react'
import api from '../api/axios'
import { APP_CONTENT_MAX_WIDTH } from '../utils/competitionLayout'

const pageStyle = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at top, rgba(255,107,0,0.12), transparent 26%), radial-gradient(circle at bottom right, rgba(0,194,168,0.08), transparent 24%), #0D0F12',
  color: '#F5F7FA',
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
  )
  useEffect(() => {
    const handle = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handle)
    return () => window.removeEventListener('resize', handle)
  }, [])
  return isMobile
}

function SectionCard({ children, style = {}, mobile = false }) {
  return (
    <section
      style={{
        borderRadius: mobile ? 20 : 24,
        border: '1px solid #252A33',
        background: '#171B21',
        padding: mobile ? 14 : 18,
        ...style,
      }}
    >
      {children}
    </section>
  )
}

export default function JudgeHub() {
  const isMobile = useIsMobile()
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null)
  const [phases, setPhases] = useState([])
  const [phaseCode, setPhaseCode] = useState('check_in')
  const [station, setStation] = useState('Acceso principal')
  const [token, setToken] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [scanError, setScanError] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(0)

  const selectedAssignment = useMemo(
    () => assignments.find((item) => item.id === selectedAssignmentId) || assignments.find((item) => item.status === 'active') || null,
    [assignments, selectedAssignmentId],
  )
  const activeAssignments = useMemo(
    () => assignments.filter((item) => item.status === 'active'),
    [assignments],
  )
  const pendingAssignments = useMemo(
    () => assignments.filter((item) => item.status === 'pending'),
    [assignments],
  )

  const stopCamera = () => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  useEffect(() => () => stopCamera(), [])

  useEffect(() => {
    if (!cameraOpen) return
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return

    video.setAttribute('playsinline', 'true')
    video.setAttribute('autoplay', 'true')
    video.muted = true
    video.srcObject = stream

    const tryPlay = () => {
      const result = video.play()
      if (result && typeof result.catch === 'function') {
        result.catch(() => {
          setCameraError('Toca la vista previa para iniciar la camara.')
        })
      }
    }
    if (video.readyState >= 2) {
      tryPlay()
    } else {
      video.onloadedmetadata = tryPlay
    }

    let detector = null
    if (typeof window !== 'undefined' && window.BarcodeDetector) {
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] })
      } catch {
        detector = null
      }
    }
    if (!detector) {
      setCameraError('Este navegador no lee QR automaticamente. Usa el token manual.')
    }

    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      const currentVideo = videoRef.current
      const currentCanvas = canvasRef.current
      if (!currentVideo || !currentCanvas || !detector) {
        rafRef.current = window.requestAnimationFrame(tick)
        return
      }
      if (scanBusy) {
        rafRef.current = window.requestAnimationFrame(tick)
        return
      }
      if (currentVideo.readyState >= 2 && currentVideo.videoWidth > 0) {
        currentCanvas.width = currentVideo.videoWidth
        currentCanvas.height = currentVideo.videoHeight
        const ctx = currentCanvas.getContext('2d')
        ctx.drawImage(currentVideo, 0, 0, currentCanvas.width, currentCanvas.height)
        try {
          const codes = await detector.detect(currentCanvas)
          const first = codes?.[0]?.rawValue
          if (first) {
            submitScan(first)
          }
        } catch {
          // ignore single frame failure
        }
      }
      rafRef.current = window.requestAnimationFrame(tick)
    }
    if (detector) {
      rafRef.current = window.requestAnimationFrame(tick)
    }

    return () => {
      cancelled = true
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
      if (video) {
        video.onloadedmetadata = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen])

  const loadAssignments = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/me/judge-assignments')
      const items = Array.isArray(data) ? data : []
      setAssignments(items)
      const active = items.find((item) => item.status === 'active')
      setSelectedAssignmentId((current) => current || active?.id || items[0]?.id || null)
    } catch {
      setAssignments([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAssignments()
  }, [])

  useEffect(() => {
    const competitionId = selectedAssignment?.competition_id
    if (!competitionId || selectedAssignment?.status !== 'active') {
      setPhases([])
      return
    }
    let cancelled = false
    api.get(`/competitions/${competitionId}/checkin/phases`)
      .then(({ data }) => {
        if (cancelled) return
        const items = Array.isArray(data) ? data : []
        setPhases(items)
        setPhaseCode(items[0]?.code || 'check_in')
      })
      .catch(() => {
        if (cancelled) return
        setPhases([])
      })
    return () => {
      cancelled = true
    }
  }, [selectedAssignment?.competition_id, selectedAssignment?.status])

  const parseScanResponse = (data) => {
    const participant = data?.participant || null
    const fullName = participant ? `${participant.nombre || ''} ${participant.apellido || ''}`.trim() : ''
    if (data?.ok) {
      return {
        tone: 'success',
        title: 'QR valido',
        text: `${fullName || 'Participante'} registrado en ${data?.phase_code || 'check_in'}.`,
      }
    }
    if (data?.status === 'already_used') {
      return {
        tone: 'warning',
        title: 'QR ya usado',
        text: `${fullName || 'Participante'} ya tenia uso registrado para ${data?.phase_code || 'check_in'}.`,
      }
    }
    return {
      tone: 'danger',
      title: 'QR no valido',
      text: `Estado: ${data?.status || 'desconocido'}.`,
    }
  }

  const submitScan = async (rawToken) => {
    if (!selectedAssignment?.competition_id) return
    const nextToken = String(rawToken || '').trim()
    if (!nextToken || scanBusy) return
    setScanBusy(true)
    setScanError('')
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `judge-scan-${Date.now()}`
      const { data } = await api.post(`/competitions/${selectedAssignment.competition_id}/checkin/scan`, {
        token: nextToken,
        phase_code: phaseCode || 'check_in',
        station: String(station || '').trim() || null,
        device_id: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 180) : null,
        idempotency_key: idempotencyKey,
      })
      setScanResult(parseScanResponse(data))
      setToken('')
      if (data?.ok) {
        stopCamera()
        setCameraOpen(false)
      }
    } catch (err) {
      setScanError(err.response?.data?.detail || 'No se pudo procesar el QR.')
    } finally {
      setScanBusy(false)
    }
  }

  const acquireRearStream = async () => {
    const attempts = [
      { audio: false, video: { facingMode: { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { audio: false, video: { facingMode: { exact: 'environment' } } },
      { audio: false, video: { facingMode: { ideal: 'environment' } } },
    ]
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints)
      } catch {
        // try next
      }
    }
    try {
      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const cameras = devices.filter((item) => item.kind === 'videoinput')
        const rear = cameras.find((item) => /back|rear|environment|trás|tras/i.test(item.label || ''))
        const target = rear || cameras[cameras.length - 1]
        if (target?.deviceId) {
          return await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { deviceId: { exact: target.deviceId } },
          })
        }
      }
    } catch {
      // fall through
    }
    return navigator.mediaDevices.getUserMedia({ audio: false, video: true })
  }

  const startCamera = async () => {
    setCameraError('')
    setScanError('')
    stopCamera()
    let stream
    try {
      stream = await acquireRearStream()
    } catch {
      setCameraError('No se pudo abrir la camara. Revisa los permisos del navegador.')
      setCameraOpen(false)
      return
    }
    if (!stream) {
      setCameraError('No se pudo abrir la camara.')
      setCameraOpen(false)
      return
    }
    streamRef.current = stream
    setCameraOpen(true)
  }

  const inputBaseStyle = {
    borderRadius: 14,
    border: '1px solid #252A33',
    background: '#0D0F12',
    color: '#F5F7FA',
    padding: '12px 14px',
    fontSize: 16,
    width: '100%',
    boxSizing: 'border-box',
  }

  const primaryButtonStyle = {
    borderRadius: 999,
    border: '1px solid rgba(255,107,0,0.42)',
    background: '#FF6B00',
    color: '#0D0F12',
    fontWeight: 800,
    padding: isMobile ? '12px 16px' : '10px 16px',
    fontSize: 14,
    minHeight: 44,
    flex: isMobile ? '1 1 160px' : '0 0 auto',
  }

  const secondaryButtonStyle = {
    borderRadius: 999,
    border: '1px solid #252A33',
    background: 'rgba(13,15,18,0.72)',
    color: '#F5F7FA',
    fontWeight: 800,
    padding: isMobile ? '12px 16px' : '10px 16px',
    fontSize: 14,
    minHeight: 44,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flex: isMobile ? '1 1 160px' : '0 0 auto',
  }

  const chipScrollerStyle = {
    display: 'flex',
    gap: 10,
    overflowX: 'auto',
    margin: '0 -14px',
    padding: '0 14px 4px',
    scrollSnapType: 'x mandatory',
    scrollbarWidth: 'none',
  }

  const outerPadding = isMobile ? '16px 14px 120px' : '24px 18px 140px'
  const gridGap = isMobile ? 14 : 18
  const showCompetitionSelector = activeAssignments.length > 1
  const twoColumnGrid = !isMobile && showCompetitionSelector

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: APP_CONTENT_MAX_WIDTH, margin: '0 auto', padding: outerPadding, display: 'grid', gap: gridGap }}>
        <SectionCard
          mobile={isMobile}
          style={{ background: 'linear-gradient(135deg, rgba(255,107,0,0.18), rgba(23,27,33,0.96) 48%, rgba(0,194,168,0.12))' }}
        >
          <div style={{ color: '#FFB36F', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2 }}>Juez</div>
          <h1
            style={{
              margin: isMobile ? '8px 0 6px' : '10px 0 8px',
              fontSize: isMobile ? 'clamp(22px, 7vw, 30px)' : 'clamp(30px, 6vw, 52px)',
              lineHeight: isMobile ? 1.1 : 0.98,
            }}
          >
            {isMobile ? 'Control y escaneo QR.' : 'Control de competencia y escaneo QR.'}
          </h1>
          <p style={{ margin: 0, color: '#AAB2C0', fontSize: isMobile ? 13 : 15, lineHeight: 1.6 }}>
            {isMobile
              ? 'Opera el ingreso QR de tus competencias asignadas.'
              : 'Revisa tus asignaciones activas y opera el ingreso QR de cada competencia.'}
          </p>
        </SectionCard>

        {loading ? <div style={{ color: '#AAB2C0', padding: '0 4px' }}>Cargando asignaciones...</div> : null}

        {!loading && pendingAssignments.length > 0 ? (
          <SectionCard mobile={isMobile}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShieldAlert size={18} color="#F59E0B" />
              <div style={{ fontWeight: 800 }}>Invitaciones pendientes</div>
            </div>
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {pendingAssignments.map((item) => (
                <div key={item.id} style={{ borderRadius: 14, border: '1px solid rgba(245,158,11,0.28)', background: 'rgba(245,158,11,0.08)', padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{item.competition_name}</div>
                  <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 6 }}>Acepta la invitacion desde Notificaciones para activar este acceso.</div>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}

        {!loading && !activeAssignments.length ? (
          <SectionCard mobile={isMobile}>
            <div style={{ color: '#AAB2C0', fontSize: isMobile ? 13 : 14 }}>No tienes competencias activas como juez en este momento.</div>
          </SectionCard>
        ) : null}

        {activeAssignments.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gap: gridGap,
              gridTemplateColumns: twoColumnGrid ? 'minmax(0, 320px) minmax(0, 1fr)' : '1fr',
            }}
          >
            {showCompetitionSelector && !isMobile ? (
              <SectionCard mobile={isMobile}>
                <div style={{ fontWeight: 800, marginBottom: 12 }}>Mis competencias</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {activeAssignments.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedAssignmentId(item.id)}
                      style={{
                        textAlign: 'left',
                        borderRadius: 16,
                        border: `1px solid ${selectedAssignment?.id === item.id ? 'rgba(255,107,0,0.42)' : '#252A33'}`,
                        background: selectedAssignment?.id === item.id ? 'rgba(255,107,0,0.12)' : 'rgba(13,15,18,0.55)',
                        color: '#F5F7FA',
                        padding: 14,
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>{item.competition_name}</div>
                      <div style={{ marginTop: 8, color: '#AAB2C0', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CalendarDays size={14} />
                        Acceso activo
                      </div>
                    </button>
                  ))}
                </div>
              </SectionCard>
            ) : null}

            <SectionCard mobile={isMobile}>
              {showCompetitionSelector && isMobile ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ color: '#AAB2C0', fontSize: 12, marginBottom: 8 }}>Mis competencias</div>
                  <div style={chipScrollerStyle}>
                    {activeAssignments.map((item) => {
                      const active = selectedAssignment?.id === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedAssignmentId(item.id)}
                          style={{
                            flex: '0 0 auto',
                            scrollSnapAlign: 'start',
                            borderRadius: 999,
                            border: `1px solid ${active ? 'rgba(255,107,0,0.42)' : '#252A33'}`,
                            background: active ? 'rgba(255,107,0,0.12)' : 'rgba(13,15,18,0.55)',
                            color: '#F5F7FA',
                            padding: '8px 14px',
                            fontWeight: 700,
                            fontSize: 13,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.competition_name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                  <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, lineHeight: 1.2, wordBreak: 'break-word' }}>
                    {selectedAssignment?.competition_name || 'Selecciona una competencia'}
                  </div>
                  <div style={{ color: '#AAB2C0', marginTop: 6, fontSize: isMobile ? 12 : 14 }}>
                    Escaneo QR para ingreso y control operativo.
                  </div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '6px 10px', border: '1px solid rgba(0,194,168,0.28)', background: 'rgba(0,194,168,0.10)', color: '#7AF0DE', fontWeight: 800, fontSize: 11 }}>
                  <QrCode size={14} />
                  Escaneo QR
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
                <div style={{ display: 'grid', gap: isMobile ? 10 : 12, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ color: '#AAB2C0', fontSize: 12 }}>Fase de check-in</label>
                    <select
                      value={phaseCode}
                      onChange={(event) => setPhaseCode(event.target.value)}
                      style={inputBaseStyle}
                    >
                      {phases.map((phase) => (
                        <option key={phase.id} value={phase.code}>{phase.label}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ color: '#AAB2C0', fontSize: 12 }}>Punto de control</label>
                    <input
                      value={station}
                      onChange={(event) => setStation(event.target.value)}
                      placeholder="Acceso principal"
                      style={inputBaseStyle}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={cameraOpen ? () => { stopCamera(); setCameraOpen(false) } : startCamera}
                    style={{ ...primaryButtonStyle, background: cameraOpen ? 'rgba(13,15,18,0.72)' : '#FF6B00', color: cameraOpen ? '#F5F7FA' : '#0D0F12', border: cameraOpen ? '1px solid #252A33' : '1px solid rgba(255,107,0,0.42)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    <Camera size={16} />
                    {cameraOpen ? 'Cerrar camara' : 'Abrir camara'}
                  </button>
                </div>

                {cameraOpen ? (
                  <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #252A33', background: '#090B0E', padding: 8, position: 'relative' }}>
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      webkit-playsinline="true"
                      disablePictureInPicture
                      onClick={() => {
                        const video = videoRef.current
                        if (!video) return
                        const result = video.play()
                        if (result && typeof result.catch === 'function') {
                          result.catch(() => {})
                        }
                      }}
                      style={{
                        width: '100%',
                        maxHeight: isMobile ? '60vh' : 420,
                        aspectRatio: isMobile ? '3 / 4' : '4 / 3',
                        objectFit: 'cover',
                        borderRadius: 12,
                        display: 'block',
                        background: '#000',
                      }}
                    />
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        inset: '8px',
                        pointerEvents: 'none',
                        borderRadius: 12,
                        boxShadow: 'inset 0 0 0 2px rgba(255,107,0,0.42)',
                      }}
                    />
                  </div>
                ) : null}

                <details style={{ borderRadius: 14, border: '1px solid #252A33', background: 'rgba(13,15,18,0.55)', padding: '10px 14px' }}>
                  <summary style={{ color: '#AAB2C0', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>Ingresar token manual</summary>
                  <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                    <textarea
                      value={token}
                      onChange={(event) => setToken(event.target.value)}
                      placeholder="Pega aqui el token del QR"
                      rows={isMobile ? 3 : 4}
                      style={{ ...inputBaseStyle, resize: 'vertical' }}
                    />
                    <button
                      type="button"
                      onClick={() => submitScan(token)}
                      disabled={scanBusy || !token.trim()}
                      style={{ ...secondaryButtonStyle, width: '100%', flex: 'none', opacity: scanBusy || !token.trim() ? 0.6 : 1 }}
                    >
                      {scanBusy ? 'Procesando...' : 'Validar token'}
                    </button>
                  </div>
                </details>

                {cameraError ? <div style={{ color: '#F59E0B', fontSize: 13 }}>{cameraError}</div> : null}
                {scanError ? <div style={{ color: '#EF4444', fontSize: 13 }}>{scanError}</div> : null}

                {scanResult ? (
                  <div
                    style={{
                      borderRadius: 16,
                      padding: 14,
                      border: `1px solid ${scanResult.tone === 'success' ? 'rgba(34,197,94,0.28)' : scanResult.tone === 'warning' ? 'rgba(245,158,11,0.28)' : 'rgba(239,68,68,0.28)'}`,
                      background: scanResult.tone === 'success' ? 'rgba(34,197,94,0.10)' : scanResult.tone === 'warning' ? 'rgba(245,158,11,0.10)' : 'rgba(239,68,68,0.10)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: isMobile ? 14 : 15 }}>
                      {scanResult.tone === 'success' ? <CheckCircle2 size={18} /> : scanResult.tone === 'warning' ? <ShieldAlert size={18} /> : <XCircle size={18} />}
                      {scanResult.title}
                    </div>
                    <div style={{ marginTop: 6, color: '#D7DEE8', fontSize: 13 }}>{scanResult.text}</div>
                  </div>
                ) : null}
              </div>
            </SectionCard>
          </div>
        ) : null}

        {!isMobile ? (
          <SectionCard mobile={isMobile}>
            <div style={{ fontWeight: 800 }}>Siguiente paso</div>
            <div style={{ marginTop: 8, color: '#AAB2C0', lineHeight: 1.6 }}>
              Este menu ya deja operativo el escaneo QR. La siguiente iteracion puede conectar carga de resultados, historial por juez y controles por heat.
            </div>
            <div style={{ marginTop: 10, color: '#FFB36F', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ChevronRight size={15} />
              Escaneo listo para extender
            </div>
          </SectionCard>
        ) : null}
      </div>
    </div>
  )
}
