import test from "node:test";
import assert from "node:assert/strict";

import { createApp, runFeatures } from "../js/core/app.js";
import { createFeatureState, featuresForEvent, validateFeature } from "../js/core/registry.js";
import {
  categoryConfig,
  featurePages,
  findPageByRoute,
  hrefForPage,
  isFeatureVisibleOnRoute,
  pageConfig,
  routeFromHash
} from "../js/core/router.js";
import { createInitialState } from "../js/core/state.js";
import { applyFeatureCategories } from "../js/feature-categories.js";

test("createFeatureState builds state from the registry without manual wiring", () => {
  const registry = {
    energy: { state: { value: 5 }, run: (ctx) => ctx },
    hello: { state: { count: 0 }, run: (ctx) => ctx }
  };

  assert.deepEqual(createFeatureState(registry), {
    energy: { value: 5 },
    hello: { count: 0 }
  });
});

test("featuresForEvent only returns listening and enabled features", () => {
  const registry = {
    a: { when: ["go"], run: (ctx) => ctx },
    b: { when: ["go"], enabled: () => false, run: (ctx) => ctx },
    c: { when: ["other"], run: (ctx) => ctx }
  };

  assert.deepEqual(featuresForEvent(registry, "go", {}).map(([name]) => name), ["a"]);
});

test("runFeatures iterates features in registry order and chains state", async () => {
  const registry = {
    first: {
      when: ["go"],
      run: ({ state }) => ({ ...state, value: state.value + 1 })
    },
    second: {
      when: ["go"],
      run: ({ state }) => ({ ...state, value: state.value * 3 })
    }
  };

  const result = await runFeatures({
    event: "go",
    payload: null,
    registry,
    context: { state: { value: 2 }, services: {} }
  });

  assert.equal(result.state.value, 9);
});

test("a failing feature adds a diagnostic and does not stop the next feature", async () => {
  const registry = {
    broken: {
      when: ["go"],
      run: () => { throw new Error("boom"); }
    },
    next: {
      when: ["go"],
      run: ({ state }) => ({ ...state, reached: true })
    }
  };

  const result = await runFeatures({
    event: "go",
    registry,
    context: { state: { diagnostics: [] }, services: {} }
  });

  assert.equal(result.state.reached, true);
  assert.equal(result.state.diagnostics.length, 1);
  assert.match(result.state.diagnostics[0].message, /boom/);
});

test("createApp persists and notifies after dispatch", async () => {
  const registry = {
    counter: {
      when: ["inc"],
      state: { value: 0 },
      run: ({ state }) => ({
        ...state,
        features: {
          ...state.features,
          counter: { value: state.features.counter.value + 1 }
        }
      })
    }
  };

  const persisted = [];
  const changes = [];
  const app = createApp({
    registry,
    initialState: createInitialState(registry),
    persist: async (state) => persisted.push(state.features.counter.value),
    onChange: (state) => changes.push(state.features.counter.value)
  });

  await app.dispatch("inc");
  assert.equal(app.getState().features.counter.value, 1);
  assert.deepEqual(persisted, [1]);
  assert.deepEqual(changes, [1]);
});

test("validateFeature rejects invalid contracts", () => {
  assert.throws(() => validateFeature("bad", { run: true }), /run must be a function/);
  assert.throws(() => validateFeature("badPage", { page: "yes" }), /page must be true, false or an object/);
  assert.throws(() => validateFeature("badCategory", { category: 42 }), /category must be a string, false or an object/);
});

test("page true automatically creates a page from the feature name", () => {
  assert.deepEqual(pageConfig("tasks", { description: "Mes tâches", page: true }), {
    path: "tasks",
    title: "Mes tâches",
    nav: true,
    order: 0,
    icon: null,
    grouped: false
  });
});

test("page metadata can customize route title icon and navigation", () => {
  assert.deepEqual(
    pageConfig("energy", {
      page: { path: "/mood/", title: "Énergie", icon: "⚡", nav: false, order: 4 }
    }),
    { path: "mood", title: "Énergie", icon: "⚡", nav: false, order: 4, grouped: false }
  );
});

test("a category string is enough to create a shared route", () => {
  assert.deepEqual(categoryConfig("tasks", { category: "organize" }), {
    id: "organize",
    path: "organize",
    title: "Organize",
    nav: true,
    order: 0,
    icon: null,
    grouped: true
  });
});

test("features with the same category are deduplicated into one navigation page", () => {
  const registry = {
    tasks: { description: "Tâches", category: { id: "organize", title: "Organisation", icon: "🧭", order: 20 } },
    projects: { description: "Boss", category: { id: "organize", title: "Organisation", icon: "🧭", order: 20 } },
    spotify: { description: "Spotify", category: { id: "integrations", title: "Connexions", order: 50 } }
  };

  const pages = featurePages(registry);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0].names, ["tasks", "projects"]);
  assert.equal(pages[0].page.path, "organize");
  assert.equal(pages[0].page.title, "Organisation");
});

test("applyFeatureCategories adds category metadata without mutating feature definitions", () => {
  const input = { tasks: { description: "Tâches" }, energy: { description: "Énergie", category: "today" } };
  const output = applyFeatureCategories(input, {
    organize: { id: "organize", title: "Organisation", features: ["tasks"] }
  });

  assert.equal(input.tasks.category, undefined);
  assert.equal(output.tasks.category.id, "organize");
  assert.equal(output.energy.category, "today");
});

test("applyFeatureCategories rejects one feature in multiple categories", () => {
  assert.throws(() => applyFeatureCategories({ tasks: {} }, {
    a: { id: "a", features: ["tasks"] },
    b: { id: "b", features: ["tasks"] }
  }), /more than one category/);
});

test("featurePages discovers and orders pages without manual routing", () => {
  const registry = {
    homeWidget: { description: "Widget" },
    tasks: { page: { title: "Tâches", order: 2 } },
    energy: { page: { title: "Énergie", order: 1 } }
  };

  assert.deepEqual(featurePages(registry).map(({ name }) => name), ["energy", "tasks"]);
});

test("hash routes resolve to the matching feature page or category", () => {
  const registry = {
    tasks: { category: { id: "organize", title: "Organisation" } },
    settings: { page: { path: "preferences", title: "Réglages" } }
  };

  assert.equal(routeFromHash("#/preferences/"), "preferences");
  assert.equal(findPageByRoute(registry, "preferences")?.name, "settings");
  assert.deepEqual(findPageByRoute(registry, "organize")?.names, ["tasks"]);
  assert.equal(hrefForPage({ path: "preferences" }), "#/preferences");
});

test("category features only render on their shared route and widgets only on home", () => {
  assert.equal(isFeatureVisibleOnRoute({ name: "widget", feature: {}, route: "" }), true);
  assert.equal(isFeatureVisibleOnRoute({ name: "widget", feature: {}, route: "organize" }), false);
  assert.equal(isFeatureVisibleOnRoute({ name: "tasks", feature: { category: "organize" }, route: "" }), false);
  assert.equal(isFeatureVisibleOnRoute({ name: "tasks", feature: { category: "organize" }, route: "organize" }), true);
  assert.equal(isFeatureVisibleOnRoute({ name: "projects", feature: { category: "organize" }, route: "organize" }), true);
});
