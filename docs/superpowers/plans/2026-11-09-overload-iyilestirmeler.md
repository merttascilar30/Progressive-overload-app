# Overload İyileştirmeler (Spec 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kod incelemesindeki 4 sorun grubunu düzeltmek ve salon özelliklerini (A grubu) eklemek.

**Architecture:** Önce test altyapısı ve saf mantık (öneri motoru, plaka, DB yardımcıları) TDD ile;
sonra `App.jsx` hook + bileşenlere bölünür ve yeni UI bu yapı üstüne eklenir. Veri IndexedDB'de
(Dexie v4), cihaz tercihleri localStorage'da (`utils/settings.js`) kalır.

**Tech Stack:** React 19, Vite 8, Tailwind 4, Dexie 4, lucide-react, Vitest, fake-indexeddb,
@dnd-kit/core + @dnd-kit/sortable, vite-plugin-pwa, @vite-pwa/assets-generator.

**Spec:** `docs/superpowers/specs/2026-11-09-overload-iyilestirmeler-design.md`

## Global Constraints

- Arayüz metinleri Türkçe; mevcut stil: slate-950 arka plan, emerald-500 vurgu, büyük dokunma alanları (≥ h-10, ana butonlar h-14/h-16).
- Mobil öncelikli, `max-w-md` kolon; yeni bileşenler mevcut Tailwind sınıf desenini izler.
- Eksik alan varsayılanları: `repMin=6`, `repMax=8`, `restSeconds=null`, `note=''`, `order=id`, `barWeight=20`, `isWarmup=false`.
- `DEFAULT_RIR = 2` tek kaynaktan (`progressionEngine.js`).
- Bar seçenekleri `[20, 15, 10]`; plakalar `[25, 20, 15, 10, 5, 2.5, 1.25]`.
- Tekrar aralığı sınırları 1–50, `repMin ≤ repMax`. Not en fazla 200 karakter.
- Havuz aralıkları: bileşik 6–8, izolasyon 10–15, calf 12–20.
- Dinlenme seçenekleri `REST_OPTIONS` (`utils/settings.js`); "+30 sn" butonu; bitişte `vibrate([200,100,200])`.
- Yedek hatırlatma noktası: en az bir set var VE (hiç yedek yok VEYA son yedek > 7 gün).
- Undo toast süresi 5 sn. dnd-kit dokunmatik sensör gecikmesi 150 ms.
- Her görev sonunda `npm test`, `npm run lint` (yeni hata yok), `npm run build` geçer.

## Review Focus

1. **Eski yedeği geri yükleme** (v3 şekli, yeni alanlar yok) → uygulama varsayılanlarla çalışır, sıralama `id`'ye düşer. Test: Task 3 `restore of legacy rows`.
2. **Geri al, araya yeni set girdikten sonra** → silinen set eski sırasına döner, numaralar 1..n kalır. Test: Task 3 `restoreSet after a new set was added`.
3. **Sayaç, sekme süreden uzun süre gizli kaldığında** → 0'da durur, bitiş uyarısı bir kez tetiklenir. Test: Task 9 `fires once when overdue`.
4. **Plaka ızgarasına uymayan veya bar altı ağırlık** (61 kg, 15 kg bar 20) → kalan not / gösterilmez. Test: Task 2 `platesPerSide` vakaları.
5. **Kendi adını büyük/küçük harf farkıyla yeniden adlandırma** ("bench press" → "Bench Press") → izin verilir (kendisi hariç tutulur). Test: Task 3 `rename to own name in different case`.

---

### Task 1: Test altyapısı ve temizlik

**Files:**
- Modify: `package.json` (devDeps: `vitest`, `fake-indexeddb`; script `"test": "vitest run"`)
- Modify: `vite.config.js` (`test: { environment: 'node', setupFiles: ['./src/test/setup.js'] }`)
- Create: `src/test/setup.js` (`import 'fake-indexeddb/auto'`)
- Create: `src/data/exercisePool.js` (`EXERCISE_POOL`, `EQUIPMENT_TYPES` taşınır)
- Modify: `src/components/ExercisePoolModal.jsx` (yeni yerden import)
- Modify: `src/components/HistoryView.jsx:110-125` (effect uyarıları)
- Delete: `src/App.css`, `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`
- Modify: `README.md`, `rules.md` (React 19)
- Test: `src/utils/progressionEngine.test.js`

