import test from "node:test";
import assert from "node:assert/strict";
import { adaptiveTaskScore, buildAdaptiveDayPlan, energyPolicy, taskContext } from "../js/domain/adaptive-planning.js";

test("energyPolicy renforce les pauses quand l'énergie baisse", () => {
  const low = energyPolicy(2);
  const high = energyPolicy(9);
  assert.ok(low.workMinutes < high.workMinutes);
  assert.ok(low.slackRatio > high.slackRatio);
  assert.ok(low.breakMinutes >= 10);
});

test("les deadlines proches gagnent en priorité même à énergie basse", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  const urgent = { id: "u", title: "Rendre devoir", deadline: "2026-10-15T14:00:00Z", estimateMinutes: 20, difficulty: 4, importance: 4, context: "cours", splittable: true };
  const later = { id: "l", title: "Ranger", deadline: "2026-10-20T14:00:00Z", estimateMinutes: 20, difficulty: 1, importance: 2, context: "perso", splittable: true };
  assert.ok(
    adaptiveTaskScore({ task: urgent, energy: 2, freeWindowMinutes: 60, now }) >
    adaptiveTaskScore({ task: later, energy: 2, freeWindowMinutes: 60, now })
  );
});

test("le plan respecte l'agenda et insère des pauses", () => {
  const from = Date.parse("2026-10-15T08:00:00Z");
  const to = Date.parse("2026-10-15T12:00:00Z");
  const result = buildAdaptiveDayPlan({
    from,
    to,
    energy: 4,
    bufferMinutes: 10,
    events: [{ id: "course", title: "Cours", start: "2026-10-15T09:00:00Z", end: "2026-10-15T10:00:00Z" }],
    tasks: [
      { id: "a", title: "Devoir", deadline: "2026-10-15T18:00:00Z", estimateMinutes: 60, difficulty: 3, importance: 5, context: "cours", splittable: true, minimumChunkMinutes: 10, status: "active" },
      { id: "b", title: "Administratif", estimateMinutes: 30, difficulty: 2, importance: 3, context: "perso", splittable: true, minimumChunkMinutes: 10, status: "active" }
    ]
  });

  assert.ok(result.blocks.some((block) => block.type === "event" && block.title === "Cours"));
  assert.ok(result.blocks.some((block) => block.type === "task"));
  assert.ok(result.blocks.some((block) => block.type === "break"));
  const event = result.blocks.find((block) => block.type === "event");
  const taskOverlap = result.blocks.filter((block) => block.type === "task").some((block) => block.start < event.end && block.end > event.start);
  assert.equal(taskOverlap, false);
});

test("taskContext classe explicitement et automatiquement cours/perso", () => {
  assert.equal(taskContext({ context: "cours" }), "cours");
  assert.equal(taskContext({ category: "study" }), "cours");
  assert.equal(taskContext({ title: "Réviser le chapitre 4" }), "cours");
  assert.equal(taskContext({ projectTitle: "Université", title: "Préparer la présentation" }), "cours");
  assert.equal(taskContext({ title: "Faire les courses" }), "perso");
});
