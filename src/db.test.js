import Dexie from 'dexie'
import { beforeEach, describe, expect, test } from 'vitest'
import {
  addExercise,
  addSet,
  db,
  deleteSetAndRenumber,
  renameRoutine,
  reorderExercises,
  restoreSet,
  sortByOrder,
  updateExercise,
  withExerciseDefaults,
} from './db'
import { restoreBackup } from './utils/backup'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function exercisesOf(routineId) {
  return (await db.exercises.where('routineId').equals(routineId).toArray()).sort((a, b) => a.id - b.id)
}

describe('schema v4', () => {
  test('v4 assigns order = id to existing exercises', async () => {
    await db.delete()

    const legacy = new Dexie('overloadDB')
    legacy.version(3).stores({
      routines: '++id, name',
      exercises: '++id, name, targetMuscle, equipmentType, routineId',
      workouts: '++id, date, name, isCompleted',
      sets: '++id, workoutId, exerciseId, timestamp',
      meta: 'key',
    })
    await legacy.open()
    const routineId = await legacy.routines.add({ name: 'Push' })
    await legacy.exercises.bulkAdd([
      { name: 'Bench Press', routineId },
      { name: 'Dips', routineId },
      { name: 'Fly', routineId },
    ])
    legacy.close()

    await db.open()
    expect(db.verno).toBe(4)
    const rows = await exercisesOf(routineId)
    expect(rows).toHaveLength(3)
    for (const ex of rows) expect(ex.order).toBe(ex.id)
  })

  test('restore of legacy rows', async () => {
    await restoreBackup({
      data: {
        routines: [{ id: 1, name: 'Push' }],
        exercises: [
          { id: 3, name: 'Fly', routineId: 1 },
          { id: 1, name: 'Bench Press', routineId: 1 },
          { id: 2, name: 'Dips', routineId: 1 },
        ],
        workouts: [{ id: 1, date: '2026-01-01', name: 'Antrenman', isCompleted: false }],
        sets: [{ id: 1, workoutId: 1, exerciseId: 1, setNumber: 1, weight: 60, reps: 8, timestamp: 1 }],
      },
    })

    const rows = (await db.exercises.toArray()).map(withExerciseDefaults)
    const bench = rows.find((ex) => ex.id === 1)
    expect(bench).toMatchObject({
      repMin: 6,
      repMax: 8,
      restSeconds: null,
      note: '',
      order: 1,
      barWeight: 20,
    })
    expect(withExerciseDefaults({ id: 9, name: 'X' }).repMin).toBe(6)

    const raw = await db.exercises.toArray()
    expect([...raw].reverse().sort(sortByOrder).map((ex) => ex.id)).toEqual([1, 2, 3])
  })

  test('withExerciseDefaults keeps existing values', () => {
    const ex = withExerciseDefaults({ id: 4, repMin: 10, repMax: 15, restSeconds: 90, note: 'x', order: 0, barWeight: 15 })
    expect(ex).toMatchObject({ repMin: 10, repMax: 15, restSeconds: 90, note: 'x', order: 0, barWeight: 15 })
  })
})

describe('addSet', () => {
  test('addSet flags PR only above previous non-warmup best', async () => {
    const now = new Date(2026, 10, 9, 10, 0, 0)
    const at = (minutes) => new Date(now.getTime() + minutes * 60_000)

    const first = await addSet(1, { weight: 100, reps: 5, rir: 2 }, at(0))
    expect(first).toEqual({ id: expect.any(Number), isPR: false })

    const heavier = await addSet(1, { weight: 110, reps: 5, rir: 2 }, at(1))
    expect(heavier.isPR).toBe(true)

    const same = await addSet(1, { weight: 110, reps: 5, rir: 2 }, at(2))
    expect(same.isPR).toBe(false)

    const warmup = await addSet(1, { weight: 150, reps: 5, rir: 2, isWarmup: true }, at(3))
    expect(warmup.isPR).toBe(false)
    expect((await db.sets.get(warmup.id)).isWarmup).toBe(true)

    // Isınma seti en iyi değeri yükseltmez
    const afterWarmup = await addSet(1, { weight: 112.5, reps: 5, rir: 2 }, at(4))
    expect(afterWarmup.isPR).toBe(true)

    const zero = await addSet(1, { weight: 0, reps: 5, rir: 2 }, at(5))
    expect(zero.isPR).toBe(false)

    // Başka hareketin geçmişi etkilemez
    const other = await addSet(2, { weight: 20, reps: 5, rir: 2 }, at(6))
    expect(other.isPR).toBe(false)
  })
})

