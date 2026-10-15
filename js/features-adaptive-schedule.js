import { categoryPresentation } from "./domain/outlook-categories.js";
import { buildAdaptiveDayPlan, taskContext } from "./domain/adaptive-planning.js";
import { calendarEventToPlanningTask, splitCalendarEvents } from "./domain/calendar-classification.js";

const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;
const setFeatureState = (state, name, next) => ({
  ...state,
  features: {
    ...(state.features ?? {}),
    [name]: typeof next === "function" ? next(featureState(state, name, fallback)) : next
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

const button = (label, action, attrs = {}) => node("button", { type: "button", "data-action": action, ...attrs, text: label });
const tasks = (state) => featureState(state, "tasks", { items: [] }).items ?? [];
const energy = (state) => Number(featureState(state, "energy", { value: 5 }).value ?? 5);

const dayEnd = (state, now = new Date()) => {
  const raw = featureState(state, "settings", {}).dayEnd ?? "23:00";
  const [hours, minutes] = String(raw).split(":").map(Number);
  const end = new Date(now);
  end.setHours(Number.isFinite(hours) ? hours : 23, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  if (end <= now) end.setTime(now.getTime() + 60 * 60 * 1000);
  return end;
};

const planningInputs = (state) => {
  const explicitTasks = tasks(state);
  const roles = featureState(state, "calendarSources", { roles: {} }).roles ?? {};
  const { appointments, taskEvents } = splitCalendarEvents(state.calendar?.events ?? [], roles);
  const importedEventIds = new Set(explicitTasks.map((task) => task.sourceEventId).filter(Boolean).map(String));
  const inferredTasks = taskEvents
    .filter((event) => !importedEventIds.has(String(event.id)))
    .map(calendarEventToPlanningTask);
  return { tasks: [...explicitTasks, ...inferredTasks], events: appointments };
};

const computePlan = (state) => {
  const now = new Date();
  const settings = featureState(state, "settings", {});
  const inputs = planningInputs(state);
  return buildAdaptiveDayPlan({
    tasks: inputs.tasks,
    events: inputs.events,
    energy: energy(state),
    from: now,
    to: dayEnd(state, now),
    bufferMinutes: Number(settings.calendarBufferMinutes ?? state.settings?.calendarBufferMinutes ?? 10)
  });
};

const formatTime = (value) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const formatDeadline = (value) => value
  ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : null;

const blockIcon = (block) => block.type === "event" ? "🗓️" : block.type === "break" ? "☕" : block.context === "cours" ? "📚" : "🏠";

const blockRow = (block) => {
  const meta = [`${formatTime(block.startIso)}–${formatTime(block.endIso)}`, `${block.minutes} min`];
  if (block.deadline) meta.push(`deadline ${formatDeadline(block.deadline)}`);
  const category = categoryPresentation(block);
  return node("article", { className: `list-item stack compact adaptive-plan-block${category.style ? " has-outlook-category" : ""}`, style: category.style }, [
    node("div", { className: "row row--between" }, [
      node("strong", { text: `${blockIcon(block)} ${block.title}` }),
      node("span", { className: "task-count", text: `${block.minutes} min` })
    ]),
    node("small", { className: "muted", text: meta.join(" · ") }),
    category.label ? node("span", { className: `outlook-category-tag${category.style ? " has-category" : ""}`, text: category.label }) : null,
    block.reason ? node("small", { className: "muted", text: block.reason }) : null
  ]);
};

const classifier = (state) => {
  const active = tasks(state).filter((task) => task.status !== "completed" && !task.parentTaskId);
  const root = node("section", { className: "stack compact" }, [
    node("div", { className: "row row--between" }, [
      node("h3", { text: "Cours ou perso" }),
      node("span", { className: "task-count", text: String(active.length) })
    ]),
    node("p", { className: "muted", text: "Classe chaque tâche pour que le planning équilibre les obligations de cours et le perso au lieu de tout mélanger dans une soupe de deadlines." })
  ]);

  for (const task of active.slice(0, 12)) {
    const context = taskContext(task);
    const explicit = Boolean(task.context || task.kind || task.category);
    root.append(node("div", { className: "list-item row row--between" }, [
      node("div", { className: "stack compact" }, [
        node("strong", { text: task.title }),
        node("small", { className: "muted", text: `${task.deadline ? `Échéance ${formatDeadline(task.deadline)}` : "Sans échéance"}${explicit ? "" : " · classée automatiquement"}` })
      ]),
      node("div", { className: "row" }, [
        button("📚 Cours", "adaptive-plan.context", { "data-id": task.id, "data-context": "cours", className: context === "cours" ? "primary" : "secondary" }),
        button("🏠 Perso", "adaptive-plan.context", { "data-id": task.id, "data-context": "perso", className: context === "perso" ? "primary" : "secondary" })
      ])
    ]));
  }
  return root;
};

const render = ({ state }) => {
  const current = featureState(state, "adaptiveSchedule", {});
  const plan = current.blocks?.length || current.generatedAt ? current : computePlan(state);
  const policy = plan.policy ?? {};
  const roles = featureState(state, "calendarSources", { roles: {} }).roles ?? {};
  const split = splitCalendarEvents(state.calendar?.events ?? [], roles);
  const root = node("div", { className: "stack adaptive-plan" });

  root.append(
    node("div", { className: "row row--between" }, [
      node("div", { className: "stack compact" }, [
        node("h2", { text: "Planning intelligent" }),
        node("p", { className: "muted", text: "Rendez-vous fixes + deadlines + tâches agenda/cours/perso + pauses adaptées à ton énergie." })
      ]),
      button("Recalculer", "adaptive-plan.refresh", { className: "primary" })
    ]),
    node("aside", { className: "hint" }, [
      node("strong", { text: `⚡ Énergie ${policy.level ?? energy(state)}/10` }),
      node("span", { text: ` · ${split.appointments.length} rendez-vous · ${split.taskEvents.length} tâches détectées · blocs ~${policy.workMinutes ?? "?"} min · pauses ${policy.breakMinutes ?? "?"} min` })
    ]),
    classifier(state)
  );

  if (!plan.blocks?.length) {
    root.append(node("div", { className: "list-item stack compact" }, [
      node("strong", { text: "Aucun bloc à planifier pour le reste de la journée." }),
      node("span", { className: "muted", text: "Ajoute une tâche avec une échéance ou synchronise l’agenda." })
    ]));
  } else {
    for (const block of plan.blocks) root.append(blockRow(block));
  }

  if (plan.unscheduled?.length) {
    const section = node("section", { className: "stack compact" }, [
      node("h3", { text: `À reporter ou découper (${plan.unscheduled.length})` }),
      node("p", { className: "muted", text: "Ces tâches ne rentrent pas raisonnablement dans les créneaux restants sans supprimer les pauses ou la marge de sécurité." })
    ]);
    for (const task of plan.unscheduled.slice(0, 6)) {
      section.append(node("div", { className: "row row--between list-item" }, [
        node("span", { text: `${taskContext(task) === "cours" ? "📚" : "🏠"} ${task.title}` }),
        node("small", { className: "muted", text: `${task.remainingMinutes} min restantes${task.deadline ? ` · ${formatDeadline(task.deadline)}` : ""}` })
      ]));
    }
    root.append(section);
  }

  return root;
};

const EVENTS = [
  "app:start",
  "app:resume",
  "adaptive-plan:refresh",
  "energy:set",
  "sync:manual",
  "calendar:synced",
  "calendar:source-role",
  "task:created",
  "task:updated",
  "task:deleted",
  "task:completed",
  "task:deferred",
  "calendar:task-import"
];

export const adaptiveScheduleFeatures = {
  adaptiveSchedule: {
    description: "Planning adaptatif deadlines · énergie · pauses",
    state: { blocks: [], unscheduled: [], policy: null, generatedAt: null },
    when: EVENTS,
    run: ({ state }) => setFeatureState(state, "adaptiveSchedule", computePlan(state)),
    ui: {
      order: 5,
      render,
      actions: {
        "adaptive-plan.refresh": ({ dispatch }) => dispatch("adaptive-plan:refresh"),
        "adaptive-plan.context": ({ target, dispatch }) => dispatch("task:updated", { id: target.dataset.id, context: target.dataset.context })
      }
    }
  }
};
