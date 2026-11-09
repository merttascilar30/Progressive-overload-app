# Overload — İstatistik, Dayanıklılık ve Kişisel Havuz (Spec 2)

Tarih: 2026-11-09 · Durum: İncelemede · Önceki: `2026-11-09-overload-iyilestirmeler-design.md`

## Amaç

Spec 1 ile salonda set kaydı sağlamlaştı. Spec 2'nin hedefleri:

1. Kullanıcı ilerlemesini **görebilsin**: 1RM grafiği, kas grubu başına haftalık set,
   durma/deload uyarısı, günün özeti.
2. Uzun geçmişte ekran yavaşlamasın: geçmişte sayfalama.
3. Telefonda yarım kalan iş kaybolmasın: taslak koruma, kalıcı dinlenme sayacı, bildirim kuyruğu.
4. Elle eklenen hareketler **kişisel havuza** girsin, başka günlere de havuzdan eklenebilsin.
5. Form mantığı bileşen testleriyle korunsun.

**Başarı ölçütü:** İstatistik sekmesi seçilen hareketin 1RM eğrisini ve haftalık kas grubu
setlerini gösterir; duran hareket öneri kartında uyarı verir; sayfa yenilense de yazılan değerler
ve süren sayaç geri gelir; elle eklenen hareket diğer günün havuzunda "Benim hareketlerim" altında
görünür; `npm test`, `npm run lint`, `npm run build` temiz geçer.

### Kullanıcı kararları
- Kapsam: 5 analiz özelliği + 3 dayanıklılık eki + kişisel havuz.
- İstatistik: alt menüde 3. sekme (Antrenman / Geçmiş / İstatistik).
- Elle eklenen hareket, hareket ekleme havuzuna kalıcı olarak eklenir.

### Varsayımlar (itiraz edilebilir)
- Haftalık set: takvim haftası değil, **son 7 gün** (önceki 7 günle kıyas).
- Grafik varsayılan aralığı **3 Ay**; seçenekler 1A / 3A / 6A / Tümü.
- Durma: son 3 seansın hiçbiri önceki en iyi 1RM'i geçmediyse (en az 4 seans gerekir).
- Deload önerisi: çalışma ağırlığının %90'ı, hareketin `incrementStep`'ine aşağı yuvarlanmış.
- Taslak geçerlilik süresi 6 saat.
- Kişisel havuzdan silmek mevcut günlerdeki hareketi etkilemez.

## Yaklaşım

Grafik **kütüphanesiz SVG** ile çizilir (ek paket yok, çevrimdışı dostu). Tüm hesaplamalar saf
fonksiyonlarda (`src/utils/stats.js`) toplanır ve birim testlidir; bileşenler yalnızca çizer.

## 1. Veri katmanı

### 1.1 `src/utils/stats.js` (saf, ısınma setleri hariç)
- `dailyBest1RM(sets) → [{ day: number (gün başı ms), value: number }]` — artan gün sırası;
  `estimate1RM` null olan setler atlanır.
- `filterRange(points, range, now)` — `range ∈ '1m' | '3m' | '6m' | 'all'`.
- `weeklyMuscleSets(sets, exercisesById, now) → [{ muscle, count, previous }]` — son 7 gün ve
  önceki 7 gün çalışma seti sayısı; `muscle = exercise.targetMuscle || 'Genel'`; count'a göre azalan.
- `stallStatus(sessionBests: number[]) → { stalled: boolean, sessions: number }` — en eski → en yeni
  seans en iyi 1RM'leri; `stalled` = uzunluk ≥ 4 ve son 3'ün maksimumu ≤ öncekilerin maksimumu.
- `deloadWeight(workingWeight, incrementStep) → number` — `floor(0.9 × w / step) × step`, ≥ 0.
- `daySummary(todaySets, priorBestByExercise) → { volume, workingSets, warmupSets, prCount, minutes }`
  — `prCount`: her hareketin günün en iyi 1RM'i önceki en iyiyi geçiyorsa 1 (ilk kayıt sayılmaz);
  `minutes`: ilk ve son set zaman damgası farkı (tek sette 0).

