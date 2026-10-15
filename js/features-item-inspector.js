import { linkedProjects } from "./domain/project-outlook.js";
import { categoryPresentation } from "./domain/outlook-categories.js";
import { eventKey, normalizePlacement } from "./domain/calendar-classification.js";

const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;
const setFeatureState = (state, name, next, fallback = {}) => ({
  ...state,
  features: {
    ...(state.features ?? {}),
    [name]: typeof next === "function" ? next(featureState(state, name, fallback)) : next
  }
});
const clampRange = (value, fallback = 120) => Math.min(1440, Math.max(15, Number(value) || fallback));
const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, Number(value) || fallback));
const DURATION_UNITS_MINUTES = Object.freeze({ Y: 365 * 24 * 60, M: 30 * 24 * 60, d: 24 * 60, h: 60, m: 1, s: 1 / 60 });

export const parseYmDhmsDuration = (value, fallbackMinutes = 120) => {
  const text = String(value ?? "").trim();
  if (!text) return clampRange(fallbackMinutes, 120);
  let total = 0;
  let cursor = 0;
  const pattern = /(\d+(?:[.,]\d+)?)\s*([YMdhms])/g;
  for (const match of text.matchAll(pattern)) {
    if (match.index !== cursor && text.slice(cursor, match.index).trim()) return clampRange(fallbackMinutes, 120);
    const amount = Number(match[1].replace(",", "."));
    if (!Number.isFinite(amount)) return clampRange(fallbackMinutes, 120);
    total += amount * DURATION_UNITS_MINUTES[match[2]];
    cursor = match.index + match[0].length;
  }
  if (cursor !== text.length && text.slice(cursor).trim()) return clampRange(fallbackMinutes, 120);
  if (!total) return clampRange(fallbackMinutes, 120);
  return clampRange(Math.ceil(total), fallbackMinutes);
};

export const formatYmDhmsDuration = (minutes) => {
  let remainingSeconds = Math.max(0, Math.round((Number(minutes) || 0) * 60));
  if (!remainingSeconds) return "0m";
  const units = [["Y", 365 * 24 * 3600], ["M", 30 * 24 * 3600], ["d", 24 * 3600], ["h", 3600], ["m", 60], ["s", 1]];
  const parts = [];
  for (const [unit, seconds] of units) {
    const amount = Math.floor(remainingSeconds / seconds);
    if (!amount) continue;
    parts.push(`${amount}${unit}`);
    remainingSeconds -= amount * seconds;
  }
  return parts.join("") || "0m";
};

const toDateTimeLocal = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const node = (tag, attrs = {}, children = []) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "className") element.className = value;
    else if (key === "text") element.textContent = String(value);
    else if (key === "checked") element.checked = Boolean(value);
    else if (key === "selected") element.selected = Boolean(value);
    else if (key === "value") element.value = value;
    else element.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of (Array.isArray(children) ? children : [children])) if (child) element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return element;
};
const field = (label, name, attrs = {}) => node("label", { className: "field" }, [node("span", { text: label }), node("input", { name, ...attrs })]);
const durationField = (label, name, minutes) => node("label", { className: "field duration-field" }, [
  node("span", { text: label }),
  node("input", { name, type: "text", inputmode: "text", value: formatYmDhmsDuration(minutes), placeholder: "2h30m", "aria-describedby": `${name}-hint` }),
  node("small", { id: `${name}-hint`, className: "muted", text: "Format YMdhms · ex. 45m, 2h30m ou 1d. La fenêtre actuelle est limitée à 1d." })
]);
const select = (label, name, value, options) => node("label", { className: "field" }, [
  node("span", { text: label }),
  node("select", { name }, options.map(([optionValue, text]) => node("option", { value: optionValue, selected: optionValue === value, text })))
]);
const formValue = (target, name) => target.closest("form")?.elements?.namedItem(name)?.value ?? "";

const findEvent = (state, key) => (state.calendar?.events ?? []).find((event) => eventKey(event) === key) ?? null;
const findTask = (state, id) => (featureState(state, "tasks", { items: [] }).items ?? []).find((task) => String(task.id) === String(id)) ?? null;

