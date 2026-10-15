import { eventKey } from "./domain/calendar-classification.js";

const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;
const setFeatureState = (state, name, next, fallback = {}) => ({ ...state, features: { ...(state.features ?? {}), [name]: typeof next === "function" ? next(featureState(state, name, fallback)) : next } });
const node = (tag, attrs = {}, children = []) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "className") element.className = value;
    else if (key === "text") element.textContent = String(value);
    else if (key === "value") element.value = value;
    else element.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of (Array.isArray(children) ? children : [children])) if (child) element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return element;
};
const normalize = (value) => String(value ?? "").trim().toLocaleLowerCase("fr-FR");

const resultsFor = (state, query) => {
  const q = normalize(query);
  if (!q) return [];
  const tasks = (featureState(state, "tasks", { items: [] }).items ?? [])
    .filter((task) => task.status !== "completed")
    .filter((task) => normalize([task.title, task.context, task.projectTitle].filter(Boolean).join(" ")).includes(q))
    .map((task) => ({ type: "task", id: task.id, title: task.title, subtitle: `Tâche${task.deadline ? ` · ${new Date(task.deadline).toLocaleString("fr-FR")}` : ""}` }));
  const events = (state.calendar?.events ?? [])
    .filter((event) => normalize([event.title, event.calendarName, event.location].filter(Boolean).join(" ")).includes(q))
    .map((event) => ({ type: "event", key: eventKey(event), title: event.title ?? "Événement", subtitle: `${event.calendarName ?? "Outlook"} · ${new Date(event.start).toLocaleString("fr-FR")}` }));
  return [...tasks, ...events].slice(0, 12);
};

const render = ({ state }) => {
  const current = featureState(state, "quickSearch", { query: "", chips: [] });
  const results = resultsFor(state, current.query);
  const root = node("section", { className: "stack quick-search" }, [
    node("div", { className: "stack compact" }, [
      node("span", { className: "eyebrow", text: "Raccourcis" }),
      node("h2", { text: "Recherches rapides" }),
      node("p", { className: "muted", text: "Crée tes propres chips pour retrouver en un toucher un cours, un projet, un lieu ou n’importe quel mot récurrent." })
    ]),
    node("div", { className: "quick-search-bar row" }, [
      node("input", { type: "search", value: current.query ?? "", placeholder: "Rechercher tâches et événements…", "data-action": "quick-search.query", "aria-label": "Recherche rapide" }),
      node("button", { type: "button", className: "secondary", "data-action": "quick-search.save-chip", text: "＋ Créer une chip" })
    ])
  ]);

  if (current.chips?.length) {
    const chips = node("div", { className: "search-chips", role: "list", "aria-label": "Recherches enregistrées" });
    for (const chip of current.chips) chips.append(node("span", { className: "search-chip-wrap", role: "listitem" }, [
      node("button", { type: "button", className: `search-chip${normalize(current.query) === normalize(chip.query) ? " is-active" : ""}`, "data-action": "quick-search.use-chip", "data-id": chip.id, text: chip.label }),
      node("button", { type: "button", className: "search-chip-remove", "data-action": "quick-search.remove-chip", "data-id": chip.id, "aria-label": `Supprimer ${chip.label}`, text: "×" })
    ]));
    root.append(chips);
  }

  if (current.query) {
    const list = node("div", { className: "stack compact quick-search-results" });
    if (!results.length) list.append(node("p", { className: "muted", text: "Aucun résultat. L’univers reste mystérieux, mais au moins la recherche fonctionne." }));
    for (const item of results) list.append(node("button", {
      type: "button",
      className: "quick-search-result list-item",
      "data-action": item.type === "task" ? "item-inspector.open-task" : "item-inspector.open-event",
      ...(item.type === "task" ? { "data-id": item.id } : { "data-key": item.key })
    }, [node("strong", { text: item.title }), node("small", { className: "muted", text: item.subtitle })]));
    root.append(list);
  }
  return root;
};

export const quickSearchFeatures = {
  quickSearch: {
    description: "Chips de recherche personnalisées",
    state: { query: "", chips: [] },
    when: ["quick-search:query", "quick-search:save-chip", "quick-search:use-chip", "quick-search:remove-chip"],
    run: ({ state, event, payload }) => setFeatureState(state, "quickSearch", (current) => {
      if (event === "quick-search:query") return { ...current, query: String(payload?.query ?? "") };
      if (event === "quick-search:save-chip") {
        const query = String(current.query ?? "").trim();
        if (!query || (current.chips ?? []).some((chip) => normalize(chip.query) === normalize(query))) return current;
        return { ...current, chips: [...(current.chips ?? []), { id: `chip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label: query, query }] };
      }
      if (event === "quick-search:use-chip") {
        const chip = (current.chips ?? []).find((item) => item.id === payload?.id);
        return chip ? { ...current, query: chip.query } : current;
      }
      if (event === "quick-search:remove-chip") return { ...current, chips: (current.chips ?? []).filter((item) => item.id !== payload?.id) };
      return current;
    }),
    ui: {
      order: 4,
      render,
      actions: {
        "quick-search.query": ({ event, target, dispatch }) => ["input", "change"].includes(event.type) ? dispatch("quick-search:query", { query: target.value }) : undefined,
        "quick-search.save-chip": ({ dispatch }) => dispatch("quick-search:save-chip"),
        "quick-search.use-chip": ({ target, dispatch }) => dispatch("quick-search:use-chip", { id: target.dataset.id }),
        "quick-search.remove-chip": ({ target, dispatch }) => dispatch("quick-search:remove-chip", { id: target.dataset.id })
      }
    }
  }
};
