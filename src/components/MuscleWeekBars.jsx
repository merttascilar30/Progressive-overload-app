const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' })

/** Bu takvim haftası (Pzt'den beri) kas grubu başına çalışma seti; geçen haftaya göre fark. */
export default function MuscleWeekBars({ rows, weekStartTs }) {
  const current = rows.filter((row) => row.count > 0)
  const max = Math.max(1, ...current.map((row) => row.count))

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Bu hafta · kas grupları</h2>
      <p className="mb-3 text-xs text-slate-500">Hafta başı: Pzt, {dayMonth.format(new Date(weekStartTs))}</p>
      {current.length === 0 ? (
        <p className="text-sm text-slate-500">Bu hafta henüz set yok.</p>
      ) : (
        <ul className="space-y-2">
          {current.map((row) => {
            const diff = row.count - row.previous
            return (
              <li key={row.muscle} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-sm">
                <span className="truncate font-medium text-slate-200">{row.muscle}</span>
                <span className="h-3 overflow-hidden rounded-full bg-slate-800">
                  <span
                    className="block h-full rounded-full bg-emerald-500"
                    style={{ width: `${(row.count / max) * 100}%` }}
                  />
                </span>
                <span className="w-16 text-right font-semibold text-white">
                  {row.count}{' '}
                  <span className={`text-xs ${diff > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {diff > 0 ? `+${diff}` : diff < 0 ? `−${Math.abs(diff)}` : '±0'}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
