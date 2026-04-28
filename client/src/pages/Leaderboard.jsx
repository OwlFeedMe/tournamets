import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Clock3, Circle } from 'lucide-react'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { COMPETITION_PAGE_MAX_WIDTH } from '../utils/competitionLayout'

const DEFAULT_POLL_INTERVAL_MS = 5000
const DEFAULT_TV_ROTATION_INTERVAL_MS = 24000
const ACTIVE_TIMER_POLL_INTERVAL_MS = 3000
const IDLE_TIMER_POLL_INTERVAL_MS = 30000
const CATEGORY_ORDER = ['Rx', 'Scaled', 'Masters', 'Teens', 'Otro', 'Sin categoria']
const THEME = {
  primary: '#D6D9E0',
  primaryHover: '#F1F4F8',
  accent: '#5EEAD4',
  border: 'rgba(214, 217, 224, 0.14)',
  ink: '#F5F7FA',
  paper: '#0D0F12',
  surface: '#171A20',
  muted: '#C7CDD6',
  soft: '#8B94A3',
}

function safeServerNowMs(value) {
  const ms = Date.parse(value || '')
  return Number.isFinite(ms) ? ms : null
}

function smoothClockOffset(prevOffset, nextOffset) {
  if (prevOffset == null) return nextOffset
  return prevOffset + ((nextOffset - prevOffset) * 0.2)
}

function timerPollIntervalMs(timerData) {
  if (!timerData) return ACTIVE_TIMER_POLL_INTERVAL_MS
  if (timerData.state === 'running') return ACTIVE_TIMER_POLL_INTERVAL_MS
  return IDLE_TIMER_POLL_INTERVAL_MS
}


function orderCategories(data) {
  const keys = Object.keys(data || {})
  return CATEGORY_ORDER.filter(c => keys.includes(c)).concat(keys.filter(c => !CATEGORY_ORDER.includes(c)))
}

function phaseMetricLabel(phaseInfo) {
  if (!phaseInfo) return 'Marca'
  const method = (phaseInfo.measurement_method || '').toString().toLowerCase()
  if (method === 'for_time' || method === 'tiempo_hms') return 'Tiempo'
  if (method === 'metros') return 'Metros (m)'
  if (method === 'amrap' || method === 'emom' || method === 'repeticiones') return 'Repeticiones'
  if (method === 'rm' || method === 'kilogramos' || method === 'gramos' || method === 'libras') return 'Peso'
  if (method === 'posicion') return 'Posicion'
  const t = (phaseInfo.tipo || '').toString().toLowerCase()
  if (t === 'tiempo') return 'Tiempo'
  if (t === 'posicion') return 'Posicion'
  return 'Marca'
}

function formatSecondsToHMS(totalSeconds) {
  const n = Number(totalSeconds)
  if (!Number.isFinite(n)) return '-'
  const secs = Math.max(0, Math.floor(n))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function metricValue(v, phaseInfo) {
  if (v == null) return '-'
  const method = (phaseInfo?.measurement_method || '').toString().toLowerCase()
  if (method === 'for_time' || method === 'tiempo_hms') return formatSecondsToHMS(v)
  if (method === 'metros') return `${v} m`
  if (method === 'amrap' || method === 'emom' || method === 'repeticiones') return `${v} reps`
  if (method === 'rm' || method === 'kilogramos' || method === 'gramos' || method === 'libras') return `${v}`
  if (method === 'posicion') return `#${v}`
  return v
}

function phaseStatusIcon(estado, size = 14) {
  if (estado === 'finalizada') return <CheckCircle2 size={size} style={{ color: '#2e7d32' }} />
  if (estado === 'en_progreso') return <Clock3 size={size} style={{ color: '#b26a00' }} />
  return <Circle size={size} style={{ color: '#8a9489' }} />
}

function phaseStatusSuffix(estado) {
  if (estado === 'finalizada') return ' ✓'
  if (estado === 'en_progreso') return ' ⏳'
  return ''
}
// â”€â”€ Skeleton â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SkeletonRow({ cols = 5 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i}>
          <div className="skeleton" style={{ height: 14, borderRadius: 4, width: i === 1 ? '80%' : '50%' }} />
        </td>
      ))}
    </tr>
  )
}

function SkeletonTable({ rows = 5 }) {
  return (
    <table>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} />)}
      </tbody>
    </table>
  )
}

// â”€â”€ Category badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CategoryBadge({ cat }) {
  const map = { Rx: 'badge-rx', Scaled: 'badge-scaled', Masters: 'badge-masters' }
  return <span className={`badge ${map[cat] || 'badge-default'}`}>{cat}</span>
}

// â”€â”€ Rank medal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function RankCell({ rank, tvMode = false }) {
  const podiumSize = tvMode ? 26 : 20
  if (rank === 1) return <span style={{ fontSize: podiumSize }}>1</span>
  if (rank === 2) return <span style={{ fontSize: podiumSize }}>2</span>
  if (rank === 3) return <span style={{ fontSize: podiumSize }}>3</span>
  return <span style={{ color: '#666', fontWeight: 600 }}>{rank}</span>
}

// â”€â”€ Movement indicator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MoveBadge({ delta, tvMode = false }) {
  if (delta === 0 || delta === null) return null
  const size = tvMode ? 14 : 11
  const pad = tvMode ? '2px 8px' : '1px 6px'
  if (delta > 0) {
    return (
      <span style={{ color: THEME.accent, background: 'rgba(94,234,212,0.12)', border: '1px solid rgba(94,234,212,0.28)', borderRadius: 999, padding: pad, fontSize: size, fontWeight: 700 }}>
        +{delta}
      </span>
    )
  }
  return (
    <span style={{ color: '#8a3f5b', background: '#fdeff4', border: '1px solid #efbfd0', borderRadius: 999, padding: pad, fontSize: size, fontWeight: 700 }}>
      -{Math.abs(delta)}
    </span>
  )
}

function MoveSlot({ delta, tvMode = false }) {
  return (
    <span style={{ display: 'inline-flex', width: tvMode ? 56 : 44, justifyContent: 'center' }}>
      <MoveBadge delta={delta} tvMode={tvMode} />
    </span>
  )
}

function totalEntryFor(map, id) {
  if (!map) return null
  const entry = map[id]
  if (entry == null) return null
  if (typeof entry === 'object') return entry
  return { puntos: entry, rank: null }
}

function athleteDisplayName(athlete) {
  return [athlete?.nombre, athlete?.apellido].filter(Boolean).join(' ').trim() || 'Atleta'
}

