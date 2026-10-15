import { buildAdaptiveDayPlan, taskContext } from "./domain/adaptive-planning.js";
import { buildAdaptiveWeekPlan } from "./domain/weekly-planning.js";
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
    else if (key === "disabled") element.disabled = Boolean(value);
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

const computeWeek = (state, variant = 0) => {
  const settings = featureState(state, "settings", {});
  const inputs = planningInputs(state);
  return {
    ...buildAdaptiveWeekPlan({
      tasks: inputs.tasks,
      events: inputs.events,
      energy: energy(state),
      from: Date.now(),
      days: 7,
      dayStart: settings.dayStart ?? "08:00",
      dayEnd: settings.dayEnd ?? "23:00",
      bufferMinutes: Number(settings.calendarBufferMinutes ?? state.settings?.calendarBufferMinutes ?? 10),
      variant
    }),
    mergeStatus: "idle",
    mergeError: null,
    mergedAt: null
  };
};

const formatTime = (value) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const formatDay = (value) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "short" }).format(new Date(value));
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

const weeklyProposal = (state, weekly) => {
  const root = node("section", { className: "stack" });
  const publishable = (weekly.blocks ?? []).filter((block) => block.type === "task" || block.type === "break");
  const focusMinutes = publishable.filter((block) => block.type === "task").reduce((sum, block) => sum + Number(block.minutes ?? 0), 0);
  const pauseMinutes = publishable.filter((block) => block.type === "break").reduce((sum, block) => sum + Number(block.minutes ?? 0), 0);
  const connected = Boolean(state.auth?.microsoft?.connected);
  const merging = weekly.mergeStatus === "merging";
  const merged = weekly.mergeStatus === "done";

  root.append(
    node("div", { className: "row row--between" }, [
      node("div", { className: "stack compact" }, [
        node("h2", { text: "Proposition pour les 7 prochains jours" }),
        node("p", { className: "muted", text: `Version ${Number(weekly.variant ?? 0) + 1} · ${Math.round(focusMinutes / 60 * 10) / 10} h de focus · ${pauseMinutes} min de pauses.` })
      ]),
      node("div", { className: "row" }, [
        button("🎲 Reroll", "adaptive-week.reroll", { className: "secondary", disabled: merging }),
        button(merged ? "✓ Ajouté à Outlook" : merging ? "Ajout en cours…" : "Fusionner dans Outlook", "adaptive-week.merge", {
          className: "primary",
          disabled: merging || merged || !connected || publishable.length === 0
        })
      ])
    ]),
    node("p", { className: "hint", text: "Le reroll change l’ordre des tâches de priorité proche sans sacrifier les deadlines urgentes. La fusion ajoute seulement les blocs de travail et les pauses, jamais les rendez-vous déjà présents." })
  );

  if (!connected) root.append(node("p", { className: "connection-message", text: "Connecte Outlook pour fusionner cette proposition dans ton agenda." }));
  if (weekly.mergeError) root.append(node("p", { className: "error", text: weekly.mergeError }));
  if (merged) root.append(node("p", { className: "connection-message", text: `Proposition ajoutée à Outlook${weekly.mergedAt ? ` · ${formatDeadline(weekly.mergedAt)}` : ""}.` }));

  for (const day of weekly.dayPlans ?? []) {
    const visible = (day.blocks ?? []).filter((block) => block.type !== "event");
    if (!visible.length) continue;
    const section = node("details", { className: "list-item stack compact" }, [
      node("summary", {}, [node("strong", { text: formatDay(day.date) }), node("span", { className: "task-count", text: `${visible.length} blocs` })])
    ]);
    for (const block of visible) section.append(blockRow(block));
    root.append(section);
  }

  if (weekly.unscheduled?.length) root.append(node("p", { className: "muted", text: `${weekly.unscheduled.length} tâche(s) ne rentrent pas encore dans la semaine. Elles restent visibles comme à reporter ou découper.` }));
  return root;
};

const render = ({ state }) => {
  const current = featureState(state, "adaptiveSchedule", {});
  const plan = current.blocks?.length || current.generatedAt ? current : computePlan(state);
  const weekly = current.weekly?.generatedAt ? current.weekly : computeWeek(state, 0);
  const policy = plan.policy ?? {};
  const roles = featureState(state, "calendarSources", { roles: {} }).roles ?? {};
  const split = splitCalendarEvents(state.calendar?.events ?? [], roles);
  const root = node("div", { className: "stack adaptive-plan" });

  root.append(
    weeklyProposal(state, weekly),
    node("hr"),
    node("div", { className: "row row--between" }, [
      node("div", { className: "stack compact" }, [
        node("h2", { text: "Planning intelligent du jour" }),
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
  "adaptive-week:reroll",
  "adaptive-week:merge",
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
    description: "Planning adaptatif jour/semaine · reroll · fusion Outlook",
    state: { blocks: [], unscheduled: [], policy: null, generatedAt: null, weekly: null },
    when: EVENTS,
    run: async ({ state, event, services }) => {
      const current = featureState(state, "adaptiveSchedule", {});
      if (event === "adaptive-week:merge") {
        const weekly = current.weekly?.generatedAt ? current.weekly : computeWeek(state, 0);
        if (!services.outlook?.isConnected?.() || typeof services.outlook?.createPlanningBlocks !== "function") {
          return setFeatureState(state, "adaptiveSchedule", { ...current, weekly: { ...weekly, mergeStatus: "error", mergeError: "Outlook doit être connecté pour fusionner la proposition." } });
        }
        const publishable = (weekly.blocks ?? []).filter((block) => block.type === "task" || block.type === "break");
        try {
          const mergingState = { ...weekly, mergeStatus: "merging", mergeError: null };
          await services.outlook.createPlanningBlocks(publishable);
          return setFeatureState(state, "adaptiveSchedule", {
            ...current,
            weekly: { ...mergingState, mergeStatus: "done", mergedAt: new Date().toISOString() }
          });
        } catch (error) {
          return setFeatureState(state, "adaptiveSchedule", {
            ...current,
            weekly: { ...weekly, mergeStatus: "error", mergeError: error instanceof Error ? error.message : String(error) }
          });
        }
      }

      const variant = event === "adaptive-week:reroll"
        ? Number(current.weekly?.variant ?? 0) + 1
        : Number(current.weekly?.variant ?? 0);
      return setFeatureState(state, "adaptiveSchedule", { ...computePlan(state), weekly: computeWeek(state, variant) });
    },
    ui: {
      order: 5,
      render,
      actions: {
        "adaptive-plan.refresh": ({ dispatch }) => dispatch("adaptive-plan:refresh"),
        "adaptive-week.reroll": ({ dispatch }) => dispatch("adaptive-week:reroll"),
        "adaptive-week.merge": ({ dispatch }) => dispatch("adaptive-week:merge"),
        "adaptive-plan.context": ({ target, dispatch }) => dispatch("task:updated", { id: target.dataset.id, context: target.dataset.context })
      }
    }
  }
};
