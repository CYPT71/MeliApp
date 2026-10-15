import { calendarSourceFeatures } from "./features-calendar-sources.js";

const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;
const setFeatureState = (state, name, next) => ({
  ...state,
  features: {
    ...(state.features ?? {}),
    [name]: typeof next === "function" ? next(featureState(state, name, {})) : next
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
  for (const child of (Array.isArray(children) ? children : [children])) {
    if (child === undefined || child === null || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
};

const button = (label, action, attrs = {}) => node("button", { type: "button", "data-action": action, ...attrs, text: label });

const friendlyError = (message = "") => {
  if (!message) return null;
  if (/configuration|client id|OUTLOOK_CONFIGURATION_MISSING/i.test(message)) return "La connexion Microsoft n’est pas configurée pour cette installation.";
  if (/expir/i.test(message)) return "Une session Microsoft a expiré. Reconnecte uniquement le compte concerné.";
  if (/annul|cancel/i.test(message)) return "Connexion Microsoft annulée.";
  return `Microsoft : ${message}`;
};

const initials = (account) => String(account?.name ?? account?.email ?? "M")
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join("") || "M";

const accountSnapshot = (services) => {
  const accounts = services.outlook?.getAccounts?.() ?? [];
  const active = services.outlook?.getActiveAccount?.() ?? accounts.find((account) => account.active) ?? accounts[0] ?? null;
  return { accounts, active };
};

const applyAccountState = (state, services, { error = null, connectionLost = false } = {}) => {
  const { accounts, active } = accountSnapshot(services);
  const connected = accounts.length > 0;
  const authState = connected ? {
    connected: true,
    account: active,
    accounts,
    activeAccountId: active?.id ?? null
  } : null;
  return {
    ...setFeatureState(state, "microsoftAuth", {
      status: connected ? "connected" : "disconnected",
      error,
      connectionLost: connected ? false : connectionLost,
      accounts,
      activeAccountId: active?.id ?? null
    }),
    auth: { ...(state.auth ?? {}), microsoft: authState }
  };
};

const renderAccount = (account, activeAccountId) => {
  const active = account.id === activeAccountId || account.active;
  return node("article", { className: `microsoft-account-card${active ? " is-active" : ""}` }, [
    node("div", { className: "microsoft-account-card__avatar", "aria-hidden": "true", text: initials(account) }),
    node("div", { className: "stack compact microsoft-account-card__identity" }, [
      node("div", { className: "row" }, [
        node("strong", { text: account.name ?? account.email ?? "Compte Microsoft" }),
        active ? node("span", { className: "connection-pill is-connected", text: "Actif" }) : null
      ]),
      account.email ? node("small", { className: "muted", text: account.email }) : null,
      node("small", {
        className: "muted",
        text: active ? "Les nouveaux blocs MeliApp seront ajoutés sur ce compte." : "Ses agendas participent quand même au planning."
      })
    ]),
    node("div", { className: "row microsoft-account-card__actions" }, [
      !active ? button("Utiliser pour les ajouts", "microsoft.use-account", { className: "secondary", "data-account-id": account.id }) : null,
      button("Déconnecter", "microsoft.disconnect-account", { className: "danger-quiet", "data-account-id": account.id })
    ])
  ]);
};

const render = ({ state }) => {
  const current = featureState(state, "microsoftAuth", {});
  const accounts = current.accounts ?? state.auth?.microsoft?.accounts ?? [];
  const activeAccountId = current.activeAccountId ?? state.auth?.microsoft?.activeAccountId ?? state.auth?.microsoft?.account?.id ?? null;
  const connecting = current.status === "connecting";
  const root = node("div", { className: "stack microsoft-accounts" });

  root.append(node("div", { className: "connection-panel__hero" }, [
    node("span", { className: "connection-panel__icon", text: "🪟" }),
    node("div", { className: "stack compact" }, [
      node("strong", { text: accounts.length ? `${accounts.length} compte${accounts.length > 1 ? "s" : ""} Microsoft connecté${accounts.length > 1 ? "s" : ""}` : "Comptes Microsoft" }),
      node("span", {
        className: "muted",
        text: accounts.length
          ? "MeliApp fusionne les agendas des comptes connectés. Tu choisis lequel reçoit les blocs de focus et les pauses."
          : "Connecte Outlook pour synchroniser tes agendas. Tu peux ajouter plusieurs comptes personnels, scolaires ou professionnels."
      })
    ])
  ]));

  if (current.connectionLost) root.append(node("p", { className: "connection-message", text: "La dernière session Microsoft n’est plus disponible dans ce navigateur." }));
  if (current.error) root.append(node("p", { className: "connection-message", role: "status", text: friendlyError(current.error) }));

  for (const account of accounts) root.append(renderAccount(account, activeAccountId));

  root.append(node("div", { className: "row microsoft-account-toolbar" }, [
    button(connecting ? "Connexion…" : accounts.length ? "+ Ajouter un compte Microsoft" : "Connecter Microsoft", "microsoft.add-account", {
      className: "primary",
      disabled: connecting
    }),
    accounts.length > 1 ? button("Tout déconnecter", "microsoft.disconnect-all", { className: "danger-quiet" }) : null
  ]));

  if (accounts.length > 1) {
    root.append(node("p", { className: "hint", text: "Les agendas des différents comptes sont affichés ensemble, mais restent identifiés par leur compte d’origine." }));
  }
  return root;
};

const AUTH_EVENTS = [
  "app:start",
  "app:resume",
  "sync:manual",
  "auth:microsoft:login",
  "auth:microsoft:add",
  "auth:microsoft:switch",
  "auth:microsoft:logout",
  "auth:microsoft:logout-account",
  "auth:microsoft:logout-all"
];

const baseSync = calendarSourceFeatures.outlookSync;
const syncEvents = [
  "auth:microsoft:add",
  "auth:microsoft:switch",
  "auth:microsoft:logout",
  "auth:microsoft:logout-account",
  "auth:microsoft:logout-all"
];

export const microsoftAccountFeatures = {
  microsoftAuth: {
    description: "Comptes Microsoft / Outlook",
    state: { status: "disconnected", error: null, connectionLost: false, accounts: [], activeAccountId: null },
    when: AUTH_EVENTS,
    run: async ({ state, event, payload, services }) => {
      if (!services.outlook) return state;
      try {
        if (event === "auth:microsoft:login" || event === "auth:microsoft:add") {
          await services.outlook.login();
          return setFeatureState(state, "microsoftAuth", (current) => ({ ...current, status: "connecting", error: null }));
        }

        if (event === "auth:microsoft:switch") {
          services.outlook.setActiveAccount?.(payload?.accountId);
          return applyAccountState(state, services);
        }

        if (event === "auth:microsoft:logout" || event === "auth:microsoft:logout-account") {
          await services.outlook.logout(payload?.accountId);
          const next = applyAccountState(state, services);
          if (services.outlook.isConnected?.()) return next;
          return { ...next, calendar: { calendars: [], events: [], lastSyncAt: null } };
        }

        if (event === "auth:microsoft:logout-all") {
          await services.outlook.logoutAll?.();
          const next = applyAccountState(state, services);
          return { ...next, calendar: { calendars: [], events: [], lastSyncAt: null } };
        }

        const previous = featureState(state, "microsoftAuth", {});
        const previousConnected = Boolean(state.auth?.microsoft?.connected || previous.accounts?.length);
        const session = await services.outlook.restore?.();
        if (!session) return applyAccountState(state, services, { connectionLost: previousConnected });
        return applyAccountState(state, services);
      } catch (error) {
        return setFeatureState(state, "microsoftAuth", (current) => ({
          ...current,
          status: "error",
          error: error instanceof Error ? error.message : String(error)
        }));
      }
    },
    ui: {
      order: 1,
      render,
      actions: {
        "microsoft.add-account": ({ dispatch }) => dispatch("auth:microsoft:add"),
        "microsoft.use-account": ({ target, dispatch }) => dispatch("auth:microsoft:switch", { accountId: target.dataset.accountId }),
        "microsoft.disconnect-account": ({ target, dispatch }) => dispatch("auth:microsoft:logout-account", { accountId: target.dataset.accountId }),
        "microsoft.disconnect-all": ({ dispatch }) => dispatch("auth:microsoft:logout-all")
      }
    }
  },

  outlookSync: {
    ...baseSync,
    when: [...new Set([...(baseSync.when ?? []), ...syncEvents])],
    run: baseSync.run
  }
};
