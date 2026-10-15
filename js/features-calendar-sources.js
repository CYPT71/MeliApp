import { features as baseFeatures } from "./features.js";
import { CALENDAR_ROLES, normalizeCalendarRole } from "./domain/calendar-classification.js";

const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;
const setFeatureState = (state, name, next) => ({
  ...state,
  features: {
    ...(state.features ?? {}),
    [name]: typeof next === "function" ? next(featureState(state, name, {})) : next
  }
});

export const calendarSourceFeatures = {
  outlookSync: {
    ...baseFeatures.outlookSync,
    run: baseFeatures.outlookSync.run
  },

  calendarSources: {
    description: "Règles de nature et de placement des agendas Outlook",
    state: {
      roles: {},
      placementByCalendar: {},
      rangeByCalendar: {},
      itemPlacements: {},
      itemRanges: {}
    },
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
      visible: () => false,
      render: () => document.createElement("div"),
      actions: {}
    }
  }
};

export { CALENDAR_ROLES };
