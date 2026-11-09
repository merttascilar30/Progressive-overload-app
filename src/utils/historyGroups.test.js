import { describe, expect, test } from 'vitest'
import { groupSets } from './historyGroups'

const at = (d, h = 10) => new Date(2026, 10, d, h).getTime()
const set = (id, exerciseId, weight, reps, timestamp, extra = {}) => ({ id, exerciseId, setNumber: 1, weight, reps, timestamp, ...extra })

describe('groupSets', () => {
  const info = new Map([[1, { id: 1, name: 'Bench', routineId: 1 }]])
  const routines = new Map([[1, 'Push']])

  test('oldest loaded day uses the prior best for its delta', () => {
    const groups = groupSets([set(1, 1, 100, 1, at(5)), set(2, 1, 105, 1, at(8))], info, routines, new Map([[1, 90]]))
    expect(groups.map((g) => g.exercises[0].delta)).toEqual([5, 10])
  })

  test('without a prior best the oldest day has no delta', () => {
    const groups = groupSets([set(1, 1, 100, 1, at(5))], info, routines)
    expect(groups[0].exercises[0].delta).toBeNull()
  })
})
