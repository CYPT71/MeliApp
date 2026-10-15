const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;

const setFeatureState = (state, name, next) => ({
  ...state,
  features: {
    ...(state.features ?? {}),
    [name]: typeof next === "function" ? next(featureState(state, name)) : next
  }
});

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = String(value ?? "");
    else if (key === "checked") node.checked = Boolean(value);
    else if (key === "value") node.value = value;
    else if (key.startsWith("data-")) node.setAttribute(key, value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of (Array.isArray(children) ? children : [children])) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
};

const button = (label, action, attrs = {}) =>
  el("button", { type: "button", "data-action": action, ...attrs, text: label });

const field = ({ label, name, type = "text", value = "", min, max, step, checked, action }) => {
  const input = el("input", { name, type, value, min, max, step, checked, ...(action ? { "data-action": action } : {}) });
  return el("label", { className: "field" }, [el("span", { text: label }), input]);
};

const selectField = ({ label, name, value, options = [] }) => {
  const select = el("select", { name });
  for (const option of options) {
    const node = el("option", { value: option.value, text: option.label });
    if (option.value === value) node.selected = true;
    select.append(node);
  }
  return el("label", { className: "field" }, [el("span", { text: label }), select]);
};

const formValue = (target, name) => target.closest("form")?.elements?.namedItem(name)?.value ?? "";
const formChecked = (target, name) => Boolean(target.closest("form")?.elements?.namedItem(name)?.checked);
const asNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const taskItems = (state) => featureState(state, "tasks", { items: [] }).items ?? [];
const projectItems = (state) => featureState(state, "projects", { items: [] }).items ?? [];

const completedTasks = (state) => taskItems(state).filter((task) => task.status === "completed");
const completedSessions = (state) => (state.sessions ?? []).filter((session) => session?.endedAt);

const projectProgress = (state, projectId) => {
  const tasks = taskItems(state).filter((task) => task.projectId === projectId);
  if (!tasks.length) return 0;
  return tasks.reduce((sum, task) => sum + Number(task.progress ?? 0), 0) / tasks.length;
};

const downloadJson = (filename, value) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
};

const todayKey = (value = Date.now()) => new Date(value).toISOString().slice(0, 10);

