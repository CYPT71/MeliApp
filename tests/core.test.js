import test from "node:test";
import assert from "node:assert/strict";

import { createApp, runFeatures } from "../js/core/app.js";
import { createFeatureState, featuresForEvent, validateFeature } from "../js/core/registry.js";
import {
  featurePages,
  findPageByRoute,
  hrefForPage,
  isFeatureVisibleOnRoute,
  pageConfig,
  routeFromHash
} from "../js/core/router.js";
import { createInitialState } from "../js/core/state.js";

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
});

test("page true automatically creates a page from the feature name", () => {
  assert.deepEqual(pageConfig("tasks", { description: "Mes tâches", page: true }), {
    path: "tasks",
    title: "Mes tâches",
    nav: true,
    order: 0
  });
});

test("page metadata can customize route title icon and navigation", () => {
  assert.deepEqual(
    pageConfig("energy", {
      page: { path: "/mood/", title: "Énergie", icon: "⚡", nav: false, order: 4 }
    }),
    { path: "mood", title: "Énergie", icon: "⚡", nav: false, order: 4 }
  );
});

test("featurePages discovers and orders pages without manual routing", () => {
  const registry = {
    homeWidget: { description: "Widget" },
    tasks: { page: { title: "Tâches", order: 2 } },
    energy: { page: { title: "Énergie", order: 1 } }
  };

  assert.deepEqual(featurePages(registry).map(({ name }) => name), ["energy", "tasks"]);
});

test("hash routes resolve to the matching feature page", () => {
  const registry = {
    tasks: { page: true },
    settings: { page: { path: "preferences", title: "Réglages" } }
  };

  assert.equal(routeFromHash("#/preferences/"), "preferences");
  assert.equal(findPageByRoute(registry, "preferences")?.name, "settings");
  assert.equal(hrefForPage({ path: "preferences" }), "#/preferences");
});

test("page features only render on their route and widgets only on home", () => {
  assert.equal(isFeatureVisibleOnRoute({ name: "widget", feature: {}, route: "" }), true);
  assert.equal(isFeatureVisibleOnRoute({ name: "widget", feature: {}, route: "tasks" }), false);
  assert.equal(isFeatureVisibleOnRoute({ name: "tasks", feature: { page: true }, route: "" }), false);
  assert.equal(isFeatureVisibleOnRoute({ name: "tasks", feature: { page: true }, route: "tasks" }), true);
});
