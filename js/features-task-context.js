import { taskWorkspaceFeatures } from "./features-tasks-workspace.js";

const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;

export const taskContextFeatures = {
  tasks: {
    ...taskWorkspaceFeatures.tasks,
    run: (context) => {
      const next = taskWorkspaceFeatures.tasks.run(context);
      if (context.event !== "task:updated" || !context.payload?.id || !["cours", "perso"].includes(context.payload?.context)) return next;
      const current = featureState(next, "tasks", { items: [] });
      return {
        ...next,
        features: {
          ...(next.features ?? {}),
          tasks: {
            ...current,
            items: (current.items ?? []).map((task) => task.id === context.payload.id
              ? { ...task, context: context.payload.context, updatedAt: new Date().toISOString() }
              : task)
          }
        }
      };
    }
  }
};
