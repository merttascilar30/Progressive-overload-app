// Kaydedilmemiş set formu taslakları (hareket başına, cihazda). Depolama hataları sessizce yok sayılır.

export const DRAFT_TTL_MS = 6 * 60 * 60 * 1000

const key = (exerciseId) => `overload:draft:${exerciseId}`

function remove(exerciseId) {
  try {
    localStorage.removeItem(key(exerciseId))
  } catch {
    // depolama yok
  }
}

/** Geçerli taslak { weight, reps, rir, isWarmup } ya da null. Süresi dolmuşsa siler. */
export function readDraft(exerciseId, now = Date.now()) {
  let raw
  try {
    raw = localStorage.getItem(key(exerciseId))
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const { weight, reps, rir, isWarmup, savedAt } = JSON.parse(raw)
    if (!Number.isFinite(savedAt) || now - savedAt > DRAFT_TTL_MS) {
      remove(exerciseId)
      return null
    }
    return { weight, reps, rir, isWarmup: Boolean(isWarmup) }
  } catch {
    remove(exerciseId)
    return null
  }
}

export function writeDraft(exerciseId, { weight, reps, rir, isWarmup }, now = Date.now()) {
  try {
    localStorage.setItem(
      key(exerciseId),
      JSON.stringify({ weight, reps, rir, isWarmup: Boolean(isWarmup), savedAt: now }),
    )
  } catch {
    // Gizli sekme / kota: taslaksız devam
  }
}

export function clearDraft(exerciseId) {
  remove(exerciseId)
}

/** Tüm taslakları siler (yedekten geri yüklemede id'ler başka hareketlere ait olabilir). */
export function clearAllDrafts() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const name = localStorage.key(i)
      if (name?.startsWith('overload:draft:')) keys.push(name)
    }
    for (const name of keys) localStorage.removeItem(name)
  } catch {
    // depolama yok
  }
}
