import { createFeatureState } from "./registry.js";

export const BASE_STATE = Object.freeze({
  schemaVersion: 1,
  auth: Object.freeze({ microsoft: null, spotify: null, ai: null }),
  calendar: Object.freeze({ events: [], lastSyncAt: null }),
  tasks: Object.freeze([]),
  projects: Object.freeze([]),
  sessions: Object.freeze([]),
  game: Object.freeze({ xp: 0, level: 1, streak: 0 }),
  settings: Object.freeze({
    workMode: "free",
    pomodoroEnabled: false,
    notificationsEnabled: false,
    spotifyEnabled: false,
    aiEnabled: false
  }),
  diagnostics: Object.freeze([])
});

const copyBase = () => ({
  schemaVersion: BASE_STATE.schemaVersion,
  auth: { ...BASE_STATE.auth },
  calendar: { events: [], lastSyncAt: null },
  tasks: [],
  projects: [],
  sessions: [],
  game: { ...BASE_STATE.game },
  settings: { ...BASE_STATE.settings },
  diagnostics: []
});

export const createInitialState = (registry = {}) => ({
  ...copyBase(),
  features: createFeatureState(registry)
});

export const appendDiagnostic = (state, diagnostic) => ({
  ...state,
  diagnostics: [...(state.diagnostics ?? []), diagnostic].slice(-100)
});

export const mergePersistedState = (initialState, persistedState) => {
  if (!persistedState || typeof persistedState !== "object") return initialState;

  return {
    ...initialState,
    ...persistedState,
    auth: { ...initialState.auth, ...(persistedState.auth ?? {}) },
    calendar: { ...initialState.calendar, ...(persistedState.calendar ?? {}) },
    game: { ...initialState.game, ...(persistedState.game ?? {}) },
    settings: { ...initialState.settings, ...(persistedState.settings ?? {}) },
    features: { ...initialState.features, ...(persistedState.features ?? {}) },
    diagnostics: Array.isArray(persistedState.diagnostics)
      ? persistedState.diagnostics.slice(-100)
      : initialState.diagnostics
  };
};
