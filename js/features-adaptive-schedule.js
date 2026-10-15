import { buildAdaptiveDayPlan, taskContext } from "./domain/adaptive-planning.js";

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

const computePlan = (state) => {
  const now = new Date();
  const settings = featureState(state, "settings", {});
  return buildAdaptiveDayPlan({
    tasks: tasks(state),
    events: state.calendar?.events ?? [],
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
  return node("article", { className: "list-item stack compact adaptive-plan-block" }, [
    node("div", { className: "row row--between" }, [
      node("strong", { text: `${blockIcon(block)} ${block.title}` }),
      node("span", { className: "task-count", text: `${block.minutes} min` })
    ]),
    node("small", { className: "muted", text: meta.join(" · ") }),
    block.reason ? node("small", { className: "muted", text: block.reason }) : null
  ]);
};

const render = ({ state }) => {
  const current = featureState(state, "adaptiveSchedule", {});
  const plan = current.blocks?.length || current.generatedAt ? current : computePlan(state);
  const policy = plan.policy ?? {};
  const root = node("div", { className: "stack adaptive-plan" });

  root.append(
    node("div", { className: "row row--between" }, [
      node("div", { className: "stack compact" }, [
        node("h2", { text: "Planning intelligent" }),
        node("p", { className: "muted", text: "Agenda fixe + deadlines + tâches cours/perso + pauses adaptées à ton énergie." })
      ]),
      button("Recalculer", "adaptive-plan.refresh", { className: "primary" })
    ]),
    node("aside", { className: "hint" }, [
      node("strong", { text: `⚡ Énergie ${policy.level ?? energy(state)}/10` }),
      node("span", { text: ` · blocs d’environ ${policy.workMinutes ?? "?"} min · pauses ${policy.breakMinutes ?? "?"} min` })
    ])
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
        "adaptive-plan.refresh": ({ dispatch }) => dispatch("adaptive-plan:refresh")
      }
    }
  }
};
