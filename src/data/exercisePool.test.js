import { describe, expect, it } from 'vitest'

import { EXERCISE_POOL } from './exercisePool'

const all = EXERCISE_POOL.flatMap((g) => g.items)
const byName = (name) => all.find((i) => i.name === name)

describe('EXERCISE_POOL tekrar aralıkları', () => {
  it('her öğede 1 ≤ repMin ≤ repMax ≤ 50', () => {
    for (const i of all) {
      expect(Number.isInteger(i.repMin), i.name).toBe(true)
      expect(Number.isInteger(i.repMax), i.name).toBe(true)
      expect(i.repMin, i.name).toBeGreaterThanOrEqual(1)
      expect(i.repMin, i.name).toBeLessThanOrEqual(i.repMax)
      expect(i.repMax, i.name).toBeLessThanOrEqual(50)
    }
  })

  it('belirli hareketlerin aralıkları', () => {
    expect(byName('Calf Raises Machine')).toMatchObject({ repMin: 12, repMax: 20 })
    expect(byName('Lateral Raise')).toMatchObject({ repMin: 10, repMax: 15 })
    expect(byName('Hack Squat')).toMatchObject({ repMin: 6, repMax: 8 })
  })
})
