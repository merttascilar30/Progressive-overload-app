import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dumbbell, History, Pencil, Settings, Trash2 } from 'lucide-react'
import {
  db,
  seedDatabase,
  isActive,
  addSet,
  updateSet,
  deleteSetAndRenumber,
  addExercise,
  archiveExercise,
  archiveRoutine,
} from './db'
import HistoryView from './components/HistoryView'
import ExercisePoolModal from './components/ExercisePoolModal'
import ManageModal from './components/ManageModal'
import { LIMITS, getSetRecommendation, parseSetInput } from './utils/progressionEngine'

const DEFAULT_STEP = 2.5
const DEFAULT_RIR = 2

function startOfDay(timestamp = Date.now()) {
  const d = new Date(timestamp)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const bySetOrder = (a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0) || a.timestamp - b.timestamp

// Ondalık artıkları (ör. 21.250000001) temizler; 1.25 kg gibi mikro adımları korur.
const roundKg = (value) => Math.round(value * 100) / 100

/** Bugünden önceki en son antrenman gününün setleri (tek geçiş). */
function getPreviousSessionSets(history, today = startOfDay()) {
  let lastDay = null
  for (const set of history) {
    const day = startOfDay(set.timestamp)
    if (day < today && (lastDay == null || day > lastDay)) lastDay = day
  }
  if (lastDay == null) return []
  return history.filter((set) => startOfDay(set.timestamp) === lastDay).sort(bySetOrder)
}

function Stepper({ id, label, value, onChange, onStep, stepLabel, inputMode, min, max, step }) {
  const btn =
    'flex h-16 min-w-[5.5rem] flex-1 items-center justify-center rounded-2xl bg-slate-800 text-lg font-bold text-white active:bg-slate-700'
  return (
    <div className="mb-5">
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-400">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <button type="button" aria-label={`${label} azalt`} onClick={() => onStep(-1)} className={btn}>
          −{stepLabel}
        </button>
        <input
          id={id}
          type="number"
          inputMode={inputMode}
          value={value}
          min={min}
          max={max}
          step={step}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className="h-16 w-24 rounded-2xl border border-slate-800 bg-slate-900 text-center text-2xl font-bold text-white outline-none ring-emerald-500 focus:ring-2"
        />
        <button type="button" aria-label={`${label} artır`} onClick={() => onStep(1)} className={btn}>
          +{stepLabel}
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState('workout')
  const [routines, setRoutines] = useState([])
  const [routineId, setRoutineId] = useState(null)
  const [exercises, setExercises] = useState([])
  const [exerciseId, setExerciseId] = useState(null)
  const [recommendation, setRecommendation] = useState(() => getSetRecommendation(null))
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState(8)
  const [rir, setRir] = useState(DEFAULT_RIR)
  const [todaySets, setTodaySets] = useState([])
  const [previousSets, setPreviousSets] = useState([])
  const [saving, setSaving] = useState(false)
  const [storageError, setStorageError] = useState('')
  const [editingSetId, setEditingSetId] = useState(null)
  // null | 'routine-add' | 'routine-manage' | 'exercise-add' | 'exercise-manage'
  const [modal, setModal] = useState(null)
  const loadRequestId = useRef(0)
  const savingRef = useRef(false) // Aynı frame'deki çift dokunuşa karşı senkron kilit

  // Arşivlenmiş gün/hareketler seçicilerde görünmez; geçmiş ekranı hepsini (isim için) alır.
  const activeRoutines = useMemo(() => routines.filter(isActive), [routines])
  const visibleExercises = useMemo(
    () => exercises.filter((ex) => isActive(ex) && ex.routineId === routineId),
    [exercises, routineId],
  )
  const selectedExercise = visibleExercises.find((ex) => ex.id === exerciseId)
  const selectedRoutine = activeRoutines.find((r) => r.id === routineId)
  const weightStep = selectedExercise?.incrementStep ?? DEFAULT_STEP
  const closeModal = useCallback(() => setModal(null), [])

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
      const today = startOfDay()
      const previous = getPreviousSessionSets(history, today)

      setTodaySets(history.filter((set) => set.timestamp >= today).sort(bySetOrder))
      setPreviousSets(previous)

      const step = list?.find((ex) => ex.id === id)?.incrementStep ?? DEFAULT_STEP
      setRecommendation(getSetRecommendation(previous, step))

      if (prefill) {
        const lastSet = previous[previous.length - 1]
        if (lastSet) {
          setWeight(lastSet.weight)
          setReps(lastSet.reps)
          setRir(Number.isInteger(lastSet.rir) ? lastSet.rir : DEFAULT_RIR)
        } else {
          // İlk kez yapılan harekette önceki egzersizin ağırlığı taşınmasın.
          setWeight('')
          setReps(8)
          setRir(DEFAULT_RIR)
        }
      }
    } catch (error) {
      if (requestId === loadRequestId.current) {
        setStorageError(`Antrenman verisi yüklenemedi: ${error.message}`)
      }
    }
  }, [])

  const refreshCatalog = useCallback(async () => {
    const [routineList, list] = await Promise.all([db.routines.toArray(), db.exercises.toArray()])
    setRoutines(routineList)
    setExercises(list)
    return { routineList, list }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        await seedDatabase()
        const [routineList, list] = await Promise.all([db.routines.toArray(), db.exercises.toArray()])
        if (cancelled) return

        setRoutines(routineList)
        setExercises(list)
        const firstRoutineId = routineList.find(isActive)?.id ?? null
        setRoutineId(firstRoutineId)
        const firstId =
          list.find((ex) => isActive(ex) && ex.routineId === firstRoutineId)?.id ?? null
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
    setStorageError('')
    await loadExerciseData(nextId, list, { prefill: true })
  }

  async function selectRoutine(nextRoutineId, list = exercises) {
    setRoutineId(nextRoutineId)
    const firstId =
      list.find((ex) => isActive(ex) && ex.routineId === nextRoutineId)?.id ?? null
    await handleExerciseChange(firstId, list)
  }

  function handleTabChange(key) {
    setActiveTab(key)
    setEditingSetId(null)
    // Geçmiş ekranındaki düzenleme/silmeler burada bayat kalmasın.
    if (key === 'workout') loadExerciseData(exerciseId, exercises)
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

  // CRUD: hatalar fırlatılır; modal yakalayıp gösterir ve açık kalır.
  async function submitAddRoutine(name) {
    const id = await db.routines.add({ name })
    const { list } = await refreshCatalog()
    await selectRoutine(id, list)
  }

  // ExercisePoolModal { name, targetMuscle, equipmentType, incrementStep } nesnesi gönderir.
  async function submitAddExercise(exercise) {
    const id = await addExercise({ ...exercise, routineId })
    const { list } = await refreshCatalog()
    await handleExerciseChange(id, list)
  }

  async function submitRenameRoutine(name) {
    await db.routines.update(routineId, { name })
    await refreshCatalog()
  }

  async function submitRenameExercise(name) {
    await db.exercises.update(exerciseId, { name })
    await refreshCatalog()
  }

  async function deleteRoutine() {
    // Gün ve hareketleri arşivlenir (set kayıtları geçmişte isimleriyle korunur)
    await archiveRoutine(routineId)
    const { routineList, list } = await refreshCatalog()
    await selectRoutine(routineList.find(isActive)?.id ?? null, list)
  }

  async function deleteExercise() {
    await archiveExercise(exerciseId)
    const { list } = await refreshCatalog()
    const nextId = list.find((ex) => isActive(ex) && ex.routineId === routineId)?.id ?? null
    await handleExerciseChange(nextId, list)
  }

  async function handleSaveSet() {
    if (!exerciseId || savingRef.current) return

    const { value, error } = parseSetInput({ weight, reps, rir })
    if (error) {
      setStorageError(error)
      return
    }

    savingRef.current = true
    setSaving(true)
    setStorageError('')
    try {
      if (editingSetId != null) {
        await updateSet(editingSetId, value)
        setEditingSetId(null)
      } else {
        await addSet(exerciseId, value)
      }
      await loadExerciseData(exerciseId, exercises)
    } catch (error) {
      setStorageError(`Set kaydedilemedi: ${error.message}`)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function handleDeleteSet(id) {
    try {
      await deleteSetAndRenumber(id)
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
    setRir(Number.isInteger(set.rir) ? set.rir : DEFAULT_RIR)
  }

  // Ağırlık butonu egzersizin kendi artış adımını kullanır (dumbbell 2, lateral raise 1 ...).
  function bumpWeight(direction) {
    setWeight((prev) => Math.max(0, roundKg((Number(prev) || 0) + direction * weightStep)))
  }

  const bumpInt = (setter, min, max) => (direction) =>
    setter((prev) => Math.min(max, Math.max(min, Math.round(Number(prev) || 0) + direction)))


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
            onChange={(e) => selectRoutine(Number(e.target.value))}
            className="h-14 min-w-0 flex-1 appearance-none rounded-2xl border border-slate-800 bg-slate-900 px-4 text-base font-semibold text-white outline-none ring-emerald-500 focus:ring-2"
          >
            {activeRoutines.map((r) => (
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

        <Stepper
          id="weight"
          label="Ağırlık (kg)"
          value={weight}
          onChange={setWeight}
          onStep={bumpWeight}
          stepLabel={weightStep}
          inputMode="decimal"
          min={0}
          max={LIMITS.maxWeight}
          step="any"
        />
        <Stepper
          id="reps"
          label="Tekrar"
          value={reps}
          onChange={setReps}
          onStep={bumpInt(setReps, 1, LIMITS.maxReps)}
          stepLabel={1}
          inputMode="numeric"
          min={1}
          max={LIMITS.maxReps}
          step={1}
        />
        <Stepper
          id="rir"
          label="RIR (yedekte kalan tekrar)"
          value={rir}
          onChange={setRir}
          onStep={bumpInt(setRir, 0, LIMITS.maxRir)}
          stepLabel={1}
          inputMode="numeric"
          min={0}
          max={LIMITS.maxRir}
          step={1}
        />

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
                  {Number.isInteger(set.rir) && (<span className="text-sm text-emerald-400">RIR {set.rir}</span>)}
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
              onClick={() => handleTabChange(key)}
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
          onClose={closeModal}
        />
      )}
      {modal === 'exercise-add' && (
        <ExercisePoolModal
          routineName={selectedRoutine?.name}
          existingNames={visibleExercises.map((ex) => ex.name)}
          onAdd={submitAddExercise}
          onClose={closeModal}
        />
      )}
      {modal === 'routine-manage' && (
        <ManageModal
          title="Antrenman Gününü Yönet"
          subtitle={selectedRoutine?.name}
          inputLabel="Gün adı"
          initialValue={selectedRoutine?.name ?? ''}
          canDelete
          deleteWarning="Bu gün ve güne bağlı tüm hareketler silinecek. Geçmiş set kayıtları korunur."
          onSubmit={submitRenameRoutine}
          onDelete={deleteRoutine}
          onClose={closeModal}
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
          onClose={closeModal}
        />
      )}
    </div>
  )
}