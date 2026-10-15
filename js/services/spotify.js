import { beginPkce, consumePkceCallback } from "./oauth.js";

const KEY = "meliapp:spotify";

export const createSpotifyService = ({ clientId }) => {
  let token = sessionStorage.getItem(`${KEY}:access_token`);

  const restore = async () => {
    const callback = await consumePkceCallback({
      tokenUrl: "https://accounts.spotify.com/api/token",
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
    authorizeUrl: "https://accounts.spotify.com/authorize",
    clientId,
    storageKey: KEY,
    scopes: ["user-read-playback-state", "user-modify-playback-state", "playlist-read-private"]
  });

  const logout = async () => {
    token = null;
    sessionStorage.removeItem(`${KEY}:access_token`);
  };

  const request = async (path, options = {}) => {
    if (!token) throw new Error("Spotify non connecté");
    const response = await fetch(`https://api.spotify.com/v1${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {})
      }
    });
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

  return { login, logout, restore, play, isConnected: () => Boolean(token) };
};
