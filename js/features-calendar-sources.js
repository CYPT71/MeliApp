import { features as baseFeatures } from "./features.js";
import { calendarRange } from "./domain/calendar.js";
import { CALENDAR_ROLES, normalizeCalendarRole } from "./domain/calendar-classification.js";

const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;
const setFeatureState = (state, name, next) => ({
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

const roleLabel = (role) => role === CALENDAR_ROLES.TASK
  ? "Tâches"
  : role === CALENDAR_ROLES.APPOINTMENT
    ? "Rendez-vous"
    : "Les deux";

const renderSources = ({ state }) => {
  const calendars = state.calendar?.calendars ?? [];
  const roles = featureState(state, "calendarSources", { roles: {} }).roles ?? {};
  const root = node("section", { className: "stack" }, [
    node("div", { className: "stack compact" }, [
      node("h2", { text: "Type d’agenda" }),
      node("p", { className: "muted", text: "Classe chaque agenda en tâches, rendez-vous ou les deux. Pour “les deux”, MeliApp fait d’abord une détection simple : lieu ou réunion en ligne = rendez-vous ; sinon = tâche." })
    ])
  ]);

  if (!calendars.length) {
    root.append(node("p", { className: "muted", text: "Synchronise Outlook pour charger tes agendas." }));
    return root;
  }

  for (const calendar of calendars) {
    const role = normalizeCalendarRole(roles[calendar.id]);
    const select = node("select", {
      "data-action": "calendar.source-role",
      "data-calendar-id": calendar.id,
      "aria-label": `Type de l’agenda ${calendar.name}`
    }, [
      node("option", { value: CALENDAR_ROLES.BOTH, selected: role === CALENDAR_ROLES.BOTH, text: "Les deux" }),
      node("option", { value: CALENDAR_ROLES.TASK, selected: role === CALENDAR_ROLES.TASK, text: "Tâches" }),
      node("option", { value: CALENDAR_ROLES.APPOINTMENT, selected: role === CALENDAR_ROLES.APPOINTMENT, text: "Rendez-vous" })
    ]);
    const eventCount = (state.calendar?.events ?? []).filter((event) => event.calendarId === calendar.id).length;
    root.append(node("div", { className: "list-item row row--between" }, [
      node("div", { className: "stack compact" }, [
        node("strong", { text: `${calendar.name}${calendar.isDefaultCalendar ? " · principal" : ""}` }),
        node("small", { className: "muted", text: `${eventCount} élément${eventCount > 1 ? "s" : ""} chargé${eventCount > 1 ? "s" : ""} · ${roleLabel(role)}` })
      ]),
      select
    ]));
  }
  return root;
};

const syncRun = async ({ state, services }) => {
  if (!services.outlook?.isConnected?.()) return state;
  try {
    const now = Date.now();
    const range = calendarRange(state.features?.calendarView);
    const nearToday = +range.end >= now - 86400000 && +range.start <= now + 14 * 86400000;
    const from = new Date(nearToday ? Math.min(+range.start, now - 86400000) : +range.start).toISOString();
    const to = new Date(nearToday ? Math.max(+range.end, now + 14 * 86400000) : +range.end).toISOString();
    let calendars = await services.outlook.listCalendars?.();
    if (!Array.isArray(calendars) || !calendars.length) calendars = [{ id: "default", name: "Calendrier principal", isDefaultCalendar: true, fallback: true }];
    const groups = await Promise.all(calendars.map(async (calendar) => services.outlook.listEvents({
      from,
      to,
      calendarId: calendar.fallback ? null : calendar.id,
      calendarName: calendar.name
    })));
    const events = groups.flat();
    const syncedAt = new Date().toISOString();
    return {
      ...setFeatureState(state, "outlookSync", { syncing: false, lastSyncAt: syncedAt, error: null }),
      auth: { ...state.auth, microsoft: { ...(state.auth?.microsoft ?? {}), connected: true } },
      calendar: { events, calendars, lastSyncAt: syncedAt }
    };
  } catch (error) {
    const next = setFeatureState(state, "outlookSync", (current) => ({
      ...current,
      syncing: false,
      error: error instanceof Error ? error.message : String(error)
    }));
    if (services.outlook?.isConnected?.() !== false) return next;
    return {
      ...setFeatureState(next, "microsoftAuth", { status: "disconnected", error: null, connectionLost: true }),
      auth: { ...next.auth, microsoft: null }
    };
  }
};

export const calendarSourceFeatures = {
  outlookSync: {
    ...baseFeatures.outlookSync,
    run: syncRun
  },

  calendarSources: {
    description: "Classement des agendas en tâches et rendez-vous",
    state: { roles: {} },
    when: ["calendar:source-role"],
    run: ({ state, payload }) => {
      const calendarId = String(payload?.calendarId ?? "");
      if (!calendarId) return state;
      const role = normalizeCalendarRole(payload?.role);
      return setFeatureState(state, "calendarSources", (current) => ({
        ...current,
        roles: { ...(current.roles ?? {}), [calendarId]: role }
      }));
    },
    ui: {
      order: 4,
      render: renderSources,
      actions: {
        "calendar.source-role": ({ target, dispatch }) => dispatch("calendar:source-role", {
          calendarId: target.dataset.calendarId,
          role: target.value
        })
      }
    }
  }
};
