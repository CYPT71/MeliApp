export const tasksIn = state => state.features?.tasks?.items ?? [];
export const blockersFor = (task, tasks = []) => (task.blockedBy ?? [])
  .map(id => tasks.find(item => item.id === id)).filter(item => item && item.status !== 'completed');
export const isTaskBlocked = (task, tasks) => blockersFor(task, tasks).length > 0;

export const wouldCreateCycle = (tasks, taskId, blockerId) => {
  const seen = new Set();
  const visit = id => {
    if (id === taskId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return (tasks.find(task => task.id === id)?.blockedBy ?? []).some(visit);
  };
  return visit(blockerId);
};
