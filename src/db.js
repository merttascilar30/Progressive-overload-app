import Dexie from 'dexie';
import { estimate1RM } from './utils/progressionEngine';
import { EXERCISE_POOL } from './data/exercisePool';

export const db = new Dexie('overloadDB');

// Veritabanı şeması: id'ler otomatik artar (++)
db.version(1).stores({
  exercises: '++id, name, targetMuscle, equipmentType',
  workouts: '++id, date, name, isCompleted',
  sets: '++id, workoutId, exerciseId, setNumber, weight, reps, rir, estimated1RM, timestamp'
});

// v2: Antrenman günleri (split) ve egzersizlerin güne bağlanması
db.version(2).stores({
  routines: '++id, name',
  exercises: '++id, name, targetMuscle, equipmentType, routineId',
  workouts: '++id, date, name, isCompleted',
  sets: '++id, workoutId, exerciseId, setNumber, weight, reps, rir, estimated1RM, timestamp'
});

// v3: Sorgulanmayan set alanlarındaki indeksler kaldırıldı (yazma maliyeti).
// `meta` tablosu seed'in yalnızca bir kez çalıştığını kalıcı olarak tutar.
db.version(3)
  .stores({
    routines: '++id, name',
    exercises: '++id, name, targetMuscle, equipmentType, routineId',
    workouts: '++id, date, name, isCompleted',
    sets: '++id, workoutId, exerciseId, timestamp',
    meta: 'key',
  })
  .upgrade(async (tx) => {
    // Zaten veri olan kullanıcıda varsayılan split yeniden eklenmesin.
    const hasData =
      (await tx.table('routines').count()) > 0 || (await tx.table('exercises').count()) > 0;
    if (hasData) await tx.table('meta').put({ key: 'seeded', value: true });
  });

// v4: Şema aynı; hareketlere gün içi sıralama (`order`) eklendi. Mevcut kayıtlarda
// sıra id'ye eşitlenir, böylece eski görünüm değişmez.
db.version(4)
  .stores({
    routines: '++id, name',
    exercises: '++id, name, targetMuscle, equipmentType, routineId',
    workouts: '++id, date, name, isCompleted',
    sets: '++id, workoutId, exerciseId, timestamp',
    meta: 'key',
  })
  .upgrade((tx) =>
    tx.table('exercises').toCollection().modify((ex) => {
      ex.order ??= ex.id;
    }),
  );

// v5: Kişisel hareket havuzu. Elle eklenen hareketler burada kalıcı tutulur.
// Upgrade, adı sabit havuzda olmayan mevcut hareketleri (normalize, tekil) havuza tohumlar.
db.version(5)
  .stores({
    routines: '++id, name',
    exercises: '++id, name, targetMuscle, equipmentType, routineId',
    workouts: '++id, date, name, isCompleted',
    sets: '++id, workoutId, exerciseId, timestamp',
    meta: 'key',
    customPool: '++id, &nameKey',
  })
  .upgrade(async (tx) => {
    const rows = deriveCustomPool(await tx.table('exercises').toArray());
    if (rows.length) await tx.table('customPool').bulkAdd(rows);
  });

export const REP_LIMITS = { min: 1, max: 50 };
export const NOTE_MAX_LENGTH = 200;
export const BAR_WEIGHTS = [20, 15, 10];

const EXERCISE_DEFAULTS = {
  repMin: 6,
  repMax: 8,
  restSeconds: null,
  note: '',
  barWeight: 20,
};

/**
 * Eski sürümlerden / yedeklerden gelen eksik alanları varsayılanlarla doldurur.
 * Kaydı değiştirmez, yeni nesne döner.
 */
export function withExerciseDefaults(ex) {
  const filled = { ...ex };
  for (const [key, value] of Object.entries(EXERCISE_DEFAULTS)) filled[key] = ex?.[key] ?? value;
  filled.order = ex?.order ?? ex?.id;
  return filled;
}

/** Hareketleri gün içi sıraya göre dizer; `order` yoksa id'ye düşer. */
export function sortByOrder(a, b) {
  return (a.order ?? a.id) - (b.order ?? b.id);
}

