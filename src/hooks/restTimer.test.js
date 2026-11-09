import { describe, expect, it } from 'vitest'
import { remainingSeconds, shouldFire } from './useRestTimer'

describe('remainingSeconds', () => {
  it('rounds up the remaining time', () => {
    expect(remainingSeconds(10_000, 4_500)).toBe(6)
  })
  it('never goes below zero', () => {
    expect(remainingSeconds(10_000, 99_000)).toBe(0)
  })
})

describe('shouldFire', () => {
  it('fires once when overdue', () => {
    expect(shouldFire({ endAt: 1000, fired: false }, 5000)).toBe(true)
    expect(shouldFire({ endAt: 1000, fired: true }, 5000)).toBe(false)
  })
  it('does not fire before the end or without a timer', () => {
    expect(shouldFire({ endAt: 9000, fired: false }, 5000)).toBe(false)
    expect(shouldFire({ endAt: null, fired: false }, 5000)).toBe(false)
  })
})
