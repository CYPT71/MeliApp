import { beginPkce, consumePkceCallback, refreshPublicClientToken } from "./oauth.js";

const KEY = "meliapp:microsoft";
const SCOPES = ["openid", "profile", "offline_access", "Calendars.ReadWrite"];

export const createOutlookService = ({ clientId, tenant = "common" }) => {
  const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  let token = sessionStorage.getItem(`${KEY}:access_token`);
  let refreshToken = sessionStorage.getItem(`${KEY}:refresh_token`);

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
    const callback = await consumePkceCallback({ tokenUrl, clientId, storageKey: KEY });
    if (callback) saveTokens(callback);
    if (!token && refreshToken) {
      try {
        saveTokens(await refreshPublicClientToken({ tokenUrl, clientId, refreshToken, scopes: SCOPES }));
      } catch {
        refreshToken = null;
        sessionStorage.removeItem(`${KEY}:refresh_token`);
      }
    }
    return token ? { accessToken: token } : null;
  };

  const login = () => beginPkce({
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    clientId,
    storageKey: KEY,
    scopes: SCOPES
  });

  const logout = async () => {
    token = null;
    refreshToken = null;
    sessionStorage.removeItem(`${KEY}:access_token`);
    sessionStorage.removeItem(`${KEY}:refresh_token`);
  };

  const renew = async () => {
    if (!refreshToken) return false;
    const data = await refreshPublicClientToken({ tokenUrl, clientId, refreshToken, scopes: SCOPES });
    saveTokens(data);
    return Boolean(token);
  };

  const request = async (path, options = {}, retry = true) => {
    if (!token) throw new Error("Outlook non connecté");
    const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {})
      }
    });
    if (response.status === 401 && retry && refreshToken) {
      await renew();
      return request(path, options, false);
    }
    if (response.status === 401) {
      token = null;
      sessionStorage.removeItem(`${KEY}:access_token`);
      throw new Error("Session Outlook expirée");
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message ?? "Erreur Microsoft Graph");
    return data;
  };

  const listEvents = async ({ from, to }) => {
    const params = new URLSearchParams({
      startDateTime: from,
      endDateTime: to,
      "$orderby": "start/dateTime",
      "$select": "id,subject,start,end,isAllDay,location,webLink"
    });
    const data = await request(`/me/calendarView?${params.toString()}`, {
      headers: { Prefer: 'outlook.timezone="UTC"' }
    });
    return (data?.value ?? []).map((event) => ({
      id: event.id,
      title: event.subject ?? "Événement",
      start: event.start?.dateTime ? `${event.start.dateTime}${event.start.timeZone === "UTC" ? "Z" : ""}` : null,
      end: event.end?.dateTime ? `${event.end.dateTime}${event.end.timeZone === "UTC" ? "Z" : ""}` : null,
      allDay: Boolean(event.isAllDay),
      location: event.location?.displayName ?? "",
      webLink: event.webLink ?? null
    })).filter((event) => event.start && event.end);
  };

  const createFocusBlock = async ({ title, start, end }) => {
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);
    return request("/me/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: `🎯 ${title}`,
        body: { contentType: "text", content: "Bloc de focus créé par MeliApp." },
        start: { dateTime: startDate.toISOString().replace(/Z$/, ""), timeZone: "UTC" },
        end: { dateTime: endDate.toISOString().replace(/Z$/, ""), timeZone: "UTC" },
        showAs: "busy"
      })
    });
  };

  return {
    login,
    logout,
    restore,
    listEvents,
    createFocusBlock,
    isConnected: () => Boolean(token)
  };
};
