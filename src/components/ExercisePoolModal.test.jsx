// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, listCustomPool } from '../db'
import ExercisePoolModal from './ExercisePoolModal'

beforeEach(async () => {
  await db.delete()
  await db.open()
})
afterEach(() => cleanup())

function renderModal(onAdd = vi.fn().mockResolvedValue(1)) {
  const onClose = vi.fn()
  render(<ExercisePoolModal routineName="Push" existingNames={[]} onAdd={onAdd} onClose={onClose} />)
  return { onAdd, onClose }
}

describe('ExercisePoolModal', () => {
  test('manual add appears under Benim hareketlerim on reopen', async () => {
    const user = userEvent.setup()
    const first = renderModal()
    expect(screen.queryByText('Benim hareketlerim')).toBeNull()

    await user.click(screen.getByRole('button', { name: /Manuel Ekle/ }))
    await user.type(screen.getByLabelText('Hareket adı'), 'Cable Crunch')
    await user.selectOptions(screen.getByLabelText('Kas grubu'), 'Chest')
    await user.click(screen.getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(first.onClose).toHaveBeenCalled())
    expect(first.onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cable Crunch', targetMuscle: 'Chest' }))
    cleanup()

    renderModal()
    await waitFor(() => expect(screen.getByText('Benim hareketlerim')).toBeTruthy())
    expect(screen.getByRole('button', { name: /Cable Crunch$/ })).toBeTruthy()
  })

  test('remove asks for confirmation', async () => {
    const user = userEvent.setup()
    await db.customPool.add({ name: 'Cable Crunch', nameKey: 'cable crunch', targetMuscle: 'Abs', equipmentType: 'cable', incrementStep: 2.5, repMin: 10, repMax: 15, createdAt: 1 })
    renderModal()
    await user.click(await screen.findByRole('button', { name: 'Cable Crunch havuzdan kaldır' }))
    expect(screen.getByText('Havuzdan kaldırılsın mı?')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Vazgeç' }))
    expect(await listCustomPool()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Cable Crunch havuzdan kaldır' }))
    await user.click(screen.getByRole('button', { name: 'Evet' }))
    await waitFor(() => expect(screen.queryByText('Benim hareketlerim')).toBeNull())
    expect(await listCustomPool()).toHaveLength(0)
  })
})
