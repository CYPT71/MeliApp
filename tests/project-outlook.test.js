import test from "node:test";
import assert from "node:assert/strict";
import { linkedProjects, matchesProjectCategories, refreshImportedTaskMetadata } from "../js/domain/project-outlook.js";
import { projectFeatures } from "../js/features-projects.js";
import { calendarEventToTask } from "../js/features-calendar-tasks.js";
import { calendarEventToPlanningTask } from "../js/domain/calendar-classification.js";
import { categoryPresentation } from "../js/domain/outlook-categories.js";

const event = { id: "e1", title: "Réviser", calendarId: "school", calendarName: "Formation", start: "2026-10-20T09:00:00Z", end: "2026-10-20T10:00:00Z", categories: ["Cours", "Examens"], categoryColors: [{ name: "Cours", color: "preset8" }] };
const projects = [{ id: "p1", title: "Formation", outlookCategories: ["Cours"] }, { id: "p2", title: "Diplôme", outlookCategories: ["Examens"] }, { id: "p3", title: "Autre", outlookCategories: [] }];

test("category mapping links events to several projects without converting them into tasks", () => {
  const state = { features: { projects: { items: projects }, tasks: { items: [] } } };
  assert.deepEqual(linkedProjects(state, event).map((project) => project.id), ["p1", "p2"]);
  assert.deepEqual(state.features.tasks.items, []);
  assert.equal(matchesProjectCategories({ outlookCategories: [" cours "] }, event), true);
  assert.equal(event.projectId, undefined);
});

test("editing or removing category mappings immediately changes derived associations", () => {
  const initial = { features: { projects: { items: projects } } };
  const updated = projectFeatures.projects.run({ state: initial, event: "project:update", payload: { id: "p1", outlookCategories: [] } });
  assert.deepEqual(linkedProjects(updated, event).map((project) => project.id), ["p2"]);
  assert.deepEqual(initial.features.projects.items[0].outlookCategories, ["Cours"]);
  const deleted = projectFeatures.projects.run({ state: updated, event: "project:delete", payload: { id: "p2" } });
  assert.deepEqual(linkedProjects(deleted, event), []);
});

test("manual task project assignments survive automatic category associations", () => {
  const state = { features: { projects: { items: projects } } };
  const task = { ...calendarEventToTask(event), projectId: "p3" };
  assert.deepEqual(linkedProjects(state, task).map((project) => project.id), ["p1", "p2", "p3"]);
  assert.equal(task.projectId, "p3");
});

test("manual and planner imports preserve Outlook category colors without sharing mutable arrays", () => {
  for (const convert of [calendarEventToTask, calendarEventToPlanningTask]) {
    const task = convert(event);
    assert.deepEqual(task.categories, event.categories);
    assert.deepEqual(task.categoryColors, event.categoryColors);
    assert.equal(categoryPresentation(task).style, categoryPresentation(event).style);
    assert.notEqual(task.categories, event.categories);
    assert.notEqual(task.categoryColors[0], event.categoryColors[0]);
    assert.equal(task.sourceCalendarId, "school");
  }
});

test("synchronizing repairs old imported colors while preserving task edits and progress", () => {
  const task = { ...calendarEventToTask(event), title: "Titre modifié", projectId: "p3", progress: .75, status: "completed", categories: [], categoryColors: [] };
  const state = { features: { tasks: { items: [task] } } };
  const next = refreshImportedTaskMetadata(state, [event]);
  assert.deepEqual(next.features.tasks.items[0].categoryColors, event.categoryColors);
  assert.equal(next.features.tasks.items[0].title, "Titre modifié");
  assert.equal(next.features.tasks.items[0].progress, .75);
  assert.equal(next.features.tasks.items[0].status, "completed");
  assert.equal(next.features.tasks.items[0].projectId, "p3");
  assert.deepEqual(task.categoryColors, []);
  assert.equal(refreshImportedTaskMetadata(state, []).features.tasks.items[0], task);
});

test("tasks from a different source calendar are not overwritten", () => {
  const task = { ...calendarEventToTask(event), sourceCalendarId: "other" };
  const state = { features: { tasks: { items: [task] } } };
  assert.equal(refreshImportedTaskMetadata(state, [event]).features.tasks.items[0], task);
});

test("project creation and updates retain Outlook mappings independently of free tags", () => {
  let state = { features: { projects: { items: [] } } };
  state = projectFeatures.projects.run({ state, event: "project:create", payload: { title: "Formation", tags: "perso, important", outlookCategories: ["Cours", "Cours", "Examens"] } });
  const project = state.features.projects.items[0];
  assert.deepEqual(project.outlookCategories, ["Cours", "Examens"]);
  state = projectFeatures.projects.run({ state, event: "project:update", payload: { id: project.id, title: "Diplôme" } });
  assert.deepEqual(state.features.projects.items[0].outlookCategories, ["Cours", "Examens"]);
  assert.deepEqual(state.features.projects.items[0].tags, ["perso", "important"]);
});

test("popup composition retains Outlook import and project navigation actions", async () => {
  const { features } = await import("../js/core/registry.js");
  const { calendarTaskFeatures } = await import("../js/features-calendar-tasks.js");
  assert.equal(features.calendarView.ui.actions["calendar.import-task"], calendarTaskFeatures.calendarView.ui.actions["calendar.import-task"]);
  assert.equal(features.taskWorkspace.ui.actions["projects.open"], projectFeatures.taskWorkspace.ui.actions["projects.open"]);
});
