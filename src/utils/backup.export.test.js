// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest'
import { db, upsertCustomPoolItem } from '../db'
import { exportBackup } from './backup'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

test('export includes customPool and format 2', async () => {
  await upsertCustomPoolItem({ name: 'Cable Crunch', targetMuscle: 'Abs' })
  let blob = null
  URL.createObjectURL = vi.fn((b) => {
    blob = b
    return 'blob:test'
  })
  URL.revokeObjectURL = vi.fn()
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

  const counts = await exportBackup()
  expect(counts.customPool).toBe(1)
  expect(click).toHaveBeenCalled()
  const payload = JSON.parse(await blob.text())
  expect(payload.formatVersion).toBe(2)
  expect(payload.data.customPool.map((row) => row.name)).toEqual(['Cable Crunch'])
})
