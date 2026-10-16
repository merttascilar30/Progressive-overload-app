import { useCallback, useEffect, useRef, useState } from 'react'
import { Dumbbell, History, Pencil, Settings, Trash2 } from 'lucide-react'
import { db, seedDatabase } from './db'
import HistoryView from './components/HistoryView'
import ExercisePoolModal from './components/ExercisePoolModal'
import ManageModal from './components/ManageModal'
import {
  calculate1RM,
  getSetRecommendation,
} from './utils/progressionEngine'

function todayDateString() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfDay(timestamp = Date.now()) {
  const d = new Date(timestamp)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function startOfToday() {
  return startOfDay()
}

function estimate1RMOrNull(load, repCount) {
  return repCount <= 12 ? Number(calculate1RM(load, repCount).toFixed(1)) : null
}

function getPreviousSessionSets(history) {
  const today = startOfToday()
  const byDay = new Map()

  for (const set of history) {
    const day = startOfDay(set.timestamp)
    if (day >= today) continue
    const bucket = byDay.get(day)
    if (bucket) bucket.push(set)
    else byDay.set(day, [set])
  }

  const days = [...byDay.keys()].sort((a, b) => a - b)
  const lastDay = days[days.length - 1]
  if (lastDay == null) return []

  return byDay.get(lastDay).sort((a, b) => {
    const byNumber = (a.setNumber ?? 0) - (b.setNumber ?? 0)
    return byNumber !== 0 ? byNumber : a.timestamp - b.timestamp
  })
}

export default function App() {
  const [activeTab, setActiveTab] = useState('workout')
  const [routines, setRoutines] = useState([])
  const [routineId, setRoutineId] = useState(null)
  const [exercises, setExercises] = useState([])
  const [exerciseId, setExerciseId] = useState(null)
  const [recommendation, setRecommendation] = useState(() =>
    getSetRecommendation(null),
  )
  const [weight, setWeight] = useState(20)
  const [reps, setReps] = useState(8)
  const [rir, setRir] = useState(2)
  const [todaySets, setTodaySets] = useState([])
  const [previousSets, setPreviousSets] = useState([])
  const [saving, setSaving] = useState(false)
  const [storageError, setStorageError] = useState('')
  const [editingSetId, setEditingSetId] = useState(null)
  const loadRequestId = useRef(0)
  // null | 'routine-add' | 'routine-manage' | 'exercise-add' | 'exercise-manage'
  const [modal, setModal] = useState(null)

  const selectedExercise = exercises.find((ex) => ex.id === exerciseId)
  const visibleExercises = exercises.filter((ex) => ex.routineId === routineId)

  const loadExerciseData = useCallback(async (id, list, { prefill = false } = {}) => {
    const requestId = ++loadRequestId.current
    if (!id) {
      setPreviousSets([])
      setTodaySets([])
      setRecommendation(getSetRecommendation(null))
      return
    }

    try {
      const history = await db.sets.where('exerciseId').equals(id).sortBy('timestamp')
      if (requestId !== loadRequestId.current) return
      const from = startOfToday()
      const today = history.filter((set) => set.timestamp >= from)
      const previous = getPreviousSessionSets(history)

      setTodaySets(today)
      setPreviousSets(previous)

      const step = list?.find((ex) => ex.id === id)?.incrementStep ?? 2.5
      setRecommendation(getSetRecommendation(previous, step))

      const matchingPrevious = previous[previous.length - 1]
      if (prefill && matchingPrevious) {
        setWeight(matchingPrevious.weight)
        setReps(matchingPrevious.reps)
        setRir(typeof matchingPrevious.rir === 'number' ? matchingPrevious.rir : 2)
      }
    } catch (error) {
      if (requestId === loadRequestId.current) {
        setStorageError(`Antrenman verisi yüklenemedi: ${error.message}`)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        await seedDatabase()
        const routineList = await db.routines.toArray()
        const list = await db.exercises.toArray()
        if (cancelled) return

        setRoutines(routineList)
        setExercises(list)
        const firstRoutineId = routineList[0]?.id ?? null
        setRoutineId(firstRoutineId)
        const firstId = list.find((ex) => ex.routineId === firstRoutineId)?.id ?? null
        setExerciseId(firstId)
        await loadExerciseData(firstId, list, { prefill: true })
      } catch (error) {
        if (!cancelled) setStorageError(`Uygulama verisi yüklenemedi: ${error.message}`)
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [loadExerciseData])

  async function handleExerciseChange(nextId, list = exercises) {
    setExerciseId(nextId)
    setEditingSetId(null)
    setTodaySets([])
    setPreviousSets([])
    setRecommendation(getSetRecommendation(null))
    await loadExerciseData(nextId, list, { prefill: true })
  }

  async function handleRoutineChange(nextRoutineId) {
    setRoutineId(nextRoutineId)
    const firstId = exercises.find((ex) => ex.routineId === nextRoutineId)?.id ?? null
    await handleExerciseChange(firstId)
  }

  function handleAddRoutine() {
    setModal('routine-add')
  }

  function handleAddExercise() {
    if (routineId) setModal('exercise-add')
  }

  function handleManageRoutine() {
    if (routineId) setModal('routine-manage')
  }

  function handleManageExercise() {
    if (selectedExercise) setModal('exercise-manage')
  }

  async function submitAddRoutine(name) {
    const id = await db.routines.add({ name })
    setRoutines(await db.routines.toArray())
    await handleRoutineChange(id)
  }

  async function submitAddExercise(name, targetMuscle = 'Genel') {
    const id = await db.exercises.add({
      name,
      targetMuscle,
      equipmentType: 'other',
      incrementStep: 2.5,
      routineId,
    })
    const list = await db.exercises.toArray()
    setExercises(list)
    await handleExerciseChange(id, list)
  }

  async function submitRenameRoutine(name) {
    await db.routines.update(routineId, { name })
    setRoutines(await db.routines.toArray())
  }

  async function submitRenameExercise(name) {
    await db.exercises.update(exerciseId, { name })
    setExercises(await db.exercises.toArray())
  }

  async function deleteRoutine() {
    // Güne bağlı hareketler de silinir (set kayıtları geçmişte korunur)
    await db.exercises.where('routineId').equals(routineId).delete()
    await db.routines.delete(routineId)
    const routineList = await db.routines.toArray()
    const list = await db.exercises.toArray()
    setRoutines(routineList)
    setExercises(list)
    const nextRoutineId = routineList[0]?.id ?? null
    setRoutineId(nextRoutineId)
    const nextExerciseId = list.find((ex) => ex.routineId === nextRoutineId)?.id ?? null
    await handleExerciseChange(nextExerciseId, list)
  }

  async function deleteExercise() {
    await db.exercises.delete(exerciseId)
    const list = await db.exercises.toArray()
    setExercises(list)
    const nextId = list.find((ex) => ex.routineId === routineId)?.id ?? null
    await handleExerciseChange(nextId, list)
  }


  async function handleSaveSet() {
    if (!exerciseId || saving) return

    const load = Number(weight)
    const repCount = Number(reps)
    const rirCount = Number(rir)
    if (!Number.isFinite(load) || load < 0) {
      setStorageError('Ağırlık sıfır veya daha büyük bir sayı olmalıdır.')
      return
    }
    if (!Number.isInteger(repCount) || repCount < 1 || repCount > 100) {
      setStorageError('Tekrar 1–100 arasında tam sayı olmalıdır.')
      return
    }
    if (!Number.isInteger(rirCount) || rirCount < 0 || rirCount > 10) {
      setStorageError('RIR 0–10 arasında tam sayı olmalıdır.')
      return
    }

    setSaving(true)
    setStorageError('')
    try {
      if (editingSetId != null) {
        await db.sets.update(editingSetId, {
          weight: load,
          reps: repCount,
          rir: rirCount,
          estimated1RM: estimate1RMOrNull(load, repCount),
        })
        setEditingSetId(null)
        await loadExerciseData(exerciseId, exercises)
        return
      }

      const date = todayDateString()
      await db.transaction('rw', db.workouts, db.sets, async () => {
        let workout = await db.workouts.where('date').equals(date).first()
        if (!workout) {
          const id = await db.workouts.add({ date, name: 'Antrenman', isCompleted: false })
          workout = { id }
        }

        const existing = await db.sets.where('exerciseId').equals(exerciseId)
          .and((set) => set.workoutId === workout.id).toArray()
        const nextSetNumber = existing.reduce(
          (max, set) => Math.max(max, set.setNumber ?? 0), 0,
        ) + 1

        await db.sets.add({
          workoutId: workout.id,
          exerciseId,
          setNumber: nextSetNumber,
          weight: load,
          reps: repCount,
          rir: rirCount,
          estimated1RM: estimate1RMOrNull(load, repCount),
          timestamp: Date.now(),
        })
      })

      await loadExerciseData(exerciseId, exercises)
    } catch (error) {
      setStorageError(`Set kaydedilemedi: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteSet(id) {
    try {
      await db.sets.delete(id)
      if (editingSetId === id) setEditingSetId(null)
      await loadExerciseData(exerciseId, exercises)
    } catch (error) {
      setStorageError(`Set silinemedi: ${error.message}`)
    }
  }

  function handleEditSet(set) {
    setEditingSetId(set.id)
    setWeight(set.weight)
    setReps(set.reps)
    setRir(typeof set.rir === 'number' ? set.rir : 2)
  }

  function bumpWeight(delta) {
    setWeight((prev) => Math.max(0, Math.round(((Number(prev) || 0) + delta) * 10) / 10))
  }

  function bumpReps(delta) {
    setReps((prev) => Math.min(100, Math.max(1, Number(prev || 1) + delta)))
  }

  function bumpRir(delta) {
    setRir((prev) => Math.min(10, Math.max(0, Number(prev || 0) + delta)))
  }

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-28 pt-6">
        {storageError && (
          <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {storageError}
          </div>
        )}
        <header className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
            <Dumbbell className="h-6 w-6" strokeWidth={2.2} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              Overload
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {activeTab === 'workout' ? 'Antrenman' : 'Geçmiş'}
            </h1>
          </div>
        </header>

        {activeTab === 'history' ? (
          <HistoryView exercises={exercises} />
        ) : (
        <>

        <label className="mb-2 block text-sm font-medium text-slate-400" htmlFor="routine">
          Antrenman Günü
        </label>
        <div className="mb-4 flex items-center gap-2">
          <select
            id="routine"
            value={routineId ?? ''}
            onChange={(e) => handleRoutineChange(Number(e.target.value))}
            className="h-14 min-w-0 flex-1 appearance-none rounded-2xl border border-slate-800 bg-slate-900 px-4 text-base font-semibold text-white outline-none ring-emerald-500 focus:ring-2"
          >
            {routines.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Günü yönet"
            onClick={handleManageRoutine}
            disabled={!routineId}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-slate-300 active:bg-slate-700 disabled:opacity-40"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-2 block text-sm font-medium text-slate-400" htmlFor="exercise">
          Egzersiz
        </label>
        <div className="mb-2 flex items-center gap-2">
          <select
            id="exercise"
            value={exerciseId ?? ''}
            onChange={(e) => handleExerciseChange(Number(e.target.value))}
            className="h-14 min-w-0 flex-1 appearance-none rounded-2xl border border-slate-800 bg-slate-900 px-4 text-base font-semibold text-white outline-none ring-emerald-500 focus:ring-2"
          >
            {visibleExercises.length === 0 && <option value="">Bu günde hareket yok</option>}
            {visibleExercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name} · {ex.targetMuscle}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Hareketi yönet"
            onClick={handleManageExercise}
            disabled={!exerciseId}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-slate-300 active:bg-slate-700 disabled:opacity-40"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 flex gap-2">
          <button
            type="button"
            onClick={handleAddRoutine}
            className="h-10 flex-1 rounded-xl bg-slate-800 text-sm font-semibold text-slate-200 active:bg-slate-700"
          >
            + Gün Ekle
          </button>
          <button
            type="button"
            onClick={handleAddExercise}
            disabled={!routineId}
            className="h-10 flex-1 rounded-xl bg-slate-800 text-sm font-semibold text-slate-200 active:bg-slate-700 disabled:opacity-40"
          >
            + Hareket Ekle
          </button>
        </div>

        <section className="mb-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Geçmiş Seans
          </p>
          {previousSets.length === 0 ? (
            <p className="text-sm leading-relaxed text-slate-500">
              Bu egzersiz için kayıtlı eski seans yok.
            </p>
          ) : (
            <ul className="space-y-2">
              {previousSets.map((set) => (
                <li
                  key={set.id}
                  className="text-sm font-medium leading-relaxed text-slate-200"
                >
                  Set {set.setNumber}: {set.weight}kg × {set.reps}
                  {typeof set.rir === 'number' ? ` (RIR ${set.rir})` : ''}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Hedef Önerisi
          </p>
          <p className="text-base leading-relaxed text-slate-100">
            {recommendation}
          </p>
        </section>

        <div className="mb-5">
          <p className="mb-2 text-sm font-medium text-slate-400">Ağırlık (kg)</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => bumpWeight(-2.5)}
              className="flex h-16 min-w-[5.5rem] flex-1 items-center justify-center rounded-2xl bg-slate-800 text-lg font-bold text-white active:bg-slate-700"
            >
              −2.5
            </button>
            <input
              type="number"
              inputMode="decimal"
              value={weight}
              onFocus={(e) => e.target.select()}
              min={0}
              step="any"
              onChange={(e) => setWeight(e.target.value === '' ? '' : Number(e.target.value))}
              className="h-16 w-24 rounded-2xl border border-slate-800 bg-slate-900 text-center text-2xl font-bold text-white outline-none ring-emerald-500 focus:ring-2"
            />
            <button
              type="button"
              onClick={() => bumpWeight(2.5)}
              className="flex h-16 min-w-[5.5rem] flex-1 items-center justify-center rounded-2xl bg-slate-800 text-lg font-bold text-white active:bg-slate-700"
            >
              +2.5
            </button>
          </div>
        </div>

        <div className="mb-5">
          <p className="mb-2 text-sm font-medium text-slate-400">Tekrar</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => bumpReps(-1)}
              className="flex h-16 min-w-[5.5rem] flex-1 items-center justify-center rounded-2xl bg-slate-800 text-lg font-bold text-white active:bg-slate-700"
            >
              −1
            </button>
            <input
              type="number"
              inputMode="numeric"
              value={reps}
              onFocus={(e) => e.target.select()}
              min={1}
              max={100}
              step={1}
              onChange={(e) => setReps(e.target.value === '' ? '' : Number(e.target.value))}
              className="h-16 w-24 rounded-2xl border border-slate-800 bg-slate-900 text-center text-2xl font-bold text-white outline-none ring-emerald-500 focus:ring-2"
            />
            <button
              type="button"
              onClick={() => bumpReps(1)}
              className="flex h-16 min-w-[5.5rem] flex-1 items-center justify-center rounded-2xl bg-slate-800 text-lg font-bold text-white active:bg-slate-700"
            >
              +1
            </button>
          </div>
        </div>

        <div className="mb-6">
          <p className="mb-2 text-sm font-medium text-slate-400">RIR (yedekte kalan tekrar)</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => bumpRir(-1)}
              className="flex h-16 min-w-[5.5rem] flex-1 items-center justify-center rounded-2xl bg-slate-800 text-lg font-bold text-white active:bg-slate-700"
            >
              −1
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              value={rir}
              onFocus={(e) => e.target.select()}
              step={1}
              onChange={(e) => setRir(e.target.value === '' ? '' : Number(e.target.value))}
              className="h-16 w-24 rounded-2xl border border-slate-800 bg-slate-900 text-center text-2xl font-bold text-white outline-none ring-emerald-500 focus:ring-2"
            />
            <button
              type="button"
              onClick={() => bumpRir(1)}
              className="flex h-16 min-w-[5.5rem] flex-1 items-center justify-center rounded-2xl bg-slate-800 text-lg font-bold text-white active:bg-slate-700"
            >
              +1
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveSet}
          disabled={!exerciseId || saving}
          className="mb-3 h-16 w-full rounded-2xl bg-emerald-500 text-lg font-bold text-slate-950 shadow-lg shadow-emerald-500/20 active:bg-emerald-400 disabled:opacity-50"
        >
          {saving
            ? 'Kaydediliyor…'
            : editingSetId != null
              ? 'Seti Güncelle'
              : 'Seti Kaydet'}
        </button>
        {editingSetId != null ? (
          <button
            type="button"
            onClick={() => setEditingSetId(null)}
            className="mb-8 h-12 w-full rounded-2xl bg-slate-800 text-sm font-semibold text-slate-200 active:bg-slate-700"
          >
            Vazgeç
          </button>
        ) : (
          <div className="mb-5" />
        )}

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
            Bugünkü Setler
            {selectedExercise ? ` · ${selectedExercise.name}` : ''}
          </h2>
          {todaySets.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-800 px-4 py-6 text-center text-sm text-slate-500">
              Bu egzersiz için henüz set yok.
            </p>
          ) : (
            <ul className="space-y-2">
              {todaySets.map((set) => (
                <li
                  key={set.id}
                  className={`flex items-center justify-between gap-2 rounded-2xl border bg-slate-900 px-4 py-3 ${
                    editingSetId === set.id ? 'border-emerald-500' : 'border-slate-800'
                  }`}
                >
                  <span className="text-sm font-semibold text-slate-400">
                    Set {set.setNumber}
                  </span>
                  <span className="font-bold text-white">
                    {set.weight} kg × {set.reps}
                  </span>
                  <span className="text-sm text-emerald-400">RIR {set.rir}</span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      aria-label="Seti düzenle"
                      onClick={() => handleEditSet(set)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-300 active:bg-slate-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Seti sil"
                      onClick={() => handleDeleteSet(set.id)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-red-400 active:bg-slate-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        </>
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-2 px-4 py-2">
          {[
            { key: 'workout', label: 'Antrenman', Icon: Dumbbell },
            { key: 'history', label: 'Geçmiş', Icon: History },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              aria-current={activeTab === key ? 'page' : undefined}
              className={`flex h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold transition-colors ${
                activeTab === key
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'text-slate-500 active:bg-slate-900'
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {modal === 'routine-add' && (
        <ManageModal
          title="Yeni Antrenman Günü"
          inputLabel="Gün adı"
          startMode="input"
          submitLabel="Ekle"
          onSubmit={submitAddRoutine}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'exercise-add' && (
        <ExercisePoolModal
          routineName={routines.find((r) => r.id === routineId)?.name}
          existingNames={visibleExercises.map((ex) => ex.name)}
          onAdd={submitAddExercise}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'routine-manage' && (
        <ManageModal
          title="Antrenman Gününü Yönet"
          subtitle={routines.find((r) => r.id === routineId)?.name}
          inputLabel="Gün adı"
          initialValue={routines.find((r) => r.id === routineId)?.name ?? ''}
          canDelete
          deleteWarning="Bu gün ve güne bağlı tüm hareketler silinecek. Geçmiş set kayıtları korunur."
          onSubmit={submitRenameRoutine}
          onDelete={deleteRoutine}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'exercise-manage' && selectedExercise && (
        <ManageModal
          title="Hareketi Yönet"
          subtitle={selectedExercise.name}
          inputLabel="Hareket adı"
          initialValue={selectedExercise.name}
          canDelete
          deleteWarning="Bu hareket silinecek. Geçmiş set kayıtları korunur."
          onSubmit={submitRenameExercise}
          onDelete={deleteExercise}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
