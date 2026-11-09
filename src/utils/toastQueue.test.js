import { describe, expect, test } from 'vitest'
import { initialToastState, toastReducer } from './toastQueue'

const undo = { id: 1, message: 'Set silindi', actionLabel: 'Geri al', onAction: () => {} }
const pr = (id = 2) => ({ id, message: `🏆 Yeni rekor! ${id}` })
const push = (state, toast) => toastReducer(state, { type: 'push', toast })

describe('toastReducer', () => {
  test('first toast becomes current', () => {
    expect(push(initialToastState, pr()).current.id).toBe(2)
  })

  test('PR waits behind an undo toast and shows after dismiss', () => {
    let state = push(initialToastState, undo)
    state = push(state, pr())
    expect(state.current.id).toBe(1)
    expect(state.queue.map((t) => t.id)).toEqual([2])
    state = toastReducer(state, { type: 'dismiss' })
    expect(state.current.id).toBe(2)
    expect(state.queue).toEqual([])
  })

  test('undo toast replaces a showing plain toast', () => {
    let state = push(initialToastState, pr())
    state = push(state, undo)
    expect(state.current.id).toBe(1)
    expect(state.queue).toEqual([])
  })

  test('queue keeps at most 3, dropping the oldest plain toast', () => {
    let state = push(initialToastState, undo)
    state = push(state, pr(2))
    state = push(state, { ...undo, id: 3 })
    state = push(state, pr(4))
    state = push(state, pr(5))
    expect(state.queue.map((t) => t.id)).toEqual([3, 4, 5])
  })

  test('clear empties everything', () => {
    let state = push(push(initialToastState, undo), pr())
    state = toastReducer(state, { type: 'clear' })
    expect(state).toEqual(initialToastState)
  })
})