const taskForm = (state, task) => {
  const defaultRange = featureState(state, "schedulePreferences", { defaultFlexRangeMinutes: 120 }).defaultFlexRangeMinutes ?? 120;
  return node("form", { className: "inspector-form stack" }, [
    node("h2", { text: "Préciser la tâche" }),
    field("Titre", "title", { value: task.title ?? "" }),
    node("div", { className: "inspector-grid" }, [
      field("Échéance", "deadline", { type: "datetime-local", value: task.deadline ? toDateTimeLocal(task.deadline) : "" }),
      field("Durée estimée (min)", "estimateMinutes", { type: "number", min: 5, step: 5, value: task.estimateMinutes ?? 25 }),
      field("Difficulté", "difficulty", { type: "number", min: 1, max: 5, value: task.difficulty ?? 3 }),
      field("Importance", "importance", { type: "number", min: 1, max: 5, value: task.importance ?? 3 }),
      select("Contexte", "context", task.context ?? "perso", [["perso", "🏠 Perso"], ["cours", "📚 Cours"]]),
      select("Placement", "scheduleMode", normalizePlacement(task.scheduleMode), [["fixed", "📌 Fixe"], ["flexible", "↔ Flexible"]]),
      durationField("Peut bouger de ±", "flexRangeDuration", clampRange(task.flexRangeMinutes, defaultRange))
    ]),
    node("div", { className: "row inspector-actions" }, [
      node("button", { type: "button", "data-action": "item-inspector.close", text: "Annuler" }),
      node("button", { type: "button", className: "primary", "data-action": "item-inspector.save-task", "data-id": task.id, text: "Enregistrer" })
    ])
  ]);
};

const eventForm = (state, event) => {
  const sources = featureState(state, "calendarSources", {});
  const preferences = featureState(state, "schedulePreferences", { defaultFlexRangeMinutes: 120 });
  const key = eventKey(event);
  const role = sources.roles?.[key] ?? sources.roles?.[event.calendarId] ?? "both";
  const placement = sources.itemPlacements?.[key] ?? sources.placementByCalendar?.[event.calendarId] ?? "flexible";
  const range = clampRange(sources.itemRanges?.[key] ?? sources.rangeByCalendar?.[event.calendarId], preferences.defaultFlexRangeMinutes);
  const category = categoryPresentation(event);
  const imported = (state.features?.tasks?.items ?? []).some((task) => task.sourceEventId === event.id);
  const when = `${new Date(event.start).toLocaleString("fr-FR")} → ${new Date(event.end).toLocaleString("fr-FR")}`;
  return node("form", { className: "inspector-form stack" }, [
    node("h2", { text: "Préciser l’élément Outlook" }),
    node("div", { className: "inspector-summary stack compact" }, [
      node("strong", { text: event.title ?? "Élément Outlook" }),
      node("span", { className: "muted", text: `${event.calendarName ?? "Outlook"} · ${when}` }),
      event.location ? node("span", { className: "muted", text: `📍 ${event.location}` }) : null,
      event.isOnlineMeeting ? node("span", { className: "muted", text: "💻 Réunion en ligne" }) : null
    ]),
    category.label ? node("span", { className: `outlook-category-tag${category.style ? " has-category" : ""}`, style: category.style, text: category.label }) : null,
    ...linkedProjects(state, event).map((project) => node("span", { className: "task-chip", text: `Projet · ${project.title}` })),
    node("div", { className: "preference-block stack compact" }, [
      node("strong", { text: "Créer une tâche depuis cet élément" }),
      field("Deadline de la tâche", "taskDeadline", { type: "datetime-local", value: toDateTimeLocal(event.start) }),
      node("small", { className: "muted", text: "Tu peux modifier ou effacer la deadline avant l’ajout. Outlook, lui, garde son horaire d’origine." }),
      node("button", { type: "button", className: imported ? "secondary" : "primary", "data-action": "calendar.import-task", "data-event-id": event.id, disabled: imported, text: imported ? "Ajoutée aux tâches" : "Ajouter aux tâches" })
    ]),
    node("div", { className: "inspector-grid" }, [
      select("Nature", "role", role, [["tasks", "✓ À faire"], ["appointments", "📍 Rendez-vous"], ["both", "✨ Auto / mélangé"]]),
      select("Placement", "placement", normalizePlacement(placement), [["fixed", "📌 Fixe"], ["flexible", "↔ Flexible"]]),
      durationField("Peut bouger de ±", "rangeDuration", range)
    ]),
    node("p", { className: "muted", text: "“Peut bouger de ±” indique jusqu’où MeliApp peut déplacer cet élément autour de son horaire. Le rendez-vous Outlook d’origine n’est pas déplacé tant que tu n’acceptes pas une proposition de planning." }),
    node("div", { className: "row inspector-actions" }, [
      node("button", { type: "button", "data-action": "item-inspector.close", text: "Annuler" }),
      node("button", { type: "button", className: "primary", "data-action": "item-inspector.save-event", "data-key": key, text: "Enregistrer" })
    ])
  ]);
};

