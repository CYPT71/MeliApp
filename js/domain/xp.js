export const xpForTask = ({ minutes = 0, difficulty = 1, importance = 1, started = false }) => {
  const base = Math.max(1, Math.round(minutes / 5));
  const multiplier = Math.max(1, Number(difficulty)) + Math.max(1, Number(importance));
  return base * multiplier + (started ? 5 : 0);
};

export const levelFromXp = (xp = 0) => Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);

export const addXp = (game, amount) => {
  const xp = Math.max(0, Number(game.xp ?? 0) + Math.max(0, Number(amount ?? 0)));
  return { ...game, xp, level: levelFromXp(xp) };
};