**Interfaces:**
- Produces: `npm test`; `src/data/exercisePool.js` exports `EXERCISE_POOL`, `EQUIPMENT_TYPES`.

- [ ] **Step 1:** `npm i -D vitest fake-indexeddb`; config ve setup dosyalarını ekle.
- [ ] **Step 2: Duman testi yaz**

```js
test('calculate1RM uses Brzycki', () => {
  expect(calculate1RM(100, 1)).toBe(100)
  expect(calculate1RM(100, 8)).toBeCloseTo(124.14, 2)
})
test('parseSetInput rejects blanks', () => {
  expect(parseSetInput({ weight: '', reps: 8, rir: 2 }).error).toBeTruthy()
})
```

- [ ] **Step 3:** `npm test` → PASS.
- [ ] **Step 4:** Havuzu taşı, şablon dosyalarını sil, HistoryView effect'inde `const ref = requestRef` yerel kopya ile cleanup; README (amaç, `npm run dev/test/build`, özellik listesi) ve rules.md güncelle.
- [ ] **Step 5:** `npm run lint` → `only-export-components` ve HistoryView uyarıları yok; `npm run build` geçer.
- [ ] **Step 6:** Commit `chore: vitest altyapısı ve şablon temizliği`.

### Task 2: Öneri motoru ve plaka hesaplayıcı

**Files:**
- Modify: `src/utils/progressionEngine.js`
- Create: `src/utils/plates.js`
- Test: `src/utils/progressionEngine.test.js`, `src/utils/plates.test.js`

**Interfaces:**
- Produces:
  - `export const DEFAULT_RIR = 2`
  - `getSetRecommendation(previousSets, { incrementStep = 2.5, repRange = { min: 6, max: 8 }, bodyweight = false } = {}) → { weight: number|null, reps: number|null, message: string }`
  - `calculateVolumeLoad(sets)` ısınma setlerini (`isWarmup`) atlar.
  - `platesPerSide(total: number, bar: number) → { plates: number[], remainder: number } | null` (`total < bar` ise `null`).

- [ ] **Step 1: Başarısız testleri yaz**

```js
const s = (weight, reps, rir = 2, isWarmup = false) => ({ weight, reps, rir, isWarmup })
test('first session', () => {
  expect(getSetRecommendation([])).toMatchObject({ weight: null, reps: null })
})
test('top of range → +1 step', () => {
  expect(getSetRecommendation([s(60, 8), s(60, 7)])).toMatchObject({ weight: 62.5, reps: 6 })
})
test('very easy → +2 steps', () => {
  expect(getSetRecommendation([s(60, 8, 4)])).toMatchObject({ weight: 65, reps: 6 })
})
test('below range → -1 step', () => {
  expect(getSetRecommendation([s(60, 5)])).toMatchObject({ weight: 57.5, reps: 6 })
})
test('in range → add reps at same weight', () => {
  expect(getSetRecommendation([s(60, 6, 3)])).toMatchObject({ weight: 60, reps: 8 })
})
test('warmups ignored', () => {
  expect(getSetRecommendation([s(100, 3, 5, true), s(60, 7)])).toMatchObject({ weight: 60, reps: 8 })
})
test('custom range 10–15', () => {
  expect(getSetRecommendation([s(10, 15)], { incrementStep: 1, repRange: { min: 10, max: 15 } }))
    .toMatchObject({ weight: 11, reps: 10 })
})
test('bodyweight only adds reps', () => {
  expect(getSetRecommendation([s(0, 10)], { bodyweight: true, repRange: { min: 8, max: 12 } }))
    .toMatchObject({ weight: 0, reps: 11 })
})
test('volume skips warmups', () => {
  expect(calculateVolumeLoad([s(20, 10, 2, true), s(60, 8)])).toBe(480)
})
// plates.test.js
test('plates', () => {
  expect(platesPerSide(62.5, 20)).toEqual({ plates: [20, 1.25], remainder: 0 })
  expect(platesPerSide(100, 20)).toEqual({ plates: [25, 15], remainder: 0 })
  expect(platesPerSide(61, 20)).toEqual({ plates: [20], remainder: 1 })
  expect(platesPerSide(40, 10)).toEqual({ plates: [15], remainder: 0 })
  expect(platesPerSide(20, 20)).toEqual({ plates: [], remainder: 0 })
  expect(platesPerSide(15, 20)).toBeNull()
})
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Uygula. Mevcut karar mantığı korunur, yalnız dönüş nesneye çevrilir; mesaj metinleri mevcutlarla aynı kalır. Vücut ağırlığında tavana ulaşınca `{ weight: 0, reps: max, message: 'Tavana ulaştın: hareketi zorlaştır veya ağırlık ekle.' }`. `remainder` = toplam − bar − 2×Σplakalar, bölü 2 değil **toplam kg** olarak (61 → 1). Greedy, en büyük plakadan.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: yapılandırılmış öneri, ısınma filtresi ve plaka hesaplayıcı`.

