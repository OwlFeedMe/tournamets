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

const PHASE_MEASUREMENT_LABELS = {
  for_time: 'For Time',
  amrap: 'AMRAP',
  emom: 'EMOM',
  metros: 'Metros (m)',
  rm: 'RM',
}

function normalizeMeasurementMethod(raw, tipo) {
  const value = (raw || '').toString().trim().toLowerCase()
  if (['for_time', 'amrap', 'emom', 'metros', 'rm'].includes(value)) return value
  if (['kg', 'g', 'lb', 'lbs', 'kilogramos', 'gramos', 'libras'].includes(value)) return 'rm'
  if (['hms', 'hh:mm:ss', 'tiempo_hms', 'posicion', 'posición'].includes(value)) return 'for_time'
  if (['reps', 'rep', 'repeticiones', 'unidades'].includes(value)) return 'amrap'
  if (value === 'metro') return 'metros'
  return (tipo || '').toString().trim().toLowerCase() === 'tiempo' ? 'for_time' : 'amrap'
}

function isTimeMeasurement(method) {
  return normalizeMeasurementMethod(method) === 'for_time'
}

function phaseTypeFromPhase(phase) {
  const explicit = (phase?.tipo || '').toString().trim().toLowerCase()
  if (explicit === 'posicion') return 'posicion'
  return isTimeMeasurement(phase?.measurement_method || explicit) ? 'tiempo' : 'cantidad'
}

function parseTimeToSeconds(value) {
  const raw = (value ?? '').toString().trim()
  if (!raw) return null
  if (/^\d+$/.test(raw)) return Number(raw)
  const parts = raw.split(':').map((item) => item.trim())
  if (parts.length !== 2 && parts.length !== 3) return null
  const nums = parts.map(Number)
  if (nums.some((item) => !Number.isFinite(item) || item < 0)) return null
  let h = 0
  let m = 0
  let s = 0
  if (nums.length === 2) {
    ;[m, s] = nums
  } else {
    ;[h, m, s] = nums
  }
  if (m > 59 || s > 59) return null
  return (h * 3600) + (m * 60) + s
}

