import test from "node:test";
import assert from "node:assert/strict";

import { createOutlookService } from "../js/services/outlook.js";

const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key)
  };
};

test("Outlook service is explicitly delegated and calendar-scoped", () => {
  const previous = globalThis.sessionStorage;
  globalThis.sessionStorage = memoryStorage();
  try {
    const service = createOutlookService({ clientId: "public-client-id", tenant: "common", authMode: "delegated" });
    const auth = service.getAuthInfo();
    assert.equal(auth.mode, "delegated");
    assert.equal(auth.usesClientSecret, false);
    assert.equal(auth.graphSubject, "/me");
    assert.ok(auth.scopes.includes("Calendars.ReadWrite"));
    assert.ok(auth.scopes.includes("offline_access"));
  } finally {
    globalThis.sessionStorage = previous;
  }
});

test("Outlook service rejects non-delegated auth modes", () => {
  const previous = globalThis.sessionStorage;
  globalThis.sessionStorage = memoryStorage();
  try {
    assert.throws(
      () => createOutlookService({ clientId: "public-client-id", authMode: "application" }),
      /DELEGATED/
    );
  } finally {
    globalThis.sessionStorage = previous;
  }
});
