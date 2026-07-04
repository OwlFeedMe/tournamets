import api from '../api/axios'
import {
  describeSnapshotChanges,
  readSpectatorSnapshots,
  writeSpectatorSnapshot,
} from './spectatorFollow'

function followKey(follow) {
  return `${follow.competitionId}:${follow.athleteId}`
}

export async function fetchFollowSummary(follows) {
  if (!Array.isArray(follows) || !follows.length) {
    return { detailsByKey: {}, activity: [] }
  }

  const snapshots = readSpectatorSnapshots()
  const { data } = await api.post('/follows/summary', { follows })
  const items = Array.isArray(data?.items) ? data.items : []
  const detailsByKey = {}
  const activity = []

  items.forEach((item) => {
    const key = item.key || `${item.competitionId}:${item.athleteId}`
    const snapshot = item.snapshot || null
    const previous = snapshots[key]
    const changes = snapshot ? describeSnapshotChanges(previous, snapshot) : []
    if (snapshot) {
      writeSpectatorSnapshot(item.competitionId, item.athleteId, snapshot)
    }

    const latestChange = changes.find((change) => change.type !== 'tracking_started') || null
    detailsByKey[key] = {
      ...item,
      snapshot: snapshot || previous || null,
      latestChange,
    }

    changes.forEach((change, index) => {
      activity.push({
        ...change,
        id: `${key}:${change.type}:${Date.now()}:${index}`,
        competitionId: item.competitionId,
        competitionName: item.competitionName,
        athleteId: item.athleteId,
        athleteName: item.athleteName,
        username: item.username,
        createdAt: new Date().toISOString(),
      })
    })
  })

  follows.forEach((follow) => {
    const key = followKey(follow)
    if (!detailsByKey[key]) {
      detailsByKey[key] = {
        key,
        competitionId: follow.competitionId,
        competitionName: follow.competitionName,
        athleteId: follow.athleteId,
        athleteName: follow.athleteName,
        username: follow.username,
        category: follow.category,
        avatarUrl: follow.avatarUrl,
        followedAt: follow.followedAt,
        snapshot: snapshots[key] || null,
        nextHeat: null,
        latestChange: null,
      }
    }
  })

  return { detailsByKey, activity }
}
