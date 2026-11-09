import { useCallback, useEffect, useState } from 'react'
import { Dumbbell, History } from 'lucide-react'
import { db, seedDatabase, isActive, addExercise, archiveExercise, archiveRoutine } from './db'
import HistoryView from './components/HistoryView'
import ExercisePoolModal from './components/ExercisePoolModal'
import ManageModal from './components/ManageModal'
import WorkoutView from './components/WorkoutView'
import { routineExercises } from './utils/sessionSets'

const TABS = [
  { key: 'workout', label: 'Antrenman', Icon: Dumbbell },
  { key: 'history', label: 'Geçmiş', Icon: History },
]

const firstExerciseId = (list, routineId) => routineExercises(list, routineId)[0]?.id ?? null

export default function App() {
  const [activeTab, setActiveTab] = useState('workout')
  const [routines, setRoutines] = useState([])
  const [routineId, setRoutineId] = useState(null)
  const [exercises, setExercises] = useState([])
  const [exerciseId, setExerciseId] = useState(null)
  const [storageError, setStorageError] = useState('')
  // null | 'routine-add' | 'routine-manage' | 'exercise-add' | 'exercise-manage'
  const [modal, setModal] = useState(null)

  const selectedRoutine = routines.find((r) => isActive(r) && r.id === routineId)
  const selectedExercise = routineExercises(exercises, routineId).find((ex) => ex.id === exerciseId)
  const closeModal = useCallback(() => setModal(null), [])

  const refreshCatalog = useCallback(async () => {
    const [routineList, list] = await Promise.all([db.routines.toArray(), db.exercises.toArray()])
    setRoutines(routineList)
    setExercises(list)
    return { routineList, list }
  }, [])

  useEffect(() => {
    let cancelled = false
    seedDatabase()
      .then(() => Promise.all([db.routines.toArray(), db.exercises.toArray()]))
      .then(([routineList, list]) => {
        if (cancelled) return
        setRoutines(routineList)
        setExercises(list)
        const firstRoutineId = routineList.find(isActive)?.id ?? null
        setRoutineId(firstRoutineId)
        setExerciseId(firstExerciseId(list, firstRoutineId))
      })
      .catch((error) => {
        if (!cancelled) setStorageError(`Uygulama verisi yüklenemedi: ${error.message}`)
      })
    return () => { cancelled = true }
  }, [])

  function selectExercise(nextId) {
    setExerciseId(nextId)
    setStorageError('')
  }

  function selectRoutine(nextRoutineId, list = exercises) {
    setRoutineId(nextRoutineId)
    selectExercise(firstExerciseId(list, nextRoutineId))
  }

  function openModal(name) {
    const requires = { 'exercise-add': routineId, 'routine-manage': routineId, 'exercise-manage': selectedExercise }
    if (name in requires && !requires[name]) return
    setModal(name)
  }

  // CRUD: hatalar fırlatılır; modal yakalayıp gösterir ve açık kalır.
  async function submitAddRoutine(name) {
    const id = await db.routines.add({ name })
    const { list } = await refreshCatalog()
    selectRoutine(id, list)
  }

  // ExercisePoolModal { name, targetMuscle, equipmentType, incrementStep } nesnesi gönderir.
  async function submitAddExercise(exercise) {
    const id = await addExercise({ ...exercise, routineId })
    await refreshCatalog()
    selectExercise(id)
  }

  async function submitRename(table, id, name) {
    await db[table].update(id, { name })
    await refreshCatalog()
  }

  async function deleteRoutine() {
    // Gün ve hareketleri arşivlenir (set kayıtları geçmişte isimleriyle korunur)
    await archiveRoutine(routineId)
    const { routineList, list } = await refreshCatalog()
    selectRoutine(routineList.find(isActive)?.id ?? null, list)
  }

  async function deleteExercise() {
    await archiveExercise(exerciseId)
    const { list } = await refreshCatalog()
    selectExercise(firstExerciseId(list, routineId))
  }

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-28 pt-6">
        {storageError && (
          <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{storageError}</div>
        )}
        <header className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
            <Dumbbell className="h-6 w-6" strokeWidth={2.2} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Overload</p>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {activeTab === 'workout' ? 'Antrenman' : 'Geçmiş'}
            </h1>
          </div>
        </header>

        {activeTab === 'history' ? (
          <HistoryView exercises={exercises} />
        ) : (
          // Sekmeye dönüşte yeniden bağlanır; geçmişteki düzenleme/silmeler bayat kalmaz.
          <WorkoutView
            routines={routines}
            exercises={exercises}
            routineId={routineId}
            exerciseId={exerciseId}
            onSelectRoutine={selectRoutine}
            onSelectExercise={selectExercise}
            onOpenModal={openModal}
            onError={setStorageError}
            onSetSaved={() => {}}
            onSetDeleted={() => {}}
          />
        )}
      </div>
      {/* İleride: toast ve dinlenme sayacı yuvası */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-2 px-4 py-2">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              aria-current={activeTab === key ? 'page' : undefined}
              className={`flex h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold transition-colors ${
                activeTab === key ? 'bg-emerald-500/15 text-emerald-400' : 'text-slate-500 active:bg-slate-900'
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {modal === 'routine-add' && (
        <ManageModal title="Yeni Antrenman Günü" inputLabel="Gün adı" startMode="input" submitLabel="Ekle" onSubmit={submitAddRoutine} onClose={closeModal} />
      )}
      {modal === 'exercise-add' && (
        <ExercisePoolModal
          routineName={selectedRoutine?.name}
          existingNames={routineExercises(exercises, routineId).map((ex) => ex.name)}
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
          onSubmit={(name) => submitRename('routines', routineId, name)}
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
          onSubmit={(name) => submitRename('exercises', exerciseId, name)}
          onDelete={deleteExercise}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
