import { test, expect } from 'vitest'
import { calculate1RM, parseSetInput, getSetRecommendation, calculateVolumeLoad } from './progressionEngine'

test('calculate1RM uses Brzycki', () => {
  expect(calculate1RM(100, 1)).toBe(100)
  expect(calculate1RM(100, 8)).toBeCloseTo(124.14, 2)
})

test('parseSetInput rejects blanks', () => {
  expect(parseSetInput({ weight: '', reps: 8, rir: 2 }).error).toBeTruthy()
})

const s = (weight, reps, rir = 2, isWarmup = false) => ({ weight, reps, rir, isWarmup })
test('first session', () => {
  expect(getSetRecommendation([])).toMatchObject({ weight: null, reps: null })
  expect(getSetRecommendation(null)).toMatchObject({ weight: null, reps: null })
})
test('top of range → +1 step', () => {
  expect(getSetRecommendation([s(60, 8), s(60, 7)])).toMatchObject({ weight: 62.5, reps: 6 })
})
test('very easy → +2 steps', () => {
  expect(getSetRecommendation([s(60, 8, 4)])).toMatchObject({ weight: 65, reps: 6 })
})
test('below range → -1 step', () => {
  expect(getSetRecommendation([s(60, 5)])).toMatchObject({ weight: 57.5, reps: 6 })
})
test('in range → add reps at same weight', () => {
  expect(getSetRecommendation([s(60, 6, 3)])).toMatchObject({ weight: 60, reps: 8 })
})
test('warmups ignored', () => {
  expect(getSetRecommendation([s(100, 3, 5, true), s(60, 7)])).toMatchObject({ weight: 60, reps: 8 })
})
test('custom range 10–15', () => {
  expect(getSetRecommendation([s(10, 15)], { incrementStep: 1, repRange: { min: 10, max: 15 } }))
    .toMatchObject({ weight: 11, reps: 10 })
})
test('bodyweight only adds reps', () => {
  expect(getSetRecommendation([s(0, 10)], { bodyweight: true, repRange: { min: 8, max: 12 } }))
    .toMatchObject({ weight: 0, reps: 11 })
})
test('volume skips warmups', () => {
  expect(calculateVolumeLoad([s(20, 10, 2, true), s(60, 8)])).toBe(480)
})
