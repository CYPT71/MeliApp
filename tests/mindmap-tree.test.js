import test from 'node:test';
import assert from 'node:assert/strict';
import { indexTree, visibleTree, moveTaskBranch } from '../js/domain/mindmap-tree.js';
import { features } from '../js/core/registry.js';
import { createApp } from '../js/core/app.js';
import { createInitialState } from '../js/core/state.js';

const tasks = [
  { id: 'parent', title: 'Préparer un voyage', status: 'completed', projectId: 'p' },
  { id: 'child', title: 'Réserver le train', parentTaskId: 'parent', status: 'active', projectId: 'p' },
  { id: 'leaf', title: 'Comparer les prix', parentTaskId: 'child', status: 'active', projectId: 'p' },
  { id: 'other', title: 'Lire', status: 'active' }
];

test('search keeps ancestors and descendants of a matching branch', () => {
  assert.deepEqual([...visibleTree(tasks, { query: 'train' }).visible].sort(), ['child', 'leaf', 'parent']);
  assert.equal(visibleTree(tasks, { query: 'inexistant' }).visible.size, 0);
});

test('hiding completed tasks preserves the context of their unfinished children', () => {
  assert.equal(visibleTree(tasks, { showCompleted: false }).visible.has('parent'), true);
  assert.equal(visibleTree([{ id: 'done', title: 'Finie', status: 'completed' }], { showCompleted: false }).visible.size, 0);
});

test('focus shows only the branch and its ancestor path', () => {
  assert.deepEqual([...visibleTree(tasks, { focusId: 'child' }).visible].sort(), ['child', 'leaf', 'parent']);
});

test('moving a branch updates descendants atomically and leaves other tasks untouched', () => {
  const moved = moveTaskBranch(tasks, 'parent', 'new');
  assert.deepEqual(moved.map(task => task.projectId), ['new', 'new', 'new', undefined]);
  assert.equal(tasks[0].projectId, 'p');
  assert.equal(moved[3], tasks[3]);
});

test('orphaned tasks and imported cycles remain finite and reachable', () => {
  const tree = indexTree([{ id: 'a', parentTaskId: 'b' }, { id: 'b', parentTaskId: 'a' }, { id: 'c', parentTaskId: 'missing' }]);
  assert.equal(tree.roots.length, 2);
  assert.deepEqual([...tree.descendants('a')].sort(), ['a', 'b']);
});

test('branch controls persist in feature state and reject missing project destinations', async () => {
  const state = createInitialState(features);
  state.features.tasks.items = tasks;
  state.features.projects.items = [{ id: 'p', title: 'Voyage' }, { id: 'new', title: 'Autre' }];
  const app = createApp({ registry: features, initialState: state });
  await app.dispatch('mindmap:toggle', { id: 'task:parent' });
  assert.ok(app.getState().features.taskMindmap.collapsedIds.includes('task:parent'));
  await app.dispatch('mindmap:move', { id: 'parent', projectId: 'missing' });
  assert.equal(app.getState().features.tasks.items[0].projectId, 'p');
  await app.dispatch('mindmap:move', { id: 'parent', projectId: 'new' });
  assert.equal(app.getState().features.tasks.items[2].projectId, 'new');
});
