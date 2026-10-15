import { featureOverrides } from "./features-overrides.js";

const AI_PROVIDER_IDS = Object.freeze(["openai", "anthropic", "gemini"]);
const AI_LABELS = Object.freeze({
  openai: "GPT / OpenAI",
  anthropic: "Claude / Anthropic",
  gemini: "Gemini / Google"
});
const AI_PENDING_COPY = Object.freeze({
  openai: "Sign in with ChatGPT demande un flow OAuth réel. Sur le web, OpenAI demande une intégration autorisée et un backend pour sécuriser le callback.",
  anthropic: "Aucun flow OAuth délégué Claude adapté à MeliApp n’est configuré actuellement.",
  gemini: "Gemini peut utiliser OAuth Google, mais MeliApp doit d’abord être enregistré dans Google Cloud avec son consentement OAuth."
});

const node = (tag, attrs = {}, children = []) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "className") element.className = value;
    else if (key === "text") element.textContent = String(value);
    else if (key === "checked") element.checked = Boolean(value);
    else if (key === "value") element.value = value;
    else element.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of (Array.isArray(children) ? children : [children])) {
    if (child === undefined || child === null || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
};

const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;
const setFeatureState = (state, name, next) => ({
  ...state,
  features: {
    ...(state.features ?? {}),
    [name]: typeof next === "function" ? next(featureState(state, name)) : next
  }
});

const friendlyOutlookError = (message = "") => {
  if (!message) return "";
  if (/client id|configuration|OUTLOOK_CONFIGURATION_MISSING/i.test(message)) {
    return "La connexion Outlook n’est pas disponible pour le moment.";
  }
  if (/annul|cancel/i.test(message)) return "Connexion Outlook annulée.";
  if (/expir/i.test(message)) return "La connexion Outlook a expiré. Reconnecte ton calendrier.";
  return "Impossible de connecter Outlook pour le moment. Réessaie dans un instant.";
};

const normalizeAi = (state) => {
  const current = featureState(state, "ai", {});
  return {
    ...current,
    enabled: Boolean(current.enabled),
    mode: current.mode ?? "fusion",
    synthesisProvider: current.synthesisProvider ?? "openai",
    providers: Object.fromEntries(AI_PROVIDER_IDS.map((id) => [
      id,
      {
        enabled: current.providers?.[id]?.enabled !== false,
        connected: Boolean(current.providers?.[id]?.connected ?? current.providers?.[id]?.keyConfigured),
        connectable: Boolean(current.providers?.[id]?.connectable),
        status: current.providers?.[id]?.status ?? "idle",
        model: current.providers?.[id]?.model ?? "",
        error: current.providers?.[id]?.error ?? null
      }
    ]))
  };
};

const providerCard = (id, provider) => {
  const connected = Boolean(provider.connected);
  const connectable = Boolean(provider.connectable);
  const status = provider.status === "connecting"
    ? "Connexion…"
    : connected
      ? "Connecté"
      : connectable
        ? "Prêt à connecter"
        : "Configuration requise";

  return node("article", { className: `ai-connect-card${connected ? " is-connected" : ""}` }, [
    node("div", { className: "ai-connect-card__top" }, [
      node("strong", { text: AI_LABELS[id] }),
      node("span", { className: `connection-pill${connected ? " is-connected" : ""}`, text: status })
    ]),
    node("p", {
      className: "muted",
      text: connected
        ? "MeliApp peut utiliser cette IA pour t’aider à choisir la prochaine action."
        : connectable
          ? "La connexion déléguée est prête. MeliApp ouvrira le fournisseur officiel pour demander ton autorisation."
          : AI_PENDING_COPY[id]
    }),
    connected
      ? node("button", {
          type: "button",
          className: "secondary",
          "data-action": "ai.disconnect-provider",
          "data-provider": id,
          text: "Déconnecter"
        })
      : node("button", {
          type: "button",
          className: "primary",
          "data-action": connectable ? "ai.connect-provider" : undefined,
          "data-provider": id,
          disabled: !connectable || provider.status === "connecting" ? true : null,
          text: connectable ? "Connecter" : "À configurer"
        })
  ]);
};

export const connectionFriendlyOverride = {
  microsoftAuth: {
    ...featureOverrides.microsoftAuth,
    description: "Calendrier Outlook",
    ui: {
      ...featureOverrides.microsoftAuth.ui,
      visible: ({ state }) => !state.auth?.microsoft?.connected,
      render: ({ state }) => {
        const current = featureState(state, "microsoftAuth", {});
        const connected = current.status === "connected" || Boolean(state.auth?.microsoft?.connected);
        const cached = !connected && Boolean(state.calendar?.events?.length || state.calendar?.lastSyncAt);
        const root = node("div", { className: "stack connection-panel" });

        root.append(
          node("div", { className: "connection-panel__hero" }, [
            node("span", { className: "connection-panel__icon", text: "📅" }),
            node("div", { className: "stack compact" }, [
              node("strong", { text: connected ? "Calendrier Outlook connecté" : cached ? "Reconnecte ton calendrier Outlook" : "Connecte ton calendrier Outlook" }),
              node("span", {
                className: "muted",
                text: connected
                  ? "Tes rendez-vous servent à construire des créneaux réalistes."
                  : cached
                    ? "Les rendez-vous affichés sont enregistrés sur cet appareil. Ce navigateur n’a pas de connexion Outlook active : reconnecte ton calendrier ici pour les actualiser."
                    : "MeliApp importe tes événements et organise tes missions autour de tes vrais créneaux."
              })
            ])
          ])
        );

        if (current.connectionLost) {
          root.append(node("p", {
            className: "connection-message", role: "status",
            text: "La connexion à ton calendrier Outlook a été perdue. Reconnecte-toi pour reprendre la synchronisation."
          }));
        }
        if (current.error) {
          root.append(node("p", { className: "connection-message", role: "status", text: friendlyOutlookError(current.error) }));
        }

        root.append(node("button", {
          type: "button",
          className: connected ? "secondary connection-button" : "primary connection-button",
          "data-action": connected ? "microsoft.logout" : "microsoft.login",
          text: connected ? "Déconnecter Outlook" : "Connecter mon calendrier Outlook"
        }));

        return root;
      }
    }
  },

  ai: {
    ...featureOverrides.ai,
    description: "Connexions IA · GPT + Claude + Gemini",
    when: [
      ...new Set([...(featureOverrides.ai.when ?? []), "ai:connect-provider", "ai:disconnect-provider"])
    ],
    run: async ({ state, event, payload, services }) => {
      const current = normalizeAi(state);

      if (event === "app:start") {
        const providers = Object.fromEntries(AI_PROVIDER_IDS.map((id) => [
          id,
          {
            ...current.providers[id],
            connected: Boolean(services.ai?.isConnected?.(id) ?? services.ai?.hasKey?.(id)),
            connectable: Boolean(services.ai?.canConnect?.(id)),
            status: "idle",
            error: null
          }
        ]));
        return setFeatureState(state, "ai", { ...current, providers });
      }

      if (event === "ai:connect-provider") {
        const provider = payload?.provider;
        if (!AI_PROVIDER_IDS.includes(provider) || !current.providers[provider]?.connectable) return state;
        let next = setFeatureState(state, "ai", {
          ...current,
          providers: {
            ...current.providers,
            [provider]: { ...current.providers[provider], status: "connecting", error: null }
          }
        });
        try {
          const result = await services.ai?.connect?.(provider);
          if (!result?.connected && !services.ai?.isConnected?.(provider)) {
            throw new Error("AI_CONNECTION_UNAVAILABLE");
          }
          const refreshed = normalizeAi(next);
          return setFeatureState(next, "ai", {
            ...refreshed,
            enabled: true,
            providers: {
              ...refreshed.providers,
              [provider]: {
                ...refreshed.providers[provider],
                connected: true,
                status: "idle",
                model: result?.model ?? refreshed.providers[provider].model,
                error: null
              }
            }
          });
        } catch {
          const refreshed = normalizeAi(next);
          return setFeatureState(next, "ai", {
            ...refreshed,
            providers: {
              ...refreshed.providers,
              [provider]: {
                ...refreshed.providers[provider],
                connected: false,
                status: "idle",
                error: null
              }
            }
          });
        }
      }

      if (event === "ai:disconnect-provider") {
        const provider = payload?.provider;
        if (!AI_PROVIDER_IDS.includes(provider)) return state;
        await services.ai?.disconnect?.(provider);
        const providers = {
          ...current.providers,
          [provider]: { ...current.providers[provider], connected: false, status: "idle", error: null }
        };
        return setFeatureState(state, "ai", {
          ...current,
          enabled: Object.values(providers).some((item) => item.connected),
          providers
        });
      }

      return featureOverrides.ai.run({ state, event, payload, services });
    },
    ui: {
      ...featureOverrides.ai.ui,
      render: ({ state }) => {
        const current = normalizeAi(state);
        const connectedIds = AI_PROVIDER_IDS.filter((id) => current.providers[id].connected);
        const root = node("div", { className: "stack ai-connections" });

        root.append(
          node("div", { className: "stack compact" }, [
            node("strong", { text: "Connexions IA" }),
            node("p", {
              className: "muted",
              text: "Aucune fausse connexion : un bouton n’est activé que lorsqu’un vrai OAuth délégué est configuré pour MeliApp."
            })
          ]),
          node("div", { className: "ai-connect-grid" }, AI_PROVIDER_IDS.map((id) => providerCard(id, current.providers[id])))
        );

        if (connectedIds.length > 1) {
          root.append(node("p", {
            className: "hint",
            text: "Plusieurs IA sont connectées : le mode Fusion peut comparer leurs propositions et produire une seule recommandation."
          }));
        }
        if (current.lastSuggestion) root.append(node("aside", { className: "hint", text: current.lastSuggestion }));
        return root;
      },
      actions: {
        "ai.connect-provider": ({ target, dispatch }) => dispatch("ai:connect-provider", { provider: target.dataset.provider }),
        "ai.disconnect-provider": ({ target, dispatch }) => dispatch("ai:disconnect-provider", { provider: target.dataset.provider })
      }
    }
  }
};
