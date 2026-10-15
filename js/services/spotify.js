import { beginPkce, consumePkceCallback, refreshPublicClientToken } from "./oauth.js";

const KEY = "meliapp:spotify";
const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "user-library-read"
];
const TOKEN_URL = "https://accounts.spotify.com/api/token";

export const createSpotifyService = ({ clientId }) => {
  const normalizedClientId = String(clientId ?? "").trim();
  const configured = Boolean(normalizedClientId);
  let token = sessionStorage.getItem(`${KEY}:access_token`);
  let refreshToken = sessionStorage.getItem(`${KEY}:refresh_token`);

  const assertConfigured = () => {
    if (!configured) throw new Error("SPOTIFY_CONFIGURATION_MISSING");
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
    const callback = await consumePkceCallback({ tokenUrl: TOKEN_URL, clientId: normalizedClientId, storageKey: KEY });
    if (callback) saveTokens(callback);
    if (!token && refreshToken) {
      try {
        saveTokens(await refreshPublicClientToken({ tokenUrl: TOKEN_URL, clientId: normalizedClientId, refreshToken, scopes: SCOPES }));
      } catch {
        refreshToken = null;
        sessionStorage.removeItem(`${KEY}:refresh_token`);
      }
    }
    return token ? { accessToken: token } : null;
  };

  const login = () => {
    assertConfigured();
    return beginPkce({
      authorizeUrl: "https://accounts.spotify.com/authorize",
      clientId: normalizedClientId,
      storageKey: KEY,
      scopes: SCOPES
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
    const data = await refreshPublicClientToken({ tokenUrl: TOKEN_URL, clientId: normalizedClientId, refreshToken, scopes: SCOPES });
    saveTokens(data);
    return Boolean(token);
  };

  const request = async (path, options = {}, retry = true) => {
    assertConfigured();
    if (!token) throw new Error("Spotify non connecté");
    const response = await fetch(`https://api.spotify.com/v1${path}`, {
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
      throw new Error("Session Spotify expirée");
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message ?? "Erreur Spotify");
    return data;
  };

  const playerPath = (path, deviceId) => {
    if (!deviceId) return path;
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}device_id=${encodeURIComponent(deviceId)}`;
  };

  const play = async (contextUri, deviceId = null) => {
    if (!contextUri) return;
    await request(playerPath("/me/player/play", deviceId), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context_uri: contextUri })
    });
  };

  const playTrack = async (trackUri, deviceId = null) => {
    if (!trackUri) return;
    await request(playerPath("/me/player/play", deviceId), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [trackUri] })
    });
  };

  const resume = async (deviceId = null) =>
    request(playerPath("/me/player/play", deviceId), { method: "PUT" });

  const pause = async (deviceId = null) =>
    request(playerPath("/me/player/pause", deviceId), { method: "PUT" });

  const listDevices = async () => {
    const data = await request("/me/player/devices");
    return (data?.devices ?? []).map((device) => ({
      id: device.id,
      name: device.name ?? "Appareil Spotify",
      type: device.type ?? "",
      active: Boolean(device.is_active),
      restricted: Boolean(device.is_restricted),
      volume: device.volume_percent ?? null
    }));
  };

  const getPlayback = async () => {
    const data = await request("/me/player");
    if (!data) return null;
    return {
      playing: Boolean(data.is_playing),
      progressMs: data.progress_ms ?? 0,
      deviceId: data.device?.id ?? null,
      deviceName: data.device?.name ?? null,
      item: data.item ? {
        id: data.item.id,
        name: data.item.name ?? "Titre",
        uri: data.item.uri ?? null,
        artists: (data.item.artists ?? []).map((artist) => artist.name).filter(Boolean),
        image: data.item.album?.images?.[0]?.url ?? null
      } : null
    };
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
        image: playlist.images?.[0]?.url ?? null,
        owner: playlist.owner?.display_name ?? null
      })));
      if (!data?.next) break;
      const next = new URL(data.next);
      path = `${next.pathname.replace("/v1", "")}${next.search}`;
    }
    return playlists;
  };

  const listSavedTracks = async ({ limit = 50 } = {}) => {
    const data = await request(`/me/tracks?limit=${Math.min(50, Math.max(1, Number(limit) || 50))}`);
    return (data?.items ?? []).map((entry) => entry?.track).filter(Boolean).map((track) => ({
      id: track.id,
      name: track.name ?? "Titre",
      uri: track.uri,
      artists: (track.artists ?? []).map((artist) => artist.name).filter(Boolean),
      album: track.album?.name ?? "",
      image: track.album?.images?.[0]?.url ?? null,
      durationMs: track.duration_ms ?? null
    }));
  };

  return {
    login,
    logout,
    restore,
    play,
    playTrack,
    resume,
    pause,
    listDevices,
    getPlayback,
    listPlaylists,
    listSavedTracks,
    isConnected: () => Boolean(token),
    isConfigured: () => configured,
    scopes: () => [...SCOPES]
  };
};