### Task 3: Dexie v4 ve veri yardımcıları

**Files:**
- Modify: `src/db.js`
- Test: `src/db.test.js` (her testten önce `await db.delete(); await db.open()`)

**Interfaces:**
- Consumes: `estimate1RM` (progressionEngine).
- Produces (hepsi `db.js`):
  - `withExerciseDefaults(ex) → ex` (eksik alanları Global Constraints'teki varsayılanlarla doldurur)
  - `sortByOrder(a, b)` (`(a.order ?? a.id) - (b.order ?? b.id)`)
  - `addSet(exerciseId, value, now?) → { id: number, isPR: boolean }` (`value.isWarmup` desteklenir)
  - `renameRoutine(id, name) → Promise<void>`
  - `updateExercise(id, patch) → Promise<void>` (`name`, `repMin`, `repMax`, `restSeconds`, `note`, `barWeight`)
  - `reorderExercises(routineId, orderedIds: number[]) → Promise<void>`
  - `restoreSet(set) → Promise<void>`
  - `addExercise({..., repMin, repMax})` → `order` = gündeki max+1

- [ ] **Step 1: Başarısız testleri yaz**

```js
test('v4 assigns order = id to existing exercises')        // v3 şemasıyla kayıt ekle, v4 aç, order === id
test('restore of legacy rows')                             // restoreBackup ile alan eksik satırlar → withExerciseDefaults({...}).repMin === 6, sortByOrder id'ye düşer
test('addSet flags PR only above previous non-warmup best') // 1. set isPR=false; daha ağır set isPR=true; ısınma seti isPR=false; 0 kg isPR=false
test('updateExercise rejects duplicate name in same routine') // rejects.toThrow('Bu günde aynı isimde hareket var.')
test('rename to own name in different case')                // resolves
test('updateExercise rejects repMin > repMax')
test('renameRoutine rejects duplicate active routine name')
test('reorderExercises writes 0..n-1')
test('restoreSet after a new set was added')                // sil set#2, yeni set ekle, restore → setNumber sırası [1,2,3,4] ve geri gelen 2 numarada
```

- [ ] **Step 2:** `npm test src/db.test.js` → FAIL.
- [ ] **Step 3:** Uygula. `db.version(4).stores({...v3 aynı})` + `.upgrade(tx => tx.table('exercises').toCollection().modify(ex => { ex.order ??= ex.id }))`. `restoreSet`: `put(set)` sonra kardeşleri `setNumber`, sonra `timestamp`'e göre sırala; eşit `setNumber`'da geri yüklenen set önce gelir; 1..n yaz. İsim karşılaştırması mevcut `normalizeName` ile, `archived` olanlar hariç, kendisi hariç.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: dexie v4, isim çakışma kontrolü, sıralama ve set geri yükleme`.

### Task 4: Havuz aralıkları ve elle eklemede aralık seçimi

**Files:**
- Modify: `src/data/exercisePool.js` (her öğeye `repMin`, `repMax`)
- Modify: `src/components/ExercisePoolModal.jsx` (elle ekleme formuna aralık seçimi; `onAdd`'e `repMin/repMax`)
- Test: `src/data/exercisePool.test.js`

**Interfaces:**
- Produces: havuz öğesi `{ name, muscle, equipmentType, incrementStep, repMin, repMax }`; `onAdd({ name, targetMuscle, equipmentType, incrementStep, repMin, repMax })`.

- [ ] **Step 1: Test:** her öğede `1 ≤ repMin ≤ repMax ≤ 50`; `'Calf Raises Machine'` → 12–20; `'Lateral Raise'` → 10–15; `'Hack Squat'` → 6–8.
- [ ] **Step 2:** FAIL → aralıkları ekle (bileşik: chest press'ler, row'lar, lat pulldown, shoulder press, hack squat 6–8; geri kalan izolasyon 10–15; calf 12–20) → PASS.
- [ ] **Step 3:** Elle ekleme: üç hazır buton "6–8 / 8–12 / 10–15" (varsayılan 6–8). `npm run build` geçer.
- [ ] **Step 4:** Commit `feat: hareket havuzuna tekrar aralıkları`.

### Task 5: App.jsx'i bölmek, öneriyle form doldurma, Vazgeç düzeltmesi

**Files:**
- Create: `src/components/Stepper.jsx`, `src/hooks/useExerciseData.js`, `src/components/WorkoutView.jsx`, `src/components/TodaySetList.jsx`
- Modify: `src/App.jsx` (sekmeler, başlık, modallar, ileride toast/timer yuvası)

**Interfaces:**
- Consumes: `getSetRecommendation` (Task 2), `withExerciseDefaults`, `sortByOrder` (Task 3).
- Produces:
  - `useExerciseData(exercise | null) → { todaySets, previousSets, recommendation, reload(): Promise<void> }` — `recommendation` Task 2 nesnesi; `exercise` değişince yeniden yükler; yarış koruması (`requestId`) korunur.
  - `WorkoutView` props: `{ routines, exercises, routineId, exerciseId, onSelectRoutine, onSelectExercise, onOpenModal(name), onError(msg), onSetSaved({ isPR, estimated1RM }), onSetDeleted(set) }`.
  - `TodaySetList` props: `{ sets, editingSetId, onEdit(set), onDelete(set) }`.

- [ ] **Step 1:** Mevcut davranışı taşı; seçiciler `isActive` + `sortByOrder` ile.
- [ ] **Step 2:** Hareket seçilince form `recommendation.weight ?? ''`, `recommendation.reps ?? repMin`, `rir = DEFAULT_RIR` ile dolar. `bodyweight = equipmentType === 'bodyweight'`.
- [ ] **Step 3:** Düzenleme başlarken `{ weight, reps, rir, isWarmup }` anlık görüntüsü ref'e alınır; Vazgeç geri yükler.
- [ ] **Step 4:** HistoryView boş RIR için `DEFAULT_RIR` kullanır.
- [ ] **Step 5:** `npm test && npm run lint && npm run build`. Elle (tarayıcı paneli, mobil): öneri kartındaki kg/tekrar formdakiyle aynı; Vazgeç eski değerleri getirir; `App.jsx` < 200 satır.
- [ ] **Step 6:** Commit `refactor: App.jsx'i hook ve bileşenlere böl; formu öneriyle doldur`.

### Task 6: Toast, geri al, rekor kutlaması, ısınma seti

**Files:**
- Create: `src/components/Toast.jsx`
- Modify: `src/App.jsx`, `src/components/WorkoutView.jsx`, `src/components/TodaySetList.jsx`, `src/components/HistoryView.jsx`

**Interfaces:**
- Consumes: `addSet → { isPR }`, `restoreSet`, `deleteSetAndRenumber`, `beep`, `vibrate`, `unlockAudio`.
- Produces: `Toast` props `{ message, actionLabel?, onAction?, onDismiss, durationMs = 5000 }`; App'te tek toast durumu (yenisi eskisini değiştirir).

- [ ] **Step 1:** Silme: önce seti oku, `deleteSetAndRenumber`, toast "Set silindi" + "Geri al" → `restoreSet(set)` + `reload()`. History ekranındaki silme de aynı akışı kullanır.
- [ ] **Step 2:** Rekor: `isPR` ise toast `🏆 Yeni rekor! Tahmini 1RM ${estimated1RM} kg`, `vibrate([100,50,100])`, `beep([0, 0.15], 1320)`.
- [ ] **Step 3:** Kaydet butonunun üstünde "Isınma seti" anahtarı; kayıttan sonra kapanır; düzenlemede setin değerini gösterir. Isınma setleri listede ve geçmişte "Isınma" etiketiyle; HistoryView 1RM delta hesabı ısınmaları atlar.
- [ ] **Step 4:** `npm test && npm run build`. Elle: sil → geri al (sıra korunur); rekor toast'ı çıkar; ısınma seti öneriyi değiştirmez.
- [ ] **Step 5:** Commit `feat: geri al, rekor kutlaması ve ısınma setleri`.

### Task 7: Hareket ayarları modalı, not kartı, plaka satırı

**Files:**
- Create: `src/components/ExerciseSettingsModal.jsx`, `src/components/ExerciseNote.jsx`
- Modify: `src/App.jsx` (hareket için `ManageModal` yerine; gün yeniden adlandırma `renameRoutine` ile), `src/components/WorkoutView.jsx`

**Interfaces:**
- Consumes: `updateExercise`, `renameRoutine`, `archiveExercise`, `platesPerSide`, `REST_OPTIONS`, `getRestSeconds`.
- Produces: `ExerciseSettingsModal` props `{ exercise, onSave(patch), onDelete(), onClose }`; `ExerciseNote` props `{ note, onSave(note) }`.

- [ ] **Step 1:** Modal alanları: ad, tekrar aralığı (iki küçük stepper), dinlenme ("Varsayılan (X sn)" + `REST_OPTIONS`), bar ağırlığı (yalnızca barbell; 20/15/10 segment), Sil → onay ekranı (mevcut uyarı metni). Hata modalda gösterilir, modal açık kalır.
- [ ] **Step 2:** Not kartı egzersiz seçicinin altında; boşsa "+ Not ekle"; satır içi textarea `maxLength={200}` + Kaydet/Vazgeç.
- [ ] **Step 3:** Barbell harekette ağırlık stepper'ı altında `Her tarafa: 20 + 1.25 (bar 20)`; `remainder > 0` ise ` (+1 kg eşleşmedi)`; `null` ise gösterme.
- [ ] **Step 4:** `npm test && npm run build`. Elle: aynı isim hatası görünür; aralık değişince öneri yeni aralığı kullanır; bar 15 seçince plaka satırı değişir.
- [ ] **Step 5:** Commit `feat: hareket ayarları, notlar ve plaka hesaplayıcı`.

### Task 8: Hareketleri sürükle-bırak ile sıralama

**Files:**
- Modify: `package.json` (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)
- Create: `src/components/ReorderExercises.jsx`
- Modify: `src/components/ManageModal.jsx` (menüye isteğe bağlı `extraActions: [{ label, icon, onClick }]`), `src/App.jsx`

**Interfaces:**
- Consumes: `reorderExercises`, `sortByOrder`.
- Produces: `ReorderExercises` props `{ routineName, exercises, onSave(orderedIds), onClose }`.

- [ ] **Step 1:** "Günü Yönet" menüsüne "Hareketleri sırala". Liste: `DndContext` + `SortableContext` (`verticalListSortingStrategy`), sensörler `PointerSensor` + `TouchSensor({ activationConstraint: { delay: 150, tolerance: 5 } })` + `KeyboardSensor`; sürükleme yalnız ≡ tutamacından. Her satırda yukarı/aşağı butonları. Bırakınca/butonda `reorderExercises` hemen yazılır.
- [ ] **Step 2:** `npm run build`. Elle (mobil boyut): tutamaçla sürükleme sırayı değiştirir, liste kaydırma tutamaç dışında bozulmaz; seçicideki sıra güncellenir.
- [ ] **Step 3:** Commit `feat: hareketleri sürükle-bırak ile sıralama`.

### Task 9: Dinlenme sayacı

**Files:**
- Create: `src/hooks/useRestTimer.js`, `src/components/RestTimerBar.jsx`
- Test: `src/hooks/restTimer.test.js`
- Modify: `src/App.jsx`, `src/components/WorkoutView.jsx`

**Interfaces:**
- Consumes: `getRestSeconds`, `getRestAuto`, `beep`, `vibrate`, `showNotification`, `unlockAudio`.
- Produces:
  - saf `remainingSeconds(endAt: number, now: number) → number` (≥ 0, yukarı yuvarlanmış) ve `shouldFire(state, now) → boolean` (`useRestTimer.js`'den export)
  - `useRestTimer() → { endAt: number|null, remaining: number, start(seconds), addSeconds(n), stop() }`

- [ ] **Step 1: Test:** `remainingSeconds(10_000, 4_500) === 6`; `remainingSeconds(10_000, 99_000) === 0`; `fires once when overdue` → `shouldFire({ endAt: 1000, fired: false }, 5000) === true`, `fired: true` ile `false`.
- [ ] **Step 2:** FAIL → uygula → PASS.
- [ ] **Step 3:** Hook: 1 sn interval + `visibilitychange`'te yeniden hesap; bitişte bir kez `beep()` + `vibrate([200,100,200])`, `document.hidden` ise `showNotification('Dinlenme bitti', { body: exerciseName })`, sonra durur. Yeni set kaydında (düzenleme değil) `getRestAuto()` ise `start(exercise.restSeconds ?? getRestSeconds())`; `unlockAudio()` Kaydet tıklamasında.
- [ ] **Step 4:** `RestTimerBar` alt menünün hemen üstünde sabit: `m:ss`, ilerleme çubuğu, "+30 sn", "Atla". Sayfa alt boşluğu çubuk açıkken artar ki içerik örtülmesin.
- [ ] **Step 5:** `npm test && npm run build`. Elle: kayıt → sayaç başlar; +30 çalışır; sekme gizlenip dönünce doğru süre.
- [ ] **Step 6:** Commit `feat: dinlenme sayacı`.

### Task 10: Ayarlar paneli ve yedekleme

**Files:**
- Create: `src/components/SettingsSheet.jsx`
- Modify: `src/App.jsx` (başlığa dişli + nokta), `src/utils/settings.js`
- Test: `src/utils/settings.test.js`

**Interfaces:**
- Consumes: `exportBackup`, `readBackupFile`, `restoreBackup`, `getLastBackupAt`, rest/notification ayar fonksiyonları, `requestNotificationPermission`, `notificationPermission`.
- Produces: `needsBackupReminder({ lastBackupAt: number|null, hasSets: boolean, now: number }) → boolean` (`settings.js`); `SettingsSheet` props `{ onClose, onRestored() }`.

- [ ] **Step 1: Test:** `hasSets:false` → false; `lastBackupAt:null, hasSets:true` → true; 6 gün önce → false; 8 gün önce → true.
- [ ] **Step 2:** FAIL → uygula → PASS.
- [ ] **Step 3:** Panel (alttan, Esc/arka plan kapatır): Yedek al + son yedek tarihi (`tr-TR`); Geri yükle → gizli `<input type="file" accept="application/json">` → `readBackupFile` → onay ekranı (tarih + tablo sayıları + "Mevcut tüm veri silinecek") → `restoreBackup` → `onRestored()` (App kataloğu ve seçimi yeniden yükler); hatalar panelde. Dinlenme süresi seçici, otomatik başlat anahtarı, bildirim durumu + "İzin ver".
- [ ] **Step 4:** Dişli üzerinde nokta: `needsBackupReminder({ lastBackupAt: getLastBackupAt(), hasSets: (await db.sets.count()) > 0, now: Date.now() })`; açılışta ve panel kapanınca hesaplanır.
- [ ] **Step 5:** `npm test && npm run build`. Elle: yedek indir → geri yükle → veriler aynı; nokta yedekten sonra kaybolur.
- [ ] **Step 6:** Commit `feat: ayarlar paneli, yedekleme ve hatırlatma`.

### Task 11: PWA

**Files:**
- Create: `public/logo.svg` (koyu `#020617` zemin, emerald dambıl), `pwa-assets.config.js`
- Create (üretilir): `public/pwa-64x64.png`, `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/maskable-icon-512x512.png`, `public/apple-touch-icon-180x180.png`, `public/favicon.ico`
- Modify: `vite.config.js`, `index.html`, `public/favicon.svg` (logo ile değiştir)

- [ ] **Step 1:** `npm i -D @vite-pwa/assets-generator`; `npx pwa-assets-generator --preset minimal-2023 public/logo.svg`.
- [ ] **Step 2:** `VitePWA({ registerType: 'autoUpdate', manifest: { name: 'Overload', short_name: 'Overload', lang: 'tr', display: 'standalone', theme_color: '#020617', background_color: '#020617', icons: [...üretilen 64/192/512 + maskable purpose 'maskable'] } })`. `index.html`: `<meta name="theme-color" content="#020617">`, `apple-touch-icon`, `apple-mobile-web-app-capable`.
- [ ] **Step 3:** `npm run build` → `dist/manifest.webmanifest` ve `dist/sw.js` var. `npx vite preview` + tarayıcı paneli: manifest yüklenir, service worker aktif, ağ kapalıyken yeniden yükleme açılır.
- [ ] **Step 4:** Commit `feat: PWA (kurulabilir, çevrimdışı)`.

### Task 12: Son doğrulama

- [ ] **Step 1:** `npm test`, `npm run lint`, `npm run build` — çıktıları kaydet.
- [ ] **Step 2:** Tarayıcı paneli, mobil boyut, uçtan uca: gün seç → hareket ekle (havuz, aralık doğru) → not yaz → ısınma + 2 çalışma seti → sayaç → rekor → sil/geri al → sırala → hareket ayarı (bar 15) → geçmiş düzenle → yedek al/geri yükle.
- [ ] **Step 3:** Bulunan sorunları düzelt, commit.
