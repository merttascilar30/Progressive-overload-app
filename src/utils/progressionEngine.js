// src/utils/progressionEngine.js

// Brzycki Formülü ile tahmini 1RM (Tek Tekrar Maksimum) hesaplama
export const calculate1RM = (weight, reps) => {
    if (reps === 1) return weight;
    return weight * (1 + reps / 30);
  };
  
  // Çift İlerlemeli (Double Progression) Öneri Motoru
  export const getSetRecommendation = (lastSessionSet, incrementStep = 2.5) => {
    if (!lastSessionSet) {
      return "İlk antrenman: Formunu bozmayacağın kontrollü bir ağırlık seç.";
    }
  
    const { weight, reps, rir } = lastSessionSet;
  
    // Eğer son antrenmanda tükenişe (RIR 0) gidilmemişse, ağırlık artır
    if (rir >= 1) {
      return `Geçen sefer: ${weight}kg x ${reps} (RIR: ${rir}). Hedef: ${weight + incrementStep}kg x 8-10 tekrar.`;
    } 
    
    // Eğer RIR 0 ise (tükeniş), ağırlığı sabit tutup tekrarı 1 artırmaya çalış
    return `Geçen sefer tükenişe ulaştın (${weight}kg x ${reps}). Hedef: ${weight}kg x ${reps + 1} tekrar.`;
  };