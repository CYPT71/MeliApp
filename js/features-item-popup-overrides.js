import { calendarTaskFeatures } from "./features-calendar-tasks.js";
import { projectFeatures } from "./features-projects.js";
import { schedulePreferenceFeatures } from "./features-schedule-preferences.js";
import { eventKey } from "./domain/calendar-classification.js";
import { renderItemInspectorModal } from "./features-item-inspector.js";

const appendModal = (root, state) => {
  const modal = renderItemInspectorModal(state);
  if (modal) root.append(modal);
  return root;
};

const eventForCard = (state, card) => {
  const title = card.querySelector("summary strong")?.textContent?.trim();
  const times = card.querySelector("summary span")?.textContent?.trim();
  const candidates = (state.calendar?.events ?? []).filter((event) => String(event.title ?? "Événement").trim() === title);
  if (candidates.length <= 1) return candidates[0] ?? null;
  return candidates.find((event) => {
    if (event.allDay) return times === "Toute la journée";
    const fmt = (value) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
    return times === `${fmt(event.start)} – ${fmt(event.end)}`;
  }) ?? candidates[0];
};

const calendarRender = calendarTaskFeatures.calendarView.ui.render;
const taskRender = projectFeatures.taskWorkspace.ui.render;
const preferenceRender = schedulePreferenceFeatures.schedulePreferences.ui.render;

export const itemPopupOverrides = {
  calendarView: {
    ...calendarTaskFeatures.calendarView,
    ui: {
      ...calendarTaskFeatures.calendarView.ui,
      render: (context) => {
        const root = calendarRender(context);
        for (const card of root.querySelectorAll(".calendar-event")) {
          const event = eventForCard(context.state, card);
          if (!event) continue;
          card.dataset.action = "item-inspector.open-event";
          card.dataset.key = eventKey(event);
          card.classList.add("is-clickable");
        }
        return appendModal(root, context.state);
      }
    }
  },

  taskWorkspace: {
    ...projectFeatures.taskWorkspace,
    ui: {
      ...projectFeatures.taskWorkspace.ui,
      render: (context) => {
        const root = taskRender(context);
        for (const card of root.querySelectorAll("[data-task-id]")) {
          const id = card.dataset.taskId;
          const title = card.querySelector(".task-title-button");
          if (title) {
            title.dataset.action = "item-inspector.open-task";
            title.dataset.id = id;
            title.setAttribute("aria-haspopup", "dialog");
          }
          card.classList.add("is-popup-enabled");
        }
        return appendModal(root, context.state);
      }
    }
  },

  schedulePreferences: {
    ...schedulePreferenceFeatures.schedulePreferences,
    ui: {
      ...schedulePreferenceFeatures.schedulePreferences.ui,
      render: (context) => {
        const root = preferenceRender(context);
        for (const row of root.querySelectorAll(".schedule-item-row")) {
          const taskButton = row.querySelector('[data-action="schedule.task-placement"]');
          const eventButton = row.querySelector('[data-action="schedule.event-placement"]');
          if (taskButton?.dataset.id) {
            row.dataset.action = "item-inspector.open-task";
            row.dataset.id = taskButton.dataset.id;
          } else if (eventButton?.dataset.key) {
            row.dataset.action = "item-inspector.open-event";
            row.dataset.key = eventButton.dataset.key;
          }
          row.classList.add("is-clickable");
        }
        return appendModal(root, context.state);
      }
    }
  }
};