// Silinen gün/hareketler kalıcı olarak silinmez, `archived: true` ile gizlenir.
// Böylece geçmişteki setler hareket ve gün adlarını korur.
export function isActive(record) {
  return !record?.archived;
}

export function toDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const normalizeName = (name) => String(name ?? '').trim().toLowerCase();

// Varsayılan Push/Pull/Legs hareketleri de "kişisel" sayılmaz (yeni kurulumda havuza girmezler).
const DEFAULT_SPLIT_NAMES = [
  'Bench Press', 'Incline Dumbbell Press', 'Dumbbell Lateral Raise', 'Lat Pulldown',
  'Barbell Row', 'Barbell Squat', 'Leg Press',
];
const STATIC_POOL_KEYS = new Set([
  ...EXERCISE_POOL.flatMap((category) => category.items.map((item) => normalizeName(item.name))),
  ...DEFAULT_SPLIT_NAMES.map(normalizeName),
]);

/**
 * Hareket listesinden kişisel havuz satırları: adı sabit havuzda ya da varsayılan günlerde
 * olmayanlar, normalize adla tekil (ilk görülenin ayarları). v5 upgrade ve format 1 yedek kullanır.
 */
export function deriveCustomPool(exercises, createdAt = Date.now()) {
  const seen = new Set();
  const rows = [];
  for (const ex of [...exercises].sort((a, b) => a.id - b.id)) {
    const nameKey = normalizeName(ex.name);
    if (!nameKey || seen.has(nameKey) || STATIC_POOL_KEYS.has(nameKey)) continue;
    seen.add(nameKey);
    rows.push(customPoolRow(ex, nameKey, createdAt));
  }
  return rows;
}

function customPoolRow(source, nameKey, createdAt) {
  return {
    name: String(source.name).trim(),
    nameKey,
    targetMuscle: source.targetMuscle || 'Genel',
    equipmentType: source.equipmentType || 'other',
    incrementStep: Number(source.incrementStep) > 0 ? Number(source.incrementStep) : 2.5,
    repMin: Number.isInteger(source.repMin) ? source.repMin : EXERCISE_DEFAULTS.repMin,
    repMax: Number.isInteger(source.repMax) ? source.repMax : EXERCISE_DEFAULTS.repMax,
    createdAt,
  };
}

let seedPromise = null;

// Uygulama ilk açıldığında çalışacak örnek veri (Seed) fonksiyonu
export function seedDatabase() {
  if (!seedPromise) {
    seedPromise = seedDatabaseOnce().catch((error) => {
      seedPromise = null; // Başarısız deneme önbellekte kalmasın, tekrar denenebilsin
      throw error;
    });
  }
  return seedPromise;
}

const DEFAULT_SPLIT = {
  Push: [
    { name: 'Bench Press', targetMuscle: 'Chest', equipmentType: 'barbell', incrementStep: 2.5 },
    { name: 'Incline Dumbbell Press', targetMuscle: 'Chest', equipmentType: 'dumbbell', incrementStep: 2 },
    { name: 'Dumbbell Lateral Raise', targetMuscle: 'Shoulders', equipmentType: 'dumbbell', incrementStep: 1 },
  ],
  Pull: [
    { name: 'Lat Pulldown', targetMuscle: 'Back', equipmentType: 'cable', incrementStep: 2.5 },
    { name: 'Barbell Row', targetMuscle: 'Back', equipmentType: 'barbell', incrementStep: 2.5 },
  ],
  Legs: [
    { name: 'Barbell Squat', targetMuscle: 'Legs', equipmentType: 'barbell', incrementStep: 2.5 },
    { name: 'Leg Press', targetMuscle: 'Legs', equipmentType: 'machine', incrementStep: 5 },
  ],
};

