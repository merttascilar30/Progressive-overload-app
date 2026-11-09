import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { db, deleteSetAndRenumber, getSetsBetween, lastBestBefore, oldestSetTimestamp, updateSet } from '../db'
import { startOfDay } from '../utils/sessionSets'
import { DEFAULT_RIR, parseSetInput } from '../utils/progressionEngine'
import { groupSets } from '../utils/historyGroups'

const PAGE_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

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

export default function HistoryView({ exercises, onSetDeleted, refreshToken = 0 }) {
  const [groups, setGroups] = useState(null)
  const [editModeDate, setEditModeDate] = useState(null)
  const [editingSetId, setEditingSetId] = useState(null)
  const [draft, setDraft] = useState({ weight: 0, reps: 1, rir: 0 })
  const [loadError, setLoadError] = useState('')
  const [editError, setEditError] = useState('')

  const requestRef = useRef(0)
  // Yüklenen pencerenin başlangıcı: son 30 gün; "Daha fazla göster" 30 gün geriye genişletir.
  const [windowStart, setWindowStart] = useState(() => startOfDay() - (PAGE_DAYS - 1) * DAY_MS)
  const [hasMore, setHasMore] = useState(false)

  const load = useCallback(async () => {
    const requestId = ++requestRef.current
    try {
      const [sets, routines, oldest] = await Promise.all([
        getSetsBetween(windowStart, Number.MAX_SAFE_INTEGER),
        db.routines.toArray(),
        oldestSetTimestamp(),
      ])
      const priorBest = await lastBestBefore([...new Set(sets.map((set) => set.exerciseId))], windowStart)
      if (requestId !== requestRef.current) return // Eski yanıt yenisinin üstüne yazmasın
      const exerciseInfo = new Map(exercises.map((ex) => [ex.id, ex]))
      const routineNames = new Map(routines.map((r) => [r.id, r.name]))
      setGroups(groupSets(sets, exerciseInfo, routineNames, priorBest))
      setHasMore(oldest != null && oldest < windowStart)
      setLoadError('')
    } catch (error) {
      if (requestId === requestRef.current) setLoadError(`Geçmiş yüklenemedi: ${error.message}`)
    }
  }, [exercises, windowStart])

  useEffect(() => {
    const ref = requestRef
    // oxlint-disable-next-line react/set-state-in-effect -- IndexedDB senkronizasyonu
    load()
    return () => {
      ref.current++ // Unmount sonrası state yazımını iptal et
    }
  }, [load, refreshToken]) // refreshToken: geri alma sonrası yeniden oku

  function toggleEditMode(key) {
    setEditingSetId(null)
    setEditError('')
    setEditModeDate((prev) => (prev === key ? null : key))
  }

  function startEdit(set) {
    setEditingSetId(set.id)
    setEditError('')
    setDraft({
      weight: set.weight,
      reps: set.reps,
      rir: typeof set.rir === 'number' ? set.rir : DEFAULT_RIR,
      isWarmup: Boolean(set.isWarmup),
    })
  }

  async function confirmEdit() {
    const { value, error } = parseSetInput(draft)
    if (error) {
      setEditError(error)
      return
    }

    try {
      await updateSet(editingSetId, { ...value, isWarmup: Boolean(draft.isWarmup) })
      setEditingSetId(null)
      setEditError('')
      await load()
    } catch (err) {
      setEditError(`Set güncellenemedi: ${err.message}`)
    }
  }

  async function deleteSet(set) {
    try {
      await deleteSetAndRenumber(set.id)
      if (editingSetId === set.id) setEditingSetId(null)
      setEditError('')
      onSetDeleted?.(set)
      await load()
    } catch (err) {
      setEditError(`Set silinemedi: ${err.message}`)
    }
  }

  if (groups === null) {
    return <p role={loadError ? 'alert' : undefined} className="text-center text-sm text-slate-500">{loadError || 'Yükleniyor…'}</p>
  }

  const moreButton = hasMore && (
    <button
      type="button"
      onClick={() => setWindowStart((start) => start - PAGE_DAYS * DAY_MS)}
      className="h-12 w-full rounded-2xl bg-slate-800 text-sm font-semibold text-slate-200 active:bg-slate-700"
    >
      Daha fazla göster
    </button>
  )

  if (groups.length === 0) {
    return (
      <div className="space-y-4">
        <p className="rounded-2xl border border-dashed border-slate-800 px-4 py-8 text-center text-sm text-slate-500">
          {hasMore ? 'Son günlerde kayıt yok.' : 'Henüz kayıtlı antrenman yok.'}
        </p>
        {moreButton}
      </div>
    )
  }

  const draftInputClass =
    'h-9 w-14 rounded-lg border border-slate-700 bg-slate-950 text-center text-sm font-bold text-white outline-none ring-emerald-500 focus:ring-2'
  const iconButtonClass =
    'flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 active:bg-slate-700'

  return (
    <div className="space-y-4">
      {editError && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {editError}
        </div>
      )}
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
                              <span className="flex flex-wrap items-center gap-1">
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
                                <button
                                  type="button"
                                  aria-pressed={Boolean(draft.isWarmup)}
                                  onClick={() => setDraft((prev) => ({ ...prev, isWarmup: !prev.isWarmup }))}
                                  className={`h-9 rounded-lg px-2 text-xs font-semibold ${
                                    draft.isWarmup ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400 active:bg-slate-700'
                                  }`}
                                >
                                  Isınma
                                </button>
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
                                  onClick={() => {
                                    setEditingSetId(null)
                                    setEditError('')
                                  }}
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
                                {set.isWarmup && <span className="ml-2 text-xs font-semibold text-amber-400">Isınma</span>}
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
                                    onClick={() => deleteSet(set)}
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
      {moreButton}
    </div>
  )
}
