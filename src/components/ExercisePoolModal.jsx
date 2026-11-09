import { useCallback, useEffect, useState } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'

import { EQUIPMENT_TYPES, EXERCISE_POOL, MUSCLE_GROUPS } from '../data/exercisePool'
import { listCustomPool, removeCustomPoolItem, upsertCustomPoolItem } from '../db'

/**
 * 'Hareket Ekle' modalı: havuzdan seçim veya manuel isim girişi.
 * onAdd({ name, targetMuscle, equipmentType, incrementStep, repMin, repMax }) çağrılır, ardından modal kapanır.
 * Elle eklenen hareket ayrıca kişisel havuza ("Benim hareketlerim") kaydedilir.
 */
function PoolItemButton({ name, added, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={added || disabled}
      onClick={onClick}
      className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2 text-left text-sm font-semibold text-white active:bg-slate-800 disabled:opacity-40"
    >
      <span className="truncate">{name}</span>
      {added ? (
        <span className="text-xs font-medium text-slate-400">Ekli</span>
      ) : (
        <Plus className="h-4 w-4 shrink-0 text-emerald-400" />
      )}
    </button>
  )
}

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
  const [muscle, setMuscle] = useState('Genel')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [customPool, setCustomPool] = useState([])
  const [confirmRemoveId, setConfirmRemoveId] = useState(null)

  const loadCustomPool = useCallback(async () => {
    try {
      setCustomPool(await listCustomPool())
    } catch (err) {
      setError(`Kişisel havuz yüklenemedi: ${err?.message ?? ''}`)
    }
  }, [])

  useEffect(() => {
    // IndexedDB'den açılışta okuma (dış sistemle senkronizasyon).
    // oxlint-disable-next-line react/set-state-in-effect
    loadCustomPool()
  }, [loadCustomPool])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function add(exercise, { saveToPool = false } = {}) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onAdd(exercise)
    } catch (err) {
      setError(err?.message ?? 'Hareket eklenemedi.')
      setBusy(false)
      return
    }
    if (saveToPool) {
      try {
        await upsertCustomPoolItem(exercise)
      } catch (err) {
        // Hareket güne eklendi; yalnız havuza kayıt başarısız. Modal açık kalır ki kullanıcı görsün.
        setError(`Hareket eklendi ama havuza kaydedilemedi: ${err?.message ?? ''}`)
        setBusy(false)
        return
      }
    }
    setBusy(false)
    onClose()
  }

  async function removeFromPool(id) {
    setError('')
    try {
      await removeCustomPoolItem(id)
      setConfirmRemoveId(null)
      await loadCustomPool()
    } catch (err) {
      setError(`Havuzdan kaldırılamadı: ${err?.message ?? ''}`)
    }
  }

  function handleManualSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const equipment = EQUIPMENT_TYPES.find((type) => type.value === equipmentType) ?? EQUIPMENT_TYPES.at(-1)
    add(
      {
        name: trimmed,
        targetMuscle: muscle,
        equipmentType: equipment.value,
        incrementStep: equipment.step,
        repMin: REP_PRESETS[repPreset].repMin,
        repMax: REP_PRESETS[repPreset].repMax,
      },
      { saveToPool: true },
    )
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
            <label className="block text-sm font-medium text-slate-400" htmlFor="manual-muscle">
              Kas grubu
            </label>
            <select
              id="manual-muscle"
              value={muscle}
              onChange={(e) => setMuscle(e.target.value)}
              className="h-14 w-full appearance-none rounded-2xl border border-slate-800 bg-slate-950 px-4 text-base font-semibold text-white outline-none ring-emerald-500 focus:ring-2"
            >
              {MUSCLE_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {group}
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
              {customPool.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-400">Benim hareketlerim</p>
                  <ul className="space-y-2">
                    {customPool.map((item) =>
                      confirmRemoveId === item.id ? (
                        <li
                          key={item.id}
                          className="flex min-h-12 items-center justify-between gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm"
                        >
                          <span className="text-red-200">Havuzdan kaldırılsın mı?</span>
                          <span className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => removeFromPool(item.id)}
                              className="h-10 rounded-xl bg-red-500 px-3 font-semibold text-white"
                            >
                              Evet
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveId(null)}
                              className="h-10 rounded-xl bg-slate-800 px-3 font-semibold text-slate-200"
                            >
                              Vazgeç
                            </button>
                          </span>
                        </li>
                      ) : (
                        <li key={item.id} className="flex items-center gap-2">
                          <PoolItemButton
                            name={item.name}
                            added={existing.has(item.name.toLowerCase())}
                            disabled={busy}
                            onClick={() =>
                              add({
                                name: item.name,
                                targetMuscle: item.targetMuscle,
                                equipmentType: item.equipmentType,
                                incrementStep: item.incrementStep,
                                repMin: item.repMin,
                                repMax: item.repMax,
                              })
                            }
                          />
                          <button
                            type="button"
                            aria-label={`${item.name} havuzdan kaldır`}
                            onClick={() => setConfirmRemoveId(item.id)}
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-red-400 active:bg-slate-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}
              {EXERCISE_POOL.map((group) => (
                <div key={group.category}>
                  <p className="mb-2 text-sm font-semibold text-slate-400">{group.category}</p>
                  <ul className="space-y-2">
                    {group.items.map((poolItem) => (
                      <li key={poolItem.name} className="flex">
                        <PoolItemButton
                          name={poolItem.name}
                          added={existing.has(poolItem.name.toLowerCase())}
                          disabled={busy}
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
                        />
                      </li>
                    ))}
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
