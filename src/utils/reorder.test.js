import { describe, expect, it } from 'vitest'
import { moveItem } from './reorder'

describe('moveItem', () => {
  const ids = [1, 2, 3, 4]
  it('bir yukarı taşır', () => expect(moveItem(ids, 2, 1)).toEqual([1, 3, 2, 4]))
  it('bir aşağı taşır', () => expect(moveItem(ids, 1, 2)).toEqual([1, 3, 2, 4]))
  it('uçlara taşır', () => {
    expect(moveItem(ids, 0, 3)).toEqual([2, 3, 4, 1])
    expect(moveItem(ids, 3, 0)).toEqual([4, 1, 2, 3])
  })
  it('birkaç konum sürüklemeyi destekler', () => expect(moveItem(ids, 0, 2)).toEqual([2, 3, 1, 4]))
  it('geçersiz veya aynı konumda aynı diziyi döndürür', () => {
    expect(moveItem(ids, 1, 1)).toBe(ids)
    expect(moveItem(ids, -1, 2)).toBe(ids)
    expect(moveItem(ids, 0, 4)).toBe(ids)
  })
  it('girdiyi değiştirmez', () => {
    moveItem(ids, 0, 3)
    expect(ids).toEqual([1, 2, 3, 4])
  })
})
