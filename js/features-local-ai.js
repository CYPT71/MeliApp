const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;
const setFeatureState = (state, name, next, fallback = {}) => ({
  ...state,
  features: {
    ...(state.features ?? {}),
    [name]: typeof next === "function" ? next(featureState(state, name, fallback)) : next
  }
});
const node = (tag, attrs = {}, children = []) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "className") element.className = value;
    else if (key === "text") element.textContent = String(value);
    else if (key === "disabled") element.disabled = Boolean(value);
    else element.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of (Array.isArray(children) ? children : [children])) if (child) element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return element;
};
const statusCopy = (current) => {
  if (current.connected) return "IA locale prête. Les requêtes compatibles peuvent rester sur cet appareil.";
  if (current.status === "available") return "Un modèle local est disponible dans ce navigateur.";
  if (current.status === "downloadable") return "Le navigateur peut télécharger son modèle local après ton autorisation.";
  if (current.status === "downloading") return `Téléchargement du modèle local${current.progress ? ` · ${current.progress} %` : ""}.`;
  if (current.status === "unsupported") return "Ce navigateur/appareil n’expose pas encore d’IA locale compatible à MeliApp.";
  return "MeliApp peut vérifier si le navigateur fournit un modèle IA local, sans envoyer tes données à un fournisseur cloud.";
};

const render = ({ state }) => {
  const current = featureState(state, "localAi", {});
  return node("section", { className: "stack local-ai-card" }, [
    node("div", { className: "row row--between" }, [
      node("div", { className: "stack compact" }, [
        node("span", { className: "eyebrow", text: "IA de l’appareil" }),
        node("h2", { text: "Utiliser une IA locale" }),
        node("p", { className: "muted", text: statusCopy(current) })
      ]),
      node("span", { className: `placement-pill ${current.connected ? "placement-pill--fixed" : "placement-pill--flexible"}`, text: current.connected ? "✓ Locale active" : "Sur cet appareil" })
    ]),
    !current.installed ? node("p", { className: "hint", text: "Installe MeliApp pour présenter cette option comme une capacité de l’application. Le support réel dépend toujours du navigateur et du matériel." }) : null,
    current.error ? node("p", { className: "error", text: current.error }) : null,
    node("div", { className: "row" }, [
      node("button", { type: "button", className: "secondary", "data-action": "local-ai.check", text: "Vérifier" }),
      node("button", { type: "button", className: "primary", "data-action": current.connected ? "local-ai.disconnect" : "local-ai.connect", disabled: current.status === "unsupported", text: current.connected ? "Désactiver" : "Autoriser l’IA locale" })
    ])
  ]);
};

export const localAiFeatures = {
  localAi: {
    description: "IA locale de l’appareil",
    state: { status: "unknown", installed: false, connected: false, progress: 0, error: null },
    when: ["app:start", "local-ai:check", "local-ai:connect", "local-ai:disconnect", "local-ai:progress"],
    run: async ({ state, event, services, payload }) => {
      const current = featureState(state, "localAi", {});
      if (!services.localAi) return setFeatureState(state, "localAi", { ...current, status: "unsupported", installed: false });
      if (event === "local-ai:progress") return setFeatureState(state, "localAi", { ...current, status: "downloading", progress: Number(payload?.progress ?? 0) });
      if (event === "local-ai:disconnect") {
        services.localAi.disconnect?.();
        const availability = await services.localAi.availability();
        return setFeatureState(state, "localAi", { ...current, ...availability, connected: false, progress: 0, error: null });
      }
      if (event === "local-ai:connect") {
        try {
          await services.localAi.requestAccess({ onProgress: () => {} });
          const availability = await services.localAi.availability();
          return setFeatureState(state, "localAi", { ...current, ...availability, connected: true, progress: 100, error: null });
        } catch (error) {
          const code = error instanceof Error ? error.message : String(error);
          const message = code === "LOCAL_AI_USER_GESTURE_REQUIRED" ? "Clique directement sur le bouton pour autoriser ou télécharger le modèle local." : code === "LOCAL_AI_UNSUPPORTED" ? "Aucune API d’IA locale compatible n’est disponible ici." : code;
          return setFeatureState(state, "localAi", { ...current, connected: false, error: message });
        }
      }
      const availability = await services.localAi.availability();
      return setFeatureState(state, "localAi", { ...current, ...availability, connected: services.localAi.isConnected?.() ?? false, error: availability.error ?? null });
    },
    ui: {
      order: 2,
      render,
      actions: {
        "local-ai.check": ({ dispatch }) => dispatch("local-ai:check"),
        "local-ai.connect": ({ dispatch }) => dispatch("local-ai:connect"),
        "local-ai.disconnect": ({ dispatch }) => dispatch("local-ai:disconnect")
      }
    }
  }
};
