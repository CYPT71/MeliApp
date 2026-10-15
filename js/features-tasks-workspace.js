import { features as baseFeatures } from "./features.js";
import { addXp } from "./domain/xp.js";
import {
  EISENHOWER_QUADRANTS,
  eisenhowerQuadrant,
  groupTasksByEisenhower,
  normalizeImportance
} from "./domain/eisenhower.js";

const MANUAL_SPLIT_XP = 8;
const MAX_REWARDED_MANUAL_SPLITS = 5;

const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;
const setFeatureState = (state, name, value) => ({
  ...state,
  features: {
    ...(state.features ?? {}),
    [name]: typeof value === "function" ? value(featureState(state, name)) : value
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
const tasks = (state) => featureState(state, "tasks", { items: [] }).items ?? [];
const projects = (state) => featureState(state, "projects", { items: [] }).items ?? [];
const activeTasks = (state) => tasks(state).filter((task) => task.status !== "completed");

const formatDeadline = (value) => {
  if (!value) return "Sans échéance";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sans échéance";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
};

const importancePicker = (selected = 3) => {
  const root = el("div", { className: "importance-picker", role: "radiogroup", "aria-label": "Importance" });
  for (let value = 1; value <= 5; value += 1) {
    root.append(el("label", { className: `importance-choice${value === Number(selected) ? " is-selected" : ""}` }, [
      el("input", { type: "radio", name: "importance", value, checked: value === Number(selected) }),
      el("span", { className: "importance-choice__dot", text: "●" }),
      el("span", { className: "importance-choice__label", text: String(value) })
    ]));
  }
  return root;
};

const taskMeta = (task) => {
  const quadrant = eisenhowerQuadrant(task);
  const project = task.projectId ? ` · projet lié` : "";
  return `${quadrant.icon} ${quadrant.subtitle} · ${formatDeadline(task.deadline)} · ${task.estimateMinutes ?? 25} min${project}`;
};

const taskCard = (state, task) => {
  const split = featureState(state, "taskDecomposition", {});
  const children = tasks(state).filter((item) => item.parentTaskId === task.id && item.status !== "completed");
  const card = el("article", { className: "task-card list-item", "data-task-id": task.id }, [
    el("div", { className: "row row--between" }, [
      el("div", { className: "stack compact" }, [
        el("strong", { text: task.title }),
        el("small", { className: "muted", text: taskMeta(task) })
      ]),
      el("span", { className: "badge", text: `Importance ${normalizeImportance(task.importance)}` })
    ]),
    el("progress", { max: 1, value: Number(task.progress ?? 0) }),
    el("div", { className: "row task-card__actions" }, [
      button("✓ Terminer", "tasks.complete", { "data-id": task.id }),
      button("✂️ Découper moi-même", "tasks.split-toggle", { "data-id": task.id }),
      button(split.aiLoadingFor === task.id ? "IA en cours…" : "✨ Aide-moi", "tasks.split-ai", { "data-id": task.id, disabled: split.aiLoadingFor === task.id })
    ])
  ]);

  if (split.manualFor === task.id) {
    card.append(el("form", { className: "split-form row" }, [
      el("input", { name: "subtaskTitle", placeholder: "Une petite étape concrète…", autocomplete: "off" }),
      button(`Ajouter · +${MANUAL_SPLIT_XP} XP`, "tasks.split-manual", { className: "primary", "data-id": task.id }),
      button("Fermer", "tasks.split-close")
    ]));
  }

  if (children.length) {
    const list = el("div", { className: "subtask-list stack compact" }, [el("small", { className: "muted", text: "Sous-tâches" })]);
    for (const child of children) {
      list.append(el("div", { className: "subtask-row row row--between" }, [
        el("span", { text: `↳ ${child.title}` }),
        el("small", { className: "muted", text: child.splitSource === "ai" ? "IA · 0 XP de découpage" : "Découpage manuel" })
      ]));
    }
    card.append(list);
  }

  if (split.errorTaskId === task.id && split.error) card.append(el("p", { className: "error", text: split.error }));
  return card;
};

const matrixBoard = (state) => {
  const grouped = groupTasksByEisenhower(activeTasks(state).filter((task) => !task.parentTaskId));
  const board = el("div", { className: "eisenhower-board" });
  for (const quadrant of Object.values(EISENHOWER_QUADRANTS)) {
    const cell = el("section", { className: `eisenhower-cell ${quadrant.className}` }, [
      el("div", { className: "stack compact" }, [
        el("strong", { text: `${quadrant.icon} ${quadrant.title}` }),
        el("small", { className: "muted", text: quadrant.subtitle })
      ])
    ]);
    const items = grouped[quadrant.id] ?? [];
    if (!items.length) cell.append(el("small", { className: "muted", text: "Rien ici pour le moment." }));
    for (const task of items) cell.append(el("div", { className: "matrix-task" }, [
      el("strong", { text: task.title }),
      el("small", { text: formatDeadline(task.deadline) })
    ]));
    board.append(cell);
  }
  return board;
};

const taskListRender = ({ state }) => {
  const root = el("div", { className: "stack task-list-view" });
  const form = el("form", { className: "task-create-card stack" });
  form.append(
    el("div", { className: "row row--between" }, [
      el("strong", { text: "Nouvelle tâche" }),
      el("small", { className: "muted", text: "L’importance + l’échéance alimentent automatiquement la matrice." })
    ]),
    el("div", { className: "feature-form" }, [
      el("label", { className: "field" }, [el("span", { text: "Tâche" }), el("input", { name: "title", placeholder: "Ex. préparer le dossier" })]),
      el("label", { className: "field" }, [el("span", { text: "Durée estimée" }), el("input", { name: "estimateMinutes", type: "number", min: 5, step: 5, value: 25 })]),
      el("label", { className: "field" }, [el("span", { text: "Échéance" }), el("input", { name: "deadline", type: "datetime-local" })])
    ]),
    el("div", { className: "stack compact" }, [el("span", { text: "Importance" }), importancePicker(3)]),
    button("Ajouter la tâche", "tasks.create-rich", { className: "primary" })
  );
  root.append(form, el("h3", { text: "Matrice d’Eisenhower" }), matrixBoard(state), el("h3", { text: "Liste des tâches" }));

  const parents = activeTasks(state).filter((task) => !task.parentTaskId);
  if (!parents.length) root.append(el("p", { className: "muted", text: "Aucune tâche active. Le calme avant le prochain déluge de choses à faire." }));
  for (const task of parents) root.append(taskCard(state, task));
  return root;
};

const treeTask = (state, task) => {
  const quadrant = eisenhowerQuadrant(task);
  const children = tasks(state).filter((item) => item.parentTaskId === task.id);
  const item = el("li", { className: "mindmap-task" }, [
    el("article", { className: "mindmap-node" }, [
      el("strong", { text: task.title }),
      el("small", { text: `${quadrant.icon} ${quadrant.title}` }),
      el("small", { className: "muted", text: `Importance ${normalizeImportance(task.importance)} · ${task.estimateMinutes ?? 25} min` }),
      el("small", { className: "muted", text: `${formatDeadline(task.deadline)} · progression ${Math.round(Number(task.progress ?? 0) * 100)} %` })
    ])
  ]);
  if (children.length) {
    const branch = el("ul", { className: "mindmap-branch" });
    for (const child of children) branch.append(treeTask(state, child));
    item.append(branch);
  }
  return item;
};

const mindmapRender = ({ state }) => {
  const root = el("div", { className: "stack mindmap-view" }, [
    el("p", { className: "muted", text: "Projets → tâches → sous-tâches, avec échéance, importance, durée, progression et position Eisenhower." })
  ]);
  const taskList = tasks(state);
  const projectList = projects(state);
  const assigned = new Set();

  for (const project of projectList) {
    const projectTasks = taskList.filter((task) => task.projectId === project.id && !task.parentTaskId);
    projectTasks.forEach((task) => assigned.add(task.id));
    const tree = el("section", { className: "mindmap-project" }, [
      el("div", { className: "mindmap-project__root" }, [
        el("strong", { text: `👹 ${project.title}` }),
        el("small", { className: "muted", text: project.deadline ? `Deadline ${formatDeadline(project.deadline)}` : "Sans deadline projet" })
      ])
    ]);
    const branch = el("ul", { className: "mindmap-branch mindmap-branch--root" });
    if (!projectTasks.length) branch.append(el("li", { className: "muted", text: "Aucune tâche reliée" }));
    for (const task of projectTasks) branch.append(treeTask(state, task));
    tree.append(branch);
    root.append(tree);
  }

  const unassigned = taskList.filter((task) => !task.projectId && !task.parentTaskId);
  if (unassigned.length) {
    const tree = el("section", { className: "mindmap-project" }, [el("div", { className: "mindmap-project__root", text: "🧺 Sans projet" })]);
    const branch = el("ul", { className: "mindmap-branch mindmap-branch--root" });
    for (const task of unassigned) branch.append(treeTask(state, task));
    tree.append(branch);
    root.append(tree);
  }

  if (!projectList.length && !unassigned.length) root.append(el("p", { className: "muted", text: "La mindmap se remplira dès que tu ajoutes des tâches." }));
  return root;
};

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

export const taskWorkspaceFeatures = {
  taskWorkspace: {
    description: "Vue des tâches",
    state: { view: "list" },
    when: ["tasks:view"],
    run: ({ state, payload }) => setFeatureState(state, "taskWorkspace", { view: payload?.view === "mindmap" ? "mindmap" : "list" }),
    ui: {
      order: 1,
      render: ({ state }) => {
        const view = featureState(state, "taskWorkspace", { view: "list" }).view;
        return el("div", { className: "task-workspace-tabs", role: "tablist" }, [
          button("☷ Liste", "tasks.view-list", { className: view === "list" ? "is-active" : "", role: "tab", "aria-selected": view === "list" }),
          button("🧠 Mindmap", "tasks.view-mindmap", { className: view === "mindmap" ? "is-active" : "", role: "tab", "aria-selected": view === "mindmap" })
        ]);
      },
      actions: {
        "tasks.view-list": ({ dispatch }) => dispatch("tasks:view", { view: "list" }),
        "tasks.view-mindmap": ({ dispatch }) => dispatch("tasks:view", { view: "mindmap" })
      }
    }
  },

  tasks: {
    ...baseFeatures.tasks,
    description: "Liste et matrice des tâches",
    ui: {
      ...baseFeatures.tasks.ui,
      order: 10,
      visible: (state) => featureState(state, "taskWorkspace", { view: "list" }).view === "list",
      render: taskListRender,
      actions: {
        ...baseFeatures.tasks.ui.actions,
        "tasks.create-rich": ({ target, dispatch }) => dispatch("task:created", {
          title: formValue(target, "title"),
          estimateMinutes: formValue(target, "estimateMinutes"),
          deadline: formValue(target, "deadline") || null,
          importance: formValue(target, "importance") || 3,
          difficulty: 3,
          splittable: true
        }),
        "tasks.complete": ({ target, dispatch }) => dispatch("task:completed", { id: target.dataset.id }),
        "tasks.split-toggle": ({ target, dispatch }) => dispatch("task-split:toggle", { id: target.dataset.id }),
        "tasks.split-close": ({ dispatch }) => dispatch("task-split:close"),
        "tasks.split-manual": ({ target, dispatch }) => {
          const title = formValue(target, "subtaskTitle").trim();
          if (!title) return;
          return dispatch("task:split-manual", { id: target.dataset.id, title });
        },
        "tasks.split-ai": ({ target, dispatch }) => dispatch("task:split-ai", { id: target.dataset.id })
      }
    }
  },

  taskDecomposition: {
    description: "Découpage manuel ou assisté",
    state: { manualFor: null, aiLoadingFor: null, errorTaskId: null, error: null },
    when: ["task-split:toggle", "task-split:close", "task:split-manual", "task:split-ai"],
    run: async ({ state, event, payload, services }) => {
      const current = featureState(state, "taskDecomposition", {});
      if (event === "task-split:toggle") {
        return setFeatureState(state, "taskDecomposition", { ...current, manualFor: current.manualFor === payload?.id ? null : payload?.id, error: null });
      }
      if (event === "task-split:close") return setFeatureState(state, "taskDecomposition", { ...current, manualFor: null });

      const parent = tasks(state).find((task) => task.id === payload?.id);
      if (!parent) return state;

      if (event === "task:split-manual") {
        const title = String(payload?.title ?? "").trim();
        if (!title) return state;
        const child = createChildTask(parent, title, "manual");
        const rewardCount = Math.max(0, asNumber(parent.manualSplitRewardCount, 0));
        const rewarded = rewardCount < MAX_REWARDED_MANUAL_SPLITS;
        const nextItems = tasks(state)
          .map((task) => task.id === parent.id ? { ...task, manualSplitRewardCount: rewardCount + (rewarded ? 1 : 0), hasSubtasks: true } : task)
          .concat(child);
        let next = setFeatureState(state, "tasks", { ...featureState(state, "tasks"), items: nextItems });
        if (rewarded) next = setFeatureState(next, "game", addXp(featureState(next, "game", { xp: 0, level: 1 }), MANUAL_SPLIT_XP));
        return setFeatureState(next, "taskDecomposition", { ...current, manualFor: parent.id, error: null });
      }

      if (event === "task:split-ai") {
        let pending = setFeatureState(state, "taskDecomposition", { ...current, aiLoadingFor: parent.id, error: null, errorTaskId: null });
        try {
          if (!services.ai?.decompose) throw new Error("Connecte une IA dans Réglages & connexions pour utiliser « Aide-moi ».");
          const aiState = featureState(state, "ai", {});
          const suggestions = await services.ai.decompose({
            state,
            task: parent,
            providers: aiState.providers ?? {},
            mode: aiState.mode ?? "fusion",
            synthesisProvider: aiState.synthesisProvider ?? "openai"
          });
          const clean = [...new Set((suggestions ?? []).map((item) => String(item).trim()).filter(Boolean))].slice(0, 6);
          if (!clean.length) throw new Error("L’IA n’a pas proposé d’étapes utilisables.");
          const children = clean.map((title, index) => createChildTask(parent, title, "ai", index));
          const nextItems = tasks(state).map((task) => task.id === parent.id ? { ...task, hasSubtasks: true } : task).concat(children);
          pending = setFeatureState(pending, "tasks", { ...featureState(state, "tasks"), items: nextItems });
          return setFeatureState(pending, "taskDecomposition", { ...current, aiLoadingFor: null, error: null, errorTaskId: null });
        } catch (error) {
          return setFeatureState(pending, "taskDecomposition", {
            ...current,
            aiLoadingFor: null,
            errorTaskId: parent.id,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      return state;
    }
  },

  taskMindmap: {
    description: "Mindmap projets et tâches",
    ui: {
      order: 20,
      visible: (state) => featureState(state, "taskWorkspace", { view: "list" }).view === "mindmap",
      render: mindmapRender
    }
  }
};
