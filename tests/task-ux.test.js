import test from "node:test";
import assert from "node:assert/strict";

import { taskWorkspaceFeatures } from "../js/features-tasks-workspace.js";

const baseState = () => ({
  features: {
    taskWorkspace: {
      view: "today",
      createExpanded: false,
      expandedId: null,
      editingId: null,
      query: "",
      statusFilter: "active",
      projectFilter: "all"
    },
    tasks: {
      items: [{
        id: "parent",
        title: "Faire le dossier",
        estimateMinutes: 60,
        difficulty: 3,
        importance: 5,
        deadline: "2026-10-18T12:00:00.000Z",
        status: "active",
        progress: 0,
        projectId: "project-1"
      }]
    },
    taskDecomposition: {
      manualFor: null,
      aiLoadingFor: null,
      rewardedByParent: {},
      error: null,
      errorTaskId: null
    },
    game: { xp: 0, level: 1, lastGain: 0 },
    ai: { providers: {}, mode: "fusion" }
  }
});

test("task workspace defaults to priorities and exposes focused views", () => {
  assert.equal(taskWorkspaceFeatures.taskWorkspace.state.view, "today");

  const matrix = taskWorkspaceFeatures.taskWorkspace.run({
    state: baseState(),
    event: "tasks:view",
    payload: { view: "matrix" }
  });
  assert.equal(matrix.features.taskWorkspace.view, "matrix");

  const invalid = taskWorkspaceFeatures.taskWorkspace.run({
    state: baseState(),
    event: "tasks:view",
    payload: { view: "nonsense" }
  });
  assert.equal(invalid.features.taskWorkspace.view, "today");
});

test("task details toggle only one task at a time", () => {
  const opened = taskWorkspaceFeatures.taskWorkspace.run({
    state: baseState(),
    event: "tasks:toggle-details",
    payload: { id: "parent" }
  });
  assert.equal(opened.features.taskWorkspace.expandedId, "parent");

  const closed = taskWorkspaceFeatures.taskWorkspace.run({
    state: opened,
    event: "tasks:toggle-details",
    payload: { id: "parent" }
  });
  assert.equal(closed.features.taskWorkspace.expandedId, null);
});

test("manual decomposition adds a child and rewards XP", async () => {
  const next = await taskWorkspaceFeatures.taskDecomposition.run({
    state: baseState(),
    event: "tasks:split-manual",
    payload: { id: "parent", title: "Ouvrir le document" },
    services: {}
  });

  assert.equal(next.features.tasks.items.length, 2);
  assert.equal(next.features.tasks.items[1].parentTaskId, "parent");
  assert.equal(next.features.tasks.items[1].splitSource, "manual");
  assert.equal(next.features.game.xp, 8);
});

test("AI decomposition creates steps without decomposition XP", async () => {
  const state = baseState();
  const next = await taskWorkspaceFeatures.taskDecomposition.run({
    state,
    event: "tasks:split-ai",
    payload: { id: "parent" },
    services: {
      ai: {
        decompose: async () => ({ steps: ["Ouvrir le fichier", "Faire le plan", "Écrire le début"] })
      }
    }
  });

  assert.equal(next.features.tasks.items.length, 4);
  assert.equal(next.features.tasks.items[1].splitSource, "ai");
  assert.equal(next.features.game.xp, 0);
});

test("project and task editor sections are hidden outside their dedicated task view", () => {
  const state = baseState();
  assert.equal(taskWorkspaceFeatures.projects.ui.visible(state), false);
  assert.equal(taskWorkspaceFeatures.taskEditor.ui.visible(state), false);

  state.features.taskWorkspace.view = "projects";
  assert.equal(taskWorkspaceFeatures.projects.ui.visible(state), true);
});
