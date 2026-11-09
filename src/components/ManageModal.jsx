import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'

/**
 * window.prompt / confirm yerine kullanılan modal.
 *
 * mode: 'menu' (Adını Değiştir / Sil) | 'input' (isim girişi) | 'confirm' (silme onayı)
 */
export default function ManageModal({
  title,
  subtitle,
  inputLabel,
  initialValue = '',
  startMode = 'menu',
  submitLabel = 'Kaydet',
  canDelete = false,
  extraActions = [],
  deleteWarning,
  onSubmit,
  onDelete,
  onClose,
}) {
  const [mode, setMode] = useState(startMode)
  const [value, setValue] = useState(initialValue)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (mode === 'input') inputRef.current?.select()
  }, [mode])

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

  function handleSubmit(e) {
    e.preventDefault()
    const name = value.trim()
    if (!name) return
    run(() => onSubmit(name))
  }

  const bigButton =
    'flex h-16 w-full items-center justify-center gap-3 rounded-2xl text-lg font-bold active:scale-[0.98] transition-transform'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-white">{title}</h2>
            {subtitle && <p className="truncate text-sm text-slate-400">{subtitle}</p>}
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

        {mode === 'menu' && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setMode('input')}
              className={`${bigButton} bg-slate-800 text-white`}
            >
              <Pencil className="h-5 w-5" />
              Adını Değiştir
            </button>
            {extraActions.map(({ label, icon: Icon, onClick }) => (
              <button key={label} type="button" onClick={onClick} className={`${bigButton} bg-slate-800 text-white`}>
                {Icon && <Icon className="h-5 w-5" />}
                {label}
              </button>
            ))}
            {canDelete && (
              <button
                type="button"
                onClick={() => setMode('confirm')}
                className={`${bigButton} bg-red-500/15 text-red-400`}
              >
                <Trash2 className="h-5 w-5" />
                Sil
              </button>
            )}
          </div>
        )}

        {mode === 'input' && (
          <form onSubmit={handleSubmit} className="space-y-3">
            {inputLabel && (
              <label className="block text-sm font-medium text-slate-400" htmlFor="modal-name">
                {inputLabel}
              </label>
            )}
            <input
              id="modal-name"
              ref={inputRef}
              autoFocus
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-14 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 text-base font-semibold text-white outline-none ring-emerald-500 focus:ring-2"
            />
            <button
              type="submit"
              disabled={!value.trim() || busy}
              className={`${bigButton} bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20 disabled:opacity-50`}
            >
              <Check className="h-5 w-5" />
              {submitLabel}
            </button>
          </form>
        )}

        {mode === 'confirm' && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-slate-300">
              {deleteWarning ?? 'Bu öğe kalıcı olarak silinecek.'}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(onDelete)}
              className={`${bigButton} bg-red-500 text-white disabled:opacity-50`}
            >
              <Trash2 className="h-5 w-5" />
              Evet, Sil
            </button>
            <button
              type="button"
              onClick={() => setMode('menu')}
              className={`${bigButton} bg-slate-800 text-slate-200`}
            >
              Vazgeç
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
