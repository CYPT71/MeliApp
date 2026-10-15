import { blockersFor, isTaskBlocked } from "./domain/task-links.js";
import { categoryPresentation } from "./domain/outlook-categories.js";
import { linkedProjects } from "./domain/project-outlook.js";
import { features as baseFeatures } from "./features.js";
import { advancedFeatures } from "./features-advanced.js";
import { addXp } from "./domain/xp.js";
import {
  EISENHOWER_QUADRANTS,
  eisenhowerQuadrant,
  groupTasksByEisenhower,
  normalizeImportance
} from "./domain/eisenhower.js";

const MANUAL_SPLIT_XP = 8;
const MAX_REWARDED_MANUAL_SPLITS = 5;
const VIEWS = new Set(["today", "list", "matrix", "projects"]);

const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;
const setFeatureState = (state, name, value) => ({
  ...state,
  features: {
    ...(state.features ?? {}),
    [name]: typeof value === "function" ? value(featureState(state, name, fallback)) : value
  }
});
const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const asNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = String(value ?? "");
    else if (key === "checked") node.checked = Boolean(value);
    else if (key === "selected") node.selected = Boolean(value);
    else if (key === "value") node.value = value;
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

const formValue = (target, name) => target.closest("form")?.elements?.namedItem(name)?.value ?? "";
const formChecked = (target, name) => Boolean(target.closest("form")?.elements?.namedItem(name)?.checked);
const taskItems = (state) => featureState(state, "tasks", { items: [] }).items ?? [];
const projectItems = (state) => featureState(state, "projects", { items: [] }).items ?? [];
const workspaceView = (state) => {
  const view = featureState(state, "taskWorkspace", {}).view;
  return VIEWS.has(view) ? view : "today";
};
const activeTasks = (state) => taskItems(state).filter((task) => task.status !== "completed");
const parentTasks = (state) => activeTasks(state).filter((task) => !task.parentTaskId);

const projectName = (state, id) => projectItems(state).find((project) => project.id === id)?.title ?? null;

const formatDeadline = (value, compact = false) => {
  if (!value) return "Sans échéance";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sans échéance";
  return new Intl.DateTimeFormat("fr-FR", compact
    ? { day: "2-digit", month: "short" }
    : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
  ).format(date);
};

const deadlineState = (task, now = Date.now()) => {
  if (!task.deadline) return { label: "Sans échéance", className: "" };
  const diff = new Date(task.deadline).getTime() - now;
  if (diff < 0) return { label: "En retard", className: "is-overdue" };
  if (diff <= 24 * 60 * 60 * 1000) return { label: "Aujourd’hui", className: "is-today" };
  if (diff <= 3 * 24 * 60 * 60 * 1000) return { label: "Bientôt", className: "is-soon" };
  return { label: formatDeadline(task.deadline, true), className: "" };
};

const importancePicker = (selected = 3) => {
  const labels = ["Faible", "Secondaire", "Normale", "Importante", "Critique"];
  const root = el("div", { className: "importance-picker", role: "radiogroup", "aria-label": "Importance" });
  for (let value = 1; value <= 5; value += 1) {
    root.append(el("label", { className: `importance-choice${value === Number(selected) ? " is-selected" : ""}` }, [
      el("input", { type: "radio", name: "importance", value, checked: value === Number(selected) }),
      el("span", { className: "importance-choice__value", text: String(value) }),
      el("span", { className: "importance-choice__label", text: labels[value - 1] })
    ]));
  }
  return root;
};

const selectProject = (state, selected = "") => {
  const select = el("select", { name: "projectId", "aria-label": "Projet" });
  select.append(el("option", { value: "", text: "Sans projet", selected: !selected }));
  for (const project of projectItems(state)) {
    select.append(el("option", { value: project.id, text: project.title, selected: project.id === selected }));
  }
  return el("label", { className: "field" }, [el("span", { text: "Projet" }), select]);
};