async function seedDatabaseOnce() {
  await db.transaction('rw', db.routines, db.exercises, db.sets, db.meta, async () => {
    await mergeDuplicateExercises();

    // Kullanıcı tüm günleri silse bile varsayılanlar geri gelmez.
    if (await db.meta.get('seeded')) return;

    // Günler yoksa varsayılan Push/Pull/Legs'i oluştur
    if ((await db.routines.count()) === 0) {
      for (const [routineName, items] of Object.entries(DEFAULT_SPLIT)) {
        const routineId = await db.routines.add({ name: routineName });
        for (const item of items) {
          // Eski (v1) veritabanından kalan, güne bağlanmamış egzersizi sahiplen
          const orphan = await db.exercises
            .where('name').equals(item.name)
            .and((ex) => ex.routineId == null)
            .first();
          if (orphan) await db.exercises.update(orphan.id, { routineId });
          else await db.exercises.add({ ...item, routineId });
        }
      }
    }
    await db.meta.put({ key: 'seeded', value: true });
  });
}

/**
 * Aynı gündeki aynı isimli aktif egzersizleri birleştirir. Çift kayıt arşivlenir ve
 * ona bağlı setler kalan kayda TAŞINIR, böylece ilerleme geçmişi bölünmez.
 */
async function mergeDuplicateExercises() {
  const active = (await db.exercises.toArray()).filter(isActive).sort((a, b) => a.id - b.id);
  const keepers = new Map();
  const duplicates = [];
  for (const exercise of active) {
    const key = `${exercise.routineId ?? ''}|${normalizeName(exercise.name)}`;
    const keptId = keepers.get(key);
    if (keptId == null) keepers.set(key, exercise.id);
    else duplicates.push([exercise.id, keptId]);
  }

  for (const [fromId, toId] of duplicates) {
    await db.sets.where('exerciseId').equals(fromId).modify({ exerciseId: toId });
    await db.exercises.update(fromId, { archived: true });
  }
}

/**
 * Set ekler. date ve timestamp aynı `now`'dan türetilir, gece yarısında tutarlı kalır.
 * Dönüş: `{ id, isPR }`. Rekor: tahmini 1RM, hareketin önceki ısınma dışı en iyisini aşarsa.
 * İlk set, ısınma seti ve 1RM'i hesaplanamayan set (0 kg, 12+ tekrar) rekor sayılmaz.
 */
export async function addSet(exerciseId, value, now = new Date()) {
  const date = toDateString(now);
  return db.transaction('rw', db.workouts, db.sets, async () => {
    const workout = await db.workouts.where('date').equals(date).first();
    const workoutId =
      workout?.id ?? (await db.workouts.add({ date, name: 'Antrenman', isCompleted: false }));

    const history = await db.sets.where('exerciseId').equals(exerciseId).toArray();
    const siblings = history.filter((set) => set.workoutId === workoutId);
    const setNumber = siblings.reduce((max, set) => Math.max(max, set.setNumber ?? 0), 0) + 1;

    const isWarmup = Boolean(value?.isWarmup);
    const current = isWarmup ? null : estimate1RM(value?.weight, value?.reps);
    let isPR = false;
    if (current != null) {
      let best = null;
      for (const set of history) {
        if (set.isWarmup) continue;
        const e1rm = estimate1RM(set.weight, set.reps);
        if (e1rm != null && (best == null || e1rm > best)) best = e1rm;
      }
      isPR = best != null && current > best;
    }

    const id = await db.sets.add({
      ...value,
      isWarmup,
      workoutId,
      exerciseId,
      setNumber,
      timestamp: now.getTime(),
    });
    return { id, isPR };
  });
}

/** Başka ekranda silinmiş bir seti "güncellendi" sanmamak için varlık kontrolü yapar. */
export async function updateSet(setId, value) {
  await db.transaction('rw', db.sets, async () => {
    if (!(await db.sets.get(setId))) {
      throw new Error('Set bulunamadı; başka bir ekranda silinmiş olabilir.');
    }
    await db.sets.update(setId, value);
  });
}

/** Seti siler ve aynı antrenmandaki aynı egzersizin setlerini 1..n olarak yeniden numaralar. */
export async function deleteSetAndRenumber(setId) {
  await db.transaction('rw', db.sets, async () => {
    const target = await db.sets.get(setId);
    if (!target) return;
    await db.sets.delete(setId);

    const siblings = await db.sets
      .where('workoutId').equals(target.workoutId)
      .and((set) => set.exerciseId === target.exerciseId)
      .toArray();
    siblings.sort((a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0) || a.timestamp - b.timestamp);
    for (const [index, set] of siblings.entries()) {
      if (set.setNumber !== index + 1) await db.sets.update(set.id, { setNumber: index + 1 });
    }
  });
}

