import { Pencil, Trash2 } from 'lucide-react'

const iconBtn = 'flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 active:bg-slate-700'

export default function TodaySetList({ sets, editingSetId, onEdit, onDelete }) {
  if (sets.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-800 px-4 py-6 text-center text-sm text-slate-500">
        Bu egzersiz için henüz set yok.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {sets.map((set) => (
        <li
          key={set.id}
          className={`flex items-center justify-between gap-2 rounded-2xl border bg-slate-900 px-4 py-3 ${
            editingSetId === set.id ? 'border-emerald-500' : 'border-slate-800'
          }`}
        >
          <span className="text-sm font-semibold text-slate-400">Set {set.setNumber}</span>
          <span className="font-bold text-white">
            {set.weight} kg × {set.reps}
          </span>
          {set.isWarmup && <span className="text-xs font-semibold text-amber-400">Isınma</span>}
          {Number.isInteger(set.rir) &&<span className="text-sm text-emerald-400">RIR {set.rir}</span>}
          <span className="flex gap-1">
            <button
              type="button"
              aria-label="Seti düzenle"
              onClick={() => onEdit(set)}
              className={`${iconBtn} text-slate-300`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Seti sil"
              onClick={() => onDelete(set)}
              className={`${iconBtn} text-red-400`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}