const compactTaskMeta = (state, task) => {
  const quadrant = eisenhowerQuadrant(task);
  const deadline = deadlineState(task);
  const project = linkedProjects(state, task).map((item) => item.title).join(" · ");
  const wrap = el("div", { className: "task-chips" });
  wrap.append(
    el("span", { className: `task-chip quadrant-${quadrant.id}`, text: `${quadrant.icon} ${quadrant.title}` }),
    el("span", { className: `task-chip ${deadline.className}`, text: deadline.label }),
    el("span", { className: "task-chip", text: `${task.estimateMinutes ?? 25} min` }),
    el("span", { className: "task-chip", text: `Imp. ${normalizeImportance(task.importance)}` })
  );
  for (const id of task.localCategoryIds ?? []) {
    const category = (state.features?.taskMindmap?.categories ?? []).find(item => item.id === id);
    if (category) wrap.append(el("span", { className: "task-chip", text: `# ${category.name}` }));
  }
  const category = categoryPresentation(task);
  if (category.label) wrap.append(el("span", { className: `outlook-category-tag${category.style ? " has-category" : ""}`, style: category.style, text: category.label }));
  if (project) wrap.append(el("span", { className: "task-chip", text: project }));
  return wrap;
};

const subtaskProgress = (state, parentId) => {
  const children = taskItems(state).filter((task) => task.parentTaskId === parentId);
  if (!children.length) return null;
  const done = children.filter((task) => task.status === "completed").length;
  return { done, total: children.length };
};

const taskEditForm = (state, task) => el("form", { className: "task-inline-edit stack", "data-submit-action": "tasks.edit-save" }, [
  el("label", { className: "field" }, [el("span", { text: "Titre" }), el("input", { name: "title", value: task.title })]),
  el("div", { className: "task-edit-grid" }, [
    el("label", { className: "field" }, [el("span", { text: "Durée" }), el("input", { name: "estimateMinutes", type: "number", min: 5, step: 5, value: task.estimateMinutes ?? 25 })]),
    el("label", { className: "field" }, [el("span", { text: "Échéance" }), el("input", { name: "deadline", type: "datetime-local", value: task.deadline ? String(task.deadline).slice(0, 16) : "" })]),
    selectProject(state, task.projectId ?? "")
  ]),
  el("div", { className: "stack compact" }, [el("span", { text: "Importance" }), importancePicker(task.importance)]),
  el("div", { className: "row" }, [
    button("Enregistrer", "tasks.edit-save", { className: "primary", type: "submit", "data-id": task.id }),
    button("Annuler", "tasks.edit-close")
  ])
]);

