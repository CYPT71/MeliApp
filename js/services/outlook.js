import { beginPkce, consumePkceCallback, refreshPublicClientToken } from "./oauth.js";

const KEY = "meliapp:microsoft";
const DEFAULT_SCOPES = ["openid", "profile", "offline_access", "Calendars.ReadWrite", "MailboxSettings.Read"];
const CONFIG_ERROR = "OUTLOOK_CONFIGURATION_MISSING";
const AUTH_MODE_ERROR = "OUTLOOK_AUTH_MODE_MUST_BE_DELEGATED";

const normalizeScopes = (scopes) => {
  const unique = [...new Set((Array.isArray(scopes) ? scopes : DEFAULT_SCOPES).map((scope) => String(scope).trim()).filter(Boolean))];
  for (const required of ["openid", "profile", "offline_access", "Calendars.ReadWrite", "MailboxSettings.Read"]) {
    if (!unique.includes(required)) unique.push(required);
  }
  return unique;
};

export const createOutlookService = ({ clientId, tenant = "common", authMode = "delegated", scopes = DEFAULT_SCOPES }) => {
  if (authMode !== "delegated") throw new Error(AUTH_MODE_ERROR);

  const normalizedClientId = String(clientId ?? "").trim();
  const normalizedTenant = String(tenant ?? "common").trim() || "common";
  const delegatedScopes = normalizeScopes(scopes);
  const configured = Boolean(normalizedClientId);
  const authorizeUrl = `https://login.microsoftonline.com/${normalizedTenant}/oauth2/v2.0/authorize`;
  const tokenUrl = `https://login.microsoftonline.com/${normalizedTenant}/oauth2/v2.0/token`;
  let token = sessionStorage.getItem(`${KEY}:access_token`);
  let refreshToken = sessionStorage.getItem(`${KEY}:refresh_token`);

  let categoryError = null;

  const assertConfigured = () => {
    if (!configured) throw new Error(CONFIG_ERROR);
  };

  const saveTokens = (data = {}) => {
    if (data.access_token) {
      token = data.access_token;
      sessionStorage.setItem(`${KEY}:access_token`, token);
    }
    if (data.refresh_token) {
      refreshToken = data.refresh_token;
      sessionStorage.setItem(`${KEY}:refresh_token`, refreshToken);
    }
  };

  const restore = async () => {
    if (!configured) return null;
    const callback = await consumePkceCallback({ tokenUrl, clientId: normalizedClientId, storageKey: KEY });
    if (callback) saveTokens(callback);
    if (!token && refreshToken) {
      try {
        saveTokens(await refreshPublicClientToken({ tokenUrl, clientId: normalizedClientId, refreshToken, scopes: delegatedScopes }));
      } catch {
        refreshToken = null;
        sessionStorage.removeItem(`${KEY}:refresh_token`);
      }
    }
    return token ? { accessToken: token, authMode: "delegated" } : null;
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

  const logout = async () => {
    token = null;
    refreshToken = null;
    sessionStorage.removeItem(`${KEY}:access_token`);
    sessionStorage.removeItem(`${KEY}:refresh_token`);
  };

  const renew = async () => {
    if (!configured || !refreshToken) return false;
    const data = await refreshPublicClientToken({ tokenUrl, clientId: normalizedClientId, refreshToken, scopes: delegatedScopes });
    saveTokens(data);
    return Boolean(token);
  };

  const request = async (path, options = {}, retry = true) => {
    assertConfigured();
    if (!token) throw new Error("Outlook non connecté");
    const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...options,
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(options.headers ?? {}) }
    });
    if (response.status === 401 && retry && refreshToken) {
      try {
        await renew();
      } catch (error) {
        if (!["invalid_grant", "interaction_required", "login_required"].includes(error.code)) throw error;
        await logout();
        throw new Error("Session Outlook expirée");
      }
      return request(path, options, false);
    }
    if (response.status === 401) {
      await logout();
      throw new Error("Session Outlook expirée");
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.error?.message ?? "Erreur Microsoft Graph");
      error.status = response.status;
      throw error;
    }
    return data;
  };

  const listCalendars = async () => {
    const calendars = [];
    let path = "/me/calendars?$select=id,name,color,isDefaultCalendar,canEdit";
    const visited = new Set();
    while (path) {
      if (visited.has(path)) throw new Error("Pagination des agendas interrompue");
      visited.add(path);
      const data = await request(path);
      calendars.push(...(data?.value ?? []).map((calendar) => ({
        id: calendar.id,
        name: calendar.name ?? "Agenda",
        isDefault: Boolean(calendar.isDefaultCalendar),
        isDefaultCalendar: Boolean(calendar.isDefaultCalendar),
        color: calendar.color ?? null,
        canEdit: calendar.canEdit !== false
      })));
      const next = data?.["@odata.nextLink"];
      if (next && !next.startsWith("https://graph.microsoft.com/v1.0/")) throw new Error("Lien des agendas invalide");
      path = next ? next.slice("https://graph.microsoft.com/v1.0".length) : null;
    }
    return calendars;
  };

  const listEvents = async ({ from, to, calendarIds, calendarId: singleCalendarId = null, calendarName = null }) => {
    const params = new URLSearchParams({
      startDateTime: from,
      endDateTime: to,
      "$orderby": "start/dateTime",
      "$select": "id,subject,start,end,isAllDay,location,webLink,categories,isOnlineMeeting,onlineMeeting,onlineMeetingProvider"
    });
    const items = [];
    for (const calendarId of calendarIds === undefined ? [singleCalendarId] : [...new Set(calendarIds)]) {
      let path = calendarId === null ? `/me/calendarView?${params.toString()}` : `/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${params.toString()}`;
      const visited = new Set();
      while (path) {
        if (visited.has(path)) throw new Error("Pagination Outlook interrompue");
        visited.add(path);
        const data = await request(path, { headers: { Prefer: 'outlook.timezone="UTC"' } });
        items.push(...(data?.value ?? []).map((event) => ({ ...event, calendarId })));
        const next = data?.["@odata.nextLink"];
        if (next && !next.startsWith("https://graph.microsoft.com/v1.0/")) throw new Error("Lien de pagination Outlook invalide");
        path = next ? next.slice("https://graph.microsoft.com/v1.0".length) : null;
      }
    }
    categoryError = null;
    const categories = new Map();
    if (items.some((event) => event.categories?.length)) {
      let categoryPath = "/me/outlook/masterCategories?$select=displayName,color";
      const seen = new Set();
      try {
        while (categoryPath) {
          if (seen.has(categoryPath)) throw new Error("Pagination des catégories interrompue");
          seen.add(categoryPath);
          const data = await request(categoryPath);
          for (const category of data?.value ?? []) categories.set(category.displayName, category.color);
          const next = data?.["@odata.nextLink"];
          if (next && !next.startsWith("https://graph.microsoft.com/v1.0/")) throw new Error("Lien des catégories invalide");
          categoryPath = next ? next.slice("https://graph.microsoft.com/v1.0".length) : null;
        }
      } catch (error) {
        if (!token) throw error;
        categoryError = error.status === 403 ? "permission" : "unavailable";
      }
    }
    return items.map((event) => ({
      id: event.id,
      calendarId: event.calendarId ?? "default",
      calendarName: calendarName ?? "Calendrier principal",
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
      categoryColors: (event.categories ?? []).filter((name) => categories.has(name)).map((name) => ({ name, color: categories.get(name) }))
    })).filter((event) => event.start && event.end);
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
    restore,
    listEvents,
    listCalendars,
    createFocusBlock,
    createPlanningBlocks,
    isConnected: () => Boolean(token),
    isConfigured: () => configured,
    getCategoryError: () => categoryError,
    getAuthInfo: () => ({
      mode: "delegated",
      tenant: normalizedTenant,
      scopes: [...delegatedScopes],
      authorizeUrl,
      tokenUrl,
      usesClientSecret: false,
      graphSubject: "/me"
    })
  };
};
