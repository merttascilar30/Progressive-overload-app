import { useEffect, useState } from 'react'
import { getSetsSince, lastBestBefore } from '../db'
import { startOfDay } from '../utils/sessionSets'
import { daySummary } from '../utils/stats'

/**
 * Bugünün tüm hareketlerindeki setlerden günün özeti. Bugün set yoksa null.
 * `refreshKey` değişince yeniden okunur (set kaydı, silme, geri alma, sekme dönüşü).
 */
export default function useTodaySummary(refreshKey, onError) {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const today = startOfDay()
      const sets = await getSetsSince(today)
      if (!sets.length) return null
      const ids = [...new Set(sets.map((set) => set.exerciseId))]
      return daySummary(sets, await lastBestBefore(ids, today))
    }
    load()
      .then((next) => {
        if (!cancelled) setSummary(next)
      })
      .catch((error) => {
        if (!cancelled) onError?.(`Günün özeti yüklenemedi: ${error.message}`)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps -- onError kimliği değişse de yeniden okunmaz

  return summary
}
