import test from 'node:test';
import assert from 'node:assert/strict';
import { planningInputs } from '../js/domain/planning-inputs.js';
import { buildAdaptiveWeekPlan } from '../js/domain/weekly-planning.js';
import { features } from '../js/features.js';
import { adaptiveScheduleFeatures } from '../js/features-adaptive-schedule.js';
import { schedulePreferenceFeatures } from '../js/features-schedule-preferences.js';
const now = Date.parse('2026-10-19T08:00:00Z');
const task = (id, more = {}) => ({ id, title: id, estimateMinutes: 90, status: 'active', difficulty: 3, importance: 3, splittable: true, ...more });
const fixture = () => ({ features: { tasks: { items: [task('future'), task('past', { deadline: '2026-10-18T17:00:00Z' }), task('done', { status: 'completed' }), task('progress', { progress: 1 })] }, energy: { value: 2 }, settings: { dayStart: '08:00', dayEnd: '17:00' }, calendarSources: { roles: { work: 'appointments', todo: 'tasks' }, placementByCalendar: { todo: 'flexible' } } }, calendar: { events: [{ id: 'old', calendarId: 'todo', title: 'Old', start: '2026-10-18T10:00:00Z', end: '2026-10-18T11:00:00Z' }, { id: 'meeting', calendarId: 'work', title: 'Meeting', start: '2026-10-19T10:00:00Z', end: '2026-10-19T11:00:00Z' }] } });
const week = (inputs, energy = 5) => buildAdaptiveWeekPlan({ ...inputs, energy, from: now, dayStart: '08:00', dayEnd: '17:00', bufferMinutes: 10 });

