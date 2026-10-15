import { graphModel, changeRelation, layoutGraph, fitGraph } from './domain/mindmap.js';
import { renderMindmap } from './ui/mindmap.js';

const update = (state, value) => ({ ...state, features: { ...state.features, taskMindmap: value } });
const get = state => state.features.taskMindmap ?? {};
const refresh = async (dispatch, event, payload) => {
  const state = await dispatch(event, payload);
  if (!state.features.taskMindmap.error) await dispatch('task:links-changed');
};
const zoom = (current, factor) => {
  const view = current.viewport ?? { x: 0, y: 0, width: 1000, height: 680 };
  const width = Math.max(180, Math.min(12000, view.width * factor));
  const ratio = width / view.width;
  return { x: view.x + (view.width - width) / 2, y: view.y + (view.height - view.height * ratio) / 2, width, height: view.height * ratio };
};
const syncNodes = state => {
  const current = get(state), model = graphModel(state);
  const previous = current.positions ?? {};
  const missing = model.nodes.some(node => !Number.isFinite(previous[node.id]?.x) || !Number.isFinite(previous[node.id]?.y));
  const positions = missing ? layoutGraph(model, previous) : Object.fromEntries(model.nodes.map(node => [node.id, previous[node.id]]));
  return update(state, { ...current, positions, viewport: missing ? fitGraph(positions) : current.viewport, selection: (current.selection ?? []).filter(id => model.nodes.some(node => node.id === id)) });
};

export const mindmapFeatures = {
  taskMindmap: {
    description: 'Graphe interactif',
    state: { selection: [], positions: {}, viewport: null, categories: [], query: '', error: null, message: null },
    when: ['app:start', 'task:created', 'task:updated', 'task:deleted', 'project:create', 'project:update', 'project:delete', 'calendar:synced', 'data:import', 'data:reset', 'mindmap:select', 'mindmap:choose', 'mindmap:clear', 'mindmap:reverse', 'mindmap:link', 'mindmap:move', 'mindmap:viewport', 'mindmap:zoom', 'mindmap:fit', 'mindmap:focus', 'mindmap:layout', 'mindmap:search', 'mindmap:category'],
    run: ({ state, event, payload }) => {
      const current = get(state);
      const selected = current.selection ?? [];
      if (event === 'mindmap:select') {
        const id = payload?.id;
        if (!graphModel(state).nodes.some(node => node.id === id)) return state;
        return update(state, { ...current, selection: selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id].slice(-2), error: null, message: null });
      }
      if (event === 'mindmap:choose') {
        const selection = [...selected];
        if (payload.index === 0) selection[0] = payload.id;
        else selection[1] = payload.id;
        return update(state, { ...current, selection: [...new Set(selection.filter(Boolean))], error: null, message: null });
      }
      if (event === 'mindmap:clear') return update(state, { ...current, selection: [], error: null, message: null });
      if (event === 'mindmap:reverse') return update(state, { ...current, selection: [...selected].reverse(), error: null, message: null });
      if (event === 'mindmap:link') {
        const result = changeRelation(state, selected, payload?.remove);
        return syncNodes(update(result.state, { ...get(result.state), error: result.error, message: result.error ? null : payload?.remove ? 'Lien supprimé.' : 'Lien créé.' }));
      }
      if (event === 'mindmap:search') return update(state, { ...current, query: String(payload?.query ?? '') });
      if (event === 'mindmap:move') {
        if (!Number.isFinite(payload?.x) || !Number.isFinite(payload?.y) || !graphModel(state).nodes.some(node => node.id === payload.id)) return state;
        return update(state, { ...current, positions: { ...current.positions, [payload.id]: { x: payload.x, y: payload.y } } });
      }
      if (event === 'mindmap:viewport') {
        if (!['x', 'y', 'width', 'height'].every(key => Number.isFinite(payload?.[key])) || payload.width <= 0 || payload.height <= 0) return state;
        return update(state, { ...current, viewport: payload });
      }
      if (event === 'mindmap:zoom') return update(state, { ...current, viewport: zoom(current, payload.factor) });
      if (event === 'mindmap:fit') return update(state, { ...current, viewport: fitGraph(current.positions ?? {}) });
      if (event === 'mindmap:focus') return update(state, { ...current, viewport: fitGraph(Object.fromEntries(Object.entries(current.positions ?? {}).filter(([id]) => selected.includes(id)))) });
      if (event === 'mindmap:layout') {
        const positions = layoutGraph(graphModel(state));
        return update(state, { ...current, positions, viewport: fitGraph(positions), message: 'Carte réorganisée. Tu peux déplacer chaque nœud librement.' });
      }
      if (event === 'mindmap:category') {
        const name = String(payload?.name ?? '').trim().slice(0, 80);
        if (!name) return update(state, { ...current, error: 'Donne un nom à la catégorie.' });
        if ((current.categories ?? []).some(category => category.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'))) return update(state, { ...current, error: 'Cette catégorie locale existe déjà.' });
        const category = { id: crypto.randomUUID(), name };
        return syncNodes(update(state, { ...current, categories: [...(current.categories ?? []), category], selection: [`local:${category.id}`], error: null, message: 'Catégorie locale créée.' }));
      }
      if (event === 'data:reset') return update(state, { selection: [], positions: {}, viewport: null, categories: [], query: '', error: null, message: null });
      return syncNodes(state);
    },
    ui: {
      order: 20,
      render: renderMindmap,
      actions: {
        'mindmap.select': ({ target, dispatch }) => dispatch('mindmap:select', { id: target.dataset.id }),
        'mindmap.choose-first': ({ event, target, dispatch }) => event.type === 'change' ? dispatch('mindmap:choose', { index: 0, id: target.value }) : undefined,
        'mindmap.choose-second': ({ event, target, dispatch }) => event.type === 'change' ? dispatch('mindmap:choose', { index: 1, id: target.value }) : undefined,
        'mindmap.clear': ({ dispatch }) => dispatch('mindmap:clear'),
        'mindmap.reverse': ({ dispatch }) => dispatch('mindmap:reverse'),
        'mindmap.add-link': ({ dispatch }) => refresh(dispatch, 'mindmap:link', { remove: false }),
        'mindmap.remove-link': ({ dispatch }) => refresh(dispatch, 'mindmap:link', { remove: true }),
        'mindmap.layout': ({ dispatch }) => dispatch('mindmap:layout'),
        'mindmap.fit': ({ dispatch }) => dispatch('mindmap:fit'),
        'mindmap.focus': ({ dispatch }) => dispatch('mindmap:focus'),
        'mindmap.zoom-in': ({ dispatch }) => dispatch('mindmap:zoom', { factor: .8 }),
        'mindmap.zoom-out': ({ dispatch }) => dispatch('mindmap:zoom', { factor: 1.25 }),
        'mindmap.search': ({ event, target, dispatch }) => event.type === 'input' ? dispatch('mindmap:search', { query: target.value }) : undefined,
        'mindmap.create-category': async ({ target, dispatch }) => {
          const form = target.closest('form');
          const next = await dispatch('mindmap:category', { name: form.elements.namedItem('categoryName').value });
          if (!next.features.taskMindmap.error) form.reset();
        }
      }
    }
  }
};
