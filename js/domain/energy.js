export const ENERGY_MOODS = Object.freeze([
  { max: 12, emoji: "🪫", label: "Vidée" },
  { max: 28, emoji: "🫠", label: "En vrac" },
  { max: 45, emoji: "🐢", label: "Au ralenti" },
  { max: 58, emoji: "🌿", label: "Tranquille" },
  { max: 72, emoji: "⚡", label: "En forme" },
  { max: 86, emoji: "🚀", label: "À fond" },
  { max: 100, emoji: "🤯", label: "Cerveau en feu" }
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
  return "Énergie maximale : profite du boost sans remplir toute ta journée juste parce que ton cerveau a décidé de lancer les feux d’artifice.";
};
