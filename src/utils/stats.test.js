import { describe, expect, test } from 'vitest'
import {
  daySummary,
  dailyBest1RM,
  deloadWeight,
  filterRange,
  sessionBests,
  stallStatus,
  weekStart,
  weeklyMuscleSets,
} from './stats'

// 2026-11-09 Pazartesi. Ay indeksi 10 = Kasım.
const at = (d, h = 10, m = 0) => new Date(2026, 10, d, h, m).getTime()
const set = (exerciseId, weight, reps, timestamp, extra = {}) => ({
  exerciseId,
  weight,
  reps,
  rir: 2,
  timestamp,
  isWarmup: false,
  ...extra,
})

describe('weekStart', () => {
  test('weekStart boundaries', () => {
    expect(weekStart(at(15, 23, 59))).toBe(new Date(2026, 10, 9).getTime()) // Pazar → önceki Pazartesi
    expect(weekStart(at(16, 0, 0))).toBe(new Date(2026, 10, 16).getTime())
    expect(weekStart(at(11))).toBe(new Date(2026, 10, 9).getTime())
  })
})

describe('dailyBest1RM', () => {
  test('dailyBest1RM skips warmups and null estimates, keeps best per day ascending', () => {
    const points = dailyBest1RM([
      set(1, 100, 5, at(10)),
      set(1, 100, 8, at(10, 11)),
      set(1, 140, 3, at(10, 9), { isWarmup: true }),
      set(1, 0, 10, at(9)),
      set(1, 60, 15, at(9)),
      set(1, 90, 5, at(3)),
    ])
    expect(points).toEqual([
      { day: new Date(2026, 10, 3).getTime(), value: 101.3 },
      { day: new Date(2026, 10, 10).getTime(), value: 124.1 },
    ])
  })
})

describe('filterRange', () => {
  const points = [
    { day: new Date(2026, 5, 1).getTime(), value: 1 },
    { day: new Date(2026, 7, 10).getTime(), value: 2 },
    { day: new Date(2026, 10, 1).getTime(), value: 3 },
  ]
  test('filterRange 3m keeps last 3 calendar months', () => {
    expect(filterRange(points, '3m', at(9)).map((p) => p.value)).toEqual([2, 3])
  })
  test('filterRange 1m and all', () => {
    expect(filterRange(points, '1m', at(9)).map((p) => p.value)).toEqual([3])
    expect(filterRange(points, 'all', at(9))).toEqual(points)
  })
})

describe('weeklyMuscleSets', () => {
  test('weeklyMuscleSets counts this vs previous week', () => {
    const exercises = new Map([
      [1, { id: 1, targetMuscle: 'Chest' }],
      [2, { id: 2, targetMuscle: 'Back' }],
      [3, { id: 3 }],
    ])
    const rows = weeklyMuscleSets(
      [
        set(1, 60, 8, at(9, 0, 0)),
        set(1, 60, 8, at(10)),
        set(1, 20, 10, at(10), { isWarmup: true }),
        set(2, 50, 8, at(8, 23, 59)), // Pazar → geçen hafta
        set(2, 50, 8, at(3)), // geçen haftanın Salı'sı
        set(3, 10, 10, at(11)),
        set(1, 60, 8, at(1)), // iki hafta önce: sayılmaz
      ],
      exercises,
      at(11, 12),
    )
    expect(rows).toEqual([
      { muscle: 'Chest', count: 2, previous: 0 },
      { muscle: 'Genel', count: 1, previous: 0 },
      { muscle: 'Back', count: 0, previous: 2 },
    ])
  })
})

describe('stallStatus', () => {
  test('stalled when last 3 sessions never beat the earlier best', () => {
    expect(stallStatus([100, 102, 101, 102, 101])).toEqual({ stalled: true, sessions: 3 })
  })
  test('needs at least 4 sessions', () => {
    expect(stallStatus([100, 102, 103]).stalled).toBe(false)
  })
  test('a new best in the last 3 sessions is not a stall', () => {
    expect(stallStatus([100, 101, 100, 103]).stalled).toBe(false)
  })
})

describe('sessionBests', () => {
  test('one best 1RM per training day, oldest first, warmups excluded', () => {
    expect(
      sessionBests([set(1, 100, 1, at(10)), set(1, 90, 1, at(3)), set(1, 200, 1, at(3), { isWarmup: true })]),
    ).toEqual([90, 100])
  })
})

describe('deloadWeight', () => {
  test('deloadWeight rounds down to step', () => {
    expect(deloadWeight(62.5, 2.5)).toBe(55)
    expect(deloadWeight(21, 2)).toBe(18)
    expect(deloadWeight(1, 2.5)).toBe(0)
  })
})

describe('daySummary', () => {
  test('daySummary counts volume, sets, PRs and minutes', () => {
    const today = [
      set(1, 20, 10, at(9, 10, 0), { isWarmup: true }),
      set(1, 100, 5, at(9, 10, 10)),
      set(2, 50, 8, at(9, 10, 52)),
      set(3, 30, 10, at(9, 10, 40)),
    ]
    const prior = new Map([
      [1, 110],
      [2, 70],
    ]) // 3 numaralı hareketin önceki kaydı yok → rekor sayılmaz
    expect(daySummary(today, prior)).toEqual({
      volume: 1200,
      workingSets: 3,
      warmupSets: 1,
      prCount: 1,
      minutes: 52,
    })
  })
  test('empty day', () => {
    expect(daySummary([], new Map())).toEqual({ volume: 0, workingSets: 0, warmupSets: 0, prCount: 0, minutes: 0 })
  })
})

describe('exerciseStall', () => {
  test('uses sessions before the cutoff and deloads from the last working weight', async () => {
    const { exerciseStall } = await import('./stats')
    const sets = [
      set(1, 100, 5, at(1)),
      set(1, 102.5, 5, at(3)),
      set(1, 100, 5, at(5)),
      set(1, 102.5, 4, at(7)),
      set(1, 60, 5, at(8)),
      set(1, 100, 5, at(8, 11)),
      set(1, 40, 10, at(8, 9), { isWarmup: true }),
      set(1, 150, 5, at(9)), // bugün: kesimden sonra, sayılmaz
    ]
    // seans en iyileri: 112.5, 115.3, 112.5, 112.5(102.5x4≈112.5), 112.5 → son 3 öncekini geçmiyor
    expect(exerciseStall(sets, new Date(2026, 10, 9).getTime(), 2.5)).toEqual({ stalled: true, sessions: 3, deload: 90 })
  })
  test('not stalled → deload null', async () => {
    const { exerciseStall } = await import('./stats')
    expect(exerciseStall([set(1, 100, 5, at(1))], at(9), 2.5)).toEqual({ stalled: false, sessions: 0, deload: null })
  })
})

describe('dailyMaxWeight', () => {
  test('heaviest working weight per day, ascending; warmups and 0 kg skipped, high reps kept', async () => {
    const { dailyMaxWeight } = await import('./stats')
    const points = dailyMaxWeight([
      set(1, 100, 5, at(10)),
      set(1, 102.5, 15, at(10, 11)),
      set(1, 140, 3, at(10, 9), { isWarmup: true }),
      set(1, 0, 10, at(9)),
      set(1, 90, 5, at(3)),
    ])
    expect(points).toEqual([
      { day: new Date(2026, 10, 3).getTime(), value: 90 },
      { day: new Date(2026, 10, 10).getTime(), value: 102.5 },
    ])
  })
})
