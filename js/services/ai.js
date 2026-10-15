const DEFAULT_TIMEOUT = 15000;
const KEY_PREFIX = "meliapp:ai:key:";

export const AI_PROVIDERS = Object.freeze({
  openai: { id: "openai", label: "GPT / OpenAI", endpoint: "https://api.openai.com/v1/responses" },
  anthropic: { id: "anthropic", label: "Claude / Anthropic", endpoint: "https://api.anthropic.com/v1/messages" },
  gemini: { id: "gemini", label: "Gemini / Google", endpoint: "https://generativelanguage.googleapis.com/v1beta" }
});

export const AI_PROVIDER_IDS = Object.freeze(Object.keys(AI_PROVIDERS));

const abortableFetch = async (fetchFn, url, options = {}, timeoutMs = DEFAULT_TIMEOUT) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Timeout IA");
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const safeJson = async (response) => response.json().catch(() => null);
const errorMessage = (provider, response, data) =>
  data?.error?.message ?? data?.error?.status ?? data?.error_description ?? `Erreur ${AI_PROVIDERS[provider]?.label ?? provider} HTTP ${response.status}`;

const plannerContext = (state) => {
  const tasks = (state.features?.tasks?.items ?? [])
    .filter((task) => task.status !== "completed")
    .slice(0, 8)
    .map((task) => ({
      title: task.title,
      deadline: task.deadline ?? null,
      estimateMinutes: task.estimateMinutes,
      difficulty: task.difficulty,
      importance: task.importance,
      progress: task.progress ?? 0
    }));
  const nextEvent = [...(state.calendar?.events ?? [])]
    .filter((event) => new Date(event.start).getTime() > Date.now())
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0] ?? null;
  return {
    energy: state.features?.energy?.value ?? 5,
    mission: state.features?.planner?.current ?? null,
    tasks,
    nextCalendarEvent: nextEvent ? {
      title: nextEvent.title ?? nextEvent.subject ?? "Événement",
      start: nextEvent.start,
      end: nextEvent.end
    } : null,
    workMode: state.features?.flow?.mode ?? state.settings?.workMode ?? "free"
  };
};

const basePrompt = (state) => `Tu aides une personne à démarrer une tâche sans surcharge cognitive.\n\nContexte JSON :\n${JSON.stringify(plannerContext(state), null, 2)}\n\nDonne UNE prochaine action concrète, courte et faisable. N'impose pas de Pomodoro. Si l'énergie est basse, réduis fortement la difficulté. Réponds en français, en 1 à 3 phrases maximum, sans diagnostic médical.`;

const decompositionPrompt = (state, task) => `Tu aides à découper une tâche en petites étapes concrètes.\n\nTâche :\n${JSON.stringify({
  title: task.title,
  deadline: task.deadline ?? null,
  estimateMinutes: task.estimateMinutes ?? null,
  difficulty: task.difficulty ?? null,
  importance: task.importance ?? null,
  energy: state.features?.energy?.value ?? 5
}, null, 2)}\n\nRéponds UNIQUEMENT avec un tableau JSON de 2 à 6 chaînes en français. Chaque chaîne doit être une sous-tâche courte, concrète et directement actionnable. Pas de markdown, pas de commentaire, pas de numérotation.`;

const extractOpenAiText = (data) => {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  for (const item of data?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === "string" && content.text.trim()) return content.text.trim();
    }
  }
  return null;
};

const extractAnthropicText = (data) =>
  (data?.content ?? []).filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text.trim()).filter(Boolean).join("\n") || null;

const extractGeminiText = (data) =>
  (data?.candidates?.[0]?.content?.parts ?? []).map((part) => typeof part?.text === "string" ? part.text.trim() : "").filter(Boolean).join("\n") || null;

const requireKey = (key, provider) => {
  if (!key) throw new Error(`Connexion ${AI_PROVIDERS[provider]?.label ?? provider} absente`);
};

