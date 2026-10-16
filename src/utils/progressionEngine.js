const DEFAULT_REP_RANGE = { min: 8, max: 10 }

function finiteNumber(value, label) {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new TypeError(`${label} sonlu bir sayı olmalıdır.`)
  return number
}

// Brzycki tahmini yüksek tekrar sayılarında aşırı sapabildiği için 1–12 ile sınırlandırılır.
export function calculate1RM(weight, reps) {
  const load = finiteNumber(weight, 'Ağırlık')
  const count = finiteNumber(reps, 'Tekrar')
  if (load < 0) throw new RangeError('Ağırlık negatif olamaz.')
  if (!Number.isInteger(count) || count < 1 || count > 12) {
    throw new RangeError('Brzycki 1RM tahmini için tekrar 1–12 arasında tam sayı olmalıdır.')
  }
  return count === 1 ? load : load * (36 / (37 - count))
}

export function calculateVolumeLoad(sets) {
  return sets.reduce((total, set) => {
    const weight = finiteNumber(set.weight, 'Ağırlık')
    const reps = finiteNumber(set.reps, 'Tekrar')
    if (weight < 0) throw new RangeError('Ağırlık negatif olamaz.')
    if (!Number.isInteger(reps) || reps < 1) {
      throw new RangeError('Tekrar pozitif tam sayı olmalıdır.')
    }
    return total + weight * reps
  }, 0)
}

// Tek set değil, önceki seansın tüm çalışma setlerine göre double progression.
export function getSetRecommendation(previousSets, incrementStep = 2.5, repRange = DEFAULT_REP_RANGE) {
  if (!Array.isArray(previousSets) || previousSets.length === 0) {
    return 'İlk antrenman: Kontrollü bir başlangıç ağırlığı seç ve hedef tekrar aralığında kal.'
  }

  const step = finiteNumber(incrementStep, 'Ağırlık artışı')
  const { min, max } = repRange
  if (step <= 0) throw new RangeError('Ağırlık artışı sıfırdan büyük olmalıdır.')
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
    throw new RangeError('Geçerli bir tekrar aralığı girilmelidir.')
  }

  const sets = previousSets.filter((set) =>
    Number.isFinite(Number(set.weight)) && Number(set.weight) >= 0 &&
    Number.isInteger(Number(set.reps)) && Number(set.reps) >= 1,
  )
  if (sets.length === 0) return 'Önceki seansta geçerli set bulunamadı; kontrollü bir ağırlık seç.'

  const lastWeight = Number(sets[sets.length - 1].weight)
  if (sets.every((set) => Number(set.reps) >= max)) {
    return `Hedef: ${lastWeight + step} kg ile ${min}–${max} tekrar.`
  }

  const nextReps = Math.min(max, Math.max(min, Math.max(...sets.map((set) => Number(set.reps))) + 1))
  return `Hedef: ${lastWeight} kg ile ${nextReps} tekrar; setlerde formu koru.`
}
