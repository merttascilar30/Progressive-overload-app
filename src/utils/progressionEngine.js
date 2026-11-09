const DEFAULT_REP_RANGE = { min: 6, max: 8 }

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

export const LIMITS = Object.freeze({ maxWeight: 1000, maxReps: 100, maxRir: 10 })

export function isValidSet(set) {
  const weight = Number(set?.weight)
  const reps = Number(set?.reps)
  return Number.isFinite(weight) && weight >= 0 && Number.isInteger(reps) && reps >= 1
}

/**
 * UI/DB için güvenli 1RM: geçersiz giriş, 0 kg (vücut ağırlığı) veya >12 tekrar için throw etmeden null döner.
 */
export function estimate1RM(weight, reps) {
  const load = Number(weight)
  const count = Number(reps)
  if (!Number.isFinite(load) || load <= 0) return null
  if (!Number.isInteger(count) || count < 1 || count > 12) return null
  return Math.round(calculate1RM(load, count) * 10) / 10
}

/** Hacim yükü = Σ(ağırlık × tekrar). Isınma ve geçersiz setler atlanır, throw etmez. */
export function calculateVolumeLoad(sets) {
  return Number(
    sets.reduce(
      (total, set) => (isValidSet(set) && !set.isWarmup ? total + Number(set.weight) * Number(set.reps) : total),
      0,
    ).toFixed(2),
  )
}

const isBlank = (value) => value == null || String(value).trim() === ''

/**
 * Tek doğrulama noktası (App + HistoryView). Boş alanın sessizce 0'a dönüşmesini engeller.
 * Dönüş: { value: { weight, reps, rir, estimated1RM } } | { error }
 */
export function parseSetInput({ weight, reps, rir }) {
  if (isBlank(weight) || isBlank(reps) || isBlank(rir)) {
    return { error: 'Ağırlık, tekrar ve RIR boş bırakılamaz.' }
  }
  const load = Number(weight)
  const repCount = Number(reps)
  const rirCount = Number(rir)

  if (!Number.isFinite(load) || load < 0 || load > LIMITS.maxWeight) {
    return { error: `Ağırlık 0–${LIMITS.maxWeight} kg arasında olmalıdır.` }
  }
  if (!Number.isInteger(repCount) || repCount < 1 || repCount > LIMITS.maxReps) {
    return { error: `Tekrar 1–${LIMITS.maxReps} arasında tam sayı olmalıdır.` }
  }
  if (!Number.isInteger(rirCount) || rirCount < 0 || rirCount > LIMITS.maxRir) {
    return { error: `RIR 0–${LIMITS.maxRir} arasında tam sayı olmalıdır.` }
  }

  const cleanWeight = Number(load.toFixed(2))
  return {
    value: {
      weight: cleanWeight,
      reps: repCount,
      rir: rirCount,
      estimated1RM: estimate1RM(cleanWeight, repCount),
    },
  }
}

// RIR'ı kaydedilmemiş eski setler bu değerle (hedef efor) kabul edilir.
export const DEFAULT_RIR = 2

// Kayan nokta hatalarını (ör. 22.500000001) gösterimden temizler.
function kg(value) {
  return Number(Math.max(0, value).toFixed(2))
}

/**
 * Önceki seansın çalışma setlerine göre RIR destekli double progression (varsayılan aralık 6–8).
 * Çalışma ağırlığı = seanstaki en ağır yük; hafif/back-off setler karara katılmaz.
 *
 * - Çalışma ağırlığında en az bir set aralığın tepesine (8) ulaştı: ağırlığı artır
 *   (ort. RIR ≥ 4 ise 2 adım, değilse 1 adım).
 * - En iyi set bile aralığın altında (< 6) kaldı: ağırlığı 1 adım düşür.
 * - Aksi halde aynı ağırlıkla tekrar artır (RIR ≥ 3 ise +2, değilse +1; tavan 8).
 */
