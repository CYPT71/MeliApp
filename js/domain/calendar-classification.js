const TASK = "tasks";
const APPOINTMENT = "appointments";
const BOTH = "both";

export const CALENDAR_ROLES = Object.freeze({ TASK, APPOINTMENT, BOTH });

export const normalizeCalendarRole = (value, fallback = BOTH) =>
  [TASK, APPOINTMENT, BOTH].includes(value) ? value : fallback;

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
  normalizeCalendarRole(roles?.[event.calendarId] ?? BOTH);

export const splitCalendarEvents = (events = [], roles = {}) => {
  const appointments = [];
  const taskEvents = [];
  for (const event of events ?? []) {
    const kind = classifyCalendarEvent(event, calendarRoleForEvent(event, roles));
    if (kind === "task") taskEvents.push(event);
    else appointments.push(event);
  }
  return { appointments, taskEvents };
};

export const calendarEventToPlanningTask = (event = {}) => {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const duration = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
    ? Math.max(5, Math.min(480, Math.round((end.getTime() - start.getTime()) / 60000)))
    : 25;
  const sourceKey = `${event.calendarId ?? "default"}:${event.id ?? event.start ?? event.title ?? "event"}`;
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
    source: "calendar-auto",
    sourceEventId: event.id ?? null,
    sourceCalendarId: event.calendarId ?? null,
    sourceTitle: event.calendarName ?? null
  };
};
