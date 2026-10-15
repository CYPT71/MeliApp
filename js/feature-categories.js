const cloneCategory = (category) => ({
  id: category.id,
  path: category.path ?? category.id,
  title: category.title ?? category.id,
  icon: category.icon ?? null,
  order: Number(category.order ?? 0),
  nav: category.nav ?? true
});

export const featureCategories = Object.freeze({
  calendar: {
    id: "calendar",
    path: "calendar",
    title: "Agenda",
    icon: "🗓️",
    order: 10,
    features: ["microsoftAuth", "outlookSync", "calendarView", "manualSync"]
  },
  organize: {
    id: "organize",
    path: "organize",
    title: "Organisation",
    icon: "🧭",
    order: 20,
    features: ["tasks", "taskEditor", "projects"]
  },
  focus: {
    id: "focus",
    path: "focus",
    title: "Focus",
    icon: "🔥",
    order: 30,
    features: ["flow"]
  },
  progress: {
    id: "progress",
    path: "progress",
    title: "Progression",
    icon: "🏆",
    order: 40,
    features: ["game", "stats", "achievements"]
  },
  integrations: {
    id: "integrations",
    path: "integrations",
    title: "Connexions",
    icon: "🔌",
    order: 50,
    features: ["spotify", "ai"]
  },
  settings: {
    id: "settings",
    path: "settings",
    title: "Réglages",
    icon: "⚙️",
    order: 60,
    features: ["settings", "notifications", "install", "dataManagement", "diagnostics"]
  }
});

export const applyFeatureCategories = (registry, categories = featureCategories) => {
  const byFeature = new Map();

  for (const category of Object.values(categories)) {
    const normalized = cloneCategory(category);
    for (const featureName of category.features ?? []) {
      if (byFeature.has(featureName)) {
        throw new Error(`Feature ${featureName} appears in more than one category`);
      }
      byFeature.set(featureName, normalized);
    }
  }

  return Object.fromEntries(
    Object.entries(registry).map(([name, feature]) => [
      name,
      feature.category
        ? feature
        : byFeature.has(name)
          ? { ...feature, category: { ...byFeature.get(name) } }
          : feature
    ])
  );
};
