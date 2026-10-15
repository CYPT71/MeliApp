import { taskWorkspaceFeatures } from "./features-tasks-workspace.js";
import { taskContext } from "./domain/adaptive-planning.js";

const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;

const projectTitle = (state, projectId) =>
  featureState(state, "projects", { items: [] }).items?.find((project) => project.id === projectId)?.title ?? null;

const classify = (task, state, explicit = null) => taskContext({
  ...task,
  context: ["cours", "perso"].includes(explicit) ? explicit : task.context,
  projectTitle: projectTitle(state, task.projectId)
});

export const taskContextFeatures = {
  tasks: {
    ...taskWorkspaceFeatures.tasks,
    run: (context) => {
      const before = featureState(context.state, "tasks", { items: [] }).items ?? [];
      const beforeIds = new Set(before.map((task) => task.id));
      const next = taskWorkspaceFeatures.tasks.run(context);
      if (!["task:created", "task:updated"].includes(context.event)) return next;

      const current = featureState(next, "tasks", { items: [] });
      const explicit = ["cours", "perso"].includes(context.payload?.context) ? context.payload.context : null;
      const items = (current.items ?? []).map((task) => {
        const isCreated = context.event === "task:created" && !beforeIds.has(task.id);
        const isUpdated = context.event === "task:updated" && task.id === context.payload?.id;
        if (!isCreated && !isUpdated) return task;
        return {
          ...task,
          context: classify(task, next, explicit),
          updatedAt: new Date().toISOString()
        };
      });

      return {
        ...next,
        features: {
          ...(next.features ?? {}),
          tasks: { ...current, items }
        }
      };
    }
  }
};
