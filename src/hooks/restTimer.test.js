import { describe, expect, it, vi } from 'vitest'
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

describe('persisted rest timer', () => {
  function memoryStorage() {
    const map = new Map()
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
      has: (k) => map.has(k),
    }
  }

  it('restoreRestTimer drops expired', async () => {
    const { saveRestTimer, restoreRestTimer } = await import('../utils/settings')
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    try {
      saveRestTimer({ endAt: 10_000, total: 90, name: 'Squat' })
      expect(restoreRestTimer(5_000)).toEqual({ endAt: 10_000, total: 90, name: 'Squat' })
      expect(restoreRestTimer(10_000)).toBeNull()
      expect(storage.has('overload:restTimer')).toBe(false)

      saveRestTimer({ endAt: 20_000, total: 60, name: 'Row' })
      saveRestTimer(null)
      expect(restoreRestTimer(1_000)).toBeNull()

      storage.setItem('overload:restTimer', '{bozuk')
      expect(restoreRestTimer(1_000)).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