export const advancedFeatures = {
  settings: {
    description: "Préférences",
    page: { path: "settings", title: "Préférences", icon: "⚙️", order: 80 },
    state: {
      lowEnergyThreshold: 3,
      energyExpiryMinutes: 180,
      calendarBufferMinutes: 10,
      defaultWorkMode: "free",
      dayStart: "07:00",
      dayEnd: "23:00",
      reminderMinutes: 10,
      quietStart: "22:30",
      quietEnd: "07:30"
    },
    when: ["settings:save"],
    run: ({ state, payload }) => {
      const current = featureState(state, "settings");
      const next = {
        ...current,
        lowEnergyThreshold: Math.min(10, Math.max(1, asNumber(payload?.lowEnergyThreshold, current.lowEnergyThreshold))),
        energyExpiryMinutes: Math.max(15, asNumber(payload?.energyExpiryMinutes, current.energyExpiryMinutes)),
        calendarBufferMinutes: Math.max(0, asNumber(payload?.calendarBufferMinutes, current.calendarBufferMinutes)),
        defaultWorkMode: ["free", "flow", "focus", "pomodoro"].includes(payload?.defaultWorkMode) ? payload.defaultWorkMode : current.defaultWorkMode,
        dayStart: payload?.dayStart || current.dayStart,
        dayEnd: payload?.dayEnd || current.dayEnd,
        reminderMinutes: Math.max(1, asNumber(payload?.reminderMinutes, current.reminderMinutes)),
        quietStart: payload?.quietStart || current.quietStart,
        quietEnd: payload?.quietEnd || current.quietEnd
      };
      const energy = featureState(state, "energy", {});
      return {
        ...setFeatureState(
          setFeatureState(state, "settings", next),
          "energy",
          { ...energy, lowThreshold: next.lowEnergyThreshold, expiresAfterMinutes: next.energyExpiryMinutes }
        ),
        settings: {
          ...(state.settings ?? {}),
          workMode: next.defaultWorkMode,
          calendarBufferMinutes: next.calendarBufferMinutes
        }
      };
    },
    ui: {
      render: ({ state }) => {
        const current = featureState(state, "settings");
        const form = el("form", { className: "feature-form" });
        form.append(
          field({ label: "Seuil énergie basse", name: "lowEnergyThreshold", type: "number", min: 1, max: 10, value: current.lowEnergyThreshold }),
          field({ label: "Expiration énergie (min)", name: "energyExpiryMinutes", type: "number", min: 15, step: 15, value: current.energyExpiryMinutes }),
          field({ label: "Marge avant rendez-vous (min)", name: "calendarBufferMinutes", type: "number", min: 0, step: 5, value: current.calendarBufferMinutes }),
          selectField({ label: "Mode par défaut", name: "defaultWorkMode", value: current.defaultWorkMode, options: [
            { value: "free", label: "Libre" },
            { value: "flow", label: "Flow" },
            { value: "focus", label: "Focus guidé" },
            { value: "pomodoro", label: "Pomodoro" }
          ] }),
          field({ label: "Début de journée", name: "dayStart", type: "time", value: current.dayStart }),
          field({ label: "Fin de journée", name: "dayEnd", type: "time", value: current.dayEnd }),
          field({ label: "Rappel avant rendez-vous (min)", name: "reminderMinutes", type: "number", min: 1, value: current.reminderMinutes }),
          field({ label: "Silence à partir de", name: "quietStart", type: "time", value: current.quietStart }),
          field({ label: "Silence jusqu’à", name: "quietEnd", type: "time", value: current.quietEnd }),
          button("Enregistrer", "settings.save", { className: "primary" })
        );
        return form;
      },
      actions: {
        "settings.save": ({ target, dispatch }) => dispatch("settings:save", {
          lowEnergyThreshold: formValue(target, "lowEnergyThreshold"),
          energyExpiryMinutes: formValue(target, "energyExpiryMinutes"),
          calendarBufferMinutes: formValue(target, "calendarBufferMinutes"),
          defaultWorkMode: formValue(target, "defaultWorkMode"),
          dayStart: formValue(target, "dayStart"),
          dayEnd: formValue(target, "dayEnd"),
          reminderMinutes: formValue(target, "reminderMinutes"),
          quietStart: formValue(target, "quietStart"),
          quietEnd: formValue(target, "quietEnd")
        })
      }
    }
  },

  projects: {
    description: "Projets / Boss",
    page: { path: "projects", title: "Boss", icon: "👹", order: 35 },
    state: { items: [] },
    when: ["project:create", "project:update", "project:delete"],
    run: ({ state, event, payload }) => {
      const current = featureState(state, "projects", { items: [] });
      let items = [...(current.items ?? [])];
      if (event === "project:create") {
        const title = String(payload?.title ?? "").trim();
        if (title) items.push({ id: uid("project"), title, deadline: payload?.deadline || null, createdAt: new Date().toISOString() });
      }
      if (event === "project:update") items = items.map((project) => project.id === payload?.id ? { ...project, ...payload } : project);
      if (event === "project:delete") items = items.filter((project) => project.id !== payload?.id);
      return setFeatureState(state, "projects", { items });
    },
    ui: {
      render: ({ state }) => {
        const root = el("div", { className: "stack" });
        const form = el("form", { className: "feature-form" }, [
          field({ label: "Nom du Boss", name: "title" }),
          field({ label: "Deadline", name: "deadline", type: "datetime-local" }),
          button("Créer le Boss", "projects.create", { className: "primary" })
        ]);
        root.append(form);
        const projects = projectItems(state);
        if (!projects.length) root.append(el("p", { className: "muted", text: "Aucun Boss. Profite de cette anomalie statistique." }));
        for (const project of projects) {
          const progress = projectProgress(state, project.id);
          const card = el("article", { className: "list-item boss-card" }, [
            el("strong", { text: `👹 ${project.title}` }),
            el("progress", { max: 1, value: progress }),
            el("span", { className: "muted", text: `${Math.round(progress * 100)} %${project.deadline ? ` · deadline ${new Date(project.deadline).toLocaleString("fr-FR")}` : ""}` }),
            button("Supprimer", "projects.delete", { "data-id": project.id })
          ]);
          const unassigned = taskItems(state).filter((task) => task.status !== "completed" && task.projectId !== project.id);
          if (unassigned.length) {
            const select = el("select", { "data-project": project.id, "data-role": "task-select" });
            select.append(el("option", { value: "", text: "Associer une tâche…" }));
            for (const task of unassigned) select.append(el("option", { value: task.id, text: task.title }));
            card.append(el("div", { className: "row" }, [select, button("Associer", "projects.assign", { "data-project": project.id })]));
          }
          root.append(card);
        }
        return root;
      },
      actions: {
        "projects.create": ({ target, dispatch }) => dispatch("project:create", { title: formValue(target, "title"), deadline: formValue(target, "deadline") || null }),
        "projects.delete": ({ target, dispatch }) => dispatch("project:delete", { id: target.dataset.id }),
        "projects.assign": ({ target, dispatch }) => {
          const projectId = target.dataset.project;
          const select = target.parentElement?.querySelector("[data-role='task-select']");
          if (select?.value) return dispatch("task:updated", { id: select.value, projectId });
        }
      }
    }
  },

  taskEditor: {
    description: "Édition avancée des tâches",
    page: { path: "tasks", title: "Édition tâches", nav: false, order: 31 },
    state: { editingId: null },
    when: ["task-editor:open", "task-editor:close"],
    run: ({ state, event, payload }) => setFeatureState(state, "taskEditor", { editingId: event === "task-editor:open" ? payload?.id ?? null : null }),
    ui: {
      render: ({ state }) => {
        const current = featureState(state, "taskEditor");
        const root = el("div", { className: "stack" });
        root.append(el("h2", { text: "Édition détaillée" }));
        const tasks = taskItems(state).filter((task) => task.status !== "completed");
        for (const task of tasks) {
          if (current.editingId !== task.id) {
            root.append(el("div", { className: "row row--between" }, [el("span", { text: task.title }), button("Éditer ici", "task-editor.open", { "data-id": task.id })]));
            continue;
          }
          const form = el("form", { className: "feature-form" }, [
            field({ label: "Titre", name: "title", value: task.title }),
            field({ label: "Durée", name: "estimateMinutes", type: "number", min: 5, step: 5, value: task.estimateMinutes }),
            field({ label: "Difficulté", name: "difficulty", type: "number", min: 1, max: 5, value: task.difficulty }),
            field({ label: "Importance", name: "importance", type: "number", min: 1, max: 5, value: task.importance }),
            field({ label: "Progression %", name: "progress", type: "number", min: 0, max: 100, value: Math.round((task.progress ?? 0) * 100) }),
            field({ label: "Découpable", name: "splittable", type: "checkbox", checked: task.splittable }),
            button("Sauvegarder", "task-editor.save", { className: "primary", "data-id": task.id }),
            button("Annuler", "task-editor.close")
          ]);
          root.append(form);
        }
        return root;
      },
      actions: {
        "task-editor.open": ({ target, dispatch }) => dispatch("task-editor:open", { id: target.dataset.id }),
        "task-editor.close": ({ dispatch }) => dispatch("task-editor:close"),
        "task-editor.save": async ({ target, dispatch }) => {
          await dispatch("task:updated", {
            id: target.dataset.id,
            title: formValue(target, "title"),
            estimateMinutes: formValue(target, "estimateMinutes"),
            difficulty: formValue(target, "difficulty"),
            importance: formValue(target, "importance"),
            progress: asNumber(formValue(target, "progress")) / 100,
            splittable: formChecked(target, "splittable")
          });
          return dispatch("task-editor:close");
        }
      }
    }
  },

  plannerStability: {
    description: "Stabilité du planner",
    state: { lastTaskId: null, switches: 0 },
    when: ["app:start", "app:resume", "energy:set", "calendar:synced", "sync:manual", "task:created", "task:updated", "task:completed", "task:deleted", "task:deferred", "session:completed", "planner:cycle"],
    run: ({ state, event }) => {
      const planner = featureState(state, "planner", { current: null, candidates: [] });
      const current = planner.current;
      const memory = featureState(state, "plannerStability");
      if (!current) return setFeatureState(state, "plannerStability", { ...memory, lastTaskId: null });
      if (event === "planner:cycle") return setFeatureState(state, "plannerStability", { lastTaskId: current.id, switches: (memory.switches ?? 0) + 1 });
      if (memory.lastTaskId && memory.lastTaskId !== current.id) {
        const previous = (planner.candidates ?? []).find((candidate) => candidate.id === memory.lastTaskId);
        if (previous && Number(current.score ?? 0) - Number(previous.score ?? 0) <= 2) {
          const index = planner.candidates.findIndex((candidate) => candidate.id === previous.id);
          return setFeatureState(
            setFeatureState(state, "planner", { ...planner, current: previous, index: Math.max(0, index) }),
            "plannerStability",
            memory
          );
        }
      }
      return setFeatureState(state, "plannerStability", { ...memory, lastTaskId: current.id });
    }
  },

  outlookWrite: {
    description: "Écriture Outlook",
    state: { writing: false, lastEventId: null, error: null },
    when: ["outlook:block-current"],
    run: async ({ state, services }) => {
      const current = featureState(state, "planner", {}).current;
      if (!current || !services.outlook?.createFocusBlock) return state;
      try {
        const start = new Date();
        const end = new Date(start.getTime() + Math.max(5, asNumber(current.chunkMinutes ?? current.estimateMinutes, 25)) * 60000);
        const event = await services.outlook.createFocusBlock({ title: current.title, start, end });
        return setFeatureState(state, "outlookWrite", { writing: false, lastEventId: event?.id ?? null, error: null });
      } catch (error) {
        return setFeatureState(state, "outlookWrite", { writing: false, lastEventId: null, error: error instanceof Error ? error.message : String(error) });
      }
    },
    ui: {
      zone: "main",
      order: 25,
      visible: ({ state }) => Boolean(featureState(state, "planner", {}).current && state.auth?.microsoft?.connected),
      render: ({ state }) => {
        const current = featureState(state, "outlookWrite");
        return el("div", { className: "stack compact" }, [
          button("📅 Bloquer cette mission dans Outlook", "outlook.block", { className: "secondary" }),
          current.error ? el("small", { className: "error", text: current.error }) : null,
          current.lastEventId ? el("small", { className: "muted", text: "Bloc ajouté au calendrier." }) : null
        ]);
      },
      actions: { "outlook.block": ({ dispatch }) => dispatch("outlook:block-current") }
    }
  },

  spotifyLibrary: {
    description: "Bibliothèque Spotify",
    page: { path: "spotify", title: "Playlists", nav: false, order: 51 },
    state: { playlists: [], loading: false, error: null },
    when: ["spotify:library:load"],
    run: async ({ state, services }) => {
      if (!services.spotify?.listPlaylists) return state;
      try {
        const playlists = await services.spotify.listPlaylists();
        return setFeatureState(state, "spotifyLibrary", { playlists, loading: false, error: null });
      } catch (error) {
        return setFeatureState(state, "spotifyLibrary", { playlists: [], loading: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
    ui: {
      visible: ({ state }) => Boolean(featureState(state, "spotify", {}).connected),
      render: ({ state }) => {
        const current = featureState(state, "spotifyLibrary");
        const root = el("div", { className: "stack" }, [el("h2", { text: "Tes playlists" }), button("Charger mes playlists", "spotify-library.load")]);
        if (current.error) root.append(el("p", { className: "error", text: current.error }));
        for (const playlist of current.playlists ?? []) {
          root.append(el("article", { className: "list-item" }, [
            el("strong", { text: playlist.name }),
            el("div", { className: "row" }, [
              button("Énergie basse", "spotify-library.pick", { "data-uri": playlist.uri, "data-slot": "lowEnergy" }),
              button("Focus", "spotify-library.pick", { "data-uri": playlist.uri, "data-slot": "focus" }),
              button("Récupération", "spotify-library.pick", { "data-uri": playlist.uri, "data-slot": "recovery" }),
              button("Boss", "spotify-library.pick", { "data-uri": playlist.uri, "data-slot": "boss" })
            ])
          ]));
        }
        return root;
      },
      actions: {
        "spotify-library.load": ({ dispatch }) => dispatch("spotify:library:load"),
        "spotify-library.pick": ({ target, state, dispatch }) => {
          const current = featureState(state, "spotify", {});
          return dispatch("spotify:save", { ...current, [target.dataset.slot]: target.dataset.uri });
        }
      }
    }
  },

  reminders: {
    description: "Rappels opportunistes",
    state: { lastNotifiedEventId: null },
    when: ["app:start", "app:resume", "calendar:synced", "sync:manual"],
    run: async ({ state, services }) => {
      const settings = featureState(state, "settings", { reminderMinutes: 10, quietStart: "22:30", quietEnd: "07:30" });
      const notifications = featureState(state, "notifications", {});
      if (!notifications.enabled || !services.notifications?.notify) return state;
      const now = new Date();
      const minutesNow = now.getHours() * 60 + now.getMinutes();
      const toMinutes = (value) => {
        const [h, m] = String(value).split(":").map(Number);
        return h * 60 + m;
      };
      const quietStart = toMinutes(settings.quietStart);
      const quietEnd = toMinutes(settings.quietEnd);
      const quiet = quietStart > quietEnd ? minutesNow >= quietStart || minutesNow < quietEnd : minutesNow >= quietStart && minutesNow < quietEnd;
      if (quiet) return state;
      const event = [...(state.calendar?.events ?? [])].filter((item) => new Date(item.start).getTime() > now.getTime()).sort((a, b) => new Date(a.start) - new Date(b.start))[0];
      if (!event) return state;
      const delta = Math.floor((new Date(event.start).getTime() - now.getTime()) / 60000);
      const current = featureState(state, "reminders");
      if (delta < 0 || delta > settings.reminderMinutes || current.lastNotifiedEventId === event.id) return state;
      await services.notifications.notify(`Rendez-vous dans ${Math.max(1, delta)} min`, { body: event.title ?? "Événement Outlook" });
      return setFeatureState(state, "reminders", { lastNotifiedEventId: event.id });
    }
  },

  achievements: {
    description: "Succès",
    page: { path: "achievements", title: "Succès", icon: "🏆", order: 45 },
    state: { unlocked: [] },
    when: ["app:start", "task:completed", "session:completed", "energy:set"],
    run: ({ state }) => {
      const unlocked = new Set(featureState(state, "achievements", { unlocked: [] }).unlocked ?? []);
      const done = completedTasks(state).length;
      const sessions = completedSessions(state);
      if (done >= 1) unlocked.add("first-task");
      if (done >= 10) unlocked.add("ten-tasks");
      if (sessions.some((session) => Number(session.actualMinutes ?? 0) >= 45)) unlocked.add("deep-focus");
      if (sessions.length >= 5) unlocked.add("five-sessions");
      if (projectItems(state).some((project) => projectProgress(state, project.id) >= 1)) unlocked.add("boss-down");
      return setFeatureState(state, "achievements", { unlocked: [...unlocked] });
    },
    ui: {
      render: ({ state }) => {
        const unlocked = new Set(featureState(state, "achievements", { unlocked: [] }).unlocked ?? []);
        const catalog = [
          ["first-task", "Premier pas", "Terminer une première tâche"],
          ["ten-tasks", "Machine presque humaine", "Terminer 10 tâches"],
          ["deep-focus", "Tunnel de concentration", "Session de 45 minutes ou plus"],
          ["five-sessions", "Régularité", "Terminer 5 sessions"],
          ["boss-down", "Boss vaincu", "Finir un projet"]
        ];
        return el("div", { className: "stack" }, catalog.map(([id, title, description]) => el("article", { className: `list-item${unlocked.has(id) ? " achievement--unlocked" : ""}` }, [el("strong", { text: `${unlocked.has(id) ? "🏆" : "🔒"} ${title}` }), el("span", { className: "muted", text: description })])));
      }
    }
  },

  statistics: {
    description: "Statistiques",
    page: { path: "stats", title: "Statistiques", icon: "📊", order: 46 },
    ui: {
      render: ({ state }) => {
        const sessions = completedSessions(state);
        const totalMinutes = sessions.reduce((sum, session) => sum + Number(session.actualMinutes ?? 0), 0);
        const today = todayKey();
        const todayMinutes = sessions.filter((session) => todayKey(session.endedAt) === today).reduce((sum, session) => sum + Number(session.actualMinutes ?? 0), 0);
        const game = featureState(state, "game", { xp: 0, level: 1 });
        return el("div", { className: "stats-grid" }, [
          el("article", { className: "stat-card" }, [el("strong", { text: String(completedTasks(state).length) }), el("span", { text: "tâches terminées" })]),
          el("article", { className: "stat-card" }, [el("strong", { text: `${totalMinutes} min` }), el("span", { text: "focus total" })]),
          el("article", { className: "stat-card" }, [el("strong", { text: `${todayMinutes} min` }), el("span", { text: "aujourd’hui" })]),
          el("article", { className: "stat-card" }, [el("strong", { text: `Niv. ${game.level}` }), el("span", { text: `${game.xp} XP` })])
        ]);
      }
    }
  },

  diagnosticsAdvanced: {
    description: "Diagnostic",
    page: { path: "diagnostic", title: "Diagnostic", icon: "🧪", order: 90 },
    when: ["diagnostics:clear"],
    run: ({ state }) => ({ ...state, diagnostics: [] }),
    ui: {
      render: ({ state }) => {
        const root = el("div", { className: "stack" });
        const rows = [
          ["Réseau", navigator.onLine ? "en ligne" : "hors ligne"],
          ["Outlook", state.auth?.microsoft?.connected ? "connecté" : "déconnecté"],
          ["Spotify", featureState(state, "spotify", {}).connected ? "connecté" : "déconnecté"],
          ["IA", featureState(state, "ai", {}).enabled ? "activée" : "désactivée"],
          ["Service Worker", "serviceWorker" in navigator ? "supporté" : "non supporté"],
          ["Stockage", "indexedDB" in globalThis ? "IndexedDB disponible" : "indisponible"]
        ];
        for (const [label, value] of rows) root.append(el("div", { className: "row row--between diagnostic-row" }, [el("strong", { text: label }), el("span", { text: value })]));
        root.append(el("h2", { text: `Erreurs (${state.diagnostics?.length ?? 0})` }));
        for (const diagnostic of state.diagnostics ?? []) root.append(el("pre", { className: "diagnostic-error", text: `${diagnostic.feature ?? "core"} · ${diagnostic.event ?? "?"}\n${diagnostic.message ?? diagnostic}` }));
        root.append(button("Effacer les diagnostics", "diagnostics.clear"));
        return root;
      },
      actions: { "diagnostics.clear": ({ dispatch }) => dispatch("diagnostics:clear") }
    }
  },

  dataManager: {
    description: "Données locales",
    page: { path: "data", title: "Données", icon: "💾", order: 95 },
    state: { lastImportAt: null, error: null },
    when: ["data:import", "data:reset"],
    run: ({ state, event, payload }) => {
      if (event === "data:reset") {
        const features = Object.fromEntries(Object.entries(state.features ?? {}).map(([key, value]) => [key, value]));
        return {
          ...state,
          calendar: { events: [], lastSyncAt: null },
          tasks: [],
          projects: [],
          sessions: [],
          diagnostics: [],
          features: {
            ...features,
            tasks: { items: [] },
            projects: { items: [] },
            planner: { current: null, candidates: [], index: 0, computedAt: null },
            flow: { active: false, mode: "free", taskId: null, startedAt: null, endedAt: null, suggestedMinutes: null },
            game: { xp: 0, level: 1, lastGain: 0 },
            guided: { sessions: {}, activeTaskId: null },
            taskWorkspace: { ...state.features?.taskWorkspace, draft: {}, draftProjectId: null, expandedId: null, editingId: null, query: "", statusFilter: "active", projectFilter: "all" },
            achievements: { unlocked: [] }
          }
        };
      }
      if (!payload?.state || typeof payload.state !== "object" || !payload.state.features) return setFeatureState(state, "dataManager", { error: "Fichier invalide", lastImportAt: null });
      return {
        ...state,
        ...payload.state,
        auth: state.auth,
        features: { ...state.features, ...payload.state.features, dataManager: { error: null, lastImportAt: new Date().toISOString() } },
        diagnostics: Array.isArray(payload.state.diagnostics) ? payload.state.diagnostics.slice(-100) : []
      };
    },
    ui: {
      render: ({ state }) => {
        const current = featureState(state, "dataManager");
        const input = el("input", { type: "file", accept: "application/json,.json", "data-action": "data.import" });
        return el("div", { className: "stack" }, [
          el("p", { className: "muted", text: "Export local pour sauvegarde ou migration. Les jetons OAuth de session ne sont pas inclus dans cet état." }),
          button("Exporter mes données", "data.export", { className: "primary" }),
          el("label", { className: "field" }, [el("span", { text: "Importer une sauvegarde" }), input]),
          button("Réinitialiser les données produit", "data.reset"),
          current.error ? el("p", { className: "error", text: current.error }) : null,
          current.lastImportAt ? el("p", { className: "muted", text: `Dernier import : ${new Date(current.lastImportAt).toLocaleString("fr-FR")}` }) : null
        ]);
      },
      actions: {
        "data.export": ({ state }) => downloadJson(`meliapp-backup-${todayKey()}.json`, state),
        "data.import": async ({ target, dispatch }) => {
          const file = target.files?.[0];
          if (!file) return;
          try {
            const parsed = JSON.parse(await file.text());
            return dispatch("data:import", { state: parsed });
          } catch {
            return dispatch("data:import", { state: null });
          }
        },
        "data.reset": ({ dispatch }) => dispatch("data:reset")
      }
    }
  }
};
