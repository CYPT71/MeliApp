import { features as baseFeatures } from "./features.js";
import {
  ENERGY_MOODS,
  energyGuidance,
  energyMood,
  energyPercentToScore,
  energyScoreToPercent
} from "./domain/energy.js";

const energyState = (state) => state.features?.energy ?? { value: 5, lowThreshold: 3 };
const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;
const setFeatureState = (state, name, next) => ({
  ...state,
  features: {
    ...(state.features ?? {}),
    [name]: typeof next === "function" ? next(featureState(state, name)) : next
  }
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

const inputField = ({ label, name, value = "", type = "text", placeholder = "", checked = false }) =>
  node("label", { className: "field" }, [
    node("span", { text: label }),
    node("input", { name, type, value, placeholder, checked })
  ]);

const selectField = ({ label, name, value, options }) => {
  const select = node("select", { name });
  for (const option of options) {
    const item = node("option", { value: option.value, text: option.label });
    item.selected = option.value === value;
    select.append(item);
  }
  return node("label", { className: "field" }, [node("span", { text: label }), select]);
};

const formValue = (target, name) => target.closest("form")?.elements?.namedItem(name)?.value ?? "";
const formChecked = (target, name) => Boolean(target.closest("form")?.elements?.namedItem(name)?.checked);

const AI_PROVIDER_IDS = Object.freeze(["openai", "anthropic", "gemini"]);

const AI_DEFAULTS = Object.freeze({
  enabled: false,
  mode: "fusion",
  synthesisProvider: "openai",
  providers: {
    openai: { enabled: true, model: "", keyConfigured: false },
    anthropic: { enabled: true, model: "", keyConfigured: false },
    gemini: { enabled: true, model: "", keyConfigured: false }
  },
  lastSuggestion: null,
  lastMeta: null,
  error: null
});

const normalizedAiState = (state) => {
  const current = featureState(state, "ai", {});
  const providers = Object.fromEntries(
    AI_PROVIDER_IDS.map((id) => [
      id,
      {
        ...AI_DEFAULTS.providers[id],
        ...(current.providers?.[id] ?? {})
      }
    ])
  );

  return {
    ...AI_DEFAULTS,
    ...current,
    providers
  };
};

const providerCard = ({ id, label, current }) => {
  const configured = current.keyConfigured ? "clé chargée pour cette session" : "aucune clé chargée";
  const card = node("fieldset", { className: "list-item ai-provider" });
  card.append(
    node("legend", { text: label }),
    inputField({ label: "Activer", name: `${id}.enabled`, type: "checkbox", checked: current.enabled }),
    inputField({ label: "Modèle", name: `${id}.model`, value: current.model, placeholder: "Nom du modèle dans ton compte" }),
    inputField({ label: "Clé API (session uniquement)", name: `${id}.apiKey`, type: "password", placeholder: configured }),
    node("small", { className: "muted", text: configured })
  );
  if (current.keyConfigured) {
    card.append(node("button", { type: "button", "data-action": "ai.clear-key", "data-provider": id, text: "Oublier la clé" }));
  }
  return card;
};

const energyGauge = (score) => {
  const percent = energyScoreToPercent(score);
  const mood = energyMood(percent);
  const root = node("div", { className: "energy-gauge stack", style: `--energy:${percent}%` });
  const faces = node("div", { className: "energy-gauge__faces", "aria-hidden": "true" });
  for (const item of ENERGY_MOODS) {
    faces.append(node("span", {
      className: `energy-gauge__face${item === mood ? " is-current" : ""}`,
      text: item.emoji,
      title: item.label
    }));
  }

  const slider = node("input", {
    className: "energy-gauge__slider",
    type: "range",
    min: 0,
    max: 100,
    step: 1,
    value: percent,
    "data-action": "energy.set-percent",
    "aria-label": "Niveau d’énergie de 0 à 100",
    "aria-valuetext": `${percent} sur 100, ${mood.label}`
  });

  root.append(
    node("div", { className: "row row--between energy-gauge__header" }, [
      node("strong", { text: "⚡ Énergie" }),
      node("strong", { className: "energy-gauge__value", text: `${percent}/100` })
    ]),
    faces,
    node("div", { className: "energy-gauge__track-wrap" }, [slider]),
    node("div", { className: "energy-gauge__scale", "aria-hidden": "true" }, [
      node("span", { text: "0" }),
      node("span", { text: "20" }),
      node("span", { text: "40" }),
      node("span", { text: "60" }),
      node("span", { text: "80" }),
      node("span", { text: "100" })
    ]),
    node("div", { className: "row row--between" }, [
      node("span", { className: "badge energy-gauge__mood", text: `${mood.emoji} ${mood.label}` }),
      node("small", { className: "muted", text: "Glisse selon ton ressenti du moment" })
    ]),
    node("small", { className: "muted", text: energyGuidance(percent) })
  );

  return root;
};

export const featureOverrides = {
  microsoftAuth: {
    ...baseFeatures.microsoftAuth,
    description: "Calendrier Outlook",
    page: { path: "outlook", title: "Calendrier Outlook", icon: "📅", order: 10 },
    ui: {
      ...baseFeatures.microsoftAuth.ui,
      render: ({ state }) => {
        const current = state.features?.microsoftAuth ?? {};
        const connected = current.status === "connected" || Boolean(state.auth?.microsoft?.connected);
        const root = document.createElement("div");
        root.className = "stack";

        const text = document.createElement("p");
        text.textContent = connected
          ? "Le calendrier Outlook est connecté. MeliApp utilise ses événements pour connaître tes contraintes et tes créneaux libres."
          : "Connecte ton calendrier Outlook pour importer tes événements et construire le planning autour de tes vrais créneaux.";
        root.append(text);

        if (current.error) {
          const error = document.createElement("p");
          error.className = "error";
          error.textContent = current.error;
          root.append(error);
        }

        const button = document.createElement("button");
        button.type = "button";
        button.dataset.action = connected ? "microsoft.logout" : "microsoft.login";
        button.className = connected ? "" : "primary";
        button.textContent = connected ? "Déconnecter le calendrier Outlook" : "Connecter le calendrier Outlook";
        root.append(button);

        return root;
      }
    }
  },

  energy: {
    ...baseFeatures.energy,
    description: "Jauge d’énergie visuelle",
    ui: {
      ...baseFeatures.energy.ui,
      render: ({ state }) => energyGauge(energyState(state).value ?? 5),
      actions: {
        ...baseFeatures.energy.ui.actions,
        "energy.set-percent": ({ target, dispatch }) =>
          dispatch("energy:set", { value: energyPercentToScore(target.value) })
      }
    }
  },

  spotify: {
    ...baseFeatures.spotify,
    run: async (context) => {
      if (context.event === "energy:set") {
        const energy = Number(context.payload?.value ?? energyState(context.state).value ?? 5);
        const threshold = Number(energyState(context.state).lowThreshold ?? 3);
        if (energy > threshold) return context.state;
      }
      return baseFeatures.spotify.run(context);
    }
  },

  ai: {
    ...baseFeatures.ai,
    description: "IA fusionnée · GPT + Claude + Gemini",
    state: AI_DEFAULTS,
    when: ["app:start", "ai:configure", "ai:clear-key", "ai:assist"],
    run: async ({ state, event, payload, services }) => {
      let current = normalizedAiState(state);

      if (event === "app:start") {
        const providers = Object.fromEntries(
          AI_PROVIDER_IDS.map((id) => [
            id,
            { ...current.providers[id], keyConfigured: Boolean(services.ai?.hasKey?.(id)) }
          ])
        );
        return setFeatureState(state, "ai", { ...current, providers });
      }

      if (event === "ai:clear-key") {
        const provider = payload?.provider;
        if (!AI_PROVIDER_IDS.includes(provider)) return state;
        services.ai?.clearKey?.(provider);
        return setFeatureState(state, "ai", {
          ...current,
          providers: {
            ...current.providers,
            [provider]: { ...current.providers[provider], keyConfigured: false }
          }
        });
      }

      if (event === "ai:configure") {
        const incoming = payload?.providers ?? {};
        const providers = { ...current.providers };
        for (const id of AI_PROVIDER_IDS) {
          const config = incoming[id] ?? {};
          if (config.apiKey) services.ai?.setKey?.(id, config.apiKey);
          providers[id] = {
            ...providers[id],
            enabled: config.enabled !== false,
            model: String(config.model ?? providers[id].model ?? "").trim(),
            keyConfigured: config.apiKey ? true : Boolean(services.ai?.hasKey?.(id))
          };
        }
        return setFeatureState(state, "ai", {
          ...current,
          enabled: Boolean(payload?.enabled),
          mode: ["single", "fallback", "fusion"].includes(payload?.mode) ? payload.mode : current.mode,
          synthesisProvider: AI_PROVIDER_IDS.includes(payload?.synthesisProvider) ? payload.synthesisProvider : current.synthesisProvider,
          providers,
          error: null
        });
      }

      if (!current.enabled || !services.ai?.suggest) {
        return baseFeatures.ai.run({ state, event: "ai:assist", payload, services: {} });
      }

      try {
        const result = await services.ai.suggest({
          state,
          mode: current.mode,
          providers: current.providers,
          synthesisProvider: current.synthesisProvider
        });
        return setFeatureState(state, "ai", {
          ...current,
          lastSuggestion: result.text,
          lastMeta: {
            mode: result.mode,
            providersUsed: result.providersUsed ?? [],
            synthesisProvider: result.synthesisProvider ?? null,
            errors: result.errors ?? []
          },
          error: null
        });
      } catch (error) {
        const base = await baseFeatures.ai.run({
          state: setFeatureState(state, "ai", { ...current, enabled: false }),
          event: "ai:assist",
          payload,
          services: {}
        });
        return setFeatureState(base, "ai", {
          ...normalizedAiState(base),
          enabled: current.enabled,
          providers: current.providers,
          mode: current.mode,
          synthesisProvider: current.synthesisProvider,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    },
    ui: {
      ...baseFeatures.ai.ui,
      render: ({ state }) => {
        const current = normalizedAiState(state);
        const form = node("form", { className: "stack ai-hub" });
        form.append(
          node("p", { className: "muted", text: "L’assistant MeliApp est limité à trois IA : GPT, Claude et Gemini. En mode Fusion, les IA activées proposent chacune une piste puis l’une d’elles produit la synthèse finale." }),
          inputField({ label: "Activer l’assistant IA", name: "enabled", type: "checkbox", checked: current.enabled }),
          selectField({
            label: "Mode",
            name: "mode",
            value: current.mode,
            options: [
              { value: "fusion", label: "Fusion · comparer puis synthétiser" },
              { value: "fallback", label: "Secours · essayer les IA dans l’ordre" },
              { value: "single", label: "Simple · utiliser la première IA disponible" }
            ]
          }),
          selectField({
            label: "IA de synthèse",
            name: "synthesisProvider",
            value: current.synthesisProvider,
            options: [
              { value: "openai", label: "GPT / OpenAI" },
              { value: "anthropic", label: "Claude / Anthropic" },
              { value: "gemini", label: "Gemini / Google" }
            ]
          }),
          node("div", { className: "ai-provider-grid" }, [
            providerCard({ id: "openai", label: "GPT / OpenAI", current: current.providers.openai }),
            providerCard({ id: "anthropic", label: "Claude / Anthropic", current: current.providers.anthropic }),
            providerCard({ id: "gemini", label: "Gemini / Google", current: current.providers.gemini })
          ]),
          node("button", { type: "button", className: "primary", "data-action": "ai.save-unified", text: "Enregistrer les IA" })
        );

        if (current.lastSuggestion) form.append(node("aside", { className: "hint", text: current.lastSuggestion }));
        if (current.lastMeta?.providersUsed?.length) {
          const meta = current.lastMeta;
          form.append(node("small", { className: "muted", text: `Utilisé : ${meta.providersUsed.join(" + ")}${meta.synthesisProvider ? ` · synthèse : ${meta.synthesisProvider}` : ""}` }));
        }
        if (current.error) form.append(node("p", { className: "error", text: current.error }));
        form.append(node("small", { className: "muted", text: "Les clés API sont conservées uniquement dans sessionStorage et ne sont jamais exportées avec les données MeliApp." }));
        return form;
      },
      actions: {
        ...baseFeatures.ai.ui.actions,
        "ai.save-unified": ({ target, dispatch }) => {
          const providers = Object.fromEntries(
            AI_PROVIDER_IDS.map((id) => [
              id,
              {
                enabled: formChecked(target, `${id}.enabled`),
                model: formValue(target, `${id}.model`),
                apiKey: formValue(target, `${id}.apiKey`)
              }
            ])
          );
          return dispatch("ai:configure", {
            enabled: formChecked(target, "enabled"),
            mode: formValue(target, "mode"),
            synthesisProvider: formValue(target, "synthesisProvider"),
            providers
          });
        },
        "ai.clear-key": ({ target, dispatch }) => dispatch("ai:clear-key", { provider: target.dataset.provider })
      }
    }
  }
};
