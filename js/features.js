import { calendarViewFeature } from "./features-calendar.js";
import { calendarRange } from "./domain/calendar.js";
import { computePriorityScore } from "./domain/scoring.js";
import { splitTask } from "./domain/scheduling.js";
import { xpForTask, levelFromXp } from "./domain/xp.js";

const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;

const setFeatureState = (state, name, next) => ({
  ...state,
  features: {
    ...(state.features ?? {}),
    [name]: typeof next === "function" ? next(featureState(state, name)) : next
  }
});

const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const asNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const escapeText = (value) => String(value ?? "");

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = escapeText(value);
    else if (key === "checked") node.checked = Boolean(value);
    else if (key === "value") node.value = value;
    else if (key.startsWith("data-")) node.setAttribute(key, value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
};

const button = (label, action, attrs = {}) =>
  el("button", { type: "button", "data-action": action, ...attrs, text: label });

const field = ({ label, name, type = "text", value = "", min, max, step, checked }) => {
  const input = el("input", { name, type, value, min, max, step, checked });
  const wrapper = el("label", { className: "field" }, [el("span", { text: label }), input]);
  return { wrapper, input };
};

const formValue = (target, name) => target.closest("form")?.elements?.namedItem(name)?.value ?? "";
const formChecked = (target, name) => Boolean(target.closest("form")?.elements?.namedItem(name)?.checked);

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const nextCalendarEvent = (state, now = Date.now()) =>
  [...(state.calendar?.events ?? [])]
    .filter((event) => new Date(event.start).getTime() > now)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0] ?? null;

const freeWindowMinutes = (state, now = Date.now()) => {
  const next = nextCalendarEvent(state, now);
  if (next) return Math.max(0, Math.floor((new Date(next.start).getTime() - now) / 60000) - 10);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return Math.max(0, Math.floor((end.getTime() - now) / 60000));
};

const taskItems = (state) => featureState(state, "tasks", { items: [] }).items ?? [];
const energyValue = (state) => featureState(state, "energy", { value: 5 }).value ?? 5;

const rankedCandidates = (state, now = Date.now()) => {
  const energy = energyValue(state);
  const available = freeWindowMinutes(state, now);
  const maxChunk = energy <= 2 ? Math.min(available, 10) : energy <= 4 ? Math.min(available, 20) : available;
  const active = taskItems(state).filter((task) => task.status !== "completed");
  const preferred = energy <= 2
    ? active.filter((task) => asNumber(task.difficulty, 3) <= 2 || asNumber(task.estimateMinutes, 30) <= 15)
    : active;
  const source = preferred.length ? preferred : active;

  return source
    .map((task) => ({
      task,
      candidate: splitTask(task, Math.max(1, maxChunk)),
      score: computePriorityScore({ task, energy, freeWindowMinutes: Math.max(1, maxChunk), now })
    }))
    .filter(({ candidate }) => candidate)
    .sort((a, b) => b.score - a.score || a.candidate.chunkMinutes - b.candidate.chunkMinutes)
    .map(({ candidate, score }) => ({ ...candidate, score }));
};