const callOpenAi = async ({ fetchFn, key, model, prompt, timeoutMs }) => {
  requireKey(key, "openai");
  if (!model) throw new Error("Modèle GPT non configuré");
  const response = await abortableFetch(fetchFn, AI_PROVIDERS.openai.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, input: prompt })
  }, timeoutMs);
  const data = await safeJson(response);
  if (!response.ok) throw new Error(errorMessage("openai", response, data));
  const text = extractOpenAiText(data);
  if (!text) throw new Error("Réponse GPT invalide");
  return text;
};

const callAnthropic = async ({ fetchFn, key, model, prompt, timeoutMs }) => {
  requireKey(key, "anthropic");
  if (!model) throw new Error("Modèle Claude non configuré");
  const response = await abortableFetch(fetchFn, AI_PROVIDERS.anthropic.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({ model, max_tokens: 500, messages: [{ role: "user", content: prompt }] })
  }, timeoutMs);
  const data = await safeJson(response);
  if (!response.ok) throw new Error(errorMessage("anthropic", response, data));
  const text = extractAnthropicText(data);
  if (!text) throw new Error("Réponse Claude invalide");
  return text;
};

const callGemini = async ({ fetchFn, key, model, prompt, timeoutMs }) => {
  requireKey(key, "gemini");
  if (!model) throw new Error("Modèle Gemini non configuré");
  const base = AI_PROVIDERS.gemini.endpoint.replace(/\/$/, "");
  const response = await abortableFetch(fetchFn, `${base}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 500 } })
  }, timeoutMs);
  const data = await safeJson(response);
  if (!response.ok) throw new Error(errorMessage("gemini", response, data));
  const text = extractGeminiText(data);
  if (!text) throw new Error("Réponse Gemini invalide");
  return text;
};

const callers = Object.freeze({ openai: callOpenAi, anthropic: callAnthropic, gemini: callGemini });
const cleanConfig = (config = {}) => ({ enabled: config.enabled !== false, model: String(config.model ?? "").trim() });
const fusionPrompt = (state, candidates) => `${basePrompt(state)}\n\nPlusieurs assistants ont proposé des pistes. Fusionne le meilleur de ces réponses en UNE action finale cohérente. Ne mentionne pas les fournisseurs.\n\n${candidates.map(({ text }, index) => `Proposition ${index + 1} : ${text}`).join("\n\n")}`;

const parseJsonArray = (text) => {
  const raw = String(text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const first = raw.indexOf("[");
  const last = raw.lastIndexOf("]");
  if (first < 0 || last <= first) throw new Error("Réponse de découpage IA invalide");
  const value = JSON.parse(raw.slice(first, last + 1));
  if (!Array.isArray(value)) throw new Error("Réponse de découpage IA invalide");
  return value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 6);
};

export const createAiService = ({ storage = globalThis.sessionStorage, fetchFn = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT, connections = {} } = {}) => {
  const keyName = (provider) => `${KEY_PREFIX}${provider}`;
  const assertProvider = (provider) => {
    if (!AI_PROVIDER_IDS.includes(provider)) throw new Error(`Fournisseur IA non autorisé : ${provider}`);
  };
  const getKey = (provider) => {
    assertProvider(provider);
    return storage?.getItem?.(keyName(provider)) ?? "";
  };
  const setKey = (provider, key) => {
    assertProvider(provider);
    const value = String(key ?? "").trim();
    if (!storage?.setItem) return;
    if (value) storage.setItem(keyName(provider), value);
    else storage.removeItem?.(keyName(provider));
  };
  const clearKey = (provider) => {
    assertProvider(provider);
    storage?.removeItem?.(keyName(provider));
  };
  const hasKey = (provider) => Boolean(getKey(provider));
  const isConnected = (provider) => hasKey(provider);

  const connect = async (provider) => {
    assertProvider(provider);
    const adapter = connections?.[provider];
    if (!adapter?.connect) return { connected: false, reason: "not-configured" };
    const result = await adapter.connect();
    const credential = result?.credential ?? result?.accessToken ?? result?.token ?? "";
    if (credential) setKey(provider, credential);
    return { connected: Boolean(credential || isConnected(provider)), model: result?.model ?? "" };
  };

  const disconnect = async (provider) => {
    assertProvider(provider);
    try {
      await connections?.[provider]?.disconnect?.();
    } finally {
      clearKey(provider);
    }
    return { connected: false };
  };

  const callProvider = async (provider, config, prompt) => {
    assertProvider(provider);
    return callers[provider]({ fetchFn, key: getKey(provider), ...cleanConfig(config), prompt, timeoutMs });
  };

  const enabledProviders = (providers = {}) => AI_PROVIDER_IDS
    .map((provider) => [provider, cleanConfig(providers[provider])])
    .filter(([provider, config]) => config.enabled !== false && config.model && isConnected(provider));

  const runPrompt = async ({ prompt, providers = {}, mode = "fusion", synthesisProvider = "openai", synthesisPrompt }) => {
    const enabled = enabledProviders(providers);
    if (!enabled.length) throw new Error("Aucune IA connectée parmi GPT, Claude et Gemini");
    if (mode === "single") {
      const [provider, config] = enabled[0];
      return { text: await callProvider(provider, config, prompt), providersUsed: [provider], mode: "single" };
    }
    if (mode === "fallback") {
      const errors = [];
      for (const [provider, config] of enabled) {
        try {
          return { text: await callProvider(provider, config, prompt), providersUsed: [provider], mode: "fallback", errors };
        } catch (error) {
          errors.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      throw new Error(errors.join(" | "));
    }
    const settled = await Promise.allSettled(enabled.map(async ([provider, config]) => ({ provider, text: await callProvider(provider, config, prompt) })));
    const candidates = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
    const errors = settled.filter((item) => item.status === "rejected").map((item) => item.reason instanceof Error ? item.reason.message : String(item.reason));
    if (!candidates.length) throw new Error(errors.join(" | ") || "Toutes les IA ont échoué");
    if (candidates.length === 1 || !synthesisPrompt) return { text: candidates[0].text, providersUsed: candidates.map((item) => item.provider), mode: candidates.length === 1 ? "fusion-degraded" : "fusion", errors };
    const synthesis = enabled.find(([provider]) => provider === synthesisProvider) ?? enabled[0];
    try {
      const text = await callProvider(synthesis[0], synthesis[1], synthesisPrompt(candidates));
      return { text, providersUsed: candidates.map((item) => item.provider), synthesisProvider: synthesis[0], mode: "fusion", errors };
    } catch (error) {
      return { text: candidates[0].text, providersUsed: candidates.map((item) => item.provider), synthesisProvider: null, mode: "fusion-degraded", errors: [...errors, error instanceof Error ? error.message : String(error)] };
    }
  };

  const suggest = ({ state, mode = "fusion", providers = {}, synthesisProvider = "openai" }) => runPrompt({
    prompt: basePrompt(state),
    providers,
    mode,
    synthesisProvider,
    synthesisPrompt: (candidates) => fusionPrompt(state, candidates)
  });

  const decompose = async ({ state, task, mode = "fallback", providers = {}, synthesisProvider = "openai" }) => {
    const result = await runPrompt({
      prompt: decompositionPrompt(state, task),
      providers,
      mode: mode === "fusion" ? "fallback" : mode,
      synthesisProvider
    });
    const steps = parseJsonArray(result.text);
    if (steps.length < 2) throw new Error("L’IA doit proposer au moins deux petites étapes");
    return steps;
  };

  return {
    suggest,
    decompose,
    connect,
    disconnect,
    isConnected,
    setKey,
    clearKey,
    hasKey,
    providers: AI_PROVIDERS
  };
};
