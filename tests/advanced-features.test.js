import test from "node:test";
import assert from "node:assert/strict";

import { advancedFeatures } from "../js/features-advanced.js";

const state = (features = {}, extra = {}) => ({
  auth: { microsoft: { connected: true }, spotify: null, ai: null },
  calendar: { events: [], lastSyncAt: null },
  tasks: [],
  projects: [],
  sessions: [],
  settings: { workMode: "free" },
  diagnostics: [],
  features: {
    energy: { value: 5, lowThreshold: 3, expiresAfterMinutes: 180 },
    tasks: { items: [] },
    planner: { current: null, candidates: [], index: 0 },
    flow: { active: false, mode: "free", taskId: null },
    game: { xp: 0, level: 1 },
    spotify: { connected: false },
    notifications: { enabled: false },
    ...features
  },
  ...extra
});

test("settings propagates energy and default work mode without core wiring", () => {
  const input = state({ settings: advancedFeatures.settings.state });
  const output = advancedFeatures.settings.run({
    state: input,
    payload: {
      lowEnergyThreshold: 4,
      energyExpiryMinutes: 90,
      calendarBufferMinutes: 15,
      defaultWorkMode: "flow"
    }
  });

  assert.equal(output.features.settings.lowEnergyThreshold, 4);
  assert.equal(output.features.energy.lowThreshold, 4);
  assert.equal(output.features.energy.expiresAfterMinutes, 90);
  assert.equal(output.settings.workMode, "flow");
  assert.equal(output.settings.calendarBufferMinutes, 15);
});

test("projects are created as feature state", () => {
  const input = state({ projects: { items: [] } });
  const output = advancedFeatures.projects.run({
    state: input,
    event: "project:create",
    payload: { title: "Mémoire", deadline: "2026-11-01T12:00" }
  });
  assert.equal(output.features.projects.items.length, 1);
  assert.equal(output.features.projects.items[0].title, "Mémoire");
});

test("planner stability keeps previous candidate when scores are close", () => {
  const previous = { id: "a", title: "A", score: 10, chunkMinutes: 20 };
  const top = { id: "b", title: "B", score: 11, chunkMinutes: 20 };
  const input = state({
    planner: { current: top, candidates: [top, previous], index: 0 },
    plannerStability: { lastTaskId: "a", switches: 0 }
  });

  const output = advancedFeatures.plannerStability.run({ state: input, event: "energy:set" });
  assert.equal(output.features.planner.current.id, "a");
  assert.equal(output.features.planner.index, 1);
});

test("planner stability accepts a materially better candidate", () => {
  const previous = { id: "a", score: 8 };
  const top = { id: "b", score: 15 };
  const input = state({
    planner: { current: top, candidates: [top, previous], index: 0 },
    plannerStability: { lastTaskId: "a", switches: 0 }
  });
  const output = advancedFeatures.plannerStability.run({ state: input, event: "energy:set" });
  assert.equal(output.features.planner.current.id, "b");
  assert.equal(output.features.plannerStability.lastTaskId, "b");
});

test("outlook write creates a calendar focus block through the injected service", async () => {
  let captured;
  const input = state({
    planner: { current: { id: "t1", title: "Rapport", chunkMinutes: 30 }, candidates: [], index: 0 },
    outlookWrite: { writing: false, lastEventId: null, error: null }
  });
  const output = await advancedFeatures.outlookWrite.run({
    state: input,
    services: {
      outlook: {
        createFocusBlock: async (payload) => {
          captured = payload;
          return { id: "evt1" };
        }
      }
    }
  });
  assert.equal(captured.title, "Rapport");
  assert.equal(output.features.outlookWrite.lastEventId, "evt1");
});

test("spotify library stores normalized playlists from injected service", async () => {
  const input = state({ spotifyLibrary: { playlists: [], loading: false, error: null } });
  const output = await advancedFeatures.spotifyLibrary.run({
    state: input,
    services: { spotify: { listPlaylists: async () => [{ id: "p1", name: "Focus", uri: "spotify:playlist:p1" }] } }
  });
  assert.deepEqual(output.features.spotifyLibrary.playlists, [{ id: "p1", name: "Focus", uri: "spotify:playlist:p1" }]);
});

test("data reset clears product progress while preserving feature registry shape", () => {
  const input = state({
    tasks: { items: [{ id: "t1", title: "X" }] },
    projects: { items: [{ id: "p1", title: "P" }] },
    planner: { current: { id: "t1" }, candidates: [], index: 0 },
    game: { xp: 200, level: 2 },
    achievements: { unlocked: ["first-task"] },
    dataManager: { lastImportAt: null, error: null }
  }, { sessions: [{ endedAt: Date.now() }] });

  const output = advancedFeatures.dataManager.run({ state: input, event: "data:reset" });
  assert.deepEqual(output.features.tasks.items, []);
  assert.deepEqual(output.features.projects.items, []);
  assert.equal(output.features.game.xp, 0);
  assert.deepEqual(output.sessions, []);
});