const taskCard = (state, task, { compact = false } = {}) => {
  const workspace = featureState(state, "taskWorkspace", {});
  const split = featureState(state, "taskDecomposition", {});
  const children = taskItems(state).filter((item) => item.parentTaskId === task.id);
  const activeChildren = children.filter((item) => item.status !== "completed");
  const progress = subtaskProgress(state, task.id);
  const editing = workspace.editingId === task.id;
  const expanded = workspace.expandedId === task.id || editing || split.manualFor === task.id;

  const category = categoryPresentation(task);
  const card = el("article", { className: `task-card${compact ? " is-compact" : ""}${category.style ? " has-outlook-category" : ""}`, style: category.style, "data-task-id": task.id });
  const complete = button("", "tasks.complete", {
    className: "task-check",
    "data-id": task.id,
    "aria-label": `Terminer ${task.title}`,
    title: "Terminer"
  });
  complete.append(el("span", { "aria-hidden": "true", text: "✓" }));

  const main = el("div", { className: "task-card__main" }, [
    el("div", { className: "task-card__title-row" }, [
      complete,
      button(task.title, "tasks.toggle-details", {
        className: "task-title-button",
        "data-id": task.id,
        "aria-expanded": expanded ? "true" : "false"
      })
    ]),
    compactTaskMeta(state, task)
  ]);
  const blockers = blockersFor(task, taskItems(state));
  if (blockers.length) {
    complete.disabled = true;
    main.append(el("small", { className: "task-blocked", text: `Bloquée par : ${blockers.map(item => item.title).join(", ")}` }));
  }
  card.append(main);
  if (task.status !== "completed") card.append(button("Pas à pas", "guide.start", { "data-id": task.id, className: "guide-launch", disabled: blockers.length > 0, "aria-label": `Commencer ${task.title} pas à pas` }));

  if (progress) {
    card.append(el("div", { className: "task-mini-progress" }, [
      el("progress", { max: progress.total, value: progress.done }),
      el("small", { className: "muted", text: `${progress.done}/${progress.total} étapes` })
    ]));
  }

  if (!expanded) return card;

  const details = el("div", { className: "task-card__details stack" });
  if (editing) {
    details.append(taskEditForm(state, task));
    card.append(details);
    return card;
  }

  details.append(el("div", { className: "task-secondary-actions" }, [
    button("Modifier", "tasks.edit-open", { "data-id": task.id }),
    button("Découper", "tasks.split-toggle", { "data-id": task.id }),
    button(split.aiLoadingFor === task.id ? "Découpage…" : "Aide-moi", "tasks.split-ai", { "data-id": task.id, disabled: split.aiLoadingFor === task.id }),
    button("Reporter", "tasks.defer", { "data-id": task.id }),
    button("Supprimer", "tasks.delete", { className: "danger-quiet", "data-id": task.id })
  ]));

  if (split.manualFor === task.id) {
    const rewarded = Number(split.rewardedByParent?.[task.id] ?? 0);
    details.append(el("form", { className: "split-form", "data-submit-action": "tasks.split-manual" }, [
      el("div", { className: "split-form__copy" }, [
        el("strong", { text: "Ajoute une petite étape" }),
        el("small", { className: "muted", text: rewarded < MAX_REWARDED_MANUAL_SPLITS ? `Découpage manuel : +${MANUAL_SPLIT_XP} XP` : "XP de découpage déjà au maximum pour cette tâche" })
      ]),
      el("div", { className: "split-form__controls" }, [
        el("input", { name: "subtaskTitle", "aria-label": "Titre de la sous-tâche", placeholder: "Ex. ouvrir le document", autocomplete: "off" }),
        button("Ajouter", "tasks.split-manual", { className: "primary", type: "submit", "data-id": task.id })
      ])
    ]));
  }

  if (children.length) {
    const list = el("div", { className: "subtask-list" }, [el("strong", { className: "subtask-list__title", text: "Étapes" })]);
    for (const child of children) {
      const done = child.status === "completed";
      list.append(el("div", { className: `subtask-row${done ? " is-done" : ""}` }, [
        button(done ? "↺" : "✓", done ? "tasks.subtask-reopen" : "tasks.complete", {
          className: "subtask-check",
          "data-id": child.id,
          "aria-label": done ? `Rouvrir ${child.title}` : `Terminer ${child.title}`
        }),
        el("span", { className: "subtask-row__title", text: child.title }),
        el("small", { className: "muted", text: child.splitSource === "ai" ? "IA" : `+${MANUAL_SPLIT_XP} XP création` })
      ]));
    }
    details.append(list);
  }

  if (split.errorTaskId === task.id && split.error) details.append(el("p", { className: "error", text: split.error }));
  card.append(details);
  return card;
};

const quickCreate = (state) => {
  const workspace = featureState(state, "taskWorkspace", {});
  const draft = workspace.draft ?? {};
  const form = el("form", { className: "task-quick-create", "data-action": "tasks.create-quick" });
  form.append(el("div", { className: "task-quick-create__main" }, [
    el("input", { name: "title", value: draft.title ?? "", required: true, placeholder: "Ajouter une tâche…", autocomplete: "off", "aria-label": "Titre de la nouvelle tâche" }),
    el("button", { type: "submit", text: "Ajouter", className: "primary" }),
    button(workspace.createExpanded ? "Moins" : "Options", "tasks.create-toggle", { className: "secondary" })
  ]));

  if (workspace.createExpanded) {
    form.append(el("div", { className: "task-create-options" }, [
      el("label", { className: "field" }, [el("span", { text: "Durée" }), el("input", { name: "estimateMinutes", type: "number", min: 5, step: 5, value: draft.estimateMinutes ?? 25 })]),
      el("label", { className: "field" }, [el("span", { text: "Échéance" }), el("input", { name: "deadline", type: "datetime-local", value: draft.deadline ?? "" })]),
      selectProject(state, draft.projectId ?? ""),
      el("div", { className: "stack compact task-create-importance" }, [el("span", { text: "Importance" }), importancePicker(draft.importance ?? 3)])
    ]));
  }
  return form;
};

