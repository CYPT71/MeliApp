const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;
const setFeatureState = (state, name, next, fallback = {}) => ({
  ...state,
  features: {
    ...(state.features ?? {}),
    [name]: typeof next === "function" ? next(featureState(state, name, fallback)) : next
  }
});

const node = (tag, attrs = {}, children = []) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "className") element.className = value;
    else if (key === "text") element.textContent = String(value);
    else if (key === "selected") element.selected = Boolean(value);
    else element.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of (Array.isArray(children) ? children : [children])) {
    if (child === undefined || child === null || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
};

const button = (label, action, attrs = {}) => node("button", { type: "button", "data-action": action, ...attrs, text: label });
const clampRange = (value, fallback = 120) => Math.min(1440, Math.max(15, Number(value) || fallback));
const normalizeRole = (value) => ["tasks", "appointments", "both"].includes(value) ? value : "both";
const normalizePlacement = (value) => value === "fixed" ? "fixed" : "flexible";
const eventKey = (event) => `${event.calendarId ?? "default"}:${event.id ?? event.start ?? event.title ?? "event"}`;

const dataAttrs = (data = {}) => Object.fromEntries(Object.entries(data).map(([key, value]) => [`data-${key}`, value]));

const segmented = ({ label, value, action, data, options }) => node("div", { className: "segmented-control", role: "group", "aria-label": label },
  options.map((option) => button(option.label, action, {
    className: `segment${option.value === value ? " is-active" : ""}`,
    "aria-pressed": option.value === value,
    "data-value": option.value,
    ...dataAttrs(data)
  }))
);

const rangeControl = ({ value, action, data = {} }) => node("label", { className: "flex-range stack compact" }, [
  node("span", { className: "preference-label", text: "Marge de déplacement" }),
  node("div", { className: "row" }, [
    node("input", { type: "range", min: 15, max: 360, step: 15, value, "data-action": action, ...dataAttrs(data) }),
    node("strong", { text: `±${value} min` })
  ])
]);

const renderCalendar = (calendar, state) => {
  const preferences = featureState(state, "schedulePreferences", { defaultFlexRangeMinutes: 120 });
  const sources = featureState(state, "calendarSources", {});
  const currentRole = normalizeRole(sources.roles?.[calendar.id]);
  const currentPlacement = normalizePlacement(sources.placementByCalendar?.[calendar.id]);
  const range = clampRange(sources.rangeByCalendar?.[calendar.id], preferences.defaultFlexRangeMinutes);
  const count = (state.calendar?.events ?? []).filter((event) => event.calendarId === calendar.id).length;
  return node("article", { className: "schedule-pref-card stack" }, [
    node("div", { className: "row row--between" }, [
      node("div", { className: "stack compact" }, [
        node("strong", { text: `${calendar.name}${calendar.isDefaultCalendar ? " · principal" : ""}` }),
        node("small", { className: "muted", text: `${count} élément${count > 1 ? "s" : ""} synchronisé${count > 1 ? "s" : ""}` })
      ]),
      node("span", { className: `placement-pill placement-pill--${currentPlacement}`, text: currentPlacement === "fixed" ? "📌 Fixe" : "↔ Flexible" })
    ]),
    node("div", { className: "preference-block stack compact" }, [
      node("span", { className: "preference-label", text: "Nature des éléments" }),
      segmented({
        label: `Nature des éléments de ${calendar.name}`,
        value: currentRole,
        action: "schedule.calendar-role",
        data: { "calendar-id": calendar.id },
        options: [
          { value: "tasks", label: "✓ À faire" },
          { value: "appointments", label: "📍 Rendez-vous" },
          { value: "both", label: "✨ Mélangé" }
        ]
      }),
      node("small", { className: "muted", text: currentRole === "both"
        ? "En mode mélangé, lieu ou lien de réunion = rendez-vous ; sinon MeliApp suppose plutôt une chose à faire."
        : currentRole === "tasks"
          ? "Ces éléments deviennent des actions à caser avant leur échéance."
          : "Ces éléments occupent un créneau de ton agenda." })
    ]),
    node("div", { className: "preference-block stack compact" }, [
      node("span", { className: "preference-label", text: "Placement par défaut" }),
      segmented({
        label: `Placement des éléments de ${calendar.name}`,
        value: currentPlacement,
        action: "schedule.calendar-placement",
        data: { "calendar-id": calendar.id },
        options: [
          { value: "fixed", label: "📌 Fixe" },
          { value: "flexible", label: "↔ Flexible" }
        ]
      }),
      node("small", { className: "muted", text: currentPlacement === "fixed"
        ? "L’horaire ne bouge pas et bloque le planning."
        : "MeliApp peut déplacer l’élément dans la marge autorisée." }),
      currentPlacement === "flexible" ? rangeControl({ value: range, action: "schedule.calendar-range", data: { "calendar-id": calendar.id } }) : null
    ])
  ]);
};

const renderItem = ({ title, subtitle, placement, range, action, rangeAction, data }) => node("article", { className: "schedule-item-row stack compact" }, [
  node("div", { className: "row row--between" }, [
    node("div", { className: "stack compact" }, [node("strong", { text: title }), node("small", { className: "muted", text: subtitle })]),
    segmented({
      label: `Placement de ${title}`,
      value: placement,
      action,
      data,
      options: [
        { value: "fixed", label: "📌 Fixe" },
        { value: "flexible", label: "↔ Flexible" }
      ]
    })
  ]),
  placement === "flexible" ? rangeControl({ value: range, action: rangeAction, data }) : null
]);

const render = ({ state }) => {
  const current = featureState(state, "schedulePreferences", { defaultFlexRangeMinutes: 120 });
  const sources = featureState(state, "calendarSources", {});
  const defaultRange = clampRange(current.defaultFlexRangeMinutes, 120);
  const root = node("section", { className: "stack schedule-preferences" }, [
    node("div", { className: "settings-hero stack compact" }, [
      node("span", { className: "eyebrow", text: "Organisation du planning" }),
      node("h2", { text: "Qu’est-ce qui peut bouger ?" }),
      node("p", { className: "muted", text: "La nature et le placement sont séparés : “À faire / Rendez-vous” dit ce que c’est. “Fixe / Flexible” dit si MeliApp peut le déplacer." })
    ]),
    node("div", { className: "schedule-legend" }, [
      node("div", { className: "legend-card", text: "✓ À faire · une action à réaliser" }),
      node("div", { className: "legend-card", text: "📍 Rendez-vous · du temps réservé" }),
      node("div", { className: "legend-card", text: "📌 Fixe · horaire intouchable" }),
      node("div", { className: "legend-card", text: "↔ Flexible · peut glisser" })
    ]),
    node("div", { className: "preference-block stack compact" }, [
      node("strong", { text: "Marge flexible par défaut" }),
      node("small", { className: "muted", text: "Utilisée quand un élément flexible n’a pas sa propre marge." }),
      rangeControl({ value: defaultRange, action: "schedule.default-range" })
    ])
  ]);

  root.append(node("h3", { text: "Agendas Outlook" }));
  const calendars = state.calendar?.calendars ?? [];
  if (!calendars.length) root.append(node("p", { className: "muted", text: "Synchronise Outlook une fois pour faire apparaître tes agendas ici." }));
  for (const calendar of calendars) root.append(renderCalendar(calendar, state));

  root.append(node("h3", { text: "Tâches actives" }));
  const tasks = (featureState(state, "tasks", { items: [] }).items ?? []).filter((task) => task.status !== "completed" && !task.parentTaskId).slice(0, 12);
  if (!tasks.length) root.append(node("p", { className: "muted", text: "Aucune tâche active à régler." }));
  for (const task of tasks) {
    const taskPlacement = normalizePlacement(task.scheduleMode);
    root.append(renderItem({
      title: task.title,
      subtitle: task.deadline ? `Échéance ${new Date(task.deadline).toLocaleString("fr-FR")}` : "Sans échéance",
      placement: taskPlacement,
      range: clampRange(task.flexRangeMinutes, defaultRange),
      action: "schedule.task-placement",
      rangeAction: "schedule.task-range",
      data: { id: task.id }
    }));
  }

  root.append(node("h3", { text: "Prochains éléments Outlook" }));
  const upcoming = [...(state.calendar?.events ?? [])]
    .filter((event) => new Date(event.end).getTime() > Date.now())
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, 12);
  if (!upcoming.length) root.append(node("p", { className: "muted", text: "Aucun élément Outlook à venir dans la période chargée." }));
  for (const event of upcoming) {
    const key = eventKey(event);
    const calendarPlacement = normalizePlacement(sources.placementByCalendar?.[event.calendarId]);
    const itemPlacement = normalizePlacement(sources.itemPlacements?.[key] ?? calendarPlacement);
    const calendarRange = clampRange(sources.rangeByCalendar?.[event.calendarId], defaultRange);
    root.append(renderItem({
      title: event.title ?? "Élément Outlook",
      subtitle: `${event.calendarName ?? "Outlook"} · ${new Date(event.start).toLocaleString("fr-FR")}`,
      placement: itemPlacement,
      range: clampRange(sources.itemRanges?.[key], calendarRange),
      action: "schedule.event-placement",
      rangeAction: "schedule.event-range",
      data: { key }
    }));
  }
  return root;
};

