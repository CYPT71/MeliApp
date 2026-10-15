import { outlookTaskMetadata } from "./project-outlook.js";
const TASK = "tasks";
const APPOINTMENT = "appointments";
const BOTH = "both";
const FIXED = "fixed";
const FLEXIBLE = "flexible";

export const CALENDAR_ROLES = Object.freeze({ TASK, APPOINTMENT, BOTH });
export const PLACEMENTS = Object.freeze({ FIXED, FLEXIBLE });

export const normalizeCalendarRole = (value, fallback = BOTH) =>
  [TASK, APPOINTMENT, BOTH].includes(value) ? value : fallback;

export const normalizePlacement = (value, fallback = FLEXIBLE) =>
  [FIXED, FLEXIBLE].includes(value) ? value : fallback;

export const eventKey = (event = {}) => `${event.calendarId ?? "default"}:${event.id ?? event.start ?? event.title ?? "event"}`;

export const eventHasMeetingOrLocation = (event = {}) => {
  const location = String(event.location ?? "").trim();
  const joinUrl = String(event.onlineMeetingUrl ?? event.joinUrl ?? "").trim();
  return Boolean(location || joinUrl || event.isOnlineMeeting);
};

export const classifyCalendarEvent = (event = {}, role = BOTH) => {
  const normalized = normalizeCalendarRole(role);
  if (normalized === TASK) return "task";
  if (normalized === APPOINTMENT) return "appointment";
  return eventHasMeetingOrLocation(event) ? "appointment" : "task";
};

export const calendarRoleForEvent = (event = {}, roles = {}) =>
  normalizeCalendarRole(roles?.[eventKey(event)] ?? roles?.[event.calendarId] ?? BOTH);

export const placementForEvent = (event = {}, preferences = {}, defaultRangeMinutes = 120) => {
  const key = eventKey(event);
  const placement = normalizePlacement(
    preferences.itemPlacements?.[key] ?? preferences.placementByCalendar?.[event.calendarId] ?? FLEXIBLE
  );
  const rawRange = Number(preferences.itemRanges?.[key] ?? preferences.rangeByCalendar?.[event.calendarId] ?? defaultRangeMinutes);
  const rangeMinutes = Math.min(1440, Math.max(15, Number.isFinite(rawRange) ? rawRange : 120));
  return { placement, rangeMinutes };
};

export const splitCalendarEvents = (events = [], roles = {}, preferences = {}, defaultRangeMinutes = 120) => {
  const appointments = [];
  const taskEvents = [];
  const flexibleEvents = [];
  const fixedEvents = [];

  for (const event of events ?? []) {
    const kind = classifyCalendarEvent(event, calendarRoleForEvent(event, roles));
    const timing = placementForEvent(event, preferences, defaultRangeMinutes);
    const enriched = { ...event, scheduleMode: timing.placement, flexRangeMinutes: timing.rangeMinutes, classifiedKind: kind };
    if (kind === "task") taskEvents.push(enriched);
    else appointments.push(enriched);
    if (timing.placement === FIXED) fixedEvents.push(enriched);
    else flexibleEvents.push(enriched);
  }

  return { appointments, taskEvents, flexibleEvents, fixedEvents };
};

export const calendarEventToPlanningTask = (event = {}) => {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const duration = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
    ? Math.max(5, Math.min(480, Math.round((end.getTime() - start.getTime()) / 60000)))
    : 25;
  const sourceKey = eventKey(event);
  const range = Math.min(1440, Math.max(15, Number(event.flexRangeMinutes) || 120));
  const startMs = start.getTime();
  const endMs = end.getTime();
  const isFlexible = normalizePlacement(event.scheduleMode) === FLEXIBLE;

  return {
    id: `calendar_task_${encodeURIComponent(sourceKey)}`,
    title: String(event.title ?? "Tâche agenda").trim() || "Tâche agenda",
    deadline: event.start ?? null,
    estimateMinutes: duration,
    difficulty: 2,
    importance: 3,
    progress: 0,
    splittable: true,
    minimumChunkMinutes: Math.min(15, duration),
    preferredEnergyMin: 2,
    status: "active",
    scheduleMode: isFlexible ? FLEXIBLE : FIXED,
    flexRangeMinutes: range,
    preferredStart: Number.isFinite(startMs) ? new Date(startMs).toISOString() : null,
    earliestStart: isFlexible && Number.isFinite(startMs) ? new Date(startMs - range * 60000).toISOString() : null,
    latestEnd: isFlexible && Number.isFinite(endMs) ? new Date(endMs + range * 60000).toISOString() : null,
    source: "calendar-auto",
    sourceEventStart: event.start ?? null,
    sourceEventEnd: event.end ?? null,
    ...outlookTaskMetadata(event),
    sourceEventId: event.id ?? null,
    sourceCalendarId: event.calendarId ?? null,
    sourceTitle: event.calendarName ?? null
  };
};
