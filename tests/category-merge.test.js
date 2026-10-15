import test from "node:test";
import assert from "node:assert/strict";

import { featureCategories } from "../js/feature-categories.js";

test("day category merges organization and focus features", () => {
  assert.deepEqual(featureCategories.day.features, ["tasks", "taskEditor", "projects", "flow"]);
});

test("settings category merges connections and settings features", () => {
  assert.deepEqual(featureCategories.settings.features, [
    "spotify",
    "ai",
    "settings",
    "notifications",
    "install",
    "dataManagement",
    "diagnostics"
  ]);
});
