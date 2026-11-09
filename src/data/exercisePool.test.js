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

it('MUSCLE_GROUPS lists pool muscles once, in first-seen order, with Genel last', async () => {
  const { MUSCLE_GROUPS } = await import('./exercisePool')
  expect(MUSCLE_GROUPS[0]).toBe('Chest')
  expect(MUSCLE_GROUPS.at(-1)).toBe('Genel')
  expect(new Set(MUSCLE_GROUPS).size).toBe(MUSCLE_GROUPS.length)
  expect(MUSCLE_GROUPS).toEqual(expect.arrayContaining(['Triceps', 'Back', 'Biceps', 'Shoulders', 'Quads', 'Calves']))
})
