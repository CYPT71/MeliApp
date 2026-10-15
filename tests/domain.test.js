import test from "node:test";
import assert from "node:assert/strict";

import { computeEnergyFit, computePriorityScore, computeUrgency } from "../js/domain/scoring.js";
import { findFreeWindows, selectNextAction, splitTask } from "../js/domain/scheduling.js";
import { addXp, levelFromXp, xpForTask } from "../js/domain/xp.js";
import { completeTask, removeById, upsertById } from "../js/domain/reducers.js";

test("urgency increases as deadline gets closer", () => {
  const now = new Date("2026-10-15T10:00:00Z").getTime();
  const soon = computeUrgency({ task: { deadline: "2026-10-15T12:00:00Z" }, now });
  const later = computeUrgency({ task: { deadline: "2026-10-25T12:00:00Z" }, now });
  assert.ok(soon > later);
});

test("energy fit rewards a task matching current energy", () => {
  assert.ok(
    computeEnergyFit({ task: { preferredEnergyMin: 3 }, energy: 3 }) >
    computeEnergyFit({ task: { preferredEnergyMin: 8 }, energy: 3 })
  );
});

test("findFreeWindows respects event buffer", () => {
  const windows = findFreeWindows({
    from: "2026-10-15T10:00:00Z",
    to: "2026-10-15T13:00:00Z",
    bufferMinutes: 10,
    events: [{ start: "2026-10-15T11:00:00Z", end: "2026-10-15T12:00:00Z" }]
  });

  assert.equal(windows.length, 2);
  assert.equal(windows[0].minutes, 50);
  assert.equal(windows[1].minutes, 50);
});

test("splitTask refuses an unsplittable task that does not fit", () => {
  assert.equal(splitTask({ estimateMinutes: 60, splittable: false }, 20), null);
});

test("selectNextAction returns a feasible candidate", () => {
  const action = selectNextAction({
    energy: 3,
    freeWindowMinutes: 20,
    now: new Date("2026-10-15T10:00:00Z").getTime(),
    tasks: [
      { id: "long", estimateMinutes: 90, splittable: false, importance: 5, difficulty: 5 },
      { id: "short", estimateMinutes: 15, splittable: true, importance: 3, difficulty: 3 }
    ]
  });

  assert.equal(action.id, "short");
});

test("priority score is finite for a normal task", () => {
  const score = computePriorityScore({
    task: { estimateMinutes: 20, importance: 3, difficulty: 3, splittable: true },
    energy: 3,
    freeWindowMinutes: 30
  });
  assert.equal(Number.isFinite(score), true);
});

test("xp helpers never decrease xp", () => {
  const earned = xpForTask({ minutes: 25, difficulty: 2, importance: 3, started: true });
  const game = addXp({ xp: 100, level: 1 }, earned);
  assert.ok(game.xp >= 100);
  assert.equal(game.level, levelFromXp(game.xp));
});

test("reducers are immutable", () => {
  const list = [{ id: "a", value: 1 }];
  const next = upsertById(list, { id: "a", value: 2 });
  assert.notEqual(next, list);
  assert.equal(list[0].value, 1);
  assert.equal(next[0].value, 2);
  assert.deepEqual(removeById(next, "a"), []);

  const state = { tasks: [{ id: "a", status: "active", progress: 0 }] };
  const completed = completeTask(state, "a", 123);
  assert.notEqual(completed, state);
  assert.equal(completed.tasks[0].status, "completed");
});