function parseMetricByPhase(value, phase) {
  if (phaseTypeFromPhase(phase) === 'posicion') {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }
  const method = normalizeMeasurementMethod(phase?.measurement_method, phase?.tipo)
  if (isTimeMeasurement(method)) return parseTimeToSeconds(value)
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function formatSecondsToClock(totalSeconds) {
  if (!Number.isFinite(Number(totalSeconds))) return ''
  const safe = Math.max(0, Math.round(Number(totalSeconds)))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatMarkForPhase(mark, phase, fallbackFormatted) {
  if (fallbackFormatted) return fallbackFormatted
  if (mark == null) return '-'
  return phaseTypeFromPhase(phase) === 'tiempo' ? formatSecondsToClock(mark) : String(mark)
}

function scoreInputConfig(phase) {
  const phaseType = phaseTypeFromPhase(phase)
  if (phaseType === 'tiempo') {
    return {
      type: 'text',
      placeholder: 'Ej: 12:34 o 01:12:34',
      label: 'Tiempo',
      helper: 'Usa HH:MM:SS o MM:SS',
    }
  }
  if (phaseType === 'posicion') {
    return {
      type: 'number',
      placeholder: 'Ej: 1',
      label: 'Posicion',
      helper: 'Ingresa la posicion final',
    }
  }
  return {
    type: 'number',
    placeholder: 'Ej: 210',
    label: 'Marca',
    helper: PHASE_MEASUREMENT_LABELS[normalizeMeasurementMethod(phase?.measurement_method, phase?.tipo)] || 'Valor numerico',
  }
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

function ScannerModal({
  open,
  onClose,
  isMobile,
  competitionName,
  operationMode,
  modalEntryMode,
  cameraOpen,
  startCamera,
  stopCameraAndClose,
  videoRef,
  canvasRef,
  cameraError,
  scanError,
  scanBusy,
  scanResult,
  scoreContext,
  scoreValue,
  onScoreValueChange,
  scoreBusy,
  scoreMsg,
  editingScore,
  onStartEditScore,
  onCancelEditScore,
  onSubmitScore,
  secondaryButtonStyle,
  scoreInputType,
  scoreInputLabel,
  scoreInputPlaceholder,
  scoreInputHelper,
}) {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    document.body.classList.toggle('fr-modal-open', open)
    return () => document.body.classList.remove('fr-modal-open')
  }, [open])

  if (!open) return null

  const resultTone = scanResult?.tone === 'success'
    ? { border: 'rgba(34,197,94,0.28)', bg: 'rgba(34,197,94,0.10)' }
    : scanResult?.tone === 'warning'
      ? { border: 'rgba(245,158,11,0.28)', bg: 'rgba(245,158,11,0.10)' }
      : { border: 'rgba(239,68,68,0.28)', bg: 'rgba(239,68,68,0.10)' }

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar escaner"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          border: 'none',
          background: 'rgba(0,0,0,0.68)',
          zIndex: 119,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Escaner QR"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isMobile
            ? 'calc(12px + env(safe-area-inset-top, 0px)) 12px calc(12px + env(safe-area-inset-bottom, 0px))'
            : '24px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 620,
            maxHeight: '100%',
            overflow: 'hidden',
            borderRadius: isMobile ? 22 : 28,
            border: '1px solid #252A33',
            background: 'linear-gradient(180deg, rgba(9,11,14,0.98), rgba(23,27,33,0.98))',
            boxShadow: '0 32px 90px rgba(0,0,0,0.46)',
            display: 'grid',
            gridTemplateRows: 'auto 1fr auto',
          }}
        >
          <div style={{ padding: isMobile ? 14 : 18, borderBottom: '1px solid #252A33', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#FFB36F', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1 }}>
                {modalEntryMode === 'manual' ? 'Carga manual' : 'Escaner QR'}
              </div>
              <div style={{ color: '#F5F7FA', fontSize: isMobile ? 20 : 24, fontWeight: 800, marginTop: 6, lineHeight: 1.1 }}>{competitionName || 'Competencia'}</div>
              <div style={{ color: '#AAB2C0', fontSize: 13, marginTop: 6 }}>
                {modalEntryMode === 'manual'
                  ? 'Confirma la entidad y carga la marca aqui mismo.'
                  : 'Escanea una sola vez y revisa el resultado aqui mismo.'}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                border: '1px solid #252A33',
                background: 'rgba(13,15,18,0.72)',
                color: '#F5F7FA',
                fontWeight: 800,
                fontSize: 20,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          <div style={{ padding: isMobile ? 14 : 18, overflowY: 'auto', display: 'grid', gap: 14 }}>
            {modalEntryMode !== 'manual' ? (
              <div style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid #252A33', background: '#090B0E', padding: 10, position: 'relative' }}>
                {cameraOpen ? (
                  <>
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
                        maxHeight: isMobile ? '58vh' : 430,
                        aspectRatio: isMobile ? '3 / 4' : '4 / 3',
                        objectFit: 'cover',
                        borderRadius: 14,
                        display: 'block',
                        background: '#000',
                      }}
                    />
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        inset: '10px',
                        pointerEvents: 'none',
                        borderRadius: 14,
                        boxShadow: 'inset 0 0 0 2px rgba(255,107,0,0.46)',
                      }}
                    />
                  </>
                ) : !scanResult ? (
                  <div style={{ minHeight: isMobile ? 300 : 360, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ color: '#F5F7FA', fontSize: 18, fontWeight: 800 }}>Iniciando camara</div>
                      <div style={{ color: '#AAB2C0', fontSize: 13 }}>Prepara el escaner para leer el siguiente QR.</div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {cameraError ? <div style={{ color: '#F59E0B', fontSize: 13 }}>{cameraError}</div> : null}
            {scanError ? <div style={{ color: '#EF4444', fontSize: 13 }}>{scanError}</div> : null}

            {scanResult ? (
              <div
                style={{
                  borderRadius: 18,
                  padding: 16,
                  border: `1px solid ${resultTone.border}`,
                  background: resultTone.bg,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: isMobile ? 16 : 18 }}>
                  {scanResult.tone === 'success' ? <CheckCircle2 size={20} /> : scanResult.tone === 'warning' ? <ShieldAlert size={20} /> : <XCircle size={20} />}
                  {scanResult.title}
                </div>
                <div style={{ marginTop: 8, color: '#D7DEE8', fontSize: 14, lineHeight: 1.5 }}>{scanResult.text}</div>
                {(scanResult.participantName || scanResult.category) ? (
                  <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                    {scanResult.participantName ? (
                      <div style={{ color: '#F5F7FA', fontSize: 18, fontWeight: 800 }}>
                        {scanResult.participantName}
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {scanResult.phaseCode ? (
                        <span style={{ borderRadius: 999, padding: '6px 12px', border: '1px solid rgba(170,178,192,0.22)', background: 'rgba(13,15,18,0.34)', color: '#D7DEE8', fontSize: 12, fontWeight: 700 }}>
                          {scanResult.phaseCode}
                        </span>
                      ) : null}
                      {scanResult.category ? (
                        <span style={{ borderRadius: 999, padding: '6px 12px', border: '1px solid rgba(170,178,192,0.22)', background: 'rgba(13,15,18,0.34)', color: '#D7DEE8', fontSize: 12, fontWeight: 700 }}>
                          {scanResult.category}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {operationMode === 'score' && scoreContext ? (
              <div style={{ borderRadius: 18, border: '1px solid #252A33', background: 'rgba(13,15,18,0.72)', padding: 14, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: '#F5F7FA', fontSize: 16, fontWeight: 800 }}>
                      {scoreContext?.participant?.name || 'Participante'}
                    </div>
                    <div style={{ color: '#AAB2C0', fontSize: 12, marginTop: 4 }}>
                      {scoreContext?.phase?.name || 'Evento'}{scoreContext?.participant?.category ? ` | ${scoreContext.participant.category}` : ''}
                    </div>
                  </div>
                  <span
                    style={{
                      borderRadius: 999,
                      padding: '5px 10px',
                      border: `1px solid ${scoreContext?.status === 'already_used' ? 'rgba(245,158,11,0.32)' : 'rgba(34,197,94,0.32)'}`,
                      background: scoreContext?.status === 'already_used' ? 'rgba(245,158,11,0.10)' : 'rgba(34,197,94,0.10)',
                      color: scoreContext?.status === 'already_used' ? '#F8C56E' : '#86EFAC',
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {scoreContext?.status === 'already_used' ? 'Ya usado' : 'Listo para cargar'}
                  </span>
                </div>

                {scoreContext?.existing ? (
                  <div style={{ borderRadius: 12, border: '1px solid rgba(245,158,11,0.24)', background: 'rgba(245,158,11,0.08)', padding: 10, display: 'grid', gap: 4 }}>
                    <div style={{ color: '#F5F7FA', fontWeight: 700, fontSize: 14 }}>
                      Puntuacion actual: {scoreContext.existing.formatted_mark || (scoreContext.existing.marca ?? '-')}
                    </div>
                    <div style={{ color: '#AAB2C0', fontSize: 12 }}>
                      Cargado: {scoreContext.existing.judge_at ? new Date(scoreContext.existing.judge_at).toLocaleString('es-CO') : (scoreContext.existing.created_at ? new Date(scoreContext.existing.created_at).toLocaleString('es-CO') : '-')}
                    </div>
                    <div style={{ color: '#AAB2C0', fontSize: 12 }}>
                      Juez: {scoreContext.existing.judge_name || 'Sin registro'}
                    </div>
                  </div>
                ) : null}

                {scoreMsg ? (
                  <div style={{ color: scoreMsg.type === 'error' ? '#FCA5A5' : scoreMsg.type === 'warning' ? '#FCD34D' : '#86EFAC', fontSize: 13 }}>
                    {scoreMsg.text}
                  </div>
                ) : null}

                {(scoreContext?.status === 'ready' || editingScore || scoreContext?.status === 'already_used') ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {(scoreContext?.status === 'ready' || editingScore) ? (
                      <>
                        <label style={{ color: '#AAB2C0', fontSize: 12 }}>{scoreInputLabel || 'Puntuacion'}</label>
                        <input
                          type={scoreInputType || 'text'}
                          value={scoreValue}
                          onChange={(event) => onScoreValueChange?.(event.target.value)}
                          placeholder={scoreInputPlaceholder || 'Ej: 210'}
                          style={{
                            borderRadius: 12,
                            border: '1px solid #252A33',
                            background: '#0D0F12',
                            color: '#F5F7FA',
                            padding: '10px 12px',
                            fontSize: 14,
                          }}
                        />
                        {scoreInputHelper ? <div style={{ color: '#6B7280', fontSize: 12 }}>{scoreInputHelper}</div> : null}
                      </>
                    ) : null}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {scoreContext?.status === 'ready' || editingScore ? (
                        <button
                          type="button"
                          onClick={onSubmitScore}
                          disabled={scoreBusy || String(scoreValue).trim() === ''}
                          style={{
                            borderRadius: 999,
                            border: '1px solid rgba(255,107,0,0.42)',
                            background: '#FF6B00',
                            color: '#0D0F12',
                            fontWeight: 800,
                            padding: '10px 14px',
                            fontSize: 13,
                            opacity: scoreBusy || String(scoreValue).trim() === '' ? 0.65 : 1,
                          }}
                        >
                          {scoreBusy ? 'Guardando...' : editingScore ? 'Guardar edicion' : 'Cargar puntuacion'}
                        </button>
                      ) : null}
                      {scoreContext?.status === 'already_used' && !editingScore ? (
                        <button type="button" onClick={onStartEditScore} style={secondaryButtonStyle}>
                          Editar puntuacion
                        </button>
                      ) : null}
                      {editingScore ? (
                        <button type="button" onClick={onCancelEditScore} style={secondaryButtonStyle}>
                          Cancelar
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div style={{ padding: isMobile ? 14 : 18, borderTop: '1px solid #252A33', display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ color: '#6B7280', fontSize: 12, alignSelf: 'center' }}>
              {modalEntryMode === 'manual'
                ? (scoreBusy ? 'Guardando resultado...' : 'Carga manual activa')
                : (scanBusy ? 'Procesando QR...' : cameraOpen ? 'Camara activa' : 'Listo para siguiente escaneo')}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {modalEntryMode !== 'manual' && scanResult ? (
                <button
                  type="button"
                  onClick={startCamera}
                  style={secondaryButtonStyle}
                >
                  Escanear otro
                </button>
              ) : modalEntryMode !== 'manual' ? (
                <button
                  type="button"
                  onClick={cameraOpen ? stopCameraAndClose : startCamera}
                  style={{
                    borderRadius: 999,
                    border: cameraOpen ? '1px solid #252A33' : '1px solid rgba(255,107,0,0.42)',
                    background: cameraOpen ? 'rgba(13,15,18,0.72)' : '#FF6B00',
                    color: cameraOpen ? '#F5F7FA' : '#0D0F12',
                    fontWeight: 800,
                    padding: isMobile ? '12px 16px' : '10px 16px',
                    fontSize: 14,
                    minHeight: 44,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <Camera size={16} />
                  {cameraOpen ? 'Cerrar camara' : 'Abrir camara'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default function JudgeHub() {
  const isMobile = useIsMobile()
  const [operationMode, setOperationMode] = useState('score')
  const [scoreEntryMode, setScoreEntryMode] = useState('qr')
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null)
  const [phases, setPhases] = useState([])
  const [scorePhases, setScorePhases] = useState([])
  const [phaseCode, setPhaseCode] = useState('check_in')
  const [station, setStation] = useState('Acceso principal')
  const [token, setToken] = useState('')
  const [manualPhaseId, setManualPhaseId] = useState('')
  const [manualQuery, setManualQuery] = useState('')
  const [manualCategory, setManualCategory] = useState('')
  const [manualHeatId, setManualHeatId] = useState('')
  const [manualStatus, setManualStatus] = useState('pending')
  const [manualRows, setManualRows] = useState([])
  const [manualHeats, setManualHeats] = useState([])
  const [manualLoading, setManualLoading] = useState(false)
  const [manualError, setManualError] = useState('')
  const [manualRefreshKey, setManualRefreshKey] = useState(0)
  const [scanBusy, setScanBusy] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [scanError, setScanError] = useState('')
  const [scoreContext, setScoreContext] = useState(null)
  const [scoreValue, setScoreValue] = useState('')
  const [scoreBusy, setScoreBusy] = useState(false)
  const [scoreMsg, setScoreMsg] = useState(null)
  const [editingScore, setEditingScore] = useState(false)
  const [scannerModalOpen, setScannerModalOpen] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(0)
  const scanLockRef = useRef(false)

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
            return
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
      setScorePhases([])
      setManualRows([])
      return
    }
    let cancelled = false
    Promise.all([
      api.get(`/competitions/${competitionId}/checkin/phases`),
      api.get(`/judge/competitions/${competitionId}/score/phases`),
    ])
      .then(([checkinRes, scoreRes]) => {
        if (cancelled) return
        const checkinItems = Array.isArray(checkinRes?.data) ? checkinRes.data : []
        const scoreItems = Array.isArray(scoreRes?.data) ? scoreRes.data : []
        setPhases(checkinItems)
        setPhaseCode(checkinItems[0]?.code || 'check_in')
        setScorePhases(scoreItems)
        setManualPhaseId((current) => {
          if (current && scoreItems.some((item) => String(item.id) === String(current))) return current
          return scoreItems[0]?.id ? String(scoreItems[0].id) : ''
        })
      })
      .catch(() => {
        if (cancelled) return
        setPhases([])
        setScorePhases([])
      })
    return () => {
      cancelled = true
    }
  }, [selectedAssignment?.competition_id, selectedAssignment?.status])

  useEffect(() => {
    const competitionId = selectedAssignment?.competition_id
    if (operationMode !== 'score' || scoreEntryMode !== 'manual' || !competitionId || !manualPhaseId) {
      if (scoreEntryMode !== 'manual') {
        setManualError('')
      }
      return
    }
    let cancelled = false
    setManualLoading(true)
    setManualError('')
    api.get(`/judge/competitions/${competitionId}/score/manual-options`, {
      params: {
        phase_id: Number(manualPhaseId),
        q: manualQuery || undefined,
        category: manualCategory || undefined,
        heat_id: manualHeatId ? Number(manualHeatId) : undefined,
        status: manualStatus || 'all',
      },
    })
      .then(({ data }) => {
        if (cancelled) return
        const items = Array.isArray(data?.items) ? data.items : []
        const heats = Array.isArray(data?.heats) ? data.heats : []
        setManualRows(items)
        setManualHeats(heats)
      })
      .catch((error) => {
        if (cancelled) return
        setManualRows([])
        setManualHeats([])
        setManualError(error?.response?.data?.detail || 'No se pudo cargar la lista manual.')
      })
      .finally(() => {
        if (!cancelled) setManualLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedAssignment?.competition_id, operationMode, scoreEntryMode, manualPhaseId, manualQuery, manualCategory, manualHeatId, manualStatus, manualRefreshKey])

  const parseCheckinScanResponse = (data) => {
    const user = data?.user || data?.participant || null
    const fullName = user ? `${user.nombre || ''} ${user.apellido || ''}`.trim() : ''
    if (data?.ok) {
      return {
        tone: 'success',
        title: 'QR valido',
        text: `${fullName || 'Usuario'} registrado en ${data?.phase_code || 'check_in'}.`,
        userName: fullName || 'Usuario',
        participantName: fullName || 'Usuario',
        category: user?.categoria || '',
        phaseCode: data?.phase_code || 'check_in',
      }
    }
    if (data?.status === 'already_used') {
      return {
        tone: 'warning',
        title: 'QR ya usado',
        text: `${fullName || 'Usuario'} ya tenia uso registrado para ${data?.phase_code || 'check_in'}.`,
        userName: fullName || 'Usuario',
        participantName: fullName || 'Usuario',
        category: user?.categoria || '',
        phaseCode: data?.phase_code || 'check_in',
      }
    }
    return {
      tone: 'danger',
      title: 'QR no valido',
      text: `Estado: ${data?.status || 'desconocido'}.`,
      userName: fullName || '',
      participantName: fullName || '',
      category: user?.categoria || '',
      phaseCode: data?.phase_code || 'check_in',
    }
  }

  const parseScoreScanResponse = (data) => {
    const participant = data?.user || data?.participant || {}
    const phase = data?.phase || {}
    const existing = data?.existing || null
    const participantName = participant?.name || 'Usuario'
    if (data?.status === 'ready') {
      return {
        tone: 'success',
        title: 'Listo para puntuacion',
        text: `${participantName} en ${phase?.name || 'Evento'}. Carga la puntuacion para registrar el resultado.`,
        participantName,
        category: participant?.category || '',
        phaseCode: phase?.name || '',
      }
    }
    if (data?.status === 'already_used' && existing) {
      const judgeLabel = existing?.judge_name ? ` por ${existing.judge_name}` : ''
      const whenLabel = existing?.judge_at ? ` (${new Date(existing.judge_at).toLocaleString('es-CO')})` : ''
      return {
        tone: 'warning',
        title: 'Resultado ya cargado',
        text: `Ya tiene puntuacion ${existing?.formatted_mark || (existing?.marca ?? '-')}${judgeLabel}${whenLabel}.`,
        participantName,
        category: participant?.category || '',
        phaseCode: phase?.name || '',
      }
    }
    if ((data?.status === 'created' || data?.status === 'updated') && (data?.existing || existing)) {
      const current = data?.existing || existing
      const judgeLabel = current?.judge_name ? ` por ${current.judge_name}` : ''
      const whenLabel = current?.judge_at ? ` (${new Date(current.judge_at).toLocaleString('es-CO')})` : ''
      return {
        tone: 'success',
        title: data?.status === 'updated' ? 'Puntuacion actualizada' : 'Puntuacion cargada',
        text: `Marcada en ${current?.formatted_mark || (current?.marca ?? '-')}${judgeLabel}${whenLabel}.`,
        participantName,
        category: participant?.category || '',
        phaseCode: phase?.name || '',
      }
    }
    return {
      tone: 'danger',
      title: 'QR no valido',
      text: 'No se pudo resolver la tarjeta para puntuacion.',
      participantName,
      category: participant?.category || '',
      phaseCode: phase?.name || '',
    }
  }

  const submitScan = async (rawToken) => {
    if (!selectedAssignment?.competition_id) return
    const nextToken = String(rawToken || '').trim()
    if (!nextToken || scanBusy || scanLockRef.current) return
    scanLockRef.current = true
    stopCamera()
    setCameraOpen(false)
    setScanBusy(true)
    setScanError('')
    setScoreMsg(null)
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `judge-scan-${Date.now()}`
      if (operationMode === 'checkin') {
        const { data } = await api.post(`/competitions/${selectedAssignment.competition_id}/checkin/scan`, {
          token: nextToken,
          phase_code: phaseCode || 'check_in',
          station: String(station || '').trim() || null,
          device_id: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 180) : null,
          idempotency_key: idempotencyKey,
        })
        setScanResult(parseCheckinScanResponse(data))
        setScoreContext(null)
        setScoreValue('')
        setEditingScore(false)
      } else {
        const { data } = await api.post('/judge/score/scan', {
          token: nextToken,
          station: String(station || '').trim() || null,
          device_id: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 180) : null,
          idempotency_key: idempotencyKey,
        })
        setScanResult(parseScoreScanResponse(data))
        setScoreContext({ ...data, token: data?.token || nextToken })
        setScoreValue(data?.existing?.marca != null ? String(data.existing.marca) : '')
        setEditingScore(false)
        setScannerModalOpen(true)
      }
      setToken('')
    } catch (err) {
      setScanError(err.response?.data?.detail || 'No se pudo procesar el QR.')
    } finally {
      setScanBusy(false)
      scanLockRef.current = false
    }
  }

  const submitScore = async () => {
    if (!scoreContext?.phase?.id) return
    const parsed = parseMetricByPhase(scoreValue, scoreContext.phase)
    if (parsed == null) {
      setScoreMsg({
        type: 'error',
        text: phaseTypeFromPhase(scoreContext.phase) === 'tiempo'
          ? 'Ingresa un tiempo valido. Usa HH:MM:SS o MM:SS.'
          : phaseTypeFromPhase(scoreContext.phase) === 'posicion'
            ? 'Ingresa una posicion valida.'
            : 'Ingresa una marca numerica valida.',
      })
      return
    }
    setScoreBusy(true)
    setScoreMsg(null)
    try {
      const endpoint = editingScore ? '/judge/score/edit' : '/judge/score/submit'
      const payload = scoreContext?.token
        ? {
            token: scoreContext.token,
            marca_raw: String(scoreValue).trim(),
            station: String(station || '').trim() || null,
            device_id: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 180) : null,
          }
        : {
            competition_id: Number(scoreContext.competition_id || selectedAssignment?.competition_id),
            phase_id: Number(scoreContext.phase.id),
            user_id: scoreContext?.user?.id ?? scoreContext?.participant?.id ?? scoreContext?.user_id ?? null,
            team_id: scoreContext?.team?.id ?? null,
            marca_raw: String(scoreValue).trim(),
            station: String(station || '').trim() || null,
            device_id: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 180) : null,
          }
      const { data } = await api.post(endpoint, {
        ...payload,
      })
      setScoreContext(data)
      setScanResult(parseScoreScanResponse(data))
      setEditingScore(false)
      setScoreValue(data?.existing?.formatted_mark || formatMarkForPhase(parsed, scoreContext.phase))
      if (data?.status === 'created') {
        setScoreMsg({ type: 'success', text: 'Puntuacion cargada correctamente.' })
      } else if (data?.status === 'updated') {
        setScoreMsg({ type: 'success', text: 'Puntuacion actualizada.' })
      } else if (data?.status === 'already_used') {
        setScoreMsg({ type: 'warning', text: 'Este QR ya tenia una puntuacion registrada.' })
      }
      if (scoreEntryMode === 'manual') {
        setManualRefreshKey((current) => current + 1)
      }
    } catch (error) {
      setScoreMsg({ type: 'error', text: error?.response?.data?.detail || 'No se pudo guardar la puntuacion.' })
    } finally {
      setScoreBusy(false)
    }
  }

  const openManualSelection = async (item) => {
    if (!selectedAssignment?.competition_id || !manualPhaseId) return
    setScoreBusy(true)
    setScoreMsg(null)
    setScanError('')
    setScanResult(null)
    try {
      const { data } = await api.post('/judge/score/manual-resolve', {
        competition_id: Number(selectedAssignment.competition_id),
        phase_id: Number(manualPhaseId),
      user_id: item?.user_id ?? null,
        team_id: item?.team_id ?? null,
      })
      setScoreContext(data)
      setScoreValue(data?.existing?.formatted_mark || '')
      setEditingScore(false)
      setScanResult(parseScoreScanResponse(data))
      setScannerModalOpen(true)
    } catch (error) {
      setManualError(error?.response?.data?.detail || 'No se pudo abrir la carga manual.')
    } finally {
      setScoreBusy(false)
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
    setScannerModalOpen(true)
    setCameraError('')
    setScanError('')
    setScanResult(null)
    scanLockRef.current = false
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
  const activeManualPhase = useMemo(
    () => scorePhases.find((item) => String(item.id) === String(manualPhaseId)) || null,
    [scorePhases, manualPhaseId],
  )
  const scoreFieldConfig = scoreInputConfig(scoreContext?.phase || activeManualPhase)
  const manualCategories = useMemo(
    () => Array.from(new Set((manualRows || []).map((item) => String(item.category || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [manualRows],
  )
  const closeScannerModal = () => {
    stopCamera()
    setCameraOpen(false)
    setScannerModalOpen(false)
    setScanResult(null)
    setScanError('')
    setCameraError('')
    setScoreContext(null)
    setScoreMsg(null)
    setEditingScore(false)
    setScoreValue('')
    scanLockRef.current = false
    if (scoreEntryMode === 'manual') {
      setManualRefreshKey((current) => current + 1)
    }
  }

  return (
    <div style={pageStyle}>
      <ScannerModal
        open={scannerModalOpen}
        onClose={closeScannerModal}
        isMobile={isMobile}
        competitionName={selectedAssignment?.competition_name}
        operationMode={operationMode}
        modalEntryMode={scoreContext?.token ? 'qr' : 'manual'}
        cameraOpen={cameraOpen}
        startCamera={startCamera}
        stopCameraAndClose={closeScannerModal}
        videoRef={videoRef}
        canvasRef={canvasRef}
        cameraError={cameraError}
        scanError={scanError}
        scanBusy={scanBusy}
        scanResult={scanResult}
        scoreContext={scoreContext}
        scoreValue={scoreValue}
        onScoreValueChange={setScoreValue}
        scoreBusy={scoreBusy}
        scoreMsg={scoreMsg}
        editingScore={editingScore}
        onStartEditScore={() => {
          setEditingScore(true)
          setScoreValue(scoreContext?.existing?.formatted_mark || '')
          setScoreMsg(null)
        }}
        onCancelEditScore={() => {
          setEditingScore(false)
          setScoreValue(scoreContext?.existing?.formatted_mark || '')
        }}
        onSubmitScore={submitScore}
        secondaryButtonStyle={secondaryButtonStyle}
        scoreInputType={scoreFieldConfig.type}
        scoreInputLabel={scoreFieldConfig.label}
        scoreInputPlaceholder={scoreFieldConfig.placeholder}
        scoreInputHelper={scoreFieldConfig.helper}
      />
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
            {isMobile ? 'Control QR de juez.' : 'Control de competencia para jueces.'}
          </h1>
          <p style={{ margin: 0, color: '#AAB2C0', fontSize: isMobile ? 13 : 15, lineHeight: 1.6 }}>
            {isMobile
              ? 'Escanea, carga puntuaciones y valida estado de cada tarjeta.'
              : 'Revisa tus asignaciones activas, escanea QR y registra resultados en tiempo real.'}
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
                    Escaneo QR o carga manual para check-in y resultados.
                  </div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '6px 10px', border: '1px solid rgba(0,194,168,0.28)', background: 'rgba(0,194,168,0.10)', color: '#7AF0DE', fontWeight: 800, fontSize: 11 }}>
                  <QrCode size={14} />
                  Operacion juez
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => {
                    setOperationMode('score')
                    setScoreEntryMode('qr')
                    setScanResult(null)
                    setScoreContext(null)
                    setScoreMsg(null)
                    setEditingScore(false)
                  }}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${operationMode === 'score' ? 'rgba(255,107,0,0.42)' : '#252A33'}`,
                    background: operationMode === 'score' ? 'rgba(255,107,0,0.14)' : 'rgba(13,15,18,0.72)',
                    color: '#F5F7FA',
                    fontWeight: 800,
                    padding: '8px 14px',
                    fontSize: 13,
                  }}
                >
                  Cargar resultados
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOperationMode('checkin')
                    setScanResult(null)
                    setScoreContext(null)
                    setScoreMsg(null)
                    setEditingScore(false)
                  }}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${operationMode === 'checkin' ? 'rgba(0,194,168,0.42)' : '#252A33'}`,
                    background: operationMode === 'checkin' ? 'rgba(0,194,168,0.14)' : 'rgba(13,15,18,0.72)',
                    color: '#F5F7FA',
                    fontWeight: 800,
                    padding: '8px 14px',
                    fontSize: 13,
                  }}
                >
                  Check-in
                </button>
              </div>

                <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
                  <div style={{ display: 'grid', gap: isMobile ? 10 : 12, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                    {operationMode === 'checkin' ? (
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
                  ) : (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <label style={{ color: '#AAB2C0', fontSize: 12 }}>Operacion</label>
                      <input value="Carga de resultados por QR de tarjeta" readOnly style={{ ...inputBaseStyle, opacity: 0.85 }} />
                    </div>
                  )}

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

                {operationMode === 'score' ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setScoreEntryMode('qr')}
                        style={{
                          borderRadius: 999,
                          border: `1px solid ${scoreEntryMode === 'qr' ? 'rgba(255,107,0,0.42)' : '#252A33'}`,
                          background: scoreEntryMode === 'qr' ? 'rgba(255,107,0,0.14)' : 'rgba(13,15,18,0.72)',
                          color: '#F5F7FA',
                          fontWeight: 800,
                          padding: '8px 14px',
                          fontSize: 13,
                        }}
                      >
                        QR
                      </button>
                      <button
                        type="button"
                        onClick={() => setScoreEntryMode('manual')}
                        style={{
                          borderRadius: 999,
                          border: `1px solid ${scoreEntryMode === 'manual' ? 'rgba(0,194,168,0.42)' : '#252A33'}`,
                          background: scoreEntryMode === 'manual' ? 'rgba(0,194,168,0.14)' : 'rgba(13,15,18,0.72)',
                          color: '#F5F7FA',
                          fontWeight: 800,
                          padding: '8px 14px',
                          fontSize: 13,
                        }}
                      >
                        Carga manual
                      </button>
                    </div>

                    {scoreEntryMode === 'qr' ? (
                      <>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={startCamera}
                            style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                          >
                            <Camera size={16} />
                            Abrir camara
                          </button>
                        </div>

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
                              onClick={() => {
                                setCameraError('')
                                if (operationMode === 'score') setScannerModalOpen(true)
                                submitScan(token)
                              }}
                              disabled={scanBusy || !token.trim()}
                              style={{ ...secondaryButtonStyle, width: '100%', flex: 'none', opacity: scanBusy || !token.trim() ? 0.6 : 1 }}
                            >
                              {scanBusy ? 'Procesando...' : 'Validar token'}
                            </button>
                          </div>
                        </details>
                      </>
                    ) : (
                      <div style={{ display: 'grid', gap: 12 }}>
                        <div style={{ display: 'grid', gap: isMobile ? 10 : 12, gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
                          <div style={{ display: 'grid', gap: 6 }}>
                            <label style={{ color: '#AAB2C0', fontSize: 12 }}>Evento</label>
                            <select value={manualPhaseId} onChange={(event) => setManualPhaseId(event.target.value)} style={inputBaseStyle}>
                              {scorePhases.map((phase) => (
                                <option key={phase.id} value={phase.id}>{phase.nombre}</option>
                              ))}
                            </select>
                          </div>
                          <div style={{ display: 'grid', gap: 6 }}>
                            <label style={{ color: '#AAB2C0', fontSize: 12 }}>Buscar atleta o equipo</label>
                            <input
                              value={manualQuery}
                              onChange={(event) => setManualQuery(event.target.value)}
                              placeholder="Nombre, cedula o equipo"
                              style={inputBaseStyle}
                            />
                          </div>
                          <div style={{ display: 'grid', gap: 6 }}>
                            <label style={{ color: '#AAB2C0', fontSize: 12 }}>Categoria</label>
                            <select value={manualCategory} onChange={(event) => setManualCategory(event.target.value)} style={inputBaseStyle}>
                              <option value="">Todas</option>
                              {manualCategories.map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>
                          </div>
                          <div style={{ display: 'grid', gap: 6 }}>
                            <label style={{ color: '#AAB2C0', fontSize: 12 }}>Heat</label>
                            <select value={manualHeatId} onChange={(event) => setManualHeatId(event.target.value)} style={inputBaseStyle}>
                              <option value="">Todos</option>
                              {manualHeats.map((heat) => <option key={heat.id} value={heat.id}>{heat.nombre}</option>)}
                            </select>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {['pending', 'scored', 'all'].map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => setManualStatus(item)}
                              style={{
                                borderRadius: 999,
                                border: `1px solid ${manualStatus === item ? 'rgba(0,194,168,0.42)' : '#252A33'}`,
                                background: manualStatus === item ? 'rgba(0,194,168,0.14)' : 'rgba(13,15,18,0.72)',
                                color: '#F5F7FA',
                                fontWeight: 800,
                                padding: '8px 14px',
                                fontSize: 12,
                              }}
                            >
                              {item === 'pending' ? 'Pendientes' : item === 'scored' ? 'Cargados' : 'Todos'}
                            </button>
                          ))}
                        </div>

                        <div style={{ borderRadius: 16, border: '1px solid #252A33', background: 'rgba(13,15,18,0.55)', padding: 12, display: 'grid', gap: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ color: '#F5F7FA', fontWeight: 800 }}>Pendientes y cargados</div>
                            {activeManualPhase ? (
                              <div style={{ color: '#AAB2C0', fontSize: 12 }}>
                                {activeManualPhase.nombre} | {PHASE_MEASUREMENT_LABELS[normalizeMeasurementMethod(activeManualPhase.measurement_method, activeManualPhase.tipo)] || activeManualPhase.tipo}
                              </div>
                            ) : null}
                          </div>
                          {manualError ? <div style={{ color: '#FCA5A5', fontSize: 13 }}>{manualError}</div> : null}
                          {manualLoading ? <div style={{ color: '#AAB2C0', fontSize: 13 }}>Cargando lista...</div> : null}
                          {!manualLoading && !manualRows.length ? <div style={{ color: '#AAB2C0', fontSize: 13 }}>No hay coincidencias con los filtros actuales.</div> : null}
                          {!manualLoading && manualRows.length ? (
                            <div style={{ display: 'grid', gap: 8, maxHeight: isMobile ? 'none' : 420, overflowY: isMobile ? 'visible' : 'auto' }}>
                              {manualRows.map((item) => (
                                <button
                    key={`${item.entity_type}-${item.user_id || item.team_id}`}
                                  type="button"
                                  onClick={() => openManualSelection(item)}
                                  style={{
                                    textAlign: 'left',
                                    borderRadius: 14,
                                    border: '1px solid #252A33',
                                    background: 'rgba(9,11,14,0.72)',
                                    color: '#F5F7FA',
                                    padding: 12,
                                    display: 'grid',
                                    gap: 6,
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                    <div style={{ fontWeight: 800 }}>{item.display_name}</div>
                                    <span style={{
                                      borderRadius: 999,
                                      padding: '4px 10px',
                                      border: `1px solid ${item.status === 'scored' ? 'rgba(245,158,11,0.28)' : 'rgba(34,197,94,0.28)'}`,
                                      background: item.status === 'scored' ? 'rgba(245,158,11,0.10)' : 'rgba(34,197,94,0.10)',
                                      color: item.status === 'scored' ? '#F8C56E' : '#86EFAC',
                                      fontSize: 11,
                                      fontWeight: 800,
                                    }}>
                                      {item.status === 'scored' ? `Cargado${item.existing_formatted ? `: ${item.existing_formatted}` : ''}` : 'Pendiente'}
                                    </span>
                                  </div>
                                  <div style={{ color: '#AAB2C0', fontSize: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {item.category ? <span>{item.category}</span> : null}
                                    {item.heat_name ? <span>{item.heat_name}</span> : null}
                                    {item.lane_number ? <span>Carril {item.lane_number}</span> : null}
                                    {item.cedula ? <span>ID {item.cedula}</span> : null}
                                  </div>
                                  {Array.isArray(item.member_names) && item.member_names.length ? (
                                    <div style={{ color: '#6B7280', fontSize: 12 }}>{item.member_names.join(' | ')}</div>
                                  ) : null}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={startCamera}
                        style={{ ...primaryButtonStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                      >
                        <Camera size={16} />
                        Abrir camara
                      </button>
                    </div>

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
                  </>
                )}
              </div>

            </SectionCard>
          </div>
        ) : null}

        {!isMobile ? (
          <SectionCard mobile={isMobile}>
            <div style={{ fontWeight: 800 }}>Siguiente paso</div>
            <div style={{ marginTop: 8, color: '#AAB2C0', lineHeight: 1.6 }}>
              Este modulo ya permite check-in, carga por QR y seleccion manual de atleta o equipo, con validacion por tipo de medicion y edicion cuando se requiere corregir una marca.
            </div>
            <div style={{ marginTop: 10, color: '#FFB36F', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ChevronRight size={15} />
              Operacion de juez activa
            </div>
          </SectionCard>
        ) : null}
      </div>
    </div>
  )
}
