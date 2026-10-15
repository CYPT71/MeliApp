import test from "node:test";
import assert from "node:assert/strict";

import { placementForEvent, calendarEventToPlanningTask } from "../js/domain/calendar-classification.js";
import { schedulePreferenceFeatures } from "../js/features-schedule-preferences.js";

test("un élément Outlook hérite du placement et de la marge de son agenda", () => {
  const event = { id: "e1", calendarId: "cours", start: "2026-10-20T10:00:00Z", end: "2026-10-20T11:00:00Z" };
  assert.deepEqual(placementForEvent(event, {
    placementByCalendar: { cours: "fixed" },
    rangeByCalendar: { cours: 90 }
  }), { placement: "fixed", rangeMinutes: 90 });
});

test("un réglage individuel remplace le réglage de son agenda", () => {
  const event = { id: "e1", calendarId: "cours", start: "2026-10-20T10:00:00Z", end: "2026-10-20T11:00:00Z" };
  assert.deepEqual(placementForEvent(event, {
    placementByCalendar: { cours: "fixed" },
    itemPlacements: { "cours:e1": "flexible" },
    itemRanges: { "cours:e1": 45 }
  }), { placement: "flexible", rangeMinutes: 45 });
});

test("un événement flexible devient un bloc planifiable avec fenêtre de déplacement", () => {
  const task = calendarEventToPlanningTask({
    id: "e1", calendarId: "cours", title: "Révisions", scheduleMode: "flexible", flexRangeMinutes: 60,
    start: "2026-10-20T10:00:00Z", end: "2026-10-20T11:00:00Z"
  });
  assert.equal(task.scheduleMode, "flexible");
  assert.equal(task.flexRangeMinutes, 60);
  assert.equal(task.earliestStart, "2026-10-20T09:00:00.000Z");
  assert.equal(task.latestEnd, "2026-10-20T12:00:00.000Z");
});

test("les réglages peuvent rendre une tâche fixe", () => {
  const feature = schedulePreferenceFeatures.schedulePreferences;
  const state = {
    features: {
      schedulePreferences: { defaultFlexRangeMinutes: 120 },
      tasks: { items: [{ id: "t1", title: "Dossier", status: "active" }] },
      calendarSources: {}
    }
  };
  const next = feature.run({ state, event: "schedule:task-placement", payload: { id: "t1", placement: "fixed" } });
  assert.equal(next.features.tasks.items[0].scheduleMode, "fixed");
});
