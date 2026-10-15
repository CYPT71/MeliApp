export const ENERGY_MOODS = Object.freeze([
  { max: 12, emoji: "😠", label: "À plat" },
  { max: 28, emoji: "😟", label: "Très basse" },
  { max: 45, emoji: "🙁", label: "Basse" },
  { max: 58, emoji: "😕", label: "Moyenne basse" },
  { max: 72, emoji: "😐", label: "Stable" },
  { max: 86, emoji: "🙂", label: "Bonne" },
  { max: 100, emoji: "😄", label: "Très bonne" }
]);

export const clampEnergyPercent = (value) =>
  Math.min(100, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 50));

export const energyScoreToPercent = (score) =>
  Math.round(Math.min(10, Math.max(1, Number(score) || 5)) * 10);

export const energyPercentToScore = (percent) => {
  const value = clampEnergyPercent(percent);
  return Math.min(10, Math.max(1, value / 10));
};

export const energyMood = (percent) => {
  const value = clampEnergyPercent(percent);
  return ENERGY_MOODS.find((mood) => value <= mood.max) ?? ENERGY_MOODS.at(-1);
};

export const energyGuidance = (percent) => {
  const value = clampEnergyPercent(percent);
  if (value <= 20) return "Mode doux : récupération, tâches minuscules et aucune pression inutile.";
  if (value <= 40) return "On réduit la friction : petites étapes et sessions courtes.";
  if (value <= 65) return "Énergie moyenne : rythme normal, sans surcharger la journée.";
  if (value <= 85) return "Bonne énergie : une tâche exigeante devient raisonnable.";
  return "Très bonne énergie : fenêtre favorable pour du travail profond si tu en as envie.";
};
