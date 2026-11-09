# Overload Spec 2 — İstatistik, Dayanıklılık ve Kişisel Havuz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** İstatistik sekmesi, durma/deload uyarısı, günün özeti, geçmişte sayfalama, taslak koruma, kalıcı sayaç, bildirim kuyruğu, kişisel hareket havuzu ve bileşen testleri.

**Architecture:** Tüm hesaplama saf modüllerde (`utils/stats.js`, `utils/drafts.js`, `utils/toastQueue.js`) TDD ile; veri erişimi `db.js` yardımcılarında (Dexie v5 yalnız `customPool` tablosu ekler); bileşenler yalnızca çizer. Grafik kütüphanesiz SVG.

**Tech Stack:** React 19, Vite 8, Tailwind 4, Dexie 4, lucide-react, Vitest + fake-indexeddb; yeni dev: `@testing-library/react`, `@testing-library/user-event`, `jsdom`.

**Spec:** `docs/superpowers/specs/2026-11-09-overload-istatistik-design.md`

## Global Constraints

- Arayüz metinleri Türkçe; slate-950 zemin, emerald-500 vurgu, amber uyarı; dokunma alanları ≥ h-10; `max-w-md` mobil kolon.
- Isınma setleri (`isWarmup`) tüm istatistiklerden hariç.
- Hafta: Pazartesi 00:00 yerel saat başlar; "bu hafta" = Pzt 00:00 → now, "geçen hafta" = önceki tam Pzt–Paz.
- Grafik aralıkları `'1m' | '3m' | '6m' | 'all'` (1/3/6 takvim ayı geriye), varsayılan `'3m'`; etiketler 1A / 3A / 6A / Tümü.
- Durma: seans en iyileri uzunluğu ≥ 4 ve son 3'ün maksimumu ≤ öncekilerin maksimumu.
- Deload: `floor(0.9 × w / step) × step`, ≥ 0, 2 ondalığa yuvarlı.
- Taslak anahtarı `overload:draft:{exerciseId}`, 6 saat geçerli, 400 ms gecikmeli yazım, düzenleme modunda yazılmaz.
- Sayaç anahtarı `overload:restTimer` `{ endAt, total, name }`.
- Toast kuyruğu en fazla 3 bekleyen; işlem butonlu toast kesilmez.
- Geçmiş sayfa boyu 30 gün.
- `customPool` şema `'++id, &nameKey'`; `nameKey` = mevcut `normalizeName(name)` (db.js) sonucu.
- Yedek `FORMAT_VERSION = 2`; format 1 kabul (customPool yoksa `[]`).
- Grafik boş durumu metni: "Grafik için en az iki gün kayıt gerekli."
- Durma uyarı metni: `{n} seanstır 1RM artmadı — deload düşün: {kg} kg`.
- Her görev sonunda `npm test`, `npm run lint`, `npm run build` geçer.

## Review Focus

1. **Pazar gecesi / Pazartesi sabahı sınırı** → Pazar 23:59 seti geçen haftaya, Pazartesi 00:00 seti bu haftaya sayılır. Test: Task 1 `weekStart boundaries`.
2. **Başka hareketin ya da süresi dolmuş taslağın uygulanması** → yalnız aynı `exerciseId` ve < 6 saat taslak uygulanır. Test: Task 2 `draft expiry and keying`; Task 9 `draft restores only for its exercise`.
3. **Format 1 yedeği ve v5 tohumlama** → `customPool`'suz yedek geri yüklenir; v5 tohumlama büyük/küçük harf varyantlarını tekilleştirir, sabit havuz adlarını almaz. Test: Task 3 `v5 seeds custom pool`, `restores format 1 backup`.
4. **Sayfalanmış geçmişte en eski günün rozeti** → tüm geçmiş yüklüyken gösterilen 1RM farkıyla aynı. Test: Task 3 `lastBestBefore`; Task 7 elle kontrol.
5. **Yeniden yüklemede süresi geçmiş sayaç** → uyarı çalmaz, kayıt silinir. Test: Task 5 `restoreRestTimer drops expired`.

---

### Task 1: İstatistik hesapları (`stats.js`)

**Files:** Create `src/utils/stats.js`, `src/utils/stats.test.js`

