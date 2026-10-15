import test from "node:test";
import assert from "node:assert/strict";

import { createAiService } from "../js/services/ai.js";
import { connectionFriendlyOverride } from "../js/features-connections-friendly.js";

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
};

test("AI provider can be connected through an injected account adapter", async () => {
  const storage = createStorage();
  const ai = createAiService({
    storage,
    connections: {
      openai: {
        connect: async () => ({ credential: "session-credential", model: "gpt-test" }),
        disconnect: async () => undefined
      }
    }
  });

  assert.equal(ai.isConnected("openai"), false);
  const connected = await ai.connect("openai");
  assert.equal(connected.connected, true);
  assert.equal(connected.model, "gpt-test");
  assert.equal(ai.isConnected("openai"), true);

  await ai.disconnect("openai");
  assert.equal(ai.isConnected("openai"), false);
});

test("AI connect returns unavailable instead of asking the user for a key when no adapter exists", async () => {
  const ai = createAiService({ storage: createStorage() });
  const result = await ai.connect("gemini");
  assert.deepEqual(result, { connected: false, reason: "not-configured" });
});

test("friendly AI feature exposes connection events", () => {
  assert.ok(connectionFriendlyOverride.ai.when.includes("ai:connect-provider"));
  assert.ok(connectionFriendlyOverride.ai.when.includes("ai:disconnect-provider"));
});

test("Outlook user-facing render does not reuse raw technical error text", () => {
  const source = connectionFriendlyOverride.microsoftAuth.ui.render.toString();
  assert.doesNotMatch(source, /Client ID non configuré/);
});
