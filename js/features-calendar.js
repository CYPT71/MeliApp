import { CALENDAR_VIEWS, dateKey, localDate, addDays, calendarRange, eventsForDay, layoutEvents } from "./domain/calendar.js";

const node = (tag, attrs = {}, children = []) => {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === "text") element.textContent = value;
    else if (name === "className") element.className = value;
    else element.setAttribute(name, String(value));
  }
  for (const child of children) if (child) element.append(child);
  return element;
};
const button = (text, action, attrs = {}) => node("button", { type: "button", text, "data-action": action, ...attrs });
const time = (date) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date);
const longDate = (date) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);

// Keep the time slot while navigating days or updating application state.
let viewportPosition = null;

const bindDaySwipe = (element, dispatch) => {
  if (!dispatch) return;
  let gesture = null;
  element.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || !event.isPrimary) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  element.addEventListener("pointercancel", () => { gesture = null; });
  element.addEventListener("pointerup", (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    gesture = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    dispatch("calendar:navigate", { direction: dx < 0 ? 1 : -1 });
  });
};

const eventNode = (segment, timed = false, renderEventActions) => {
  const { event } = segment;
  const label = `${event.title ?? "Événement"} · ${event.allDay ? "Toute la journée" : `${time(new Date(event.start))} – ${time(new Date(event.end))}`}${event.location ? ` · ${event.location}` : ""}`;
  const attrs = { className: "calendar-event", title: label, "aria-label": label };
  if (timed) attrs.style = `top:${segment.top / 1440 * 100}%;height:${Math.max(segment.bottom - segment.top, 15) / 1440 * 100}%;left:calc(${segment.column / segment.columns * 100}% + 2px);width:calc(${100 / segment.columns}% - 4px)`;
  const card = node("details", attrs, [
    node("summary", {}, [node("strong", { text: event.title ?? "Événement" }), node("span", { text: event.allDay ? "Toute la journée" : `${time(new Date(event.start))} – ${time(new Date(event.end))}` })]),
    node("p", { text: label })
  ]);
  if (event.webLink && /^https:\/\/(outlook\.office\.com|outlook\.office365\.com|outlook\.live\.com)\//i.test(event.webLink)) card.append(node("a", { href: event.webLink, target: "_blank", rel: "noopener noreferrer", text: "Ouvrir dans Outlook" }));
  if (renderEventActions) card.append(renderEventActions(event));
  return card;
};

export const calendarViewFeature = {
  description: "Agenda",
  page: { path: "agenda", title: "Agenda", icon: "🗓️", order: 20 },
  state: { view: "week", date: null },
  when: ["app:start", "calendar:view", "calendar:navigate", "calendar:today", "calendar:date"],
  run: ({ state, event, payload }) => {
    const current = state.features?.calendarView ?? {};
    let next = { ...current };
    if (event === "calendar:view" && Object.hasOwn(CALENDAR_VIEWS, payload?.view)) next.view = payload.view;
    if (event === "calendar:today" || event === "app:start") next.date = dateKey(new Date());
    if (event === "calendar:date" && /^\d{4}-\d{2}-\d{2}$/.test(payload?.date ?? "")) next.date = payload.date;
    if (event === "calendar:navigate") next.date = dateKey(addDays(localDate(current.date), (payload?.direction === -1 ? -1 : 1) * CALENDAR_VIEWS[calendarRange(current).view]));
    return { ...state, features: { ...state.features, calendarView: next } };
  },
  ui: {
    render: ({ state, dispatch, renderEventActions }) => {
      const settings = state.features?.calendarView ?? {};
      const { view, days } = calendarRange(settings);
      const events = state.calendar?.events ?? [];
      const label = days.length === 1 ? longDate(days[0]) : `${longDate(days[0])} – ${longDate(days.at(-1))}`;
      const root = node("div", { className: `calendar stack calendar--${view}` });
      root.append(node("div", { className: "calendar-toolbar" }, [
        node("div", { className: "row", role: "group", "aria-label": "Période affichée" }, [
          button("‹", "calendar.previous", { "aria-label": "Période précédente" }),
          button("Aujourd’hui", "calendar.today"),
          button("›", "calendar.next", { "aria-label": "Période suivante" }),
          node("label", { className: "calendar-date" }, [node("span", { text: "Aller au" }), node("input", { type: "date", value: dateKey(localDate(settings.date)), "data-action": "calendar.date", "aria-label": "Choisir une date" })])
        ]),
        node("div", { className: "row", role: "group", "aria-label": "Affichage du calendrier" }, [
          ...[["day", "Journée"], ["three", "3 jours"], ["week", "Semaine"]].map(([id, title]) => button(title, "calendar.view", { "data-view": id, "aria-pressed": view === id, className: view === id ? "is-active" : "" })),
          button("Synchroniser", "calendar.sync")
        ])
      ]));
      root.append(node("p", { className: "calendar-period", role: "status", text: label }));
      if (state.features?.outlookSync?.error) root.append(node("p", { role: "status", className: "connection-message", text: "La synchronisation n’a pas abouti. Les événements déjà chargés restent affichés." }));
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      root.append(node("small", { className: "muted", text: `Heures locales · ${timezone}` }));
      if (view === "day") {
        const selected = days[0];
        const strip = node("nav", { className: "calendar-day-strip", "aria-label": "Choisir un jour" });
        for (let offset = -3; offset <= 3; offset++) {
          const day = addDays(selected, offset);
          const key = dateKey(day);
          const item = button("", "calendar.pick-day", {
            "data-date": key,
            className: `calendar-day-choice${offset === 0 ? " is-selected" : ""}${key === dateKey(new Date()) ? " is-today" : ""}`,
            "aria-label": longDate(day), "aria-pressed": offset === 0
          });
          item.append(node("span", { className: "calendar-day-letter", text: ["D", "L", "M", "M", "J", "V", "S"][day.getDay()] }), node("span", { className: "calendar-day-number", text: day.getDate() }));
          strip.append(item);
        }
        root.append(strip);
      }
      const scroll = node("div", { className: "calendar-scroll", tabindex: "0", "aria-label": "Calendrier horaire, défilement horizontal et vertical" });
      const grid = node("div", { className: "calendar-grid", style: `--calendar-days:${days.length}` });
      grid.append(node("div", { className: "calendar-corner", text: "Heures" }));
      for (const day of days) grid.append(node("div", { className: `calendar-day-heading${dateKey(day) === dateKey(new Date()) ? " is-today" : ""}`, text: new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(day) }));
      grid.append(node("div", { className: "calendar-all-day-label", text: "Journée entière" }));
      for (const day of days) grid.append(node("div", { className: "calendar-all-day" }, eventsForDay(events, day).filter(({ event }) => event.allDay).map((segment) => eventNode(segment, false, renderEventActions))));
      grid.append(node("div", { className: "calendar-hours", "aria-hidden": "true" }, Array.from({ length: 24 }, (_, hour) => node("span", { text: `${String(hour).padStart(2, "0")}:00`, style: `top:${hour / 24 * 100}%` }))));
      for (const day of days) {
        const column = node("div", { className: `calendar-day${dateKey(day) === dateKey(new Date()) ? " is-today" : ""}`, "aria-label": longDate(day) });
        for (const segment of layoutEvents(eventsForDay(events, day))) column.append(eventNode(segment, true, renderEventActions));
        if (dateKey(day) === dateKey(new Date())) { const now = new Date(); column.append(node("div", { className: "calendar-now", style: `top:${(now.getHours() * 60 + now.getMinutes()) / 1440 * 100}%`, "aria-hidden": "true" })); }
        grid.append(column);
      }
      scroll.append(grid); root.append(scroll);
      const previousPosition = viewportPosition;
      scroll.addEventListener("scroll", () => {
        if (scroll.isConnected) viewportPosition = { top: scroll.scrollTop, left: scroll.scrollLeft };
      }, { passive: true });
      if (view === "day") bindDaySwipe(scroll, dispatch);
      requestAnimationFrame(() => {
        if (!scroll.isConnected) return;
        const now = new Date();
        // Position the current hour beneath the sticky date heading.
        const dayColumn = grid.querySelector(".calendar-day");
        const header = grid.querySelector(".calendar-day-heading");
        const minutes = now.getHours() * 60 + now.getMinutes();
        const initialTop = dayColumn.offsetTop - grid.offsetTop + minutes / 1440 * dayColumn.offsetHeight - header.offsetHeight - 60;
        scroll.scrollTop = previousPosition?.top ?? Math.max(0, initialTop);
        const todayIndex = days.findIndex((day) => dateKey(day) === dateKey(now));
        scroll.scrollLeft = todayIndex >= 0 ? Math.max(0, todayIndex * dayColumn.offsetWidth - 60) : previousPosition?.left ?? 0;
        viewportPosition = { top: scroll.scrollTop, left: scroll.scrollLeft };
      });
      if (!days.some((day) => eventsForDay(events, day).length)) root.append(node("p", { className: "muted", text: "Aucun événement chargé pour cette période." }));
      return root;
    },
    actions: {
      "calendar.sync": ({ dispatch }) => dispatch("sync:manual"),
      "calendar.previous": ({ dispatch }) => dispatch("calendar:navigate", { direction: -1 }),
      "calendar.next": ({ dispatch }) => dispatch("calendar:navigate", { direction: 1 }),
      "calendar.today": ({ dispatch }) => { viewportPosition = null; return dispatch("calendar:today"); },
      "calendar.pick-day": ({ target, dispatch }) => dispatch("calendar:date", { date: target.dataset.date }),
      "calendar.view": ({ target, dispatch }) => dispatch("calendar:view", { view: target.dataset.view }),
      "calendar.date": ({ event, target, dispatch }) => event.type === "change" ? dispatch("calendar:date", { date: target.value }) : undefined
    }
  }
};
