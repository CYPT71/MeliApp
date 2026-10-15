import test from "node:test";
import assert from "node:assert/strict";

import {
  eisenhowerQuadrant,
  groupTasksByEisenhower,
  normalizeImportance
} from "../js/domain/eisenhower.js";
import { taskWorkspaceFeatures } from "../js/features-tasks-workspace.js";

const now = new Date("2026-10-15T12:00:00Z").getTime();

const task = (overrides = {}) => ({
  id: overrides.id ?? "task-1",
  title: overrides.title ?? "Préparer le dossier",
  importance: overrides.importance ?? 3,
  deadline: overrides.deadline ?? null,
  estimateMinutes: overrides.estimateMinutes ?? 60,
  difficulty: overrides.difficulty ?? 3,
  progress: overrides.progress ?? 0,
  status: overrides.status ?? "active",
  ...overrides
});

const stateWith = (items) => ({
  features: {
    tasks: { items },
    taskDecomposition: { manualFor: null, aiLoadingFor: null, rewardedByParent: {}, error: null, errorTaskId: null },
    game: { xp: 100, level: 2, lastGain: 0 },
    ai: { mode: "fusion", synthesisProvider: "openai", providers: {} }
  }
});

test("importance remains constrained from 1 to 5", () => {
  assert.equal(normalizeImportance(-2), 1);
  assert.equal(normalizeImportance(3), 3);
  assert.equal(normalizeImportance(99), 5);
});

test("Eisenhower places important urgent tasks in do-now quadrant", () => {
  const item = task({ importance: 5, deadline: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString() });
  assert.equal(eisenhowerQuadrant(item, now).id, "do");
});

test("Eisenhower places important non-urgent tasks in plan quadrant", () => {
  const item = task({ importance: 4, deadline: new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString() });
  assert.equal(eisenhowerQuadrant(item, now).id, "plan");
});

test("Eisenhower matrix groups all four quadrants", () => {
  const grouped = groupTasksByEisenhower([
    task({ id: "a", importance: 5, deadline: new Date(now + 1 * 24 * 60 * 60 * 1000).toISOString() }),
    task({ id: "b", importance: 5, deadline: new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString() }),
    task({ id: "c", importance: 2, deadline: new Date(now + 1 * 24 * 60 * 60 * 1000).toISOString() }),
    task({ id: "d", importance: 2, deadline: null })
  ], now);

  assert.equal(grouped.do.length, 1);
  assert.equal(grouped.plan.length, 1);
  assert.equal(grouped.quick.length, 1);
  assert.equal(grouped.later.length, 1);
});

test("manual task decomposition creates a child and rewards XP", async () => {
  const initial = stateWith([task()]);
  const result = await taskWorkspaceFeatures.taskDecomposition.run({
    state: initial,
    event: "tasks:split-manual",
    payload: { id: "task-1", title: "Ouvrir le document" },
    services: {}
  });

  assert.equal(result.features.tasks.items.length, 2);
  const child = result.features.tasks.items.find((item) => item.parentTaskId === "task-1");
  assert.equal(child.title, "Ouvrir le document");
  assert.equal(child.splitSource, "manual");
  assert.equal(result.features.game.xp, 108);
});

test("AI decomposition creates children without decomposition XP", async () => {
  const initial = stateWith([task()]);
  const result = await taskWorkspaceFeatures.taskDecomposition.run({
    state: initial,
    event: "tasks:split-ai",
    payload: { id: "task-1" },
    services: {
      ai: {
        decompose: async () => ["Ouvrir le document", "Faire le plan", "Écrire le premier paragraphe"]
      }
    }
  });

  assert.equal(result.features.tasks.items.length, 4);
  assert.equal(result.features.game.xp, 100);
  assert.deepEqual(
    result.features.tasks.items.filter((item) => item.parentTaskId === "task-1").map((item) => item.splitSource),
    ["ai", "ai", "ai"]
  );
});

test("manual split reward is capped per parent task", async () => {
  let state = stateWith([task()]);
  state.features.taskDecomposition.rewardedByParent = { "task-1": 5 };
  state = await taskWorkspaceFeatures.taskDecomposition.run({
    state,
    event: "tasks:split-manual",
    payload: { id: "task-1", title: "Une étape de plus" },
    services: {}
  });
  assert.equal(state.features.game.xp, 100);
  assert.equal(state.features.tasks.items.length, 2);
});
