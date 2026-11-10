// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addExercise, addRoutine, db } from '../db'
import { readDraft, writeDraft } from '../utils/drafts'
import WorkoutView from './WorkoutView'

const yesterday = (h = 10) => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  d.setHours(h, 0, 0, 0)
  return d.getTime()
}

async function setup() {
  const routineId = await addRoutine('Push')
  const benchId = await addExercise({ name: 'Bench Press', routineId, equipmentType: 'machine', incrementStep: 2.5 })
  const flyId = await addExercise({ name: 'Fly', routineId, equipmentType: 'machine', incrementStep: 2.5 })
  await db.sets.bulkAdd([
    { workoutId: 1, exerciseId: benchId, setNumber: 1, weight: 60, reps: 8, rir: 2, timestamp: yesterday(), isWarmup: false },
  ])
  return { routineId, benchId, flyId }
}

async function renderView({ routineId, exerciseId }) {
  const [routines, exercises] = await Promise.all([db.routines.toArray(), db.exercises.toArray()])
  const props = {
    routines,
    exercises,
    routineId,
    exerciseId,
    onSelectRoutine: vi.fn(),
    onSelectExercise: vi.fn(),
    onOpenModal: vi.fn(),
    onError: vi.fn(),
    onSetSaved: vi.fn(),
    onSetDeleted: vi.fn(),
    onUpdateExercise: vi.fn(),
  }
  return { ...render(<WorkoutView {...props} />), props }
}

const weightInput = () => screen.getByLabelText('Ağırlık (kg)')
const warmupToggle = () => screen.getByRole('button', { name: /Isınma seti/ })

beforeEach(async () => {
  localStorage.clear()
  await db.delete()
  await db.open()
})
afterEach(() => cleanup())

describe('WorkoutView', () => {
  test('prefills from recommendation', async () => {
    const ids = await setup()
    await renderView({ routineId: ids.routineId, exerciseId: ids.benchId })
    await waitFor(() => expect(weightInput()).toHaveProperty('value', '62.5'))
    expect(screen.getByLabelText('Tekrar')).toHaveProperty('value', '6')
  })

  test('draft restores only for its exercise', async () => {
    const ids = await setup()
    writeDraft(ids.benchId, { weight: 70, reps: 5, rir: 1, isWarmup: false })
    const first = await renderView({ routineId: ids.routineId, exerciseId: ids.flyId })
    await waitFor(() => expect(screen.getByText(/İlk antrenman/)).toBeTruthy())
    // "İlk antrenman" yükleme bitmeden de görünür; ön-doldurmanın çalışmasını bekle.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(weightInput()).toHaveProperty('value', '')
    expect(screen.queryByText('Taslak geri yüklendi')).toBeNull()
    first.unmount()

    await renderView({ routineId: ids.routineId, exerciseId: ids.benchId })
    await waitFor(() => expect(weightInput()).toHaveProperty('value', '70'))
    expect(screen.getByText('Taslak geri yüklendi')).toBeTruthy()
  })

  test('cancel edit restores form', async () => {
    const user = userEvent.setup()
    const ids = await setup()
    await db.sets.add({ workoutId: 2, exerciseId: ids.benchId, setNumber: 1, weight: 80, reps: 3, rir: 0, timestamp: Date.now(), isWarmup: false })
    await renderView({ routineId: ids.routineId, exerciseId: ids.benchId })
    await waitFor(() => expect(weightInput()).toHaveProperty('value', '62.5'))

    await user.click(screen.getByRole('button', { name: 'Seti düzenle' }))
    expect(weightInput()).toHaveProperty('value', '80')
    await user.click(screen.getByRole('button', { name: 'Vazgeç' }))
    expect(weightInput()).toHaveProperty('value', '62.5')
  })

  test('warm-up toggle resets after new save', async () => {
    const user = userEvent.setup()
    const ids = await setup()
    const { props } = await renderView({ routineId: ids.routineId, exerciseId: ids.benchId })
    await waitFor(() => expect(weightInput()).toHaveProperty('value', '62.5'))

    await user.click(warmupToggle())
    expect(warmupToggle().getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Seti Kaydet' }))
    await waitFor(() => expect(props.onSetSaved).toHaveBeenCalled())
    expect(warmupToggle().getAttribute('aria-pressed')).toBe('false')
    const saved = await db.sets.where('exerciseId').equals(ids.benchId).last()
    expect(saved.isWarmup).toBe(true)
  })

  test('editing a warm-up then saving keeps next set working', async () => {
    const user = userEvent.setup()
    const ids = await setup()
    await db.sets.add({ workoutId: 2, exerciseId: ids.benchId, setNumber: 1, weight: 20, reps: 10, rir: 5, timestamp: Date.now(), isWarmup: true })
    await renderView({ routineId: ids.routineId, exerciseId: ids.benchId })
    await waitFor(() => expect(weightInput()).toHaveProperty('value', '62.5'))

    await user.click(screen.getByRole('button', { name: 'Seti düzenle' }))
    expect(warmupToggle().getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Seti Güncelle' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Seti Kaydet' })).toBeTruthy())
    expect(warmupToggle().getAttribute('aria-pressed')).toBe('false')

    await user.click(screen.getByRole('button', { name: 'Seti Kaydet' }))
    await waitFor(async () => expect(await db.sets.where('exerciseId').equals(ids.benchId).count()).toBe(3))
    const sets = await db.sets.where('exerciseId').equals(ids.benchId).sortBy('id')
    expect(sets.at(-1).isWarmup).toBe(false)
    expect(within(document.body).getAllByText('Isınma').length).toBeGreaterThan(0)
  })

  test('saving within the draft debounce leaves no draft behind', async () => {
    const user = userEvent.setup()
    const ids = await setup()
    const { props } = await renderView({ routineId: ids.routineId, exerciseId: ids.benchId })
    await waitFor(() => expect(weightInput()).toHaveProperty('value', '62.5'))
    await user.click(screen.getByRole('button', { name: 'Ağırlık (kg) artır' }))
    await user.click(screen.getByRole('button', { name: 'Seti Kaydet' }))
    await waitFor(() => expect(props.onSetSaved).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(readDraft(ids.benchId)).toBeNull()
  })

  test('updating an edited set leaves no draft behind', async () => {
    const user = userEvent.setup()
    const ids = await setup()
    await db.sets.add({ workoutId: 2, exerciseId: ids.benchId, setNumber: 1, weight: 80, reps: 3, rir: 0, timestamp: Date.now(), isWarmup: false })
    await renderView({ routineId: ids.routineId, exerciseId: ids.benchId })
    await waitFor(() => expect(weightInput()).toHaveProperty('value', '62.5'))
    await user.click(screen.getByRole('button', { name: 'Seti düzenle' }))
    await user.click(screen.getByRole('button', { name: 'Seti Güncelle' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Seti Kaydet' })).toBeTruthy())
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(readDraft(ids.benchId)).toBeNull()
  })
})
