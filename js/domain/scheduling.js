import { computePriorityScore } from "./scoring.js";

const toMs = (value) => new Date(value).getTime();

export const normalizeEvents = (events = []) =>
  events
    .filter((event) => event?.start && event?.end)
    .map((event) => ({ ...event, startMs: toMs(event.start), endMs: toMs(event.end) }))
    .filter((event) => Number.isFinite(event.startMs) && Number.isFinite(event.endMs) && event.endMs > event.startMs)
    .sort((a, b) => a.startMs - b.startMs);

export const findFreeWindows = ({ events = [], from, to, bufferMinutes = 10 }) => {
  const start = toMs(from);
  const end = toMs(to);
  const buffer = Math.max(0, bufferMinutes) * 60000;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];

  const busy = normalizeEvents(events)
    .map((event) => ({ start: Math.max(start, event.startMs - buffer), end: Math.min(end, event.endMs + buffer) }))
    .filter((slot) => slot.end > start && slot.start < end);

  const windows = [];
  let cursor = start;

  for (const slot of busy) {
    if (slot.start > cursor) windows.push({ start: cursor, end: slot.start });
    cursor = Math.max(cursor, slot.end);
  }

  if (cursor < end) windows.push({ start: cursor, end });

  return windows.map((window) => ({
    ...window,
    minutes: Math.max(0, Math.floor((window.end - window.start) / 60000))
  }));
};

export const splitTask = (task, freeWindowMinutes) => {
  const estimate = Number(task.estimateMinutes ?? 0);
  const minimum = Number(task.minimumChunkMinutes ?? 10);

  if (estimate <= freeWindowMinutes) return { ...task, chunkMinutes: estimate };
  if (!task.splittable || freeWindowMinutes < minimum) return null;

  return { ...task, chunkMinutes: Math.max(minimum, Math.floor(freeWindowMinutes)) };
};

export const selectNextAction = ({ tasks = [], energy = 5, freeWindowMinutes = Infinity, now = Date.now() }) =>
  tasks
    .filter((task) => task.status !== "completed")
    .map((task) => ({
      task,
      candidate: splitTask(task, freeWindowMinutes),
      score: computePriorityScore({ task, energy, freeWindowMinutes, now })
    }))
    .filter(({ candidate }) => candidate)
    .sort((a, b) => b.score - a.score || (a.candidate.chunkMinutes ?? Infinity) - (b.candidate.chunkMinutes ?? Infinity))[0]
    ?.candidate ?? null;