**Interfaces — Produces:**
- `weekStart(now: number) → number`
- `dailyBest1RM(sets) → { day: number, value: number }[]` (artan gün)
- `filterRange(points, range, now) → points`
- `weeklyMuscleSets(sets, exercisesById: Map<number, exercise>, now) → { muscle: string, count: number, previous: number }[]` (count azalan, eşitlikte muscle alfabetik; ikisi de 0 olan kas yok)
- `sessionBests(sets) → number[]` (gün başına en iyi 1RM, eskiden yeniye)
- `stallStatus(bests: number[]) → { stalled: boolean, sessions: number }` (`sessions` = son rekordan bu yana seans sayısı)
- `deloadWeight(workingWeight, incrementStep) → number`
- `daySummary(todaySets, priorBestByExercise: Map<number, number>) → { volume, workingSets, warmupSets, prCount, minutes }`

- [ ] **Step 1: Testleri yaz** (yerel tarih yapıcıları `new Date(2026, 10, 9, h, m)` ile; 2026-11-09 Pazartesi)

```js
test('weekStart boundaries', () => {
  expect(weekStart(new Date(2026, 10, 15, 23, 59).getTime())).toBe(new Date(2026, 10, 9).getTime()) // Pazar → önceki Pzt
  expect(weekStart(new Date(2026, 10, 16, 0, 0).getTime())).toBe(new Date(2026, 10, 16).getTime())
})
test('dailyBest1RM skips warmups and null estimates')     // 0 kg ve 15 tekrar atlanır; aynı günde en yüksek alınır
test('filterRange 3m keeps last 3 calendar months')
test('weeklyMuscleSets counts this vs previous week')       // Pazar seti previous'a; ısınma hariç; targetMuscle yok → 'Genel'
test('stallStatus', () => {
  expect(stallStatus([100, 102, 101, 102, 101])).toEqual({ stalled: true, sessions: 3 })
  expect(stallStatus([100, 102, 103]).stalled).toBe(false)   // < 4
  expect(stallStatus([100, 101, 100, 103]).stalled).toBe(false)
})
test('deloadWeight rounds down to step', () => {
  expect(deloadWeight(62.5, 2.5)).toBe(55)
  expect(deloadWeight(21, 2)).toBe(18)
  expect(deloadWeight(1, 2.5)).toBe(0)
})
test('daySummary', () => {/* 2 çalışma + 1 ısınma; biri önceki en iyiyi geçiyor → prCount 1; ilk kayıt sayılmaz; minutes = (son-ilk)/60000 yuvarlı; volume ısınma hariç */})
```

- [ ] **Step 2:** `npx vitest run src/utils/stats.test.js` → FAIL.
- [ ] **Step 3:** Uygula; `estimate1RM` ve `calculateVolumeLoad` (`progressionEngine.js`), `startOfDay` (`sessionSets.js`) yeniden kullanılır.
- [ ] **Step 4:** PASS; tüm suite + lint + build.
- [ ] **Step 5:** Commit `feat: istatistik hesapları`.

### Task 2: Taslak ve toast kuyruğu modülleri

**Files:** Create `src/utils/drafts.js`, `src/utils/drafts.test.js`, `src/utils/toastQueue.js`, `src/utils/toastQueue.test.js`

**Interfaces — Produces:**
- `readDraft(exerciseId, now = Date.now()) → { weight, reps, rir, isWarmup } | null` (süresi dolmuşsa siler, null)
- `writeDraft(exerciseId, values, now = Date.now())`, `clearDraft(exerciseId)`; `DRAFT_TTL_MS = 6 * 60 * 60 * 1000`
- `toastReducer(state = { current: null, queue: [] }, action) → state`; actions: `{ type: 'push', toast }`, `{ type: 'dismiss' }`, `{ type: 'clear' }`. `push`: current yoksa current olur; current varsa ve işlem butonsuzsa **ve** yeni toast işlem butonluysa yeni toast current olur, eski düşer; aksi halde kuyruğa eklenir. Kuyruk > 3 ise en eski işlem butonsuz öğe düşer. `dismiss`: kuyruğun başı current olur.