/**
 * Silinen bir seti (geri al) aynı id ile geri koyar ve kardeşlerini 1..n numaralar.
 * Arada yeni set eklenmiş olsa bile geri gelen set eski sırasına döner.
 */
export async function restoreSet(set) {
  await db.transaction('rw', db.sets, async () => {
    await db.sets.put(set);
    const siblings = await db.sets
      .where('workoutId').equals(set.workoutId)
      .and((other) => other.exerciseId === set.exerciseId)
      .toArray();
    // Eşit numarada geri yüklenen set önce gelir (eski yerini geri alır).
    const restoredFirst = (a, b) => (a.id === set.id ? -1 : b.id === set.id ? 1 : 0);
    siblings.sort(
      (a, b) =>
        (a.setNumber ?? 0) - (b.setNumber ?? 0) || restoredFirst(a, b) || a.timestamp - b.timestamp,
    );
    for (const [index, sibling] of siblings.entries()) {
      if (sibling.setNumber !== index + 1) await db.sets.update(sibling.id, { setNumber: index + 1 });
    }
  });
}

function validateRepRange(repMin, repMax) {
  for (const value of [repMin, repMax]) {
    if (!Number.isInteger(value) || value < REP_LIMITS.min || value > REP_LIMITS.max) {
      throw new Error(`Tekrar aralığı ${REP_LIMITS.min}–${REP_LIMITS.max} arasında tam sayı olmalı.`);
    }
  }
  if (repMin > repMax) throw new Error('En az tekrar, en fazla tekrardan büyük olamaz.');
}

function requireName(name, message) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

/**
 * Aynı günde aynı isim varsa yenisini açmaz; arşivliyse geri getirir (geçmiş korunur).
 * Yeni hareket günün sonuna eklenir (`order` = gündeki en büyük + 1).
 * Dönüş: egzersiz id'si.
 */
export async function addExercise({
  name,
  routineId,
  targetMuscle = 'Genel',
  equipmentType = 'other',
  incrementStep = 2.5,
  repMin,
  repMax,
}) {
  if (routineId == null) throw new Error('Önce bir antrenman günü seçmelisin.');
  const trimmed = requireName(name, 'Hareket adı boş olamaz.');
  if (repMin != null || repMax != null) {
    validateRepRange(repMin ?? EXERCISE_DEFAULTS.repMin, repMax ?? EXERCISE_DEFAULTS.repMax);
  }

  return db.transaction('rw', db.exercises, async () => {
    const inRoutine = await db.exercises.where('routineId').equals(routineId).toArray();
    // Aktif kayıt varsa o döner; arşivli eşi ancak aktif yoksa geri getirilir (çift kayıt olmasın).
    const sameName = inRoutine.filter((ex) => normalizeName(ex.name) === normalizeName(trimmed));
    const match = sameName.find(isActive) ?? sameName[0];
    if (match) {
      if (match.archived) await db.exercises.update(match.id, { archived: false });
      return match.id;
    }
    const order = inRoutine.reduce((max, ex) => Math.max(max, ex.order ?? ex.id), -1) + 1;
    const record = { name: trimmed, targetMuscle, equipmentType, incrementStep, routineId, order };
    if (repMin != null) record.repMin = repMin;
    if (repMax != null) record.repMax = repMax;
    return db.exercises.add(record);
  });
}

/**
 * Hareket ayarlarını günceller: `name`, `repMin`, `repMax`, `restSeconds`, `note`, `barWeight`.
 * Diğer alanlar yok sayılır. Geçersiz değerde Türkçe mesajla hata fırlatır.
 */