### 1.2 `src/db.js`
- `getSetsSince(timestamp) → sets[]` — `timestamp` index'i ile (salt okuma).
- `getSetsBetween(from, to)` ve `lastBestBefore(exerciseId, timestamp)` — geçmiş sayfalama için.
- **Dexie v5:** yeni tablo `customPool: '++id, &nameKey'` (bkz. §6). Mevcut tablolar aynı.

## 2. İstatistik sekmesi

`App` alt menüsüne üçüncü sekme "İstatistik" (lucide `ChartLine`). Yeni bileşen `StatsView`:

- **Hareket seçici:** tüm aktif günlerdeki aktif hareketler, `<optgroup>` ile güne göre; varsayılan
  Antrenman sekmesinde seçili hareket.
- **Aralık çipleri:** 1A / 3A / 6A / Tümü (`aria-pressed`).
- **`OneRMChart`** (saf SVG, `viewBox` ile genişliğe uyar, yükseklik ~180px):
  çizgi + noktalar, y ekseninde min/max etiketi, x ekseninde ilk/son tarih; başlıkta son değer ve
  dönem farkı ("+7.5 kg"); noktaya dokununca tarih + değer etiketi. 0–1 nokta: "Grafik için en az
  iki gün kayıt gerekli." mesajı.
- **"Son 7 gün · kas grupları":** yatay çubuklar (en büyük = %100), sağda sayı ve önceki 7 güne
  göre fark (+2 / −1). Veri yoksa boş durum metni.
- **"Dikkat":** `stallStatus` duran hareketlerin listesi, her biri "X seanstır artmadı · deload:
  Y kg"; dokununca o hareket grafikte seçilir.

Veri `getSetsSince` ile sekme açıldığında yüklenir (Tümü seçiliyse tüm setler); `refreshToken`
değişince yeniden yüklenir.

## 3. Antrenman ekranı

- **Durma uyarısı:** seçili harekette `stalled` ise öneri kartının altında amber kutu:
  "3 seanstır 1RM artmadı — deload düşün: {deloadWeight} kg". Seans en iyileri
  `useExerciseData`'nın zaten okuduğu geçmişten hesaplanır.
- **Günün özeti:** bugün en az bir set varsa (tüm hareketler) "Bugünkü Setler" altında kart:
  hacim (kg), çalışma/ısınma set sayısı, rekor sayısı, süre (dk). Veri: bugünün tüm setleri +
  hareket başına bugünden önceki en iyi 1RM.

## 4. Geçmişte sayfalama

`HistoryView` açılışta son 30 günü (`getSetsBetween(now − 30g, now)`) yükler; alttaki
"Daha fazla göster" 30 gün daha ekler; daha eski kayıt yoksa buton gizlenir. Yüklenen en eski
günün 1RM farkı için hareket başına `lastBestBefore` kullanılır, böylece rozetler değişmez.
Düzenleme/silme/geri al sonrası yüklenen aralık korunarak yeniden okunur.

## 5. Dayanıklılık

- **Taslak koruma** (`src/utils/drafts.js`, localStorage, try/catch):
  anahtar `overload:draft:{exerciseId}`, değer `{ weight, reps, rir, isWarmup, savedAt }`;
  form değişince 400 ms gecikmeyle yazılır (düzenleme modunda yazılmaz). Hareket seçildiğinde
  6 saatten yeni taslak varsa öneri yerine o gelir ve kartta "Taslak geri yüklendi" notu görünür.
  Başarılı yeni kayıtta taslak silinir.
- **Kalıcı dinlenme sayacı:** `overload:restTimer = { endAt, total, name }`; başlat/+30/atla/bitişte
  güncellenir; açılışta `endAt > now` ise sayaç devam eder, değilse silinir (geç uyarı çalmaz).
