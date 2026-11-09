const btnCls =
  'h-10 shrink-0 rounded-xl bg-slate-800 px-4 text-sm font-bold text-slate-100 active:bg-slate-700'

const format = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

// Alt menünün hemen üstünde sabit duran dinlenme sayacı çubuğu.
export default function RestTimerBar({ remaining, totalSeconds, onAdd, onSkip }) {
  const progress = totalSeconds > 0 ? Math.min(100, (remaining / totalSeconds) * 100) : 0
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[5.25rem] z-20">
      <div className="mx-auto max-w-md px-4">
        <div className="pointer-events-auto rounded-2xl border border-slate-700 bg-slate-800 px-4 pb-2 pt-3 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <span role="timer" aria-label="Dinlenme süresi" className="text-2xl font-bold tabular-nums text-emerald-400">
              {format(remaining)}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => onAdd(30)} className={btnCls}>+30 sn</button>
              <button type="button" onClick={onSkip} className={btnCls}>Atla</button>
            </div>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-1000 ease-linear" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
