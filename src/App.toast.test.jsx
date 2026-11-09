// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, seedDatabase } from './db'
import App from './App'

beforeEach(async () => {
  localStorage.clear()
  await db.delete()
  await db.open()
  await seedDatabase()
  const bench = await db.exercises.where('name').equals('Bench Press').first()
  const d = new Date()
  d.setDate(d.getDate() - 1)
  d.setHours(10, 0, 0, 0)
  await db.sets.add({ workoutId: 99, exerciseId: bench.id, setNumber: 1, weight: 60, reps: 8, rir: 2, timestamp: d.getTime(), isWarmup: false })
})
afterEach(() => cleanup())

test('PR toast waits behind the undo toast and shows after it', async () => {
  const user = userEvent.setup()
  render(<App />)
  const weight = await screen.findByLabelText('Ağırlık (kg)')
  await waitFor(() => expect(weight).toHaveProperty('value', '62.5'))

  // 62.5 × 6 (tahmini 1RM 72.6) dünkü 60 × 8'i (74.5) geçmez: rekor yok.
  await user.click(screen.getByRole('button', { name: 'Seti Kaydet' }))
  await user.click(await screen.findByRole('button', { name: 'Seti sil' }))
  expect(await screen.findByText('Set silindi')).toBeTruthy()

  // Geri al ekrandayken rekor kır: rekor toast'ı kuyrukta bekler.
  await user.clear(weight)
  await user.type(weight, '80')
  await user.click(screen.getByRole('button', { name: 'Seti Kaydet' }))
  await waitFor(async () => expect(await db.sets.count()).toBe(2))
  expect(screen.getByText('Set silindi')).toBeTruthy()
  expect(screen.queryByText(/Yeni rekor/)).toBeNull()

  await user.click(screen.getByRole('button', { name: 'Geri al' }))
  expect(await screen.findByText(/🏆 Yeni rekor! Tahmini 1RM 92.9 kg/)).toBeTruthy()
})
