import { useEffect, useRef } from 'react'

// Navigasyonun üstünde, max-w-md sütununun içinde duran geçici bildirim.
export default function Toast({ message, actionLabel, onAction, onDismiss, durationMs = 5000, raised = false }) {
  const dismissRef = useRef(onDismiss)
  useEffect(() => {
    dismissRef.current = onDismiss
  })

  // Mesaj değişince sayaç baştan başlar.
  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current?.(), durationMs)
    return () => clearTimeout(timer)
  }, [message, durationMs])

  return (
    <div className={`pointer-events-none fixed inset-x-0 z-20 ${raised ? 'bottom-48' : 'bottom-24'}`}>
      <div className="mx-auto max-w-md px-4">
        <div
          role="status"
          className="pointer-events-auto flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-lg"
        >
          <span>{message}</span>
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="h-10 shrink-0 rounded-xl px-3 text-sm font-bold text-emerald-400 active:bg-slate-700"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
