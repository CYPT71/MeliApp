import test from "node:test";
import assert from "node:assert/strict";

import { runFeatures } from "../js/core/app.js";
import { createInitialState } from "../js/core/state.js";
import { featurePages } from "../js/core/router.js";
import { features } from "../js/features.js";

const run = async (state, event, payload, services = {}) =>
  (await runFeatures({ event, payload, registry: features, context: { state, services, dispatch: () => Promise.resolve(), getState: () => state } })).state;

test("energy feature updates its state", async () => {
  const initial = createInitialState(features);
  const next = await run(initial, "energy:set", { value: 2 });
  assert.equal(next.features.energy.value, 2);
  assert.ok(next.features.energy.updatedAt);
});

test("tasks are created and planner selects a mission", async () => {
  let state = createInitialState(features);
  state = await run(state, "task:created", {
    id: "t1",
    title: "Écrire le rapport",
    estimateMinutes: 30,
    difficulty: 3,
    importance: 5,
    splittable: true
  });
  assert.equal(state.features.tasks.items.length, 1);
  assert.equal(state.features.planner.current.id, "t1");
});

test("task completion updates task state and game xp", async () => {
  let state = createInitialState(features);
  state = await run(state, "task:created", { id: "t1", title: "Test", estimateMinutes: 20, difficulty: 2, importance: 2 });
  state = await run(state, "task:completed", { id: "t1" });
  assert.equal(state.features.tasks.items[0].status, "completed");
  assert.ok(state.features.game.xp > 0);
});

test("flow session is timestamp based", async () => {
  let state = createInitialState(features);
  state = await run(state, "session:start", { taskId: "t1", mode: "flow", suggestedMinutes: 25 });
  assert.equal(state.features.flow.active, true);
  assert.equal(state.features.flow.mode, "flow");
  assert.equal(typeof state.features.flow.startedAt, "number");
  state = await run(state, "session:completed");
  assert.equal(state.features.flow.active, false);
  assert.ok(state.features.flow.endedAt >= state.features.flow.startedAt);
});

test("ai feature has a local fallback without external service", async () => {
  let state = createInitialState(features);
  state = await run(state, "ai:assist");
  assert.match(state.features.ai.lastSuggestion, /2 minutes|petite action/i);
});

test("outlook sync consumes the injected service without wiring the core", async () => {
  let state = createInitialState(features);
  const services = {
    outlook: {
      isConnected: () => true,
      listEvents: async () => [{ id: "e1", title: "Cours", start: "2030-01-01T10:00:00Z", end: "2030-01-01T11:00:00Z" }]
    }
  };
  state = await run(state, "sync:manual", undefined, services);
  assert.equal(state.calendar.events.length, 1);
  assert.equal(state.calendar.events[0].title, "Cours");
});

test("page features are discovered automatically", () => {
  const paths = featurePages(features).map(({ page }) => page.path);
  assert.ok(paths.includes("tasks"));
  assert.ok(paths.includes("agenda"));
  assert.ok(paths.includes("focus"));
  assert.ok(paths.includes("spotify"));
});
