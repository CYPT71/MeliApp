const bounded = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Math.round(Number(value)))) : fallback;
export const normalizeSessionPreferences = value => ({ workMinutes: bounded(value?.workMinutes, 5, 120, 52), breakMinutes: bounded(value?.breakMinutes, 2, 60, 10), allowAi: value?.allowAi !== false });
export const sessionOptions = (state, now = Date.now()) => {
  const preferences = normalizeSessionPreferences(state.features?.sessionPreferences);
  const optimization = state.features?.cliAi?.optimization;
  const recommendation = preferences.allowAi && optimization?.energy === state.features?.energy?.value && optimization.expiresAt > now ? optimization.session : null;
  return { ...preferences, ...(recommendation ? { recommendedWorkMinutes: recommendation.workMinutes, recommendedBreakMinutes: recommendation.breakMinutes } : {}) };
};
