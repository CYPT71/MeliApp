import test from "node:test";
import assert from "node:assert/strict";

import { projectFeatures } from "../js/features-projects.js";

const state = () => ({
  features: {
    projects: { items: [], editingId: null, query: "", statusFilter: "active" },
    tasks: {
      items: [
        { id: "t1", title: "Tâche liée", status: "active", progress: 0.5, estimateMinutes: 30, projectId: null }
      ]
    }
  }
});

test("project creation stores the details required by the workspace", () => {
  const next = projectFeatures.projects.run({
    state: state(),
    event: "project:create",
    payload: {
      title: "Mémoire",
      description: "Rédiger le mémoire",
      objective: "Livrer une version soutenable",
      successCriteria: "PDF relu et déposé",
      notes: "Voir les sources",
      tags: "études, diplôme",
      startDate: "2026-10-15",
      deadline: "2027-01-20",
      status: "active",
      importance: 5,
      difficulty: 4,
      estimateMinutes: 1800,
      color: "#123456"
    }
  });

  assert.equal(next.features.projects.items.length, 1);
  const project = next.features.projects.items[0];
  assert.equal(project.title, "Mémoire");
  assert.equal(project.objective, "Livrer une version soutenable");
  assert.deepEqual(project.tags, ["études", "diplôme"]);
  assert.equal(project.importance, 5);
  assert.equal(project.difficulty, 4);
  assert.equal(project.estimateMinutes, 1800);
});

test("project update preserves its identity and clamps importance", () => {
  let current = projectFeatures.projects.run({ state: state(), event: "project:create", payload: { title: "Projet", importance: 3 } });
  const id = current.features.projects.items[0].id;
  current = projectFeatures.projects.run({ state: current, event: "project:update", payload: { id, title: "Projet corrigé", importance: 99 } });
  assert.equal(current.features.projects.items[0].id, id);
  assert.equal(current.features.projects.items[0].title, "Projet corrigé");
  assert.equal(current.features.projects.items[0].importance, 5);
});

test("deleting a project unassigns its tasks rather than deleting them", () => {
  const initial = state();
  initial.features.projects.items = [{ id: "p1", title: "Projet", status: "active" }];
  initial.features.tasks.items[0].projectId = "p1";

  const next = projectFeatures.projects.run({ state: initial, event: "project:delete", payload: { id: "p1" } });
  assert.equal(next.features.projects.items.length, 0);
  assert.equal(next.features.tasks.items.length, 1);
  assert.equal(next.features.tasks.items[0].projectId, null);
});

test("project completion and reopen are explicit states", () => {
  const initial = state();
  initial.features.projects.items = [{ id: "p1", title: "Projet", status: "active" }];
  const completed = projectFeatures.projects.run({ state: initial, event: "project:complete", payload: { id: "p1" } });
  assert.equal(completed.features.projects.items[0].status, "completed");
  const reopened = projectFeatures.projects.run({ state: completed, event: "project:reopen", payload: { id: "p1" } });
  assert.equal(reopened.features.projects.items[0].status, "active");
});
