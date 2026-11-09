# Overload — İyileştirmeler ve Salon Özellikleri (Spec 1)

Tarih: 2026-11-09 · Durum: İncelemede

## Amaç

Kullanıcı uygulamayı spor salonunda telefonundan, tarayıcı üzerinden (kurulu değil) kullanıyor.
Bu spec'in hedefi:

1. Kod incelemesinde çıkan ilk dört sorun grubunu düzeltmek (bağlanmamış özellikler, öneri/form
   tutarsızlığı, kullanım sorunları, kod kalitesi).
2. Salonda doğrudan fayda sağlayan küçük özellikleri (A grubu) eklemek.

**Başarı ölçütü:** Uygulama telefona kurulabilir ve çevrimdışı açılır; veriler yedeklenebilir;
öneri kartı ile form aynı değerleri gösterir; set kaydı sonrası dinlenme sayacı çalışır;
`npm test`, `npm run lint` ve `npm run build` temiz geçer.

### Kullanıcı kararları
- Kullanım: telefonda tarayıcı → PWA öncelikli.
- Ayarlar: başlıkta dişli simgesi ile açılan panel (alt menü 2 sekme kalır).
- Tekrar aralığı: hareket bazında, havuzdan gelen varsayılan + düzenlenebilir.
- Kapsam: 4 düzeltme + A grubu bu spec'te; analiz özellikleri (1RM grafiği, haftalık set,
  deload uyarısı, günün özeti, geçmiş sayfalama) **Spec 2**'de; CSV ve bulut senkronu kapsam dışı.

### Varsayımlar (itiraz edilebilir)
- Plaka hesaplayıcıda bar ağırlığı sabit 20 kg; plakalar 25/20/15/10/5/2.5/1.25.
- Rekor kutlaması, hareketin daha önce en az bir kaydı varsa tetiklenir (ilk set rekor sayılmaz).
- Isınma setleri numaralanır ama "Isınma" etiketiyle gösterilir.

## Uygulama yaklaşımı

