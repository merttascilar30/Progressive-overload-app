import { useEffect, useRef, useState } from 'react'
import { Download, Upload, X } from 'lucide-react'
import { exportBackup, readBackupFile, restoreBackup } from '../utils/backup'
import {
  REST_OPTIONS,
  getLastBackupAt,
  getRestAuto,
  getRestSeconds,
  markNotificationAsked,
  setRestAuto,
  setRestSeconds,
} from '../utils/settings'
import { notificationPermission, requestNotificationPermission } from '../utils/notify'

const NOTIFICATION_TEXT = {
  granted: 'İzin verildi',
  denied: 'Engellendi',
  default: 'Henüz sorulmadı',
  unsupported: 'Desteklenmiyor',
}

const formatDateTime = (value) => new Date(value).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })

const sectionTitle = 'mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400'
const actionButton =
  'flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 text-base font-bold text-white active:scale-[0.98] transition-transform disabled:opacity-50'

export default function SettingsSheet({ onClose, onRestored }) {
  const [lastBackupAt, setLastBackupAt] = useState(getLastBackupAt)
  const [restSeconds, setRestSecondsState] = useState(getRestSeconds)
  const [restAuto, setRestAutoState] = useState(getRestAuto)
  const [permission, setPermission] = useState(notificationPermission)
  const [pending, setPending] = useState(null) // { payload, exportedAt, counts }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleExport() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await exportBackup()
      setLastBackupAt(getLastBackupAt())
    } catch (err) {
      setError(err?.message ?? 'Yedek alınamadı.')
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // aynı dosya tekrar seçilebilsin
    if (!file) return
    setError('')
    try {
      setPending(await readBackupFile(file))
    } catch (err) {
      setPending(null)
      setError(err?.message ?? 'Dosya okunamadı.')
    }
  }

  async function handleRestore() {
    if (busy || !pending) return
    setBusy(true)
    setError('')
    try {
      await restoreBackup(pending.payload)
      await onRestored()
      onClose()
    } catch (err) {
      setError(err?.message ?? 'Geri yükleme başarısız oldu.')
      setBusy(false)
    }
  }

  function chooseRest(seconds) {
    setRestSeconds(seconds)
    setRestSecondsState(seconds)
  }

  function toggleAuto() {
    const next = !restAuto
    setRestAuto(next)
    setRestAutoState(next)
  }

  async function askPermission() {
    markNotificationAsked()
    setPermission(await requestNotificationPermission())
  }

  const exportedAt = pending?.exportedAt
  const exportedText = exportedAt && !Number.isNaN(exportedAt.getTime()) ? formatDateTime(exportedAt) : 'bilinmiyor'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ayarlar"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">Ayarlar</h2>
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

        {pending ? (
          <section className="space-y-3">
            <h3 className={sectionTitle}>Geri yüklemeyi onayla</h3>
            <p className="text-sm text-slate-300">Yedek tarihi: {exportedText}</p>
            <p className="text-sm text-slate-300">
              {pending.counts.routines} gün, {pending.counts.exercises} hareket, {pending.counts.workouts} antrenman, {pending.counts.sets} set
            </p>
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
              Mevcut tüm veri silinecek ve yedektekiyle değiştirilecek.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={handleRestore}
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-red-500 text-base font-bold text-white disabled:opacity-50"
            >
              Evet, geri yükle
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setPending(null); setError('') }}
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-slate-800 text-base font-bold text-slate-200"
            >
              Vazgeç
            </button>
          </section>
        ) : (
          <div className="space-y-6">
            <section>
              <h3 className={sectionTitle}>Yedekleme</h3>
              <p className="mb-3 text-sm text-slate-300">
                {lastBackupAt ? `Son yedek: ${formatDateTime(lastBackupAt)}` : 'Henüz yedek alınmadı'}
              </p>
              <div className="space-y-2">
                <button type="button" disabled={busy} onClick={handleExport} className={actionButton}>
                  <Download className="h-5 w-5" />
                  Yedek al
                </button>
                <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={actionButton}>
                  <Upload className="h-5 w-5" />
                  Yedekten geri yükle
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleFile}
                  className="hidden"
                  data-testid="backup-file-input"
                />
              </div>
            </section>

            <section>
              <h3 className={sectionTitle}>Dinlenme</h3>
              <div className="mb-3 grid grid-cols-3 gap-2" role="group" aria-label="Dinlenme süresi">
                {REST_OPTIONS.map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    aria-pressed={restSeconds === seconds}
                    onClick={() => chooseRest(seconds)}
                    className={`h-12 rounded-xl text-sm font-bold ${
                      restSeconds === seconds ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {seconds} sn
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-pressed={restAuto}
                onClick={toggleAuto}
                className="flex h-12 w-full items-center justify-between rounded-xl bg-slate-800 px-4 text-base font-semibold text-white"
              >
                Otomatik başlat
                <span className={`flex h-7 w-12 items-center rounded-full p-1 transition-colors ${restAuto ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                  <span className={`h-5 w-5 rounded-full bg-white transition-transform ${restAuto ? 'translate-x-5' : ''}`} />
                </span>
              </button>
            </section>

            <section>
              <h3 className={sectionTitle}>Bildirimler</h3>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-300">{NOTIFICATION_TEXT[permission] ?? NOTIFICATION_TEXT.unsupported}</p>
                {permission === 'default' && (
                  <button
                    type="button"
                    onClick={askPermission}
                    className="h-10 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950"
                  >
                    İzin ver
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-500">iPhone'da bildirimler yalnızca ana ekrana eklenmiş uygulamada çalışır.</p>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
