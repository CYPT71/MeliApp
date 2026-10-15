import { computePriorityScore, minutesUntil } from "./scoring.js";
import { findFreeWindows, splitTask } from "./scheduling.js";

const MINUTE = 60_000;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const asNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const COURSE_HINTS = /(\bcours\b|classe|\btd\b|\btp\b|\bcm\b|devoir|\bdm\b|partiel|examen|exam|révision|revision|rendre|mémoire|memoire|dissertation|exposé|expose|université|universite|\bfac\b|école|ecole|professeur|matière|matiere|chapitre|fiche)/i;

export const taskContext = (task = {}) => {
  const explicit = String(task.context ?? task.kind ?? task.category ?? "").toLowerCase();
  if (["cours", "school", "study", "academic"].includes(explicit)) return "cours";
  if (["perso", "personal", "home"].includes(explicit)) return "perso";
  const searchable = [task.title, task.projectTitle, task.sourceTitle, task.description].filter(Boolean).join(" ");
  return COURSE_HINTS.test(searchable) ? "cours" : "perso";
};

export const energyPolicy = (energy = 5) => {
  const level = clamp(asNumber(energy, 5), 1, 10);
  if (level <= 2) return { level, workMinutes: 12, breakMinutes: 10, maxDifficulty: 2, slackRatio: 0.3, label: "énergie très basse" };
  if (level <= 4) return { level, workMinutes: 22, breakMinutes: 10, maxDifficulty: 3, slackRatio: 0.22, label: "énergie basse" };
  if (level <= 7) return { level, workMinutes: 40, breakMinutes: 10, maxDifficulty: 4, slackRatio: 0.15, label: "énergie moyenne" };
  return { level, workMinutes: 52, breakMinutes: 12, maxDifficulty: 5, slackRatio: 0.1, label: "énergie haute" };
};

const deadlineWeight = (task, now) => {
  if (!task.deadline) return 0;
  const minutes = minutesUntil(task.deadline, now);
  if (minutes <= 0) return 30;
  if (minutes <= 6 * 60) return 22;
  if (minutes <= 24 * 60) return 16;
  if (minutes <= 3 * 24 * 60) return 10;
  if (minutes <= 7 * 24 * 60) return 5;
  return 1;
};

