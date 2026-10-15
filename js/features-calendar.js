import { categoryPresentation } from "./domain/outlook-categories.js";
import { CALENDAR_VIEWS, dateKey, localDate, addDays, addMonths, calendarRange, eventsForDay, layoutEvents } from "./domain/calendar.js";

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

let swipeDirection = 0;
const bindCalendarSwipe = (element, grid, dispatch) => {
  if (!dispatch) return;
  let gesture = null, suppressClickUntil = 0;
  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reset = () => {
    const from = grid.style.transform || "translateX(0px)";
    grid.style.transform = "";
    if (!reducedMotion()) grid.animate([{ transform: from }, { transform: "translateX(0px)" }], { duration: 160, easing: "ease-out" });
  };
  element.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || !event.isPrimary) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  element.addEventListener("pointermove", (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5 && !reducedMotion()) {
      grid.style.transform = `translateX(${Math.max(-90, Math.min(90, dx * .45))}px)`;
    }
  });
  element.addEventListener("pointercancel", () => { gesture = null; reset(); });
  element.addEventListener("pointerup", (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    gesture = null;
    reset();
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    suppressClickUntil = Date.now() + 500;
    swipeDirection = dx < 0 ? 1 : -1;
    dispatch("calendar:navigate", { direction: swipeDirection });
  });
  element.addEventListener("click", (event) => {
    if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
  }, true);
};

