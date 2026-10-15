import { beginPkce, consumePkceCallback } from "./oauth.js";

const KEY = "meliapp:microsoft";

export const createOutlookService = ({ clientId, tenant = "common" }) => {
  let token = sessionStorage.getItem(`${KEY}:access_token`);

  const restore = async () => {
    const callback = await consumePkceCallback({
      tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      clientId,
      storageKey: KEY
    });
    if (callback?.access_token) {
      token = callback.access_token;
      sessionStorage.setItem(`${KEY}:access_token`, token);
    }
    return token ? { accessToken: token } : null;
  };

  const login = () => beginPkce({
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    clientId,
    storageKey: KEY,
    scopes: ["openid", "profile", "offline_access", "Calendars.Read"]
  });

  const logout = async () => {
    token = null;
    sessionStorage.removeItem(`${KEY}:access_token`);
  };

  const request = async (path, options = {}) => {
    if (!token) throw new Error("Outlook non connecté");
    const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {})
      }
    });
    if (response.status === 401) {
      token = null;
      sessionStorage.removeItem(`${KEY}:access_token`);
      throw new Error("Session Outlook expirée");
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? "Erreur Microsoft Graph");
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
    return (data.value ?? []).map((event) => ({
      id: event.id,
      title: event.subject ?? "Événement",
      start: event.start?.dateTime ? `${event.start.dateTime}${event.start.timeZone === "UTC" ? "Z" : ""}` : null,
      end: event.end?.dateTime ? `${event.end.dateTime}${event.end.timeZone === "UTC" ? "Z" : ""}` : null,
      allDay: Boolean(event.isAllDay),
      location: event.location?.displayName ?? "",
      webLink: event.webLink ?? null
    })).filter((event) => event.start && event.end);
  };

  return {
    login,
    logout,
    restore,
    listEvents,
    isConnected: () => Boolean(token)
  };
};