const stableVariantJitter = (taskId, variant = 0, cursor = 0) => {
  if (!variant) return 0;
  const text = `${taskId ?? "task"}:${variant}:${Math.floor(Number(cursor) / (30 * MINUTE))}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000 * 2.4 - 1.2;
};

export const adaptiveTaskScore = ({ task, energy, freeWindowMinutes, now = Date.now(), lastContext = null, variant = 0 }) => {
  const policy = energyPolicy(energy);
  const base = computePriorityScore({ task, energy, freeWindowMinutes, now });
  const context = taskContext(task);
  const deadline = deadlineWeight(task, now);
  const difficulty = asNumber(task.difficulty, 3);
  const energyPenalty = difficulty > policy.maxDifficulty ? (difficulty - policy.maxDifficulty) * 4 : 0;
  const deadlineOverride = task.deadline && minutesUntil(task.deadline, now) <= 24 * 60 ? Math.max(0, energyPenalty - 2) : energyPenalty;
  const alternation = lastContext && lastContext !== context ? 1.5 : 0;
  const courseDeadlineBonus = context === "cours" && task.deadline ? 2 : 0;
  const variation = stableVariantJitter(task.id, variant, now);
  return base + deadline + alternation + courseDeadlineBonus + variation - deadlineOverride;
};

const taskRemainingMinutes = (task) => {
  const estimate = Math.max(5, asNumber(task.estimateMinutes, 25));
  const progress = clamp(asNumber(task.progress, 0), 0, 1);
  return Math.max(5, Math.ceil((estimate * (1 - progress)) / 5) * 5);
};

const eligibleTasks = (tasks = []) => tasks
  .filter((task) => task && task.status !== "completed" && !task.parentTaskId)
  .map((task) => ({ ...task, remainingMinutes: taskRemainingMinutes(task) }));

const pushBlock = (blocks, block) => {
  if (block.end <= block.start) return;
  blocks.push({
    ...block,
    startIso: new Date(block.start).toISOString(),
    endIso: new Date(block.end).toISOString(),
    minutes: Math.max(1, Math.round((block.end - block.start) / MINUTE))
  });
};

export const buildAdaptiveDayPlan = ({
  tasks = [],
  events = [],
  energy = 5,
  from = Date.now(),
  to,
  bufferMinutes = 10,
  dayEndHour = 23,
  variant = 0
} = {}) => {
  const start = new Date(from).getTime();
  const fallbackEnd = new Date(start);
  fallbackEnd.setHours(dayEndHour, 0, 0, 0);
  const end = to ? new Date(to).getTime() : fallbackEnd.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { blocks: [], unscheduled: [], policy: energyPolicy(energy) };

  const policy = energyPolicy(energy);
  const active = eligibleTasks(tasks);
  const remainingById = new Map(active.map((task) => [task.id, task.remainingMinutes]));
  const blocks = [];
  let lastContext = null;

  const relevantEvents = (events ?? [])
    .filter((event) => event?.start && event?.end)
    .map((event) => ({ ...event, startMs: new Date(event.start).getTime(), endMs: new Date(event.end).getTime() }))
    .filter((event) => Number.isFinite(event.startMs) && Number.isFinite(event.endMs) && event.endMs > start && event.startMs < end)
    .sort((a, b) => a.startMs - b.startMs);

  const windows = findFreeWindows({ events: relevantEvents, from: new Date(start), to: new Date(end), bufferMinutes });
  for (const event of relevantEvents) {
    pushBlock(blocks, {
      type: "event",
      start: Math.max(start, event.startMs),
      end: Math.min(end, event.endMs),
      title: event.title ?? event.subject ?? "Événement agenda",
      sourceId: event.id ?? null,
      reason: "Créneau fixe de l’agenda"
    });
  }

  for (const window of windows) {
    let cursor = window.start;
    const usableEnd = window.end - Math.round(window.minutes * policy.slackRatio) * MINUTE;
    let completedWorkBlocks = 0;

    while (cursor + 5 * MINUTE <= usableEnd) {
      const availableMinutes = Math.floor((usableEnd - cursor) / MINUTE);
      const candidates = active
        .filter((task) => (remainingById.get(task.id) ?? 0) > 0)
        .map((task) => {
          const remaining = remainingById.get(task.id) ?? task.remainingMinutes;
          const cappedTask = { ...task, estimateMinutes: remaining };
          const chunk = splitTask(cappedTask, Math.min(availableMinutes, policy.workMinutes));
          if (!chunk) return null;
          return {
            task,
            context: taskContext(task),
            score: adaptiveTaskScore({ task, energy, freeWindowMinutes: availableMinutes, now: cursor, lastContext, variant }),
            chunkMinutes: Math.min(remaining, chunk.chunkMinutes ?? policy.workMinutes, policy.workMinutes)
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || new Date(a.task.deadline ?? 8640000000000000) - new Date(b.task.deadline ?? 8640000000000000));

      const picked = candidates[0];
      if (!picked) break;
      const workMinutes = Math.max(5, Math.floor(picked.chunkMinutes / 5) * 5);
      const workEnd = Math.min(usableEnd, cursor + workMinutes * MINUTE);
      const deadlineMinutes = picked.task.deadline ? minutesUntil(picked.task.deadline, cursor) : Infinity;
      const reason = deadlineMinutes <= 24 * 60
        ? `Échéance proche · ${picked.context === "cours" ? "cours" : "perso"}`
        : `${picked.context === "cours" ? "Cours" : "Perso"} · adapté à ${policy.label}`;

      pushBlock(blocks, {
        type: "task",
        start: cursor,
        end: workEnd,
        title: picked.task.title,
        taskId: picked.task.id,
        context: picked.context,
        deadline: picked.task.deadline ?? null,
        reason
      });
      remainingById.set(picked.task.id, Math.max(0, (remainingById.get(picked.task.id) ?? 0) - workMinutes));
      lastContext = picked.context;
      cursor = workEnd;
      completedWorkBlocks += 1;

      const stillHasRoom = cursor + 5 * MINUTE < usableEnd;
      if (stillHasRoom && completedWorkBlocks > 0) {
        const pauseMinutes = Math.min(policy.breakMinutes, Math.floor((usableEnd - cursor) / MINUTE));
        if (pauseMinutes >= 5) {
          pushBlock(blocks, {
            type: "break",
            start: cursor,
            end: cursor + pauseMinutes * MINUTE,
            title: policy.level <= 4 ? "Pause récupération" : "Pause",
            reason: policy.level <= 4 ? "Pause renforcée car l’énergie est basse" : "Évite d’enchaîner les blocs sans récupération"
          });
          cursor += pauseMinutes * MINUTE;
        }
      }
    }
  }

  const unscheduled = active
    .map((task) => ({ ...task, remainingMinutes: remainingById.get(task.id) ?? 0 }))
    .filter((task) => task.remainingMinutes > 0)
    .sort((a, b) => adaptiveTaskScore({ task: b, energy, freeWindowMinutes: 60, now: start, variant }) - adaptiveTaskScore({ task: a, energy, freeWindowMinutes: 60, now: start, variant }));

  return {
    policy,
    blocks: blocks.sort((a, b) => a.start - b.start),
    unscheduled,
    generatedAt: new Date().toISOString()
  };
};
