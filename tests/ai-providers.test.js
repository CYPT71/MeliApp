import test from "node:test";
import assert from "node:assert/strict";

import { AI_PROVIDER_IDS, AI_PROVIDERS, createAiService } from "../js/services/ai.js";

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
};

const state = {
  features: {
    energy: { value: 4 },
    planner: { current: { title: "Rapport", chunkMinutes: 10 } },
    tasks: { items: [{ title: "Rapport", status: "active", estimateMinutes: 60, difficulty: 4, importance: 5 }] },
    flow: { mode: "free" }
  },
  calendar: { events: [] },
  settings: { workMode: "free" }
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" }
});

test("AI hub exposes only GPT Claude and Gemini", () => {
  assert.deepEqual(AI_PROVIDER_IDS, ["openai", "anthropic", "gemini"]);
  assert.deepEqual(Object.keys(AI_PROVIDERS), ["openai", "anthropic", "gemini"]);
  assert.equal("custom" in AI_PROVIDERS, false);
});

test("OpenAI/GPT adapter reads Responses API output_text", async () => {
  const storage = createStorage();
  const calls = [];
  const ai = createAiService({
    storage,
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ output_text: "Ouvre le rapport et écris trois phrases." });
    }
  });
  ai.setKey("openai", "secret-openai");

  const result = await ai.suggest({
    state,
    mode: "single",
    providers: { openai: { enabled: true, model: "gpt-test" } }
  });

  assert.equal(result.text, "Ouvre le rapport et écris trois phrases.");
  assert.deepEqual(result.providersUsed, ["openai"]);
  assert.match(calls[0].url, /api\.openai\.com\/v1\/responses/);
  assert.equal(calls[0].options.headers.Authorization, "Bearer secret-openai");
});

test("Claude adapter parses Messages API text", async () => {
  const storage = createStorage();
  const ai = createAiService({
    storage,
    fetchFn: async (url, options) => {
      assert.match(url, /api\.anthropic\.com\/v1\/messages/);
      assert.equal(options.headers["x-api-key"], "secret-claude");
      assert.equal(options.headers["anthropic-dangerous-direct-browser-access"], "true");
      return jsonResponse({ content: [{ type: "text", text: "Commence par ouvrir le document." }] });
    }
  });
  ai.setKey("anthropic", "secret-claude");

  const result = await ai.suggest({
    state,
    mode: "single",
    providers: { anthropic: { enabled: true, model: "claude-test" } }
  });

  assert.equal(result.text, "Commence par ouvrir le document.");
});

test("Gemini adapter uses x-goog-api-key and generateContent", async () => {
  const storage = createStorage();
  const ai = createAiService({
    storage,
    fetchFn: async (url, options) => {
      assert.match(url, /models\/gemini-test:generateContent$/);
      assert.equal(options.headers["x-goog-api-key"], "secret-gemini");
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "Écris seulement le premier paragraphe." }] } }] });
    }
  });
  ai.setKey("gemini", "secret-gemini");

  const result = await ai.suggest({
    state,
    mode: "single",
    providers: { gemini: { enabled: true, model: "gemini-test" } }
  });

  assert.equal(result.text, "Écris seulement le premier paragraphe.");
});

test("fallback mode tries the next configured provider", async () => {
  const storage = createStorage();
  let openAiCalls = 0;
  const ai = createAiService({
    storage,
    fetchFn: async (url) => {
      if (String(url).includes("openai")) {
        openAiCalls += 1;
        return jsonResponse({ error: { message: "indisponible" } }, 503);
      }
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "Fallback Gemini." }] } }] });
    }
  });
  ai.setKey("openai", "a");
  ai.setKey("gemini", "g");

  const result = await ai.suggest({
    state,
    mode: "fallback",
    providers: {
      openai: { enabled: true, model: "gpt-test" },
      gemini: { enabled: true, model: "gemini-test" }
    }
  });

  assert.equal(openAiCalls, 1);
  assert.equal(result.text, "Fallback Gemini.");
  assert.deepEqual(result.providersUsed, ["gemini"]);
  assert.equal(result.errors.length, 1);
});

test("fusion mode asks all configured providers then synthesizes", async () => {
  const storage = createStorage();
  let openAiCalls = 0;
  const ai = createAiService({
    storage,
    fetchFn: async (url) => {
      const value = String(url);
      if (value.includes("openai")) {
        openAiCalls += 1;
        return jsonResponse({ output_text: openAiCalls === 1 ? "Suggestion GPT" : "Suggestion fusionnée" });
      }
      if (value.includes("anthropic")) return jsonResponse({ content: [{ type: "text", text: "Suggestion Claude" }] });
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "Suggestion Gemini" }] } }] });
    }
  });
  ai.setKey("openai", "a");
  ai.setKey("anthropic", "c");
  ai.setKey("gemini", "g");

  const result = await ai.suggest({
    state,
    mode: "fusion",
    synthesisProvider: "openai",
    providers: {
      openai: { enabled: true, model: "gpt-test" },
      anthropic: { enabled: true, model: "claude-test" },
      gemini: { enabled: true, model: "gemini-test" }
    }
  });

  assert.equal(result.text, "Suggestion fusionnée");
  assert.deepEqual(result.providersUsed.sort(), ["anthropic", "gemini", "openai"]);
  assert.equal(result.synthesisProvider, "openai");
  assert.equal(openAiCalls, 2);
});

test("unknown providers are rejected and cannot become endpoints", () => {
  const ai = createAiService({ storage: createStorage(), fetchFn: async () => jsonResponse({}) });
  assert.throws(() => ai.setKey("custom", "nope"), /non autorisé/);
});

test("API keys remain session-only and can be cleared", () => {
  const storage = createStorage();
  const ai = createAiService({ storage, fetchFn: async () => jsonResponse({}) });
  assert.equal(ai.hasKey("openai"), false);
  ai.setKey("openai", "temporary");
  assert.equal(ai.hasKey("openai"), true);
  ai.clearKey("openai");
  assert.equal(ai.hasKey("openai"), false);
});