test('past, completed and progress=100% are ignored without modifying user data', () => {
  const state = fixture(), before = structuredClone(state);
  const inputs = planningInputs(state, now), plan = week(inputs);
  assert.deepEqual(inputs.tasks.map(t => t.id), ['future']);
  assert.equal(inputs.events.length, 1);
  assert.deepEqual(state, before);
  assert.ok(plan.blocks.filter(b => b.type === 'task').every(b => b.taskId === 'future' && b.start >= now));
});
test('energy changes actual session length, recovery and weekly capacity', () => {
  const inputs = { tasks: [task('big', { estimateMinutes: 20000 })], events: [] };
  const low = week(inputs, 2), high = week(inputs, 9);
  const work = plan => plan.blocks.filter(b => b.type === 'task');
  assert.ok(Math.max(...work(low).map(b => b.minutes)) < Math.max(...work(high).map(b => b.minutes)));
  assert.ok(work(low).reduce((a,b) => a+b.minutes,0) < work(high).reduce((a,b) => a+b.minutes,0));
  assert.ok(low.unscheduled[0].remainingMinutes > high.unscheduled[0].remainingMinutes);
});
test('week conserves remaining minutes and respects windows, deadlines, and symmetric meeting buffers', () => {
  const inputs = planningInputs(fixture(), now);
  inputs.tasks = [task('precise', { estimateMinutes: 37, progress: .5, earliestStart: '2026-10-19T11:10:00Z', deadline: '2026-10-19T14:00:00Z' }), task('long', { estimateMinutes: 90, splittable: false })];
  const plan = week(inputs, 9), work = plan.blocks.filter(b => b.type === 'task');
  for (const t of inputs.tasks) assert.equal(work.filter(b => b.taskId === t.id).reduce((a,b) => a+b.minutes,0) + (plan.unscheduled.find(u => u.id === t.id)?.remainingMinutes ?? 0), Math.ceil(t.estimateMinutes * (1-(t.progress ?? 0))));
  for (const block of work) {
    assert.ok(block.end <= Date.parse('2026-10-19T09:50:00Z') || block.start >= Date.parse('2026-10-19T11:10:00Z'));
    if (block.taskId === 'precise') assert.ok(block.start >= Date.parse(inputs.tasks[0].earliestStart) && block.end <= Date.parse(inputs.tasks[0].deadline));
  }
  assert.equal(work.filter(b => b.taskId === 'long').length, 1);
});
test('imported tasks and existing planning blocks do not double the workload', () => {
  const state = fixture();
  state.features.tasks.items = [task('a', { sourceEventId: 'source', sourceCalendarId: 'todo' })];
  state.calendar.events.push({ id: 'source', calendarId: 'todo', title: 'a', start: '2026-10-19T14:00:00Z', end: '2026-10-19T15:30:00Z' }, { id: 'published', title: '🎯 a', planningTaskId: 'a', isPlanningBlock: true, start: '2026-10-19T12:00:00Z', end: '2026-10-19T12:30:00Z' });
  const inputs = planningInputs(state, now);
  assert.equal(inputs.tasks.length, 1); assert.equal(inputs.tasks[0].estimateMinutes, 60);
});
test('saved energy survives expiry and only explicit changes replace it', () => {
  const state = { features: { energy: { value: 2.2, updatedAt: '2020-01-01T00:00:00Z', expiresAfterMinutes: 180 } } };
  const resumed = features.energy.run({ state, event: 'app:resume' });
  assert.equal(resumed.features.energy.value, 2.2); assert.equal(resumed.features.energy.needsRefresh, true);
  const saved = features.energy.run({ state: resumed, event: 'energy:set', payload: { value: 8 } });
  assert.equal(saved.features.energy.value, 8); assert.equal(saved.features.energy.needsRefresh, false);
});
test('all schedule preference actions update the intended setting without changing other tasks', () => {
  const f = schedulePreferenceFeatures.schedulePreferences;
  const cases = [
    ['schedule:default-range', { minutes: 45 }, s => s.features.schedulePreferences.defaultFlexRangeMinutes === 45],
    ['schedule:calendar-role', { calendarId: 'work', role: 'tasks' }, s => s.features.calendarSources.roles.work === 'tasks'],
    ['schedule:calendar-placement', { calendarId: 'work', placement: 'fixed' }, s => s.features.calendarSources.placementByCalendar.work === 'fixed'],
    ['schedule:calendar-range', { calendarId: 'work', minutes: 60 }, s => s.features.calendarSources.rangeByCalendar.work === 60],
    ['schedule:event-placement', { key: 'work:meeting', placement: 'fixed' }, s => s.features.calendarSources.itemPlacements['work:meeting'] === 'fixed'],
    ['schedule:event-range', { key: 'work:meeting', minutes: 30 }, s => s.features.calendarSources.itemRanges['work:meeting'] === 30],
    ['schedule:task-placement', { id: 'future', placement: 'fixed' }, s => s.features.tasks.items[0].scheduleMode === 'fixed'],
    ['schedule:task-range', { id: 'future', minutes: 75 }, s => s.features.tasks.items[0].flexRangeMinutes === 75]
  ];
  for (const [event, payload, check] of cases) { const initial = fixture(); const result = f.run({ state: initial, event, payload }); assert.ok(check(result), event); assert.deepEqual(result.features.tasks.items.slice(1), initial.features.tasks.items.slice(1)); }
});
test('merge rechecks calendar conflicts and reports service errors without publishing over a new meeting', async () => {
  const f = adaptiveScheduleFeatures.adaptiveSchedule;
  let state = await f.run({ state: fixture(), event: 'adaptive-plan:refresh', services: {} });
  // The fixture is historical relative to runtime: use a future proposal for publication checks.
  const start = Date.now() + 3600000, end = start + 20*60000;
  state.features.adaptiveSchedule.weekly = { generatedAt: new Date().toISOString(), blocks: [{ type: 'task', taskId: 'future', title: 'future', start, end, startIso: new Date(start).toISOString(), endIso: new Date(end).toISOString(), minutes: 20 }] };
  let writes = 0;
  const outlook = { isConnected: () => true, listEvents: async () => [{ id: 'new', calendarId: 'work', title: 'New meeting', start: new Date(start).toISOString(), end: new Date(end).toISOString() }], createPlanningBlocks: async () => { writes++; return []; } };
  const rejected = await f.run({ state, event: 'adaptive-week:merge', services: { outlook } });
  assert.equal(writes, 0); assert.match(rejected.features.adaptiveSchedule.weekly.mergeError, /agenda a changé/);
  outlook.listEvents = async () => []; outlook.createPlanningBlocks = async () => { throw new Error('Graph unavailable'); };
  const failed = await f.run({ state, event: 'adaptive-week:merge', services: { outlook } });
  assert.match(failed.features.adaptiveSchedule.weekly.mergeError, /Graph unavailable/);
  outlook.createPlanningBlocks = async blocks => { writes++; return blocks.map((b,i) => ({ id: String(i) })); };
  const success = await f.run({ state, event: 'adaptive-week:merge', services: { outlook } });
  assert.equal(success.features.adaptiveSchedule.weekly.mergeStatus, 'done');
  await f.run({ state: success, event: 'adaptive-week:merge', services: { outlook } }); assert.equal(writes, 1);
});
import { energyPolicy } from '../js/domain/adaptive-planning.js';
import { normalizeSessionPreferences, sessionOptions } from '../js/domain/session-preferences.js';
test('user session limits and AI recommendations adapt energy without exceeding bounds', () => {
  const preferences={workMinutes:30,breakMinutes:15};
  assert.equal(energyPolicy(9,preferences).workMinutes,30);
  assert.ok(energyPolicy(2,preferences).workMinutes<30);
  assert.equal(energyPolicy(9,{...preferences,recommendedWorkMinutes:20,recommendedBreakMinutes:18}).workMinutes,20);
  assert.equal(energyPolicy(9,{...preferences,recommendedWorkMinutes:999}).workMinutes,30);
  assert.equal(energyPolicy(9,{...preferences,recommendedBreakMinutes:1}).breakMinutes,15);
  assert.deepEqual(normalizeSessionPreferences({workMinutes:999,breakMinutes:-3}),{workMinutes:120,breakMinutes:2,allowAi:true});
  const state={features:{energy:{value:9},sessionPreferences:{...preferences,allowAi:false},cliAi:{optimization:{energy:9,expiresAt:Date.now()+1000,session:{workMinutes:10,breakMinutes:30}}}}};
  assert.equal(sessionOptions(state).recommendedWorkMinutes,undefined);
});
test('refresh and reroll preserve product data; selected calendars and flexible windows constrain inference',async()=>{
  const state=fixture();state.features.calendarView={selectedCalendarIds:['todo']};
  state.calendar.events.push({id:'flex',calendarId:'todo',title:'Révision',start:'2026-10-19T14:00:00Z',end:'2026-10-19T15:00:00Z'});
  state.features.calendarSources.itemRanges={'todo:flex':30};
  const before=structuredClone(state);const inputs=planningInputs(state,now);
  assert.ok(!inputs.events.some(e=>e.id==='meeting'));
  const inferred=inputs.tasks.find(t=>t.sourceEventId==='flex');assert.ok(inferred);assert.ok(Date.parse(inferred.earliestStart)>=Date.parse('2026-10-19T13:30:00Z'));
  for(const event of ['adaptive-plan:refresh','adaptive-week:reroll','energy:set']){
    const result=await adaptiveScheduleFeatures.adaptiveSchedule.run({state,event,services:{}});
    assert.deepEqual(result.features.tasks,state.features.tasks);assert.deepEqual(result.calendar,state.calendar);
    if(event==='adaptive-week:reroll')assert.equal(result.features.adaptiveSchedule.weekly.variant,1);
  }
  assert.deepEqual(state,before);
});
test('retry preflight accepts already published blocks from the same proposal without buffer conflicts',async()=>{
  const start=Date.now()+3600000;
  const blocks=[{type:'task',taskId:'future',title:'future',minutes:20,start,end:start+20*60000},{type:'break',title:'Pause',minutes:10,start:start+20*60000,end:start+30*60000},{type:'task',taskId:'future',title:'future',minutes:20,start:start+30*60000,end:start+50*60000}].map(b=>({...b,startIso:new Date(b.start).toISOString(),endIso:new Date(b.end).toISOString()}));
  const state=fixture();state.features.tasks.items=[task('future')];state.features.adaptiveSchedule={weekly:{generatedAt:new Date().toISOString(),blocks}};
  const existing=blocks.slice(0,2).map((b,i)=>({id:String(i),title:`${b.type==='task'?'🎯':'☕'} ${b.title}`,isPlanningBlock:true,planningTaskId:b.taskId,start:b.startIso,end:b.endIso,showAs:b.type==='break'?'free':'busy'}));
  const outlook={isConnected:()=>true,listEvents:async()=>existing,createPlanningBlocks:async items=>items.map((b,i)=>({id:String(i)}))};
  const result=await adaptiveScheduleFeatures.adaptiveSchedule.run({state,event:'adaptive-week:merge',services:{outlook}});
  assert.equal(result.features.adaptiveSchedule.weekly.mergeStatus,'done');
});
