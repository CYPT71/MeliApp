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

for (const status of [200, 403, 503]) {
  test(`Outlook category colors: metadata status ${status} preserves calendar events`, async () => {
    const previousStorage = globalThis.sessionStorage, previousFetch = globalThis.fetch;
    globalThis.sessionStorage = memoryStorage();
    sessionStorage.setItem("meliapp:microsoft:access_token", "test-access");
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes("masterCategories")) return new Response(JSON.stringify(status === 200
        ? { value: [{ displayName: "Travail", color: "preset0" }, { displayName: "Santé", color: "preset4" }] }
        : { error: { message: "Unavailable" } }), { status });
      return new Response(JSON.stringify({ value: [{ id: "one", subject: "Rendez-vous", start: { dateTime: "2026-10-15T09:00:00", timeZone: "UTC" }, end: { dateTime: "2026-10-15T10:00:00", timeZone: "UTC" }, categories: ["Travail", "Santé", "Inconnue"] }] }));
    };
    try {
      const service = createOutlookService({ clientId: "test-client" });
      assert.ok(service.getAuthInfo().scopes.includes("MailboxSettings.Read"));
      const events = await service.listEvents({ from: "2026-10-15", to: "2026-10-16" });
      assert.equal(events.length, 1);
      assert.deepEqual(events[0].categories, ["Travail", "Santé", "Inconnue"]);
      assert.deepEqual(events[0].categoryColors, status === 200 ? [{ name: "Travail", color: "preset0" }, { name: "Santé", color: "preset4" }] : []);
      assert.equal(service.getCategoryError(), status === 200 ? null : status === 403 ? "permission" : "unavailable");
      assert.equal(service.isConnected(), true);
      assert.ok(new URL(calls[0]).searchParams.get("$select").split(",").includes("categories"));
    } finally { globalThis.sessionStorage = previousStorage; globalThis.fetch = previousFetch; }
  });
}

test("Outlook lists calendars across pages and requests only selected calendar IDs", async () => {
  const previousStorage = globalThis.sessionStorage, previousFetch = globalThis.fetch;
  globalThis.sessionStorage = memoryStorage();
  sessionStorage.setItem("meliapp:microsoft:access_token", "test-access");
  const paths = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url); paths.push(parsed.pathname + parsed.search);
    if (parsed.pathname.endsWith("/calendars")) {
      return new Response(JSON.stringify(parsed.searchParams.has("$skip")
        ? { value: [{ id: "personal", name: "Personnel" }] }
        : { value: [{ id: "work/id", name: "Travail", isDefaultCalendar: true }], "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/calendars?$skip=1" }));
    }
    assert.ok(parsed.pathname.includes("/calendars/work%2Fid/calendarView"));
    return new Response(JSON.stringify({ value: [{ id: "event", subject: "Travail", start: { dateTime: "2026-10-15T09:00:00", timeZone: "UTC" }, end: { dateTime: "2026-10-15T10:00:00", timeZone: "UTC" } }] }));
  };
  try {
    const service = createOutlookService({ clientId: "test-client" });
    assert.deepEqual(await service.listCalendars(), [{ id: "work/id", name: "Travail", isDefault: true, isDefaultCalendar: true, color: null, canEdit: true }, { id: "personal", name: "Personnel", isDefault: false, isDefaultCalendar: false, color: null, canEdit: true }]);
    const events = await service.listEvents({ from: "2026-10-15", to: "2026-10-16", calendarIds: ["work/id"] });
    assert.equal(events[0].calendarId, "work/id");
    const count = paths.length;
    assert.deepEqual(await service.listEvents({ from: "2026-10-15", to: "2026-10-16", calendarIds: [] }), []);
    assert.equal(paths.length, count);
  } finally { globalThis.sessionStorage = previousStorage; globalThis.fetch = previousFetch; }
});
