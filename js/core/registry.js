export const features = {};

const clone = (value) => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
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

  if (feature.when !== undefined && !Array.isArray(feature.when)) {
    throw new TypeError(`Feature ${name}.when must be an array`);
  }

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
    const listens = feature.when?.includes(event) ?? false;
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