export async function updateExercise(id, patch = {}) {
  await db.transaction('rw', db.exercises, db.customPool, async () => {
    const current = await db.exercises.get(id);
    if (!current) throw new Error('Hareket bulunamadı.');
    const changes = {};

    if ('name' in patch) {
      const trimmed = requireName(patch.name, 'Hareket adı boş olamaz.');
      const inRoutine =
        current.routineId == null
          ? []
          : await db.exercises.where('routineId').equals(current.routineId).toArray();
      const clash = inRoutine.some(
        (ex) => ex.id !== id && isActive(ex) && normalizeName(ex.name) === normalizeName(trimmed),
      );
      if (clash) throw new Error('Bu günde aynı isimde hareket var.');
      changes.name = trimmed;
    }

    if ('repMin' in patch || 'repMax' in patch) {
      const merged = withExerciseDefaults(current);
      const repMin = 'repMin' in patch ? patch.repMin : merged.repMin;
      const repMax = 'repMax' in patch ? patch.repMax : merged.repMax;
      validateRepRange(repMin, repMax);
      if ('repMin' in patch) changes.repMin = repMin;
      if ('repMax' in patch) changes.repMax = repMax;
    }

    if ('restSeconds' in patch) {
      const rest = patch.restSeconds;
      if (rest !== null && (!Number.isInteger(rest) || rest < 0)) {
        throw new Error('Dinlenme süresi geçersiz.');
      }
      changes.restSeconds = rest;
    }

    if ('note' in patch) {
      const note = String(patch.note ?? '');
      if (note.length > NOTE_MAX_LENGTH) {
        throw new Error(`Not en fazla ${NOTE_MAX_LENGTH} karakter olabilir.`);
      }
      changes.note = note;
    }

    if ('barWeight' in patch) {
      if (!BAR_WEIGHTS.includes(patch.barWeight)) throw new Error('Bar ağırlığı geçersiz.');
      changes.barWeight = patch.barWeight;
    }

    if (Object.keys(changes).length > 0) await db.exercises.update(id, changes);

    // Kas grubu hareketin kendisine aittir: aynı isimli tüm kopyalar (her gün) ve kişisel havuz kaydı
    // birlikte güncellenir, böylece haftalık istatistikler geriye dönük doğru gruba geçer.
    if ('targetMuscle' in patch) {
      const muscle = requireName(patch.targetMuscle, 'Kas grubu boş olamaz.');
      const nameKey = normalizeName(changes.name ?? current.name);
      await db.exercises
        .filter((ex) => normalizeName(ex.name) === nameKey)
        .modify({ targetMuscle: muscle });
      await db.customPool.where('nameKey').equals(nameKey).modify({ targetMuscle: muscle });
    }
  });
}

/** Günü yeniden adlandırır; aktif başka bir günle (büyük/küçük harf duyarsız) çakışamaz. */
export async function renameRoutine(id, name) {
  const trimmed = requireName(name, 'Gün adı boş olamaz.');
  await db.transaction('rw', db.routines, async () => {
    if (!(await db.routines.get(id))) throw new Error('Gün bulunamadı.');
    const routines = await db.routines.toArray();
    const clash = routines.some(
      (routine) =>
        routine.id !== id && isActive(routine) && normalizeName(routine.name) === normalizeName(trimmed),
    );
    if (clash) throw new Error('Bu isimde bir gün zaten var.');
    await db.routines.update(id, { name: trimmed });
  });
}

/** Yeni gün ekler; aynı isimde aktif gün varsa reddeder (arşivli aynı isim engel olmaz). Dönüş: id. */
export async function addRoutine(name) {
  const trimmed = requireName(name, 'Gün adı boş olamaz.');
  return db.transaction('rw', db.routines, async () => {
    const routines = await db.routines.toArray();
    const clash = routines.some(
      (routine) => isActive(routine) && normalizeName(routine.name) === normalizeName(trimmed),
    );
    if (clash) throw new Error('Bu isimde bir gün zaten var.');
    return db.routines.add({ name: trimmed });
  });
}

/** Verilen id sırasını 0..n-1 olarak `order` alanına yazar (yalnızca o güne ait hareketler). */
export async function reorderExercises(routineId, orderedIds) {
  await db.transaction('rw', db.exercises, async () => {
    const inRoutine = new Set(await db.exercises.where('routineId').equals(routineId).primaryKeys());
    if (!orderedIds.every((id) => inRoutine.has(id))) {
      throw new Error('Sıralanan hareket bu güne ait değil.');
    }
    for (const [index, id] of orderedIds.entries()) {
      await db.exercises.update(id, { order: index });
    }
  });
}

