const DAY = 24 * 60 * 60 * 1000;

export const EISENHOWER_QUADRANTS = Object.freeze({
  do: {
    id: "do",
    title: "À faire maintenant",
    subtitle: "Important et urgent",
    icon: "🔥",
    className: "eisenhower--do"
  },
  plan: {
    id: "plan",
    title: "À planifier",
    subtitle: "Important, pas urgent",
    icon: "📅",
    className: "eisenhower--plan"
  },
  quick: {
    id: "quick",
    title: "Rapide / délégable",
    subtitle: "Urgent, moins important",
    icon: "⚡",
    className: "eisenhower--quick"
  },
  later: {
    id: "later",
    title: "À garder léger",
    subtitle: "Ni urgent ni important",
    icon: "🌿",
    className: "eisenhower--later"
  }
});

export const normalizeImportance = (value) =>
  Math.min(5, Math.max(1, Number.isFinite(Number(value)) ? Number(value) : 3));

export const isImportant = (task) => normalizeImportance(task?.importance) >= 4;

export const isUrgent = (task, now = Date.now(), urgentWithinDays = 3) => {
  if (task?.status === "completed") return false;
  if (!task?.deadline) return false;
  const deadline = new Date(task.deadline).getTime();
  if (!Number.isFinite(deadline)) return false;
  return deadline - Number(now) <= urgentWithinDays * DAY;
};

export const eisenhowerQuadrant = (task, now = Date.now()) => {
  const important = isImportant(task);
  const urgent = isUrgent(task, now);
  if (important && urgent) return EISENHOWER_QUADRANTS.do;
  if (important) return EISENHOWER_QUADRANTS.plan;
  if (urgent) return EISENHOWER_QUADRANTS.quick;
  return EISENHOWER_QUADRANTS.later;
};

export const groupTasksByEisenhower = (tasks = [], now = Date.now()) => {
  const groups = Object.fromEntries(Object.keys(EISENHOWER_QUADRANTS).map((id) => [id, []]));
  for (const task of tasks) {
    const quadrant = eisenhowerQuadrant(task, now);
    groups[quadrant.id].push(task);
  }
  return groups;
};
