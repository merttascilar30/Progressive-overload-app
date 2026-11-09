import { useCallback, useEffect, useRef, useState } from 'react'
import { beep, showNotification, vibrate } from '../utils/notify'

export function remainingSeconds(endAt, now) {
  return Math.max(0, Math.ceil((endAt - now) / 1000))
}

export function shouldFire(state, now) {
  return state.endAt != null && !state.fired && now >= state.endAt
}

// Dinlenme sayacı. Bitiş zamanı (endAt) saklanır; arka planda interval durdurulsa bile
// sekmeye dönünce gerçek süre yeniden hesaplanır.
export default function useRestTimer() {
  const [timer, setTimer] = useState(null) // { endAt, totalSeconds, name }
  const [now, setNow] = useState(() => Date.now())
  const firedRef = useRef(false)
  const timerRef = useRef(null)
  useEffect(() => {
    timerRef.current = timer
  }, [timer])

  const tick = useCallback(() => {
    const current = timerRef.current
    const time = Date.now()
    if (current && shouldFire({ endAt: current.endAt, fired: firedRef.current }, time)) {
      firedRef.current = true
      beep()
      vibrate([200, 100, 200])
      if (document.hidden) showNotification('Dinlenme bitti', { body: current.name })
      timerRef.current = null
      setTimer(null)
      return
    }
    setNow(time)
  }, [])

  const running = timer != null
  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [running, tick])

  const start = useCallback((seconds, name = '') => {
    const time = Date.now()
    firedRef.current = false
    setNow(time)
    setTimer({ endAt: time + seconds * 1000, totalSeconds: seconds, name })
  }, [])

  const addSeconds = useCallback((n) => {
    setTimer((prev) => (prev ? { ...prev, endAt: prev.endAt + n * 1000, totalSeconds: prev.totalSeconds + n } : prev))
  }, [])

  const stop = useCallback(() => {
    firedRef.current = true
    timerRef.current = null
    setTimer(null)
  }, [])

  return {
    endAt: timer?.endAt ?? null,
    totalSeconds: timer?.totalSeconds ?? 0,
    remaining: timer ? remainingSeconds(timer.endAt, now) : 0,
    start,
    addSeconds,
    stop,
  }
}
