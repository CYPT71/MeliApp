export const indexTree = tasks => {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const children = new Map(tasks.map(task => [task.id, []]));
  for (const task of tasks) if (byId.has(task.parentTaskId) && task.parentTaskId !== task.id) children.get(task.parentTaskId).push(task);
  const descendants = id => {
    const result = new Set(), pending = [id];
    while (pending.length) {
      const next = pending.pop();
      if (result.has(next) || !byId.has(next)) continue;
      result.add(next);
      pending.push(...(children.get(next) ?? []).map(task => task.id));
    }
    return result;
  };
  const ancestors = id => {
    const result = new Set();
    while (byId.has(id) && !result.has(id)) {
      result.add(id);
      id = byId.get(id).parentTaskId;
    }
    return result;
  };
  const roots = tasks.filter(task => !byId.has(task.parentTaskId) || task.parentTaskId === task.id);
  const covered = new Set(roots.flatMap(task => [...descendants(task.id)]));
  // Imported cycles still get one visible root; rendering never revisits an ancestor.
  for (const task of tasks) if (!covered.has(task.id)) {
    roots.push(task);
    for (const id of descendants(task.id)) covered.add(id);
  }
  return { byId, children, descendants, ancestors, roots };
};

export const visibleTree = (tasks, { query = '', focusId = null, showCompleted = true, matches } = {}) => {
  const tree = indexTree(tasks);
  let visible = new Set();
  for (const task of tasks) if (showCompleted || task.status !== 'completed') {
    for (const id of tree.ancestors(task.id)) visible.add(id);
  }
  if (focusId && tree.byId.has(focusId)) {
    const scope = new Set([...tree.descendants(focusId), ...tree.ancestors(focusId)]);
    visible = new Set([...visible].filter(id => scope.has(id)));
  }
  if (query.trim()) {
    const matching = new Set();
    for (const task of tasks) if (matches ? matches(task) : task.title.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr').trim())) {
      for (const id of [...tree.ancestors(task.id), ...tree.descendants(task.id)]) matching.add(id);
    }
    visible = new Set([...visible].filter(id => matching.has(id)));
  }
  return { ...tree, visible };
};

export const moveTaskBranch = (tasks, taskId, projectId) => {
  const ids = indexTree(tasks).descendants(taskId);
  return tasks.map(task => ids.has(task.id) ? { ...task, projectId: projectId || null, updatedAt: new Date().toISOString() } : task);
};
