export const timeValue = value => value ? new Date(value).getTime() : NaN;
export const remainingWork = task => {
  const estimate = Number(task.estimateMinutes ?? 25);
  const progress = Math.max(0, Math.min(1, Number(task.progress ?? 0) || 0));
  return Number.isFinite(estimate) && estimate > 0 ? Math.ceil(estimate * (1 - progress)) : 0;
};
export const exclusionReason = (task, now) => {
  if (task.deadline && !Number.isFinite(timeValue(task.deadline))) return 'invalid';
  if (['completed', 'cancelled', 'deleted'].includes(task.status) || Number(task.progress ?? 0) >= 1) return 'done';
  if (task.source === 'calendar-auto' && Number.isFinite(timeValue(task.sourceEventEnd))) {
    if (timeValue(task.sourceEventEnd) <= now) return 'past';
  } else if (Number.isFinite(timeValue(task.deadline)) && timeValue(task.deadline) <= now) return 'past';
  return remainingWork(task) <= 0 ? 'empty' : null;
};
export const taskWindow = task => {
  const earliest = timeValue(task.earliestStart);
  const latest = timeValue(task.latestEnd);
  const deadline = timeValue(task.deadline);
  return {
    start: Number.isFinite(earliest) ? earliest : -Infinity,
    end: task.source === 'calendar-auto' && Number.isFinite(latest) ? latest : Math.min(Number.isFinite(latest) ? latest : Infinity, Number.isFinite(deadline) ? deadline : Infinity)
  };
};