export const schedulePreferenceFeatures = {
  schedulePreferences: {
    description: "Nature et flexibilité des agendas, tâches et événements",
    state: { defaultFlexRangeMinutes: 120 },
    when: [
      "schedule:default-range", "schedule:calendar-role", "schedule:calendar-placement", "schedule:calendar-range",
      "schedule:event-placement", "schedule:event-range", "schedule:task-placement", "schedule:task-range"
    ],
    run: ({ state, event, payload }) => {
      const defaultRange = clampRange(featureState(state, "schedulePreferences", {}).defaultFlexRangeMinutes, 120);
      if (event === "schedule:default-range") return setFeatureState(state, "schedulePreferences", (value) => ({ ...value, defaultFlexRangeMinutes: clampRange(payload?.minutes, defaultRange) }));
      if (event === "schedule:task-placement" || event === "schedule:task-range") {
        const tasks = featureState(state, "tasks", { items: [] });
        return setFeatureState(state, "tasks", {
          ...tasks,
          items: (tasks.items ?? []).map((task) => task.id === payload?.id ? {
            ...task,
            ...(event === "schedule:task-placement" ? { scheduleMode: normalizePlacement(payload?.placement) } : { flexRangeMinutes: clampRange(payload?.minutes, defaultRange) }),
            updatedAt: new Date().toISOString()
          } : task)
        });
      }
      const calendarId = String(payload?.calendarId ?? "");
      const key = String(payload?.key ?? "");
      return setFeatureState(state, "calendarSources", (value) => {
        if (event === "schedule:calendar-role" && calendarId) return { ...value, roles: { ...(value.roles ?? {}), [calendarId]: normalizeRole(payload?.role) } };
        if (event === "schedule:calendar-placement" && calendarId) return { ...value, placementByCalendar: { ...(value.placementByCalendar ?? {}), [calendarId]: normalizePlacement(payload?.placement) } };
        if (event === "schedule:calendar-range" && calendarId) return { ...value, rangeByCalendar: { ...(value.rangeByCalendar ?? {}), [calendarId]: clampRange(payload?.minutes, defaultRange) } };
        if (event === "schedule:event-placement" && key) return { ...value, itemPlacements: { ...(value.itemPlacements ?? {}), [key]: normalizePlacement(payload?.placement) } };
        if (event === "schedule:event-range" && key) return { ...value, itemRanges: { ...(value.itemRanges ?? {}), [key]: clampRange(payload?.minutes, defaultRange) } };
        return value;
      }, {});
    },
    ui: {
      order: 3,
      render,
      actions: {
        "schedule.default-range": ({ target, dispatch }) => dispatch("schedule:default-range", { minutes: target.value }),
        "schedule.calendar-role": ({ target, dispatch }) => dispatch("schedule:calendar-role", { calendarId: target.dataset.calendarId, role: target.dataset.value }),
        "schedule.calendar-placement": ({ target, dispatch }) => dispatch("schedule:calendar-placement", { calendarId: target.dataset.calendarId, placement: target.dataset.value }),
        "schedule.calendar-range": ({ target, dispatch }) => dispatch("schedule:calendar-range", { calendarId: target.dataset.calendarId, minutes: target.value }),
        "schedule.event-placement": ({ target, dispatch }) => dispatch("schedule:event-placement", { key: target.dataset.key, placement: target.dataset.value }),
        "schedule.event-range": ({ target, dispatch }) => dispatch("schedule:event-range", { key: target.dataset.key, minutes: target.value }),
        "schedule.task-placement": ({ target, dispatch }) => dispatch("schedule:task-placement", { id: target.dataset.id, placement: target.dataset.value }),
        "schedule.task-range": ({ target, dispatch }) => dispatch("schedule:task-range", { id: target.dataset.id, minutes: target.value })
      }
    }
  }
};
