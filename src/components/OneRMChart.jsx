import { useState } from 'react'

const W = 320
const H = 180
const PAD = { left: 40, right: 12, top: 16, bottom: 26 }
const shortDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' })
const kg = (value) => `${Math.round(value * 10) / 10}`

/** Tahmini 1RM'in zaman içindeki değişimi. Kütüphanesiz SVG; genişliğe uyar. */
export default function OneRMChart({ points }) {
  const [selected, setSelected] = useState(null)

  if (points.length < 2) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-800 px-4 py-8 text-center text-sm text-slate-500">
        Grafik için en az iki gün kayıt gerekli.
      </p>
    )
  }

  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const firstDay = points[0].day
  const daySpan = points.at(-1).day - firstDay || 1
  const x = (day) => PAD.left + ((day - firstDay) / daySpan) * (W - PAD.left - PAD.right)
  const y = (value) => PAD.top + (1 - (value - min) / span) * (H - PAD.top - PAD.bottom)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')

  const last = points.at(-1).value
  const change = Math.round((last - points[0].value) * 10) / 10
  const active = selected != null ? points[selected] : null

  return (
    <figure className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-lg font-bold text-white">Son {kg(last)} kg</span>
        <span className={`text-sm font-semibold ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {change >= 0 ? '+' : ''}
          {change} kg
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Tahmini 1RM grafiği">
        <line x1={PAD.left} x2={W - PAD.right} y1={y(max)} y2={y(max)} className="stroke-slate-800" />
        <line x1={PAD.left} x2={W - PAD.right} y1={y(min)} y2={y(min)} className="stroke-slate-800" />
        <text x={PAD.left - 6} y={y(max) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
          {kg(max)}
        </text>
        <text x={PAD.left - 6} y={y(min) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
          {kg(min)}
        </text>
        <text x={PAD.left} y={H - 6} className="fill-slate-400 text-[10px]">
          {shortDate.format(new Date(firstDay))}
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-slate-400 text-[10px]">
          {shortDate.format(new Date(points.at(-1).day))}
        </text>
        <path d={path} fill="none" strokeWidth="2.5" strokeLinejoin="round" className="stroke-emerald-400" />
        {points.map((p, i) => (
          <g key={p.day}>
            <circle cx={x(p.day)} cy={y(p.value)} r={selected === i ? 5 : 3} className="fill-emerald-400" />
            {/* Parmakla dokunmak için geniş, görünmez hedef */}
            <circle
              cx={x(p.day)}
              cy={y(p.value)}
              r="14"
              fill="transparent"
              role="button"
              tabIndex={0}
              aria-label={`${shortDate.format(new Date(p.day))}: ${kg(p.value)} kg`}
              onClick={() => setSelected(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setSelected(i)
              }}
            />
          </g>
        ))}
      </svg>
      <p className="mt-1 min-h-5 text-center text-xs text-slate-400" aria-live="polite">
        {active ? `${shortDate.format(new Date(active.day))} · ${kg(active.value)} kg` : 'Bir noktaya dokun'}
      </p>
    </figure>
  )
}
