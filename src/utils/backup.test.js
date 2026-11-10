import { beforeEach, describe, expect, test } from 'vitest'
import { db, upsertCustomPoolItem } from '../db'
import { readBackupFile, restoreBackup } from './backup'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const fileOf = (payload) => ({ text: async () => JSON.stringify(payload) })

const baseData = {
  routines: [{ id: 1, name: 'Push' }],
  exercises: [{ id: 1, name: 'Bench Press', routineId: 1 }],
  workouts: [{ id: 1, date: '2026-11-09', name: 'Antrenman', isCompleted: false }],
  sets: [{ id: 1, workoutId: 1, exerciseId: 1, setNumber: 1, weight: 60, reps: 8, rir: 2, timestamp: 1 }],
}

describe('backup format 2', () => {
  test('restores format 1 backup without customPool', async () => {
    await upsertCustomPoolItem({ name: 'Old Custom', targetMuscle: 'Abs' })
    const { payload, counts } = await readBackupFile(fileOf({ app: 'overload', formatVersion: 1, data: baseData }))
    expect(counts.customPool).toBe(0)
    await restoreBackup(payload)
    expect(await db.customPool.count()).toBe(0)
    expect(await db.sets.count()).toBe(1)
    expect(await db.exercises.count()).toBe(1)
  })

  test('format 1 backup derives the personal pool from its exercises', async () => {
    const data = {
      ...baseData,
      exercises: [
        ...baseData.exercises,
        { id: 2, name: 'Hip Thrust', targetMuscle: 'Glutes', equipmentType: 'barbell', routineId: 1 },
        { id: 3, name: 'Lat Pulldown', targetMuscle: 'Back', routineId: 1 },
      ],
    }
    const { payload, counts } = await readBackupFile(fileOf({ app: 'overload', formatVersion: 1, data }))
    expect(counts.customPool).toBe(1)
    await restoreBackup(payload)
    expect((await db.customPool.toArray()).map((row) => row.name)).toEqual(['Hip Thrust'])
  })

  test('format 2 backup round-trips customPool', async () => {
    const data = { ...baseData, customPool: [{ id: 7, name: 'Cable Crunch', nameKey: 'cable crunch', targetMuscle: 'Abs' }] }
    const { payload, counts } = await readBackupFile(fileOf({ app: 'overload', formatVersion: 2, data }))
    expect(counts.customPool).toBe(1)
    await restoreBackup(payload)
    expect((await db.customPool.get(7)).name).toBe('Cable Crunch')
  })

  test('rejects newer format', async () => {
    await expect(readBackupFile(fileOf({ app: 'overload', formatVersion: 3, data: baseData }))).rejects.toThrow(
      'daha yeni',
    )
  })
})
