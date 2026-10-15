export const upsertById = (items, item) => {
  const index = items.findIndex((current) => current.id === item.id);
  if (index === -1) return [...items, item];
  return items.map((current, i) => (i === index ? { ...current, ...item } : current));
};

export const removeById = (items, id) => items.filter((item) => item.id !== id);

export const updateTask = (state, task) => ({
  ...state,
  tasks: upsertById(state.tasks ?? [], task)
});

export const removeTask = (state, taskId) => ({
  ...state,
  tasks: removeById(state.tasks ?? [], taskId)
});

export const completeTask = (state, taskId, completedAt = Date.now()) => ({
  ...state,
  tasks: (state.tasks ?? []).map((task) =>
    task.id === taskId ? { ...task, status: "completed", progress: 1, completedAt } : task
  )
});
