import { beginPkce, consumePkceCallback, refreshPublicClientToken } from "./oauth.js";

const KEY = "meliapp:microsoft";
const ACCOUNTS_KEY = `${KEY}:accounts`;
const ACTIVE_KEY = `${KEY}:active_account`;
const DEFAULT_SCOPES = ["openid", "profile", "offline_access", "Calendars.ReadWrite", "MailboxSettings.Read"];
const CONFIG_ERROR = "OUTLOOK_CONFIGURATION_MISSING";
const AUTH_MODE_ERROR = "OUTLOOK_AUTH_MODE_MUST_BE_DELEGATED";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const normalizeScopes = (scopes) => {
  const unique = [...new Set((Array.isArray(scopes) ? scopes : DEFAULT_SCOPES).map((scope) => String(scope).trim()).filter(Boolean))];
  for (const required of DEFAULT_SCOPES) if (!unique.includes(required)) unique.push(required);
  return unique;
};

const decodeJwtPayload = (token) => {
  try {
    const payload = String(token ?? "").split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
};

export const accountIdentityFromTokens = (data = {}) => {
  const claims = decodeJwtPayload(data.id_token) ?? decodeJwtPayload(data.access_token) ?? {};
  const email = claims.preferred_username ?? claims.email ?? claims.upn ?? null;
  const id = String(claims.oid ?? claims.sub ?? claims.sid ?? email ?? `microsoft_${Date.now()}`);
  return {
    id,
    name: claims.name ?? email ?? "Compte Microsoft",
    email,
    tenantId: claims.tid ?? null
  };
};

export const encodeCalendarRef = (accountId, calendarId) => `${encodeURIComponent(String(accountId))}::${encodeURIComponent(String(calendarId))}`;

export const decodeCalendarRef = (value, fallbackAccountId = null) => {
  const text = String(value ?? "");
  const separator = text.indexOf("::");
  if (separator < 0) return { accountId: fallbackAccountId, calendarId: text || null };
  return {
    accountId: decodeURIComponent(text.slice(0, separator)),
    calendarId: decodeURIComponent(text.slice(separator + 2))
  };
};

const readJson = (storage, key, fallback) => {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

export const createOutlookService = ({ clientId, tenant = "common", authMode = "delegated", scopes = DEFAULT_SCOPES }) => {
  if (authMode !== "delegated") throw new Error(AUTH_MODE_ERROR);

  const normalizedClientId = String(clientId ?? "").trim();
  const normalizedTenant = String(tenant ?? "common").trim() || "common";
  const delegatedScopes = normalizeScopes(scopes);
  const configured = Boolean(normalizedClientId);
  const authorizeUrl = `https://login.microsoftonline.com/${normalizedTenant}/oauth2/v2.0/authorize`;
  const tokenUrl = `https://login.microsoftonline.com/${normalizedTenant}/oauth2/v2.0/token`;
  let categoryError = null;
  const storedAccounts = readJson(sessionStorage, ACCOUNTS_KEY, []);
  let accounts = Array.isArray(storedAccounts) ? storedAccounts : [];
  let activeAccountId = sessionStorage.getItem(ACTIVE_KEY);
  const categoryDefinitionsByAccount = new Map();
  const categoriesFetchedByAccount = new Set();

  const persist = () => {
    sessionStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    if (activeAccountId) sessionStorage.setItem(ACTIVE_KEY, activeAccountId);
    else sessionStorage.removeItem(ACTIVE_KEY);
  };

  const publicAccount = (account) => account ? ({
    id: account.id,
    name: account.name ?? account.email ?? "Compte Microsoft",
    email: account.email ?? null,
    tenantId: account.tenantId ?? null,
    connected: Boolean(account.accessToken || account.refreshToken),
    active: account.id === activeAccountId
  }) : null;

  const accountById = (id) => accounts.find((account) => account.id === id) ?? null;
  const activeAccount = () => accountById(activeAccountId) ?? accounts[0] ?? null;

  const normalizeActive = () => {
    if (!accountById(activeAccountId)) activeAccountId = accounts[0]?.id ?? null;
    persist();
  };

  const migrateLegacy = () => {
    if (accounts.length) return;
    const accessToken = sessionStorage.getItem(`${KEY}:access_token`);
    const refreshToken = sessionStorage.getItem(`${KEY}:refresh_token`);
    if (!accessToken && !refreshToken) return;
    accounts = [{ id: "legacy", name: "Compte Microsoft", email: null, tenantId: null, accessToken, refreshToken }];
    activeAccountId = "legacy";
    sessionStorage.removeItem(`${KEY}:access_token`);
    sessionStorage.removeItem(`${KEY}:refresh_token`);
    persist();
  };
  migrateLegacy();
  normalizeActive();

  const assertConfigured = () => {
    if (!configured) throw new Error(CONFIG_ERROR);
  };

  const saveAccount = (identity, data = {}, { makeActive = true } = {}) => {
    const previous = accountById(identity.id);
    const next = {
      ...(previous ?? {}),
      ...identity,
      accessToken: data.access_token ?? previous?.accessToken ?? null,
      refreshToken: data.refresh_token ?? previous?.refreshToken ?? null,
      idToken: data.id_token ?? previous?.idToken ?? null
    };
    accounts = accounts.filter((account) => account.id !== identity.id && account.id !== "legacy");
    accounts.push(next);
    if (makeActive) activeAccountId = next.id;
    persist();
    return next;
  };

  const removeAccount = (accountId) => {
    accounts = accounts.filter((account) => account.id !== accountId);
    categoryDefinitionsByAccount.delete(accountId);
    categoriesFetchedByAccount.delete(accountId);
    if (activeAccountId === accountId) activeAccountId = accounts[0]?.id ?? null;
    persist();
  };

  const renewAccount = async (accountId) => {
    const account = accountById(accountId);
    if (!configured || !account?.refreshToken) return false;
    const data = await refreshPublicClientToken({
      tokenUrl,
      clientId: normalizedClientId,
      refreshToken: account.refreshToken,
      scopes: delegatedScopes
    });
    if (!data) return false;
    saveAccount({ id: account.id, name: account.name, email: account.email, tenantId: account.tenantId }, data, { makeActive: false });
    return Boolean(accountById(accountId)?.accessToken);
  };

  const restore = async () => {
    if (!configured) return null;
    const callback = await consumePkceCallback({ tokenUrl, clientId: normalizedClientId, storageKey: KEY });
    if (callback) saveAccount(accountIdentityFromTokens(callback), callback);

    normalizeActive();
    const account = activeAccount();
    if (account && !account.accessToken && account.refreshToken) {
      try {
        await renewAccount(account.id);
      } catch {
        removeAccount(account.id);
      }
    }
    const current = activeAccount();
    if (!current) return null;
    return {
      accessToken: current.accessToken ?? null,
      authMode: "delegated",
      account: publicAccount(current),
      activeAccount: publicAccount(current),
      accounts: accounts.map(publicAccount)
    };
  };

  const login = () => {
    assertConfigured();
    return beginPkce({
      authorizeUrl,
      clientId: normalizedClientId,
      storageKey: KEY,
      scopes: delegatedScopes,
      extra: { response_mode: "query", prompt: "select_account" }
    });
  };

  const logout = async (accountId = activeAccountId) => {
    if (accountId) removeAccount(accountId);
  };

  const logoutAll = async () => {
    accounts = [];
    activeAccountId = null;
    categoryDefinitionsByAccount.clear();
    categoriesFetchedByAccount.clear();
    persist();
  };

  const setActiveAccount = (accountId) => {
    if (!accountById(accountId)) return false;
    activeAccountId = accountId;
    persist();
    return true;
  };

  const requestForAccount = async (accountId, path, options = {}, retry = true) => {
    assertConfigured();
    const account = accountById(accountId);
    if (!account) throw new Error("Compte Outlook non connecté");
    if (!account.accessToken && account.refreshToken) await renewAccount(accountId);
    const current = accountById(accountId);
    if (!current?.accessToken) throw new Error("Compte Outlook non connecté");

    const response = await fetch(`${GRAPH_BASE}${path}`, {
      ...options,
      headers: { Accept: "application/json", Authorization: `Bearer ${current.accessToken}`, ...(options.headers ?? {}) }
    });
    if (response.status === 401 && retry && current.refreshToken) {
      try {
        await renewAccount(accountId);
      } catch (error) {
        if (!["invalid_grant", "interaction_required", "login_required"].includes(error.code)) throw error;
        removeAccount(accountId);
        throw new Error(`Session Outlook expirée pour ${current.email ?? current.name ?? "ce compte"}`);
      }
      return requestForAccount(accountId, path, options, false);
    }
    if (response.status === 401) {
      removeAccount(accountId);
      throw new Error(`Session Outlook expirée pour ${current.email ?? current.name ?? "ce compte"}`);
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.error?.message ?? "Erreur Microsoft Graph");
      error.status = response.status;
      error.accountId = accountId;
      throw error;
    }
    return data;
  };

  const request = (path, options = {}, retry = true) => {
    const account = activeAccount();
    if (!account) throw new Error("Outlook non connecté");
    return requestForAccount(account.id, path, options, retry);
  };

  const listCalendarsForAccount = async (account, namespaceIds) => {
    const calendars = [];
    let path = "/me/calendars?$select=id,name,color,isDefaultCalendar,canEdit";
    const visited = new Set();
    while (path) {
      if (visited.has(path)) throw new Error("Pagination des agendas interrompue");
      visited.add(path);
      const data = await requestForAccount(account.id, path);
      calendars.push(...(data?.value ?? []).map((calendar) => {
        const base = {
          id: namespaceIds ? encodeCalendarRef(account.id, calendar.id) : calendar.id,
          name: calendar.name ?? "Agenda",
          isDefault: Boolean(calendar.isDefaultCalendar),
          isDefaultCalendar: Boolean(calendar.isDefaultCalendar),
          color: calendar.color ?? null,
          canEdit: calendar.canEdit !== false
        };
        if (!namespaceIds) return base;
        return {
          ...base,
          rawCalendarId: calendar.id,
          accountId: account.id,
          accountName: account.name ?? account.email ?? "Microsoft",
          accountEmail: account.email ?? null
        };
      }));
      const next = data?.["@odata.nextLink"];
      if (next && !next.startsWith(`${GRAPH_BASE}/`)) throw new Error("Lien des agendas invalide");
      path = next ? next.slice(GRAPH_BASE.length) : null;
    }
    return calendars;
  };

  const listCalendars = async () => {
    const connected = [...accounts];
    const namespaceIds = connected.length > 1;
    const all = [];
    const failures = [];
    for (const account of connected) {
      try {
        all.push(...await listCalendarsForAccount(account, namespaceIds));
      } catch (error) {
        failures.push(error);
      }
    }
    if (!all.length && failures.length) throw failures[0];
    if (namespaceIds) {
      return all.map((calendar) => ({ ...calendar, name: `${calendar.name} · ${calendar.accountEmail ?? calendar.accountName}` }));
    }
    return all;
  };

  const listCategoriesForAccount = async (accountId, { force = false } = {}) => {
    if (!accountId) return [];
    if (force) categoriesFetchedByAccount.delete(accountId);
    if (categoriesFetchedByAccount.has(accountId)) return categoryDefinitionsByAccount.get(accountId) ?? [];
    categoriesFetchedByAccount.add(accountId);
    const categories = new Map();
    let categoryPath = "/me/outlook/masterCategories?$select=displayName,color";
    const seen = new Set();
    try {
      while (categoryPath) {
        if (seen.has(categoryPath)) throw new Error("Pagination des catégories interrompue");
        seen.add(categoryPath);
        const data = await requestForAccount(accountId, categoryPath);
        for (const category of data?.value ?? []) categories.set(category.displayName, category.color);
        const next = data?.["@odata.nextLink"];
        if (next && !next.startsWith(`${GRAPH_BASE}/`)) throw new Error("Lien des catégories invalide");
        categoryPath = next ? next.slice(GRAPH_BASE.length) : null;
      }
      const definitions = [...categories]
        .filter(([name]) => typeof name === "string")
        .map(([name, color]) => ({ name, color }));
      categoryDefinitionsByAccount.set(accountId, definitions);
      return definitions;
    } catch (error) {
      if (!accountById(accountId)) throw error;
      categoryError = error.status === 403 ? "permission" : "unavailable";
      categoryDefinitionsByAccount.set(accountId, []);
      return [];
    }
  };

  const listCategories = async () => {
    const account = activeAccount();
    if (!account) throw new Error("Outlook non connecté");
    return listCategoriesForAccount(account.id);
  };

  const listEvents = async ({ from, to, calendarIds, calendarId: singleCalendarId = null, calendarName = null }) => {
    const params = new URLSearchParams({
      startDateTime: from,
      endDateTime: to,
      "$orderby": "start/dateTime",
      "$select": "id,subject,start,end,isAllDay,location,webLink,categories,isOnlineMeeting,onlineMeeting,onlineMeetingProvider"
    });
    const namespaceIds = accounts.length > 1;
    let targets = [];

    if (calendarIds === undefined && singleCalendarId === null && !namespaceIds) {
      const account = activeAccount();
      if (account) targets = [{ accountId: account.id, calendarId: null, exposedCalendarId: null }];
    } else {
      const selectedIds = calendarIds === undefined
        ? (singleCalendarId === null ? (await listCalendars()).map((calendar) => calendar.id) : [singleCalendarId])
        : [...new Set(calendarIds)];
      targets = selectedIds.map((value) => {
        const ref = decodeCalendarRef(value, activeAccountId);
        return { accountId: ref.accountId, calendarId: ref.calendarId, exposedCalendarId: value };
      }).filter((target) => target.accountId && target.calendarId);
    }

    const items = [];
    for (const target of targets) {
      let path = target.calendarId === null
        ? `/me/calendarView?${params.toString()}`
        : `/me/calendars/${encodeURIComponent(target.calendarId)}/calendarView?${params.toString()}`;
      const visited = new Set();
      while (path) {
        if (visited.has(path)) throw new Error("Pagination Outlook interrompue");
        visited.add(path);
        const data = await requestForAccount(target.accountId, path, { headers: { Prefer: 'outlook.timezone="UTC"' } });
        items.push(...(data?.value ?? []).map((event) => ({
          ...event,
          accountId: target.accountId,
          calendarId: target.exposedCalendarId
        })));
        const next = data?.["@odata.nextLink"];
        if (next && !next.startsWith(`${GRAPH_BASE}/`)) throw new Error("Lien de pagination Outlook invalide");
        path = next ? next.slice(GRAPH_BASE.length) : null;
      }
    }

    categoryError = null;
    const categoryColors = new Map();
    const accountsWithCategories = [...new Set(items.filter((event) => event.categories?.length).map((event) => event.accountId))];
    for (const accountId of accountsWithCategories) {
      const definitions = await listCategoriesForAccount(accountId, { force: true });
      for (const category of definitions) categoryColors.set(`${accountId}:${category.name}`, category.color);
    }

    return items.map((event) => {
      const base = {
        id: event.id,
        calendarId: event.calendarId ?? "default",
        calendarName: calendarName ?? (namespaceIds ? "Calendrier" : "Calendrier principal"),
        isOnlineMeeting: Boolean(event.isOnlineMeeting),
        onlineMeetingProvider: event.onlineMeetingProvider ?? null,
        onlineMeetingUrl: event.onlineMeeting?.joinUrl ?? null,
        title: event.subject ?? "Événement",
        start: event.start?.dateTime ? `${event.start.dateTime}${event.start.timeZone === "UTC" ? "Z" : ""}` : null,
        end: event.end?.dateTime ? `${event.end.dateTime}${event.end.timeZone === "UTC" ? "Z" : ""}` : null,
        allDay: Boolean(event.isAllDay),
        location: event.location?.displayName ?? "",
        webLink: event.webLink ?? null,
        categories: (event.categories ?? []).filter((name) => typeof name === "string"),
        categoryColors: (event.categories ?? [])
          .filter((name) => categoryColors.has(`${event.accountId}:${name}`))
          .map((name) => ({ name, color: categoryColors.get(`${event.accountId}:${name}`) }))
      };
      if (!namespaceIds) return base;
      const account = accountById(event.accountId);
      return {
        ...base,
        accountId: event.accountId,
        accountName: account?.name ?? account?.email ?? "Microsoft",
        accountEmail: account?.email ?? null
      };
    }).filter((event) => event.start && event.end);
  };

  const createEvent = async ({ title, start, end, body = "", showAs = "busy", categories = [] }) => {
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);
    return request("/me/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: title,
        body: { contentType: "text", content: body },
        start: { dateTime: startDate.toISOString().replace(/Z$/, ""), timeZone: "UTC" },
        end: { dateTime: endDate.toISOString().replace(/Z$/, ""), timeZone: "UTC" },
        showAs,
        categories
      })
    });
  };

  const createFocusBlock = ({ title, start, end }) => createEvent({
    title: `🎯 ${title}`,
    start,
    end,
    body: "Bloc de focus créé par MeliApp."
  });

  const createPlanningBlocks = async (blocks = []) => {
    const published = [];
    for (const block of blocks) {
      if (!block?.startIso || !block?.endIso || !["task", "break"].includes(block.type)) continue;
      const isBreak = block.type === "break";
      const event = await createEvent({
        title: isBreak ? `☕ ${block.title || "Pause"}` : `🎯 ${block.title || "Focus"}`,
        start: block.startIso,
        end: block.endIso,
        body: isBreak
          ? "Pause proposée par MeliApp dans le planning hebdomadaire."
          : `Bloc de travail proposé par MeliApp.${block.deadline ? `\nDeadline : ${block.deadline}` : ""}${block.reason ? `\nPourquoi : ${block.reason}` : ""}`,
        showAs: isBreak ? "free" : "busy"
      });
      published.push(event);
    }
    return published;
  };

  return {
    login,
    logout,
    logoutAll,
    restore,
    listEvents,
    listCalendars,
    listCategories,
    createFocusBlock,
    createPlanningBlocks,
    setActiveAccount,
    getAccounts: () => accounts.map(publicAccount),
    getActiveAccount: () => publicAccount(activeAccount()),
    isConnected: () => accounts.some((account) => Boolean(account.accessToken || account.refreshToken)),
    isConfigured: () => configured,
    getCategoryError: () => categoryError,
    getCategories: () => {
      const account = activeAccount();
      return account ? (categoryDefinitionsByAccount.get(account.id)?.map((category) => ({ ...category })) ?? null) : null;
    },
    getAuthInfo: () => ({
      mode: "delegated",
      tenant: normalizedTenant,
      scopes: [...delegatedScopes],
      authorizeUrl,
      tokenUrl,
      usesClientSecret: false,
      graphSubject: "/me",
      multipleAccounts: true
    })
  };
};
