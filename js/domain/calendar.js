export const CALENDAR_VIEWS = Object.freeze({ day: 1, three: 3, week: 7 });

export const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const localDate = (value) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date();
};
export const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
export const calendarRange = (settings = {}) => {
  const view = Object.hasOwn(CALENDAR_VIEWS, settings.view) ? settings.view : "week";
  let start = localDate(settings.date);
  if (view === "week") start = addDays(start, -((start.getDay() + 6) % 7));
  const days = Array.from({ length: CALENDAR_VIEWS[view] }, (_, index) => addDays(start, index));
  return { view, start, end: addDays(start, days.length), days };
};

export const eventsForDay = (events, day) => {
  const next = addDays(day, 1);
  return events.flatMap((event) => {
    // All-day Graph dates denote calendar days, regardless of the browser timezone.
    const start = event.allDay ? localDate(String(event.start).slice(0, 10)) : new Date(event.start);
    const end = event.allDay ? localDate(String(event.end).slice(0, 10)) : new Date(event.end);
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || end <= day || start >= next) return [];
    const clippedStart = new Date(Math.max(+start, +day));
    const clippedEnd = new Date(Math.min(+end, +next));
    const minute = (date) => date.getHours() * 60 + date.getMinutes();
    return [{ event, start: clippedStart, end: clippedEnd, top: minute(clippedStart), bottom: +clippedEnd === +next ? 1440 : minute(clippedEnd) }];
  });
};

export const layoutEvents = (segments) => {
  const sorted = segments.filter(({ event }) => !event.allDay).sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  const groups = [];
  let group = [], until = -1;
  for (const segment of sorted) {
    if (segment.top >= until && group.length) { groups.push(group); group = []; }
    group.push(segment);
    until = Math.max(group.length === 1 ? -1 : until, segment.bottom);
  }
  if (group.length) groups.push(group);
  return groups.flatMap((items) => {
    const columns = [];
    const placed = items.map((item) => {
      let column = columns.findIndex((end) => end <= item.top);
      if (column < 0) column = columns.length;
      columns[column] = item.bottom;
      return { ...item, column };
    });
    return placed.map((item) => ({ ...item, columns: columns.length }));
  });
};
