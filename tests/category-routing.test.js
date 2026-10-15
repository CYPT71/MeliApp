import test from "node:test";
import assert from "node:assert/strict";

import { features } from "../js/core/registry.js";
import { featurePages, findPageByRoute, isFeatureVisibleOnRoute } from "../js/core/router.js";

test("production registry exposes the expected grouped navigation", () => {
  const pages = featurePages(features);
  const byPath = Object.fromEntries(pages.map((entry) => [entry.page.path, entry]));

  assert.deepEqual(byPath.calendar.names, ["microsoftAuth", "outlookSync", "calendarView", "manualSync"]);
  assert.ok(byPath.tasks.names.includes("taskWorkspace"));
  assert.ok(byPath.tasks.names.includes("tasks"));
  assert.deepEqual(byPath.mindmap.names, ["taskMindmap"]);
  assert.equal(byPath.mindmap.page.title, "Mindmap");
  assert.equal(byPath.mindmap.page.nav, true);
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
  assert.ok(!tasks.names.includes("taskMindmap"));
  assert.ok(!tasks.names.includes("projects"));
  assert.deepEqual(projects.names, ["projects"]);
});

test("mindmap has an independent route regardless of the selected task view", () => {
  const page = findPageByRoute(features, "#/mindmap");
  assert.deepEqual(page.names, ["taskMindmap"]);
  for (const view of ["today", "list", "matrix", "projects", "mindmap"]) {
    const state = { features: { taskWorkspace: { view } } };
    const feature = features.taskMindmap;
    assert.equal(feature.ui.visible?.({ state }) ?? true, true);
    assert.equal(isFeatureVisibleOnRoute({ name: "taskMindmap", feature, route: "mindmap" }), true);
    assert.equal(isFeatureVisibleOnRoute({ name: "taskMindmap", feature, route: "tasks" }), false);
  }
});