const sortTasks = (items) => [...items].sort((a, b) => {
  const qa = eisenhowerQuadrant(a);
  const qb = eisenhowerQuadrant(b);
  const order = { do: 0, plan: 1, quick: 2, later: 3 };
  const quadrantDiff = (order[qa.id] ?? 9) - (order[qb.id] ?? 9);
  if (quadrantDiff) return quadrantDiff;
  const da = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
  const db = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  return normalizeImportance(b.importance) - normalizeImportance(a.importance);
});

const todayCandidates = (state) => {
  const now = Date.now();
  const cutoff = now + 3 * 24 * 60 * 60 * 1000;
  const candidates = parentTasks(state).filter((task) => {
    const deadline = task.deadline ? new Date(task.deadline).getTime() : Number.POSITIVE_INFINITY;
    return deadline <= cutoff || normalizeImportance(task.importance) >= 4 || Number(task.progress ?? 0) > 0;
  });
  return sortTasks(candidates).slice(0, 8);
};

const todayRender = (state) => {
  const root = el("div", { className: "stack task-view" });
  const candidates = todayCandidates(state);
  root.append(el("div", { className: "task-view-heading" }, [
    el("div", {}, [el("h3", { text: "À garder sous les yeux" }), el("p", { className: "muted", text: "Les tâches urgentes, importantes ou déjà commencées. Pas toute ta vie en même temps." })]),
    el("span", { className: "task-count", text: String(candidates.length) })
  ]));
  if (!candidates.length) {
    root.append(el("div", { className: "task-empty" }, [el("strong", { text: "Rien ne brûle." }), el("span", { className: "muted", text: "Tu peux ajouter une tâche ou regarder la liste complète." })]));
    return root;
  }
  for (const task of candidates) root.append(taskCard(state, task));
  return root;
};

const filteredParents = (state) => {
  const workspace = featureState(state, "taskWorkspace", {});
  const query = String(workspace.query ?? "").trim().toLocaleLowerCase("fr");
  const projectId = workspace.projectFilter ?? "all";
  const status = workspace.statusFilter ?? "active";
  return sortTasks(taskItems(state).filter((task) => {
    if (task.parentTaskId) return false;
    if (status === "active" && task.status === "completed") return false;
    if (status === "completed" && task.status !== "completed") return false;
    if (projectId === "none" && linkedProjects(state, task).length) return false;
    if (projectId !== "all" && projectId !== "none" && !linkedProjects(state, task).some((project) => project.id === projectId)) return false;
    if (query && !String(task.title ?? "").toLocaleLowerCase("fr").includes(query)) return false;
    return true;
  }));
};

const listToolbar = (state) => {
  const workspace = featureState(state, "taskWorkspace", {});
  const projectSelect = el("select", { "data-action": "tasks.filter-project", "aria-label": "Filtrer par projet" });
  projectSelect.append(el("option", { value: "all", text: "Tous les projets", selected: (workspace.projectFilter ?? "all") === "all" }));
  projectSelect.append(el("option", { value: "none", text: "Sans projet", selected: workspace.projectFilter === "none" }));
  for (const project of projectItems(state)) projectSelect.append(el("option", { value: project.id, text: project.title, selected: workspace.projectFilter === project.id }));

  const statusSelect = el("select", { "data-action": "tasks.filter-status", "aria-label": "Filtrer par état" }, [
    el("option", { value: "active", text: "Actives", selected: (workspace.statusFilter ?? "active") === "active" }),
    el("option", { value: "completed", text: "Terminées", selected: workspace.statusFilter === "completed" }),
    el("option", { value: "all", text: "Toutes", selected: workspace.statusFilter === "all" })
  ]);

  return el("div", { className: "task-list-toolbar" }, [
    el("input", { type: "search", value: workspace.query ?? "", placeholder: "Rechercher…", "data-action": "tasks.filter-query", "aria-label": "Rechercher une tâche" }),
    statusSelect,
    projectSelect
  ]);
};

