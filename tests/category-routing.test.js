import test from "node:test";
import assert from "node:assert/strict";

import { features } from "../js/core/registry.js";
import { featurePages, findPageByRoute } from "../js/core/router.js";

test("production registry exposes the expected grouped navigation", () => {
  const pages = featurePages(features);
  const byPath = Object.fromEntries(pages.map((entry) => [entry.page.path, entry]));

  assert.deepEqual(byPath.calendar.names, ["microsoftAuth", "outlookSync", "calendarView", "manualSync"]);
  assert.ok(byPath.organize.names.includes("tasks"));
  assert.ok(byPath.organize.names.includes("projects"));
  assert.ok(byPath.progress.names.includes("game"));
  assert.ok(byPath.integrations.names.includes("spotify"));
  assert.ok(byPath.integrations.names.includes("ai"));
  assert.ok(byPath.settings.names.includes("settings"));
  assert.ok(byPath.settings.names.includes("notifications"));
});

test("a grouped route resolves all members, not only its first feature", () => {
  const page = findPageByRoute(features, "organize");
  assert.ok(page);
  assert.ok(page.names.length >= 2);
  assert.ok(page.names.includes("tasks"));
});
