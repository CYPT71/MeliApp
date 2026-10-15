import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarEventToPlanningTask,
  classifyCalendarEvent,
  splitCalendarEvents
} from "../js/domain/calendar-classification.js";

test("un agenda tâches force ses éléments en tâches", () => {
  const event = { id: "1", title: "Devoir", location: "Salle B", isOnlineMeeting: true };
  assert.equal(classifyCalendarEvent(event, "tasks"), "task");
});

test("un agenda rendez-vous force ses éléments en rendez-vous", () => {
  const event = { id: "1", title: "Préparer dossier", location: "" };
  assert.equal(classifyCalendarEvent(event, "appointments"), "appointment");
});

test("un agenda mixte considère lieu ou réunion en ligne comme rendez-vous", () => {
  assert.equal(classifyCalendarEvent({ location: "Campus" }, "both"), "appointment");
  assert.equal(classifyCalendarEvent({ onlineMeetingUrl: "https://teams.microsoft.com/l/meetup-join/example" }, "both"), "appointment");
  assert.equal(classifyCalendarEvent({ location: "", isOnlineMeeting: false }, "both"), "task");
});

test("le classement par agenda sépare les entrées pour le planificateur", () => {
  const events = [
    { id: "a", calendarId: "work", location: "", title: "Préparer compte rendu" },
    { id: "b", calendarId: "work", location: "Bureau 12", title: "Réunion" },
    { id: "c", calendarId: "todo", location: "Visio", title: "Tâche forcée" }
  ];
  const split = splitCalendarEvents(events, { work: "both", todo: "tasks" });
  assert.deepEqual(split.taskEvents.map((event) => event.id), ["a", "c"]);
  assert.deepEqual(split.appointments.map((event) => event.id), ["b"]);
});

test("une entrée agenda classée tâche devient une deadline planifiable", () => {
  const task = calendarEventToPlanningTask({
    id: "deadline",
    calendarId: "school",
    calendarName: "Cours",
    title: "Rendre le dossier",
    start: "2026-10-20T18:00:00Z",
    end: "2026-10-20T18:30:00Z"
  });
  assert.equal(task.deadline, "2026-10-20T18:00:00Z");
  assert.equal(task.estimateMinutes, 30);
  assert.equal(task.sourceCalendarId, "school");
});
