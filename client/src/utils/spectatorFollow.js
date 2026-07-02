const FOLLOW_STORAGE_KEY = 'finalrep:spectator-follows:v1'
const SNAPSHOT_STORAGE_KEY = 'finalrep:spectator-snapshots:v1'
const FOLLOW_EVENT = 'finalrep:spectator-follows-changed'

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function normalizeId(value) {
  const text = String(value ?? '').trim()
  return text || ''
}

function followKey(competitionId, athleteId) {
  return `${normalizeId(competitionId)}:${normalizeId(athleteId)}`
}

function emitFollowChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(FOLLOW_EVENT))
}

export function readSpectatorFollows() {
  if (!canUseStorage()) return []
  const raw = safeJsonParse(window.localStorage.getItem(FOLLOW_STORAGE_KEY), [])
  return Array.isArray(raw) ? raw.filter((item) => item?.competitionId && item?.athleteId) : []
}

export function writeSpectatorFollows(follows) {
  if (!canUseStorage()) return
  window.localStorage.setItem(FOLLOW_STORAGE_KEY, JSON.stringify(follows))
  emitFollowChange()
}

export function isFollowingAthlete(competitionId, athleteId, follows = readSpectatorFollows()) {
  const key = followKey(competitionId, athleteId)
  return follows.some((item) => followKey(item.competitionId, item.athleteId) === key)
}

export function followAthlete(payload) {
  const competitionId = normalizeId(payload?.competitionId)
  const athleteId = normalizeId(payload?.athleteId)
  if (!competitionId || !athleteId) return readSpectatorFollows()

  const follows = readSpectatorFollows()
  const key = followKey(competitionId, athleteId)
  const nextFollow = {
    competitionId,
    competitionName: String(payload?.competitionName || 'Competencia').trim() || 'Competencia',
    athleteId,
    athleteName: String(payload?.athleteName || 'Atleta').trim() || 'Atleta',
    username: String(payload?.username || '').trim(),
    category: String(payload?.category || '').trim(),
    avatarUrl: String(payload?.avatarUrl || '').trim(),
    followedAt: payload?.followedAt || new Date().toISOString(),
  }
  const next = [nextFollow, ...follows.filter((item) => followKey(item.competitionId, item.athleteId) !== key)]
  writeSpectatorFollows(next)
  return next
}

export function unfollowAthlete(competitionId, athleteId) {
  const key = followKey(competitionId, athleteId)
  const next = readSpectatorFollows().filter((item) => followKey(item.competitionId, item.athleteId) !== key)
  writeSpectatorFollows(next)
  return next
}

export function subscribeSpectatorFollows(callback) {
  if (typeof window === 'undefined') return () => {}
  const handler = () => callback(readSpectatorFollows())
  window.addEventListener(FOLLOW_EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(FOLLOW_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

export function readSpectatorSnapshots() {
  if (!canUseStorage()) return {}
  const raw = safeJsonParse(window.localStorage.getItem(SNAPSHOT_STORAGE_KEY), {})
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
}

export function writeSpectatorSnapshot(competitionId, athleteId, snapshot) {
  if (!canUseStorage()) return
  const key = followKey(competitionId, athleteId)
  const snapshots = readSpectatorSnapshots()
  snapshots[key] = { ...snapshot, checkedAt: new Date().toISOString() }
  window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshots))
}

export function flattenIndividualRows(individualData) {
  return Object.values(individualData || {}).flat()
}

export function buildAthleteLeaderboardSnapshot(leaderboard, athleteId) {
  const totalRow = flattenIndividualRows(leaderboard?.individual).find((row) => String(row.id) === String(athleteId))
  if (!totalRow) return null
  const phaseResults = (leaderboard?.phases || [])
    .map((phase) => {
      const row = flattenIndividualRows(phase.individual).find((item) => String(item.id) === String(athleteId))
      if (!row) return null
      return {
        phaseId: String(phase.id),
        phaseName: phase.nombre || 'Workout',
        rank: row.rank ?? null,
        points: Number(row.total_puntos || 0),
        mark: row.mejor_marca ?? null,
        extra: row.extra ?? null,
      }
    })
    .filter(Boolean)

  return {
    athleteId: String(totalRow.id),
    athleteName: [totalRow.nombre, totalRow.apellido].filter(Boolean).join(' ').trim() || 'Atleta',
    username: totalRow.username || '',
    category: totalRow.categoria || '',
    rank: totalRow.rank ?? null,
    totalPoints: Number(totalRow.total_puntos || 0),
    resultsCount: phaseResults.filter((item) => item.mark != null || item.points > 0).length,
    phaseResults,
  }
}

export function describeSnapshotChanges(previous, current) {
  if (!current) return []
  if (!previous) {
    return [{
      type: 'tracking_started',
      title: `${current.athleteName} queda en seguimiento`,
      body: current.rank ? `Puesto actual #${current.rank} con ${current.totalPoints} pts.` : 'Aun sin posicion publicada.',
    }]
  }

  const changes = []
  if (previous.rank != null && current.rank != null && previous.rank !== current.rank) {
    const improved = current.rank < previous.rank
    changes.push({
      type: improved ? 'rank_up' : 'rank_down',
      title: improved ? `${current.athleteName} subio al #${current.rank}` : `${current.athleteName} bajo al #${current.rank}`,
      body: `Antes estaba #${previous.rank}. Total: ${current.totalPoints} pts.`,
    })
  }
  if (current.resultsCount > Number(previous.resultsCount || 0)) {
    changes.push({
      type: 'new_result',
      title: `Nuevo resultado de ${current.athleteName}`,
      body: `${current.resultsCount}/${current.phaseResults.length || current.resultsCount} workouts con marca publicada.`,
    })
  }
  if (Number(current.totalPoints || 0) !== Number(previous.totalPoints || 0)) {
    changes.push({
      type: 'points_changed',
      title: `${current.athleteName}: ${current.totalPoints} pts`,
      body: `Cambio de ${previous.totalPoints ?? 0} a ${current.totalPoints} pts.`,
    })
  }
  return changes
}