export const renderItemInspectorModal = (state) => {
  const current = featureState(state, "itemInspector", { open: false });
  if (!current.open) return null;
  const content = current.type === "task" ? taskForm(state, findTask(state, current.id)) : eventForm(state, findEvent(state, current.key));
  if (!content) return null;
  return node("div", { className: "inspector-backdrop", role: "presentation", "data-action": "item-inspector.backdrop" }, [
    node("dialog", { className: "item-inspector", open: true, "aria-modal": "true" }, [content])
  ]);
};

export const itemInspectorFeatures = {
  itemInspector: {
    description: "Popup de précision des tâches et événements",
    state: { open: false, type: null, id: null, key: null },
    when: ["item-inspector:open", "item-inspector:close", "item-inspector:save-task", "item-inspector:save-event"],
    run: ({ state, event, payload }) => {
      if (event === "item-inspector:open") return setFeatureState(state, "itemInspector", { open: true, type: payload?.type, id: payload?.id ?? null, key: payload?.key ?? null });
      if (event === "item-inspector:close") return setFeatureState(state, "itemInspector", { open: false, type: null, id: null, key: null });
      if (event === "item-inspector:save-task") {
        const tasks = featureState(state, "tasks", { items: [] });
        const next = setFeatureState(state, "tasks", {
          ...tasks,
          items: (tasks.items ?? []).map((task) => String(task.id) === String(payload?.id) ? {
            ...task,
            title: String(payload.title ?? task.title).trim() || task.title,
            deadline: payload.deadline || null,
            estimateMinutes: Math.max(5, Number(payload.estimateMinutes) || 25),
            difficulty: clamp(payload.difficulty, 1, 5, 3),
            importance: clamp(payload.importance, 1, 5, 3),
            context: ["cours", "perso"].includes(payload.context) ? payload.context : task.context,
            scheduleMode: normalizePlacement(payload.scheduleMode),
            flexRangeMinutes: parseYmDhmsDuration(payload.flexRangeDuration, task.flexRangeMinutes ?? 120),
            updatedAt: new Date().toISOString()
          } : task)
        });
        return setFeatureState(next, "itemInspector", { open: false, type: null, id: null, key: null });
      }
      if (event === "item-inspector:save-event") {
        const next = setFeatureState(state, "calendarSources", (sources) => ({
          ...sources,
          roles: { ...(sources.roles ?? {}), [payload.key]: ["tasks", "appointments", "both"].includes(payload.role) ? payload.role : "both" },
          itemPlacements: { ...(sources.itemPlacements ?? {}), [payload.key]: normalizePlacement(payload.placement) },
          itemRanges: { ...(sources.itemRanges ?? {}), [payload.key]: parseYmDhmsDuration(payload.rangeDuration, sources.itemRanges?.[payload.key] ?? 120) }
        }), {});
        return setFeatureState(next, "itemInspector", { open: false, type: null, id: null, key: null });
      }
      return state;
    },
    ui: {
      actions: {
        "item-inspector.open-task": ({ target, dispatch }) => dispatch("item-inspector:open", { type: "task", id: target.dataset.id }),
        "item-inspector.open-event": ({ target, dispatch }) => dispatch("item-inspector:open", { type: "event", key: target.dataset.key }),
        "item-inspector.close": ({ dispatch }) => dispatch("item-inspector:close"),
        "item-inspector.backdrop": ({ event, target, dispatch }) => event.target === target ? dispatch("item-inspector:close") : undefined,
        "item-inspector.save-task": ({ target, dispatch }) => dispatch("item-inspector:save-task", {
          id: target.dataset.id,
          title: formValue(target, "title"), deadline: formValue(target, "deadline"), estimateMinutes: formValue(target, "estimateMinutes"),
          difficulty: formValue(target, "difficulty"), importance: formValue(target, "importance"), context: formValue(target, "context"),
          scheduleMode: formValue(target, "scheduleMode"), flexRangeDuration: formValue(target, "flexRangeDuration")
        }),
        "item-inspector.save-event": ({ target, dispatch }) => dispatch("item-inspector:save-event", {
          key: target.dataset.key, role: formValue(target, "role"), placement: formValue(target, "placement"), rangeDuration: formValue(target, "rangeDuration")
        })
      }
    }
  }
};
