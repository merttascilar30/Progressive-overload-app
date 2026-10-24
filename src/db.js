import Dexie from 'dexie';

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

/** Set ekler. date ve timestamp aynı `now`'dan türetilir, gece yarısında tutarlı kalır. */
export async function addSet(exerciseId, value, now = new Date()) {
  const date = toDateString(now);
  return db.transaction('rw', db.workouts, db.sets, async () => {
    const workout = await db.workouts.where('date').equals(date).first();
    const workoutId =
      workout?.id ?? (await db.workouts.add({ date, name: 'Antrenman', isCompleted: false }));

    // Sadece bugünün setlerini oku (egzersizin tüm geçmişini değil)
    const siblings = await db.sets
      .where('workoutId').equals(workoutId)
      .and((set) => set.exerciseId === exerciseId)
      .toArray();
    const setNumber = siblings.reduce((max, set) => Math.max(max, set.setNumber ?? 0), 0) + 1;

    return db.sets.add({ ...value, workoutId, exerciseId, setNumber, timestamp: now.getTime() });
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
 * Aynı günde aynı isim varsa yenisini açmaz; arşivliyse geri getirir (geçmiş korunur).
 * Dönüş: egzersiz id'si.
 */
export async function addExercise({
  name,
  routineId,
  targetMuscle = 'Genel',
  equipmentType = 'other',
  incrementStep = 2.5,
}) {
  if (routineId == null) throw new Error('Önce bir antrenman günü seçmelisin.');
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new Error('Hareket adı boş olamaz.');

  return db.transaction('rw', db.exercises, async () => {
    const inRoutine = await db.exercises.where('routineId').equals(routineId).toArray();
    const match = inRoutine.find((ex) => normalizeName(ex.name) === normalizeName(trimmed));
    if (match) {
      if (match.archived) await db.exercises.update(match.id, { archived: false });
      return match.id;
    }
    return db.exercises.add({ name: trimmed, targetMuscle, equipmentType, incrementStep, routineId });
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