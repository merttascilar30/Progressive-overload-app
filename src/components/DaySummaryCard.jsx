/** Bugünkü antrenmanın özeti (tüm hareketler). */
export default function DaySummaryCard({ summary }) {
  if (!summary) return null
  const { volume, workingSets, warmupSets, prCount, minutes } = summary
  return (
    <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-4" aria-label="Günün özeti">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Günün Özeti</p>
      <p className="text-sm leading-relaxed text-slate-200">
        Hacim {volume.toLocaleString('tr-TR')} kg · {workingSets} set
        {warmupSets > 0 ? ` (+${warmupSets} ısınma)` : ''} · {prCount} rekor · {minutes} dk
      </p>
    </section>
  )
}
