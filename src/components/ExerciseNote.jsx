import { useState } from 'react'
import { NOTE_MAX_LENGTH } from '../db'

/** Hareket notu kartı: boşsa "+ Not ekle", doluysa not ve Düzenle; satır içi düzenleme. */
export default function ExerciseNote({ note = '', onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  function start() {
    setDraft(note)
    setEditing(true)
  }

  async function save() {
    if (busy) return
    setBusy(true)
    try {
      await onSave(draft.trim())
      setEditing(false)
    } catch {
      // Hata onSave tarafında gösterilir; düzenleme açık kalır.
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <section className="mb-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <label htmlFor="exercise-note" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
          Not
        </label>
        <textarea
          id="exercise-note"
          autoFocus
          rows={3}
          maxLength={NOTE_MAX_LENGTH}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-base text-white outline-none ring-emerald-500 focus:ring-2"
        />
        <p className="mt-1 text-right text-xs text-slate-500">{draft.length}/{NOTE_MAX_LENGTH}</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="h-10 flex-1 rounded-xl bg-emerald-500 text-sm font-bold text-slate-950 disabled:opacity-50"
          >
            Kaydet
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-10 flex-1 rounded-xl bg-slate-800 text-sm font-semibold text-slate-200 active:bg-slate-700"
          >
            Vazgeç
          </button>
        </div>
      </section>
    )
  }

  if (!note) {
    return (
      <button
        type="button"
        onClick={start}
        className="mb-4 h-10 w-full rounded-xl border border-dashed border-slate-700 text-sm font-semibold text-slate-400 active:bg-slate-900"
      >
        + Not ekle
      </button>
    )
  }

  return (
    <section className="mb-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Not</p>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-200">{note}</p>
      <button
        type="button"
        onClick={start}
        className="mt-2 h-10 rounded-xl bg-slate-800 px-4 text-sm font-semibold text-slate-200 active:bg-slate-700"
      >
        Düzenle
      </button>
    </section>
  )
}
