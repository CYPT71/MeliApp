import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../js/core/app.js';
import { features } from '../js/features.js';
import { dailyProgress } from '../js/ui/rewards.js';

test('a persistence failure is reported without blocking later actions; flush retries saving', async () => {
  let fail = true, errors = 0, saved;
  const app = createApp({
    registry: { counter: { when: ['increment'], run: ({ state }) => ({ count: state.count + 1 }) } },
    initialState: { count: 0 },
    persist: async state => { if (fail) throw new Error('Quota'); saved = state.count; },
    onPersistenceError: () => errors++
  });
  await app.dispatch('increment');
  assert.equal(app.getState().count, 1);
  assert.equal(errors, 1);
  await assert.rejects(app.flush(), /Quota/);
  fail = false;
  await app.dispatch('increment');
  await app.flush();
  assert.equal(saved, 2);
});

test('a task only earns completion XP once, including after reopening', () => {
  let state = { features: { game: { xp: 0 }, tasks: { items: [{ id: 't', title: 'Task', estimateMinutes: 25, difficulty: 2, importance: 3 }] } } };
  state = features.game.run({ state, event: 'task:completed', payload: { id: 't' } });
  const xp = state.features.game.xp;
  assert.ok(xp > 0);
  assert.equal(dailyProgress(state.features.game).completed, 1);
  state = features.game.run({ state, event: 'task:completed', payload: { id: 't' } });
  assert.equal(state.features.game.xp, xp);
  assert.equal(dailyProgress(state.features.game).completed, 1);
});

test('existing completed tasks cannot be used to claim XP again after an upgrade', () => {
  let state = { features: { game: { xp: 100 }, tasks: { items: [{ id: 't', status: 'completed' }] } } };
  state = features.game.run({ state, event: 'app:start' });
  state = features.game.run({ state, event: 'task:completed', payload: { id: 't' } });
  assert.equal(state.features.game.xp, 100);
});
