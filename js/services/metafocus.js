export const createCheckInScheduler = ({ setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now } = {}) => {
  let timer = null, key = null;
  const stop = () => { if (timer !== null) clearTimer(timer); timer = null; key = null; };
  return {
    stop,
    sync({ session, preferences, onDue }) {
      const step = session?.steps.find((item) => !item.done);
      if (!preferences.remindersEnabled || session?.status !== "active" || !step || session.promptPending) { stop(); return; }
      const interval = Math.min(30, Math.max(2, preferences.intervalMinutes || 5));
      const anchor = session.lastCheckAt ?? session.savedAt;
      const nextKey = `${session.taskId}:${step.id}:${anchor}:${interval}`;
      if (key === nextKey) return;
      stop(); key = nextKey;
      const due = new Date(anchor).getTime() + interval * 60000;
      timer = setTimer(() => { timer = null; key = null; onDue({ taskId: session.taskId, stepId: step.id }); }, Math.max(0, due - now()));
    }
  };
};

export const speakLocal = (text) => {
  if (!globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) return "La lecture vocale n’est pas disponible dans ce navigateur.";
  const voices = speechSynthesis.getVoices().filter((voice) => voice.localService && voice.lang.startsWith("fr"));
  if (!voices.length) return "Aucune voix française locale n’est disponible. Le repère reste lisible à l’écran.";
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voices[0]; utterance.lang = "fr-FR"; utterance.rate = .9;
  speechSynthesis.speak(utterance);
  return "Lecture du repère démarrée.";
};

export const stopReading = () => globalThis.speechSynthesis?.cancel();
