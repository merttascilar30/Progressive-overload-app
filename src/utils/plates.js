export const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25]

const round2 = (value) => Number(value.toFixed(2))

/**
 * Bir tarafa takılacak plakalar (greedy, en büyükten). remainder = karşılanamayan toplam kg.
 * total < bar ise null.
 */
export function platesPerSide(total, bar) {
  if (!Number.isFinite(total) || !Number.isFinite(bar) || total < bar) return null
  let left = round2((total - bar) / 2)
  const plates = []
  for (const size of PLATE_SIZES) {
    while (left >= size - 1e-9) {
      plates.push(size)
      left = round2(left - size)
    }
  }
  return { plates, remainder: round2(left * 2) }
}
