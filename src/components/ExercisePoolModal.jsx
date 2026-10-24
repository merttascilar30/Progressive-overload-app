import { useEffect, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'

// Ekipman tipine göre varsayılan ağırlık artış adımı (kg). Manuel eklemede kullanılır.
export const EQUIPMENT_TYPES = [
  { value: 'barbell', label: 'Barbell', step: 2.5 },
  { value: 'dumbbell', label: 'Dumbbell', step: 2 },
  { value: 'machine', label: 'Makine', step: 5 },
  { value: 'plate_loaded', label: 'Plaka yüklemeli makine', step: 5 },
  { value: 'cable', label: 'Kablo', step: 2.5 },
  { value: 'bodyweight', label: 'Vücut ağırlığı', step: 2.5 },
  { value: 'other', label: 'Diğer', step: 2.5 },
]

function item(name, muscle, equipmentType, incrementStep) {
  return { name, muscle, equipmentType, incrementStep }
}

export const EXERCISE_POOL = [
  {
    category: 'Göğüs & Triceps',
    items: [
      item('Plate Loaded Incline Chest Press', 'Chest', 'plate_loaded', 5),
      item('Plate Loaded Chest Press', 'Chest', 'plate_loaded', 5),
      item('Chest Fly Machine', 'Chest', 'machine', 5),
      item('Triceps Pushdown', 'Triceps', 'cable', 2.5),
      item('Triceps Lying Cable Extension', 'Triceps', 'cable', 2.5),
      item('Tek Kol Triceps Pushdown', 'Triceps', 'cable', 1.25),
    ],
  },
  {
    category: 'Sırt & Biceps',
    items: [
      item('Lat Pulldown', 'Back', 'cable', 2.5),
      item('Cable Row', 'Back', 'cable', 2.5),
      item('Plate Loaded Wide Grip Row', 'Back', 'plate_loaded', 5),
      item('T-Bar Row', 'Back', 'plate_loaded', 5),
      item('Barbell Curl', 'Biceps', 'barbell', 2.5),
      item('Dumbbell Curl', 'Biceps', 'dumbbell', 1),
      item('Hammer Curl', 'Biceps', 'dumbbell', 1),
    ],
  },
  {
    category: 'Omuz & Bacak',
    items: [
      item('Shoulder Press Machine', 'Shoulders', 'machine', 5),
      item('Lateral Raise', 'Shoulders', 'dumbbell', 1),
      item('Cable Rear Delt Fly', 'Rear Delts', 'cable', 1.25),
      item('Hack Squat', 'Quads', 'plate_loaded', 5),
      item('Leg Extension', 'Quads', 'machine', 5),
      item('Seated Leg Curl', 'Hamstrings', 'machine', 5),
      item('Calf Raises Machine', 'Calves', 'machine', 5),
    ],
  },
]

/**
 * 'Hareket Ekle' modalı: havuzdan seçim veya manuel isim girişi.
 * onAdd({ name, targetMuscle, equipmentType, incrementStep }) çağrılır, ardından modal kapanır.
 */
export default function ExercisePoolModal({ routineName, existingNames, onAdd, onClose }) {
  const [manual, setManual] = useState(false)
  const [name, setName] = useState('')
  const [equipmentType, setEquipmentType] = useState('machine')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function add(exercise) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onAdd(exercise)
      onClose()
    } catch (err) {
      setError(err?.message ?? 'Hareket eklenemedi.')
    } finally {
      setBusy(false)
    }
  }

  function handleManualSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const equipment = EQUIPMENT_TYPES.find((type) => type.value === equipmentType) ?? EQUIPMENT_TYPES.at(-1)
    add({
      name: trimmed,
      targetMuscle: 'Genel',
      equipmentType: equipment.value,
      incrementStep: equipment.step,
    })
  }

  const existing = new Set(existingNames.map((n) => n.toLowerCase()))

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hareket Ekle"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white">Hareket Ekle</h2>
            {routineName && <p className="truncate text-sm text-slate-400">{routineName}</p>}
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

        {manual ? (
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <label className="block text-sm font-medium text-slate-400" htmlFor="manual-name">
              Hareket adı
            </label>
            <input
              id="manual-name"
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-14 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 text-base font-semibold text-white outline-none ring-emerald-500 focus:ring-2"
            />
            <label className="block text-sm font-medium text-slate-400" htmlFor="manual-equipment">
              Ekipman
            </label>
            <select
              id="manual-equipment"
              value={equipmentType}
              onChange={(e) => setEquipmentType(e.target.value)}
              className="h-14 w-full appearance-none rounded-2xl border border-slate-800 bg-slate-950 px-4 text-base font-semibold text-white outline-none ring-emerald-500 focus:ring-2"
            >
              {EQUIPMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label} · +{type.step} kg
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!name.trim() || busy}
              className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-emerald-500 text-lg font-bold text-slate-950 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <Check className="h-5 w-5" />
              Kaydet
            </button>
            <button
              type="button"
              onClick={() => setManual(false)}
              className="h-12 w-full rounded-2xl bg-slate-800 text-sm font-semibold text-slate-200 active:bg-slate-700"
            >
              Havuza Dön
            </button>
          </form>
        ) : (
          <>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Mert&apos;s Hypertrophy Max Havuzu
            </p>
            <div className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1 pb-2">
              {EXERCISE_POOL.map((group) => (
                <div key={group.category}>
                  <p className="mb-2 text-sm font-semibold text-slate-400">{group.category}</p>
                  <ul className="space-y-2">
                    {group.items.map((poolItem) => {
                      const added = existing.has(poolItem.name.toLowerCase())
                      return (
                        <li key={poolItem.name}>
                          <button
                            type="button"
                            disabled={added || busy}
                            onClick={() =>
                              add({
                                name: poolItem.name,
                                targetMuscle: poolItem.muscle,
                                equipmentType: poolItem.equipmentType,
                                incrementStep: poolItem.incrementStep,
                              })
                            }
                            className="flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2 text-left text-sm font-semibold text-white active:bg-slate-800 disabled:opacity-40"
                          >
                            <span>{poolItem.name}</span>
                            {added ? (
                              <span className="text-xs font-medium text-slate-400">Ekli</span>
                            ) : (
                              <Plus className="h-4 w-4 shrink-0 text-emerald-400" />
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setManual(true)}
              className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 text-base font-bold text-white active:bg-slate-700"
            >
              <Plus className="h-5 w-5" />
              Manuel Ekle
            </button>
          </>
        )}
      </div>
    </div>
  )
}
