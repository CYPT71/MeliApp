import { beginPkce, consumePkceCallback, refreshPublicClientToken } from "./oauth.js";

const KEY = "meliapp:spotify";
const SCOPES = ["user-read-playback-state", "user-modify-playback-state", "playlist-read-private"];
const TOKEN_URL = "https://accounts.spotify.com/api/token";

export const createSpotifyService = ({ clientId }) => {
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
    const callback = await consumePkceCallback({ tokenUrl: TOKEN_URL, clientId, storageKey: KEY });
    if (callback) saveTokens(callback);
    if (!token && refreshToken) {
      try {
        saveTokens(await refreshPublicClientToken({ tokenUrl: TOKEN_URL, clientId, refreshToken }));
      } catch {
        refreshToken = null;
        sessionStorage.removeItem(`${KEY}:refresh_token`);
      }
    }
    return token ? { accessToken: token } : null;
  };

  const login = () => beginPkce({
    authorizeUrl: "https://accounts.spotify.com/authorize",
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
    const data = await refreshPublicClientToken({ tokenUrl: TOKEN_URL, clientId, refreshToken });
    saveTokens(data);
    return Boolean(token);
  };

  const request = async (path, options = {}, retry = true) => {
    if (!token) throw new Error("Spotify non connecté");
    const response = await fetch(`https://api.spotify.com/v1${path}`, {
      ...options,
      headers: {
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
      throw new Error("Session Spotify expirée");
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message ?? "Erreur Spotify");
    return data;
  };

  const play = async (contextUri) => {
    if (!contextUri) return;
    await request("/me/player/play", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context_uri: contextUri })
    });
  };

  const listPlaylists = async () => {
    const playlists = [];
    let path = "/me/playlists?limit=50";
    while (path && playlists.length < 200) {
      const data = await request(path);
      playlists.push(...(data?.items ?? []).filter(Boolean).map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        uri: playlist.uri,
        tracks: playlist.tracks?.total ?? 0,
        image: playlist.images?.[0]?.url ?? null
      })));
      if (!data?.next) break;
      const next = new URL(data.next);
      path = `${next.pathname.replace("/v1", "")}${next.search}`;
    }
    return playlists;
  };

  return { login, logout, restore, play, listPlaylists, isConnected: () => Boolean(token) };
};
