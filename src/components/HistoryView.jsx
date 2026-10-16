import { useCallback, useEffect, useState } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { db } from '../db'
import { calculate1RM } from '../utils/progressionEngine'

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

function setEstimate(set) {
  try {
    return calculate1RM(set.weight, set.reps)
  } catch {
    return null
  }
}

// Setleri gün -> egzersiz -> setler şeklinde gruplar (en yeni gün önce).
// Her egzersiz için günün en yüksek 1RM'i ve bir önceki güne göre farkı hesaplanır.
function groupSets(sets, exerciseInfo, routineNames) {
  const days = new Map()
  // exerciseId -> Map(dayKey -> en yüksek 1RM)
  const best1RM = new Map()

  for (const set of sets) {
    const key = dayKey(set.timestamp)
    if (!days.has(key)) days.set(key, new Map())
    const exMap = days.get(key)
    if (!exMap.has(set.exerciseId)) exMap.set(set.exerciseId, [])
    exMap.get(set.exerciseId).push(set)

    if (!best1RM.has(set.exerciseId)) best1RM.set(set.exerciseId, new Map())
    const perDay = best1RM.get(set.exerciseId)
    const estimate = setEstimate(set)
    if (estimate != null) perDay.set(key, Math.max(perDay.get(key) ?? 0, estimate))
  }

  function getDelta(exerciseId, key) {
    const perDay = best1RM.get(exerciseId)
    if (!perDay?.has(key)) return null
    const previousDays = [...perDay.keys()].filter((k) => k < key)
    if (previousDays.length === 0) return null
    const previousKey = Math.max(...previousDays)
    return perDay.get(key) - perDay.get(previousKey)
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
          delta: getDelta(exerciseId, key),
          volume: list.reduce((total, set) => {
            const weight = Number(set.weight)
            const reps = Number(set.reps)
            return Number.isFinite(weight) && weight >= 0 && Number.isInteger(reps) && reps > 0
              ? total + weight * reps
              : total
          }, 0),
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

function ProgressBadge({ delta }) {
  if (delta == null) return null

  const rounded = Math.round(delta * 10) / 10
  if (rounded === 0) {
    return (
      <span className="text-xs font-semibold text-slate-400" title="Önceki güne göre aynı">
        ⚖️
      </span>
    )
  }
  if (rounded > 0) {
    return <span className="text-xs font-semibold text-emerald-400">📈 +{rounded} kg</span>
  }
  return <span className="text-xs font-semibold text-red-400">📉 {rounded} kg</span>
}

export default function HistoryView({ exercises }) {
  const [groups, setGroups] = useState(null)
  const [editModeDate, setEditModeDate] = useState(null)
  const [editingSetId, setEditingSetId] = useState(null)
  const [draft, setDraft] = useState({ weight: 0, reps: 1, rir: 0 })
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    try {
      const [sets, routines] = await Promise.all([db.sets.toArray(), db.routines.toArray()])
      const exerciseInfo = new Map(exercises.map((ex) => [ex.id, ex]))
      const routineNames = new Map(routines.map((r) => [r.id, r.name]))
      setGroups(groupSets(sets, exerciseInfo, routineNames))
      setLoadError('')
    } catch (error) {
      setLoadError(`Geçmiş yüklenemedi: ${error.message}`)
    }
  }, [exercises])

  useEffect(() => {
    load()
  }, [load])

  function toggleEditMode(key) {
    setEditingSetId(null)
    setEditModeDate((prev) => (prev === key ? null : key))
  }

  function startEdit(set) {
    setEditingSetId(set.id)
    setDraft({
      weight: set.weight,
      reps: set.reps,
      rir: typeof set.rir === 'number' ? set.rir : 0,
    })
  }

  async function confirmEdit() {
    const weight = Math.max(0, Number(draft.weight) || 0)
    const reps = Math.min(100, Math.max(1, Number(draft.reps) || 1))
    const rir = Math.max(0, Number(draft.rir) || 0)
    await db.sets.update(editingSetId, {
      weight,
      reps,
      rir,
      estimated1RM: reps <= 12 ? Number(calculate1RM(weight, reps).toFixed(1)) : null,
    })
    setEditingSetId(null)
    await load()
  }

  async function deleteSet(id) {
    await db.sets.delete(id)
    if (editingSetId === id) setEditingSetId(null)
    await load()
  }

  if (groups === null) {
    return <p role={loadError ? 'alert' : undefined} className="text-center text-sm text-slate-500">{loadError || 'Yükleniyor…'}</p>
  }

  if (groups.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-800 px-4 py-8 text-center text-sm text-slate-500">
        Henüz kayıtlı antrenman yok.
      </p>
    )
  }

  const draftInputClass =
    'h-9 w-14 rounded-lg border border-slate-700 bg-slate-950 text-center text-sm font-bold text-white outline-none ring-emerald-500 focus:ring-2'
  const iconButtonClass =
    'flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 active:bg-slate-700'

  return (
    <div className="space-y-4">
      {groups.map((day) => {
        const isEditMode = editModeDate === day.key
        return (
          <section
            key={day.key}
            className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-white">
                {day.title}
                {day.routines ? ` - ${day.routines}` : ''}
              </h2>
              <button
                type="button"
                onClick={() => toggleEditMode(day.key)}
                aria-label={isEditMode ? 'Düzenlemeyi bitir' : 'Günü düzenle'}
                className={`flex h-9 shrink-0 items-center justify-center rounded-xl px-3 text-sm font-semibold ${
                  isEditMode
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-slate-800 text-slate-300 active:bg-slate-700'
                }`}
              >
                {isEditMode ? 'Bitti' : <Pencil className="h-4 w-4" />}
              </button>
            </div>
            <div className="space-y-4">
              {day.exercises.map((ex) => (
                <div key={ex.exerciseId}>
                  <div className="mb-2 flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                      {ex.name} · Hacim {ex.volume.toLocaleString('tr-TR')} kg
                    </p>
                    <ProgressBadge delta={ex.delta} />
                  </div>
                  <ul className="space-y-1">
                    {ex.sets.map((set) => {
                      const isEditing = isEditMode && editingSetId === set.id
                      return (
                        <li
                          key={set.id}
                          className="flex min-h-9 items-center justify-between gap-2 text-sm text-slate-200"
                        >
                          {isEditing ? (
                            <>
                              <span className="flex items-center gap-1">
                                <span className="text-slate-400">S{set.setNumber}</span>
                                {[
                                  ['weight', 'Kg', 'decimal'],
                                  ['reps', 'Tekrar', 'numeric'],
                                  ['rir', 'RIR', 'numeric'],
                                ].map(([field, label, mode]) => (
                                  <input
                                    key={field}
                                    type="number"
                                    inputMode={mode}
                                    aria-label={label}
                                    placeholder={label}
                                    value={draft[field]}
                                    onChange={(e) =>
                                      setDraft((prev) => ({ ...prev, [field]: e.target.value }))
                                    }
                                    className={draftInputClass}
                                  />
                                ))}
                              </span>
                              <span className="flex gap-1">
                                <button
                                  type="button"
                                  aria-label="Onayla"
                                  onClick={confirmEdit}
                                  className={`${iconButtonClass} text-emerald-400`}
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="İptal"
                                  onClick={() => setEditingSetId(null)}
                                  className={`${iconButtonClass} text-slate-300`}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </span>
                            </>
                          ) : (
                            <>
                              <span>
                                Set {set.setNumber}: {set.weight}kg × {set.reps}
                                {typeof set.rir === 'number' ? ` (RIR ${set.rir})` : ''}
                              </span>
                              {isEditMode && (
                                <span className="flex gap-1">
                                  <button
                                    type="button"
                                    aria-label="Seti düzenle"
                                    onClick={() => startEdit(set)}
                                    className={`${iconButtonClass} text-slate-300`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Seti sil"
                                    onClick={() => deleteSet(set.id)}
                                    className={`${iconButtonClass} text-red-400`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </span>
                              )}
                            </>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