const eventNode = (segment, timed = false, renderEventActions) => {
  const { event } = segment;
  const category = categoryPresentation(event);
  const label = `${event.title ?? "Événement"} · ${event.allDay ? "Toute la journée" : `${time(new Date(event.start))} – ${time(new Date(event.end))}`}${event.location ? ` · ${event.location}` : ""}${category.label ? ` · ${category.label}` : ""}${event.calendarName ? ` · ${event.calendarName}` : ""}`;
  const attrs = { className: `calendar-event${category.style ? " has-category" : ""}`, title: label, "aria-label": label, style: category.style };
  if (timed) attrs.style += `top:${segment.top / 1440 * 100}%;height:${Math.max(segment.bottom - segment.top, 15) / 1440 * 100}%;left:calc(${segment.column / segment.columns * 100}% + 2px);width:calc(${100 / segment.columns}% - 4px)`;
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
  when: ["app:start", "calendar:view", "calendar:navigate", "calendar:today", "calendar:date", "calendar:open-day", "calendar:toggle-calendar"],
  run: ({ state, event, payload }) => {
    const current = state.features?.calendarView ?? {};
    let next = { ...current };
    if (event === "calendar:toggle-calendar") {
      const calendars = current.calendars ?? [];
      if (calendars.some((calendar) => calendar.id === payload?.id)) {
        const selected = new Set(current.selectedCalendarIds ?? calendars.map((calendar) => calendar.id));
        if (payload.checked) selected.add(payload.id); else selected.delete(payload.id);
        next.selectedCalendarIds = [...selected];
      }
    }
    if (event === "calendar:view" && Object.hasOwn(CALENDAR_VIEWS, payload?.view)) next.view = payload.view;
    if (event === "calendar:today" || event === "app:start") next.date = dateKey(new Date());
    if (event === "calendar:date" && /^\d{4}-\d{2}-\d{2}$/.test(payload?.date ?? "")) next.date = payload.date;
    if (event === "calendar:open-day" && /^\d{4}-\d{2}-\d{2}$/.test(payload?.date ?? "")) next = { ...next, view: "day", date: payload.date };
    if (event === "calendar:navigate") {
      const direction = payload?.direction === -1 ? -1 : 1;
      next.date = dateKey(current.view === "month"
        ? addMonths(localDate(current.date), direction)
        : addDays(localDate(current.date), direction * CALENDAR_VIEWS[calendarRange(current).view]));
    }
    return { ...state, features: { ...state.features, calendarView: next } };
  },
  ui: {
    render: ({ state, dispatch, renderEventActions }) => {
      const settings = state.features?.calendarView ?? {};
      const { view, days } = calendarRange(settings);
      const events = (state.calendar?.events ?? []).filter((event) => !Array.isArray(settings.selectedCalendarIds) || settings.selectedCalendarIds.includes(event.calendarId));
      const label = view === "month" ? new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(localDate(settings.date)) : days.length === 1 ? longDate(days[0]) : `${longDate(days[0])} – ${longDate(days.at(-1))}`;
      const root = node("div", { className: `calendar stack calendar--${view}` });
      root.append(node("div", { className: "calendar-toolbar" }, [
        node("div", { className: "row", role: "group", "aria-label": "Période affichée" }, [
          button("‹", "calendar.previous", { "aria-label": "Période précédente" }),
          button("Aujourd’hui", "calendar.today"),
          button("›", "calendar.next", { "aria-label": "Période suivante" }),
          node("label", { className: "calendar-date" }, [node("span", { text: "Aller au" }), node("input", { type: "date", value: dateKey(localDate(settings.date)), "data-action": "calendar.date", "aria-label": "Choisir une date" })])
        ]),
        node("div", { className: "row", role: "group", "aria-label": "Affichage du calendrier" }, [
          ...[["day", "Journée"], ["three", "3 jours"], ["week", "Semaine"], ["month", "Mois"]].map(([id, title]) => button(title, "calendar.view", { "data-view": id, "aria-pressed": view === id, className: view === id ? "is-active" : "" })),
          button("Synchroniser", "calendar.sync")
        ])
      ]));
      if (settings.calendars?.length) {
        const selector = node("fieldset", { className: "calendar-selector" }, [node("legend", { text: "Agendas affichés" })]);
        for (const calendar of settings.calendars) {
          const input = node("input", { type: "checkbox", "data-action": "calendar.toggle-calendar", "data-calendar-id": calendar.id });
          input.checked = !Array.isArray(settings.selectedCalendarIds) || settings.selectedCalendarIds.includes(calendar.id);
          selector.append(node("label", { className: "calendar-selector-item" }, [input, node("span", { text: calendar.name })]));
        }
        root.append(selector);
        if (settings.selectedCalendarIds?.length === 0) root.append(node("p", { role: "status", text: "Aucun agenda sélectionné. Coche un agenda pour afficher ses rendez-vous." }));
      }
      root.append(node("p", { className: "calendar-period", role: "status", text: label }));
      if (state.features?.outlookSync?.error) root.append(node("p", { role: "status", className: "connection-message", text: state.features.outlookSync.error === "OUTLOOK_RECONNECT_REQUIRED"
        ? "Synchronisation impossible : reconnecte Outlook dans ce navigateur. Les rendez-vous affichés proviennent du cache."
        : "La synchronisation n’a pas abouti. Les événements déjà chargés restent affichés." }));
      if (state.features?.outlookSync?.categoryError) root.append(node("p", { role: "status", className: "connection-message", text:
        state.features.outlookSync.categoryError === "permission"
          ? "Pour retrouver les couleurs Outlook, reconnecte ton calendrier et autorise la lecture des catégories."
          : "Les rendez-vous sont synchronisés, mais leurs couleurs Outlook n’ont pas pu être chargées. Réessaie de synchroniser."
      }));
      if (state.features?.outlookSync?.categoryError === "permission") root.append(button("Autoriser les couleurs Outlook", "microsoft.login", { className: "primary" }));
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      root.append(node("small", { className: "muted", text: `Heures locales · ${timezone}` }));
      if (view === "month") {
        const month = localDate(settings.date).getMonth();
        const container = node("div", { className: "calendar-month-scroll", tabindex: "0", "aria-label": "Calendrier mensuel" });
        const grid = node("div", { className: "calendar-month-grid" });
        for (const name of ["L", "M", "M", "J", "V", "S", "D"]) grid.append(node("div", { className: "calendar-month-weekday", text: name }));
        for (const day of days) {
          const key = dateKey(day);
          const items = eventsForDay(events, day).sort((a, b) => Number(b.event.allDay) - Number(a.event.allDay) || +a.start - +b.start);
          const cell = button("", "calendar.open-day", {
            className: `calendar-month-day${day.getMonth() !== month ? " is-outside" : ""}${key === dateKey(new Date()) ? " is-today" : ""}`,
            "data-date": key, "aria-label": `${longDate(day)}, ${items.length} événement${items.length > 1 ? "s" : ""}`
          });
          cell.append(node("span", { className: "calendar-month-number", text: day.getDate() }));
          for (const { event } of items.slice(0, 2)) cell.append(node("span", {
            className: `calendar-month-event${categoryPresentation(event).style ? " has-category" : ""}`, style: categoryPresentation(event).style,
            title: `${event.title ?? "Événement"}${categoryPresentation(event).label ? " · " + categoryPresentation(event).label : ""}`,
            text: `${event.allDay ? "" : time(new Date(event.start)) + " "}${event.title ?? "Événement"}`
          }));
          if (items.length > 2) cell.append(node("span", { className: "calendar-month-more", text: `+${items.length - 2}` }));
          grid.append(cell);
        }
        container.append(grid); root.append(container);
        root.append(node("small", { className: "muted", text: "Touche un jour pour afficher ses rendez-vous en détail." }));
        bindCalendarSwipe(container, grid, dispatch);
        requestAnimationFrame(() => {
          if (!container.isConnected || !swipeDirection) return;
          if (!matchMedia("(prefers-reduced-motion: reduce)").matches) grid.animate([
            { transform: `translateX(${swipeDirection * 45}px)`, opacity: .6 },
            { transform: "translateX(0px)", opacity: 1 }
          ], { duration: 180, easing: "ease-out" });
          swipeDirection = 0;
        });
        return root;
      }
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
      for (const day of days) grid.append(node("div", {
        className: `calendar-day-heading${dateKey(day) === dateKey(new Date()) ? " is-today" : ""}`,
        "aria-label": longDate(day)
      }, [
        node("span", { className: "calendar-heading-full", text: new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(day) }),
        node("span", { className: "calendar-heading-compact", "aria-hidden": "true" }, [
          node("span", { text: ["D", "L", "M", "M", "J", "V", "S"][day.getDay()] }),
          node("strong", { text: day.getDate() })
        ])
      ]));
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
      bindCalendarSwipe(scroll, grid, dispatch);
      requestAnimationFrame(() => {
        if (!scroll.isConnected) return;
        if (swipeDirection) {
          if (!matchMedia("(prefers-reduced-motion: reduce)").matches) grid.animate([
            { transform: `translateX(${swipeDirection * 45}px)`, opacity: .6 },
            { transform: "translateX(0px)", opacity: 1 }
          ], { duration: 180, easing: "ease-out" });
          swipeDirection = 0;
        }
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
      "calendar.toggle-calendar": ({ event, target, dispatch }) => event.type === "change" ? dispatch("calendar:toggle-calendar", { id: target.dataset.calendarId, checked: target.checked }) : undefined,
      "calendar.sync": ({ dispatch }) => dispatch("sync:manual"),
      "calendar.previous": ({ dispatch }) => dispatch("calendar:navigate", { direction: -1 }),
      "calendar.next": ({ dispatch }) => dispatch("calendar:navigate", { direction: 1 }),
      "calendar.today": ({ dispatch }) => { viewportPosition = null; return dispatch("calendar:today"); },
      "calendar.open-day": ({ target, dispatch }) => dispatch("calendar:open-day", { date: target.dataset.date }),
      "calendar.pick-day": ({ target, dispatch }) => dispatch("calendar:date", { date: target.dataset.date }),
      "calendar.view": ({ target, dispatch }) => dispatch("calendar:view", { view: target.dataset.view }),
      "calendar.date": ({ event, target, dispatch }) => event.type === "change" ? dispatch("calendar:date", { date: target.value }) : undefined
    }
  }
};
