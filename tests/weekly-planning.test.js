import test from "node:test";
import assert from "node:assert/strict";

import { adaptiveTaskScore } from "../js/domain/adaptive-planning.js";
import { buildAdaptiveWeekPlan } from "../js/domain/weekly-planning.js";

test("la proposition hebdomadaire ne planifie pas plusieurs fois le même effort", () => {
  const from = new Date("2026-10-19T08:00:00Z").getTime();
  const plan = buildAdaptiveWeekPlan({
    from,
    energy: 7,
    dayStart: "08:00",
    dayEnd: "18:00",
    tasks: [{
      id: "memoire",
      title: "Écrire le mémoire",
      estimateMinutes: 60,
      progress: 0,
      difficulty: 3,
      importance: 5,
      splittable: true,
      minimumChunkMinutes: 10,
      deadline: "2026-10-23T17:00:00Z"
    }]
  });

  const workMinutes = plan.blocks
    .filter((block) => block.type === "task" && block.taskId === "memoire")
    .reduce((sum, block) => sum + block.minutes, 0);
  assert.equal(workMinutes, 60);
  assert.equal(plan.unscheduled.length, 0);
  assert.equal(plan.dayPlans.length, 7);
});

test("les rendez-vous restent des contraintes fixes dans la semaine", () => {
  const plan = buildAdaptiveWeekPlan({
    from: new Date("2026-10-19T08:00:00Z").getTime(),
    dayStart: "08:00",
    dayEnd: "18:00",
    tasks: [{ id: "t1", title: "Révision", estimateMinutes: 30, difficulty: 2, importance: 3, splittable: true }],
    events: [{ id: "rdv", title: "Rendez-vous", start: "2026-10-19T10:00:00Z", end: "2026-10-19T11:00:00Z" }]
  });
  const fixed = plan.blocks.find((block) => block.type === "event" && block.sourceId === "rdv");
  assert.ok(fixed);
  assert.equal(fixed.title, "Rendez-vous");
});

test("le reroll ajoute une variation stable sans écraser les priorités", () => {
  const task = { id: "t1", title: "Travail", estimateMinutes: 30, difficulty: 3, importance: 3 };
  const base = adaptiveTaskScore({ task, energy: 5, freeWindowMinutes: 60, now: 1_000_000, variant: 0 });
  const rerollA = adaptiveTaskScore({ task, energy: 5, freeWindowMinutes: 60, now: 1_000_000, variant: 4 });
  const rerollB = adaptiveTaskScore({ task, energy: 5, freeWindowMinutes: 60, now: 1_000_000, variant: 4 });
  assert.equal(rerollA, rerollB);
  assert.notEqual(base, rerollA);
  assert.ok(Math.abs(rerollA - base) <= 1.21);
});
