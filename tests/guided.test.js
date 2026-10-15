import test from "node:test";
import assert from "node:assert/strict";
import { features } from "../js/core/registry.js";
import { createApp } from "../js/core/app.js";
import { createInitialState, mergePersistedState } from "../js/core/state.js";
import { createGuidedSession } from "../js/features-guided.js";

const initial = () => {
  const state = createInitialState(features);
  state.features.tasks.items = [
    { id: "meal", title: "Préparer le repas", status: "active", estimateMinutes: 30, importance: 3, difficulty: 2 },
    { id: "veg", parentTaskId: "meal", title: "Couper les légumes", status: "active", estimateMinutes: 10 },
    { id: "oven", parentTaskId: "meal", title: "Préchauffer le four", status: "active", estimateMinutes: 5 },
    { id: "other", title: "Faire le dossier", status: "active" }
  ];
  return state;
};
const session = (app, id = "meal") => app.getState().features.guided.sessions[id];
const appFor = (state = initial(), extra = {}) => createApp({ registry: features, initialState: state, ...extra });

test("guided steps reuse subtasks, and unsplit tasks have a single independent step", () => {
  assert.deepEqual(createGuidedSession(initial(), "meal").steps.map((step) => step.taskId), ["veg", "oven"]);
  assert.equal(createGuidedSession(initial(), "other").steps[0].taskId, null);
  assert.equal(createGuidedSession(initial(), "missing"), null);
});

test("pauses, attention recovery and notes do not change tasks or game rewards", async () => {
  const state = initial(), game = structuredClone(state.features.game), taskSnapshot = structuredClone(state.features.tasks);
  const app = appFor(state);
  await app.dispatch("guide:start", { taskId: "meal" });
  await app.dispatch("guide:lost");
  await app.dispatch("guide:note", { note: "Légumes lavés", nextGesture: "Prendre le couteau" });
  await app.dispatch("guide:pause");
  assert.equal(session(app).status, "paused");
  assert.equal(session(app).note, "Légumes lavés");
  assert.equal(session(app).nextGesture, "Prendre le couteau");
  assert.deepEqual(app.getState().features.game, game);
  assert.deepEqual(app.getState().features.tasks, taskSnapshot);
});

test("saved sessions restore their exact step and context after restarting", async () => {
  let saved;
  const app = appFor(initial(), { persist: async (state) => { saved = structuredClone(state); } });
  await app.dispatch("guide:start", { taskId: "meal" });
  await app.dispatch("guide:complete-step", { stepId: "veg", requestId: "one" });
  await app.dispatch("guide:note", { note: "Planche rangée", nextGesture: "Allumer le four" });
  const restored = appFor(mergePersistedState(createInitialState(features), saved));
  await restored.dispatch("app:start");
  assert.equal(session(restored).status, "paused");
  assert.equal(session(restored).steps.find((step) => !step.done).id, "oven");
  assert.equal(session(restored).lastCompleted, "Couper les légumes");
  assert.equal(session(restored).note, "Planche rangée");
});

test("switching activities keeps each session and pauses the previous activity", async () => {
  const app = appFor();
  await app.dispatch("guide:start", { taskId: "meal" });
  await app.dispatch("guide:note", { note: "Repère cuisine" });
  await app.dispatch("guide:start", { taskId: "other" });
  assert.equal(session(app).status, "paused");
  assert.equal(session(app).note, "Repère cuisine");
  await app.dispatch("guide:start", { taskId: "meal" });
  assert.equal(app.getState().features.guided.activeTaskId, "meal");
  assert.equal(session(app).steps[0].id, "veg");
});

test("a smaller first gesture does not prematurely complete its parent step", async () => {
  const app = appFor();
  await app.dispatch("guide:start", { taskId: "meal" });
  await app.dispatch("guide:smaller", { smallStep: "Sortir la planche" });
  await app.dispatch("guide:resume");
  await app.dispatch("guide:complete-step", { stepId: "veg", requestId: "small" });
  assert.equal(session(app).steps[0].done, false);
  assert.equal(session(app).smallStep, "");
  assert.equal(session(app).lastCompleted, "Sortir la planche");
});

test("duplicate step clicks do not skip ahead or award XP twice", async () => {
  const app = appFor();
  await app.dispatch("guide:start", { taskId: "meal" });
  const action = features.guided.ui.actions["guide.complete-step"];
  await Promise.all([action({ target: { dataset: { stepId: "veg" } }, dispatch: app.dispatch }), action({ target: { dataset: { stepId: "veg" } }, dispatch: app.dispatch })]);
  assert.equal(session(app).steps.filter((step) => step.done).length, 1);
  assert.equal(app.getState().features.tasks.items.find((task) => task.id === "veg").status, "completed");
  const xp = app.getState().features.game.xp;
  await action({ target: { dataset: { stepId: "veg" } }, dispatch: app.dispatch });
  assert.equal(app.getState().features.game.xp, xp);
});

test("finishing the task is explicit and idempotent", async () => {
  const app = appFor();
  await app.dispatch("guide:start", { taskId: "other" });
  await app.dispatch("guide:finish", { requestId: "too-early" });
  assert.equal(session(app, "other").status, "active");
  await app.dispatch("guide:complete-step", { stepId: "step_other", requestId: "one" });
  assert.equal(app.getState().features.tasks.items.find((task) => task.id === "other").status, "active");
  const finish = features.guided.ui.actions["guide.finish"];
  await Promise.all([finish({ dispatch: app.dispatch }), finish({ dispatch: app.dispatch })]);
  const xp = app.getState().features.game.xp;
  assert.equal(session(app, "other").status, "completed");
  assert.equal(app.getState().features.tasks.items.find((task) => task.id === "other").status, "completed");
  await finish({ dispatch: app.dispatch });
  assert.equal(app.getState().features.game.xp, xp);
});

test("nested subtasks keep their order and already completed steps are not repeated", () => {
  const state = initial();
  state.features.tasks.items.find((task) => task.id === "veg").status = "completed";
  state.features.tasks.items.push({ id: "knob", parentTaskId: "oven", title: "Tourner le bouton", status: "active" });
  const saved = createGuidedSession(state, "meal");
  assert.deepEqual(saved.steps.map((step) => step.id), ["veg", "knob"]);
  assert.equal(saved.steps.find((step) => !step.done).id, "knob");
});
