import { Dumbbell, Settings } from 'lucide-react'

export default function AppHeader({ title, backupReminder, onOpenSettings }) {
  return (
    <header className="mb-6 flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
        <Dumbbell className="h-6 w-6" strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Overload</p>
        <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label={backupReminder ? 'Ayarlar (yedek önerilir)' : 'Ayarlar'}
        className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-slate-300 active:bg-slate-800"
      >
        <Settings className="h-6 w-6" />
        {backupReminder && (
          <span aria-hidden="true" className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-slate-950" />
        )}
      </button>
    </header>
  )
}
