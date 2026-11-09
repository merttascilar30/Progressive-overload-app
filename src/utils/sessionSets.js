import { isActive, sortByOrder, withExerciseDefaults } from '../db'

export function startOfDay(timestamp = Date.now()) {
  const d = new Date(timestamp)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export const bySetOrder = (a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0) || a.timestamp - b.timestamp

/** Bugünden önceki en son antrenman gününün setleri (tek geçiş). */
export function getPreviousSessionSets(history, today = startOfDay()) {
  let lastDay = null
  for (const set of history) {
    const day = startOfDay(set.timestamp)
    if (day < today && (lastDay == null || day > lastDay)) lastDay = day
  }
  if (lastDay == null) return []
  return history.filter((set) => startOfDay(set.timestamp) === lastDay).sort(bySetOrder)
}

/** Hareketin tüm set geçmişini bugünkü ve önceki seans setlerine ayırır. */
export function splitHistory(history, today = startOfDay()) {
  return {
    todaySets: history.filter((set) => set.timestamp >= today).sort(bySetOrder),
    previousSets: getPreviousSessionSets(history, today),
  }
}

/**
 * Vücut ağırlığı ilerlemesi yalnızca hareket "bodyweight" ise ve önceki seansta ek yük
 * kullanılmadıysa (ısınma dışı en ağır set 0 kg ya da seans yok) uygulanır.
 * Böylece +10 kg ile yapılan barfiks ağırlıklı ilerlemeye devam eder.
 */
export function isBodyweightProgression(exercise, previousSets = []) {
  if (exercise?.equipmentType !== 'bodyweight') return false
  const working = previousSets.filter((set) => !set.isWarmup)
  if (working.length === 0) return true
  return Math.max(...working.map((set) => Number(set.weight) || 0)) === 0
}

/** getSetRecommendation için hareketin ayarlarından seçenekleri üretir. */
export function recommendationOptions(exercise, previousSets = []) {
  const ex = withExerciseDefaults(exercise)
  return {
    incrementStep: ex.incrementStep ?? 2.5,
    repRange: { min: ex.repMin, max: ex.repMax },
    bodyweight: isBodyweightProgression(exercise, previousSets),
  }
}

/** Günün seçicide görünen (arşivlenmemiş) hareketleri, kullanıcı sırasıyla. */
export function routineExercises(exercises, routineId) {
  return exercises.filter((ex) => isActive(ex) && ex.routineId === routineId).sort(sortByOrder)
}
