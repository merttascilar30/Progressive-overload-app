import { useEffect, useMemo, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import { addSet, deleteSetAndRenumber, isActive, updateSet, withExerciseDefaults } from '../db'
import useExerciseData from '../hooks/useExerciseData'
import { DEFAULT_RIR, LIMITS, parseSetInput } from '../utils/progressionEngine'
import { unlockAudio } from '../utils/notify'
import { routineExercises } from '../utils/sessionSets'
import { platesPerSide } from '../utils/plates'
import { clearDraft, readDraft, writeDraft } from '../utils/drafts'
import useTodaySummary from '../hooks/useTodaySummary'
import DaySummaryCard from './DaySummaryCard'
import ExerciseNote from './ExerciseNote'
import Stepper from './Stepper'
import TodaySetList from './TodaySetList'

const DEFAULT_STEP = 2.5
const selectCls =
  'h-14 min-w-0 flex-1 appearance-none rounded-2xl border border-slate-800 bg-slate-900 px-4 text-base font-semibold text-white outline-none ring-emerald-500 focus:ring-2'
const gearCls =
  'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-slate-300 active:bg-slate-700 disabled:opacity-40'
const addCls =
  'h-10 flex-1 rounded-xl bg-slate-800 text-sm font-semibold text-slate-200 active:bg-slate-700 disabled:opacity-40'

// Ondalık artıkları (ör. 21.250000001) temizler; 1.25 kg gibi mikro adımları korur.
const roundKg = (value) => Math.round(value * 100) / 100

const bumpInt = (setter, min, max) => (direction) =>
  setter((prev) => Math.min(max, Math.max(min, Math.round(Number(prev) || 0) + direction)))

export default function WorkoutView({
  active = true,
  routines,
  exercises,
  routineId,
  exerciseId,
  onSelectRoutine,
  onSelectExercise,
  onOpenModal,
  onError,
  onSetSaved,
  onSetDeleted,
  onUpdateExercise,
  refreshToken = 0,
}) {
  const activeRoutines = useMemo(() => routines.filter(isActive), [routines])
  const visibleExercises = useMemo(() => routineExercises(exercises, routineId), [exercises, routineId])
  const selectedExercise = visibleExercises.find((ex) => ex.id === exerciseId) ?? null
  const weightStep = selectedExercise?.incrementStep ?? DEFAULT_STEP
  const { repMin, barWeight: bar } = withExerciseDefaults(selectedExercise)

  const { todaySets, previousSets, recommendation, stall, reload, loadedExerciseId } = useExerciseData(
    selectedExercise,
    onError,
  )
  // Set kaydı/silme sonrası ve dış yenilemelerde günün özeti yeniden okunur.
  const [summaryKey, setSummaryKey] = useState(0)
  const bumpSummary = () => setSummaryKey((key) => key + 1)
  const daySummary = useTodaySummary(`${summaryKey}|${refreshToken}|${active}`, onError)

  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState(repMin)
  const [rir, setRir] = useState(DEFAULT_RIR)
  const [isWarmup, setIsWarmup] = useState(false)
  // Düzenleme hareketine bağlı tutulur; başka harekete geçince düzenleme kendiliğinden düşer.
  const [editing, setEditing] = useState(null) // { exerciseId, setId }
  const editingSetId = editing?.exerciseId === exerciseId ? editing.setId : null
  const setEditingSetId = (setId) => setEditing(setId == null ? null : { exerciseId, setId })
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false) // Aynı frame'deki çift dokunuşa karşı senkron kilit
  const snapshotRef = useRef(null) // Düzenleme öncesi form değerleri (Vazgeç geri yükler)
  const prefilledFor = useRef(undefined)
  // Formun "kullanıcı dokunmadı" hâli; taslak yalnızca bundan farklıysa yazılır.
  const baselineRef = useRef(null)
  const [draftRestored, setDraftRestored] = useState(false)

  // Hareket değişince (ve açılışta) form, o hareketin verisi yüklenince bir kez dolar:
  // 6 saatten yeni taslak varsa ondan, yoksa öneriden. Set kaydı sonrası yeniden yükleme formu ezmez.
  useEffect(() => {
    if (loadedExerciseId !== (selectedExercise?.id ?? null)) return
    if (prefilledFor.current === loadedExerciseId) return
    prefilledFor.current = loadedExerciseId
    snapshotRef.current = null
    setEditing(null)
    const fromRecommendation = {
      weight: recommendation.weight ?? '',
      reps: recommendation.reps ?? repMin,
      rir: DEFAULT_RIR,
      isWarmup: false,
    }
    baselineRef.current = fromRecommendation
    const draft = loadedExerciseId == null ? null : readDraft(loadedExerciseId)
    const values = draft ?? fromRecommendation
    setDraftRestored(Boolean(draft))
    setWeight(values.weight)
    setReps(values.reps)
    setRir(values.rir)
    setIsWarmup(values.isWarmup)
  }, [loadedExerciseId, selectedExercise, recommendation, repMin])

  // Kaydedilmemiş değerler cihazda tutulur (sekme kapanırsa geri gelir). Düzenleme modunda yazılmaz.
  useEffect(() => {
    const id = selectedExercise?.id
    if (id == null || prefilledFor.current !== id || loadedExerciseId !== id || editing != null) return undefined
    const values = { weight, reps, rir, isWarmup }
    const base = baselineRef.current
    const untouched =
      base && ['weight', 'reps', 'rir', 'isWarmup'].every((field) => String(base[field]) === String(values[field]))
    const timer = setTimeout(() => (untouched ? clearDraft(id) : writeDraft(id, values)), 400)
    return () => clearTimeout(timer)
  }, [weight, reps, rir, isWarmup, selectedExercise, loadedExerciseId, editing])

  // Sekme değişimi: ayrılırken yarım düzenleme bırakılır (değerler geri gelir);
  // dönüşte Geçmiş'teki düzenleme/silmeler için veri yenilenir, form ezilmez.
  const wasActive = useRef(active)
  useEffect(() => {
    if (wasActive.current === active) return
    wasActive.current = active
    if (active) reload().catch((error) => onError(`Antrenman verisi yüklenemedi: ${error.message}`))
    else cancelEdit()
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps -- yalnızca geçişte çalışır

  // App geri alma gibi dış değişikliklerde token'ı artırır; liste yeniden okunur.
  const seenRefreshToken = useRef(refreshToken)
  useEffect(() => {
    if (seenRefreshToken.current === refreshToken) return
    seenRefreshToken.current = refreshToken
    reload().catch((error) => onError(`Antrenman verisi yüklenemedi: ${error.message}`))
  }, [refreshToken]) // eslint-disable-line react-hooks/exhaustive-deps -- yalnızca token değişince çalışır

  function cancelEdit() {
    const snap = snapshotRef.current
    if (snap) {
      setWeight(snap.weight)
      setReps(snap.reps)
      setRir(snap.rir)
      setIsWarmup(snap.isWarmup)
    }
    snapshotRef.current = null
    setEditingSetId(null)
  }

  function handleEditSet(set) {
    // Set'ten sete geçilirse ilk (düzenleme öncesi) görüntü korunur.
    if (editingSetId == null) snapshotRef.current = { weight, reps, rir, isWarmup }
    setEditingSetId(set.id)
    setWeight(set.weight)
    setReps(set.reps)
    setRir(Number.isInteger(set.rir) ? set.rir : DEFAULT_RIR)
    setIsWarmup(Boolean(set.isWarmup))
  }

  async function handleSaveSet() {
    if (!selectedExercise || savingRef.current) return

    const { value, error } = parseSetInput({ weight, reps, rir })
    if (error) {
      onError(error)
      return
    }

    unlockAudio() // Tarayıcı sesi yalnızca kullanıcı dokunuşu içinde açar
    savingRef.current = true
    setSaving(true)
    onError('')
    try {
      const payload = { ...value, isWarmup }
      if (editingSetId != null) {
        await updateSet(editingSetId, payload)
        // Düzenlenen setin ısınma durumu sonraki yeni sete taşınmasın; düzenleme öncesine döner.
        setIsWarmup(snapshotRef.current?.isWarmup ?? false)
        snapshotRef.current = null
        setEditingSetId(null)
      } else {
        const { isPR } = await addSet(selectedExercise.id, payload)
        setIsWarmup(false)
        // Kaydedilen değerler artık taslak değil; sonraki set için yeni başlangıç noktası.
        clearDraft(selectedExercise.id)
        baselineRef.current = { weight, reps, rir, isWarmup: false }
        setDraftRestored(false)
        onSetSaved({ isPR, estimated1RM: value.estimated1RM })
      }
      bumpSummary()
      await reload()
    } catch (error) {
      onError(`Set kaydedilemedi: ${error.message}`)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function handleDeleteSet(set) {
    try {
      await deleteSetAndRenumber(set.id)
      if (editingSetId === set.id) cancelEdit()
      onSetDeleted(set)
      bumpSummary()
      await reload()
    } catch (error) {
      onError(`Set silinemedi: ${error.message}`)
    }
  }

  // Ağırlık butonu egzersizin kendi artış adımını kullanır (dumbbell 2, lateral raise 1 ...).
  function bumpWeight(direction) {
    setWeight((prev) => Math.max(0, roundKg((Number(prev) || 0) + direction * weightStep)))
  }

  async function handleSaveNote(note) {
    try {
      await onUpdateExercise({ note })
    } catch (error) {
      onError(`Not kaydedilemedi: ${error.message}`)
      throw error
    }
  }

  let plateLine = null
  // Sınır dışı ağırlıkta (ör. 99999) yüzlerce plakalık satır üretilmez; kayıt zaten reddedilir.
  const plateWeight = Number(weight)
  if (
    selectedExercise?.equipmentType === 'barbell' &&
    weight !== '' &&
    Number.isFinite(plateWeight) &&
    plateWeight <= LIMITS.maxWeight
  ) {
    const result = platesPerSide(plateWeight, bar)
    if (result) {
      const base = result.plates.length
        ? `Her tarafa: ${result.plates.join(' + ')} (bar ${bar})`
        : `Her tarafa: boş bar (bar ${bar})`
      plateLine = result.remainder > 0 ? `${base} (+${result.remainder} kg eşleşmedi)` : base
    }
  }

  return (
    <>
      <label className="mb-2 block text-sm font-medium text-slate-400" htmlFor="routine">
        Antrenman Günü
      </label>
      <div className="mb-4 flex items-center gap-2">
        <select
          id="routine"
          value={routineId ?? ''}
          onChange={(e) => onSelectRoutine(Number(e.target.value))}
          className={selectCls}
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
          onClick={() => onOpenModal('routine-manage')}
          disabled={!routineId}
          className={gearCls}
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
          onChange={(e) => onSelectExercise(Number(e.target.value))}
          className={selectCls}
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
          onClick={() => onOpenModal('exercise-manage')}
          disabled={!selectedExercise}
          className={gearCls}
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      {selectedExercise && (
        <ExerciseNote key={selectedExercise.id} note={selectedExercise.note ?? ''} onSave={handleSaveNote} />
      )}

      <div className="mb-5 flex gap-2">
        <button type="button" onClick={() => onOpenModal('routine-add')} className={addCls}>
          + Gün Ekle
        </button>
        <button
          type="button"
          onClick={() => onOpenModal('exercise-add')}
          disabled={!routineId}
          className={addCls}
        >
          + Hareket Ekle
        </button>
      </div>

      <section className="mb-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Geçmiş Seans</p>
        {previousSets.length === 0 ? (
          <p className="text-sm leading-relaxed text-slate-500">Bu egzersiz için kayıtlı eski seans yok.</p>
        ) : (
          <ul className="space-y-2">
            {previousSets.map((set) => (
              <li key={set.id} className="text-sm font-medium leading-relaxed text-slate-200">
                Set {set.setNumber}: {set.weight}kg × {set.reps}
                {typeof set.rir === 'number' ? ` (RIR ${set.rir})` : ''}
                {set.isWarmup && <span className="ml-2 text-xs font-semibold text-amber-400">Isınma</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">Hedef Önerisi</p>
        <p className="text-base leading-relaxed text-slate-100">{recommendation.message}</p>
        {draftRestored && (
          <p className="mt-2 text-xs font-medium text-slate-400">Taslak geri yüklendi</p>
        )}
        {stall.stalled && (
          <p
            role="status"
            className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-200"
          >
            {stall.sessions} seanstır 1RM artmadı — deload düşün: {stall.deload} kg
          </p>
        )}
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
      {plateLine && <p className="-mt-3 mb-5 text-sm font-medium text-slate-400">{plateLine}</p>}
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
        aria-pressed={isWarmup}
        onClick={() => setIsWarmup((prev) => !prev)}
        className="mb-3 flex h-12 w-full items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 px-4 text-base font-semibold text-slate-200 active:bg-slate-800"
      >
        Isınma seti
        <span
          aria-hidden="true"
          className={`flex h-7 w-12 items-center rounded-full p-1 transition-colors ${isWarmup ? 'bg-emerald-500' : 'bg-slate-700'}`}
        >
          <span className={`h-5 w-5 rounded-full bg-white transition-transform ${isWarmup ? 'translate-x-5' : ''}`} />
        </span>
      </button>
      <button
        type="button"
        onClick={handleSaveSet}
        disabled={!selectedExercise || saving}
        className="mb-3 h-16 w-full rounded-2xl bg-emerald-500 text-lg font-bold text-slate-950 shadow-lg shadow-emerald-500/20 active:bg-emerald-400 disabled:opacity-50"
      >
        {saving ? 'Kaydediliyor…' : editingSetId != null ? 'Seti Güncelle' : 'Seti Kaydet'}
      </button>
      {editingSetId != null ? (
        <button
          type="button"
          onClick={cancelEdit}
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
        <TodaySetList
          sets={todaySets}
          editingSetId={editingSetId}
          onEdit={handleEditSet}
          onDelete={handleDeleteSet}
        />
        <DaySummaryCard summary={daySummary} />
      </section>
    </>
  )
}
