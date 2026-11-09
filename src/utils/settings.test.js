import { test, expect } from 'vitest'
import { needsBackupReminder } from './settings'

const DAY = 24 * 60 * 60 * 1000
const now = Date.UTC(2026, 10, 9)

test('needsBackupReminder', () => {
  expect(needsBackupReminder({ lastBackupAt: null, hasSets: false, now })).toBe(false)
  expect(needsBackupReminder({ lastBackupAt: null, hasSets: true, now })).toBe(true)
  expect(needsBackupReminder({ lastBackupAt: now - 6 * DAY, hasSets: true, now })).toBe(false)
  expect(needsBackupReminder({ lastBackupAt: now - 8 * DAY, hasSets: true, now })).toBe(true)
})
