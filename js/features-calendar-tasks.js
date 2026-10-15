import { outlookTaskMetadata, linkedProjects } from "./domain/project-outlook.js";
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

export const outlookTaskId = (eventId) => `outlook_${encodeURIComponent(String(eventId ?? ""))}`;

export const calendarEventToTask = (event, overrides = {}) => {
  const start = new Date(event?.start);
  const end = new Date(event?.end);
  const duration = Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
    ? 25
    : Math.max(5, Math.min(480, Math.round((end.getTime() - start.getTime()) / 60000)));
  const hasDeadlineOverride = Object.prototype.hasOwnProperty.call(overrides, "deadline");

  return {
    id: outlookTaskId(event?.id),
    title: String(event?.title ?? event?.subject ?? "Événement Outlook").trim(),
    deadline: hasDeadlineOverride ? (overrides.deadline || null) : (event?.start ?? null),
    estimateMinutes: duration,
    difficulty: 2,
    importance: 3,
    progress: 0,
    splittable: true,
    minimumChunkMinutes: Math.min(15, duration),
    preferredEnergyMin: 2,
    status: "active",
    source: "outlook",
    ...outlookTaskMetadata(event),
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

export const calendarTaskFeatures = {
  calendarView: {
    ...baseFeatures.calendarView,
    description: "Agenda Outlook et import vers les tâches",
    ui: {
      ...(baseFeatures.calendarView.ui ?? {}),
      render: (context) => baseFeatures.calendarView.ui.render({
        ...context,
        renderEventActions: (event) => {
          const imported = isImported(context.state, event);
          return node("div", { className: "stack compact" }, [
            ...linkedProjects(context.state, event).map((project) => node("span", { className: "task-chip", text: `Projet · ${project.title}` })),
            button(imported ? "Ajoutée aux tâches" : "Ajouter aux tâches", "calendar.import-task", {
              className: imported ? "secondary" : "primary",
              "data-event-id": event.id,
              disabled: imported ? true : null
            })
          ]);
        }
      }),
      actions: {
        ...(baseFeatures.calendarView.ui?.actions ?? {}),
        "calendar.import-task": ({ target, dispatch }) => {
          const deadlineInput = target.closest("form")?.elements?.namedItem("taskDeadline");
          return dispatch("calendar:task-import", {
            eventId: target.dataset.eventId,
            ...(deadlineInput ? { deadline: deadlineInput.value } : {})
          });
        }
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
      const options = Object.prototype.hasOwnProperty.call(payload ?? {}, "deadline") ? { deadline: payload.deadline } : {};
      const task = calendarEventToTask(event, options);
      const current = featureState(state, "tasks", { items: [] });
      return setFeatureState(state, "tasks", {
        ...current,
        items: [...(current.items ?? []), task]
      });
    }
  }
};
