import { exclusionReason } from './planning-eligibility.js';
export const tokens = text => [...new Set(String(text).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])];
export const buildRagIndex = (state, now = Date.now()) => {
  const projects = state.features?.projects?.items ?? [];
  const tasks = (state.features?.tasks?.items ?? []).filter(task => !exclusionReason(task, now));
  const documents = tasks.map(task => {
    const project = projects.find(p => p.id === task.projectId)?.title ?? '';
    const data = { id: task.id, title: task.title, project, deadline: task.deadline ?? null, estimateMinutes: task.estimateMinutes, progress: task.progress ?? 0, difficulty: task.difficulty, importance: task.importance, scheduleMode: task.scheduleMode, parentTaskId: task.parentTaskId, categories: task.categories ?? [] };
    return { id: `task:${task.id}`, kind: 'task', data, terms: tokens(JSON.stringify(data)) };
  });
  for (const event of state.calendar?.events ?? []) {
    if (event.isCancelled || !Number.isFinite(Date.parse(event.end)) || Date.parse(event.end) <= now) continue;
    const data = { id: event.id, title: event.title, start: event.start, end: event.end, calendarId: event.calendarId };
    documents.push({ id: `event:${event.calendarId}:${event.id}`, kind: 'event', data, terms: tokens(JSON.stringify(data)) });
  }
  return { version: 1, indexedAt: new Date(now).toISOString(), documents };
};
export const retrieveContext = (index, query, state, now = Date.now(), limit = 12) => {
  const terms = tokens(query), docs = index.documents ?? [];
  const ranked = docs.map(doc => {
    let score = 0;
    for (const term of terms) if (doc.terms.includes(term)) score += Math.log(1 + docs.length / (1 + docs.filter(d => d.terms.includes(term)).length));
    const deadline = Date.parse(doc.data.deadline ?? doc.data.start);
    if (deadline > now) score += 1 / (1 + (deadline-now)/86400000);
    return { ...doc, score };
  }).sort((a,b) => b.score-a.score || a.id.localeCompare(b.id)).slice(0,limit);
  return { now: new Date(now).toISOString(), energy: state.features?.energy, sessionPreferences: state.features?.sessionPreferences ?? { workMinutes:52, breakMinutes:10, allowAi:true }, workingHours: { dayStart: state.features?.settings?.dayStart, dayEnd: state.features?.settings?.dayEnd }, sources: ranked.map(({ id, kind, data }) => ({ id, kind, ...data })), totalDocuments: docs.length, retrieved: ranked.length };
};
