import { exclusionReason, remainingWork, taskWindow } from "./planning-eligibility.js";
import { buildAdaptiveDayPlan, energyPolicy } from "./adaptive-planning.js";

const MINUTE = 60_000;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const clockParts = (value, fallback) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? ""));
  if (!match) return fallback;
  return [clamp(Number(match[1]), 0, 23), clamp(Number(match[2]), 0, 59)];
};

const atClock = (day, parts) => {
  const result = new Date(day);
  result.setHours(parts[0], parts[1], 0, 0);
  return result;
};

const startOfLocalDay = (value) => {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day;
};

export const buildAdaptiveWeekPlan = ({
  tasks = [],
  events = [],
  energy = 5,
  from = Date.now(),
  days = 7,
  dayStart = "08:00",
  dayEnd = "23:00",
  bufferMinutes = 10,
  variant = 0,
  sessionPreferences = {}
} = {}) => {
  const now = new Date(from);
  const firstDay = startOfLocalDay(now);
  const startClock = clockParts(dayStart, [8, 0]);
  const endClock = clockParts(dayEnd, [23, 0]);
  const horizon = clamp(Math.round(number(days, 7)), 1, 14);
  let pending = (tasks ?? [])
    .filter((task) => task && !exclusionReason(task, now.getTime()) && !task.parentTaskId)
    .map((task) => ({ ...task, progress: 0, estimateMinutes: remainingWork(task) }));
  const blocks = [];
  const dayPlans = [];

  for (let index = 0; index < horizon; index += 1) {
    const day = new Date(firstDay);
    day.setDate(firstDay.getDate() + index);
    let start = atClock(day, startClock);
    const end = atClock(day, endClock);
    if (index === 0 && now > start) start = now;
    if (end <= start) {
      dayPlans.push({ date: day.toISOString(), blocks: [], policy: energyPolicy(energy, sessionPreferences) });
      continue;
    }

    const plan = buildAdaptiveDayPlan({
      tasks: pending,
      events,
      energy,
      from: start,
      to: end,
      bufferMinutes,
      sessionPreferences,
      variant: variant + index * 17
    });
    dayPlans.push({ date: day.toISOString(), ...plan });
    blocks.push(...(plan.blocks ?? []));

    const used = new Map();
    for (const block of plan.blocks ?? []) {
      if (block.type !== "task" || !block.taskId) continue;
      used.set(block.taskId, (used.get(block.taskId) ?? 0) + Number(block.minutes ?? 0));
    }
    pending = pending
      .map((task) => ({ ...task, estimateMinutes: Math.max(0, Number(task.estimateMinutes ?? 0) - (used.get(task.id) ?? 0)) }))
      .filter((task) => task.estimateMinutes > 0);
  }

  return {
    variant,
    days: horizon,
    policy: energyPolicy(energy, sessionPreferences),
    blocks: blocks.sort((a, b) => new Date(a.startIso) - new Date(b.startIso)),
    dayPlans,
    unscheduled: pending.map((task) => ({ ...task, remainingMinutes: Number(task.estimateMinutes ?? 0), reason: taskWindow(task).end < new Date(from).getTime() + horizon * 86400000 ? "Travail restant incompatible avec l’échéance ou la fenêtre" : "Capacité de la semaine insuffisante" })),
    excluded: (tasks ?? []).filter(task => task && exclusionReason(task, now.getTime())).map(task => ({ id: task.id, title: task.title, reason: exclusionReason(task, now.getTime()) })),
    generatedAt: new Date().toISOString()
  };
};
