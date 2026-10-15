import { sessionOptions } from "./domain/session-preferences.js";
import { planningInputs } from "./domain/planning-inputs.js";
import { exclusionReason } from "./domain/planning-eligibility.js";
import { categoryPresentation } from "./domain/outlook-categories.js";
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
  return end;
};

const computePlan = (state) => {
  const now = new Date();
  const settings = featureState(state, "settings", {});
  const inputs = planningInputs(state, now.getTime());
  const [startHour, startMinute] = String(settings.dayStart ?? "08:00").split(":").map(Number);
  const start = new Date(now); start.setHours(startHour || 0, startMinute || 0, 0, 0);
  return { ...buildAdaptiveDayPlan({
    tasks: inputs.tasks,
    events: inputs.events,
    energy: energy(state),
    sessionPreferences: sessionOptions(state),
    from: new Date(Math.max(now.getTime(), start.getTime())),
    to: dayEnd(state, now),
    bufferMinutes: Number(settings.calendarBufferMinutes ?? state.settings?.calendarBufferMinutes ?? 10)
  }), excluded: inputs.excluded };
};

const computeWeek = (state, variant = 0) => {
  const settings = featureState(state, "settings", {});
  const inputs = planningInputs(state);
  return {
    ...buildAdaptiveWeekPlan({
      tasks: inputs.tasks,
      events: inputs.events,
      energy: energy(state),
    sessionPreferences: sessionOptions(state),
      from: Date.now(),
      days: 7,
      dayStart: settings.dayStart ?? "08:00",
      dayEnd: settings.dayEnd ?? "23:00",
      bufferMinutes: Number(settings.calendarBufferMinutes ?? state.settings?.calendarBufferMinutes ?? 10),
      variant
    }),
    excluded: inputs.excluded,
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
  const active = tasks(state).filter(task => !exclusionReason(task, Date.now()) && !task.parentTaskId);
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
  const inputs = planningInputs(state);
  const split = splitCalendarEvents(inputs.events, roles);
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
      node("span", { text: ` · ${split.appointments.length} rendez-vous · ${inputs.tasks.length} tâches à venir · blocs ~${policy.workMinutes ?? "?"} min · pauses ${policy.breakMinutes ?? "?"} min` })
    ]),
    classifier(state),
    node("p", { className: "muted", text: "Les tâches terminées et les échéances passées sont ignorées. Les rendez-vous existants restent réservés ; seules les tâches sont proposées dans leurs créneaux autorisés." })
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
        if (weekly.mergeStatus === "done") return state;
        if (!services.outlook?.isConnected?.() || typeof services.outlook?.createPlanningBlocks !== "function") {
          return setFeatureState(state, "adaptiveSchedule", { ...current, weekly: { ...weekly, mergeStatus: "error", mergeError: "Outlook doit être connecté pour fusionner la proposition." } });
        }
        const now = Date.now();
        const eligible = new Set(planningInputs(state, now).tasks.map(task => task.id));
        for (const task of tasks(state)) if (!exclusionReason(task, now) && task.scheduleMode === "fixed") eligible.add(task.id);
        const work = (weekly.blocks ?? []).filter(block => block.type === "task" && eligible.has(block.taskId) && new Date(block.startIso).getTime() >= now);
        const publishable = (weekly.blocks ?? []).filter(block => work.includes(block) || block.type === "break" && new Date(block.startIso).getTime() >= now && work.some(task => task.end <= block.start && formatDay(task.startIso) === formatDay(block.startIso)));
        let latestState = state;
        try {
          if (!work.length) throw new Error("Aucun créneau de travail futur à ajouter. Recalcule la proposition.");
          if (services.outlook.listEvents) {
            const calendarIds = state.features?.calendarView?.selectedCalendarIds ?? state.calendar?.calendars?.map(calendar => calendar.id);
            const events = await services.outlook.listEvents({ from: new Date(now).toISOString(), to: new Date(Math.max(...publishable.map(block => new Date(block.endIso).getTime()))).toISOString(), ...(calendarIds ? { calendarIds } : {}) });
            latestState = { ...state, calendar: { ...state.calendar, events } };
            const freshInputs = planningInputs(latestState, now);
            const reservations = freshInputs.events;
            const budgets = new Map(freshInputs.tasks.map(task => [task.id, Number(task.estimateMinutes ?? 25) * (1 - Number(task.progress ?? 0))]));
            for (const task of tasks(state)) if (task.scheduleMode === "fixed" && !exclusionReason(task, now) && !freshInputs.excluded.some(item => item.id === task.id && item.reason === "scheduled")) budgets.set(task.id, Number(task.estimateMinutes ?? 25) * (1 - Number(task.progress ?? 0)));
            const used = new Map();
            for (const block of work) {
              const alreadyExists = events.some(event => event.isPlanningBlock && new Date(event.start).getTime() === block.start && new Date(event.end).getTime() === block.end && event.planningTaskId === block.taskId);
              if (!alreadyExists) used.set(block.taskId, (used.get(block.taskId) ?? 0) + block.minutes);
            }
            for (const [id, minutes] of used) if (minutes > (budgets.get(id) ?? 0) + .01) throw new Error("Du travail a déjà été planifié ou terminé pour cette tâche. Recalcule pour éviter les doublons.");
            const buffer = Number(featureState(state, "settings", {}).calendarBufferMinutes ?? state.settings?.calendarBufferMinutes ?? 10) * 60000;
            for (const block of publishable) {
              const start = new Date(block.startIso).getTime(), end = new Date(block.endIso).getTime();
              const conflict = reservations.some(event => {
                if (event.sourceTaskId === block.taskId && block.taskId) return false;
                const eventStart = new Date(event.start).getTime(), eventEnd = new Date(event.end).getTime();
                const belongsToProposal = event.isPlanningBlock && publishable.some(candidate => eventStart === candidate.start && eventEnd === candidate.end && (candidate.taskId && event.planningTaskId === candidate.taskId || event.title === `${candidate.type === "break" ? "☕" : "🎯"} ${candidate.title}`));
                return !belongsToProposal && start < eventEnd + buffer && end > eventStart - buffer;
              });
              if (conflict) throw new Error("Ton agenda a changé : un rendez-vous occupe un créneau proposé. Recalcule avant de fusionner.");
            }
          }
          const created = await services.outlook.createPlanningBlocks(publishable);
          if (Array.isArray(created)) {
            if (created.length !== publishable.length) { const error = new Error("Certains créneaux ont commencé pendant l’ajout. Recalcule la suite."); error.publishedCount = created.length; throw error; }
            const posted = publishable.map((block, index) => ({ id: created[index]?.id ?? `published:${block.startIso}:${index}`, title: `${block.type === "break" ? "☕" : "🎯"} ${block.title}`, start: block.startIso, end: block.endIso, isPlanningBlock: true, planningTaskId: block.taskId ?? null, showAs: block.type === "break" ? "free" : "busy" }));
            latestState = { ...latestState, calendar: { ...latestState.calendar, events: [...latestState.calendar.events, ...posted] } };
          }
          return setFeatureState(latestState, "adaptiveSchedule", {
            ...current,
            weekly: { ...weekly, mergeStatus: "done", mergeError: null, mergedAt: new Date().toISOString() }
          });
        } catch (error) {
          return setFeatureState(latestState, "adaptiveSchedule", {
            ...current,
            weekly: { ...weekly, mergeStatus: "error", mergeError: `${error instanceof Error ? error.message : String(error)}${error.publishedCount ? ` · ${error.publishedCount} bloc(s) déjà ajouté(s). Réessayer reprend sans doublon.` : ""}` }
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
        "adaptive-week.merge": ({ target, dispatch }) => { if (target) { target.disabled = true; target.textContent = "Ajout en cours…"; } return dispatch("adaptive-week:merge"); },
        "adaptive-plan.context": ({ target, dispatch }) => dispatch("task:updated", { id: target.dataset.id, context: target.dataset.context })
      }
    }
  }
};
