const btn =
  'flex h-16 min-w-[5.5rem] flex-1 items-center justify-center rounded-2xl bg-slate-800 text-lg font-bold text-white active:bg-slate-700'

export default function Stepper({ id, label, value, onChange, onStep, stepLabel, inputMode, min, max, step }) {
  return (
    <div className="mb-5">
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-400">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <button type="button" aria-label={`${label} azalt`} onClick={() => onStep(-1)} className={btn}>
          −{stepLabel}
        </button>
        <input
          id={id}
          type="number"
          inputMode={inputMode}
          value={value}
          min={min}
          max={max}
          step={step}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className="h-16 w-24 rounded-2xl border border-slate-800 bg-slate-900 text-center text-2xl font-bold text-white outline-none ring-emerald-500 focus:ring-2"
        />
        <button type="button" aria-label={`${label} artır`} onClick={() => onStep(1)} className={btn}>
          +{stepLabel}
        </button>
      </div>
    </div>
  )
}
