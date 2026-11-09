/** ids dizisinde `from` konumundaki öğeyi `to` konumuna taşır; yeni dizi döndürür. */
export function moveItem(ids, from, to) {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids
  const next = [...ids]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
