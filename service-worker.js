const CACHE = "meliapp-shell-v40";
const SHELL = [
  "./js/services/bridge-window.js",
  "./js/domain/planning-eligibility.js",
  "./js/domain/planning-inputs.js",
  "./js/domain/rag.js",
  "./js/domain/session-preferences.js",
  "./js/ui/viewport.js",
  "./js/features-cli-ai.js",
  "./js/features-session-preferences.js",
  "./js/services/cli-ai.js",
  "./js/services/peer-link.js",
  "./js/vendor/peer-qr.js",

  "./",
  "./index.html",
  "./css/base.css",
  "./css/calendar.css",
  "./css/energy.css",
  "./css/connections.css",
  "./css/tasks.css",
  "./css/guided.css",
  "./js/features-guided.js",
  "./js/features-metafocus.js",
  "./js/domain/metafocus.js",
  "./js/services/metafocus.js",
  "./css/projects.css",
  "./css/settings.css",
  "./css/item-inspector.css",
  "./css/ux-pass.css",
  "./js/features-calendar.js",
  "./js/domain/calendar.js",
  "./js/domain/outlook-categories.js",
  "./js/domain/project-outlook.js",
  "./js/domain/calendar-classification.js",
  "./js/domain/adaptive-planning.js",
  "./js/domain/weekly-planning.js",
  "./js/main.js",
  "./js/features.js",
  "./js/features-advanced.js",
  "./js/features-overrides.js",
  "./js/features-energy-friendly.js",
  "./js/features-connections-friendly.js",
  "./js/features-spotify-friendly.js",
  "./js/features-data-p2p.js",
  "./js/features-calendar-sources.js",
  "./js/features-microsoft-accounts.js",
  "./js/features-schedule-preferences.js",
  "./js/features-schedule-behavior.js",
  "./js/features-adaptive-schedule.js",
  "./js/features-task-context.js",
  "./js/features-calendar-tasks.js",
  "./js/features-tasks-workspace.js",
  "./js/features-projects.js",
  "./js/features-item-inspector.js",
  "./js/features-item-popup-overrides.js",
  "./js/features-quick-search.js",
  "./js/features-local-ai.js",
  "./js/feature-categories.js",
  "./js/config.js",
  "./js/core/app.js",
  "./js/core/events.js",
  "./js/core/registry.js",
  "./js/core/router.js",
  "./js/core/state.js",
  "./js/domain/energy.js",
  "./js/domain/eisenhower.js",
  "./js/domain/mindmap-tree.js",
  "./js/domain/scoring.js",
  "./js/domain/scheduling.js",
  "./js/domain/xp.js",
  "./js/services/storage.js",
  "./js/services/drafts.js",
  "./js/services/updates.js",
  "./js/ui/rewards.js",
  "./js/services/notifications.js",
  "./js/services/oauth.js",
  "./js/services/outlook.js",
  "./js/services/spotify.js",
  "./js/services/ai.js",
  "./js/services/local-ai.js",
  "./js/services/install.js",
  "./js/services/index.js",
  "./js/ui/actions.js",
  "./js/ui/render.js",
  "./js/ui/continuity.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("meliapp-shell-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", event => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.endsWith("/version.json")) return;
  event.respondWith((async () => {
    // A versioned shell must remain coherent until the user accepts the update.
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    try { return await fetch(event.request); }
    catch (error) {
      if (event.request.mode === "navigate") return await cache.match("./index.html");
      throw error;
    }
  })());
});
