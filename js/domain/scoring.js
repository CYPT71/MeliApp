const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const minutesUntil = (deadline, now = Date.now()) => {
  if (!deadline) return Number.POSITIVE_INFINITY;
  return Math.max(0, (new Date(deadline).getTime() - new Date(now).getTime()) / 60000);
};

export const computeUrgency = ({ task, now = Date.now() }) => {
  if (!task.deadline) return 0;
  const minutes = minutesUntil(task.deadline, now);
  if (minutes <= 0) return 10;
  if (minutes <= 6 * 60) return 9;
  if (minutes <= 24 * 60) return 7;
  if (minutes <= 3 * 24 * 60) return 5;
  if (minutes <= 7 * 24 * 60) return 3;
  return 1;
};

export const computeEnergyFit = ({ task, energy }) => {
  const current = Number(energy ?? 5);
  const required = Number(task.preferredEnergyMin ?? task.difficulty ?? 5);
  return clamp(5 - Math.abs(current - required), -5, 5);
};

export const computeContextFit = ({ task, freeWindowMinutes }) => {
  const estimate = Number(task.estimateMinutes ?? 0);
  if (!Number.isFinite(freeWindowMinutes) || freeWindowMinutes <= 0) return -10;
  if (estimate <= freeWindowMinutes) return 4;
  return task.splittable ? 1 : -6;
};

export const computePriorityScore = ({ task, energy, freeWindowMinutes, now = Date.now() }) => {
  const urgency = computeUrgency({ task, now });
  const importance = Number(task.importance ?? 1) * 2;
  const energyFit = computeEnergyFit({ task, energy });
  const contextFit = computeContextFit({ task, freeWindowMinutes });
  const startedBonus = Number(task.progress ?? 0) > 0 ? 2 : 0;
  const durationPenalty = Number(task.estimateMinutes ?? 0) > 120 ? 1 : 0;

  return urgency + importance + energyFit + contextFit + startedBonus - durationPenalty;
};
