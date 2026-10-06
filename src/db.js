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

let seedPromise = null;

// Uygulama ilk açıldığında çalışacak örnek veri (Seed) fonksiyonu
export async function seedDatabase() {
  if (!seedPromise) {
    seedPromise = seedDatabaseOnce();
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
  await db.transaction('rw', db.routines, db.exercises, async () => {
    // Çift kayıtları temizle
    const all = await db.exercises.toArray();
    const seen = new Set();
    const duplicateIds = [];
    for (const exercise of all) {
      if (seen.has(exercise.name)) duplicateIds.push(exercise.id);
      else seen.add(exercise.name);
    }
    if (duplicateIds.length) await db.exercises.bulkDelete(duplicateIds);

    // Günler yoksa varsayılan Push/Pull/Legs'i oluştur
    if ((await db.routines.count()) === 0) {
      for (const [routineName, items] of Object.entries(DEFAULT_SPLIT)) {
        const routineId = await db.routines.add({ name: routineName });
        for (const item of items) {
          const existing = await db.exercises.where('name').equals(item.name).first();
          if (existing) {
            // Eski veritabanından gelen egzersizi güne bağla
            if (existing.routineId == null) {
              await db.exercises.update(existing.id, { routineId });
            }
          } else {
            await db.exercises.add({ ...item, routineId });
          }
        }
      }
    }
  });
}