/** Soft delete: geçmişteki setler isimleriyle birlikte okunabilir kalır. */
export function archiveExercise(exerciseId) {
  return db.exercises.update(exerciseId, { archived: true });
}

/** Günü ve ona bağlı hareketleri tek transaction'da arşivler. */
export async function archiveRoutine(routineId) {
  await db.transaction('rw', db.routines, db.exercises, async () => {
    await db.exercises.where('routineId').equals(routineId).modify({ archived: true });
    await db.routines.update(routineId, { archived: true });
  });
}

// ---- Sayfalama / istatistik sorguları (salt okuma) ----

/** timestamp >= ts olan tüm setler. */
export function getSetsSince(ts) {
  return db.sets.where('timestamp').aboveOrEqual(ts).toArray();
}

/** from <= timestamp < to. */
export function getSetsBetween(from, to) {
  return db.sets.where('timestamp').between(from, to, true, false).toArray();
}

/** En eski setin zaman damgası ya da null. */
export async function oldestSetTimestamp() {
  const first = await db.sets.orderBy('timestamp').first();
  return first?.timestamp ?? null;
}

/**
 * Her hareket için ts'den önceki SON antrenman gününün en iyi 1RM'i (ısınma hariç).
 * Dönüş: Map<exerciseId, number>; kaydı olmayan hareket haritada yer almaz.
 */
export async function lastBestBefore(exerciseIds, ts) {
  const result = new Map();
  for (const exerciseId of exerciseIds) {
    const sets = await db.sets
      .where('exerciseId').equals(exerciseId)
      .and((set) => set.timestamp < ts && !set.isWarmup && estimate1RM(set.weight, set.reps) != null)
      .toArray();
    if (!sets.length) continue;
    const lastTs = Math.max(...sets.map((set) => set.timestamp));
    const day = new Date(lastTs);
    day.setHours(0, 0, 0, 0);
    const dayStart = day.getTime();
    const best = Math.max(
      ...sets.filter((set) => set.timestamp >= dayStart).map((set) => estimate1RM(set.weight, set.reps)),
    );
    result.set(exerciseId, best);
  }
  return result;
}

/** Her hareket için ts'den önceki TÜM zamanların en iyi 1RM'i (ısınma hariç). Günün özetindeki rekor için. */
export async function bestBefore(exerciseIds, ts) {
  const result = new Map();
  for (const exerciseId of exerciseIds) {
    let best = null;
    await db.sets
      .where('exerciseId').equals(exerciseId)
      .each((set) => {
        if (set.timestamp >= ts || set.isWarmup) return;
        const value = estimate1RM(set.weight, set.reps);
        if (value != null && (best == null || value > best)) best = value;
      });
    if (best != null) result.set(exerciseId, best);
  }
  return result;
}

// ---- Kişisel hareket havuzu ----

export async function listCustomPool() {
  const rows = await db.customPool.toArray();
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

/**
 * Elle eklenen hareketi kişisel havuza ekler ya da ayarlarını günceller.
 * Ad sabit havuzdaysa eklenmez ve null döner. Dönüş: havuz kaydının id'si.
 */
export async function upsertCustomPoolItem(item) {
  const nameKey = normalizeName(item?.name);
  if (!nameKey) throw new Error('Hareket adı boş olamaz.');
  if (STATIC_POOL_KEYS.has(nameKey)) return null;
  return db.transaction('rw', db.customPool, async () => {
    const existing = await db.customPool.where('nameKey').equals(nameKey).first();
    const row = customPoolRow({ ...existing, ...item, name: existing?.name ?? item.name }, nameKey, existing?.createdAt ?? Date.now());
    if (existing) {
      await db.customPool.update(existing.id, row);
      return existing.id;
    }
    return db.customPool.add(row);
  });
}

/** Havuzdan kaldırır; günlerdeki hareketler etkilenmez. */
export function removeCustomPoolItem(id) {
  return db.customPool.delete(id);
}
