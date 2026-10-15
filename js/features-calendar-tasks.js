import { features as baseFeatures } from "./features.js";

const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;
const setFeatureState = (state, name, next) => ({
  ...state,
  features: {
    ...(state.features ?? {}),
    [name]: typeof next === "function" ? next(featureState(state, name)) : next
  }
});

const node = (tag, attrs = {}, children = []) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "className") element.className = value;
    else if (key === "text") element.textContent = String(value);
    else element.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of (Array.isArray(children) ? children : [children])) {
    if (child === undefined || child === null || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
};

const button = (label, action, attrs = {}) =>
  node("button", { type: "button", "data-action": action, ...attrs, text: label });

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

export const outlookTaskId = (eventId) => `outlook_${encodeURIComponent(String(eventId ?? ""))}`;

export const calendarEventToTask = (event) => {
  const start = new Date(event?.start);
  const end = new Date(event?.end);
  const duration = Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
    ? 25
    : Math.max(5, Math.min(480, Math.round((end.getTime() - start.getTime()) / 60000)));

  return {
    id: outlookTaskId(event?.id),
    title: String(event?.title ?? event?.subject ?? "Événement Outlook").trim(),
    deadline: event?.start ?? null,
    estimateMinutes: duration,
    difficulty: 2,
    importance: 3,
    progress: 0,
    splittable: true,
    minimumChunkMinutes: Math.min(15, duration),
    preferredEnergyMin: 2,
    status: "active",
    source: "outlook",
    sourceEventId: event?.id ?? null,
    sourceWebLink: event?.webLink ?? null,
    sourceLocation: event?.location ?? "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
};

const isImported = (state, event) => {
  const id = outlookTaskId(event?.id);
  return (featureState(state, "tasks", { items: [] }).items ?? []).some((task) => task.id === id);
};

const eventCard = (state, event) => {
  const imported = isImported(state, event);
  const details = [
    `${formatDateTime(event.start)} → ${formatDateTime(event.end)}`,
    event.location || null
  ].filter(Boolean).join(" · ");

  return node("article", { className: "list-item stack compact" }, [
    node("div", { className: "row row--between" }, [
      node("div", { className: "stack compact" }, [
        node("strong", { text: event.title ?? event.subject ?? "Événement" }),
        node("small", { className: "muted", text: details })
      ]),
      button(imported ? "Ajoutée aux tâches" : "Ajouter aux tâches", "calendar.import-task", {
        className: imported ? "secondary" : "primary",
        "data-event-id": event.id,
        disabled: imported ? true : null
      })
    ])
  ]);
};

const renderCalendar = ({ state }) => {
  const events = state.calendar?.events ?? [];
  const root = node("div", { className: "stack" });
  root.append(
    node("div", { className: "row row--between" }, [
      node("div", { className: "stack compact" }, [
        node("strong", { text: "Agenda Outlook" }),
        node("small", { className: "muted", text: "Un événement utile peut devenir une tâche en un clic, sans le recopier." })
      ]),
      button("Synchroniser", "calendar.sync", { className: "primary" })
    ])
  );

  if (!events.length) {
    root.append(node("p", { className: "muted", text: "Aucun événement Outlook en cache." }));
    return root;
  }

  for (const event of events) root.append(eventCard(state, event));
  return root;
};

export const calendarTaskFeatures = {
  calendarView: {
    ...baseFeatures.calendarView,
    description: "Agenda Outlook et import vers les tâches",
    ui: {
      ...(baseFeatures.calendarView.ui ?? {}),
      render: renderCalendar,
      actions: {
        ...(baseFeatures.calendarView.ui?.actions ?? {}),
        "calendar.import-task": ({ target, dispatch }) =>
          dispatch("calendar:task-import", { eventId: target.dataset.eventId })
      }
    }
  },

  calendarTaskImport: {
    description: "Créer une tâche depuis un événement Outlook",
    page: false,
    category: false,
    when: ["calendar:task-import"],
    run: ({ state, payload }) => {
      const event = (state.calendar?.events ?? []).find((item) => String(item.id) === String(payload?.eventId));
      if (!event || isImported(state, event)) return state;
      const task = calendarEventToTask(event);
      const current = featureState(state, "tasks", { items: [] });
      return setFeatureState(state, "tasks", {
        ...current,
        items: [...(current.items ?? []), task]
      });
    }
  }
};
