const categoryKey = (name) => String(name).trim().toLocaleLowerCase("fr");

export const matchesProjectCategories = (project, item) => {
  const wanted = new Set((project.outlookCategories ?? []).map(categoryKey));
  return (item.categories ?? []).some((name) => wanted.has(categoryKey(name)));
};

export const linkedProjects = (state, item) => (state.features?.projects?.items ?? []).filter((project) =>
  project.id === item.projectId || (!(item.excludedProjectIds ?? []).includes(project.id) && matchesProjectCategories(project, item))
);

export const outlookTaskMetadata = (event) => ({
  categories: [...(event.categories ?? [])],
  categoryColors: (event.categoryColors ?? []).map((category) => ({ ...category })),
  sourceCalendarId: event.calendarId ?? null,
  sourceTitle: event.calendarName ?? null
});

// Update only Outlook metadata; user edits, progress and manual project links remain intact.
export const refreshImportedTaskMetadata = (state, events) => {
  const tasks = state.features?.tasks;
  if (!tasks) return state;
  const byId = new Map(events.map((event) => [String(event.id), event]));
  const byCalendar = new Map(events.map((event) => [`${event.calendarId}:${event.id}`, event]));
  const items = (tasks.items ?? []).map((task) => {
    if (task.source !== "outlook" && task.source !== "calendar-auto") return task;
    const event = task.sourceCalendarId ? byCalendar.get(`${task.sourceCalendarId}:${task.sourceEventId}`) : byId.get(String(task.sourceEventId));
    if (!event) return task;
    const metadata = outlookTaskMetadata(event);
    const categories = [...new Set([...metadata.categories, ...(task.manualOutlookCategories ?? [])])]
      .filter(name => !(task.excludedOutlookCategories ?? []).includes(name));
    const colors = new Map(metadata.categoryColors.map(category => [category.name, category]));
    for (const category of task.categoryColors ?? []) if ((task.manualOutlookCategories ?? []).includes(category.name) && !colors.has(category.name)) colors.set(category.name, category);
    return { ...task, ...metadata, categories, categoryColors: [...colors.values()].filter(category => categories.includes(category.name)) };
  });
  return { ...state, features: { ...state.features, tasks: { ...tasks, items } } };
};
