import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db'
import { getSetRecommendation } from '../utils/progressionEngine'
import { recommendationOptions, splitHistory } from '../utils/sessionSets'

const EMPTY = { exerciseId: null, todaySets: [], previousSets: [] }

/**
 * Seçili hareketin bugünkü/önceki seans setleri ve öneri.
 * `exercise` (id) değişince yeniden yükler; geç gelen eski istekler `requestId` ile yok sayılır.
 * `loadedExerciseId`: verinin ait olduğu hareket (yükleme bitene kadar önceki hareketinki);
 * form ön-doldurma bunu bekler. `onError` isteğe bağlı: otomatik yüklemedeki hatalar için.
 * `reload()` hata durumunda reddeder.
 */
export default function useExerciseData(exercise, onError) {
  const exerciseId = exercise?.id ?? null
  const [data, setData] = useState(EMPTY)
  const requestIdRef = useRef(0)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  })

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current
    if (exerciseId == null) return // Boş seçim: render'da EMPTY türetilir
    const history = await db.sets.where('exerciseId').equals(exerciseId).sortBy('timestamp')
    if (requestId !== requestIdRef.current) return
    setData({ exerciseId, ...splitHistory(history) })
  }, [exerciseId])

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    reload().catch((error) => {
      if (requestId === requestIdRef.current) {
        onErrorRef.current?.(`Antrenman verisi yüklenemedi: ${error.message}`)
      }
    })
  }, [reload])

  // Öneri hareketin ayarlarından türetilir; ayar değişince yeniden okuma gerekmez.
  const current = data.exerciseId === exerciseId
  const previousSets = current ? data.previousSets : EMPTY.previousSets
  const { incrementStep, repRange, bodyweight } = recommendationOptions(exercise, previousSets)
  const { min, max } = repRange
  const recommendation = useMemo(
    () => getSetRecommendation(previousSets, { incrementStep, repRange: { min, max }, bodyweight }),
    [previousSets, incrementStep, min, max, bodyweight],
  )

  return {
    todaySets: current ? data.todaySets : EMPTY.todaySets,
    previousSets,
    recommendation,
    reload,
    loadedExerciseId: exerciseId == null ? null : data.exerciseId,
  }
}
