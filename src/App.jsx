import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpDown, Dumbbell, History } from 'lucide-react'
import { db, seedDatabase, isActive, addExercise, addRoutine, archiveExercise, archiveRoutine, renameRoutine, reorderExercises, restoreSet, updateExercise } from './db'
import { beep, vibrate } from './utils/notify'
import { getLastBackupAt, getRestAuto, getRestSeconds, needsBackupReminder } from './utils/settings'
import useRestTimer from './hooks/useRestTimer'
import RestTimerBar from './components/RestTimerBar'
import HistoryView from './components/HistoryView'
import Toast from './components/Toast'
import ExercisePoolModal from './components/ExercisePoolModal'
import ManageModal from './components/ManageModal'
import ExerciseSettingsModal from './components/ExerciseSettingsModal'
import WorkoutView from './components/WorkoutView'
import ReorderExercises from './components/ReorderExercises'
import AppHeader from './components/AppHeader'
import SettingsSheet from './components/SettingsSheet'
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
  // null | 'routine-add' | 'routine-manage' | 'routine-reorder' | 'exercise-add' | 'exercise-manage'
  const [modal, setModal] = useState(null)
  // Tek toast: { id, message, actionLabel?, onAction? }; yenisi eskisini değiştirir.
  const [toast, setToast] = useState(null)
  const toastIdRef = useRef(0)
  const dismissToast = useCallback(() => setToast(null), [])
  // Geri alma sonrası görünür listelerin yeniden okunması için artar.
  const [refreshToken, setRefreshToken] = useState(0)
  // Yedekten dönünce artar; WorkoutView/HistoryView yeniden kurulur (eski id'lere bağlı açık düzenlemeler düşer).
  const [restoreGeneration, setRestoreGeneration] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [backupReminder, setBackupReminder] = useState(false)

  const rest = useRestTimer()
  const restVisible = rest.endAt != null

  const selectedRoutine = routines.find((r) => isActive(r) && r.id === routineId)
  const selectedExercise = routineExercises(exercises, routineId).find((ex) => ex.id === exerciseId)
  const closeModal = useCallback(() => setModal(null), [])

  const refreshCatalog = useCallback(async () => {
    const [routineList, list] = await Promise.all([db.routines.toArray(), db.exercises.toArray()])
    setRoutines(routineList)
    setExercises(list)
    return { routineList, list }
  }, [])

  const refreshBackupReminder = useCallback(async () => {
    try {
      const hasSets = (await db.sets.count()) > 0
      setBackupReminder(needsBackupReminder({ lastBackupAt: getLastBackupAt(), hasSets, now: Date.now() }))
    } catch {
      setBackupReminder(false)
    }
  }, [])

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
    refreshBackupReminder()
  }, [refreshBackupReminder])

  // Yedekten dönünce katalog, seçim ve görünür listeler yeniden yüklenir.
  async function handleRestored() {
    // Eski verideki seti geri getirebilecek "Geri al" ve eski sete ait sayaç kapanır.
    setToast(null)
    rest.stop()
    const { routineList, list } = await refreshCatalog()
    const firstRoutineId = routineList.find(isActive)?.id ?? null
    setRoutineId(firstRoutineId)
    setExerciseId(firstExerciseId(list, firstRoutineId))
    setRefreshToken((token) => token + 1)
    setRestoreGeneration((generation) => generation + 1)
    await refreshBackupReminder()
  }

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
        refreshBackupReminder()
      })
      .catch((error) => {
        if (!cancelled) setStorageError(`Uygulama verisi yüklenemedi: ${error.message}`)
      })
    return () => { cancelled = true }
  }, [refreshBackupReminder])

  function selectExercise(nextId) {
    setExerciseId(nextId)
    setStorageError('')
  }

  function selectRoutine(nextRoutineId, list = exercises) {
    setRoutineId(nextRoutineId)
    selectExercise(firstExerciseId(list, nextRoutineId))
  }

  function openModal(name) {
    const requires = { 'exercise-add': routineId, 'routine-manage': routineId, 'routine-reorder': routineId, 'exercise-manage': selectedExercise }
    if (name in requires && !requires[name]) return
    setModal(name)
  }

  function showToast(next) {
    toastIdRef.current += 1
    setToast({ id: toastIdRef.current, ...next })
  }

  function handleSetSaved({ isPR, estimated1RM }) {
    if (getRestAuto() && selectedExercise) {
      rest.start(selectedExercise.restSeconds ?? getRestSeconds(), selectedExercise.name)
    }
    if (!isPR) return
    // Bekleyen "Geri al" toast'ı varsa ezilmez (silinen seti geri alma fırsatı kaybolmasın);
    // o durumda yalnızca ses/titreşim ile rekor bildirilir.
    if (!toast?.onAction) showToast({ message: `🏆 Yeni rekor! Tahmini 1RM ${estimated1RM} kg` })
    vibrate([100, 50, 100])
    beep([0, 0.15], 1320)
  }

  async function undoDelete(set) {
    setToast(null)
    try {
      await restoreSet(set)
      setRefreshToken((token) => token + 1)
    } catch (error) {
      setStorageError(`Geri alınamadı: ${error.message}`)
    }
  }

  function handleSetDeleted(set) {
    showToast({ message: 'Set silindi', actionLabel: 'Geri al', onAction: () => undoDelete(set) })
  }

  // CRUD: hatalar fırlatılır; modal yakalayıp gösterir ve açık kalır.
  async function submitAddRoutine(name) {
    const id = await addRoutine(name)
    const { list } = await refreshCatalog()
    selectRoutine(id, list)
  }

  // ExercisePoolModal { name, targetMuscle, equipmentType, incrementStep } nesnesi gönderir.
  async function submitAddExercise(exercise) {
    const id = await addExercise({ ...exercise, routineId })
    await refreshCatalog()
    selectExercise(id)
  }

  async function submitRenameRoutine(name) {
    await renameRoutine(routineId, name)
    await refreshCatalog()
  }

  // Hareket ayarları ve not: hatalar çağırana fırlatılır; katalog yenilenir (öneri yeni aralığı kullanır).
  async function updateSelectedExercise(patch) {
    await updateExercise(exerciseId, patch)
    await refreshCatalog()
  }

  async function saveExerciseOrder(orderedIds) {
    await reorderExercises(routineId, orderedIds)
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
      <div className={`mx-auto flex min-h-dvh max-w-md flex-col px-4 ${restVisible ? 'pb-48' : 'pb-28'} pt-6`}>
        {storageError && (
          <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{storageError}</div>
        )}
        <AppHeader
          title={activeTab === 'workout' ? 'Antrenman' : 'Geçmiş'}
          backupReminder={backupReminder}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {activeTab === 'history' && (
          <HistoryView key={restoreGeneration} exercises={exercises} refreshToken={refreshToken} onSetDeleted={handleSetDeleted} />
        )}
        {/* Gizlenir ama bağlı kalır: sekme dönüşünde yazılan form değerleri korunur. */}
        <div hidden={activeTab !== 'workout'}>
          <WorkoutView
            key={restoreGeneration}
            active={activeTab === 'workout'}
            routines={routines}
            exercises={exercises}
            routineId={routineId}
            exerciseId={exerciseId}
            onSelectRoutine={selectRoutine}
            onSelectExercise={selectExercise}
            onOpenModal={openModal}
            onError={setStorageError}
            onSetSaved={handleSetSaved}
            onSetDeleted={handleSetDeleted}
            onUpdateExercise={updateSelectedExercise}
            refreshToken={refreshToken}
          />
        </div>
      </div>
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          actionLabel={toast.actionLabel}
          onAction={toast.onAction}
          onDismiss={dismissToast}
          raised={restVisible}
        />
      )}
      {restVisible && (
        <RestTimerBar remaining={rest.remaining} totalSeconds={rest.totalSeconds} onAdd={rest.addSeconds} onSkip={rest.stop} />
      )}
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

      {settingsOpen && <SettingsSheet onClose={closeSettings} onRestored={handleRestored} />}
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
          extraActions={[{ label: 'Hareketleri sırala', icon: ArrowUpDown, onClick: () => setModal('routine-reorder') }]}
          deleteWarning="Bu gün ve güne bağlı tüm hareketler silinecek. Geçmiş set kayıtları korunur."
          onSubmit={submitRenameRoutine}
          onDelete={deleteRoutine}
          onClose={closeModal}
        />
      )}
      {modal === 'routine-reorder' && (
        <ReorderExercises
          routineName={selectedRoutine?.name}
          exercises={routineExercises(exercises, routineId)}
          onSave={saveExerciseOrder}
          onClose={closeModal}
        />
      )}
      {modal === 'exercise-manage' && selectedExercise && (
        <ExerciseSettingsModal
          key={selectedExercise.id}
          exercise={selectedExercise}
          onSave={updateSelectedExercise}
          onDelete={deleteExercise}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
