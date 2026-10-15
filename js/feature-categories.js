const cloneCategory = (category) => ({
  id: category.id,
  path: category.path ?? category.id,
  title: category.title ?? category.id,
  icon: category.icon ?? null,
  order: Number(category.order ?? 0),
  nav: category.nav ?? true
});

export const featureCategories = Object.freeze({
  calendar: { id: "calendar", path: "calendar", title: "Agenda", icon: "🗓️", order: 10, features: ["microsoftAuth", "outlookSync", "calendarView", "manualSync"] },
  tasks: { id: "tasks", path: "tasks", title: "Tâches", icon: "✅", order: 20, features: ["taskWorkspace", "tasks", "taskDecomposition", "taskEditor"] },
  projects: { id: "projects", path: "projects", title: "Projets", icon: "🗂️", order: 25, features: ["projects"] },
  mindmap: { id: "mindmap", path: "mindmap", title: "Mindmap", icon: "🌳", order: 27, features: ["taskMindmap"] },
  day: { id: "day", path: "day", title: "Journée", icon: "🧭", order: 30, features: ["adaptiveSchedule", "flow"] },
  progress: { id: "progress", path: "progress", title: "Progression", icon: "🏆", order: 40, features: ["game", "stats", "achievements"] },
  settings: {
    id: "settings", path: "settings", title: "Réglages & connexions", icon: "⚙️", order: 50,
    features: ["localAi", "schedulePreferences", "quickSearch", "spotify", "ai", "settings", "notifications", "install", "dataManagement", "diagnostics"]
  }
});

export const applyFeatureCategories = (registry, categories = featureCategories) => {
  const byFeature = new Map();
  for (const category of Object.values(categories)) {
    const normalized = cloneCategory(category);
    for (const featureName of category.features ?? []) {
      if (byFeature.has(featureName)) throw new Error(`Feature ${featureName} appears in more than one category`);
      byFeature.set(featureName, normalized);
    }
  }
  return Object.fromEntries(Object.entries(registry).map(([name, feature]) => [name, feature.category ? feature : byFeature.has(name) ? { ...feature, category: { ...byFeature.get(name) } } : feature]));
};
