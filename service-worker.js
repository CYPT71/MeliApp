const CACHE = "meliapp-shell-v24";
const SHELL = [
  "./",
  "./index.html",
  "./css/base.css",
  "./css/calendar.css",
  "./js/features-calendar.js",
  "./js/domain/calendar.js",
  "./js/domain/calendar-classification.js",
  "./js/domain/adaptive-planning.js",
  "./css/energy.css",
  "./css/connections.css",
  "./css/tasks.css",
  "./css/projects.css",
  "./js/main.js",
  "./js/features.js",
  "./js/features-advanced.js",
  "./js/features-overrides.js",
  "./js/features-energy-friendly.js",
  "./js/features-connections-friendly.js",
  "./js/features-spotify-friendly.js",
  "./js/features-data-p2p.js",
  "./js/features-calendar-sources.js",
  "./js/features-adaptive-schedule.js",
  "./js/features-task-context.js",
  "./js/features-calendar-tasks.js",
  "./js/features-tasks-workspace.js",
  "./js/features-projects.js",
  "./js/feature-categories.js",
  "./js/config.js",
  "./js/core/app.js",
  "./js/core/events.js",
  "./js/core/registry.js",
  "./js/core/router.js",
  "./js/core/state.js",
  "./js/domain/energy.js",
  "./js/domain/eisenhower.js",
  "./js/domain/scoring.js",
  "./js/domain/scheduling.js",
  "./js/domain/xp.js",
  "./js/services/storage.js",
  "./js/services/notifications.js",
  "./js/services/oauth.js",
  "./js/services/outlook.js",
  "./js/services/spotify.js",
  "./js/services/ai.js",
  "./js/services/install.js",
  "./js/services/index.js",
  "./js/ui/actions.js",
  "./js/ui/render.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("./index.html")))
  );
});
