import { calendarEventToPlanningTask, calendarRoleForEvent, classifyCalendarEvent, placementForEvent, eventKey } from './calendar-classification.js';
import { exclusionReason, remainingWork, timeValue } from './planning-eligibility.js';

export const planningInputs = (state, now = Date.now()) => {
  const allTasks = state.features?.tasks?.items ?? [];
  const sources = state.features?.calendarSources ?? {};
  const defaultRange = state.features?.schedulePreferences?.defaultFlexRangeMinutes ?? 120;
  const selected = state.features?.calendarView?.selectedCalendarIds;
  const tasks = [], events = [], excluded = [];
  const sourceEvents = (state.calendar?.events ?? []).filter(event => event.isPlanningBlock || !Array.isArray(selected) || selected.includes(event.calendarId));
  const represented = event => allTasks.some(task => task.sourceEventId != null && String(task.sourceEventId) === String(event.id) &&
    (task.sourceCalendarId ? task.sourceCalendarId === event.calendarId : sourceEvents.filter(item => String(item.id) === String(event.id)).length === 1));
  const existingWork = new Map();
  for (const event of sourceEvents) {
    if (!event.isPlanningBlock || timeValue(event.end) <= now) continue;
    const unique = allTasks.filter(task => task.title === String(event.title).replace(/^🎯\s*/, ''));
    const taskId = event.planningTaskId ?? (unique.length === 1 ? unique[0].id : null);
    if (!taskId) continue;
    const minutes = Math.max(0, (timeValue(event.end) - Math.max(now, timeValue(event.start))) / 60000);
    existingWork.set(taskId, (existingWork.get(taskId) ?? 0) + minutes);
  }
  const optimization = state.features?.cliAi?.optimization;
  const addTask = original => {
    const rank = optimization?.taskIds?.indexOf(original.id) ?? -1;
    const task = optimization?.energy === state.features?.energy?.value && optimization.expiresAt > now && rank >= 0 ? { ...original, aiPreference: 2 * (1 - rank / optimization.taskIds.length) } : original;
    const reason = exclusionReason(task, now);
    if (reason) excluded.push({ id: task.id, title: task.title, reason });
    else tasks.push(task);
  };
  for (const task of allTasks) {
    const reason = exclusionReason(task, now);
    if (reason) { excluded.push({ id: task.id, title: task.title, reason }); continue; }
    if (task.parentTaskId) continue;
    const reserved = existingWork.get(task.id) ?? 0;
    const remaining = Math.max(0, remainingWork(task) - reserved);
    if (!remaining) { excluded.push({ id: task.id, title: task.title, reason: 'scheduled' }); continue; }
    const plannedTask = reserved ? { ...task, estimateMinutes: remaining, progress: 0 } : task;
    const deadline = timeValue(task.deadline);
    if (task.scheduleMode === 'fixed' && Number.isFinite(deadline)) {
      if (sourceEvents.some(event => String(event.id) === String(task.sourceEventId) && (!task.sourceCalendarId || task.sourceCalendarId === event.calendarId))) continue;
      events.push({ id: `fixed-task:${task.id}`, title: `📌 ${task.title}`, start: new Date(deadline - remaining * 60000).toISOString(), end: new Date(deadline).toISOString(), sourceTaskId: task.id, classifiedKind: 'task', scheduleMode: 'fixed' });
    } else if (task.scheduleMode === 'flexible' && Number.isFinite(deadline) && !task.preferredStart) {
      const range = Math.min(1440, Math.max(15, Number(task.flexRangeMinutes) || defaultRange));
      addTask({ ...plannedTask, earliestStart: new Date(deadline - (remaining + range) * 60000).toISOString(), latestEnd: task.deadline });
    } else addTask(plannedTask);
  }
  const seen = new Set();
  for (const event of sourceEvents) {
    const key = eventKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    const start = timeValue(event.start), end = timeValue(event.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || event.isCancelled || event.showAs === "free" && !event.isPlanningBlock) continue;
    if (end <= now) { excluded.push({ id: key, title: event.title, reason: 'past' }); continue; }
    const role = classifyCalendarEvent(event, calendarRoleForEvent(event, sources.roles));
    const timing = placementForEvent(event, sources, defaultRange);
    // A real appointment remains reserved until an actual Outlook move is explicitly implemented.
    const explicitFixed = allTasks.some(task => task.sourceEventId != null && String(task.sourceEventId) === String(event.id) && (!task.sourceCalendarId || task.sourceCalendarId === event.calendarId) && task.scheduleMode === 'fixed' && !exclusionReason(task, now));
    if (role === 'appointment' || timing.placement === 'fixed' || event.isPlanningBlock || explicitFixed) {
      if (role !== 'appointment' && represented(event) && !event.isPlanningBlock && !explicitFixed) continue;
      events.push({ ...event, classifiedKind: role, scheduleMode: 'fixed' });
    } else if (!represented(event)) {
      const inferred = calendarEventToPlanningTask({ ...event, scheduleMode: 'flexible', flexRangeMinutes: timing.rangeMinutes });
      const reserved = existingWork.get(inferred.id) ?? 0;
      if (reserved >= remainingWork(inferred)) excluded.push({ id: inferred.id, title: inferred.title, reason: 'scheduled' });
      else addTask(reserved ? { ...inferred, estimateMinutes: remainingWork(inferred) - reserved, progress: 0 } : inferred);
    }
  }
  return { tasks, events, excluded };
};
