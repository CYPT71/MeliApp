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
  assert.deepEqual(byPath.projects.names, ["projects"]);
  assert.deepEqual(byPath.day.names, ["flow"]);
  assert.ok(byPath.progress.names.includes("game"));
  assert.ok(byPath.settings.names.includes("spotify"));
  assert.ok(byPath.settings.names.includes("ai"));
});

test("tasks and projects resolve to separate routes", () => {
  const tasks = findPageByRoute(features, "tasks");
  const projects = findPageByRoute(features, "projects");
  assert.ok(tasks);
  assert.ok(projects);
  assert.ok(tasks.names.includes("tasks"));
  assert.ok(tasks.names.includes("taskMindmap"));
  assert.ok(!tasks.names.includes("projects"));
  assert.deepEqual(projects.names, ["projects"]);
});