describe('updateExercise', () => {
  test('updateExercise rejects duplicate name in same routine', async () => {
    const benchId = await addExercise({ name: 'Bench Press', routineId: 1 })
    const dipsId = await addExercise({ name: 'Dips', routineId: 1 })
    await addExercise({ name: 'Squat', routineId: 2 })

    await expect(updateExercise(dipsId, { name: ' bench press ' })).rejects.toThrow(
      'Bu günde aynı isimde hareket var.',
    )
    // Başka gündeki aynı isim çakışma sayılmaz
    await expect(updateExercise(dipsId, { name: 'Squat' })).resolves.toBeUndefined()
    // Arşivlenmiş kayıt çakışma sayılmaz
    await db.exercises.update(benchId, { archived: true })
    await expect(updateExercise(dipsId, { name: 'Bench Press' })).resolves.toBeUndefined()
  })

  test('rename to own name in different case', async () => {
    const id = await addExercise({ name: 'bench press', routineId: 1 })
    await expect(updateExercise(id, { name: 'Bench Press' })).resolves.toBeUndefined()
    expect((await db.exercises.get(id)).name).toBe('Bench Press')
  })

  test('updateExercise rejects repMin > repMax', async () => {
    const id = await addExercise({ name: 'Bench Press', routineId: 1 })
    await expect(updateExercise(id, { repMin: 10, repMax: 8 })).rejects.toThrow()
    // Kayıtlı repMax (varsayılan 8) ile birleşince de geçersiz
    await expect(updateExercise(id, { repMin: 9 })).rejects.toThrow()
    await expect(updateExercise(id, { repMin: 0 })).rejects.toThrow()
    await expect(updateExercise(id, { repMax: 51 })).rejects.toThrow()

    await updateExercise(id, { repMin: 10, repMax: 15 })
    expect(await db.exercises.get(id)).toMatchObject({ repMin: 10, repMax: 15 })
  })

  test('updateExercise validates note, barWeight and restSeconds', async () => {
    const id = await addExercise({ name: 'Bench Press', routineId: 1 })
    await expect(updateExercise(id, { note: 'x'.repeat(201) })).rejects.toThrow()
    await expect(updateExercise(id, { barWeight: 12 })).rejects.toThrow()
    await expect(updateExercise(id, { restSeconds: -5 })).rejects.toThrow()

    await updateExercise(id, { note: 'x'.repeat(200), barWeight: 15, restSeconds: 120 })
    expect(await db.exercises.get(id)).toMatchObject({ barWeight: 15, restSeconds: 120 })
    await updateExercise(id, { restSeconds: null })
    expect((await db.exercises.get(id)).restSeconds).toBeNull()
  })
})

describe('routines and ordering', () => {
  test('renameRoutine rejects duplicate active routine name', async () => {
    const push = await db.routines.add({ name: 'Push' })
    const pull = await db.routines.add({ name: 'Pull' })
    const old = await db.routines.add({ name: 'Legs', archived: true })

    await expect(renameRoutine(pull, ' push ')).rejects.toThrow()
    await expect(renameRoutine(pull, '   ')).rejects.toThrow()
    await expect(renameRoutine(pull, 'Legs')).resolves.toBeUndefined()
    await expect(renameRoutine(push, 'PUSH')).resolves.toBeUndefined()
    expect((await db.routines.get(push)).name).toBe('PUSH')
    expect((await db.routines.get(old)).name).toBe('Legs')
  })

  test('addExercise appends order and stores rep range', async () => {
    const a = await addExercise({ name: 'A', routineId: 1 })
    const b = await addExercise({ name: 'B', routineId: 1, repMin: 10, repMax: 15 })
    const c = await addExercise({ name: 'C', routineId: 2 })
    expect((await db.exercises.get(a)).order).toBe(0)
    expect(await db.exercises.get(b)).toMatchObject({ order: 1, repMin: 10, repMax: 15 })
    expect((await db.exercises.get(c)).order).toBe(0)
  })

  test('addExercise prefers the active same-name record over an archived one', async () => {
    const archived = await db.exercises.add({ name: 'Row', routineId: 1, archived: true, order: 0 })
    const active = await db.exercises.add({ name: 'row', routineId: 1, order: 1 })

    expect(await addExercise({ name: ' ROW ', routineId: 1 })).toBe(active)
    expect((await db.exercises.get(archived)).archived).toBe(true)
    expect(await db.exercises.count()).toBe(2)
  })

  test('addExercise restores an archived record when no active one exists', async () => {
    const archived = await db.exercises.add({ name: 'Row', routineId: 1, archived: true, order: 0 })
    expect(await addExercise({ name: 'row', routineId: 1 })).toBe(archived)
    expect((await db.exercises.get(archived)).archived).toBe(false)
  })

  test('reorderExercises writes 0..n-1', async () => {
    const a = await addExercise({ name: 'A', routineId: 1 })
    const b = await addExercise({ name: 'B', routineId: 1 })
    const c = await addExercise({ name: 'C', routineId: 1 })

    await reorderExercises(1, [c, a, b])
    const rows = await exercisesOf(1)
    expect(Object.fromEntries(rows.map((ex) => [ex.id, ex.order]))).toEqual({ [c]: 0, [a]: 1, [b]: 2 })
    expect(rows.sort(sortByOrder).map((ex) => ex.id)).toEqual([c, a, b])
  })
})

describe('restoreSet', () => {
  test('restoreSet after a new set was added', async () => {
    const base = new Date(2026, 10, 9, 10, 0, 0).getTime()
    const at = (minutes) => new Date(base + minutes * 60_000)

    const s1 = (await addSet(1, { weight: 60, reps: 8, rir: 2 }, at(0))).id
    const s2 = (await addSet(1, { weight: 62.5, reps: 8, rir: 2 }, at(1))).id
    const s3 = (await addSet(1, { weight: 65, reps: 8, rir: 2 }, at(2))).id

    const deleted = await db.sets.get(s2)
    await deleteSetAndRenumber(s2)
    const s4 = (await addSet(1, { weight: 67.5, reps: 8, rir: 2 }, at(3))).id

    await restoreSet(deleted)

    const rows = (await db.sets.where('exerciseId').equals(1).toArray()).sort(
      (a, b) => a.setNumber - b.setNumber,
    )
    expect(rows.map((set) => set.setNumber)).toEqual([1, 2, 3, 4])
    expect(rows.map((set) => set.id)).toEqual([s1, s2, s3, s4])
    expect((await db.sets.get(s2)).weight).toBe(62.5)
  })
})
