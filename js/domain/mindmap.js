import { linkedProjects, matchesProjectCategories } from './project-outlook.js';
import { tasksIn, wouldCreateCycle } from './task-links.js';

export const graphModel = state => {
  const tasks = tasksIn(state);
  const projects = state.features?.projects?.items ?? [];
  const local = state.features?.taskMindmap?.categories ?? [];
  const definitions = new Map((state.calendar?.categories ?? []).map(category => [category.name, category]));
  for (const item of [...tasks, ...(state.calendar?.events ?? [])]) {
    for (const name of [...(item.categories ?? []), ...(item.manualOutlookCategories ?? [])]) {
      if (!definitions.has(name)) definitions.set(name, { name });
    }
  }
  const nodes = [
    ...projects.map(project => ({ id: `project:${project.id}`, entityId: project.id, kind: 'project', title: project.title, entity: project })),
    ...tasks.map(task => ({ id: `task:${task.id}`, entityId: task.id, kind: 'task', title: task.title, entity: task })),
    ...local.map(category => ({ id: `local:${category.id}`, entityId: category.id, kind: 'category', source: 'local', title: category.name, entity: category })),
    ...[...definitions.values()].map(category => ({ id: `outlook:${category.name}`, entityId: category.name, kind: 'category', source: 'outlook', title: category.name, entity: category }))
  ];
  const edges = [];
  for (const task of tasks) {
    for (const project of linkedProjects(state, task)) edges.push({ type: 'project', source: `task:${task.id}`, target: `project:${project.id}`, derived: task.projectId !== project.id });
    for (const blocker of task.blockedBy ?? []) if (tasks.some(item => item.id === blocker)) edges.push({ type: 'blocking', source: `task:${blocker}`, target: `task:${task.id}` });
    for (const id of task.localCategoryIds ?? []) if (local.some(category => category.id === id)) edges.push({ type: 'category', source: `task:${task.id}`, target: `local:${id}` });
    for (const name of task.categories ?? []) if (!(task.excludedOutlookCategories ?? []).includes(name)) edges.push({ type: 'category', source: `task:${task.id}`, target: `outlook:${name}` });
  }
  return { nodes, edges };
};

export const pairRelation = (state, selection) => {
  const model = graphModel(state);
  const [first, second] = selection.map(id => model.nodes.find(node => node.id === id));
  if (!first || !second || first.id === second.id) return null;
  if (first.kind === 'task' && second.kind === 'task') return {
    type: 'blocking', task: first, other: second,
    exists: (first.entity.blockedBy ?? []).includes(second.entityId),
    label: `« ${first.title} » est bloquée par « ${second.title} »`
  };
  const task = first.kind === 'task' ? first : second.kind === 'task' ? second : null;
  const other = task === first ? second : first;
  if (!task || !['project', 'category'].includes(other.kind)) return null;
  const type = other.kind === 'project' ? 'project' : 'category';
  return { type, task, other,
    exists: model.edges.some(edge => edge.type === type && edge.source === task.id && edge.target === other.id),
    label: type === 'project' ? `« ${task.title} » appartient au projet « ${other.title} »` : `« ${task.title} » entre dans la catégorie « ${other.title} » (${other.source === 'outlook' ? 'Outlook' : 'locale'})`
  };
};

