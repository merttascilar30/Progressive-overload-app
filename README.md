# Overload

Salon antrenmanlarını takip eden, mobil öncelikli ve çevrimdışı çalışan ilerleme uygulaması. React 19, Vite, Tailwind CSS ve Dexie (IndexedDB) kullanır.

## Kurulum ve komutlar

- `npm install`: bağımlılıkları kurar
- `npm run dev`: geliştirme sunucusu
- `npm test`: Vitest testleri
- `npm run build`: üretim derlemesi
- `npm run lint`: oxlint

## Özellikler

- Antrenman günleri ve hareket havuzundan ya da elle hareket ekleme
- Set kaydı (ağırlık, tekrar, RIR); geçmişi görüntüleme ve düzenleme (ısınma işareti dahil)
- Hareket başına tekrar aralığına dayalı ilerleme önerisi (Brzycki 1RM ile dinamik hedef)
- Isınma setleri (rekor ve hacim hesabına katılmaz)
- Yeni rekor (PR) kutlaması: bildirim, ses ve titreşim
- Set silmede "Geri al"
- Hareket notları
- Plaka hesaplayıcı (20/15/10 kg bar seçimi)
- Sürükle-bırak ile hareket sıralama
- Dinlenme sayacı (otomatik başlatma, süre ekleme/atlama)
- Ayarlar paneli: yedekleme/geri yükleme ve yedek hatırlatması
- PWA: çevrimdışı çalışır, telefona kurulabilir

## Telefona kurulum

- Android (Chrome): menü (⋮) → "Ana ekrana ekle" veya "Uygulamayı yükle"
- iPhone (Safari): Paylaş → "Ana Ekrana Ekle"

## Bilinen kısıtlar

- Ekran kilitliyken tarayıcılar arka plandaki sayfaları duraklattığı için dinlenme sayacı bildirimi gecikebilir ya da hiç gelmeyebilir.
- iOS'ta bildirimler yalnızca ana ekrana eklenmiş uygulamada çalışır.
- Veriler yalnızca bu cihazda tutulur. Cihaz değişir ya da tarayıcı verisi silinirse kaybolur; Ayarlar'dan düzenli yedek almanız önerilir.
