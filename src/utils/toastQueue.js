// Bildirim kuyruğu. İşlem butonlu toast'lar (ör. "Geri al") başka bir toast tarafından kesilmez.

export const MAX_PENDING_TOASTS = 3
export const initialToastState = { current: null, queue: [] }

const hasAction = (toast) => typeof toast?.onAction === 'function'

function trimQueue(queue) {
  if (queue.length <= MAX_PENDING_TOASTS) return queue
  const dropAt = queue.findIndex((toast) => !hasAction(toast))
  return queue.filter((_, i) => i !== (dropAt === -1 ? 0 : dropAt))
}

export function toastReducer(state = initialToastState, action) {
  switch (action.type) {
    case 'push': {
      const { toast } = action
      if (!state.current) return { ...state, current: toast }
      // Butonsuz bir bilgi toast'ı, gelen işlem toast'ına yer açar (geri alma fırsatı hemen görünsün).
      if (!hasAction(state.current) && hasAction(toast)) return { ...state, current: toast }
      return { ...state, queue: trimQueue([...state.queue, toast]) }
    }
    case 'dismiss': {
      const [next = null, ...rest] = state.queue
      return { current: next, queue: rest }
    }
    case 'clear':
      return initialToastState
    default:
      return state
  }
}
