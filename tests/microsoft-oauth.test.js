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

for (const scenario of ["refresh rejected", "refreshed token rejected", "temporary network failure"]) {
  test(`Outlook handles ${scenario} without stale authentication`, async () => {
    const previousStorage = globalThis.sessionStorage;
    const previousFetch = globalThis.fetch;
    const storage = memoryStorage();
    storage.setItem("meliapp:microsoft:access_token", "test-access");
    storage.setItem("meliapp:microsoft:refresh_token", "test-refresh");
    globalThis.sessionStorage = storage;
    globalThis.fetch = async (url) => {
      if (String(url).includes("/token")) {
        if (scenario === "temporary network failure") throw new TypeError("Failed to fetch");
        if (scenario === "refresh rejected") return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
        return new Response(JSON.stringify({ access_token: "test-renewed" }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    };
    try {
      const service = createOutlookService({ clientId: "test-client" });
      await assert.rejects(service.listEvents({ from: "2026-01-01", to: "2026-01-02" }),
        scenario === "temporary network failure" ? /Failed to fetch/ : /Session Outlook expirée/);
      assert.equal(service.isConnected(), scenario === "temporary network failure");
      if (scenario !== "temporary network failure") {
        assert.equal(storage.getItem("meliapp:microsoft:access_token"), null);
        assert.equal(storage.getItem("meliapp:microsoft:refresh_token"), null);
      }
    } finally {
      globalThis.sessionStorage = previousStorage;
      globalThis.fetch = previousFetch;
    }
  });
}

test("Outlook calendar follows pagination so busy days contain every event", async () => {
  const previousStorage = globalThis.sessionStorage;
  const previousFetch = globalThis.fetch;
  globalThis.sessionStorage = memoryStorage();
  sessionStorage.setItem("meliapp:microsoft:access_token", "test-access");
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const value = [{ id: String(calls.length), subject: "Rendez-vous", start: { dateTime: "2026-10-15T09:00:00", timeZone: "UTC" }, end: { dateTime: "2026-10-15T10:00:00", timeZone: "UTC" } }];
    return new Response(JSON.stringify({ value, ...(calls.length === 1 ? { "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/calendarView?$skip=1" } : {}) }));
  };
  try {
    const service = createOutlookService({ clientId: "test-client" });
    const events = await service.listEvents({ from: "2026-10-15", to: "2026-10-16" });
    assert.equal(events.length, 2);
    assert.equal(calls.length, 2);
    assert.match(calls[1], /\$skip=1/);
  } finally {
    globalThis.sessionStorage = previousStorage;
    globalThis.fetch = previousFetch;
  }
});
