import test from "node:test";
import assert from "node:assert/strict";

import { featureCategories, applyFeatureCategories } from "../js/feature-categories.js";

const expected = {
  calendar: ["microsoftAuth", "outlookSync", "calendarView", "manualSync"],
  tasks: ["taskWorkspace", "tasks", "taskDecomposition", "taskEditor", "projects"],
  mindmap: ["taskMindmap"],
  day: ["flow"],
  progress: ["game", "stats", "achievements"],
  settings: ["spotify", "ai", "settings", "notifications", "install", "dataManagement", "diagnostics"]
};

test("production categories keep coherent features together", () => {
  for (const [name, names] of Object.entries(expected)) {
    assert.deepEqual(featureCategories[name].features, names);
  }
});

test("tasks have their own top-level navigation tab", () => {
  assert.equal(Object.keys(featureCategories).length, 6);
  assert.deepEqual(Object.keys(featureCategories), ["calendar", "tasks", "mindmap", "day", "progress", "settings"]);
  assert.equal(featureCategories.tasks.path, "tasks");
  assert.equal(featureCategories.tasks.title, "Tâches");
});

test("category routes are unique", () => {
  const paths = Object.values(featureCategories).map((category) => category.path ?? category.id);
  assert.equal(new Set(paths).size, paths.length);
});

test("unknown features remain untouched", () => {
  const registry = { hello: { description: "Hello" } };
  assert.deepEqual(applyFeatureCategories(registry), registry);
});
