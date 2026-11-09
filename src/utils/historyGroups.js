import { calculateVolumeLoad, estimate1RM } from './progressionEngine'

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function dayKey(timestamp) {
  const d = new Date(timestamp)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Setleri gün -> egzersiz -> setler şeklinde gruplar (en yeni gün önce).
// Her egzersiz için günün en yüksek 1RM'i ve bir önceki güne göre farkı hesaplanır.
// priorBest: yüklenen pencereden önceki son günün en iyisi (sayfalama); en eski günün farkı buna göre.
export function groupSets(sets, exerciseInfo, routineNames, priorBest = new Map()) {
  const days = new Map()
  // exerciseId -> Map(dayKey -> en yüksek 1RM)
  const best1RM = new Map()

  for (const set of sets) {
    const key = dayKey(set.timestamp)
    if (!days.has(key)) days.set(key, new Map())
    const exMap = days.get(key)
    if (!exMap.has(set.exerciseId)) exMap.set(set.exerciseId, [])
    exMap.get(set.exerciseId).push(set)

    // 0 kg (vücut ağırlığı) ve >12 tekrar için estimate1RM null döner; rozet hesabına katılmaz.
    // Isınma setleri 1RM karşılaştırmasına katılmaz.
    const estimate = set.isWarmup ? null : estimate1RM(set.weight, set.reps)
    if (estimate != null) {
      if (!best1RM.has(set.exerciseId)) best1RM.set(set.exerciseId, new Map())
      const perDay = best1RM.get(set.exerciseId)
      perDay.set(key, Math.max(perDay.get(key) ?? 0, estimate))
    }
  }

  // Farkları tek seferde hesapla: gün sırasına göre bir önceki günle kıyasla.
  const deltas = new Map()
  for (const [exerciseId, perDay] of best1RM) {
    const keys = [...perDay.keys()].sort((a, b) => a - b)
    const prior = priorBest.get(exerciseId)
    if (prior != null) deltas.set(`${exerciseId}|${keys[0]}`, perDay.get(keys[0]) - prior)
    for (let i = 1; i < keys.length; i++) {
      deltas.set(`${exerciseId}|${keys[i]}`, perDay.get(keys[i]) - perDay.get(keys[i - 1]))
    }
  }

  return [...days.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([key, exMap]) => {
      const routineSet = new Set()
      const exercises = [...exMap.entries()].map(([exerciseId, list]) => {
        const info = exerciseInfo.get(exerciseId)
        const routineName = routineNames.get(info?.routineId)
        if (routineName) routineSet.add(routineName)
        return {
          exerciseId,
          name: info?.name ?? 'Bilinmeyen hareket',
          delta: deltas.get(`${exerciseId}|${key}`) ?? null,
          volume: calculateVolumeLoad(list),
          sets: list.sort(
            (a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0) || a.timestamp - b.timestamp,
          ),
        }
      })

      return {
        key,
        title: dateFormatter.format(new Date(key)),
        routines: [...routineSet].join(' / '),
        exercises,
      }
    })
}

