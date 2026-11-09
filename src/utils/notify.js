// Dinlenme sayacı ve rekor bildirimi için ses, titreşim ve sistem bildirimi yardımcıları.

let audioCtx = null

/**
 * Tarayıcılar sesi ancak bir kullanıcı dokunuşundan sonra açar.
 * Bu fonksiyon "Seti Kaydet" gibi bir tıklamanın içinde çağrılmalıdır.
 */
export function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    audioCtx ??= new Ctx()
    if (audioCtx.state === 'suspended') audioCtx.resume()
  } catch {
    // Ses desteklenmiyorsa sessizce devam et.
  }
}

// Kısa "bip" dizisi. offsets: saniye cinsinden her bipin başlangıcı.
export function beep(offsets = [0, 0.3, 0.6], frequency = 880) {
  if (!audioCtx) return
  try {
    const start = audioCtx.currentTime
    for (const offset of offsets) {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start + offset)
      gain.gain.exponentialRampToValueAtTime(0.35, start + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.2)
      osc.connect(gain).connect(audioCtx.destination)
      osc.start(start + offset)
      osc.stop(start + offset + 0.22)
    }
  } catch {
    // yoksay
  }
}

export function vibrate(pattern) {
  // Chrome, sayfaya hiç dokunulmadan yapılan çağrıyı engeller ve konsola hata yazar.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // iOS Safari titreşimi desteklemez.
  }
}

export function notificationPermission() {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

/**
 * Ekran kilitliyken / uygulama arka plandayken sistem bildirimi gösterir.
 * Android'de `new Notification()` desteklenmediği için önce service worker denenir.
 */
export async function showNotification(title, options = {}) {
  if (notificationPermission() !== 'granted') return
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    if (registration) {
      await registration.showNotification(title, { icon: '/pwa-192x192.png', ...options })
      return
    }
  } catch {
    // aşağıdaki yedek yolu dene
  }
  try {
    new Notification(title, options)
  } catch {
    // yoksay
  }
}