- **Bildirim kuyruğu:** App tek toast yerine kuyruk tutar. `showToast` sona ekler; ekrandaki toast
  süresi dolunca/kapatılınca sıradaki gösterilir. İşlem butonlu toast'lar (Geri al) başka bir toast
  tarafından kesilmez; rekor toast'ı onlardan sonra gelir. Aynı anda en fazla 3 bekleyen; fazlası
  en eski işlem-butonsuz olanı düşürür. Geri yüklemede kuyruk temizlenir.

## 6. Kişisel hareket havuzu

- **Tablo** `customPool` alanları: `name`, `nameKey` (normalize: trim + küçük harf, benzersiz),
  `targetMuscle`, `equipmentType`, `incrementStep`, `repMin`, `repMax`, `createdAt`.
- **Ekleme:** `ExercisePoolModal` elle ekleme başarıyla güne eklendiğinde `upsertCustomPoolItem`
  çağrılır. Ad sabit `EXERCISE_POOL`'daki bir hareketle (normalize) aynıysa havuza eklenmez;
  kişisel havuzda zaten varsa ayarları güncellenir.
- **Kas grubu seçimi:** elle ekleme formuna "Kas grubu" seçici eklenir (havuzdaki kas grupları +
  "Genel"); haftalık set analizi bunu kullanır.
- **Görünüm:** havuz modalının en üstünde "Benim hareketlerim" kategorisi (boşsa gizli). Öğeler
  sabit havuzdakiyle aynı davranır (günde varsa "eklendi" işareti). Her öğede küçük "Kaldır"
  (çöp kutusu) → satır içi onay "Havuzdan kaldırılsın mı?" → `removeCustomPoolItem`; günlerdeki
  hareketler etkilenmez.
- **v5 upgrade:** mevcut aktif/arşiv hareketlerden adı sabit havuzda olmayanlar (normalize, tekil)
  kişisel havuza tohumlanır — kullanıcının daha önce elle eklediği hareketler hemen görünür.
- **Yedek:** `backup.js` `TABLES`'a `customPool` eklenir, `FORMAT_VERSION = 2`. Format 1 yedekler
  kabul edilir (`customPool` yoksa boş dizi); geri yüklemede tablo temizlenip doldurulur.

## 7. Bileşen testleri

`@testing-library/react`, `@testing-library/user-event`, `jsdom` (dev). Ortam dosya başına
`// @vitest-environment jsdom`; mevcut node testleri değişmez. Kapsam:
- WorkoutView: öneri ile form doldurma; taslaktan geri yükleme; düzenle → Vazgeç; ısınma anahtarı
  yeni kayıttan sonra sıfırlanır; ısınma seti düzenlenip kaydedilince sonraki set çalışma seti olur.
- Toast kuyruğu: Geri al ekrandayken gelen rekor toast'ı sonra gösterilir.
- ExercisePoolModal: elle eklenen hareket "Benim hareketlerim"de görünür; kaldır onayı.

## 8. Hata yönetimi

Mevcut desen: DB işlemleri hata fırlatır, modallar/ekranlar mesajı gösterir. İstatistik yükleme
hatası sekme içinde `role="alert"` ile gösterilir. localStorage hataları sessizce yok sayılır
(uygulama taslaksız çalışır).

## 9. Test

- **Birim:** `stats.js` tüm fonksiyonlar (ısınma hariç tutma, aralık filtresi, durma sınırları
  3/4 seans, deload yuvarlama, özet süre/rekor), `drafts.js` (süre aşımı), toast kuyruğu mantığı
  (saf reducer olarak).
- **DB (fake-indexeddb):** v4→v5 upgrade tohumlama; `upsertCustomPoolItem` tekillik ve sabit havuz
  hariç tutma; `getSetsBetween`/`lastBestBefore`; format 1 yedeğin geri yüklenmesi.
- **Bileşen:** §7.
- **Elle (tarayıcı, mobil boyut):** grafik ve aralıklar, kas grubu çubukları, durma uyarısı,
  günün özeti, sayfalama, taslak (sayfa yenile), sayaç (sayfa yenile), elle ekle → başka günde
  havuzda görünür → kaldır.

## Kapsam dışı

CSV dışa aktarma, bulut senkronu, çoklu cihaz.
