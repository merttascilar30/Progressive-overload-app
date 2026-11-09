// İstatistik hesapları. Saf fonksiyonlar; ısınma setleri hiçbir hesaba katılmaz.
import { calculateVolumeLoad, estimate1RM } from './progressionEngine'

const DAY_MS = 24 * 60 * 60 * 1000

function dayStart(timestamp) {
  const d = new Date(timestamp)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const isWorking = (set) => !set?.isWarmup

/** `now`un haftasının Pazartesi 00:00 (yerel saat) zaman damgası. */
export function weekStart(now) {
  const d = new Date(dayStart(now))
  const sinceMonday = (d.getDay() + 6) % 7 // Pazar=0 → 6
  d.setDate(d.getDate() - sinceMonday)
  return d.getTime()
}

/** Gün başına en yüksek tahmini 1RM, eski günden yeniye. */
export function dailyBest1RM(sets) {
  const best = new Map()
  for (const set of sets) {
    if (!isWorking(set)) continue
    const value = estimate1RM(set.weight, set.reps)
    if (value == null) continue
    const day = dayStart(set.timestamp)
    if (value > (best.get(day) ?? -Infinity)) best.set(day, value)
  }
  return [...best.entries()].sort((a, b) => a[0] - b[0]).map(([day, value]) => ({ day, value }))
}

const RANGE_MONTHS = { '1m': 1, '3m': 3, '6m': 6 }

/** range: '1m' | '3m' | '6m' | 'all' — takvim ayı olarak geriye. */
export function filterRange(points, range, now) {
  const months = RANGE_MONTHS[range]
  if (!months) return points
  const from = new Date(dayStart(now))
  from.setMonth(from.getMonth() - months)
  const fromMs = from.getTime()
  return points.filter((point) => point.day >= fromMs)
}

/** Bu takvim haftası ve geçen hafta kas grubu başına çalışma seti sayısı. */
export function weeklyMuscleSets(sets, exercisesById, now) {
  const thisWeek = weekStart(now)
  const lastWeek = weekStart(thisWeek - DAY_MS)
  const rows = new Map()
  const row = (muscle) => {
    if (!rows.has(muscle)) rows.set(muscle, { muscle, count: 0, previous: 0 })
    return rows.get(muscle)
  }
  for (const set of sets) {
    if (!isWorking(set) || set.timestamp > now) continue
    const muscle = exercisesById.get(set.exerciseId)?.targetMuscle || 'Genel'
    if (set.timestamp >= thisWeek) row(muscle).count += 1
    else if (set.timestamp >= lastWeek) row(muscle).previous += 1
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || a.muscle.localeCompare(b.muscle, 'tr'))
}

/** Antrenman günü başına en iyi 1RM, eskiden yeniye. */
export function sessionBests(sets) {
  return dailyBest1RM(sets).map((point) => point.value)
}

/**
 * Son 3 seansın hiçbiri önceki en iyiyi geçmediyse durma (en az 4 seans gerekir).
 * sessions: en iyi değerin ilk görüldüğü seanstan sonra geçen seans sayısı.
 */
export function stallStatus(bests) {
  if (!Array.isArray(bests) || bests.length < 4) return { stalled: false, sessions: 0 }
  const earlierMax = Math.max(...bests.slice(0, -3))
  const recentMax = Math.max(...bests.slice(-3))
  const overall = Math.max(earlierMax, recentMax)
  const sessions = bests.length - 1 - bests.indexOf(overall)
  return { stalled: recentMax <= earlierMax, sessions }
}

/** Çalışma ağırlığının %90'ı, artış adımına aşağı yuvarlanmış (≥ 0). */
export function deloadWeight(workingWeight, incrementStep) {
  const weight = Number(workingWeight)
  const step = Number(incrementStep)
  if (!Number.isFinite(weight) || weight <= 0) return 0
  if (!Number.isFinite(step) || step <= 0) return Math.round(weight * 0.9 * 100) / 100
  const rounded = Math.floor((weight * 0.9) / step + 1e-9) * step
  return Math.max(0, Math.round(rounded * 100) / 100)
}

/** Günün özeti. priorBestByExercise: hareket başına bugünden önceki en iyi 1RM. */
export function daySummary(todaySets, priorBestByExercise) {
  const working = todaySets.filter(isWorking)
  const bestToday = new Map()
  for (const set of working) {
    const value = estimate1RM(set.weight, set.reps)
    if (value == null) continue
    if (value > (bestToday.get(set.exerciseId) ?? -Infinity)) bestToday.set(set.exerciseId, value)
  }
  let prCount = 0
  for (const [exerciseId, value] of bestToday) {
    const prior = priorBestByExercise.get(exerciseId)
    if (prior != null && value > prior) prCount += 1
  }
  const times = todaySets.map((set) => set.timestamp)
  const minutes = times.length > 1 ? Math.round((Math.max(...times) - Math.min(...times)) / 60000) : 0
  return {
    volume: calculateVolumeLoad(working),
    workingSets: working.length,
    warmupSets: todaySets.length - working.length,
    prCount,
    minutes,
  }
}

/**
 * Hareketin `beforeTs` öncesi seanslarına göre durma durumu.
 * deload: son seansın çalışma ağırlığından (en ağır ısınma dışı set) hesaplanır; durma yoksa null.
 */
export function exerciseStall(sets, beforeTs, incrementStep) {
  const past = sets.filter((set) => set.timestamp < beforeTs)
  const status = stallStatus(sessionBests(past))
  if (!status.stalled) return { ...status, deload: null }
  const working = past.filter(isWorking)
  const lastDay = dayStart(Math.max(...working.map((set) => set.timestamp)))
  const workingWeight = Math.max(
    ...working.filter((set) => set.timestamp >= lastDay).map((set) => Number(set.weight) || 0),
  )
  return { ...status, deload: deloadWeight(workingWeight, incrementStep) }
}
