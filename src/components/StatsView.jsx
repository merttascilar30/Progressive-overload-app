import { useEffect, useMemo, useState } from 'react'
import { getSetsSince, isActive, sortByOrder } from '../db'
import { dailyBest1RM, exerciseStall, filterRange, weekStart, weeklyMuscleSets } from '../utils/stats'
import { startOfDay } from '../utils/sessionSets'
import OneRMChart from './OneRMChart'
import MuscleWeekBars from './MuscleWeekBars'

const RANGES = [
  { key: '1m', label: '1A' },
  { key: '3m', label: '3A' },
  { key: '6m', label: '6A' },
  { key: 'all', label: 'Tümü' },
]

/** İstatistik sekmesi: 1RM grafiği, bu haftanın kas grubu setleri ve duran hareketler. */
export default function StatsView({ routines, exercises, selectedExerciseId, refreshToken = 0 }) {
  // Veri ve okunduğu an birlikte tutulur; hesaplar render sırasında Date.now() çağırmaz.
  const [loaded, setLoaded] = useState(null) // { sets, at }
  const sets = loaded?.sets ?? null
  const now = loaded?.at ?? 0
  const [error, setError] = useState('')
  const [range, setRange] = useState('3m')
  const [chosenId, setChosenId] = useState(selectedExerciseId ?? null)

  useEffect(() => {
    let cancelled = false
    getSetsSince(0)
      .then((rows) => {
        if (cancelled) return
        setLoaded({ sets: rows, at: Date.now() })
        setError('')
      })
      .catch((err) => {
        if (!cancelled) setError(`İstatistikler yüklenemedi: ${err.message}`)
      })
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const groups = useMemo(
    () =>
      routines
        .filter(isActive)
        .map((routine) => ({
          routine,
          items: exercises.filter((ex) => isActive(ex) && ex.routineId === routine.id).sort(sortByOrder),
        }))
        .filter((group) => group.items.length > 0),
    [routines, exercises],
  )
  const activeExercises = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const exerciseId = activeExercises.some((ex) => ex.id === chosenId) ? chosenId : (activeExercises[0]?.id ?? null)

  const setsByExercise = useMemo(() => {
    const map = new Map()
    for (const set of sets ?? []) {
      if (!map.has(set.exerciseId)) map.set(set.exerciseId, [])
      map.get(set.exerciseId).push(set)
    }
    return map
  }, [sets])

  const points = useMemo(
    () => filterRange(dailyBest1RM(setsByExercise.get(exerciseId) ?? []), range, now),
    [setsByExercise, exerciseId, range, now],
  )
  const muscleRows = useMemo(
    () => weeklyMuscleSets(sets ?? [], new Map(exercises.map((ex) => [ex.id, ex])), now),
    [sets, exercises, now],
  )
  const stalled = useMemo(() => {
    const today = startOfDay(now)
    return activeExercises
      .map((ex) => ({ ex, stall: exerciseStall(setsByExercise.get(ex.id) ?? [], today, ex.incrementStep ?? 2.5) }))
      .filter((row) => row.stall.stalled)
  }, [activeExercises, setsByExercise, now])

  if (error) {
    return (
      <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        {error}
      </p>
    )
  }
  if (sets === null) return <p className="text-center text-sm text-slate-500">Yükleniyor…</p>

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-400" htmlFor="stats-exercise">
          Hareket
        </label>
        <select
          id="stats-exercise"
          value={exerciseId ?? ''}
          onChange={(e) => setChosenId(Number(e.target.value))}
          className="h-14 w-full appearance-none rounded-2xl border border-slate-800 bg-slate-900 px-4 text-base font-semibold text-white outline-none ring-emerald-500 focus:ring-2"
        >
          {activeExercises.length === 0 && <option value="">Hareket yok</option>}
          {groups.map(({ routine, items }) => (
            <optgroup key={routine.id} label={routine.name}>
              {items.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Zaman aralığı">
        {RANGES.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={range === option.key}
            onClick={() => setRange(option.key)}
            className={`h-10 rounded-xl text-sm font-semibold ${
              range === option.key ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-300 active:bg-slate-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <OneRMChart key={`${exerciseId}|${range}`} points={points} />

      <MuscleWeekBars rows={muscleRows} weekStartTs={weekStart(now)} />

      {stalled.length > 0 && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-amber-300">Dikkat</h2>
          <ul className="space-y-2">
            {stalled.map(({ ex, stall }) => (
              <li key={ex.id}>
                <button
                  type="button"
                  onClick={() => setChosenId(ex.id)}
                  className="min-h-10 w-full rounded-xl px-2 py-1 text-left text-sm text-amber-100 active:bg-amber-500/10"
                >
                  {ex.name} · {stall.sessions} seanstır artmadı · deload {stall.deload} kg
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