Önce zemin (testler + `App.jsx`'i bölmek), sonra özellikler. Her adım test edilebilir kalır.

## 1. Altyapı ve temizlik

- **Vitest** + **fake-indexeddb** (dev bağımlılık). `npm test` scripti.
- Silinecek: `src/App.css`, `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`.
- `README.md` gerçek proje açıklaması (kurulum, scriptler, özellikler); `rules.md` React 19.
- `EXERCISE_POOL` ve `EQUIPMENT_TYPES` → `src/data/exercisePool.js` (fast-refresh lint uyarıları).
- `HistoryView` effect uyarıları: ref değeri effect içinde yerel değişkene alınır; senkron
  `setState` effect dışına taşınır.
- **PWA:** `vite-plugin-pwa` (`registerType: 'autoUpdate'`), manifest: ad "Overload",
  `display: standalone`, `theme_color`/`background_color` `#020617`, ikonlar
  `public/pwa-192x192.png`, `public/pwa-512x512.png`, maskable 512. İkonlar bir kez üretilip
  commit'lenir. `index.html`'e `theme-color` ve `apple-touch-icon`.

## 2. Veri modeli (Dexie v4)

`exercises` tablosuna yeni alanlar (index gerekmez):

| Alan | Tip | Varsayılan (alan yoksa) |
|---|---|---|
| `repMin`, `repMax` | int | 6, 8 |
| `restSeconds` | int \| null | null → genel ayar |
| `note` | string | '' |
| `order` | number | `id` |

`sets` tablosuna: `isWarmup` (bool, yoksa `false`).

`db.version(4)` upgrade: mevcut hareketlere `order = id` atar. Diğer alanlar okunurken
varsayılanla doldurulur; böylece eski yedekler de sorunsuz geri yüklenir.

Yeni/değişen `db.js` yardımcıları (hepsi transaction içinde):
- `renameRoutine(id, name)` — aktif günlerde aynı isim varsa hata.
- `updateExercise(id, patch)` — `name` değişiyorsa aynı gündeki aktif hareketlerde çakışma
  kontrolü ("Bu günde aynı isimde hareket var."); `repMin ≤ repMax`, 1–50 doğrulaması.
- `moveExercise(id, direction)` — aynı gündeki komşuyla `order` değiştirir.
- `restoreSet(set)` — silinen seti aynı `id` ile `put` eder ve kardeşleri yeniden numaralar
  (geri al için).
- `addSet` dönüşüne `{ id, isPR }` eklenir: ısınma değilse ve tahmini 1RM, hareketin önceki
  ısınma dışı setlerinin en yükseğini geçiyorsa `isPR = true`.
- `addExercise` havuzdan `repMin/repMax` alır; `order` = gündeki en büyük + 1.

## 3. İlerleme önerisi (`progressionEngine.js`)

- `getSetRecommendation(previousSets, { incrementStep, repRange, bodyweight })` artık
  `{ weight, reps, message }` döndürür (`weight`/`reps` ilk seansta `null`).
- Isınma setleri öneriden, `calculateVolumeLoad`'dan ve 1RM karşılaştırmalarından çıkarılır.
- Vücut ağırlığı (`equipmentType === 'bodyweight'` veya çalışma ağırlığı 0): ağırlık önerilmez,
  yalnızca tekrar artar; tavana ulaşınca "zorlaştır / ağırlık ekle" mesajı.
- Form, hareket seçildiğinde önerinin `weight`/`reps` değerleriyle dolar; RIR 2.
- `DEFAULT_RIR = 2` buradan export edilir; App ve HistoryView aynı sabiti kullanır.
- Havuz varsayılan aralıkları: bileşik 6–8, izolasyon 10–15, calf 12–20.

## 4. Kullanım düzeltmeleri

- **Set silme + geri al:** Silme anında olur; `UndoToast` 5 sn "Set silindi · Geri al" gösterir.
  Geri al → `restoreSet`. Yeni bir silme önceki toast'ı değiştirir.
- **Düzenlemede Vazgeç:** Düzenleme başlarken form değerlerinin anlık görüntüsü alınır,
  Vazgeç'te geri yüklenir.
- **İsim çakışması:** Yeniden adlandırma `renameRoutine`/`updateExercise` ile; hata modalda
  gösterilir, modal açık kalır.

## 5. Ayarlar paneli ve dinlenme sayacı

**`SettingsSheet`** (başlıktaki dişli, alttan açılan panel, Esc/arka plan ile kapanır):
- Yedek al (`exportBackup`) · son yedek tarihi.
- Yedekten geri yükle: dosya seç → `readBackupFile` → kayıt sayıları ve tarih ile onay ekranı →
  `restoreBackup` → katalog yeniden yüklenir.
- Dinlenme süresi (`REST_OPTIONS`), otomatik başlat anahtarı.
- Bildirim izni durumu + "İzin ver" butonu.
- Hiç yedek yoksa (ve en az bir set varsa) veya son yedek 7 günden eskiyse dişli üzerinde nokta.

**`RestTimerBar`** (alt menünün üstünde, sabit):
- Yeni set kaydında (düzenlemede değil) otomatik başlat açıksa başlar. Süre:
  `exercise.restSeconds ?? getRestSeconds()`.
- Durum `endAt` zaman damgası olarak tutulur; görüntü 1 sn'de bir yenilenir ve
  `visibilitychange`'te yeniden hesaplanır.
- Butonlar: "+30 sn", "Atla".
- Süre dolunca: `beep()` + `vibrate([200,100,200])`; sayfa gizliyse `showNotification`.
  `unlockAudio()` "Seti Kaydet" tıklamasında çağrılır.
- **Bilinen kısıt:** Mobil tarayıcılar arka plandaki sayfaları yavaşlatır; kilitli ekranda bildirim
  gecikebilir. iOS'ta bildirim yalnızca ana ekrana eklenmiş PWA'da çalışır.

## 6. A grubu özellikleri

1. **Rekor kutlaması:** `addSet` `isPR` döndürürse toast "🏆 Yeni rekor! Tahmini 1RM X kg" +
   titreşim + kısa bip.
2. **Harekete not:** Egzersiz seçicinin altında küçük not kartı. Boşsa "+ Not ekle". Dokununca
   satır içi textarea + Kaydet/Vazgeç → `updateExercise(id, { note })`. En fazla 200 karakter.
3. **Isınma seti:** Kaydet butonunun üstünde "Isınma seti" anahtarı (her kayıttan sonra kapanır).
   Bugünkü setler ve geçmişte "Isınma" etiketi; düzenlemede değiştirilebilir.
4. **Harekete özel dinlenme:** Hareket ayarlarında "Varsayılan (X sn)" veya `REST_OPTIONS`'tan biri.
5. **Hareket sıralama:** "Günü Yönet" menüsüne "Hareketleri sırala" modu: liste + her satırda
   yukarı/aşağı butonları (`moveExercise`). Seçiciler `order ?? id`'ye göre sıralar.
6. **Plaka hesaplayıcı:** Barbell harekette ağırlık alanının altında
   "Her tarafa: 20 + 5 + 1.25" satırı. Saf fonksiyon `platesPerSide(total, bar = 20)`;
   tam karşılanamazsa "(+0.5 kg eşleşmedi)" notu; bar altındaysa gösterilmez.

**`ExerciseSettingsModal`** hareket için `ManageModal`'ın yerini alır: ad, tekrar aralığı
(min/max stepper), dinlenme süresi, sil (onaylı). Not satır içinde düzenlenir.

## 7. Dosya düzeni

```
src/
  App.jsx                      sekmeler, başlık, modallar, toast/timer yerleşimi
  hooks/useExerciseData.js     geçmiş/bugün setleri, öneri, prefill
  hooks/useRestTimer.js        endAt tabanlı sayaç
  components/WorkoutView.jsx   seçiciler, not, öneri, stepper'lar, kaydet
  components/TodaySetList.jsx
  components/Stepper.jsx
  components/SettingsSheet.jsx
  components/RestTimerBar.jsx
  components/UndoToast.jsx     (geri al + rekor toast'ı için ortak Toast)
  components/ExerciseSettingsModal.jsx
  components/ReorderExercises.jsx
  data/exercisePool.js
  utils/plates.js
```

## 8. Hata yönetimi

- DB işlemleri hata fırlatır; modallar hatayı gösterip açık kalır, ana ekran `storageError`
  kutusunu kullanır (mevcut desen).
- Geri yükleme tek transaction; başarısızsa mevcut veri değişmez (mevcut davranış).
- Bildirim/ses/titreşim desteklenmiyorsa sessizce atlanır.

## 9. Test

- **Birim (Vitest):** `getSetRecommendation` (artır/düşür/tekrar artır, ısınma filtresi, vücut
  ağırlığı, özel aralık), `parseSetInput`, `calculateVolumeLoad`, `platesPerSide`.
- **DB (fake-indexeddb):** v4 upgrade (`order`), `updateExercise` isim çakışması, `moveExercise`,
  `restoreSet` + yeniden numaralama, `addSet` `isPR`.
- **Elle:** Tarayıcı panelinde mobil boyutta: set kaydı → sayaç, sil → geri al, rekor toast'ı,
  yedek al/geri yükle, sıralama, not; `npm run build` + `vite preview` ile PWA manifest/SW kontrolü.

## Kapsam dışı

- Spec 2: 1RM ilerleme grafiği, kas grubu başına haftalık set, durma/deload uyarısı, günün özeti,
  geçmişte sayfalama.
- CSV dışa aktarma, bulut senkronu.
