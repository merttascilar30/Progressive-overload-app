import { test, expect } from 'vitest'
import { calculate1RM, parseSetInput } from './progressionEngine'

test('calculate1RM uses Brzycki', () => {
  expect(calculate1RM(100, 1)).toBe(100)
  expect(calculate1RM(100, 8)).toBeCloseTo(124.14, 2)
})

test('parseSetInput rejects blanks', () => {
  expect(parseSetInput({ weight: '', reps: 8, rir: 2 }).error).toBeTruthy()
})
