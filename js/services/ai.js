const withTimeout = async (promise, ms = 10000) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Timeout IA")), ms); })
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export const createAiService = () => ({
  suggest: async ({ state, endpoint, model }) => {
    if (!endpoint) throw new Error("Endpoint IA non configuré");
    const planner = state.features?.planner ?? {};
    const energy = state.features?.energy?.value ?? 5;
    const payload = {
      model: model || undefined,
      energy,
      mission: planner.current ?? null,
      tasks: (state.features?.tasks?.items ?? []).filter((task) => task.status !== "completed").slice(0, 10),
      nextCalendarEvent: (state.calendar?.events ?? [])[0] ?? null
    };

    const response = await withTimeout(fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }));
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? `Erreur IA HTTP ${response.status}`);
    if (typeof data?.suggestion === "string") return data.suggestion;
    if (typeof data?.message === "string") return data.message;
    throw new Error("Réponse IA invalide");
  }
});
