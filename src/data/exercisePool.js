// Ekipman tipine göre varsayılan ağırlık artış adımı (kg). Manuel eklemede kullanılır.
export const EQUIPMENT_TYPES = [
  { value: 'barbell', label: 'Barbell', step: 2.5 },
  { value: 'dumbbell', label: 'Dumbbell', step: 2 },
  { value: 'machine', label: 'Makine', step: 5 },
  { value: 'plate_loaded', label: 'Plaka yüklemeli makine', step: 5 },
  { value: 'cable', label: 'Kablo', step: 2.5 },
  { value: 'bodyweight', label: 'Vücut ağırlığı', step: 2.5 },
  { value: 'other', label: 'Diğer', step: 2.5 },
]

// Bileşik hareketler 6–8, baldır 12–20, geri kalan izolasyon 10–15.
const COMPOUND_NAMES = new Set([
  'Plate Loaded Incline Chest Press',
  'Plate Loaded Chest Press',
  'Lat Pulldown',
  'Cable Row',
  'Plate Loaded Wide Grip Row',
  'T-Bar Row',
  'Shoulder Press Machine',
  'Hack Squat',
])

function item(name, muscle, equipmentType, incrementStep) {
  let repMin = 10
  let repMax = 15
  if (COMPOUND_NAMES.has(name)) {
    repMin = 6
    repMax = 8
  } else if (name === 'Calf Raises Machine') {
    repMin = 12
    repMax = 20
  }
  return { name, muscle, equipmentType, incrementStep, repMin, repMax }
}

export const EXERCISE_POOL = [
  {
    category: 'Göğüs & Triceps',
    items: [
      item('Plate Loaded Incline Chest Press', 'Chest', 'plate_loaded', 5),
      item('Plate Loaded Chest Press', 'Chest', 'plate_loaded', 5),
      item('Chest Fly Machine', 'Chest', 'machine', 5),
      item('Triceps Pushdown', 'Triceps', 'cable', 2.5),
      item('Triceps Lying Cable Extension', 'Triceps', 'cable', 2.5),
      item('Tek Kol Triceps Pushdown', 'Triceps', 'cable', 1.25),
    ],
  },
  {
    category: 'Sırt & Biceps',
    items: [
      item('Lat Pulldown', 'Back', 'cable', 2.5),
      item('Cable Row', 'Back', 'cable', 2.5),
      item('Plate Loaded Wide Grip Row', 'Back', 'plate_loaded', 5),
      item('T-Bar Row', 'Back', 'plate_loaded', 5),
      item('Barbell Curl', 'Biceps', 'barbell', 2.5),
      item('Dumbbell Curl', 'Biceps', 'dumbbell', 1),
      item('Hammer Curl', 'Biceps', 'dumbbell', 1),
    ],
  },
  {
    category: 'Omuz & Bacak',
    items: [
      item('Shoulder Press Machine', 'Shoulders', 'machine', 5),
      item('Lateral Raise', 'Shoulders', 'dumbbell', 1),
      item('Cable Rear Delt Fly', 'Rear Delts', 'cable', 1.25),
      item('Hack Squat', 'Quads', 'plate_loaded', 5),
      item('Leg Extension', 'Quads', 'machine', 5),
      item('Seated Leg Curl', 'Hamstrings', 'machine', 5),
      item('Calf Raises Machine', 'Calves', 'machine', 5),
    ],
  },
]
