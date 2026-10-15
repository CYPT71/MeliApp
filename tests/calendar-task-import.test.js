import test from "node:test";
import assert from "node:assert/strict";
import { calendarEventToTask, calendarTaskFeatures, outlookTaskId } from "../js/features-calendar-tasks.js";

const event = {
  id: "evt-42",
  title: "Préparer la présentation",
  start: "2026-10-20T09:00:00Z",
  end: "2026-10-20T10:30:00Z",
  location: "Bureau",
  webLink: "https://outlook.office.com/calendar/item/evt-42"
};

test("un événement Outlook devient une tâche exploitable", () => {
  const task = calendarEventToTask(event);
  assert.equal(task.id, outlookTaskId("evt-42"));
  assert.equal(task.title, "Préparer la présentation");
  assert.equal(task.deadline, event.start);
  assert.equal(task.estimateMinutes, 90);
  assert.equal(task.source, "outlook");
  assert.equal(task.sourceEventId, "evt-42");
});

test("la popup agenda peut remplacer ou retirer la deadline de la tâche", () => {
  assert.equal(calendarEventToTask(event, { deadline: "2026-10-21T18:30" }).deadline, "2026-10-21T18:30");
  assert.equal(calendarEventToTask(event, { deadline: "" }).deadline, null);
});

test("l’import agenda ajoute une seule tâche par événement", () => {
  const initial = {
    calendar: { events: [event] },
    features: { tasks: { items: [] } }
  };
  const once = calendarTaskFeatures.calendarTaskImport.run({ state: initial, payload: { eventId: "evt-42", deadline: "2026-10-21T18:30" } });
  assert.equal(once.features.tasks.items.length, 1);
  assert.equal(once.features.tasks.items[0].deadline, "2026-10-21T18:30");
  const twice = calendarTaskFeatures.calendarTaskImport.run({ state: once, payload: { eventId: "evt-42" } });
  assert.equal(twice.features.tasks.items.length, 1);
  assert.equal(twice.features.tasks.items[0].id, outlookTaskId("evt-42"));
});
