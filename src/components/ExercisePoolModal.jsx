import { useEffect, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'

import { EQUIPMENT_TYPES, EXERCISE_POOL } from '../data/exercisePool'

/**
 * 'Hareket Ekle' modalı: havuzdan seçim veya manuel isim girişi.
 * onAdd({ name, targetMuscle, equipmentType, incrementStep, repMin, repMax }) çağrılır, ardından modal kapanır.
 */
const REP_PRESETS = [
  { label: '6–8', repMin: 6, repMax: 8 },
  { label: '8–12', repMin: 8, repMax: 12 },
  { label: '10–15', repMin: 10, repMax: 15 },
]

export default function ExercisePoolModal({ routineName, existingNames, onAdd, onClose }) {
  const [manual, setManual] = useState(false)
  const [name, setName] = useState('')
  const [equipmentType, setEquipmentType] = useState('machine')
  const [repPreset, setRepPreset] = useState(0)
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
      repMin: REP_PRESETS[repPreset].repMin,
      repMax: REP_PRESETS[repPreset].repMax,
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
            <p className="block text-sm font-medium text-slate-400">Tekrar aralığı</p>
            <div className="grid grid-cols-3 gap-2">
              {REP_PRESETS.map((preset, index) => (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={repPreset === index}
                  onClick={() => setRepPreset(index)}
                  className={`h-12 rounded-2xl border text-base font-semibold ${
                    repPreset === index
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                      : 'border-slate-800 bg-slate-950 text-white active:bg-slate-800'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
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
                                repMin: poolItem.repMin,
                                repMax: poolItem.repMax,
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
