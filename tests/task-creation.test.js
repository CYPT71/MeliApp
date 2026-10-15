import test from "node:test";
import assert from "node:assert/strict";
import { features } from "../js/core/registry.js";
import { createApp } from "../js/core/app.js";
import { createInitialState } from "../js/core/state.js";

test("tasks created for a project retain their project association", async () => {
  const state = createInitialState(features);
  state.features.projects.items = [{ id: "p1", title: "Projet" }];
  const app = createApp({ registry: features, initialState: state });
  await app.dispatch("tasks:prepare-create", { projectId: "p1" });
  assert.equal(app.getState().features.taskWorkspace.draft.projectId, "p1");
  assert.equal(app.getState().features.taskWorkspace.createExpanded, true);
  await app.dispatch("task:created", { title: "Nouvelle tâche", projectId: "p1" });
  const task = app.getState().features.tasks.items[0];
  assert.equal(task.projectId, "p1");
  await app.dispatch("task:updated", { id: task.id, estimateMinutes: 45 });
  assert.equal(app.getState().features.tasks.items[0].projectId, "p1");
});

test("editing an imported task retains its Outlook metadata and parent relationship", async () => {
  const state = createInitialState(features);
  state.features.tasks.items = [{ id: "t1", title: "Importée", parentTaskId: "parent", projectId: "p1", source: "outlook", sourceEventId: "e1", categories: ["Travail"], categoryColors: [{ name: "Travail", color: "preset0" }] }];
  const app = createApp({ registry: features, initialState: state });
  await app.dispatch("task:updated", { id: "t1", title: "Titre modifié" });
  const task = app.getState().features.tasks.items[0];
  assert.equal(task.sourceEventId, "e1");
  assert.equal(task.parentTaskId, "parent");
  assert.equal(task.projectId, "p1");
  assert.deepEqual(task.categoryColors, state.features.tasks.items[0].categoryColors);
});

test("opening creation options preserves the draft and resetting creation reveals the new task", async () => {
  const state = createInitialState(features);
  state.features.taskWorkspace = { ...state.features.taskWorkspace, query: "Autre", statusFilter: "completed", projectFilter: "other" };
  const app = createApp({ registry: features, initialState: state });
  await app.dispatch("tasks:create-toggle", { draft: { title: "Brouillon", estimateMinutes: "30" } });
  assert.equal(app.getState().features.taskWorkspace.draft.title, "Brouillon");
  await app.dispatch("tasks:create-reset", { projectId: "p1" });
  const workspace = app.getState().features.taskWorkspace;
  assert.equal(workspace.view, "list");
  assert.equal(workspace.query, "");
  assert.equal(workspace.statusFilter, "active");
  assert.equal(workspace.projectFilter, "all");
  assert.deepEqual(workspace.draft, { projectId: "p1" });
});
