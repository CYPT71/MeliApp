import test from "node:test";
import assert from "node:assert/strict";

import { featureCategories, applyFeatureCategories } from "../js/feature-categories.js";

const expected = {
  calendar: ["microsoftAuth", "outlookSync", "calendarView", "manualSync"],
  organize: ["tasks", "taskEditor", "projects"],
  focus: ["flow"],
  progress: ["game", "stats", "achievements"],
  integrations: ["spotify", "ai"],
  settings: ["settings", "notifications", "install", "dataManagement", "diagnostics"]
};

test("production categories keep coherent features together", () => {
  for (const [name, names] of Object.entries(expected)) {
    assert.deepEqual(featureCategories[name].features, names);
  }
});

test("category routes are unique", () => {
  const paths = Object.values(featureCategories).map((category) => category.path ?? category.id);
  assert.equal(new Set(paths).size, paths.length);
});

test("unknown features remain untouched", () => {
  const registry = { hello: { description: "Hello" } };
  assert.deepEqual(applyFeatureCategories(registry), registry);
});
