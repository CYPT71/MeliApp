import test from "node:test";
import assert from "node:assert/strict";
import { features } from "../js/core/registry.js";
import { createApp } from "../js/core/app.js";
import { createInitialState } from "../js/core/state.js";
import { exportMetafocusJournal } from "../js/domain/metafocus.js";
import { createCheckInScheduler, speakLocal } from "../js/services/metafocus.js";

const makeApp = () => createApp({ registry: features, initialState: createInitialState(features) });
const createRecipe = (app) => app.dispatch("metafocus:create", { title: "Faire un gâteau", steps: "Peser 200 g de farine\nAjouter deux œufs\nMélanger" });
const active = (app) => { const feature = app.getState().features.guided; return feature.sessions[feature.activeTaskId]; };

test("a procedural activity creates ordered steps without rewarding its preparation", async () => {
  const app = makeApp(), before = structuredClone(app.getState().features.game);
  await createRecipe(app);
  assert.deepEqual(active(app).steps.map((step) => step.title), ["Peser 200 g de farine", "Ajouter deux œufs", "Mélanger"]);
  assert.equal(app.getState().features.tasks.items.length, 4);
  assert.deepEqual(app.getState().features.game, before);
  assert.equal(app.getState().features.guided.preferences.remindersEnabled, false);
  assert.deepEqual(app.getState().features.guided.journal, []);
});

test("invalid activities do not partially create tasks or silently truncate steps", async () => {
  const app = makeApp();
  await app.dispatch("metafocus:create", { title: "", steps: "Étape" });
  await app.dispatch("metafocus:create", { title: "Trop d’étapes", steps: Array(101).fill("Étape").join("\n") });
  assert.equal(app.getState().features.tasks.items.length, 0);
  assert.ok(app.getState().features.guided.createError);
});

test("optional check-ins are guarded by the active session and never change XP", async () => {
  const app = makeApp(); await createRecipe(app);
  const payload = { taskId: active(app).taskId, stepId: active(app).steps[0].id };
  await app.dispatch("metafocus:prompt", payload);
  assert.equal(Boolean(active(app).promptPending), false);
  await app.dispatch("metafocus:settings", { remindersEnabled: true, intervalMinutes: 2 });
  await app.dispatch("metafocus:prompt", { ...payload, stepId: "obsolete" });
  assert.equal(Boolean(active(app).promptPending), false);
  await app.dispatch("metafocus:prompt", payload);
  assert.equal(active(app).promptPending, true);
  await app.dispatch("metafocus:ack");
  assert.equal(Boolean(active(app).promptPending), false);
  await app.dispatch("guide:pause");
  await app.dispatch("metafocus:prompt", payload);
  assert.equal(Boolean(active(app).promptPending), false);
  assert.equal(app.getState().features.game.xp, 0);
});

test("journaling requires opt-in, excludes notes, and distinguishes declarations from observations", async () => {
  const app = makeApp(); await createRecipe(app);
  await app.dispatch("guide:lost");
  assert.deepEqual(app.getState().features.guided.journal, []);
  await app.dispatch("metafocus:settings", { journalEnabled: true });
  await app.dispatch("guide:resume");
  await app.dispatch("guide:lost");
  await app.dispatch("guide:note", { note: "Note privée", nextGesture: "Deux œufs déjà ajoutés" });
  const feature = app.getState().features.guided;
  assert.ok(feature.journal.some((entry) => entry.action === "perte_du_fil_declaree"));
  const exported = exportMetafocusJournal(feature.journal);
  const text = JSON.stringify(exported);
  assert.ok(!text.includes("Note privée"));
  assert.ok(!text.includes("Deux œufs"));
  assert.ok(!text.includes("Faire un gâteau"));
  assert.ok(!text.includes(active(app).taskId));
  assert.equal(exported.events[0].session, "S1");
  const count = feature.journal.length;
  await app.dispatch("metafocus:settings", { journalEnabled: false });
  await app.dispatch("guide:resume");
  assert.equal(app.getState().features.guided.journal.length, count);
});

test("erasing checkpoints removes notes and logs while retaining activities and tasks", async () => {
  const app = makeApp(); await createRecipe(app);
  await app.dispatch("guide:note", { note: "Repère privé" });
  await app.dispatch("metafocus:settings", { journalEnabled: true });
  await app.dispatch("guide:pause");
  await app.dispatch("metafocus:clear-reperes");
  assert.deepEqual(app.getState().features.guided.sessions, {});
  assert.deepEqual(app.getState().features.guided.journal, []);
  assert.equal(app.getState().features.guided.preferences.journalEnabled, false);
  assert.equal(app.getState().features.tasks.items.length, 4);
});

test("optional reflection is saved locally and is absent from journal exports", async () => {
  const app = makeApp(); await createRecipe(app);
  await app.dispatch("metafocus:reflect", { text: "Relire le dernier geste m’aide" });
  assert.equal(active(app).reflection, "Relire le dernier geste m’aide");
  assert.ok(!JSON.stringify(exportMetafocusJournal(app.getState().features.guided.journal)).includes("Relire"));
});

test("scheduler arms only once, cancels on pause and adapts to changed intervals", () => {
  const callbacks = new Map(), cancelled = [], delays = []; let id = 0;
  const scheduler = createCheckInScheduler({ now: () => 0, setTimer: (fn, delay) => { delays.push(delay); callbacks.set(++id, fn); return id; }, clearTimer: (timer) => { cancelled.push(timer); callbacks.delete(timer); } });
  const session = { taskId: "t1", steps: [{ id: "s1", done: false }], status: "active", savedAt: new Date(0).toISOString() };
  const due = [];
  const options = { session, preferences: { remindersEnabled: true, intervalMinutes: 2 }, onDue: (payload) => due.push(payload) };
  scheduler.sync(options); scheduler.sync(options);
  assert.deepEqual(delays, [120000]);
  scheduler.sync({ ...options, preferences: { remindersEnabled: true, intervalMinutes: 7 } });
  assert.equal(cancelled.length, 1);
  assert.equal(delays.at(-1), 420000);
  const fire = callbacks.get(id); callbacks.delete(id); fire();
  assert.deepEqual(due, [{ taskId: "t1", stepId: "s1" }]);
  scheduler.sync({ ...options, session: { ...session, status: "paused" } });
  assert.equal(callbacks.size, 0);
  scheduler.stop();
});

test("speech refuses remote voices and gracefully handles an unavailable browser API", () => {
  const previousSpeech = globalThis.speechSynthesis, previousUtterance = globalThis.SpeechSynthesisUtterance;
  let spoken = null;
  try {
    globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    globalThis.speechSynthesis = { getVoices: () => [{ localService: false, lang: "fr-FR" }], cancel() {}, speak(value) { spoken = value; } };
    assert.match(speakLocal("Mon repère"), /Aucune voix française locale/);
    assert.equal(spoken, null);
    globalThis.speechSynthesis.getVoices = () => [{ localService: true, lang: "fr-FR" }];
    assert.match(speakLocal("Mon repère"), /démarrée/);
    assert.equal(spoken.text, "Mon repère");
    globalThis.speechSynthesis = undefined;
    assert.match(speakLocal("Mon repère"), /pas disponible/);
  } finally { globalThis.speechSynthesis = previousSpeech; globalThis.SpeechSynthesisUtterance = previousUtterance; }
});