const normalizeTaskPayload = (payload = {}) => ({
  id: payload.id ?? uid("task"),
  title: String(payload.title ?? "").trim(),
  deadline: payload.deadline || null,
  estimateMinutes: Math.max(5, asNumber(payload.estimateMinutes, 25)),
  difficulty: Math.min(5, Math.max(1, asNumber(payload.difficulty, 3))),
  importance: Math.min(5, Math.max(1, asNumber(payload.importance, 3))),
  progress: Math.min(1, Math.max(0, asNumber(payload.progress, 0))),
  splittable: payload.splittable !== false,
  minimumChunkMinutes: Math.max(5, asNumber(payload.minimumChunkMinutes, 10)),
  preferredEnergyMin: Math.min(10, Math.max(1, asNumber(payload.preferredEnergyMin, payload.difficulty ?? 3))),
  status: payload.status ?? "active",
  createdAt: payload.createdAt ?? new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

const localStuckSuggestion = (state) => {
  const current = featureState(state, "planner", {}).current;
  if (!current) return "Choisis une toute petite action : ouvrir le document, lire le titre ou préparer le matériel.";
  return `Réduis ${current.title} à une action de 2 minutes : ouvre ce qu’il faut et fais uniquement le premier geste.`;
};

export const features = {
  microsoftAuth: {
    description: "Compte Outlook",
    page: { path: "outlook", title: "Outlook", icon: "📅", order: 10 },
    state: { status: "disconnected", error: null, connectionLost: false },
    when: ["app:start", "app:resume", "sync:manual", "auth:microsoft:login", "auth:microsoft:logout"],
    run: async ({ state, event, services }) => {
      if (!services.outlook) return state;
      try {
        if (event === "auth:microsoft:login") {
          await services.outlook.login();
          return setFeatureState(state, "microsoftAuth", (current) => ({ ...current, status: "connecting", error: null }));
        }
        if (event === "auth:microsoft:logout") {
          await services.outlook.logout();
          return {
            ...setFeatureState(state, "microsoftAuth", { status: "disconnected", error: null }),
            auth: { ...state.auth, microsoft: null },
            calendar: { events: [], lastSyncAt: null }
          };
        }
        const session = await services.outlook.restore?.();
        if (!session) return {
          ...setFeatureState(state, "microsoftAuth", {
            status: "disconnected", error: null,
            connectionLost: Boolean(state.auth?.microsoft?.connected || featureState(state, "microsoftAuth").connectionLost)
          }),
          auth: { ...state.auth, microsoft: null }
        };
        return {
          ...setFeatureState(state, "microsoftAuth", { status: "connected", error: null, connectionLost: false }),
          auth: { ...state.auth, microsoft: { connected: true, account: session.account ?? null } }
        };
      } catch (error) {
        return setFeatureState(state, "microsoftAuth", {
          status: "error",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    },
    ui: {
      render: ({ state }) => {
        const current = featureState(state, "microsoftAuth");
        const connected = current.status === "connected" || Boolean(state.auth?.microsoft?.connected);
        return el("div", { className: "stack" }, [
          el("p", { text: connected ? "Outlook est connecté." : "Outlook est obligatoire pour utiliser le planning réel." }),
          current.error ? el("p", { className: "error", text: current.error }) : null,
          connected ? button("Déconnecter Outlook", "microsoft.logout") : button("Connecter Outlook", "microsoft.login", { className: "primary" })
        ]);
      },
      actions: {
        "microsoft.login": ({ dispatch }) => dispatch("auth:microsoft:login"),
        "microsoft.logout": ({ dispatch }) => dispatch("auth:microsoft:logout")
      }
    }
  },

  calendarView: calendarViewFeature,

  outlookSync: {
    description: "Synchronisation Outlook",
    state: { syncing: false, lastSyncAt: null, error: null },
    when: ["app:start", "app:resume", "sync:manual", "auth:microsoft:connected", ...calendarViewFeature.when],
    run: async ({ state, services }) => {
      if (!services.outlook) return state;
      if (!services.outlook.isConnected?.()) {
        return {
          ...setFeatureState(
            setFeatureState(state, "outlookSync", (current) => ({ ...current, syncing: false, error: "OUTLOOK_RECONNECT_REQUIRED" })),
            "microsoftAuth", (current) => ({
              ...current, status: "disconnected",
              connectionLost: Boolean(current.connectionLost || state.auth?.microsoft?.connected || state.calendar?.lastSyncAt)
            })
          ),
          auth: { ...state.auth, microsoft: null }
        };
      }
      try {
        const now = Date.now();
        const range = calendarRange(state.features?.calendarView);
        const nearToday = +range.end >= now - 86400000 && +range.start <= now + 14 * 86400000;
        const from = new Date(nearToday ? Math.min(+range.start, now - 86400000) : +range.start).toISOString();
        const to = new Date(nearToday ? Math.max(+range.end, now + 14 * 86400000) : +range.end).toISOString();
        const calendars = await services.outlook.listCalendars?.();
        const selected = state.features?.calendarView?.selectedCalendarIds;
        const calendarIds = calendars?.filter((calendar) => !Array.isArray(selected) || selected.includes(calendar.id)).map((calendar) => calendar.id);
        const events = await services.outlook.listEvents({ from, to, ...(calendarIds ? { calendarIds } : {}) });
        const calendarNames = new Map((calendars ?? []).map((calendar) => [calendar.id, calendar.name]));
        const next = calendars ? setFeatureState(state, "calendarView", (current) => ({ ...current, calendars })) : state;
        const syncedAt = new Date().toISOString();
        return {
          ...setFeatureState(next, "outlookSync", { syncing: false, lastSyncAt: syncedAt, error: null, categoryError: services.outlook.getCategoryError?.() ?? null }),
          auth: { ...state.auth, microsoft: { ...(state.auth?.microsoft ?? {}), connected: true } },
          calendar: { events: events.map((event) => ({ ...event, calendarName: calendarNames.get(event.calendarId) ?? event.calendarName ?? null })), lastSyncAt: syncedAt }
        };
      } catch (error) {
        const next = setFeatureState(state, "outlookSync", (current) => ({
          ...current,
          syncing: false,
          error: error instanceof Error ? error.message : String(error)
        }));
        if (services.outlook.isConnected?.() !== false) return next;
        return {
          ...setFeatureState(next, "microsoftAuth", { status: "disconnected", error: null, connectionLost: true }),
          auth: { ...next.auth, microsoft: null }
        };
      }
    }
  },

  manualSync: {
    description: "Synchronisation manuelle",
    when: ["sync:manual"],
    run: ({ state }) => state
  },

  energy: {
    description: "Niveau d’énergie",
    state: { value: 5, lowThreshold: 3, updatedAt: null, expiresAfterMinutes: 180 },
    when: ["energy:set", "app:start", "app:resume"],
    run: ({ state, event, payload }) => {
      const current = featureState(state, "energy");
      if (event === "energy:set") {
        return setFeatureState(state, "energy", {
          ...current,
          value: Math.min(10, Math.max(1, asNumber(payload?.value, current.value ?? 5))),
          updatedAt: new Date().toISOString()
        });
      }
      if (!current.updatedAt) return state;
      const age = Date.now() - new Date(current.updatedAt).getTime();
      if (age <= asNumber(current.expiresAfterMinutes, 180) * 60000) return state;
      return setFeatureState(state, "energy", { ...current, value: 5, updatedAt: null });
    },
    ui: {
      zone: "main",
      order: 10,
      render: ({ state }) => {
        const current = featureState(state, "energy");
        const value = current.value ?? 5;
        const input = el("input", { type: "range", min: 1, max: 10, value, "data-action": "energy.set" });
        return el("div", { className: "stack" }, [
          el("div", { className: "row row--between" }, [el("strong", { text: "⚡ Énergie" }), el("strong", { text: `${value}/10` })]),
          input,
          el("small", { className: "muted", text: value <= 2 ? "Mode doux : micro-actions et récupération." : value <= 4 ? "On réduit la friction et la durée." : value >= 8 ? "Bonne fenêtre pour une tâche profonde." : "Rythme normal." })
        ]);
      },
      actions: {
        "energy.set": ({ target, dispatch }) => dispatch("energy:set", { value: Number(target.value) })
      }
    }
  },

  tasks: {
    description: "Tâches",
    page: { path: "tasks", title: "Mes tâches", icon: "✅", order: 30 },
    state: { items: [] },
    when: ["task:created", "task:updated", "task:deleted", "task:completed", "task:deferred", "task:progress"],
    run: ({ state, event, payload }) => {
      const current = featureState(state, "tasks", { items: [] });
      let items = [...(current.items ?? [])];
      if (event === "task:created") {
        const task = normalizeTaskPayload(payload);
        if (task.title) items.push(task);
      }
      if (event === "task:updated") {
        items = items.map((task) => task.id === payload?.id ? normalizeTaskPayload({ ...task, ...payload, id: task.id, createdAt: task.createdAt }) : task);
      }
      if (event === "task:deleted") items = items.filter((task) => task.id !== payload?.id);
      if (event === "task:completed") items = items.map((task) => task.id === payload?.id ? { ...task, status: "completed", progress: 1, updatedAt: new Date().toISOString() } : task);
      if (event === "task:progress") items = items.map((task) => task.id === payload?.id ? { ...task, progress: Math.min(1, Math.max(0, asNumber(payload.progress))), updatedAt: new Date().toISOString() } : task);
      if (event === "task:deferred") {
        items = items.map((task) => task.id === payload?.id ? { ...task, deferredAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : task);
      }
      return setFeatureState(state, "tasks", { ...current, items });
    },
    ui: {
      render: ({ state }) => {
        const root = el("div", { className: "stack" });
        const form = el("form", { className: "feature-form" });
        const title = field({ label: "Tâche", name: "title" });
        const duration = field({ label: "Durée estimée (min)", name: "estimateMinutes", type: "number", value: 25, min: 5, step: 5 });
        const deadline = field({ label: "Deadline", name: "deadline", type: "datetime-local" });
        const difficulty = field({ label: "Difficulté 1-5", name: "difficulty", type: "number", value: 3, min: 1, max: 5 });
        const importance = field({ label: "Importance 1-5", name: "importance", type: "number", value: 3, min: 1, max: 5 });
        const splittable = field({ label: "Découpable", name: "splittable", type: "checkbox", checked: true });
        form.append(title.wrapper, duration.wrapper, deadline.wrapper, difficulty.wrapper, importance.wrapper, splittable.wrapper, button("Ajouter", "tasks.create", { className: "primary" }));
        root.append(form);

        const items = taskItems(state);
        if (!items.length) root.append(el("p", { className: "muted", text: "Aucune tâche. Pour une fois, le vide est légal." }));
        for (const task of items) {
          const item = el("article", { className: `list-item${task.status === "completed" ? " is-done" : ""}` });
          item.append(
            el("strong", { text: task.title }),
            el("span", { className: "muted", text: `${task.estimateMinutes} min · difficulté ${task.difficulty}/5 · importance ${task.importance}/5${task.deadline ? ` · ${formatDateTime(task.deadline)}` : ""}` }),
            el("progress", { max: 1, value: task.progress ?? 0 })
          );
          const actions = el("div", { className: "row" });
          if (task.status !== "completed") actions.append(button("Terminer", "tasks.complete", { "data-id": task.id }), button("Modifier", "tasks.edit", { "data-id": task.id }), button("Reporter", "tasks.defer", { "data-id": task.id }));
          actions.append(button("Supprimer", "tasks.delete", { "data-id": task.id }));
          item.append(actions);
          root.append(item);
        }
        return root;
      },
      actions: {
        "tasks.create": ({ target, dispatch }) => dispatch("task:created", {
          title: formValue(target, "title"),
          estimateMinutes: formValue(target, "estimateMinutes"),
          deadline: formValue(target, "deadline") || null,
          difficulty: formValue(target, "difficulty"),
          importance: formValue(target, "importance"),
          splittable: formChecked(target, "splittable")
        }),
        "tasks.complete": ({ target, dispatch }) => dispatch("task:completed", { id: target.dataset.id }),
        "tasks.delete": ({ target, dispatch }) => dispatch("task:deleted", { id: target.dataset.id }),
        "tasks.defer": ({ target, dispatch }) => dispatch("task:deferred", { id: target.dataset.id }),
        "tasks.edit": ({ target, state, dispatch }) => {
          const task = taskItems(state).find((item) => item.id === target.dataset.id);
          if (!task) return;
          const title = window.prompt("Nom de la tâche", task.title);
          if (title === null) return;
          const duration = window.prompt("Durée estimée en minutes", String(task.estimateMinutes));
          if (duration === null) return;
          return dispatch("task:updated", { id: task.id, title, estimateMinutes: Number(duration) });
        }
      }
    }
  },

  planner: {
    description: "Planner local",
    state: { current: null, candidates: [], index: 0, computedAt: null },
    when: ["app:start", "app:resume", "sync:manual", "energy:set", "task:created", "task:updated", "task:deleted", "task:completed", "task:deferred", "task:progress", "planner:cycle", "planner:reduce", "session:completed"],
    run: ({ state, event }) => {
      const candidates = rankedCandidates(state);
      const previous = featureState(state, "planner");
      let index = event === "planner:cycle" && candidates.length ? (asNumber(previous.index) + 1) % candidates.length : 0;
      let current = candidates[index] ?? null;
      if (event === "planner:reduce" && previous.current) {
        current = { ...previous.current, chunkMinutes: Math.min(5, previous.current.chunkMinutes ?? 5), reduced: true };
        index = previous.index ?? 0;
      }
      return setFeatureState(state, "planner", { current, candidates, index, computedAt: new Date().toISOString() });
    }
  },

  now: {
    description: "Maintenant",
    ui: {
      zone: "main",
      order: 20,
      render: ({ state }) => {
        const current = featureState(state, "planner", {}).current;
        const next = nextCalendarEvent(state);
        const energy = energyValue(state);
        const ai = featureState(state, "ai", {});
        const root = el("div", { className: "stack mission" });
        root.append(el("div", { className: "row row--between" }, [el("strong", { text: "🎯 Maintenant" }), el("span", { className: "badge", text: `${energy}/10 énergie` })]));
        if (current) {
          root.append(el("h2", { text: current.title }), el("p", { className: "muted", text: `${current.chunkMinutes ?? current.estimateMinutes} min suggérées${current.reduced ? " · version mini" : ""}` }));
          const actions = el("div", { className: "row" }, [button("COMMENCER", "now.start", { className: "primary" }), button("Changer", "now.change"), button("Réduire", "now.reduce"), button("Reporter", "now.defer"), button("Je suis bloqué", "now.stuck")]);
          root.append(actions);
        } else {
          root.append(el("h2", { text: "Rien de faisable pour l’instant" }), el("p", { className: "muted", text: "Ajoute une tâche ou profite du créneau. L’application survivra sans fabriquer une urgence imaginaire." }));
        }
        root.append(el("p", { className: "muted", text: next ? `Prochain événement : ${next.title ?? next.subject ?? "Événement"} à ${formatDateTime(next.start)}` : "Aucun événement Outlook à venir dans le cache." }));
        if (ai.lastSuggestion) root.append(el("aside", { className: "hint", text: `💡 ${ai.lastSuggestion}` }));
        return root;
      },
      actions: {
        "now.start": ({ state, dispatch }) => {
          const task = featureState(state, "planner", {}).current;
          if (!task) return;
          return dispatch("session:start", { taskId: task.id, suggestedMinutes: task.chunkMinutes ?? task.estimateMinutes, mode: state.settings?.workMode ?? "free" });
        },
        "now.change": ({ dispatch }) => dispatch("planner:cycle"),
        "now.reduce": ({ dispatch }) => dispatch("planner:reduce"),
        "now.defer": ({ state, dispatch }) => {
          const task = featureState(state, "planner", {}).current;
          return task ? dispatch("task:deferred", { id: task.id }) : undefined;
        },
        "now.stuck": ({ dispatch }) => dispatch("ai:assist")
      }
    }
  },

  flow: {
    description: "Focus / Flow",
    page: { path: "focus", title: "Focus", icon: "🔥", order: 40 },
    state: { active: false, mode: "free", taskId: null, startedAt: null, endedAt: null, suggestedMinutes: null },
    when: ["session:start", "session:pause", "session:completed", "session:set-mode"],
    run: ({ state, event, payload }) => {
      const current = featureState(state, "flow");
      if (event === "session:start") return setFeatureState(state, "flow", { active: true, mode: payload?.mode ?? "free", taskId: payload?.taskId ?? null, startedAt: Date.now(), endedAt: null, suggestedMinutes: payload?.suggestedMinutes ?? null });
      if (event === "session:set-mode") return setFeatureState(state, "flow", { ...current, mode: payload?.mode ?? "free" });
      if (event === "session:pause" || event === "session:completed") {
        const endedAt = Date.now();
        const session = { ...current, active: false, endedAt, actualMinutes: current.startedAt ? Math.max(1, Math.round((endedAt - current.startedAt) / 60000)) : 0 };
        return { ...setFeatureState(state, "flow", session), sessions: [...(state.sessions ?? []), session] };
      }
      return state;
    },
    ui: {
      render: ({ state }) => {
        const current = featureState(state, "flow");
        const task = taskItems(state).find((item) => item.id === current.taskId);
        const elapsed = current.startedAt ? Math.max(0, Math.floor((Date.now() - current.startedAt) / 60000)) : 0;
        const root = el("div", { className: "stack" });
        root.append(el("h2", { text: current.active ? (task?.title ?? "Session en cours") : "Aucune session active" }));
        if (current.active) root.append(el("p", { className: "focus-time", text: `${elapsed} min` }), el("p", { className: "muted", text: `Mode ${current.mode}${current.suggestedMinutes ? ` · suggestion ${current.suggestedMinutes} min` : ""}` }));
        const modes = el("div", { className: "row" }, ["free", "flow", "focus", "pomodoro"].map((mode) => button(mode, "flow.mode", { "data-mode": mode, className: current.mode === mode ? "is-active" : "" })));
        root.append(modes);
        if (current.active) root.append(el("div", { className: "row" }, [button("Pause", "flow.pause"), button("Terminer", "flow.complete", { className: "primary" }), button("Terminer + tâche faite", "flow.complete-task") ]));
        else root.append(el("p", { className: "muted", text: "Démarre une mission depuis l’accueil." }));
        return root;
      },
      actions: {
        "flow.mode": ({ target, dispatch }) => dispatch("session:set-mode", { mode: target.dataset.mode }),
        "flow.pause": ({ dispatch }) => dispatch("session:pause"),
        "flow.complete": ({ dispatch }) => dispatch("session:completed"),
        "flow.complete-task": async ({ state, dispatch }) => {
          const id = featureState(state, "flow").taskId;
          await dispatch("session:completed");
          if (id) await dispatch("task:completed", { id });
        }
      }
    }
  },

  game: {
    description: "Progression",
    state: { xp: 0, level: 1, lastGain: 0 },
    when: ["session:start", "session:completed", "task:completed"],
    run: ({ state, event, payload }) => {
      const current = featureState(state, "game");
      let gain = event === "session:start" ? 5 : event === "session:completed" ? 15 : 0;
      if (event === "task:completed") {
        const task = taskItems(state).find((item) => item.id === payload?.id);
        if (task) gain += xpForTask({ minutes: task.estimateMinutes, difficulty: task.difficulty, importance: task.importance, started: task.progress > 0 });
      }
      const xp = current.xp + gain;
      return setFeatureState(state, "game", { xp, level: levelFromXp(xp), lastGain: gain });
    },
    ui: {
      zone: "main",
      order: 30,
      render: ({ state }) => {
        const game = featureState(state, "game");
        return el("div", { className: "row row--between game-strip" }, [el("strong", { text: `Niveau ${game.level}` }), el("span", { text: `${game.xp} XP${game.lastGain ? ` · +${game.lastGain}` : ""}` })]);
      }
    }
  },

  spotify: {
    description: "Spotify",
    page: { path: "spotify", title: "Spotify", icon: "🎵", order: 50 },
    state: { connected: false, lowEnergy: "", focus: "", recovery: "", boss: "", error: null, autoplayBlocked: false },
    when: ["app:start", "spotify:login", "spotify:logout", "spotify:save", "energy:set", "session:start", "spotify:play-fallback"],
    run: async ({ state, event, payload, services }) => {
      const current = featureState(state, "spotify");
      try {
        if (event === "app:start") {
          const session = await services.spotify?.restore?.();
          return session ? setFeatureState(state, "spotify", { ...current, connected: true, error: null }) : state;
        }
        if (event === "spotify:login") { await services.spotify?.login?.(); return state; }
        if (event === "spotify:logout") { await services.spotify?.logout?.(); return setFeatureState(state, "spotify", { ...current, connected: false }); }
        if (event === "spotify:save") return setFeatureState(state, "spotify", { ...current, ...payload });
        if (!current.connected || !services.spotify?.play) return state;
        let uri = null;
        if (event === "energy:set" && asNumber(payload?.value, 5) <= energyValue(state)) uri = current.lowEnergy;
        if (event === "session:start") uri = current.focus;
        if (event === "spotify:play-fallback") uri = payload?.uri ?? current.lowEnergy;
        if (!uri) return state;
        await services.spotify.play(uri);
        return setFeatureState(state, "spotify", { ...current, autoplayBlocked: false, error: null });
      } catch (error) {
        return setFeatureState(state, "spotify", { ...current, autoplayBlocked: true, error: error instanceof Error ? error.message : String(error) });
      }
    },
    ui: {
      render: ({ state }) => {
        const current = featureState(state, "spotify");
        const form = el("form", { className: "stack" });
        form.append(el("p", { text: current.connected ? "Spotify connecté." : "Spotify est facultatif." }), current.error ? el("p", { className: "error", text: current.error }) : null);
        if (!current.connected) form.append(button("Connecter Spotify", "spotify.login", { className: "primary" }));
        else {
          for (const [key, label] of [["lowEnergy", "Playlist énergie basse"], ["focus", "Playlist focus"], ["recovery", "Playlist récupération"], ["boss", "Playlist boss"]]) form.append(field({ label, name: key, value: current[key] }).wrapper);
          form.append(el("div", { className: "row" }, [button("Enregistrer", "spotify.save", { className: "primary" }), button("Déconnecter", "spotify.logout") ]));
          if (current.autoplayBlocked && current.lowEnergy) form.append(button("▶ Lancer la playlist", "spotify.fallback", { className: "primary", "data-uri": current.lowEnergy }));
        }
        return form;
      },
      actions: {
        "spotify.login": ({ dispatch }) => dispatch("spotify:login"),
        "spotify.logout": ({ dispatch }) => dispatch("spotify:logout"),
        "spotify.save": ({ target, dispatch }) => dispatch("spotify:save", { lowEnergy: formValue(target, "lowEnergy"), focus: formValue(target, "focus"), recovery: formValue(target, "recovery"), boss: formValue(target, "boss") }),
        "spotify.fallback": ({ target, dispatch }) => dispatch("spotify:play-fallback", { uri: target.dataset.uri })
      }
    }
  },

  ai: {
    description: "Assistant IA",
    page: { path: "ai", title: "Assistant IA", icon: "✨", order: 60 },
    state: { enabled: false, endpoint: "", model: "", lastSuggestion: null, error: null },
    when: ["ai:configure", "ai:assist"],
    run: async ({ state, event, payload, services }) => {
      const current = featureState(state, "ai");
      if (event === "ai:configure") return setFeatureState(state, "ai", { ...current, ...payload, error: null });
      const fallback = localStuckSuggestion(state);
      if (!current.enabled || !services.ai?.suggest) return setFeatureState(state, "ai", { ...current, lastSuggestion: fallback, error: null });
      try {
        const suggestion = await services.ai.suggest({ state, endpoint: current.endpoint, model: current.model });
        return setFeatureState(state, "ai", { ...current, lastSuggestion: String(suggestion || fallback), error: null });
      } catch (error) {
        return setFeatureState(state, "ai", { ...current, lastSuggestion: fallback, error: error instanceof Error ? error.message : String(error) });
      }
    },
    ui: {
      render: ({ state }) => {
        const current = featureState(state, "ai");
        const form = el("form", { className: "stack" });
        form.append(field({ label: "Activer l’IA", name: "enabled", type: "checkbox", checked: current.enabled }).wrapper, field({ label: "Endpoint compatible", name: "endpoint", value: current.endpoint }).wrapper, field({ label: "Modèle", name: "model", value: current.model }).wrapper, button("Enregistrer", "ai.save", { className: "primary" }));
        if (current.lastSuggestion) form.append(el("aside", { className: "hint", text: current.lastSuggestion }));
        if (current.error) form.append(el("p", { className: "error", text: current.error }));
        return form;
      },
      actions: {
        "ai.save": ({ target, dispatch }) => dispatch("ai:configure", { enabled: formChecked(target, "enabled"), endpoint: formValue(target, "endpoint"), model: formValue(target, "model") })
      }
    }
  },

  notifications: {
    description: "Notifications",
    page: { path: "notifications", title: "Notifications", icon: "🔔", order: 70 },
    state: { permission: "default", enabled: false },
    when: ["app:start", "notifications:request"],
    run: async ({ state, event, services }) => {
      const current = featureState(state, "notifications");
      if (event === "notifications:request") {
        const permission = await services.notifications?.requestPermission?.();
        return setFeatureState(state, "notifications", { permission: permission ?? "denied", enabled: permission === "granted" });
      }
      return setFeatureState(state, "notifications", { ...current, permission: services.notifications?.permission?.() ?? current.permission });
    },
    ui: {
      render: ({ state }) => {
        const current = featureState(state, "notifications");
        return el("div", { className: "stack" }, [el("p", { text: `Permission : ${current.permission}` }), current.permission !== "granted" ? button("Autoriser les notifications", "notifications.request", { className: "primary" }) : el("p", { className: "muted", text: "Notifications activées dans les limites du navigateur." })]);
      },
      actions: { "notifications.request": ({ dispatch }) => dispatch("notifications:request") }
    }
  },

  install: {
    description: "Installation PWA",
    state: { available: false, installed: false, ios: false },
    when: ["app:start", "install:available", "install:run", "install:installed"],
    run: async ({ state, event, payload, services, dispatch }) => {
      const current = featureState(state, "install");
      if (event === "app:start") {
        services.install?.init?.({
          onAvailable: () => dispatch("install:available"),
          onInstalled: () => dispatch("install:installed")
        });
        return setFeatureState(state, "install", { ...current, ios: services.install?.isIos?.() ?? false, installed: services.install?.isInstalled?.() ?? false });
      }
      if (event === "install:available") return setFeatureState(state, "install", { ...current, available: true });
      if (event === "install:installed") return setFeatureState(state, "install", { ...current, available: false, installed: true });
      if (event === "install:run") {
        const accepted = await services.install?.prompt?.();
        return setFeatureState(state, "install", { ...current, available: accepted ? false : current.available, installed: accepted || current.installed });
      }
      return state;
    },
    ui: {
      zone: "main",
      order: 100,
      visible: ({ state }) => {
        const current = featureState(state, "install");
        return !current.installed && (current.available || current.ios);
      },
      render: ({ state }) => {
        const current = featureState(state, "install");
        if (current.available) return button("⬇ Installer MeliApp", "install.run", { className: "primary install-button" });
        if (current.ios) return el("p", { className: "muted", text: "Sur iPhone/iPad : Partager → Ajouter à l’écran d’accueil." });
        return null;
      },
      actions: { "install.run": ({ dispatch }) => dispatch("install:run") }
    }
  }
};
