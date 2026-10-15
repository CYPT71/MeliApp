import { featureOverrides } from "./features-overrides.js";

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
    else if (key === "selected") element.selected = Boolean(value);
    else if (key === "value") element.value = value;
    else element.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of (Array.isArray(children) ? children : [children])) {
    if (child === undefined || child === null || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
};

const button = (label, action, attrs = {}) => node("button", { type: "button", "data-action": action, ...attrs, text: label });

const normalize = (state) => ({
  connected: false,
  configured: true,
  playlists: [],
  tracks: [],
  devices: [],
  selectedDeviceId: null,
  playback: null,
  loading: false,
  error: null,
  playbackError: null,
  autoplayBlocked: false,
  lowEnergy: "",
  focus: "",
  recovery: "",
  boss: "",
  ...featureState(state, "spotify", {})
});

const spotifyEndpointLabel = (path = "") => {
  if (/\/me\/playlists/.test(path)) return "tes playlists";
  if (/\/me\/tracks/.test(path)) return "tes titres aimés";
  if (/\/me\/player\/devices/.test(path)) return "tes appareils Spotify";
  if (/\/me\/player\/play/.test(path)) return "le démarrage de la lecture";
  if (/\/me\/player\/pause/.test(path)) return "la mise en pause";
  if (/\/me\/player/.test(path)) return "le lecteur Spotify";
  return "Spotify";
};

const friendlyError = (message = "") => {
  if (!message) return "";

  const raw = String(message);
  const http = raw.match(/^SPOTIFY_HTTP_(\d+)\|([^|]*)\|(.*)$/s);
  if (http) {
    const [, statusText, path, spotifyMessage] = http;
    const status = Number(statusText);
    const target = spotifyEndpointLabel(path);
    const detail = spotifyMessage && spotifyMessage !== "Réponse Spotify sans détail" ? ` Détail Spotify : ${spotifyMessage}` : "";

    if (status === 400) return `Spotify a refusé la requête pour ${target} (HTTP 400). Vérifie l’appareil sélectionné et les paramètres envoyés.${detail}`;
    if (status === 401) return `La session Spotify n’est plus valide (HTTP 401). Déconnecte puis reconnecte Spotify.${detail}`;
    if (status === 403) return `Spotify refuse l’accès à ${target} (HTTP 403). Vérifie que ton compte est autorisé dans l’app Spotify en mode développement et, pour le contrôle de lecture, que le compte est Premium.${detail}`;
    if (status === 404) return `Spotify ne trouve pas la ressource nécessaire pour ${target} (HTTP 404). Pour le lecteur, ouvre Spotify sur un appareil et lance un titre une fois.${detail}`;
    if (status === 429) return `Spotify limite temporairement les requêtes (HTTP 429). Attends un moment avant de réessayer.${detail}`;
    if (status >= 500) return `Spotify rencontre une erreur serveur (HTTP ${status}) pendant l’accès à ${target}. Réessaie plus tard.${detail}`;
    return `Spotify a répondu HTTP ${status} pendant l’accès à ${target}.${detail}`;
  }

  const network = raw.match(/^SPOTIFY_NETWORK\|([^|]*)\|(.*)$/s);
  if (network) return `Impossible de joindre Spotify pour ${spotifyEndpointLabel(network[1])}. Vérifie la connexion réseau ou un éventuel blocage du navigateur. Détail : ${network[2]}`;

  const expired = raw.match(/^SPOTIFY_SESSION_EXPIRED\|([^|]*)\|(.*)$/s);
  if (expired) return `La session Spotify a expiré pendant l’accès à ${spotifyEndpointLabel(expired[1])}. Reconnecte ton compte.`;

  if (/SPOTIFY_NOT_CONNECTED/i.test(raw)) return "Spotify n’est pas connecté. Reconnecte ton compte.";
  if (/SPOTIFY_CONFIGURATION_MISSING|client id|configuration/i.test(raw)) return "La connexion Spotify n’est pas configurée pour cette version de MeliApp.";
  if (/invalid_client|invalid client/i.test(raw)) return "Spotify refuse le Client ID configuré. Vérifie que SPOTIFY_CLIENTID contient bien le Client ID public de l’application Spotify.";
  if (/redirect|uri/i.test(raw)) return "Spotify refuse l’adresse de retour. Vérifie que https://cypt71.github.io/MeliApp/ est enregistrée exactement dans le Dashboard Spotify.";
  if (/invalid_grant/i.test(raw)) return "Spotify a refusé le code de connexion. Recharge MeliApp puis recommence la connexion Spotify.";
  if (/access_denied/i.test(raw)) return "La connexion Spotify a été refusée ou annulée par l’utilisateur.";
  if (/premium/i.test(raw)) return `Le contrôle de lecture Spotify nécessite généralement Premium. Détail : ${raw}`;
  if (/active device|device not found|no active device/i.test(raw)) return "Aucun appareil Spotify actif n’a été trouvé. Ouvre Spotify sur ton téléphone ou ordinateur et lance un titre une fois.";
  if (/expir|401/i.test(raw)) return "La session Spotify a expiré. Reconnecte ton compte.";
  return `Spotify : ${raw}`;
};

const chooseDeviceId = (current, requested = null) =>
  requested || current.selectedDeviceId || current.devices.find((device) => device.active)?.id || current.devices[0]?.id || null;

const settledValue = (result, fallback) => result.status === "fulfilled" ? result.value : fallback;
const settledError = (result) => result.status === "rejected"
  ? (result.reason instanceof Error ? result.reason.message : String(result.reason))
  : null;

const loadLibrary = async (services) => {
  const [playlistsResult, tracksResult, devicesResult, playbackResult] = await Promise.allSettled([
    services.spotify.listPlaylists?.() ?? [],
    services.spotify.listSavedTracks?.({ limit: 50 }) ?? [],
    services.spotify.listDevices?.() ?? [],
    services.spotify.getPlayback?.() ?? null
  ]);

  const playlists = settledValue(playlistsResult, []);
  const tracks = settledValue(tracksResult, []);
  const devices = settledValue(devicesResult, []);
  const playback = settledValue(playbackResult, null);
  const libraryError = settledError(playlistsResult) || settledError(tracksResult);
  const playbackError = settledError(devicesResult) || settledError(playbackResult);

  if (libraryError && !playlists.length && !tracks.length) throw new Error(libraryError);
  return { playlists, tracks, devices, playback, playbackError };
};

const playbackSummary = (playback) => {
  if (!playback?.item) return "Aucune lecture détectée";
  const artists = playback.item.artists?.join(", ");
  return `${playback.playing ? "En lecture" : "En pause"} · ${playback.item.name}${artists ? ` · ${artists}` : ""}`;
};

const playlistRow = (playlist) => node("article", { className: "list-item row row--between spotify-library-row" }, [
  node("div", { className: "stack compact" }, [
    node("strong", { text: playlist.name }),
    node("small", { className: "muted", text: `${playlist.tracks ?? 0} titres${playlist.owner ? ` · ${playlist.owner}` : ""}` })
  ]),
  button("▶", "spotify.play-playlist", { className: "primary", "data-uri": playlist.uri, "aria-label": `Lancer la playlist ${playlist.name}` })
]);

const trackRow = (track) => node("article", { className: "list-item row row--between spotify-library-row" }, [
  node("div", { className: "stack compact" }, [
    node("strong", { text: track.name }),
    node("small", { className: "muted", text: `${track.artists?.join(", ") || "Artiste"}${track.album ? ` · ${track.album}` : ""}` })
  ]),
  button("▶", "spotify.play-track", { className: "primary", "data-uri": track.uri, "aria-label": `Lancer ${track.name}` })
]);

const devicePicker = (current) => {
  if (!current.devices.length) return node("p", { className: "muted", text: "Aucun appareil Spotify disponible. Ouvre Spotify sur ton téléphone ou ton ordinateur." });
  const select = node("select", { "data-action": "spotify.select-device", "aria-label": "Appareil Spotify" });
  for (const device of current.devices) {
    select.append(node("option", {
      value: device.id,
      selected: device.id === chooseDeviceId(current),
      text: `${device.name}${device.active ? " · actif" : ""}${device.type ? ` · ${device.type}` : ""}`
    }));
  }
  return node("label", { className: "field" }, [node("span", { text: "Lire sur" }), select]);
};

const render = ({ state }) => {
  const current = normalize(state);
  const root = node("div", { className: "stack spotify-library" });

  root.append(node("div", { className: "connection-panel__hero" }, [
    node("span", { className: "connection-panel__icon", text: "🎵" }),
    node("div", { className: "stack compact" }, [
      node("strong", { text: current.connected ? "Spotify connecté" : "Connecte Spotify" }),
      node("span", { className: "muted", text: current.connected
        ? "Lance tes playlists et tes titres aimés directement depuis MeliApp."
        : "MeliApp accède uniquement à ta bibliothèque et au contrôle de lecture après ton autorisation." })
    ])
  ]));

  if (!current.connected) {
    if (current.error) root.append(node("p", { className: "connection-message", role: "status", text: friendlyError(current.error) }));
    root.append(button("Connecter mon Spotify", "spotify.login", { className: "primary connection-button" }));
    return root;
  }

  root.append(
    node("div", { className: "row row--between" }, [
      node("div", { className: "stack compact" }, [
        node("strong", { text: playbackSummary(current.playback) }),
        current.playback?.deviceName ? node("small", { className: "muted", text: `Sur ${current.playback.deviceName}` }) : null
      ]),
      node("div", { className: "row" }, [
        button("▶ Reprendre", "spotify.resume"),
        button("Ⅱ Pause", "spotify.pause"),
        button(current.loading ? "Actualisation…" : "Actualiser", "spotify.refresh", { disabled: current.loading ? true : null })
      ])
    ]),
    devicePicker(current)
  );

  if (current.error) root.append(node("p", { className: "connection-message", role: "status", text: friendlyError(current.error) }));
  if (current.playbackError) root.append(node("p", { className: "hint", role: "status", text: friendlyError(current.playbackError) }));

  const playlists = node("section", { className: "stack" }, [
    node("div", { className: "row row--between" }, [node("h3", { text: "Mes playlists" }), node("span", { className: "task-count", text: String(current.playlists.length) })])
  ]);
  if (!current.playlists.length) playlists.append(node("p", { className: "muted", text: current.loading ? "Chargement…" : "Aucune playlist trouvée." }));
  for (const playlist of current.playlists) playlists.append(playlistRow(playlist));

  const tracks = node("section", { className: "stack" }, [
    node("div", { className: "row row--between" }, [node("h3", { text: "Titres aimés" }), node("span", { className: "task-count", text: String(current.tracks.length) })])
  ]);
  if (!current.tracks.length) tracks.append(node("p", { className: "muted", text: current.loading ? "Chargement…" : "Aucun titre aimé trouvé dans les premiers résultats." }));
  for (const track of current.tracks) tracks.append(trackRow(track));

  root.append(playlists, tracks, button("Déconnecter Spotify", "spotify.logout", { className: "secondary" }));
  return root;
};

export const spotifyFriendlyOverride = {
  spotify: {
    ...featureOverrides.spotify,
    description: "Spotify · bibliothèque et lecture",
    state: {
      ...(featureOverrides.spotify.state ?? {}),
      connected: false,
      configured: true,
      playlists: [],
      tracks: [],
      devices: [],
      selectedDeviceId: null,
      playback: null,
      loading: false,
      error: null,
      playbackError: null
    },
    when: [...new Set([...(featureOverrides.spotify.when ?? []), "spotify:refresh", "spotify:select-device", "spotify:play-playlist", "spotify:play-track", "spotify:resume", "spotify:pause"])],
    run: async ({ state, event, payload, services }) => {
      const current = normalize(state);
      if (event === "app:start") {
        const configured = services.spotify?.isConfigured?.() !== false;
        if (!configured) return setFeatureState(state, "spotify", { ...current, configured: false, connected: false });
        try {
          const session = await services.spotify?.restore?.();
          if (!session) return setFeatureState(state, "spotify", { ...current, configured: true, connected: false, error: null });
          const library = await loadLibrary(services);
          return setFeatureState(state, "spotify", {
            ...current,
            ...library,
            configured: true,
            connected: true,
            selectedDeviceId: library.playback?.deviceId ?? chooseDeviceId({ ...current, ...library }),
            loading: false,
            error: null
          });
        } catch (error) {
          return setFeatureState(state, "spotify", {
            ...current,
            configured: true,
            connected: Boolean(services.spotify?.isConnected?.()),
            loading: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      if (event === "spotify:login") {
        try {
          await services.spotify?.login?.();
          return setFeatureState(state, "spotify", { ...current, error: null });
        } catch (error) {
          return setFeatureState(state, "spotify", { ...current, error: error instanceof Error ? error.message : String(error) });
        }
      }
      if (event === "spotify:logout") {
        await services.spotify?.logout?.();
        return setFeatureState(state, "spotify", { ...current, connected: false, playlists: [], tracks: [], devices: [], playback: null, error: null, playbackError: null });
      }
      if (event === "spotify:select-device") return setFeatureState(state, "spotify", { ...current, selectedDeviceId: payload?.deviceId ?? null, error: null });
      if (event === "spotify:refresh") {
        try {
          const library = await loadLibrary(services);
          return setFeatureState(state, "spotify", { ...current, ...library, connected: true, loading: false, selectedDeviceId: library.playback?.deviceId ?? chooseDeviceId({ ...current, ...library }), error: null });
        } catch (error) {
          return setFeatureState(state, "spotify", { ...current, connected: Boolean(services.spotify?.isConnected?.()), loading: false, error: error instanceof Error ? error.message : String(error) });
        }
      }
      if (["spotify:play-playlist", "spotify:play-track", "spotify:resume", "spotify:pause"].includes(event)) {
        try {
          const deviceId = chooseDeviceId(current, payload?.deviceId);
          if (event === "spotify:play-playlist") await services.spotify?.play?.(payload?.uri, deviceId);
          if (event === "spotify:play-track") await services.spotify?.playTrack?.(payload?.uri, deviceId);
          if (event === "spotify:resume") await services.spotify?.resume?.(deviceId);
          if (event === "spotify:pause") await services.spotify?.pause?.(deviceId);
          const playback = await services.spotify?.getPlayback?.();
          return setFeatureState(state, "spotify", { ...current, playback, selectedDeviceId: playback?.deviceId ?? deviceId, autoplayBlocked: false, error: null, playbackError: null });
        } catch (error) {
          return setFeatureState(state, "spotify", { ...current, autoplayBlocked: true, playbackError: error instanceof Error ? error.message : String(error) });
        }
      }
      return featureOverrides.spotify.run({ state, event, payload, services });
    },
    ui: {
      ...(featureOverrides.spotify.ui ?? {}),
      render,
      actions: {
        "spotify.login": ({ dispatch }) => dispatch("spotify:login"),
        "spotify.logout": ({ dispatch }) => dispatch("spotify:logout"),
        "spotify.refresh": ({ dispatch }) => dispatch("spotify:refresh"),
        "spotify.select-device": ({ event, target, dispatch }) => event.type === "change" ? dispatch("spotify:select-device", { deviceId: target.value }) : undefined,
        "spotify.play-playlist": ({ target, dispatch }) => dispatch("spotify:play-playlist", { uri: target.dataset.uri }),
        "spotify.play-track": ({ target, dispatch }) => dispatch("spotify:play-track", { uri: target.dataset.uri }),
        "spotify.resume": ({ dispatch }) => dispatch("spotify:resume"),
        "spotify.pause": ({ dispatch }) => dispatch("spotify:pause")
      }
    }
  }
};
