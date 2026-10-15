import test from "node:test";
import assert from "node:assert/strict";
import { features } from "../js/core/registry.js";
import { createInitialState } from "../js/core/state.js";
import { runFeatures } from "../js/core/app.js";

const update = async (state, event, outlook) => (await runFeatures({
  event, registry: features, context: { state, services: { outlook } }
})).state;
const panelVisible = (state) => features.microsoftAuth.ui.visible({ state });

test("Outlook login panel disappears after session restoration", async () => {
  const initial = createInitialState(features);
  assert.equal(panelVisible(initial), true);
  const state = await update(initial, "app:start", {
    restore: async () => ({}), isConnected: () => true, listEvents: async () => []
  });
  assert.equal(panelVisible(state), false);
  assert.equal(state.features.microsoftAuth.connectionLost, false);
});

test("a missing session on resume restores the login panel and disconnection message", async () => {
  const initial = createInitialState(features);
  initial.auth.microsoft = { connected: true };
  initial.features.microsoftAuth.status = "connected";
  const state = await update(initial, "app:resume", {
    restore: async () => null, isConnected: () => false
  });
  assert.equal(panelVisible(state), true);
  assert.equal(state.auth.microsoft, null);
  assert.equal(state.features.microsoftAuth.connectionLost, true);
});

test("session rejection during sync restores the panel; reconnecting clears the notice", async () => {
  const initial = createInitialState(features);
  initial.auth.microsoft = { connected: true };
  let connected = true;
  const state = await update(initial, "sync:manual", {
    restore: async () => ({}), isConnected: () => connected,
    listEvents: async () => { connected = false; throw new Error("Session Outlook expirée"); }
  });
  assert.equal(panelVisible(state), true);
  assert.equal(state.features.microsoftAuth.connectionLost, true);
  const restored = await update(state, "app:start", {
    restore: async () => ({}), isConnected: () => true, listEvents: async () => []
  });
  assert.equal(panelVisible(restored), false);
  assert.equal(restored.features.microsoftAuth.connectionLost, false);
});

test("a network failure does not disconnect an authenticated user", async () => {
  const state = await update(createInitialState(features), "app:start", {
    restore: async () => ({}), isConnected: () => true,
    listEvents: async () => { throw new TypeError("Failed to fetch"); }
  });
  assert.equal(panelVisible(state), false);
  assert.equal(state.features.microsoftAuth.connectionLost, false);
  assert.equal(state.features.outlookSync.error, "Failed to fetch");
});
