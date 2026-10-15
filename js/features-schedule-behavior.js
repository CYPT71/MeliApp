import { adaptiveScheduleFeatures } from "./features-adaptive-schedule.js";

const base = adaptiveScheduleFeatures.adaptiveSchedule;
const extraEvents = [
  "schedule:default-range", "schedule:calendar-role", "schedule:calendar-placement", "schedule:calendar-range",
  "schedule:event-placement", "schedule:event-range", "schedule:task-placement", "schedule:task-range"
];

export const scheduleBehaviorOverride = {
  adaptiveSchedule: {
    ...base,
    description: "Planning adaptatif avec éléments fixes et flexibles",
    when: [...new Set([...(base.when ?? []), ...extraEvents])],
    run: async (context) => {
      return base.run(context);
    }
  }
};
