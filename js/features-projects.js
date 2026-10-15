import { taskWorkspaceFeatures } from "./features-tasks-workspace.js";

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
const clamp = (value, min, max) => Math.min(max, Math.max(min, asNumber(value, min)));
const formValue = (target, name) => target.closest("form")?.elements?.namedItem(name)?.value ?? "";

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

const field = ({ label, name, type = "text", value = "", min, max, step, placeholder = "" }) =>
  el("label", { className: "field" }, [
    el("span", { text: label }),
    el("input", { name, type, value, min, max, step, placeholder })
  ]);

const textareaField = ({ label, name, value = "", placeholder = "" }) =>
  el("label", { className: "field project-field-wide" }, [
    el("span", { text: label }),
    el("textarea", { name, rows: 3, placeholder, text: value })
  ]);

const selectField = ({ label, name, value = "", options = [] }) => {
  const select = el("select", { name });
  for (const option of options) {
    select.append(el("option", { value: option.value, text: option.label, selected: option.value === value }));
  }
  return el("label", { className: "field" }, [el("span", { text: label }), select]);
};

const projectItems = (state) => featureState(state, "projects", { items: [] }).items ?? [];
const taskItems = (state) => featureState(state, "tasks", { items: [] }).items ?? [];

const normalizeProject = (payload = {}, previous = {}) => ({
  ...previous,
  id: previous.id ?? payload.id ?? uid("project"),
  title: String(payload.title ?? previous.title ?? "").trim(),
  description: String(payload.description ?? previous.description ?? "").trim(),
  objective: String(payload.objective ?? previous.objective ?? "").trim(),
  successCriteria: String(payload.successCriteria ?? previous.successCriteria ?? "").trim(),
  notes: String(payload.notes ?? previous.notes ?? "").trim(),
  tags: String(payload.tags ?? previous.tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12),
  startDate: payload.startDate || previous.startDate || null,
  deadline: payload.deadline || previous.deadline || null,
  status: ["planned", "active", "on_hold", "completed"].includes(payload.status) ? payload.status : (previous.status ?? "active"),
  importance: clamp(payload.importance ?? previous.importance ?? 3, 1, 5),
  difficulty: clamp(payload.difficulty ?? previous.difficulty ?? 3, 1, 5),
  estimateMinutes: Math.max(0, asNumber(payload.estimateMinutes ?? previous.estimateMinutes, 0)),
  color: String(payload.color ?? previous.color ?? "#7c6cff"),
  createdAt: previous.createdAt ?? new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

const projectStats = (state, projectId) => {
  const tasks = taskItems(state).filter((task) => task.projectId === projectId && !task.parentTaskId);
  const completed = tasks.filter((task) => task.status === "completed").length;
  const progress = tasks.length
    ? tasks.reduce((sum, task) => sum + Number(task.progress ?? (task.status === "completed" ? 1 : 0)), 0) / tasks.length
    : 0;
  const estimated = tasks.reduce((sum, task) => sum + asNumber(task.estimateMinutes, 0), 0);
  return { total: tasks.length, completed, progress, estimated };
};

const dateLabel = (value) => {
  if (!value) return "Sans échéance";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sans échéance";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

const projectForm = (project = null) => {
  const editing = Boolean(project);
  return el("form", { className: "project-form stack", "data-project-id": project?.id ?? "" }, [
    el("div", { className: "project-form-heading" }, [
      el("div", {}, [
        el("h3", { text: editing ? "Modifier le projet" : "Nouveau projet" }),
        el("p", { className: "muted", text: "Définis le résultat attendu, l’échéance et la charge. Les tâches reliées calculeront ensuite la progression." })
      ]),
      editing ? button("Fermer", "projects.edit-close", { className: "secondary" }) : null
    ]),
    el("div", { className: "project-form-grid" }, [
      field({ label: "Nom du projet", name: "title", value: project?.title ?? "", placeholder: "Ex. Mémoire de fin d’études" }),
      selectField({ label: "État", name: "status", value: project?.status ?? "active", options: [
        { value: "planned", label: "À préparer" },
        { value: "active", label: "En cours" },
        { value: "on_hold", label: "En pause" },
        { value: "completed", label: "Terminé" }
      ] }),
      field({ label: "Début", name: "startDate", type: "date", value: project?.startDate ? String(project.startDate).slice(0, 10) : "" }),
      field({ label: "Échéance", name: "deadline", type: "date", value: project?.deadline ? String(project.deadline).slice(0, 10) : "" }),
      field({ label: "Importance", name: "importance", type: "number", min: 1, max: 5, value: project?.importance ?? 3 }),
      field({ label: "Difficulté", name: "difficulty", type: "number", min: 1, max: 5, value: project?.difficulty ?? 3 }),
      field({ label: "Charge estimée (min)", name: "estimateMinutes", type: "number", min: 0, step: 15, value: project?.estimateMinutes ?? 0 }),
      field({ label: "Couleur", name: "color", type: "color", value: project?.color ?? "#7c6cff" }),
      textareaField({ label: "Description", name: "description", value: project?.description ?? "", placeholder: "De quoi s’agit-il ?" }),
      textareaField({ label: "Objectif", name: "objective", value: project?.objective ?? "", placeholder: "Quel résultat concret doit exister à la fin ?" }),
      textareaField({ label: "Critères de réussite", name: "successCriteria", value: project?.successCriteria ?? "", placeholder: "Comment sauras-tu que le projet est vraiment terminé ?" }),
      textareaField({ label: "Notes", name: "notes", value: project?.notes ?? "", placeholder: "Contexte, liens, contraintes, idées…" }),
      field({ label: "Tags séparés par des virgules", name: "tags", value: (project?.tags ?? []).join(", "), placeholder: "études, perso, urgent" })
    ]),
    button(editing ? "Enregistrer les modifications" : "Créer le projet", editing ? "projects.update" : "projects.create", {
      className: "primary",
      "data-id": project?.id ?? ""
    })
  ]);
};

const projectCard = (state, project) => {
  const stats = projectStats(state, project.id);
  const taskList = taskItems(state).filter((task) => task.projectId === project.id && !task.parentTaskId);
  const root = el("article", { className: "project-card", style: `--project-accent:${project.color || "#7c6cff"}` }, [
    el("div", { className: "project-card-head" }, [
      el("div", { className: "stack compact" }, [
        el("div", { className: "project-title-row" }, [
          el("span", { className: "project-color-dot", "aria-hidden": "true" }),
          el("strong", { text: project.title })
        ]),
        el("span", { className: "muted", text: `${dateLabel(project.deadline)} · importance ${project.importance ?? 3}/5 · difficulté ${project.difficulty ?? 3}/5` })
      ]),
      el("span", { className: `project-status status-${project.status ?? "active"}`, text: ({ planned: "À préparer", active: "En cours", on_hold: "En pause", completed: "Terminé" })[project.status] ?? "En cours" })
    ]),
    project.objective ? el("p", { className: "project-objective", text: project.objective }) : null,
    el("div", { className: "project-progress" }, [
      el("progress", { max: 1, value: stats.progress }),
      el("small", { className: "muted", text: `${stats.completed}/${stats.total} tâches terminées · ${Math.round(stats.progress * 100)} %` })
    ]),
    el("div", { className: "project-metrics" }, [
      el("span", { text: `${stats.total} tâche${stats.total > 1 ? "s" : ""}` }),
      el("span", { text: stats.estimated ? `${stats.estimated} min planifiées` : "Charge non planifiée" }),
      el("span", { text: project.estimateMinutes ? `${project.estimateMinutes} min prévues` : "Estimation projet libre" })
    ]),
    project.tags?.length ? el("div", { className: "project-tags" }, project.tags.map((tag) => el("span", { className: "task-chip", text: tag }))) : null,
    el("div", { className: "project-actions" }, [
      button("Modifier", "projects.edit-open", { "data-id": project.id }),
      button("Ajouter une tâche", "projects.add-task", { "data-id": project.id }),
      project.status === "completed"
        ? button("Rouvrir", "projects.reopen", { "data-id": project.id })
        : button("Terminer", "projects.complete", { "data-id": project.id }),
      button("Supprimer", "projects.delete", { className: "danger-quiet", "data-id": project.id })
    ])
  ]);

  if (taskList.length) {
    const list = el("div", { className: "project-task-list stack compact" }, [el("strong", { text: "Tâches liées" })]);
    for (const task of taskList.slice(0, 8)) {
      list.append(el("div", { className: "project-task-row" }, [
        el("span", { text: task.status === "completed" ? "✓" : "○" }),
        el("span", { text: task.title }),
        el("small", { className: "muted", text: task.deadline ? dateLabel(task.deadline) : "" })
      ]));
    }
    root.append(list);
  }
  return root;
};

const readProjectPayload = (target) => ({
  title: formValue(target, "title"),
  description: formValue(target, "description"),
  objective: formValue(target, "objective"),
  successCriteria: formValue(target, "successCriteria"),
  notes: formValue(target, "notes"),
  tags: formValue(target, "tags"),
  startDate: formValue(target, "startDate") || null,
  deadline: formValue(target, "deadline") || null,
  status: formValue(target, "status"),
  importance: formValue(target, "importance"),
  difficulty: formValue(target, "difficulty"),
  estimateMinutes: formValue(target, "estimateMinutes"),
  color: formValue(target, "color")
});

const projectRender = ({ state }) => {
  const current = featureState(state, "projects", { items: [], editingId: null, query: "", statusFilter: "active" });
  const items = projectItems(state)
    .filter((project) => current.statusFilter === "all" || (current.statusFilter === "active" ? project.status !== "completed" : project.status === current.statusFilter))
    .filter((project) => !current.query || String(project.title ?? "").toLocaleLowerCase("fr").includes(String(current.query).toLocaleLowerCase("fr")));
  const editing = current.editingId ? projectItems(state).find((project) => project.id === current.editingId) : null;

  const root = el("div", { className: "project-workspace stack" }, [
    el("div", { className: "project-hero" }, [
      el("div", {}, [el("h2", { text: "Projets" }), el("p", { className: "muted", text: "Un projet donne un cap aux tâches : résultat attendu, échéance, charge et progression au même endroit." })]),
      el("span", { className: "project-count", text: `${items.length}` })
    ])
  ]);

  root.append(projectForm(editing));

  const toolbar = el("div", { className: "project-toolbar" }, [
    el("input", { type: "search", placeholder: "Rechercher un projet…", value: current.query ?? "", "data-action": "projects.filter-query" }),
    (() => {
      const select = el("select", { "data-action": "projects.filter-status" });
      for (const option of [
        ["active", "Actifs"], ["planned", "À préparer"], ["on_hold", "En pause"], ["completed", "Terminés"], ["all", "Tous"]
      ]) select.append(el("option", { value: option[0], text: option[1], selected: current.statusFilter === option[0] }));
      return select;
    })()
  ]);
  root.append(toolbar);

  if (!items.length) root.append(el("div", { className: "project-empty", text: "Aucun projet dans cette vue. Pour une fois, le chaos administratif est sous contrôle." }));
  for (const project of items) root.append(projectCard(state, project));
  return root;
};

const baseTaskWorkspace = taskWorkspaceFeatures.taskWorkspace;

export const projectFeatures = {
  taskWorkspace: {
    ...baseTaskWorkspace,
    ui: {
      ...(baseTaskWorkspace.ui ?? {}),
      render: (context) => {
        const root = baseTaskWorkspace.ui.render(context);
        const projectButton = root.querySelector?.('[data-action="tasks.view-projects"]');
        if (projectButton) {
          projectButton.dataset.action = "projects.open";
          projectButton.setAttribute("aria-selected", "false");
        }
        return root;
      },
      actions: {
        ...(baseTaskWorkspace.ui?.actions ?? {}),
        "projects.open": () => {
          location.hash = "#/projects";
        }
      }
    }
  },

  projects: {
    description: "Gestion complète des projets",
    state: { items: [], editingId: null, query: "", statusFilter: "active" },
    when: ["project:create", "project:update", "project:delete", "project:edit-open", "project:edit-close", "project:filter", "project:complete", "project:reopen"],
    run: ({ state, event, payload }) => {
      const current = featureState(state, "projects", { items: [] });
      let items = [...(current.items ?? [])];
      if (event === "project:create") {
        const project = normalizeProject(payload);
        if (!project.title) return state;
        items.push(project);
      }
      if (event === "project:update") {
        items = items.map((project) => project.id === payload?.id ? normalizeProject(payload, project) : project);
      }
      if (event === "project:delete") {
        items = items.filter((project) => project.id !== payload?.id);
        const taskState = featureState(state, "tasks", { items: [] });
        state = setFeatureState(state, "tasks", {
          ...taskState,
          items: (taskState.items ?? []).map((task) => task.projectId === payload?.id ? { ...task, projectId: null, updatedAt: new Date().toISOString() } : task)
        });
      }
      if (event === "project:complete") items = items.map((project) => project.id === payload?.id ? { ...project, status: "completed", updatedAt: new Date().toISOString() } : project);
      if (event === "project:reopen") items = items.map((project) => project.id === payload?.id ? { ...project, status: "active", updatedAt: new Date().toISOString() } : project);
      return setFeatureState(state, "projects", {
        ...current,
        items,
        editingId: event === "project:edit-open" ? payload?.id ?? null : event === "project:edit-close" || event === "project:update" ? null : current.editingId ?? null,
        query: event === "project:filter" && payload?.key === "query" ? payload.value ?? "" : current.query ?? "",
        statusFilter: event === "project:filter" && payload?.key === "statusFilter" ? payload.value ?? "active" : current.statusFilter ?? "active"
      });
    },
    ui: {
      order: 1,
      render: projectRender,
      actions: {
        "projects.create": ({ target, dispatch }) => dispatch("project:create", readProjectPayload(target)),
        "projects.update": ({ target, dispatch }) => dispatch("project:update", { id: target.dataset.id, ...readProjectPayload(target) }),
        "projects.delete": ({ target, dispatch }) => dispatch("project:delete", { id: target.dataset.id }),
        "projects.edit-open": ({ target, dispatch }) => dispatch("project:edit-open", { id: target.dataset.id }),
        "projects.edit-close": ({ dispatch }) => dispatch("project:edit-close"),
        "projects.complete": ({ target, dispatch }) => dispatch("project:complete", { id: target.dataset.id }),
        "projects.reopen": ({ target, dispatch }) => dispatch("project:reopen", { id: target.dataset.id }),
        "projects.filter-query": ({ event, target, dispatch }) => event.type === "change" ? dispatch("project:filter", { key: "query", value: target.value }) : undefined,
        "projects.filter-status": ({ event, target, dispatch }) => event.type === "change" ? dispatch("project:filter", { key: "statusFilter", value: target.value }) : undefined,
        "projects.add-task": ({ target }) => {
          location.hash = "#/tasks";
          sessionStorage.setItem("meliapp:new-task-project", target.dataset.id ?? "");
        }
      }
    }
  }
};
