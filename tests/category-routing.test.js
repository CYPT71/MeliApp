import test from "node:test";
import assert from "node:assert/strict";

import { features } from "../js/core/registry.js";
import { featurePages, findPageByRoute } from "../js/core/router.js";

test("production registry exposes the expected grouped navigation", () => {
  const pages = featurePages(features);
  const byPath = Object.fromEntries(pages.map((entry) => [entry.page.path, entry]));

  assert.deepEqual(byPath.calendar.names, ["microsoftAuth", "outlookSync", "calendarView", "manualSync"]);
  assert.ok(byPath.tasks.names.includes("taskWorkspace"));
  assert.ok(byPath.tasks.names.includes("tasks"));
  assert.ok(byPath.tasks.names.includes("taskMindmap"));
  assert.ok(byPath.tasks.names.includes("projects"));
  assert.deepEqual(byPath.day.names, ["flow"]);
  assert.ok(byPath.progress.names.includes("game"));
  assert.ok(byPath.settings.names.includes("spotify"));
  assert.ok(byPath.settings.names.includes("ai"));
});

test("tasks route resolves list, mindmap and project members", () => {
  const page = findPageByRoute(features, "tasks");
  assert.ok(page);
  assert.ok(page.names.includes("tasks"));
  assert.ok(page.names.includes("taskMindmap"));
  assert.ok(page.names.includes("projects"));
});
