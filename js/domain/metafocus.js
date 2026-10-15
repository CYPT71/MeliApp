export const METAFOCUS_DEFAULTS = Object.freeze({ remindersEnabled: false, intervalMinutes: 5, journalEnabled: false });
export const metaPreferences = (guided) => ({ ...METAFOCUS_DEFAULTS, ...(guided.preferences ?? {}) });
export const currentGuidedStep = (session) => session?.steps.find((step) => !step.done);
export const spokenCheckpoint = (session) => [
  `Ton objectif : ${session.title}.`,
  session.lastCompleted ? `Dernière étape terminée : ${session.lastCompleted}.` : "",
  currentGuidedStep(session) ? `Tu en es à : ${session.smallStep || currentGuidedStep(session).title}.` : "Les étapes sont terminées.",
  session.note, session.nextGesture ? `Premier geste au retour : ${session.nextGesture}.` : ""
].filter(Boolean).join(" ");

export const exportMetafocusJournal = (entries = []) => {
  const sessions = new Map();
  return {
    schema: "metafocus.local-actions.v1",
    description: "Actions déclarées et invitations affichées. Ni observation de l’attention ni mesure du début d’un décrochage.",
    events: entries.map((entry) => {
      if (!sessions.has(entry.taskId)) sessions.set(entry.taskId, `S${sessions.size + 1}`);
      return { session: sessions.get(entry.taskId), at: entry.at, action: entry.action, stepIndex: entry.stepIndex };
    })
  };
};
