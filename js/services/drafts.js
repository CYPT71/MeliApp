export const DRAFT_FORMS = '.task-quick-create, .project-form, .inspector-form, .task-inline-edit, .split-form, .mindmap-subtask-form';
const keyFor = (form, route) => {
  if (form.classList.contains('project-form')) return `${route}:project:${form.dataset.projectId ?? ''}`;
  if (form.classList.contains('task-quick-create')) return `${route}:task`;
  const action = form.querySelector('[data-action][data-id], [data-action][data-key]');
  return `${route}:${form.classList[0]}:${action?.dataset.id ?? action?.dataset.key ?? ''}`;
};

export const createDraftService = ({ storage, onError }) => {
  let drafts = {};
  let queue = Promise.resolve();
  const save = () => {
    const snapshot = structuredClone(drafts);
    queue = queue.catch(() => {}).then(() => storage.saveDrafts(snapshot));
    queue.catch(onError);
    return queue;
  };
  return {
    async load() { drafts = await storage.loadDrafts() ?? {}; },
    remember(form, route) {
      if (!form?.matches(DRAFT_FORMS)) return;
      // These forms contain task/project fields only, never connection credentials.
      const fields = [...form.elements]
        .filter(input => input.name && !['password', 'file', 'submit', 'button'].includes(input.type))
        .map(input => ({ name: input.name, value: input.value, checked: input.checked, type: input.type }));
      const fieldKey = field => `${field.name}:${field.type}:${['radio', 'checkbox'].includes(field.type) ? field.value : ''}`;
      drafts[keyFor(form, route)] = [...new Map([
        ...(drafts[keyFor(form, route)] ?? []).map(field => [fieldKey(field), field]),
        ...fields.map(field => [fieldKey(field), field])
      ]).values()];
      return save();
    },
    restore(root, route) {
      for (const form of root.querySelectorAll(DRAFT_FORMS)) {
        for (const field of drafts[keyFor(form, route)] ?? []) {
          const input = [...form.elements].find(input => input.name === field.name && input.type === field.type &&
            (!['radio', 'checkbox'].includes(input.type) || input.value === field.value));
          if (!input) continue;
          if (['radio', 'checkbox'].includes(input.type)) input.checked = field.checked;
          else input.value = field.value;
        }
      }
    },
    async clearFor(event, route, payload) {
      if (event === 'tasks:prepare-create') delete drafts['tasks:task'];
      else if (event === 'task:created' || event === 'tasks:create-reset') delete drafts[`${route}:task`];
      else if (event === 'project:create') delete drafts[`${route}:project:`];
      else if (event === 'project:update') {
        for (const key of Object.keys(drafts)) if (key.startsWith(`${route}:project:`) && key !== `${route}:project:`) delete drafts[key];
      } else if (event === 'item-inspector:close' || event?.startsWith('item-inspector:save-')) {
        for (const key of Object.keys(drafts)) if (key.startsWith(`${route}:inspector-form:`)) delete drafts[key];
      } else if (event === 'tasks:edit-close' || event === 'task:updated') {
        for (const key of Object.keys(drafts)) if (key.startsWith(`${route}:task-inline-edit:`)) delete drafts[key];
      } else if (event === 'tasks:split-manual') {
        delete drafts[`${route}:split-form:${payload?.id}`];
        delete drafts[`${route}:mindmap-subtask-form:${payload?.id}`];
      }
      else if (event === 'data:reset') drafts = {};
      else return;
      await save();
    },
    flush: () => queue
  };
};