export function getSetRecommendation(
  previousSets,
  { incrementStep = 2.5, repRange = DEFAULT_REP_RANGE, bodyweight = false } = {},
) {
  const empty = (message) => ({ weight: null, reps: null, message })
  if (!Array.isArray(previousSets) || previousSets.length === 0) {
    return empty('İlk antrenman: Kontrollü bir başlangıç ağırlığı seç ve hedef tekrar aralığında kal.')
  }

  const step = finiteNumber(incrementStep, 'Ağırlık artışı')
  const { min, max } = repRange
  if (step <= 0) throw new RangeError('Ağırlık artışı sıfırdan büyük olmalıdır.')
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
    throw new RangeError('Geçerli bir tekrar aralığı girilmelidir.')
  }

  // Isınma setleri karara katılmaz.
  const sets = previousSets.filter((set) => isValidSet(set) && !set.isWarmup)
  if (sets.length === 0) {
    return empty('Önceki seansta geçerli set bulunamadı; kontrollü bir ağırlık seç.')
  }

  // Çalışma ağırlığı = seanstaki en ağır yük; back-off setleri öneriyi bozmasın.
  const workingWeight = Math.max(...sets.map((set) => Number(set.weight)))
  const working = sets.filter((set) => Number(set.weight) === workingWeight)
  const reps = working.map((set) => Number(set.reps))
  const bestReps = Math.max(...reps)
  const rirs = working.map((set) => {
    const value = Number(set.rir)
    return set.rir != null && Number.isFinite(value) ? value : DEFAULT_RIR
  })
  const avgRir = rirs.reduce((sum, value) => sum + value, 0) / rirs.length
  const rirLabel = `ort. RIR ${Number(avgRir.toFixed(1))}`

  // Vücut ağırlığı: yük değişmez, yalnızca tekrar artar.
  if (bodyweight) {
    if (bestReps >= max) {
      return { weight: 0, reps: max, message: 'Tavana ulaştın: hareketi zorlaştır veya ağırlık ekle.' }
    }
    const target = Math.min(max, Math.max(min, bestReps + (avgRir >= 3 ? 2 : 1)))
    return { weight: 0, reps: target, message: `Hedef: ${target} tekrar; setlerde formu koru (${rirLabel}).` }
  }

  // Üst sınıra ulaşıldı → ağırlık artar. RIR sadece artış miktarını belirler.
  if (bestReps >= max) {
    if (avgRir >= 4) {
      const weight = kg(workingWeight + step * 2)
      return {
        weight,
        reps: min,
        message: `Hedef: ${weight} kg ile ${min}–${max} tekrar. Önceki seans çok rahattı (${rirLabel}).`,
      }
    }
    const weight = kg(workingWeight + step)
    return { weight, reps: min, message: `Hedef: ${weight} kg ile ${min}–${max} tekrar (${rirLabel}).` }
  }

  // En iyi set bile alt sınırın altında kaldı → ağırlık düşer (0 kg'ın altına inmez).
  if (bestReps < min) {
    const lowered = kg(workingWeight - step)
    if (lowered < workingWeight) {
      return {
        weight: lowered,
        reps: min,
        message: `Hedef: ${lowered} kg ile ${min}–${max} tekrar. ${min} tekrarın altında kaldın (en iyi set ${bestReps} tekrar).`,
      }
    }
    return {
      weight: kg(workingWeight),
      reps: min,
      message: `Hedef: ${kg(workingWeight)} kg ile ${min} tekrar; ${min} tekrarın altında kaldın, formu koru.`,
    }
  }

  const repJump = avgRir >= 3 ? 2 : 1
  const nextReps = Math.min(max, bestReps + repJump)
  return {
    weight: kg(workingWeight),
    reps: nextReps,
    message: `Hedef: ${kg(workingWeight)} kg ile ${nextReps} tekrar; setlerde formu koru (${rirLabel}).`,
  }
}
