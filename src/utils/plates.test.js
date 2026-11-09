import { test, expect } from 'vitest'
import { platesPerSide } from './plates'

test('plates', () => {
  expect(platesPerSide(62.5, 20)).toEqual({ plates: [20, 1.25], remainder: 0 })
  expect(platesPerSide(100, 20)).toEqual({ plates: [25, 15], remainder: 0 })
  expect(platesPerSide(61, 20)).toEqual({ plates: [20], remainder: 1 })
  expect(platesPerSide(40, 10)).toEqual({ plates: [15], remainder: 0 })
  expect(platesPerSide(20, 20)).toEqual({ plates: [], remainder: 0 })
  expect(platesPerSide(15, 20)).toBeNull()
})
