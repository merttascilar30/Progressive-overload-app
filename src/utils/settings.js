// Cihaza özel küçük tercihler. Antrenman verisi değil, o yüzden IndexedDB yerine localStorage.

const KEYS = {
  restSeconds: 'overload:restSeconds',
  restAuto: 'overload:restAuto',
  notifAsked: 'overload:notifAsked',
  lastBackupAt: 'overload:lastBackupAt',
}

export const REST_OPTIONS = [60, 90, 120, 150, 180, 240]
const DEFAULT_REST_SECONDS = 120

function read(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Gizli sekme / kota dolu: tercih kaydedilemezse uygulama yine çalışır.
  }
}

export function getRestSeconds() {
  const value = Number(read(KEYS.restSeconds))
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_REST_SECONDS
}

export function setRestSeconds(seconds) {
  write(KEYS.restSeconds, seconds)
}

export function getRestAuto() {
  return read(KEYS.restAuto) !== 'false'
}

export function setRestAuto(enabled) {
  write(KEYS.restAuto, enabled ? 'true' : 'false')
}

export function wasNotificationAsked() {
  return read(KEYS.notifAsked) === 'true'
}

export function markNotificationAsked() {
  write(KEYS.notifAsked, 'true')
}

export function getLastBackupAt() {
  const value = Number(read(KEYS.lastBackupAt))
  return Number.isFinite(value) && value > 0 ? value : null
}

export function markBackupNow() {
  write(KEYS.lastBackupAt, Date.now())
}
