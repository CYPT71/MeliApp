import { adaptiveScheduleFeatures } from "./features-adaptive-schedule.js";
import { calendarEventToPlanningTask, calendarRoleForEvent, classifyCalendarEvent, placementForEvent } from "./domain/calendar-classification.js";

const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;
const MINUTE = 60000;

const fixedTaskEvent = (task) => {
  if (!task?.deadline) return null;
  const end = new Date(task.deadline).getTime();
  if (!Number.isFinite(end)) return null;
  const duration = Math.max(5, Number(task.estimateMinutes) || 25);
  return {
    id: `fixed-task:${task.id}`,
    title: `📌 ${task.title}`,
    start: new Date(end - duration * MINUTE).toISOString(),
    end: new Date(end).toISOString(),
    allDay: false,
    location: "",
    sourceTaskId: task.id,
    scheduleMode: "fixed"
  };
};

const planningState = (state) => {
  const tasksState = featureState(state, "tasks", { items: [] });
  const explicitTasks = tasksState.items ?? [];
  const sources = featureState(state, "calendarSources", {});
  const defaultRange = Number(featureState(state, "schedulePreferences", { defaultFlexRangeMinutes: 120 }).defaultFlexRangeMinutes ?? 120);
  const roles = sources.roles ?? {};
  const fixedEvents = [];
  const flexibleCalendarTasks = [];
  const importedEventIds = new Set(explicitTasks.map((task) => task.sourceEventId).filter(Boolean).map(String));

  for (const event of state.calendar?.events ?? []) {
    const timing = placementForEvent(event, sources, defaultRange);
    const kind = classifyCalendarEvent(event, calendarRoleForEvent(event, roles));
    const enriched = { ...event, classifiedKind: kind, scheduleMode: timing.placement, flexRangeMinutes: timing.rangeMinutes };
    if (timing.placement === "fixed") {
      fixedEvents.push(enriched);
      continue;
    }
    if (!importedEventIds.has(String(event.id))) flexibleCalendarTasks.push(calendarEventToPlanningTask(enriched));
  }

  const flexibleTasks = [];
  for (const task of explicitTasks) {
    if (task.scheduleMode === "fixed") {
      const event = fixedTaskEvent(task);
      if (event) fixedEvents.push(event);
      else flexibleTasks.push(task);
    } else {
      flexibleTasks.push(task);
    }
  }

  return {
    ...state,
    features: {
      ...(state.features ?? {}),
      tasks: { ...tasksState, items: [...flexibleTasks, ...flexibleCalendarTasks] }
    },
    calendar: { ...(state.calendar ?? {}), events: fixedEvents }
  };
};

const restoreProductState = (original, planned) => ({
  ...planned,
  calendar: original.calendar,
  features: {
    ...(planned.features ?? {}),
    tasks: original.features?.tasks ?? planned.features?.tasks,
    calendarSources: original.features?.calendarSources ?? planned.features?.calendarSources,
    schedulePreferences: original.features?.schedulePreferences ?? planned.features?.schedulePreferences
  }
});

const base = adaptiveScheduleFeatures.adaptiveSchedule;
const extraEvents = [
  "schedule:default-range", "schedule:calendar-role", "schedule:calendar-placement", "schedule:calendar-range",
  "schedule:event-placement", "schedule:event-range", "schedule:task-placement", "schedule:task-range"
];

export const scheduleBehaviorOverride = {
  adaptiveSchedule: {
    ...base,
    description: "Planning adaptatif avec éléments fixes et flexibles",
    when: [...new Set([...(base.when ?? []), ...extraEvents])],
    run: async (context) => {
      const transformed = planningState(context.state);
      const planned = await base.run({ ...context, state: transformed });
      return restoreProductState(context.state, planned);
    }
  }
};
