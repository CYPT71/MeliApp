const options = {
  expectedInputs: [{ type: "text", languages: ["fr", "en"] }],
  expectedOutputs: [{ type: "text", languages: ["fr", "en"] }]
};

const installed = () => window.matchMedia?.("(display-mode: standalone)")?.matches === true || window.navigator.standalone === true;

export const createLocalAiService = () => {
  let session = null;

  const api = () => globalThis.LanguageModel ?? globalThis.ai?.languageModel ?? null;

  const availability = async () => {
    const model = api();
    if (!model?.availability) return { status: "unsupported", installed: installed() };
    try {
      const status = await model.availability(options);
      return { status, installed: installed() };
    } catch (error) {
      return { status: "error", installed: installed(), error: error instanceof Error ? error.message : String(error) };
    }
  };

  const requestAccess = async ({ onProgress } = {}) => {
    const model = api();
    if (!model?.create) throw new Error("LOCAL_AI_UNSUPPORTED");
    if (!navigator.userActivation?.isActive) throw new Error("LOCAL_AI_USER_GESTURE_REQUIRED");
    session?.destroy?.();
    session = await model.create({
      ...options,
      monitor(monitor) {
        monitor.addEventListener?.("downloadprogress", (event) => onProgress?.(Math.round(Number(event.loaded ?? 0) * 100)));
      }
    });
    return true;
  };

  const prompt = async (text) => {
    if (!session) await requestAccess();
    return session.prompt(String(text));
  };

  const disconnect = () => {
    session?.destroy?.();
    session = null;
  };

  return {
    availability,
    requestAccess,
    prompt,
    disconnect,
    isConnected: () => Boolean(session),
    isInstalledPwa: installed
  };
};
