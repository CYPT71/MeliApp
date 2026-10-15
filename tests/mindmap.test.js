import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../js/core/app.js';
import { createInitialState } from '../js/core/state.js';
import { features } from '../js/core/registry.js';
import { graphModel, pairRelation, changeRelation, layoutGraph, fitGraph } from '../js/domain/mindmap.js';
import { isTaskBlocked } from '../js/domain/task-links.js';
import { buildAdaptiveDayPlan } from '../js/domain/adaptive-planning.js';
import { refreshImportedTaskMetadata, linkedProjects } from '../js/domain/project-outlook.js';

const initial = () => {
  const state = createInitialState(features);
  state.features.tasks.items = ['a', 'b', 'c'].map(id => ({ id, title: id.toUpperCase(), status: 'active', estimateMinutes: 25, importance: 3, difficulty: 2 }));
  state.features.projects.items = [{ id: 'p', title: 'Projet', outlookCategories: ['Travail'] }];
  state.features.taskMindmap.categories = [{ id: 'local', name: 'Maison' }];
  state.calendar.categories = [{ name: 'Travail', color: 'preset1' }];
  return state;
};

test('project links update real membership and can be removed even when inferred by category', () => {
  let state = initial();
  state = changeRelation(state, ['project:p', 'task:a']).state;
  assert.equal(state.features.tasks.items[0].projectId, 'p');
  state.features.tasks.items[0].categories = ['Travail'];
  state = changeRelation(state, ['task:a', 'project:p'], true).state;
  assert.equal(linkedProjects(state, state.features.tasks.items[0]).length, 0);
  state = changeRelation(state, ['task:a', 'project:p']).state;
  assert.equal(linkedProjects(state, state.features.tasks.items[0]).length, 1);
});

test('local and Outlook categories create distinct links with persistent Outlook overrides', () => {
  let state = initial();
  state = changeRelation(state, ['task:a', 'local:local']).state;
  state = changeRelation(state, ['outlook:Travail', 'task:a']).state;
  assert.deepEqual(state.features.tasks.items[0].localCategoryIds, ['local']);
  assert.deepEqual(state.features.tasks.items[0].categories, ['Travail']);
  state.features.tasks.items[0] = { ...state.features.tasks.items[0], source: 'outlook', sourceEventId: 'event' };
  state = refreshImportedTaskMetadata(state, [{ id: 'event', categories: [], categoryColors: [] }]);
  assert.deepEqual(state.features.tasks.items[0].categories, ['Travail']);
  state = changeRelation(state, ['task:a', 'outlook:Travail'], true).state;
  state = refreshImportedTaskMetadata(state, [{ id: 'event', categories: ['Travail'], categoryColors: [] }]);
  assert.deepEqual(state.features.tasks.items[0].categories, []);
  assert.deepEqual(state.features.tasks.items[0].localCategoryIds, ['local']);
});

test('blocking direction is explicit, duplicates are avoided and cycles are rejected', () => {
  let state = initial();
  state = changeRelation(state, ['task:a', 'task:b']).state;
  state = changeRelation(state, ['task:a', 'task:b']).state;
  assert.deepEqual(state.features.tasks.items[0].blockedBy, ['b']);
  state = changeRelation(state, ['task:b', 'task:c']).state;
  const result = changeRelation(state, ['task:c', 'task:a']);
  assert.match(result.error, /boucle/);
  assert.equal(result.state, state);
  assert.equal(pairRelation(state, ['project:p', 'local:local']), null);
  assert.equal(pairRelation(state, ['task:a', 'task:a']), null);
});

test('blocked tasks cannot complete or enter the planner until their blocker is completed', async () => {
  let state = initial();
  state = changeRelation(state, ['task:a', 'task:b']).state;
  const app = createApp({ registry: features, initialState: state });
  await app.dispatch('task:completed', { id: 'a' });
  assert.equal(app.getState().features.tasks.items[0].status, 'active');
  assert.equal(app.getState().features.game.xp, 0);
  const plan = buildAdaptiveDayPlan({ tasks: state.features.tasks.items, from: '2026-10-15T08:00:00', to: '2026-10-15T20:00:00' });
  assert.equal(plan.blocks.some(block => block.taskId === 'a'), false);
  await app.dispatch('task:completed', { id: 'b' });
  assert.equal(isTaskBlocked(app.getState().features.tasks.items[0], app.getState().features.tasks.items), false);
  await app.dispatch('task:completed', { id: 'a' });
  assert.equal(app.getState().features.tasks.items[0].status, 'completed');
});

test('layout is deterministic, finite and retains one position per entity', () => {
  const model = graphModel(initial());
  const first = layoutGraph(model), second = layoutGraph(model);
  assert.deepEqual(first, second);
  assert.equal(Object.keys(first).length, model.nodes.length);
  for (const point of Object.values(first)) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  const view = fitGraph(first);
  assert.ok(view.width > 0 && view.height > 0);
});
