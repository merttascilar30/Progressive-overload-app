import { db } from '../db'
import { markBackupNow } from './settings'

const TABLES = ['routines', 'exercises', 'workouts', 'sets', 'customPool']
// Format 1 yedeklerde bu tablolar yoktu; okunurken boş dizi kabul edilir.
const OPTIONAL_TABLES = ['customPool']
const FORMAT_VERSION = 2

function dateStamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function countRecords(data) {
  return Object.fromEntries(TABLES.map((table) => [table, data[table].length]))
}

/** Tüm veritabanını JSON dosyası olarak indirir. */
export async function exportBackup() {
  const data = {}
  await db.transaction('r', TABLES.map((table) => db.table(table)), async () => {
    for (const table of TABLES) data[table] = await db.table(table).toArray()
  })

  const payload = {
    app: 'overload',
    formatVersion: FORMAT_VERSION,
    dbVersion: db.verno,
    exportedAt: new Date().toISOString(),
    data,
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `overload-yedek-${dateStamp()}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Bazı mobil tarayıcılar indirmeyi gecikmeli başlatır; URL'yi hemen iptal etme.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)

  markBackupNow()
  return countRecords(data)
}

/**
 * Yedek dosyasını okur ve doğrular. Veritabanına dokunmaz.
 * Hatalı dosyada kullanıcıya gösterilecek Türkçe bir mesajla hata fırlatır.
 */
export async function readBackupFile(file) {
  let payload
  try {
    payload = JSON.parse(await file.text())
  } catch {
    throw new Error('Dosya geçerli bir JSON değil.')
  }

  if (payload?.app !== 'overload' || typeof payload.data !== 'object' || payload.data === null) {
    throw new Error('Bu dosya bir Overload yedeği değil.')
  }
  if (Number(payload.formatVersion) > FORMAT_VERSION) {
    throw new Error('Bu yedek uygulamanın daha yeni bir sürümüyle alınmış.')
  }
  for (const table of OPTIONAL_TABLES) payload.data[table] ??= []
  for (const table of TABLES) {
    const rows = payload.data[table]
    if (!Array.isArray(rows)) throw new Error(`Yedekte "${table}" tablosu eksik.`)
    if (!rows.every((row) => row && typeof row === 'object' && Number.isInteger(row.id))) {
      throw new Error(`Yedekteki "${table}" kayıtları bozuk.`)
    }
  }

  return {
    payload,
    exportedAt: payload.exportedAt ? new Date(payload.exportedAt) : null,
    counts: countRecords(payload.data),
  }
}

/**
 * Mevcut tüm veriyi yedektekiyle değiştirir. Tek transaction içinde çalışır:
 * herhangi bir adım başarısız olursa hiçbir şey silinmez.
 */
export async function restoreBackup(payload) {
  await db.transaction('rw', TABLES.map((table) => db.table(table)), async () => {
    for (const table of TABLES) {
      await db.table(table).clear()
      await db.table(table).bulkAdd(payload.data[table] ?? [])
    }
  })
}
