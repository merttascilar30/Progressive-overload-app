import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { moveItem } from '../utils/reorder'

function Row({ exercise, index, count, disabled, onMove }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: exercise.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const iconBtn =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300 active:bg-slate-700 disabled:opacity-30'

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-2xl border bg-slate-950 p-2 ${
        isDragging ? 'relative z-10 border-emerald-500/60 shadow-lg' : 'border-slate-800'
      }`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label="Sürükle"
        {...attributes}
        {...listeners}
        className="flex h-10 w-10 shrink-0 touch-none items-center justify-center rounded-xl text-slate-400 active:bg-slate-800"
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="min-w-0 flex-1 truncate text-base font-semibold text-white">{exercise.name}</span>
      <button type="button" aria-label="Yukarı taşı" disabled={disabled || index === 0} onClick={() => onMove(index, index - 1)} className={iconBtn}>
        <ArrowUp className="h-5 w-5" />
      </button>
      <button type="button" aria-label="Aşağı taşı" disabled={disabled || index === count - 1} onClick={() => onMove(index, index + 1)} className={iconBtn}>
        <ArrowDown className="h-5 w-5" />
      </button>
    </li>
  )
}

export default function ReorderExercises({ routineName, exercises, onSave, onClose }) {
  const [items, setItems] = useState(exercises)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const savedRef = useRef(exercises)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function move(from, to) {
    if (busy) return
    const next = moveItem(items, from, to)
    if (next === items) return
    setItems(next)
    setError('')
    setBusy(true)
    try {
      await onSave(next.map((ex) => ex.id))
      savedRef.current = next
    } catch (err) {
      setItems(savedRef.current)
      setError(err?.message ?? 'Sıralama kaydedilemedi.')
    } finally {
      setBusy(false)
    }
  }

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    move(
      items.findIndex((ex) => ex.id === active.id),
      items.findIndex((ex) => ex.id === over.id),
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hareketleri sırala"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-white">Hareketleri sırala</h2>
            {routineName && <p className="truncate text-sm text-slate-400">{routineName}</p>}
          </div>
          <button
            type="button"
            aria-label="Kapat"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300 active:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <p role="alert" className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((ex) => ex.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {items.map((ex, index) => (
                  <Row key={ex.id} exercise={ex} index={index} count={items.length} disabled={busy} onMove={move} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 flex h-14 w-full items-center justify-center rounded-2xl bg-emerald-500 text-lg font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition-transform active:scale-[0.98]"
        >
          Bitti
        </button>
      </div>
    </div>
  )
}