const listRender = (state) => {
  const root = el("div", { className: "stack task-view" });
  const items = filteredParents(state);
  root.append(listToolbar(state), el("div", { className: "task-view-heading" }, [
    el("h3", { text: "Toutes les tâches" }),
    el("span", { className: "task-count", text: String(items.length) })
  ]));
  if (!items.length) root.append(el("div", { className: "task-empty", text: "Aucune tâche ne correspond à ces filtres." }));
  for (const task of items) root.append(taskCard(state, task));
  return root;
};

const matrixTask = (state, task) => el("article", { className: `matrix-task${categoryPresentation(task).style ? " has-outlook-category" : ""}`, style: categoryPresentation(task).style }, [
  el("div", { className: "matrix-task__top" }, [
    el("strong", { text: task.title }),
    button("✓", "tasks.complete", { className: "matrix-task__done", disabled: isTaskBlocked(task, taskItems(state)), "data-id": task.id, "aria-label": `Terminer ${task.title}` })
  ]),
  el("small", { className: "muted", text: `${formatDeadline(task.deadline, true)} · imp. ${normalizeImportance(task.importance)}` }),
  linkedProjects(state, task).length ? el("small", { className: "muted", text: linkedProjects(state, task).map((project) => project.title).join(" · ") }) : null,
  categoryPresentation(task).label ? el("span", { className: `outlook-category-tag${categoryPresentation(task).style ? " has-category" : ""}`, style: categoryPresentation(task).style, text: categoryPresentation(task).label }) : null
]);

const matrixBoard = (state) => {
  const grouped = groupTasksByEisenhower(parentTasks(state));
  const board = el("div", { className: "eisenhower-board" });
  for (const quadrant of Object.values(EISENHOWER_QUADRANTS)) {
    const items = sortTasks(grouped[quadrant.id] ?? []);
    const cell = el("section", { className: `eisenhower-cell ${quadrant.className}` }, [
      el("div", { className: "eisenhower-cell__head" }, [
        el("div", {}, [el("strong", { text: `${quadrant.icon} ${quadrant.title}` }), el("small", { className: "muted", text: quadrant.subtitle })]),
        el("span", { className: "task-count", text: String(items.length) })
      ])
    ]);
    if (!items.length) cell.append(el("small", { className: "muted", text: "Rien ici." }));
    for (const task of items) cell.append(matrixTask(state, task));
    board.append(cell);
  }
  return board;
};

const matrixRender = (state) => el("div", { className: "stack task-view" }, [
  el("div", { className: "task-view-heading" }, [
    el("div", {}, [el("h3", { text: "Matrice d’Eisenhower" }), el("p", { className: "muted", text: "Importance 4–5 = importante. Une échéance proche rend la tâche urgente." })])
  ]),
  matrixBoard(state)
]);

