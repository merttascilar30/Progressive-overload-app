import { useEffect, useState } from 'react'
import { Check, Trash2, X } from 'lucide-react'
import { BAR_WEIGHTS, REP_LIMITS, withExerciseDefaults } from '../db'
import { REST_OPTIONS, getRestSeconds } from '../utils/settings'
import { MUSCLE_GROUPS } from '../data/exercisePool'

const bigButton =
  'flex h-14 w-full items-center justify-center gap-3 rounded-2xl text-lg font-bold active:scale-[0.98] transition-transform'
const clamp = (n) => Math.min(REP_LIMITS.max, Math.max(REP_LIMITS.min, n))

function MiniStepper({ label, value, onChange }) {
  const btn = 'flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-lg font-bold text-white active:bg-slate-700'
  return (
    <div className="flex flex-1 items-center justify-between gap-2">
      <button type="button" aria-label={`${label} azalt`} onClick={() => onChange(clamp(value - 1))} className={btn}>−</button>
      <span aria-label={label} className="min-w-8 text-center text-lg font-bold text-white">{value}</span>
      <button type="button" aria-label={`${label} artır`} onClick={() => onChange(clamp(value + 1))} className={btn}>+</button>
    </div>
  )
}

const choiceCls = (selected) =>
  `h-10 rounded-xl px-3 text-sm font-semibold ${selected ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-200 active:bg-slate-700'}`

/** Hareket ayarları formu: ad, tekrar aralığı, dinlenme, bar ağırlığı; Sil → onay ekranı. */
export default function ExerciseSettingsModal({ exercise, onSave, onDelete, onClose }) {
  const ex = withExerciseDefaults(exercise)
  const [name, setName] = useState(ex.name)
  const [repMin, setRepMin] = useState(ex.repMin)
  const [repMax, setRepMax] = useState(ex.repMax)
  const [restSeconds, setRestSeconds] = useState(ex.restSeconds ?? null)
  const [barWeight, setBarWeight] = useState(ex.barWeight)
  const initialMuscle = exercise.targetMuscle || 'Genel'
  const [muscle, setMuscle] = useState(initialMuscle)
  // Listede olmayan eski bir değer (ör. 'Legs') seçili kalabilsin.
  const muscleOptions = MUSCLE_GROUPS.includes(initialMuscle) ? MUSCLE_GROUPS : [initialMuscle, ...MUSCLE_GROUPS]
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isBarbell = exercise.equipmentType === 'barbell'

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function run(action) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await action()
      onClose()
    } catch (err) {
      setError(err?.message ?? 'İşlem başarısız oldu.')
    } finally {
      setBusy(false)
    }
  }

  // Aralık hep geçerli kalsın: bir sınır diğerini geçerse diğeri de onunla birlikte kayar.
  function changeRepMin(value) {
    setRepMin(value)
    if (value > repMax) setRepMax(value)
  }

  function changeRepMax(value) {
    setRepMax(value)
    if (value < repMin) setRepMin(value)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    const patch = { name: name.trim(), repMin, repMax, restSeconds }
    if (isBarbell) patch.barWeight = barWeight
    // Değiştiyse aynı isimli tüm kopyalara ve kişisel havuza da yansır (updateExercise).
    if (muscle !== initialMuscle) patch.targetMuscle = muscle
    run(() => onSave(patch))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hareket Ayarları"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-white">Hareket Ayarları</h2>
            <p className="truncate text-sm text-slate-400">{exercise.name}</p>
          </div>
          <button
            type="button"
            aria-label="Kapat"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300 active:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <p role="alert" className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {!confirming ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="ex-name" className="mb-1 block text-sm font-medium text-slate-400">Hareket adı</label>
              <input
                id="ex-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 text-base font-semibold text-white outline-none ring-emerald-500 focus:ring-2"
              />
            </div>

            <div>
              <label htmlFor="ex-muscle" className="mb-1 block text-sm font-medium text-slate-400">Kas grubu</label>
              <select
                id="ex-muscle"
                value={muscle}
                onChange={(e) => setMuscle(e.target.value)}
                className="h-12 w-full appearance-none rounded-2xl border border-slate-800 bg-slate-950 px-4 text-base font-semibold text-white outline-none ring-emerald-500 focus:ring-2"
              >
                {muscleOptions.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">Bu hareketin tüm günlerdeki kopyalarına ve havuzdaki kaydına uygulanır.</p>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-slate-400">Tekrar aralığı</p>
              <div className="flex items-center gap-3">
                <MiniStepper label="En az tekrar" value={repMin} onChange={changeRepMin} />
                <span className="text-slate-500">–</span>
                <MiniStepper label="En çok tekrar" value={repMax} onChange={changeRepMax} />
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-slate-400">Dinlenme süresi</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Dinlenme süresi">
                <button type="button" aria-pressed={restSeconds === null} onClick={() => setRestSeconds(null)} className={choiceCls(restSeconds === null)}>
                  Varsayılan ({getRestSeconds()} sn)
                </button>
                {REST_OPTIONS.map((s) => (
                  <button key={s} type="button" aria-pressed={restSeconds === s} onClick={() => setRestSeconds(s)} className={choiceCls(restSeconds === s)}>
                    {s} sn
                  </button>
                ))}
              </div>
            </div>

            {isBarbell && (
              <div>
                <p className="mb-1 text-sm font-medium text-slate-400">Bar ağırlığı</p>
                <div className="flex gap-2" role="group" aria-label="Bar ağırlığı">
                  {BAR_WEIGHTS.map((w) => (
                    <button key={w} type="button" aria-pressed={barWeight === w} onClick={() => setBarWeight(w)} className={`${choiceCls(barWeight === w)} flex-1`}>
                      {w} kg
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={!name.trim() || busy}
              className={`${bigButton} bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20 disabled:opacity-50`}
            >
              <Check className="h-5 w-5" />
              Kaydet
            </button>
            <button type="button" onClick={() => setConfirming(true)} className={`${bigButton} bg-red-500/15 text-red-400`}>
              <Trash2 className="h-5 w-5" />
              Sil
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-slate-300">Bu hareket silinecek. Geçmiş set kayıtları korunur.</p>
            <button type="button" disabled={busy} onClick={() => run(onDelete)} className={`${bigButton} bg-red-500 text-white disabled:opacity-50`}>
              <Trash2 className="h-5 w-5" />
              Evet, Sil
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={`${bigButton} bg-slate-800 text-slate-200`}>
              Vazgeç
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
