// Public application identifiers only. Never put a client_secret or API secret here.
// Microsoft Graph is intentionally configured as a public SPA using delegated user permissions.
const runtime = globalThis.MELIAPP_CONFIG ?? {};

export const config = Object.freeze({
  microsoftClientId: String(runtime.microsoftClientId ?? "").trim(),
  microsoftTenant: String(runtime.microsoftTenant ?? "common").trim() || "common",
  microsoftAuthMode: "delegated",
  microsoftScopes: Object.freeze([
    "openid",
    "profile",
    "offline_access",
    "Calendars.ReadWrite"
  ]),
  spotifyClientId: String(runtime.spotifyClientId ?? "").trim()
});
