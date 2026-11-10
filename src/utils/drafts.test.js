import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { DRAFT_TTL_MS, clearAllDrafts, clearDraft, readDraft, writeDraft } from './drafts'

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    has: (k) => map.has(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

const values = { weight: 60, reps: 8, rir: 2, isWarmup: false }

describe('drafts', () => {
  let storage
  beforeEach(() => {
    storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
  })
  afterEach(() => vi.unstubAllGlobals())

  test('draft expiry and keying', () => {
    writeDraft(1, values, 1_000)
    expect(readDraft(1, 1_000 + DRAFT_TTL_MS - 1)).toEqual(values)
    expect(readDraft(2, 1_000)).toBeNull()
    expect(readDraft(1, 1_000 + DRAFT_TTL_MS + 1)).toBeNull()
    expect(storage.has('overload:draft:1')).toBe(false)
  })

  test('clearAllDrafts removes every draft and keeps other keys', () => {
    writeDraft(1, values, 1_000)
    writeDraft(2, values, 1_000)
    storage.setItem('overload:restSeconds', '90')
    clearAllDrafts()
    expect(readDraft(1, 1_000)).toBeNull()
    expect(readDraft(2, 1_000)).toBeNull()
    expect(storage.getItem('overload:restSeconds')).toBe('90')
  })

  test('clearDraft removes the draft', () => {
    writeDraft(3, values, 1_000)
    clearDraft(3)
    expect(readDraft(3, 1_000)).toBeNull()
  })

  test('broken JSON or throwing storage yields null', () => {
    storage.setItem('overload:draft:4', '{nope')
    expect(readDraft(4, 1_000)).toBeNull()
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readDraft(1, 1_000)).toBeNull()
    expect(() => writeDraft(1, values, 1_000)).not.toThrow()
  })
})