function AthleteProfileLink({ athlete, children, style }) {
  if (!athlete?.username) {
    return <span style={style}>{children}</span>
  }
  return (
    <Link
      to={`/a/${athlete.username}`}
      style={{
        color: 'inherit',
        textDecoration: 'none',
        ...style,
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </Link>
  )
}

// â”€â”€ Individual leaderboard table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function IndividualTable({ data, prevData, showEventCount, isMobile, totalScoreMap, phaseInfo, tvMode = false }) {
  const prevMap = useRef({})

  useEffect(() => {
    if (prevData) {
      const map = {}
      Object.values(prevData).forEach(entries => entries.forEach(p => { map[p.id] = p.rank }))
      prevMap.current = map
    }
  }, [prevData])

  return (
    <>
      {CATEGORY_ORDER.filter(c => data[c]).concat(Object.keys(data).filter(c => !CATEGORY_ORDER.includes(c))).map(cat => {
        if (!data[cat]) return null
        return (
          <div key={cat} style={{ marginBottom: isMobile ? 20 : 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <CategoryBadge cat={cat} />
              <span style={{ color: '#5f685e', fontSize: tvMode ? 18 : 13 }}>{data[cat].length} atletas</span>
            </div>
            {isMobile ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {data[cat].map(p => {
                  const prev = prevMap.current[p.id]
                  const delta = prev != null ? prev - p.rank : null
                  const isNew = prev == null
                  const totalEntry = totalEntryFor(totalScoreMap, p.id)
                  const isPhaseView = !!totalScoreMap
                  return (
                    <div
                      key={p.id}
                      className={delta > 0 ? 'row-up' : delta < 0 ? 'row-down' : isNew ? 'row-new' : ''}
                      style={{ background: '#fff', border: '1px solid #d5ddd3', borderRadius: 10, padding: '10px 12px' }}
                    >
                      {/* Header: rank + name + movement */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: p.rank <= 3 ? 22 : 16, fontWeight: 700, minWidth: 26, color: p.rank <= 3 ? THEME.primary : THEME.muted }}>#{p.rank}</span>
                        <AthleteProfileLink
                          athlete={p}
                          style={{ fontWeight: p.rank <= 3 ? 700 : 500, flex: 1, fontSize: 14, minWidth: 0 }}
                        >
                          {athleteDisplayName(p)}
                        </AthleteProfileLink>
                        <MoveBadge delta={delta} />
                      </div>

                      {/* Score chips */}
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                        <div style={{ flex: 1, background: isPhaseView ? '#f0f5ee' : '#f8fbf8', borderRadius: 7, padding: '6px 8px', textAlign: 'center', border: `1px solid ${isPhaseView ? '#c8d9c2' : '#e4eae3'}` }}>
                          <div style={{ fontSize: 10, color: '#8a9489', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Puntos</div>
                          <div style={{ fontWeight: 800, fontSize: 20, lineHeight: 1, color: p.total_puntos > 0 ? THEME.primary : THEME.soft }}>{p.total_puntos}</div>
                        </div>
                        {isPhaseView && (
                          <div style={{ flex: 1, background: '#f8fbf8', borderRadius: 7, padding: '6px 8px', textAlign: 'center', border: '1px solid #e4eae3' }}>
                            <div style={{ fontSize: 10, color: '#8a9489', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Total · #{totalEntry?.rank ?? '-'}</div>
                            <div style={{ fontWeight: 600, fontSize: 18, lineHeight: 1, color: '#8a9489' }}>{totalEntry?.puntos ?? '-'}</div>
                          </div>
                        )}
                      </div>

                      {/* Meta row */}
                      <div style={{ display: 'flex', gap: 10, color: '#6d756c', fontSize: 12, flexWrap: 'wrap' }}>
                        {phaseInfo && p.mejor_marca != null && (
                          <span style={{ color: '#4d564b', fontWeight: 500 }}>{phaseMetricLabel(phaseInfo)}: <b>{metricValue(p.mejor_marca, phaseInfo)}</b></span>
                        )}
                        <span>Sexo: {p.sexo || '-'}</span>
                        {showEventCount && <span>Registros: {p.total_eventos}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>Pos Evento</th>
                    <th>Nombre</th>
                    <th>Sexo</th>
                    {showEventCount && <th style={{ textAlign: 'right' }}>Registros</th>}
                    {phaseInfo && <th style={{ textAlign: 'center' }}>{phaseMetricLabel(phaseInfo)}</th>}
                    <th style={{ textAlign: 'center' }}>Puntos</th>
                    {totalScoreMap && <th style={{ textAlign: 'center', color: '#8a9489', borderLeft: '2px solid #d5ddd3' }}>Total</th>}
                    {totalScoreMap && <th style={{ width: 80, textAlign: 'center', color: '#8a9489' }}>Pos Gral</th>}
                  </tr>
                </thead>
                <tbody>
                  {data[cat].map(p => {
                    const prev = prevMap.current[p.id]
                    const delta = prev != null ? prev - p.rank : null
                    const isNew = prev == null
                    const totalEntry = totalEntryFor(totalScoreMap, p.id)
                    return (
                      <tr
                        key={p.id}
                        className={delta > 0 ? 'row-up' : delta < 0 ? 'row-down' : isNew ? 'row-new' : ''}
                        style={{ transition: 'background 0.6s' }}
                      >
                        <td style={{ textAlign: 'center' }}><RankCell rank={p.rank} tvMode={tvMode} /></td>
                        <td style={{ fontWeight: p.rank <= 3 ? 700 : 400 }}>
                          <AthleteProfileLink athlete={p}>
                            {athleteDisplayName(p)}
                          </AthleteProfileLink>
                          <span style={{ marginLeft: 8 }}><MoveSlot delta={delta} tvMode={tvMode} /></span>
                        </td>
                        <td style={{ color: '#6d756c' }}>{p.sexo || '-'}</td>
                        {showEventCount && <td style={{ textAlign: 'right', color: '#6d756c' }}>{p.total_eventos}</td>}
                        {phaseInfo && <td style={{ textAlign: 'center', color: '#6d756c' }}>{metricValue(p.mejor_marca, phaseInfo)}</td>}
                        <td style={{ textAlign: 'center', fontWeight: 700, fontSize: tvMode ? 26 : 16, color: p.total_puntos > 0 ? THEME.primary : THEME.soft }}>
                          {p.total_puntos}
                        </td>
                        {totalScoreMap && (
                          <td style={{ textAlign: 'center', fontWeight: 500, fontSize: tvMode ? 22 : 14, color: '#8a9489', borderLeft: '2px solid #e0e7df' }}>
                            {totalEntry ? (
                              <span>{totalEntry.puntos ?? '-'}</span>
                            ) : '-'}
                          </td>
                        )}
                        {totalScoreMap && (
                          <td style={{ textAlign: 'center', color: '#8a9489', fontWeight: 600, fontSize: tvMode ? 20 : undefined }}>
                            {totalEntry?.rank ?? '-'}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </>
  )
}

// â”€â”€ Team leaderboard table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function TeamsTable({ data, prevData, showEventCount, phaseMode, isMobile, totalScoreMap, phaseInfo, tvMode = false }) {
  const prevMap = useRef({})

  useEffect(() => {
    if (prevData) {
      const map = {}
      prevData.forEach((t, i) => { map[t.id] = t.rank ?? (i + 1) })
      prevMap.current = map
    }
  }, [prevData])

  if (!data.length) return <p style={{ color: '#5f685e', textAlign: 'center', padding: 40 }}>No hay equipos registrados en esta competencia</p>

  if (isMobile) {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {data.map((t, idx) => {
          const visibleRank = t.rank ?? (idx + 1)
          const prev = prevMap.current[t.id]
          const delta = prev != null ? prev - visibleRank : null
          const teamName = (t.nombre || '').trim() || `Equipo ${t.id}`
          const members = t.members || []
          const totalEntry = totalEntryFor(totalScoreMap, t.id)
          const isPhaseView = !!totalScoreMap
          return (
            <div key={t.id} className={delta > 0 ? 'row-up' : delta < 0 ? 'row-down' : ''} style={{ background: '#fff', border: '1px solid #d5ddd3', borderRadius: 10, padding: '10px 12px' }}>
              {/* Header: rank + team name + movement */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: visibleRank <= 3 ? 22 : 16, fontWeight: 700, minWidth: 26, color: visibleRank <= 3 ? THEME.primary : THEME.muted }}>#{visibleRank}</span>
                <span style={{ fontWeight: visibleRank <= 3 ? 700 : 500, flex: 1, fontSize: 14 }}>{teamName}</span>
                <MoveBadge delta={delta} />
              </div>

              {/* Score chips */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <div style={{ flex: 1, background: isPhaseView ? '#f0f5ee' : '#f8fbf8', borderRadius: 7, padding: '6px 8px', textAlign: 'center', border: `1px solid ${isPhaseView ? '#c8d9c2' : '#e4eae3'}` }}>
                  <div style={{ fontSize: 10, color: '#8a9489', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Puntos</div>
                  <div style={{ fontWeight: 800, fontSize: 20, lineHeight: 1, color: t.total_puntos > 0 ? THEME.primary : THEME.soft }}>{t.total_puntos}</div>
                  {phaseInfo && t.mejor_marca != null && (
                    <div style={{ fontSize: 11, color: '#6d756c', marginTop: 3 }}>{phaseMetricLabel(phaseInfo)}: {metricValue(t.mejor_marca, phaseInfo)}</div>
                  )}
                </div>
                {isPhaseView && (
                  <div style={{ flex: 1, background: '#f8fbf8', borderRadius: 7, padding: '6px 8px', textAlign: 'center', border: '1px solid #e4eae3' }}>
                    <div style={{ fontSize: 10, color: '#8a9489', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Total · #{totalEntry?.rank ?? '-'}</div>
                    <div style={{ fontWeight: 600, fontSize: 18, lineHeight: 1, color: '#8a9489' }}>{totalEntry?.puntos ?? '-'}</div>
                  </div>
                )}
              </div>

              {/* Members */}
              <div style={{ borderTop: '1px solid #eef2ed', paddingTop: 6, display: 'grid', gap: 3 }}>
                {members.map(m => {
                  const didTest = Number(m.puntos_propios || 0) > 0 || m.mejor_marca != null
                  const color = didTest ? THEME.ink : '#8a9489'
                  const weight = didTest ? 600 : 400
                  return (
                    <div key={m.id} style={{ fontSize: 12, color, fontWeight: weight, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <AthleteProfileLink athlete={m} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                        {athleteDisplayName(m)}
                      </AthleteProfileLink>
                      {phaseMode !== 'total' && phaseInfo && m.mejor_marca != null && (
                        <span style={{ color: '#6d756c', fontSize: 11 }}>{metricValue(m.mejor_marca, phaseInfo)}</span>
                      )}
                    </div>
                  )
                })}
              </div>
              {showEventCount && <div style={{ marginTop: 4, color: '#8a9489', fontSize: 12 }}>Registros: {t.total_eventos}</div>}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <table>
      <thead>
        <tr>
          <th style={{ width: 50 }}>Pos Evento</th>
          <th>Equipo</th>
          <th>Integrantes</th>
          {showEventCount && <th style={{ textAlign: 'right' }}>Registros</th>}
          {phaseInfo && <th style={{ textAlign: 'center' }}>{phaseMetricLabel(phaseInfo)}</th>}
          <th style={{ textAlign: 'center' }}>Puntos</th>
          {totalScoreMap && <th style={{ textAlign: 'center', color: '#8a9489', borderLeft: '2px solid #d5ddd3' }}>Total</th>}
          {totalScoreMap && <th style={{ width: 80, textAlign: 'center', color: '#8a9489' }}>Pos Gral</th>}
        </tr>
      </thead>
      <tbody>
        {data.map((t, idx) => {
          const visibleRank = t.rank ?? (idx + 1)
          const prev = prevMap.current[t.id]
          const delta = prev != null ? prev - visibleRank : null
          const teamName = (t.nombre || '').trim() || `Equipo ${t.id}`
          const members = t.members || []
          const totalEntry = totalEntryFor(totalScoreMap, t.id)
          return (
            <tr key={t.id} className={delta > 0 ? 'row-up' : delta < 0 ? 'row-down' : ''}>
              <td style={{ textAlign: 'center' }}><RankCell rank={visibleRank} tvMode={tvMode} /></td>
              <td>
                <div style={{ fontWeight: visibleRank <= 3 ? 700 : 400 }}>
                  {teamName}
                  <span style={{ marginLeft: 8 }}><MoveSlot delta={delta} tvMode={tvMode} /></span>
                </div>
              </td>
              <td>
                <div style={{ display: 'grid', gap: 2 }}>
                  {members.map(m => {
                    const didTest = Number(m.puntos_propios || 0) > 0 || m.mejor_marca != null
                    const color = didTest ? THEME.ink : '#687067'
                    const weight = (phaseMode === 'single_member' && didTest) || (phaseMode === 'sum_two' && didTest) ? 700 : 400
                    return (
                      <div key={m.id} style={{ fontSize: tvMode ? 17 : 12, color, fontWeight: weight }}>
                        <AthleteProfileLink athlete={m}>
                          {athleteDisplayName(m)}
                        </AthleteProfileLink>
                        {phaseMode !== 'total' && (
                          <span style={{ marginLeft: 6, color: '#8c948b' }}>
                            {phaseInfo
                              ? `(${phaseMetricLabel(phaseInfo)}: ${metricValue(m.mejor_marca, phaseInfo)})`
                              : ''}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </td>
              {showEventCount && <td style={{ textAlign: 'right', color: '#6d756c' }}>{t.total_eventos}</td>}
              {phaseInfo && <td style={{ textAlign: 'center', color: '#6d756c' }}>{metricValue(t.mejor_marca, phaseInfo)}</td>}
              <td style={{ textAlign: 'center', fontWeight: 700, fontSize: tvMode ? 26 : 16, color: t.total_puntos > 0 ? THEME.primary : THEME.soft }}>
                {t.total_puntos}
              </td>
              {totalScoreMap && (
                <td style={{ textAlign: 'center', fontWeight: 500, fontSize: tvMode ? 22 : 14, color: '#8a9489', borderLeft: '2px solid #e0e7df' }}>
                  {totalEntry ? (
                    <span>{totalEntry.puntos ?? '-'}</span>
                  ) : '-'}
                </td>
              )}
              {totalScoreMap && (
                <td style={{ textAlign: 'center', color: '#8a9489', fontWeight: 600, fontSize: tvMode ? 20 : undefined }}>
                  {totalEntry?.rank ?? '-'}
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Countdown clock ────────────────────────────────────────────────────────────
function CountdownClock({ timerData, tvMode, serverOffsetMs = 0 }) {
  const [now, setNow] = useState(() => Date.now() + serverOffsetMs)

  useEffect(() => {
    setNow(Date.now() + serverOffsetMs)
    const id = setInterval(() => setNow(Date.now() + serverOffsetMs), 250)
    return () => clearInterval(id)
  }, [serverOffsetMs])

  const mode = timerData?.mode || 'countdown'
  const fmt = timerData?.format || 'mm:ss'
  const isStopwatch = mode === 'stopwatch'

  // Hide if: no data, stopped, or countdown with no duration set
  if (!timerData || timerData.state === 'stopped') return null
  if (!isStopwatch && timerData.duration <= 0) return null

  let elapsed = timerData.elapsed_before_pause || 0
  if (timerData.state === 'running' && timerData.started_at) {
    elapsed += (now - new Date(timerData.started_at).getTime()) / 1000
  }

  const finished = timerData.state === 'finished'

  const formatTime = (totalSecs) => {
    const s = Math.max(0, Math.floor(totalSecs))
    if (fmt === 'hh:mm:ss') {
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      const ss = s % 60
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    }
    if (fmt === 'mmm:ss') {
      const m = Math.floor(s / 60)
      const ss = s % 60
      return `${String(m).padStart(3, '0')}:${String(ss).padStart(2, '0')}`
    }
    const m = Math.floor(s / 60)
    const ss = s % 60
    return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  }

  let displayValue, urgent
  if (isStopwatch) {
    displayValue = formatTime(elapsed)
    urgent = false
  } else {
    const remaining = Math.max(0, timerData.duration - elapsed)
    displayValue = formatTime(remaining)
    urgent = !finished && remaining <= 30
  }

  const color = finished ? '#c0392b' : urgent ? '#e67e22' : '#e491ac'
  const label = isStopwatch ? 'Tiempo' : 'Tiempo restante'

  if (tvMode) {
    return (
      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontFamily: 'Bebas Neue, monospace',
          fontSize: 88,
          lineHeight: 1,
          letterSpacing: 6,
          color,
          textShadow: finished ? '0 0 28px #c0392b66' : urgent ? '0 0 20px #e67e2244' : 'none',
        }}>
          {finished ? 'TIEMPO!' : displayValue}
        </div>
        <div style={{ fontSize: 12, color: '#8a9489', marginTop: 2, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'right' }}>
          {finished ? '' : label}
        </div>
      </div>
    )
  }

  return (
    <span style={{
      fontFamily: 'Bebas Neue, monospace',
      fontSize: 24,
      letterSpacing: 3,
      color,
      fontWeight: 700,
      minWidth: 80,
      display: 'inline-block',
      textAlign: 'center',
    }}>
      {finished ? 'TIEMPO!' : displayValue}
    </span>
  )
}

// ── Main Leaderboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function Leaderboard() {
  const { competitionId } = useParams()
  const { session, displayName } = useAuth()
  const [competitions, setCompetitions] = useState([])
  const [selectedComp, setSelectedComp] = useState(competitionId || '')
  const [view, setView] = useState('individual') // 'individual' | 'teams'
  const [phaseView, setPhaseView] = useState('total') // 'total' | phase.id
  const [teamPhaseView, setTeamPhaseView] = useState('total') // 'total' | phase.id
  const [teamCategoryMode, setTeamCategoryMode] = useState('__by_category__') // __by_category__ | __all__ | category
  const [selectedCategory, setSelectedCategory] = useState('')
  const [tvMode, setTvMode] = useState(false)
  const [tvTick, setTvTick] = useState(0)
  const [data, setData] = useState(null)
  const [prevData, setPrevData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [phaseTransitioning, setPhaseTransitioning] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [pulse, setPulse] = useState(false)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))
  const [timerData, setTimerData] = useState(null)
  const [timerClockOffsetMs, setTimerClockOffsetMs] = useState(null)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [tvScrollableHeight, setTvScrollableHeight] = useState(null)
  const intervalRef = useRef(null)
  const tvIntervalRef = useRef(null)
  const tvSlidesRef = useRef([])
  const tvIndexRef = useRef(0)
  const timerIntervalRef = useRef(null)
  const phaseTransitionRef = useRef(null)
  const tvScrollContainerRef = useRef(null)

  // Detect if user is already logged in
  const loggedRole = session?.role || null
  const loggedNombre = displayName || ''

  useEffect(() => {
    api.get('/competitions?scope=public').then(r => {
      setCompetitions(r.data)
      if (!selectedComp && r.data.length) {
        const active = r.data.find(c => c.activa) || r.data[0]
        setSelectedComp(String(active.id))
      }
    })
  }, [])

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setTvMode(false)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => () => clearTimeout(phaseTransitionRef.current), [])

  useEffect(() => {
    const computeScrollableHeight = () => {
      if (!tvMode) {
        setTvScrollableHeight(null)
        return
      }
      const el = tvScrollContainerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const available = Math.floor(window.innerHeight - rect.top - 10)
      setTvScrollableHeight(available > 140 ? available : null)
    }
    computeScrollableHeight()
    window.addEventListener('resize', computeScrollableHeight)
    return () => window.removeEventListener('resize', computeScrollableHeight)
  }, [tvMode, data, view, phaseView, teamPhaseView, selectedCategory, teamCategoryMode, tvTick, loading, phaseTransitioning])

  useEffect(() => {
    const el = tvScrollContainerRef.current
    if (!tvMode || !el) return

    el.scrollTop = 0
    let rafId = null
    let direction = 1
    let lastTs = 0
    let pausedUntil = performance.now() + 1500
    const speedPxPer16ms = 0.6

    const step = (ts) => {
      if (!tvMode || !tvScrollContainerRef.current) return
      const node = tvScrollContainerRef.current
      const maxScroll = Math.max(0, node.scrollHeight - node.clientHeight)
      if (maxScroll <= 4) return

      if (ts < pausedUntil) {
        rafId = requestAnimationFrame(step)
        return
      }

      const delta = lastTs ? (ts - lastTs) : 16
      lastTs = ts
      node.scrollTop += direction * speedPxPer16ms * (delta / 16)

      if (node.scrollTop >= maxScroll - 1) {
        node.scrollTop = maxScroll
        direction = -1
        pausedUntil = ts + 1800
      } else if (node.scrollTop <= 1) {
        node.scrollTop = 0
        direction = 1
        pausedUntil = ts + 1800
      }
      rafId = requestAnimationFrame(step)
    }

    rafId = requestAnimationFrame(step)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [tvMode, tvTick])

  const fetchLeaderboard = useCallback(async (isFirst = false) => {
    if (!selectedComp) return
    if (isFirst) setLoading(true)
    try {
      const { data: newData } = await api.get(`/leaderboard/${selectedComp}`)
      setData(prev => {
        setPrevData(prev)
        return newData
      })
      setLastUpdate(new Date())
      // Pulse indicator
      setPulse(true)
      setTimeout(() => setPulse(false), 600)
    } finally {
      if (isFirst) setLoading(false)
    }
  }, [selectedComp])

  const switchPhaseView = useCallback((next) => {
    if (String(next) === String(phaseView)) return
    clearTimeout(phaseTransitionRef.current)
    setPhaseTransitioning(true)
    setPhaseView(next)
    phaseTransitionRef.current = setTimeout(() => setPhaseTransitioning(false), 500)
  }, [phaseView])

  const switchTeamPhaseView = useCallback((next) => {
    if (String(next) === String(teamPhaseView)) return
    clearTimeout(phaseTransitionRef.current)
    setPhaseTransitioning(true)
    setTeamPhaseView(next)
    phaseTransitionRef.current = setTimeout(() => setPhaseTransitioning(false), 500)
  }, [teamPhaseView])

  useEffect(() => {
    if (!selectedComp) return
    clearTimeout(phaseTransitionRef.current)
    setPhaseTransitioning(false)
    setData(null)
    setPrevData(null)
    setPhaseView('total')
    setTeamPhaseView('total')
    setTeamCategoryMode('__by_category__')
    setSelectedCategory('')
    fetchLeaderboard(true)
    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => fetchLeaderboard(false), DEFAULT_POLL_INTERVAL_MS)
    return () => {
      clearInterval(intervalRef.current)
      clearInterval(tvIntervalRef.current)
    }
  }, [selectedComp, fetchLeaderboard])

  const hasTeams = data?.has_teams
  const showIndividualLeaderboard = !!data?.show_individual_leaderboard
  const showTeamAllByCategoryOption = !!data?.show_team_all_by_category_option
  const showTeamAllGlobalOption = !!data?.show_team_all_global_option
  const tvShowQr = !!data?.tv_show_qr
  const tvShowTimer = !!data?.tv_show_timer
  const tvIncludeTotalSlide = data?.tv_include_total_slide == null ? true : !!data?.tv_include_total_slide
  const tvOnlyFinalizedPhases = data?.tv_only_finalized_phases == null ? true : !!data?.tv_only_finalized_phases
  const tvModeType = data?.tv_mode === 'static' ? 'static' : 'cyclic'
  const tvStaticView = data?.tv_static_view === 'teams' ? 'teams' : 'individual'
  const tvStaticPhase = data?.tv_static_phase_id == null ? 'total' : String(data?.tv_static_phase_id)
  const tvStaticIndividualCategory = (data?.tv_static_individual_category || '').trim()
  const tvStaticTeamCategoryMode = data?.tv_static_team_category_mode || '__by_category__'
  const tvRotationIntervalMs = Math.min(120000, Math.max(5000, Number(data?.tv_rotation_interval_seconds || 24) * 1000))
  const pollIntervalMs = Math.min(60000, Math.max(2000, Number(data?.tv_data_refresh_interval_seconds || 5) * 1000))
  const showEventCount = !!data?.show_event_count
  const finalizedPhases = (data?.phases || []).filter(ph => ph.estado === 'finalizada' || ph.estado === 'en_progreso')
  const compName = competitions.find(c => String(c.id) === String(selectedComp))?.nombre
  const leaderboardQrUrl = selectedComp ? `/api/competitions/${selectedComp}/leaderboard-qr` : ''

  // Only poll timer when TV mode actually needs it.
  useEffect(() => {
    clearInterval(timerIntervalRef.current)
    if (!selectedComp || !tvMode || !tvShowTimer) {
      setTimerData(null)
      setTimerClockOffsetMs(null)
      return
    }
    const fetch = () => {
      const sentAt = Date.now()
      return api.get(`/competitions/${selectedComp}/timer`)
      .then(r => {
        const receivedAt = Date.now()
        const serverNowMs = safeServerNowMs(r.data?.server_now)
        if (serverNowMs != null) {
          const midpoint = sentAt + ((receivedAt - sentAt) / 2)
          const targetOffset = serverNowMs - midpoint
          setTimerClockOffsetMs(prev => smoothClockOffset(prev, targetOffset))
        }
        setTimerData(prev => {
          const next = r.data
          const nextInterval = timerPollIntervalMs(next)
          const prevInterval = timerPollIntervalMs(prev)
          if (nextInterval !== prevInterval) {
            clearInterval(timerIntervalRef.current)
            timerIntervalRef.current = setInterval(fetch, nextInterval)
          }
          return next
        })
      })
      .catch(() => {})
    }
    fetch()
    timerIntervalRef.current = setInterval(fetch, timerPollIntervalMs(null))
    return () => clearInterval(timerIntervalRef.current)
  }, [selectedComp, tvMode, tvShowTimer])

  useEffect(() => {
    if (!selectedComp) return
    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => fetchLeaderboard(false), pollIntervalMs)
    return () => clearInterval(intervalRef.current)
  }, [selectedComp, pollIntervalMs, fetchLeaderboard])

  const currentIndividualData = phaseView === 'total'
    ? (data?.individual || {})
    : (data?.phases?.find(p => String(p.id) === String(phaseView))?.individual || {})
  const currentTeamData = teamPhaseView === 'total'
    ? (data?.teams || [])
    : (data?.phases?.find(p => String(p.id) === String(teamPhaseView))?.teams || [])
  const prevTeamData = teamPhaseView === 'total'
    ? (prevData?.teams || [])
    : (prevData?.phases?.find(p => String(p.id) === String(teamPhaseView))?.teams || [])
  const currentTeamPhaseMode = teamPhaseView === 'total'
    ? 'sum_two'
    : ((data?.phases?.find(p => String(p.id) === String(teamPhaseView))?.team_result_mode) || 'sum_two')
  const currentIndividualPhase = phaseView === 'total'
    ? null
    : (data?.phases?.find(p => String(p.id) === String(phaseView)) || null)
  const currentTeamPhase = teamPhaseView === 'total'
    ? null
    : (data?.phases?.find(p => String(p.id) === String(teamPhaseView)) || null)
  const currentCategories = orderCategories(currentIndividualData)
  const teamCategories = [...new Set((currentTeamData || []).map(t => t.team_category || 'Sin categoria'))]

  useEffect(() => {
    if (!teamCategories.length) {
      setTeamCategoryMode(showTeamAllByCategoryOption ? '__by_category__' : (showTeamAllGlobalOption ? '__all__' : ''))
      return
    }
    const isSpecialByCategory = teamCategoryMode === '__by_category__' && showTeamAllByCategoryOption
    const isSpecialGlobal = teamCategoryMode === '__all__' && showTeamAllGlobalOption
    if (isSpecialByCategory || isSpecialGlobal) return
    if (!teamCategories.includes(teamCategoryMode)) {
      if (showTeamAllByCategoryOption) setTeamCategoryMode('__by_category__')
      else if (showTeamAllGlobalOption) setTeamCategoryMode('__all__')
      else setTeamCategoryMode(teamCategories[0] || '')
    }
  }, [teamPhaseView, data, teamCategories, teamCategoryMode, showTeamAllByCategoryOption, showTeamAllGlobalOption])

  useEffect(() => {
    if (!data) return
    if (!showIndividualLeaderboard) {
      if (hasTeams) setView('teams')
      return
    }
    if (!hasTeams && view === 'teams') setView('individual')
  }, [data, showIndividualLeaderboard, hasTeams, view])

  useEffect(() => {
    if (!currentCategories.length) {
      setSelectedCategory('')
      return
    }
    if (!selectedCategory || !currentCategories.includes(selectedCategory)) {
      setSelectedCategory(currentCategories[0])
    }
  }, [phaseView, data, selectedCategory, currentCategories])

  useEffect(() => {
    if (!tvMode) {
      clearInterval(tvIntervalRef.current)
      tvIntervalRef.current = null
      tvSlidesRef.current = []
      tvIndexRef.current = 0
      return
    }
    if (!data) return

    if (tvModeType === 'static') {
      clearInterval(tvIntervalRef.current)
      tvIntervalRef.current = null
      tvSlidesRef.current = []
      tvIndexRef.current = 0

      const allowedView = (tvStaticView === 'teams' && hasTeams)
        ? 'teams'
        : (showIndividualLeaderboard ? 'individual' : 'teams')
      if (view !== allowedView) setView(allowedView)

      const phaseIds = new Set((data.phases || []).map(p => String(p.id)))
      const safePhase = tvStaticPhase === 'total' || phaseIds.has(String(tvStaticPhase))
        ? tvStaticPhase
        : 'total'

      if (allowedView === 'individual') {
        switchPhaseView(safePhase)
        const indData = safePhase === 'total'
          ? (data.individual || {})
          : (data.phases.find(p => String(p.id) === String(safePhase))?.individual || {})
        const cats = orderCategories(indData)
        const safeCat = (tvStaticIndividualCategory && cats.includes(tvStaticIndividualCategory))
          ? tvStaticIndividualCategory
          : (cats[0] || '')
        if (selectedCategory !== safeCat) setSelectedCategory(safeCat)
      } else {
        switchTeamPhaseView(safePhase)
        const rows = safePhase === 'total'
          ? (data.teams || [])
          : (data.phases.find(p => String(p.id) === String(safePhase))?.teams || [])
        const cats = [...new Set(rows.map(t => t.team_category || 'Sin categoria'))]
        const isByCategory = tvStaticTeamCategoryMode === '__by_category__' && showTeamAllByCategoryOption
        const isGlobal = tvStaticTeamCategoryMode === '__all__' && showTeamAllGlobalOption
        const safeTeamCategory = isByCategory || isGlobal || cats.includes(tvStaticTeamCategoryMode)
          ? tvStaticTeamCategoryMode
          : (showTeamAllByCategoryOption ? '__by_category__' : (showTeamAllGlobalOption ? '__all__' : (cats[0] || '')))
        if (teamCategoryMode !== safeTeamCategory) setTeamCategoryMode(safeTeamCategory)
      }
      setTvTick(t => t + 1)
      return
    }

    const tvFinalizedPhases = (data.phases || []).filter(ph => ph.estado === 'finalizada' || ph.estado === 'en_progreso')
    const tvPhases = tvOnlyFinalizedPhases
      ? (tvFinalizedPhases.length ? tvFinalizedPhases : (data.phases || []))
      : (data.phases || [])
    const phaseCycle = [
      ...(tvIncludeTotalSlide ? ['total'] : []),
      ...tvPhases.map(p => p.id),
    ]
    const slides = []

    if (view === 'individual') {
      phaseCycle.forEach(phaseKey => {
        const phaseData = phaseKey === 'total'
          ? (data.individual || {})
          : (data.phases.find(p => String(p.id) === String(phaseKey))?.individual || {})
        orderCategories(phaseData).forEach(cat => {
          slides.push({ phase: phaseKey, category: cat, mode: 'individual' })
        })
      })
    } else if (view === 'teams') {
      phaseCycle.forEach(phaseKey => {
        const rows = phaseKey === 'total'
          ? (data.teams || [])
          : (data.phases.find(p => String(p.id) === String(phaseKey))?.teams || [])
        const cats = [...new Set(rows.map(t => t.team_category || 'Sin categoria'))]
        if (showTeamAllByCategoryOption) slides.push({ phase: phaseKey, teamCategory: '__by_category__', mode: 'teams' })
        if (showTeamAllGlobalOption) slides.push({ phase: phaseKey, teamCategory: '__all__', mode: 'teams' })
        cats.forEach(cat => slides.push({ phase: phaseKey, teamCategory: cat, mode: 'teams' }))
      })
    }

    if (!slides.length) {
      clearInterval(tvIntervalRef.current)
      tvIntervalRef.current = null
      tvSlidesRef.current = []
      tvIndexRef.current = 0
      return
    }

    tvSlidesRef.current = slides
    let idx = -1
    if (view === 'individual') {
      idx = slides.findIndex(s => String(s.phase) === String(phaseView) && s.category === selectedCategory && s.mode === 'individual')
    } else {
      idx = slides.findIndex(s => String(s.phase) === String(teamPhaseView) && s.teamCategory === teamCategoryMode && s.mode === 'teams')
    }
    if (idx < 0) idx = Math.min(tvIndexRef.current, slides.length - 1)
    if (idx < 0) idx = 0
    tvIndexRef.current = idx

    const applySlide = (slide) => {
      if (slide.mode === 'individual') {
        switchPhaseView(slide.phase)
        setSelectedCategory(slide.category)
      } else {
        switchTeamPhaseView(slide.phase)
        setTeamCategoryMode(slide.teamCategory)
      }
    }
    applySlide(slides[idx])

    if (!tvIntervalRef.current) {
      setTvTick(t => t + 1)
      tvIntervalRef.current = setInterval(() => {
        const items = tvSlidesRef.current
        if (!items.length) return
        tvIndexRef.current = (tvIndexRef.current + 1) % items.length
        const next = items[tvIndexRef.current]
        applySlide(next)
        setTvTick(t => t + 1)
      }, tvRotationIntervalMs || DEFAULT_TV_ROTATION_INTERVAL_MS)
    }
  }, [tvMode, view, data, phaseView, selectedCategory, teamPhaseView, teamCategoryMode, showTeamAllByCategoryOption, showTeamAllGlobalOption, switchPhaseView, switchTeamPhaseView, tvOnlyFinalizedPhases, tvIncludeTotalSlide, tvRotationIntervalMs, tvModeType, tvStaticView, tvStaticPhase, tvStaticIndividualCategory, tvStaticTeamCategoryMode, hasTeams, showIndividualLeaderboard])

  const toggleTvMode = async () => {
    if (!tvMode) {
      try {
        await document.documentElement.requestFullscreen()
      } catch {
        return
      }
      setTvMode(true)
      return
    }
    if (document.fullscreenElement) await document.exitFullscreen()
    setTvMode(false)
  }

  return (
    <div className={`lb-root ${tvMode ? 'tv-mode' : ''}`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Poppins:wght@400;500;600;700;800&display=swap');
        .lb-root {
          background: ${THEME.paper};
          min-height: 100vh;
          color: ${THEME.ink};
          font-family: 'Poppins', sans-serif;
        }
        .lb-root nav { background: #090B0E !important; border-bottom: 1px solid ${THEME.border} !important; }
        .lb-root .lb-brand { font-family: 'Bebas Neue', sans-serif; letter-spacing: 1px; color: ${THEME.primary}; font-size: 30px; }
        .lb-root table { width: 100%; border-collapse: separate; border-spacing: 0; background: ${THEME.surface}; border: 1px solid ${THEME.border}; border-radius: 12px; overflow: hidden; }
        .lb-root table th { background: #11151a; color: ${THEME.muted}; font-size: 12px; text-transform: uppercase; letter-spacing: .4px; border-bottom: 1px solid ${THEME.border}; }
        .lb-root table td { border-bottom: 1px solid ${THEME.border}; }
        .lb-root table tr:last-child td { border-bottom: none; }
        .lb-root table tr:hover td { background: rgba(255,255,255,0.02); }
        .lb-root .tabs { border-bottom-color: ${THEME.border}; }
        .lb-root .tab { color: ${THEME.soft}; }
        .lb-root .tab.active { color: ${THEME.primary}; border-bottom-color: ${THEME.primary}; }
        .lb-root .tab:hover:not(.active) { color: ${THEME.ink}; background: rgba(255,255,255,0.04); }
        .lb-root h1 { color: ${THEME.ink} !important; font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.5px; font-size: 38px !important; }
        .lb-root select, .lb-root input { background: ${THEME.surface}; color: ${THEME.ink}; border: 1px solid ${THEME.border}; }
        .lb-root .badge-rx { background: rgba(214,217,224,0.12); color: #ff9a3d; border-color: rgba(214,217,224,0.35); }
        .lb-root .badge-scaled { background: rgba(94,234,212,0.12); color: #6ff3e1; border-color: rgba(94,234,212,0.35); }
        .lb-root .badge-masters { background: rgba(212,165,55,0.12); color: #f1ce75; border-color: rgba(212,165,55,0.35); }
        .lb-root .badge-default { background: rgba(170,178,192,0.12); color: ${THEME.muted}; border-color: rgba(170,178,192,0.25); }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .skeleton {
          background: linear-gradient(90deg, #1c2129 25%, #252b35 50%, #1c2129 75%);
          background-size: 200% 100%;
          animation: shimmer 1.4s infinite;
        }
        @keyframes flashUp {
          0%   { background: rgba(94,234,212,0.28); }
          100% { background: transparent; }
        }
        @keyframes flashDown {
          0%   { background: rgba(214,217,224,0.28); }
          100% { background: transparent; }
        }
        @keyframes flashNew {
          0%   { background: #1a5276aa; }
          100% { background: transparent; }
        }
        tr.row-up   { animation: flashUp   0.8s ease-out; }
        tr.row-down { animation: flashDown 0.8s ease-out; }
        tr.row-new  { animation: flashNew  0.8s ease-out; }
        .pulse-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: ${THEME.primary};
          display: inline-block;
          transition: opacity 0.3s;
        }
        .tv-mode table th, .tv-mode table td { font-size: 22px; }
        .tv-mode h1 { font-size: 58px !important; }
        .tv-mode .badge { font-size: 16px; padding: 6px 12px; }
        .tv-mode .tab { font-size: 18px !important; padding: 10px 18px !important; }
        .tv-mode .tv-scrollbox { scrollbar-width: none; -ms-overflow-style: none; }
        .tv-mode .tv-scrollbox::-webkit-scrollbar { display: none; }
        @media (max-width: 768px) {
          .lb-root .lb-brand { font-size: 22px; }
          .lb-root nav { padding: 10px 12px !important; }
          .lb-root nav > div { gap: 8px !important; }
          .lb-root h1 { font-size: 26px !important; margin-bottom: 12px !important; }
          .lb-root .tabs { overflow-x: auto; white-space: nowrap; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
          .lb-root .tabs::-webkit-scrollbar { display: none; }
          .lb-root .tab { font-size: 13px; padding: 6px 12px !important; flex-shrink: 0; }
          .lb-root select { font-size: 14px; }
        }
        @keyframes tvProgress {
          from { width: 0%; }
          to { width: 100%; }
        }
        .tv-phase-progress {
          width: 100%;
          height: 3px;
          background: #d7ddd7;
          border-radius: 999px;
          overflow: hidden;
          margin-top: 8px;
        }
        .tv-phase-progress > span {
          display: block;
          height: 100%;
          background: linear-gradient(135deg, ${THEME.primary} 0%, #F1F4F8 100%);
          animation-name: tvProgress;
          animation-timing-function: linear;
          animation-fill-mode: forwards;
        }
      `}</style>

      <div style={{ maxWidth: tvMode ? '100%' : COMPETITION_PAGE_MAX_WIDTH, margin: '0 auto', padding: tvMode ? '24px 28px' : (isMobile ? '14px 12px' : '24px 20px') }}>
        {/* Competition selector */}
        {!tvMode && (
          <div style={{ marginBottom: isMobile ? 14 : 24 }}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 16, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 8 : 16 }}>
                <select value={selectedComp} onChange={e => setSelectedComp(e.target.value)} style={{ width: isMobile ? '100%' : 280 }}>
                  <option value="">Seleccionar competencia...</option>
                  {competitions.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}{c.activa ? ' (activa)' : ''}</option>
                  ))}
                </select>

                {data && (
                  <div className="tabs" style={{ margin: 0, border: 'none', gap: 4 }}>
                    {showIndividualLeaderboard && (
                      <button className={`tab ${view === 'individual' ? 'active' : ''}`} onClick={() => setView('individual')} style={{ padding: '6px 14px' }}>
                        Individual
                      </button>
                    )}
                    {hasTeams && (
                      <button className={`tab ${view === 'teams' ? 'active' : ''}`} onClick={() => setView('teams')} style={{ padding: '6px 14px' }}>
                        Equipos
                      </button>
                    )}
                    <button className={`tab ${tvMode ? 'active' : ''}`} onClick={toggleTvMode} style={{ padding: '6px 14px' }}>
                      {tvMode ? 'Salir TV' : 'TV'}
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Heading */}
        {compName && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: tvMode ? 12 : 24 }}>
            <h1 style={{ fontWeight: 800, marginBottom: 0 }}>
              {compName}
            </h1>
            {tvMode && data && (
              <div className="tabs" style={{ margin: 0, border: 'none', gap: 4 }}>
                {showIndividualLeaderboard && (
                  <button className={`tab ${view === 'individual' ? 'active' : ''}`} onClick={() => setView('individual')} style={{ padding: '6px 14px' }}>
                    Individual
                  </button>
                )}
                {hasTeams && (
                  <button className={`tab ${view === 'teams' ? 'active' : ''}`} onClick={() => setView('teams')} style={{ padding: '6px 14px' }}>
                    Equipos
                  </button>
                )}
                <button className="tab active" onClick={toggleTvMode} style={{ padding: '6px 14px' }}>
                  Salir TV
                </button>
              </div>
            )}
            {!tvMode && selectedComp && (
              <button
                className="tab"
                onClick={() => setQrModalOpen(true)}
                style={{ padding: '6px 12px' }}
              >
                Compartir QR
              </button>
            )}
          </div>
        )}

        {/* TV Phase label — big, prominent, auto-updates with the slide */}
        {tvMode && data && (() => {
          const activePhaseId = view === 'individual' ? phaseView : teamPhaseView
          const activePhaseObj = activePhaseId === 'total'
            ? null
            : data.phases?.find(p => String(p.id) === String(activePhaseId))
          const phaseName = activePhaseId === 'total'
            ? 'General'
            : (activePhaseObj?.nombre || '')
          const phaseStatus = activePhaseObj?.estado || null
          const catLabel = view === 'individual'
            ? (selectedCategory || null)
            : (teamCategoryMode === '__by_category__' ? 'Por categoria'
               : teamCategoryMode === '__all__' ? 'Todos'
               : teamCategoryMode || null)

          // Next slide preview
          const slides = tvSlidesRef.current
          const nextSlide = slides.length > 1
            ? slides[(tvIndexRef.current + 1) % slides.length]
            : null
          const nextPhaseId = nextSlide ? (nextSlide.phase ?? null) : null
          const nextPhaseName = nextPhaseId == null ? null
            : nextPhaseId === 'total' ? 'General'
            : (data.phases?.find(p => String(p.id) === String(nextPhaseId))?.nombre || 'General')
          const nextPhaseStatus = nextPhaseId == null || nextPhaseId === 'total'
            ? null
            : (data.phases?.find(p => String(p.id) === String(nextPhaseId))?.estado || null)
          const nextCatLabel = nextSlide == null ? null
            : nextSlide.mode === 'individual'
              ? (nextSlide.category || null)
              : (nextSlide.teamCategory === '__by_category__' ? 'Por categoria'
                 : nextSlide.teamCategory === '__all__' ? 'Todos'
                 : nextSlide.teamCategory || null)

          const showNext = nextSlide && (nextPhaseName !== phaseName || nextCatLabel !== catLabel)
          const arrowDur = `${(tvRotationIntervalMs || DEFAULT_TV_ROTATION_INTERVAL_MS) / 1000}s`

          return (
            <div key={`tv-phase-${tvTick}`} style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                {/* Current phase — solid */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 14,
                  background: THEME.primary, color: '#fff',
                  borderRadius: 10, padding: '10px 28px',
                  fontFamily: 'Bebas Neue, monospace',
                  fontSize: 42, letterSpacing: 3, lineHeight: 1,
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    {phaseStatus ? phaseStatusIcon(phaseStatus, 28) : null}
                    <span>{phaseName}</span>
                  </span>
                  {catLabel && (
                    <span style={{
                      background: 'rgba(255,255,255,0.18)',
                      borderRadius: 6, padding: '4px 14px',
                      fontSize: 28, letterSpacing: 2,
                    }}>
                      {catLabel}
                    </span>
                  )}
                </div>

                {/* Filling arrow between current and next */}
                {showNext && (
                  <div style={{ position: 'relative', width: 46, height: 24, flexShrink: 0 }}>
                    {/* Muted background arrow */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      clipPath: 'polygon(0 27%, 68% 27%, 68% 0%, 100% 50%, 68% 100%, 68% 73%, 0 73%)',
                      background: 'rgba(214,217,224,0.22)',
                    }} />
                    {/* CSS-animated fill — uses the existing tvProgress keyframe */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, height: '100%', width: 0, overflow: 'hidden',
                      animationName: 'tvProgress',
                      animationDuration: arrowDur,
                      animationTimingFunction: 'linear',
                      animationFillMode: 'forwards',
                    }}>
                      <div style={{
                        width: 46, height: '100%',
                        clipPath: 'polygon(0 27%, 68% 27%, 68% 0%, 100% 50%, 68% 100%, 68% 73%, 0 73%)',
                        background: THEME.primary,
                      }} />
                    </div>
                  </div>
                )}

                {/* Next phase — transparent, no blur */}
                {showNext && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    background: THEME.primary,
                    color: '#fff',
                    borderRadius: 10, padding: '7px 20px',
                    fontFamily: 'Bebas Neue, monospace',
                    fontSize: 26, letterSpacing: 2, lineHeight: 1,
                    opacity: 0.32,
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {nextPhaseStatus ? phaseStatusIcon(nextPhaseStatus, 18) : null}
                      <span>{nextPhaseName}</span>
                    </span>
                    {nextCatLabel && (
                      <span style={{
                        background: 'rgba(255,255,255,0.18)',
                        borderRadius: 5, padding: '3px 10px',
                        fontSize: 18, letterSpacing: 1,
                      }}>
                        {nextCatLabel}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {tvShowQr && selectedComp && (
                  <a
                    href={`/leaderboard/${selectedComp}`}
                    title="Abrir leaderboard compartible"
                    style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', textDecoration: 'none', color: '#5f685e', padding: 6 }}
                  >
                    <img
                      src={leaderboardQrUrl}
                      alt={`QR leaderboard ${compName || ''}`}
                      style={{ width: 86, height: 86, borderRadius: 8, border: '1px solid #d5ddd3', background: '#fff' }}
                    />
                  </a>
                )}
                <div style={{ minWidth: 260, display: 'flex', justifyContent: 'flex-end', paddingLeft: 6 }}>
                  {tvShowTimer && timerData ? <CountdownClock timerData={timerData} tvMode={true} serverOffsetMs={timerClockOffsetMs || 0} /> : null}
                </div>
              </div>
            </div>
          )
        })()}

        <div
          ref={tvScrollContainerRef}
          className={tvMode ? 'tv-scrollbox' : ''}
          style={tvMode && tvScrollableHeight ? { maxHeight: tvScrollableHeight, overflowY: 'auto', paddingRight: 2 } : undefined}
        >
          {!selectedComp && (
            <div style={{ textAlign: 'center', color: '#555', padding: 80 }}>
              <div style={{ fontSize: 22, marginBottom: 12, fontWeight: 700 }}>Leaderboard</div>
              Selecciona una competencia para ver el leaderboard
            </div>
          )}

          {/* Skeleton while loading or switching phase */}
          {(loading || phaseTransitioning) && selectedComp && (
            <>
              <div className="skeleton" style={{ height: 28, width: 180, borderRadius: 6, marginBottom: 16 }} />
              <SkeletonTable rows={6} />
            </>
          )}

          {/* Data */}
          {!loading && !phaseTransitioning && data && (
            <>
            {showIndividualLeaderboard && view === 'individual' && data.has_phases && !tvMode && (
              <div style={{ marginBottom: 20 }}>
                {isMobile ? (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Evento individual</label>
                    <select value={phaseView} onChange={e => switchPhaseView(e.target.value)}>
                      <option value="total">Total</option>
                      {data.phases.map(ph => (
                        <option key={`lb-mobile-phase-${ph.id}`} value={ph.id}>
                          {ph.nombre}{phaseStatusSuffix(ph.estado)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="tabs" style={{ margin: 0, border: 'none', gap: 4 }}>
                    <button
                      className={`tab ${phaseView === 'total' ? 'active' : ''}`}
                      onClick={() => switchPhaseView('total')}
                      style={{ padding: '5px 14px', fontSize: 13 }}
                    >
                      Total
                    </button>
                    {data.phases.map(ph => (
                      <button
                        key={ph.id}
                        className={`tab ${phaseView === ph.id ? 'active' : ''}`}
                        onClick={() => switchPhaseView(ph.id)}
                        style={{ padding: '5px 14px', fontSize: 13 }}
                        title={`Estado: ${ph.estado || 'pendiente'}`}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {phaseStatusIcon(ph.estado, 14)}
                          <span>{ph.nombre}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === 'teams' && (data.phases || []).length > 0 && !tvMode && (
              <div style={{ marginBottom: 20 }}>
                {isMobile ? (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Evento equipos</label>
                    <select value={teamPhaseView} onChange={e => switchTeamPhaseView(e.target.value)}>
                      <option value="total">Total</option>
                      {data.phases.map(ph => (
                        <option key={`lb-mobile-team-phase-${ph.id}`} value={ph.id}>
                          {ph.nombre}{phaseStatusSuffix(ph.estado)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="tabs" style={{ margin: 0, border: 'none', gap: 4 }}>
                    <button
                      className={`tab ${teamPhaseView === 'total' ? 'active' : ''}`}
                      onClick={() => switchTeamPhaseView('total')}
                      style={{ padding: '5px 14px', fontSize: 13 }}
                    >
                      Total
                    </button>
                    {data.phases.map(ph => (
                      <button
                        key={`team-phase-${ph.id}`}
                        className={`tab ${teamPhaseView === ph.id ? 'active' : ''}`}
                        onClick={() => switchTeamPhaseView(ph.id)}
                        style={{ padding: '5px 14px', fontSize: 13 }}
                        title={`Estado: ${ph.estado || 'pendiente'}`}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {phaseStatusIcon(ph.estado, 14)}
                          <span>{ph.nombre}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === 'teams' && teamCategories.length > 0 && !tvMode && (
              <div style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row' }}>
                <label style={{ fontSize: 13, color: '#888' }}>Categoria equipos:</label>
                <select value={teamCategoryMode} onChange={e => setTeamCategoryMode(e.target.value)} style={{ width: isMobile ? '100%' : 260 }}>
                  {showTeamAllByCategoryOption && <option value="__by_category__">Todos por categoria</option>}
                  {showTeamAllGlobalOption && <option value="__all__">Todos global</option>}
                  {teamCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
            )}

            {showIndividualLeaderboard && view === 'individual' && currentCategories.length > 0 && !tvMode && (
              <div style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row' }}>
                <label style={{ fontSize: 13, color: '#888' }}>Categoria:</label>
                <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} style={{ width: isMobile ? '100%' : 220 }}>
                  {currentCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
            )}

            {showIndividualLeaderboard && view === 'individual' && (() => {
              const indData = currentIndividualData
              const indPrev = phaseView === 'total'
                ? prevData?.individual
                : (prevData?.phases?.find(p => String(p.id) === String(phaseView))?.individual || null)
              const filteredIndData = selectedCategory ? { [selectedCategory]: indData[selectedCategory] || [] } : indData
              const indTotalScoreMap = phaseView !== 'total' && data?.individual
                ? Object.values(data.individual).flat().reduce((acc, p) => { acc[p.id] = { puntos: p.total_puntos, rank: p.rank }; return acc }, {})
                : null
              return Object.keys(indData).length === 0
                ? <div style={{ color: '#555', textAlign: 'center', padding: 60 }}>No hay participantes activos con resultados</div>
                : <IndividualTable data={filteredIndData} prevData={indPrev} showEventCount={showEventCount} isMobile={isMobile && !tvMode} totalScoreMap={indTotalScoreMap} phaseInfo={currentIndividualPhase} tvMode={tvMode} />
            })()}

            {view === 'teams' && (() => {
              const teamTotalScoreMap = teamPhaseView !== 'total' && data?.teams
                ? data.teams.reduce((acc, t) => { acc[t.id] = { puntos: t.total_puntos, rank: t.rank }; return acc }, {})
                : null
              return (
                <>
                  {(teamCategoryMode === '__by_category__' && showTeamAllByCategoryOption) ? (
                    <div style={{ display: 'grid', gap: 18 }}>
                      {teamCategories.map(cat => (
                        <div key={`team-cat-${cat}`}>
                          <div style={{ marginBottom: 8, fontWeight: 700, color: '#ddd' }}>{cat}</div>
                          <TeamsTable
                            data={currentTeamData.filter(t => (t.team_category || 'Sin categoria') === cat)}
                            prevData={prevTeamData.filter(t => (t.team_category || 'Sin categoria') === cat)}
                            showEventCount={showEventCount}
                            phaseMode={currentTeamPhaseMode}
                            isMobile={isMobile && !tvMode}
                            totalScoreMap={teamTotalScoreMap}
                            phaseInfo={currentTeamPhase}
                            tvMode={tvMode}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <TeamsTable
                      data={(teamCategoryMode === '__all__' && showTeamAllGlobalOption)
                        ? currentTeamData
                        : currentTeamData.filter(t => (t.team_category || 'Sin categoria') === teamCategoryMode)}
                      prevData={(teamCategoryMode === '__all__' && showTeamAllGlobalOption)
                        ? prevTeamData
                        : prevTeamData.filter(t => (t.team_category || 'Sin categoria') === teamCategoryMode)}
                      showEventCount={showEventCount}
                      phaseMode={currentTeamPhaseMode}
                      isMobile={isMobile && !tvMode}
                      totalScoreMap={teamTotalScoreMap}
                      phaseInfo={currentTeamPhase}
                      tvMode={tvMode}
                    />
                  )}
                </>
              )
            })()}
            </>
          )}
        </div>
      </div>
      {qrModalOpen && !tvMode && selectedComp && (
        <div
          onClick={() => setQrModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(92vw, 360px)',
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #d5ddd3',
              padding: 16,
              textAlign: 'center',
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: 18 }}>Compartir leaderboard</h3>
            <img
              src={leaderboardQrUrl}
              alt={`QR leaderboard ${compName || ''}`}
              style={{ width: 240, height: 240, maxWidth: '100%', borderRadius: 8, border: '1px solid #d5ddd3', background: '#fff' }}
            />
            <div style={{ marginTop: 10, fontSize: 12, color: '#5f685e', wordBreak: 'break-all' }}>
              {`/leaderboard/${selectedComp}`}
            </div>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 8 }}>
              <a className="tab active" href={`/leaderboard/${selectedComp}`} target="_blank" rel="noreferrer" style={{ padding: '6px 12px', textDecoration: 'none' }}>
                Abrir
              </a>
              <button className="tab" onClick={() => setQrModalOpen(false)} style={{ padding: '6px 12px' }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