export const changeRelation = (state, selection, remove = false) => {
  const relation = pairRelation(state, selection);
  if (!relation) return { state, error: 'Choisis une tâche et un projet, une catégorie ou une autre tâche.' };
  const { task, other, type } = relation;
  const tasks = tasksIn(state);
  if (!remove && type === 'blocking' && wouldCreateCycle(tasks, task.entityId, other.entityId)) return { state, error: 'Ce lien créerait une boucle de blocage. Inverse le sens ou retire un autre lien.' };
  const items = tasks.map(item => {
    if (item.id !== task.entityId) return item;
    const next = { ...item, updatedAt: new Date().toISOString() };
    const updateSet = (key, value) => { next[key] = remove ? (item[key] ?? []).filter(id => id !== value) : [...new Set([...(item[key] ?? []), value])]; };
    if (type === 'project') {
      if (!remove) next.projectId = other.entityId;
      else if (item.projectId === other.entityId) next.projectId = null;
      next.excludedProjectIds = remove && matchesProjectCategories(other.entity, item)
        ? [...new Set([...(item.excludedProjectIds ?? []), other.entityId])]
        : (item.excludedProjectIds ?? []).filter(id => id !== other.entityId);
    } else if (type === 'blocking') updateSet('blockedBy', other.entityId);
    else if (other.source === 'local') updateSet('localCategoryIds', other.entityId);
    else {
      updateSet('categories', other.entityId);
      updateSet('manualOutlookCategories', other.entityId);
      next.excludedOutlookCategories = remove
        ? [...new Set([...(item.excludedOutlookCategories ?? []), other.entityId])]
        : (item.excludedOutlookCategories ?? []).filter(name => name !== other.entityId);
      next.categoryColors = (item.categoryColors ?? []).filter(category => category.name !== other.entityId);
      if (!remove && other.entity.color) next.categoryColors.push({ name: other.entityId, color: other.entity.color });
    }
    return next;
  });
  return { state: { ...state, features: { ...state.features, tasks: { ...state.features.tasks, items } } }, error: null };
};

export const layoutGraph = ({ nodes, edges }, previous = {}) => {
  const points = Object.fromEntries(nodes.map((node, index) => {
    const angle = index * 2.3999632297;
    const radius = 110 + 38 * Math.sqrt(index);
    return [node.id, { x: Number.isFinite(previous[node.id]?.x) ? previous[node.id].x : 500 + Math.cos(angle) * radius, y: Number.isFinite(previous[node.id]?.y) ? previous[node.id].y : 340 + Math.sin(angle) * radius }];
  }));
  // Bounded deterministic force layout, computed only on request (never an idle animation).
  const stride = Math.max(1, Math.ceil(nodes.length / 200));
  for (let tick = 0; tick < (nodes.length > 200 ? 60 : 90); tick++) {
    const forces = Object.fromEntries(nodes.map(node => [node.id, { x: (500 - points[node.id].x) * .008, y: (340 - points[node.id].y) * .008 }]));
    for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b += stride) {
      const pa = points[nodes[a].id], pb = points[nodes[b].id];
      const dx = pa.x - pb.x || .01, dy = pa.y - pb.y || .01;
      const distance = Math.max(35, Math.hypot(dx, dy));
      const force = Math.min(12, 17000 / distance ** 2);
      forces[nodes[a].id].x += dx / distance * force; forces[nodes[a].id].y += dy / distance * force;
      forces[nodes[b].id].x -= dx / distance * force; forces[nodes[b].id].y -= dy / distance * force;
    }
    for (const edge of edges) {
      if (!points[edge.source] || !points[edge.target]) continue;
      const dx = points[edge.target].x - points[edge.source].x, dy = points[edge.target].y - points[edge.source].y;
      const distance = Math.hypot(dx, dy) || 1, force = (distance - 190) * .018;
      forces[edge.source].x += dx / distance * force; forces[edge.source].y += dy / distance * force;
      forces[edge.target].x -= dx / distance * force; forces[edge.target].y -= dy / distance * force;
    }
    for (const node of nodes) { points[node.id].x += forces[node.id].x; points[node.id].y += forces[node.id].y; }
  }
  return points;
};

export const fitGraph = positions => {
  const points = Object.values(positions).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!points.length) return { x: 0, y: 0, width: 1000, height: 680 };
  const minX = Math.min(...points.map(point => point.x)) - 120, maxX = Math.max(...points.map(point => point.x)) + 120;
  const minY = Math.min(...points.map(point => point.y)) - 100, maxY = Math.max(...points.map(point => point.y)) + 100;
  return { x: minX, y: minY, width: Math.max(400, maxX - minX), height: Math.max(300, maxY - minY) };
};
