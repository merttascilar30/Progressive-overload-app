import { describe, expect, test } from 'vitest'
import {
  getPreviousSessionSets,
  isBodyweightProgression,
  recommendationOptions,
  routineExercises,
  splitHistory,
  startOfDay,
} from './sessionSets'

const DAY = 24 * 60 * 60 * 1000
const today = startOfDay(new Date(2026, 10, 9, 12).getTime())
const at = (daysAgo, hour, extra) => ({ timestamp: today - daysAgo * DAY + hour * 3600000, ...extra })

describe('getPreviousSessionSets / splitHistory', () => {
  test('returns only the most recent day before today, ordered by setNumber', () => {
    const history = [
      at(5, 10, { id: 1, setNumber: 1 }),
      at(2, 11, { id: 3, setNumber: 2 }),
      at(2, 10, { id: 2, setNumber: 1 }),
      at(0, 9, { id: 4, setNumber: 1 }),
    ]
    expect(getPreviousSessionSets(history, today).map((s) => s.id)).toEqual([2, 3])
    const { todaySets, previousSets } = splitHistory(history, today)
    expect(todaySets.map((s) => s.id)).toEqual([4])
    expect(previousSets.map((s) => s.id)).toEqual([2, 3])
  })

  test('no earlier session → empty', () => {
    expect(getPreviousSessionSets([at(0, 9, { id: 1 })], today)).toEqual([])
  })
})

describe('isBodyweightProgression', () => {
  const pullUp = { equipmentType: 'bodyweight' }

  test('non-bodyweight equipment is never bodyweight progression', () => {
    expect(isBodyweightProgression({ equipmentType: 'barbell' }, [])).toBe(false)
  })

  test('bodyweight with no session or only 0 kg working sets', () => {
    expect(isBodyweightProgression(pullUp, [])).toBe(true)
    expect(isBodyweightProgression(pullUp, [{ weight: 0, reps: 8 }])).toBe(true)
    expect(isBodyweightProgression(pullUp, [{ weight: 10, reps: 5, isWarmup: true }, { weight: 0, reps: 8 }])).toBe(true)
  })

  test('weighted bodyweight movement (+10 kg) keeps weighted progression', () => {
    expect(isBodyweightProgression(pullUp, [{ weight: 10, reps: 6 }, { weight: 0, reps: 10 }])).toBe(false)
  })
})

test('recommendationOptions uses rep range and step from the exercise (with defaults)', () => {
  expect(recommendationOptions({ incrementStep: 1, repMin: 10, repMax: 15, equipmentType: 'dumbbell' })).toEqual({
    incrementStep: 1,
    repRange: { min: 10, max: 15 },
    bodyweight: false,
  })
  expect(recommendationOptions({ id: 3 }).repRange).toEqual({ min: 6, max: 8 })
})

test('routineExercises filters archived/other routines and sorts by order', () => {
  const list = [
    { id: 1, routineId: 1, order: 3 },
    { id: 2, routineId: 1, order: 1 },
    { id: 3, routineId: 1, order: 2, archived: true },
    { id: 4, routineId: 2, order: 0 },
  ]
  expect(routineExercises(list, 1).map((ex) => ex.id)).toEqual([2, 1])
})
