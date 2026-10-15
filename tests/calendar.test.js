import test from "node:test";
import assert from "node:assert/strict";
import { calendarRange, dateKey, localDate, eventsForDay, layoutEvents } from "../js/domain/calendar.js";
import { features } from "../js/core/registry.js";
import { createInitialState } from "../js/core/state.js";
import { runFeatures } from "../js/core/app.js";

const event = (id, start, end, extra = {}) => ({ id, title: id, start, end, ...extra });

test("calendar views show 1, 3 or 7 days and weeks start on Monday", () => {
  for (const [view, count] of [["day", 1], ["three", 3], ["week", 7]]) {
    const range = calendarRange({ view, date: "2026-10-18" });
    assert.equal(range.days.length, count);
    assert.equal(dateKey(range.start), view === "week" ? "2026-10-12" : "2026-10-18");
  }
  assert.equal(dateKey(calendarRange({ view: "week", date: "2027-01-01" }).start), "2026-12-28");
});

test("events are clipped at midnight and all-day end dates are exclusive", () => {
  const events = [event("overnight", "2026-10-15T23:00:00", "2026-10-16T02:00:00"), event("all-day", "2026-10-15T00:00:00Z", "2026-10-17T00:00:00Z", { allDay: true })];
  assert.equal(eventsForDay(events, localDate("2026-10-15"))[0].bottom, 1440);
  const next = eventsForDay(events, localDate("2026-10-16"));
  assert.equal(next[0].top, 0);
  assert.equal(next[0].bottom, 120);
  assert.equal(next.length, 2);
  assert.equal(eventsForDay(events, localDate("2026-10-17")).length, 0);
});

test("overlapping events occupy separate columns; later events recover full width", () => {
  const events = [event("a", "2026-10-15T09:00:00", "2026-10-15T11:00:00"), event("b", "2026-10-15T10:00:00", "2026-10-15T12:00:00"), event("c", "2026-10-15T12:00:00", "2026-10-15T13:00:00")];
  const layout = layoutEvents(eventsForDay(events, localDate("2026-10-15")));
  assert.deepEqual(layout.map(({ column, columns }) => [column, columns]), [[0, 2], [1, 2], [0, 1]]);
});

test("navigating the calendar synchronizes the newly selected period", async () => {
  const state = createInitialState(features);
  state.features.calendarView = { view: "three", date: "2030-12-30" };
  const requests = [];
  const result = await runFeatures({ event: "calendar:navigate", payload: { direction: 1 }, registry: features,
    context: { state, services: { outlook: { isConnected: () => true, listEvents: async (range) => { requests.push(range); return []; } } } } });
  assert.equal(result.state.features.calendarView.date, "2031-01-02");
  assert.equal(dateKey(new Date(requests[0].from)), "2031-01-02");
  assert.equal(dateKey(new Date(requests[0].to)), "2031-01-05");
});

test("changing views and returning to today preserve calendar state", () => {
  const state = createInitialState(features);
  state.features.calendarView = { view: "week", date: "2026-01-01" };
  const changed = features.calendarView.run({ state, event: "calendar:view", payload: { view: "day" } });
  assert.deepEqual(changed.features.calendarView, { view: "day", date: "2026-01-01" });
  const today = features.calendarView.run({ state: changed, event: "calendar:today" });
  assert.equal(today.features.calendarView.date, dateKey(new Date()));
  assert.equal(today.features.calendarView.view, "day");
});

test("opening the app resets a previously selected date to today", () => {
  const state = createInitialState(features);
  state.features.calendarView = { view: "day", date: "2020-01-01" };
  const opened = features.calendarView.run({ state, event: "app:start" });
  assert.equal(opened.features.calendarView.date, dateKey(new Date()));
  assert.equal(opened.features.calendarView.view, "day");
});

test("day navigation crosses month boundaries in both directions", () => {
  const state = createInitialState(features);
  state.features.calendarView = { view: "day", date: "2026-12-31" };
  const next = features.calendarView.run({ state, event: "calendar:navigate", payload: { direction: 1 } });
  assert.equal(next.features.calendarView.date, "2027-01-01");
  const previous = features.calendarView.run({ state: next, event: "calendar:navigate", payload: { direction: -1 } });
  assert.equal(previous.features.calendarView.date, "2026-12-31");
});
