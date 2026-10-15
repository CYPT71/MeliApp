import { features as baseFeatures } from "../features.js";
import { advancedFeatures } from "../features-advanced.js";
import { featureOverrides } from "../features-overrides.js";
import { energyFriendlyOverride } from "../features-energy-friendly.js";
import { connectionFriendlyOverride } from "../features-connections-friendly.js";
import { spotifyFriendlyOverride } from "../features-spotify-friendly.js";
import { dataP2pOverride } from "../features-data-p2p.js";
import { adaptiveScheduleFeatures } from "../features-adaptive-schedule.js";
import { calendarTaskFeatures } from "../features-calendar-tasks.js";
import { taskWorkspaceFeatures } from "../features-tasks-workspace.js";
import { projectFeatures } from "../features-projects.js";
import { applyFeatureCategories, featureCategories } from "../feature-categories.js";

export const features = Object.freeze(
  applyFeatureCategories({
    ...baseFeatures,
    ...advancedFeatures,
    ...featureOverrides,
    ...energyFriendlyOverride,
    ...connectionFriendlyOverride,
    ...spotifyFriendlyOverride,
    ...dataP2pOverride,
    ...adaptiveScheduleFeatures,
    ...calendarTaskFeatures,
    ...taskWorkspaceFeatures,
    ...projectFeatures
  }, featureCategories)
);

const clone = (value) => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const validatePage = (name, page) => {
  if (page === undefined || page === false) return;
  if (page === true) return;

  if (!page || typeof page !== "object" || Array.isArray(page)) {
    throw new TypeError(`Feature ${name}.page must be true, false or an object`);
  }

  if (page.path !== undefined && typeof page.path !== "string") {
    throw new TypeError(`Feature ${name}.page.path must be a string`);
  }

  if (page.title !== undefined && typeof page.title !== "string") {
    throw new TypeError(`Feature ${name}.page.title must be a string`);
  }

  if (page.icon !== undefined && typeof page.icon !== "string") {
    throw new TypeError(`Feature ${name}.page.icon must be a string`);
  }

  if (page.nav !== undefined && typeof page.nav !== "boolean") {
    throw new TypeError(`Feature ${name}.page.nav must be a boolean`);
  }

  if (page.order !== undefined && !Number.isFinite(Number(page.order))) {
    throw new TypeError(`Feature ${name}.page.order must be numeric`);
  }
};

const validateCategory = (name, category) => {
  if (category === undefined || category === false) return;
  if (typeof category === "string") return;

  if (!category || typeof category !== "object" || Array.isArray(category)) {
    throw new TypeError(`Feature ${name}.category must be a string, false or an object`);
  }

  for (const key of ["id", "path", "title", "icon"]) {
    if (category[key] !== undefined && typeof category[key] !== "string") {
      throw new TypeError(`Feature ${name}.category.${key} must be a string`);
    }
  }

  if (category.nav !== undefined && typeof category.nav !== "boolean") {
    throw new TypeError(`Feature ${name}.category.nav must be a boolean`);
  }

  if (category.order !== undefined && !Number.isFinite(Number(category.order))) {
    throw new TypeError(`Feature ${name}.category.order must be numeric`);
  }
};

export const validateFeature = (name, feature) => {
  if (!feature || typeof feature !== "object") {
    throw new TypeError(`Feature ${name} must be an object`);
  }

  if (feature.run !== undefined && typeof feature.run !== "function") {
    throw new TypeError(`Feature ${name}.run must be a function`);
  }

  if (feature.enabled !== undefined && typeof feature.enabled !== "function") {
    throw new TypeError(`Feature ${name}.enabled must be a function`);
  }

  const events = feature.when ?? feature.on;
  if (events !== undefined && !Array.isArray(events)) {
    throw new TypeError(`Feature ${name}.when/on must be an array`);
  }

  if (feature.ui?.visible !== undefined && typeof feature.ui.visible !== "function") {
    throw new TypeError(`Feature ${name}.ui.visible must be a function`);
  }

  validatePage(name, feature.page);
  validateCategory(name, feature.category);
  return feature;
};

export const entries = (registry = features) =>
  Object.entries(registry).map(([name, feature]) => [name, validateFeature(name, feature)]);

export const createFeatureState = (registry = features) =>
  Object.fromEntries(
    entries(registry)
      .filter(([, feature]) => feature.state !== undefined)
      .map(([name, feature]) => [name, clone(feature.state)])
  );

export const featuresForEvent = (registry, event, state) =>
  entries(registry).filter(([, feature]) => {
    const events = feature.when ?? feature.on ?? [];
    const listens = events.includes(event);
    const enabled = feature.enabled?.(state) ?? true;
    return listens && enabled;
  });

export const findAction = (registry, actionName) => {
  for (const [featureName, feature] of entries(registry)) {
    const handler = feature.ui?.actions?.[actionName];
    if (typeof handler === "function") return { featureName, handler };
  }
  return null;
};