- [ ] **Step 1: Testler:** `draft expiry and keying` (6 saat − 1 ms geçerli, + 1 ms null ve silinmiş; farklı id null; localStorage yoksa/throw ederse null — `vi.stubGlobal`), `toastReducer` (Geri al ekrandayken rekor kuyruğa; dismiss sonrası rekor current; rekor ekrandayken Geri al gelirse Geri al current; 4. bekleyen en eski butonsuzu düşürür; clear).
- [ ] **Step 2:** FAIL → **Step 3:** uygula → **Step 4:** PASS + lint + build.
- [ ] **Step 5:** Commit `feat: taslak ve bildirim kuyruğu modülleri`.

### Task 3: Dexie v5, sorgular, kişisel havuz verisi, yedek format 2

**Files:** Modify `src/db.js`, `src/utils/backup.js`; Test `src/db.test.js`, `src/utils/backup.test.js` (yeni)

**Interfaces — Produces (db.js):**
- `getSetsSince(ts) → sets[]`, `getSetsBetween(from, to) → sets[]` (from ≤ timestamp < to), `oldestSetTimestamp() → number | null`
- `lastBestBefore(exerciseIds: number[], ts) → Map<exerciseId, number>` (ts'den önceki son antrenman gününün en iyi 1RM'i, ısınma hariç)
- `listCustomPool() → item[]` (ada göre sıralı), `upsertCustomPoolItem({ name, targetMuscle, equipmentType, incrementStep, repMin, repMax }) → id | null` (sabit havuz adıysa null), `removeCustomPoolItem(id)`
- v5: `customPool: '++id, &nameKey'` + upgrade tohumlama (exercises içinden adı `EXERCISE_POOL`'da olmayanlar, normalize tekil, ilk görülen ayarlarla).
- backup.js: `TABLES` + `'customPool'`, `FORMAT_VERSION = 2`; `readBackupFile` format ≤ 2 kabul, format 1'de `data.customPool ??= []`; sayımlarda customPool.

- [ ] **Step 1: Testler:** `v5 seeds custom pool` (v4 şemalı ham Dexie ile 'Hip Thrust', 'hip thrust ', 'Lat Pulldown' → havuzda yalnız 'Hip Thrust'), `upsert dedupes and skips static pool`, `remove does not touch exercises`, `getSetsBetween bounds`, `lastBestBefore` (ısınma hariç, ts'den önceki son gün), `restores format 1 backup` (customPool yok → boş tablo, diğer tablolar dolu), `export includes customPool`.
- [ ] **Step 2:** FAIL → **Step 3:** uygula (`EXERCISE_POOL` import'u `src/data/exercisePool.js`'ten; döngüsel import yok) → **Step 4:** PASS + lint + build.
- [ ] **Step 5:** Commit `feat: dexie v5 kişisel havuz, sayfalama sorguları, yedek format 2`.

### Task 4: Kişisel havuz arayüzü ve kas grubu seçimi

**Files:** Modify `src/components/ExercisePoolModal.jsx`, `src/App.jsx` (yalnız bağlama), `src/data/exercisePool.js` (export `MUSCLE_GROUPS`)

**Interfaces:**
- Consumes: Task 3 `listCustomPool`, `upsertCustomPoolItem`, `removeCustomPoolItem`.
- Produces: `MUSCLE_GROUPS: string[]` = havuzdaki benzersiz `muscle` değerleri (ilk görülme sırası) + `'Genel'` sonda.

- [ ] **Step 1:** Elle ekleme formuna "Kas grubu" `<select>` (varsayılan 'Genel'); `onAdd`'e `targetMuscle`.
- [ ] **Step 2:** Elle ekleme başarılı olduktan sonra (onAdd resolve) `upsertCustomPoolItem` çağrılır; hatası ekleme işlemini geri almaz, modal hatayı gösterir.
- [ ] **Step 3:** Modal açılınca `listCustomPool()`; boş değilse en üstte "Benim hareketlerim" kategorisi, öğeler havuz öğeleriyle aynı görünüm/davranış (`existingNames` → eklendi). Her öğede çöp kutusu (aria-label "Havuzdan kaldır") → satır içi "Havuzdan kaldırılsın mı?" Evet/Vazgeç → `removeCustomPoolItem` → liste yenilenir.
- [ ] **Step 4:** `npm test && npm run lint && npm run build`; elle (mobil): A gününde elle ekle → B gününde havuzda görünür → ekle → kaldır.
- [ ] **Step 5:** Commit `feat: kişisel hareket havuzu ve kas grubu seçimi`.

### Task 5: Toast kuyruğu ve kalıcı dinlenme sayacı

**Files:** Modify `src/App.jsx`, `src/hooks/useRestTimer.js`, `src/utils/settings.js`; Test `src/hooks/restTimer.test.js`

**Interfaces:**
- Consumes: Task 2 `toastReducer`.
- Produces: settings.js `saveRestTimer({ endAt, total, name } | null)`, `restoreRestTimer(now) → { endAt, total, name } | null` (süresi geçmişse siler, null). `useRestTimer` ilk state'i `restoreRestTimer(Date.now())`'dan alır; start/addSeconds/stop/fire'da kaydeder.

- [ ] **Step 1: Test:** `restoreRestTimer drops expired` (geçmiş endAt → null ve anahtar silinmiş; gelecek → aynı nesne; bozuk JSON → null).
- [ ] **Step 2:** FAIL → uygula → PASS.
- [ ] **Step 3:** App: `useReducer(toastReducer)`; `showToast` → push; Toast `onDismiss` → dismiss; `handleRestored` → clear; mevcut "Geri al ekrandaysa rekoru atla" geçici kodu kaldırılır (kuyruk çözer). Rekor ses/titreşimi değişmez.
- [ ] **Step 4:** lint + build; elle: sayaç sırasında sayfayı yenile → kalan süreden devam; süre dolmuşken yenile → çubuk yok, ses yok; sil → hemen rekor kır → önce Geri al, sonra rekor.
- [ ] **Step 5:** Commit `feat: bildirim kuyruğu ve kalıcı dinlenme sayacı`.

### Task 6: Antrenman ekranı — taslak, durma uyarısı, günün özeti

**Files:** Modify `src/components/WorkoutView.jsx`, `src/hooks/useExerciseData.js`; Create `src/components/DaySummaryCard.jsx`, `src/hooks/useTodaySummary.js`

**Interfaces:**
- Consumes: Task 1 `sessionBests`, `stallStatus`, `deloadWeight`, `daySummary`; Task 2 drafts; Task 3 `getSetsSince`, `lastBestBefore`.
- Produces: `useExerciseData` ek döndürür `stall: { stalled, sessions, deload: number | null }` (deload = `deloadWeight(son seans çalışma ağırlığı, incrementStep)`); `useTodaySummary(refreshKey) → summary | null` (bugün set yoksa null); `DaySummaryCard` props `{ summary }`.

- [ ] **Step 1:** Prefill: hareket değişince önce `readDraft(id)`; varsa form taslaktan, öneri kartının altında küçük "Taslak geri yüklendi" notu; yoksa mevcut öneri dolumu. Form değişince (düzenleme dışı) 400 ms gecikmeli `writeDraft`; başarılı yeni kayıtta `clearDraft`.
- [ ] **Step 2:** `stall.stalled` ise öneri kartı altında amber kutu, metin Global Constraints'teki gibi.
- [ ] **Step 3:** "Bugünkü Setler" altında `DaySummaryCard`: "Hacim {volume} kg · {workingSets} set (+{warmupSets} ısınma) · {prCount} rekor · {minutes} dk"; set kaydı/silme/geri alma sonrası yenilenir (mevcut reload/refreshToken yolları).
- [ ] **Step 4:** `npm test && npm run lint && npm run build`; elle: değer yaz → sayfayı yenile → değer geri gelir + not; 4 seanslık duran geçmiş tohumla → uyarı ve deload kg; özet sayıları elle hesapla doğrula.
- [ ] **Step 5:** Commit `feat: taslak koruma, durma uyarısı ve günün özeti`.

### Task 7: Geçmişte sayfalama

**Files:** Modify `src/components/HistoryView.jsx`

**Interfaces:** Consumes Task 3 `getSetsBetween`, `oldestSetTimestamp`, `lastBestBefore`.

- [ ] **Step 1:** State `windowStart` (başlangıç: bugünün gün başı − 29 gün). Yükleme: `getSetsBetween(windowStart, ∞)` + yüklü hareketler için `lastBestBefore(ids, windowStart)`; `groupSets` en eski günün farkını bu haritadan hesaplar.
- [ ] **Step 2:** Alta "Daha fazla göster" (h-12): `windowStart -= 30 gün`; `oldestSetTimestamp() >= windowStart` ise buton gizlenir. Düzenle/sil/geri al/refreshToken sonrası aynı pencereyle yeniden okunur.
- [ ] **Step 3:** lint + build; elle: 45 günlük tohum veri → ilk açılışta 30 gün; Daha fazla → tümü, buton kaybolur; en eski görünen günün rozeti tüm geçmiş yüklüyken aynı.
- [ ] **Step 4:** Commit `feat: geçmişte 30 günlük sayfalama`.

### Task 8: İstatistik sekmesi

**Files:** Create `src/components/StatsView.jsx`, `src/components/OneRMChart.jsx`, `src/components/MuscleWeekBars.jsx`; Modify `src/App.jsx` (3. sekme, `ChartLine` ikonu, başlık "İstatistik")

**Interfaces:**
- Consumes: Task 1 tüm fonksiyonlar; Task 3 `getSetsSince`.
- Produces: `StatsView` props `{ routines, exercises, selectedExerciseId, refreshToken }`; `OneRMChart` props `{ points: {day, value}[] }`; `MuscleWeekBars` props `{ rows }`.

- [ ] **Step 1:** StatsView: hareket `<select>` (`<optgroup>` gün adlarıyla, aktif gün + aktif hareket, `sortByOrder`), varsayılan `selectedExerciseId`; aralık çipleri; yükleme `getSetsSince(0)` bir kez + refreshToken'da; hata `role="alert"`.
- [ ] **Step 2:** OneRMChart: SVG `viewBox="0 0 320 180"`, `w-full`; 8px iç kenar; çizgi emerald, noktalar r=3; y min/max etiketleri, x ilk/son tarih (`tr-TR` "9 Kas"); başlık "Son {value} kg · {+/-fark} kg"; nokta dokunuşunda (button rolündeki görünmez geniş daire) seçili nokta etiketi; < 2 nokta boş durum metni.
- [ ] **Step 3:** MuscleWeekBars: başlık "Bu hafta · kas grupları", alt başlık "Pzt {tarih}'ten beri"; satır: kas adı, çubuk (genişlik = count / max), "{count}" ve fark (`+2` emerald / `−1` slate). Boş: "Bu hafta henüz set yok."
- [ ] **Step 4:** "Dikkat" listesi: tüm aktif hareketler için `stallStatus(sessionBests(...))`; satır "{ad} · {n} seanstır artmadı · deload {kg} kg"; dokununca o hareket seçilir. Yoksa bölüm gizli.
- [ ] **Step 5:** lint + build; elle (mobil): grafik ve aralıklar, nokta etiketi, çubuklar, Dikkat; üç sekme arasında geçişte Antrenman formu korunur.
- [ ] **Step 6:** Commit `feat: istatistik sekmesi`.

### Task 9: Bileşen testleri

**Files:** `package.json` (dev: `@testing-library/react`, `@testing-library/user-event`, `jsdom`); Create `src/components/WorkoutView.test.jsx`, `src/components/ExercisePoolModal.test.jsx`, `src/App.toast.test.jsx` (her biri `// @vitest-environment jsdom`)

- [ ] **Step 1:** WorkoutView (gerçek fake-indexeddb ile, `seedDatabase` + set ekleyerek): `prefills from recommendation`, `draft restores only for its exercise`, `cancel edit restores form`, `warm-up toggle resets after new save`, `editing a warm-up then saving keeps next set working`.
- [ ] **Step 2:** ExercisePoolModal: `manual add appears under Benim hareketlerim on reopen`, `remove asks for confirmation`.
- [ ] **Step 3:** App toast: sil → rekor kır → önce "Set silindi", dismiss sonrası "🏆 Yeni rekor!".
- [ ] **Step 4:** `npm test` (node + jsdom testleri birlikte) PASS, çıktı uyarısız; lint + build.
- [ ] **Step 5:** Commit `test: bileşen testleri`.

### Task 10: Son doğrulama

- [ ] **Step 1:** `npm test`, `npm run lint`, `npm run build` çıktıları.
- [ ] **Step 2:** Tarayıcı paneli, mobil: Spec §9 "Elle" listesindeki tüm akışlar PASS/FAIL tablosu; konsol temiz.
- [ ] **Step 3:** Bulunan sorunları düzelt, commit.