const createChildTask = (parent, title, source, index = 0) => ({
  id: uid("task"),
  title: String(title ?? "").trim(),
  deadline: parent.deadline ?? null,
  estimateMinutes: Math.max(5, Math.round(asNumber(parent.estimateMinutes, 25) / Math.max(2, index + 2) / 5) * 5),
  difficulty: Math.max(1, asNumber(parent.difficulty, 3) - 1),
  importance: normalizeImportance(parent.importance),
  progress: 0,
  splittable: true,
  minimumChunkMinutes: 5,
  preferredEnergyMin: Math.max(1, asNumber(parent.preferredEnergyMin, parent.difficulty ?? 3) - 1),
  status: "active",
  projectId: parent.projectId ?? null,
  parentTaskId: parent.id,
  splitSource: source,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

const workspaceRender = ({ state }) => {
  const current = { ...featureState(state, "taskWorkspace", {}), view: workspaceView(state) };
  const counts = {
    active: parentTasks(state).length,
    urgent: groupTasksByEisenhower(parentTasks(state)).do?.length ?? 0
  };
  return el("div", { className: "task-workspace-header stack" }, [
    el("div", { className: "task-workspace-summary" }, [
      el("div", {}, [el("strong", { text: `${counts.active} tâche${counts.active > 1 ? "s" : ""} active${counts.active > 1 ? "s" : ""}` }), el("small", { className: "muted", text: counts.urgent ? `${counts.urgent} à traiter en priorité` : "Aucune urgence détectée" })]),
      quickCreate(state)
    ]),
    el("nav", { className: "task-workspace-tabs", role: "tablist", "aria-label": "Vues des tâches" }, [
      button("Priorités", "tasks.view-today", { className: current.view === "today" ? "is-active" : "", role: "tab", "aria-selected": current.view === "today" }),
      button("Liste", "tasks.view-list", { className: current.view === "list" ? "is-active" : "", role: "tab", "aria-selected": current.view === "list" }),
      button("Matrice", "tasks.view-matrix", { className: current.view === "matrix" ? "is-active" : "", role: "tab", "aria-selected": current.view === "matrix" }),
      button("Projets", "tasks.view-projects", { className: current.view === "projects" ? "is-active" : "", role: "tab", "aria-selected": current.view === "projects" })
    ])
  ]);
};

export const taskWorkspaceFeatures = {
  taskWorkspace: {
    description: "Pilote des tâches",
    state: {
      view: "today",
      createExpanded: false,
      expandedId: null,
      editingId: null,
      query: "",
      statusFilter: "active",
      projectFilter: "all"
    },
    when: ["tasks:view", "tasks:create-toggle", "tasks:prepare-create", "tasks:create-reset", "tasks:toggle-details", "tasks:edit-open", "tasks:edit-close", "tasks:filter"],
    run: ({ state, event, payload }) => {
      const current = featureState(state, "taskWorkspace", {});
      if (event === "tasks:view") return setFeatureState(state, "taskWorkspace", { ...current, view: VIEWS.has(payload?.view) ? payload.view : "today", expandedId: null, editingId: null });
      if (event === "tasks:create-toggle") return setFeatureState(state, "taskWorkspace", { ...current, createExpanded: !current.createExpanded, draft: { ...(current.draft ?? {}), ...(payload?.draft ?? {}) } });
      if (event === "tasks:prepare-create") return setFeatureState(state, "taskWorkspace", { ...current, view: "list", createExpanded: true, draft: { title: "", projectId: payload?.projectId ?? "" }, query: "", statusFilter: "active", projectFilter: "all" });
      if (event === "tasks:create-reset") return setFeatureState(state, "taskWorkspace", { ...current, view: "list", draft: { projectId: payload?.projectId ?? "" }, query: "", statusFilter: "active", projectFilter: "all" });
      if (event === "tasks:toggle-details") return setFeatureState(state, "taskWorkspace", { ...current, expandedId: current.expandedId === payload?.id ? null : payload?.id, editingId: null });
      if (event === "tasks:edit-open") return setFeatureState(state, "taskWorkspace", { ...current, expandedId: payload?.id, editingId: payload?.id });
      if (event === "tasks:edit-close") return setFeatureState(state, "taskWorkspace", { ...current, editingId: null });
      if (event === "tasks:filter") return setFeatureState(state, "taskWorkspace", { ...current, [payload?.key]: payload?.value ?? "" });
      return state;
    },
    ui: {
      order: 1,
      render: workspaceRender,
      actions: {
        "tasks.view-today": ({ dispatch }) => dispatch("tasks:view", { view: "today" }),
        "tasks.view-list": ({ dispatch }) => dispatch("tasks:view", { view: "list" }),
        "tasks.view-matrix": ({ dispatch }) => dispatch("tasks:view", { view: "matrix" }),
        "tasks.view-projects": ({ dispatch }) => dispatch("tasks:view", { view: "projects" }),
        "tasks.create-toggle": ({ target, dispatch }) => {
          const form = target.closest("form");
          return dispatch("tasks:create-toggle", { draft: Object.fromEntries(new FormData(form)) });
        },
        "tasks.toggle-details": ({ target, dispatch }) => dispatch("tasks:toggle-details", { id: target.dataset.id }),
        "tasks.edit-open": ({ target, dispatch }) => dispatch("tasks:edit-open", { id: target.dataset.id }),
        "tasks.edit-close": ({ dispatch }) => dispatch("tasks:edit-close"),
        "tasks.filter-query": ({ event, target, dispatch }) => event.type === "input" ? dispatch("tasks:filter", { key: "query", value: target.value }) : undefined,
        "tasks.filter-status": ({ event, target, dispatch }) => event.type === "change" ? dispatch("tasks:filter", { key: "statusFilter", value: target.value }) : undefined,
        "tasks.filter-project": ({ event, target, dispatch }) => event.type === "change" ? dispatch("tasks:filter", { key: "projectFilter", value: target.value }) : undefined
      }
    }
  },

  tasks: {
    ...baseFeatures.tasks,
    description: "Tâches",
    ui: {
      order: 10,
      visible: (state) => ["today", "list", "matrix"].includes(workspaceView(state)),
      render: ({ state }) => {
        const view = workspaceView(state);
        if (view === "matrix") return matrixRender(state);
        if (view === "list") return listRender(state);
        return todayRender(state);
      },
      actions: {
        "tasks.create-quick": async ({ event, target, dispatch }) => {
          if (event && event.type !== "submit") return;
          const form = target.closest("form");
          const title = formValue(target, "title").trim();
          if (!title) {
            const input = form?.elements.namedItem("title");
            if (input) { input.setCustomValidity("Donne un nom à la tâche."); input.reportValidity(); input.addEventListener("input", () => input.setCustomValidity(""), { once: true }); }
            return;
          }
          const projectId = formValue(target, "projectId") || null;
          const expanded = Boolean(target.closest("form")?.querySelector("[name='estimateMinutes']"));
          await dispatch("task:created", {
            title,
            estimateMinutes: expanded ? formValue(target, "estimateMinutes") : 25,
            deadline: expanded ? formValue(target, "deadline") || null : null,
            importance: expanded ? normalizeImportance(formValue(target, "importance")) : 3,
            projectId: expanded ? projectId : null
          });
          await dispatch("tasks:create-reset", { projectId });
        },
        "tasks.complete": ({ target, dispatch }) => dispatch("task:completed", { id: target.dataset.id }),
        "tasks.subtask-reopen": ({ target, dispatch }) => dispatch("task:updated", { id: target.dataset.id, status: "active", progress: 0 }),
        "tasks.defer": ({ target, dispatch }) => dispatch("task:deferred", { id: target.dataset.id }),
        "tasks.delete": ({ target, dispatch }) => dispatch("task:deleted", { id: target.dataset.id }),
        "tasks.edit-save": async ({ target, dispatch }) => {
          await dispatch("task:updated", {
            id: target.dataset.id,
            title: formValue(target, "title"),
            estimateMinutes: formValue(target, "estimateMinutes"),
            deadline: formValue(target, "deadline") || null,
            importance: normalizeImportance(formValue(target, "importance")),
            projectId: formValue(target, "projectId") || null
          });
          return dispatch("tasks:edit-close");
        },
        "tasks.split-toggle": ({ target, dispatch }) => dispatch("tasks:split-toggle", { id: target.dataset.id }),
        "tasks.split-manual": ({ target, dispatch }) => dispatch("tasks:split-manual", { id: target.dataset.id, title: formValue(target, "subtaskTitle") }),
        "tasks.split-ai": ({ target, dispatch }) => dispatch("tasks:split-ai", { id: target.dataset.id })
      }
    }
  },

  taskDecomposition: {
    description: "Découpage des tâches",
    state: { manualFor: null, aiLoadingFor: null, rewardedByParent: {}, error: null, errorTaskId: null },
    when: ["tasks:split-toggle", "tasks:split-manual", "tasks:split-ai"],
    run: async ({ state, event, payload, services }) => {
      const current = featureState(state, "taskDecomposition", {});
      const parent = taskItems(state).find((task) => task.id === payload?.id);
      if (event === "tasks:split-toggle") {
        return setFeatureState(state, "taskDecomposition", { ...current, manualFor: current.manualFor === payload?.id ? null : payload?.id, error: null, errorTaskId: null });
      }
      if (!parent) return state;

      if (event === "tasks:split-manual") {
        const title = String(payload?.title ?? "").trim();
        if (!title) return state;
        const child = createChildTask(parent, title, "manual", 0);
        const items = [...taskItems(state), child];
        const rewarded = Number(current.rewardedByParent?.[parent.id] ?? 0);
        const shouldReward = rewarded < MAX_REWARDED_MANUAL_SPLITS;
        const nextGame = shouldReward ? addXp(featureState(state, "game", { xp: 0, level: 1 }), MANUAL_SPLIT_XP) : featureState(state, "game", { xp: 0, level: 1 });
        let next = setFeatureState(state, "tasks", { ...featureState(state, "tasks", {}), items });
        next = setFeatureState(next, "game", { ...nextGame, lastGain: shouldReward ? MANUAL_SPLIT_XP : 0 });
        return setFeatureState(next, "taskDecomposition", {
          ...current,
          manualFor: parent.id,
          rewardedByParent: { ...(current.rewardedByParent ?? {}), [parent.id]: rewarded + (shouldReward ? 1 : 0) },
          error: null,
          errorTaskId: null
        });
      }

      if (event === "tasks:split-ai") {
        let pending = setFeatureState(state, "taskDecomposition", { ...current, aiLoadingFor: parent.id, error: null, errorTaskId: null });
        try {
          if (!services.ai?.decompose) throw new Error("Connecte au moins une IA pour utiliser Aide-moi.");
          const result = await services.ai.decompose({
            task: parent,
            state,
            providers: featureState(state, "ai", {}).providers ?? {},
            mode: featureState(state, "ai", {}).mode ?? "fusion"
          });
          const titles = Array.isArray(result?.steps) ? result.steps : Array.isArray(result) ? result : [];
          const clean = titles.map((item) => typeof item === "string" ? item.trim() : String(item?.title ?? "").trim()).filter(Boolean).slice(0, 6);
          if (clean.length < 2) throw new Error("L’IA n’a pas proposé assez d’étapes utilisables.");
          const children = clean.map((title, index) => createChildTask(parent, title, "ai", index));
          pending = setFeatureState(pending, "tasks", { ...featureState(pending, "tasks", {}), items: [...taskItems(pending), ...children] });
          return setFeatureState(pending, "taskDecomposition", { ...current, aiLoadingFor: null, manualFor: null, error: null, errorTaskId: null });
        } catch (error) {
          return setFeatureState(pending, "taskDecomposition", { ...current, aiLoadingFor: null, error: error instanceof Error ? error.message : String(error), errorTaskId: parent.id });
        }
      }
      return state;
    }
  },

  taskEditor: {
    ...advancedFeatures.taskEditor,
    ui: {
      ...(advancedFeatures.taskEditor.ui ?? {}),
      visible: () => false
    }
  },

  projects: {
    ...advancedFeatures.projects,
    description: "Projets",
    ui: {
      ...(advancedFeatures.projects.ui ?? {}),
      order: 30,
      visible: (state) => workspaceView(state) === "projects"
    }
  }
};
