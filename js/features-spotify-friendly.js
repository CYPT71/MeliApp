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

const button = (label, action, attrs = {}) =>
  node("button", { type: "button", "data-action": action, ...attrs, text: label });

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
  autoplayBlocked: false,
  lowEnergy: "",
  focus: "",
  recovery: "",
  boss: "",
  ...featureState(state, "spotify", {})
});

const friendlyError = (message = "") => {
  if (!message) return "";
  if (/SPOTIFY_CONFIGURATION_MISSING|client id|configuration/i.test(message)) {
    return "La connexion Spotify n’est pas encore configurée pour cette version de MeliApp.";
  }
  if (/premium/i.test(message)) return "Le contrôle de lecture Spotify nécessite un compte Premium.";
  if (/active device|device not found|no active device/i.test(message)) {
    return "Ouvre Spotify sur un appareil, lance une musique une fois, puis réessaie ici.";
  }
  if (/expir|401/i.test(message)) return "La session Spotify a expiré. Reconnecte ton compte.";
  return String(message);
};

const chooseDeviceId = (current, requested = null) => {
  if (requested) return requested;
  if (current.selectedDeviceId) return current.selectedDeviceId;
  return current.devices.find((device) => device.active)?.id ?? current.devices[0]?.id ?? null;
};

const loadLibrary = async (services) => {
  const [playlists, tracks, devices, playback] = await Promise.all([
    services.spotify.listPlaylists?.() ?? [],
    services.spotify.listSavedTracks?.({ limit: 50 }) ?? [],
    services.spotify.listDevices?.() ?? [],
    services.spotify.getPlayback?.() ?? null
  ]);
  return { playlists, tracks, devices, playback };
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
  button("▶", "spotify.play-playlist", {
    className: "primary",
    "data-uri": playlist.uri,
    "aria-label": `Lancer la playlist ${playlist.name}`
  })
]);

const trackRow = (track) => node("article", { className: "list-item row row--between spotify-library-row" }, [
  node("div", { className: "stack compact" }, [
    node("strong", { text: track.name }),
    node("small", { className: "muted", text: `${track.artists?.join(", ") || "Artiste"}${track.album ? ` · ${track.album}` : ""}` })
  ]),
  button("▶", "spotify.play-track", {
    className: "primary",
    "data-uri": track.uri,
    "aria-label": `Lancer ${track.name}`
  })
]);

const devicePicker = (current) => {
  if (!current.devices.length) {
    return node("p", { className: "muted", text: "Aucun appareil Spotify disponible. Ouvre Spotify sur ton téléphone ou ton ordinateur." });
  }
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
      node("span", {
        className: "muted",
        text: current.connected
          ? "Lance tes playlists et tes titres aimés directement depuis MeliApp."
          : "MeliApp accède uniquement à ta bibliothèque et au contrôle de lecture après ton autorisation."
      })
    ])
  ]));

  if (!current.connected) {
    if (current.error) root.append(node("p", { className: "connection-message", text: friendlyError(current.error) }));
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

  const playlists = node("section", { className: "stack" }, [
    node("div", { className: "row row--between" }, [
      node("h3", { text: "Mes playlists" }),
      node("span", { className: "task-count", text: String(current.playlists.length) })
    ])
  ]);
  if (!current.playlists.length) playlists.append(node("p", { className: "muted", text: current.loading ? "Chargement…" : "Aucune playlist trouvée." }));
  for (const playlist of current.playlists) playlists.append(playlistRow(playlist));

  const tracks = node("section", { className: "stack" }, [
    node("div", { className: "row row--between" }, [
      node("h3", { text: "Titres aimés" }),
      node("span", { className: "task-count", text: String(current.tracks.length) })
    ])
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
      error: null
    },
    when: [
      ...new Set([
        ...(featureOverrides.spotify.when ?? []),
        "spotify:refresh",
        "spotify:select-device",
        "spotify:play-playlist",
        "spotify:play-track",
        "spotify:resume",
        "spotify:pause"
      ])
    ],
    run: async ({ state, event, payload, services }) => {
      const current = normalize(state);

      if (event === "app:start") {
        try {
          const configured = services.spotify?.isConfigured?.() !== false;
          if (!configured) return setFeatureState(state, "spotify", { ...current, configured: false, connected: false });
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
          return setFeatureState(state, "spotify", { ...current, loading: false, error: error instanceof Error ? error.message : String(error) });
        }
      }

      if (event === "spotify:login") {
        try {
          await services.spotify?.login?.();
          return state;
        } catch (error) {
          return setFeatureState(state, "spotify", { ...current, error: error instanceof Error ? error.message : String(error) });
        }
      }

      if (event === "spotify:logout") {
        await services.spotify?.logout?.();
        return setFeatureState(state, "spotify", {
          ...current,
          connected: false,
          playlists: [],
          tracks: [],
          devices: [],
          playback: null,
          error: null
        });
      }

      if (event === "spotify:select-device") {
        return setFeatureState(state, "spotify", { ...current, selectedDeviceId: payload?.deviceId ?? null, error: null });
      }

      if (event === "spotify:refresh") {
        try {
          let next = setFeatureState(state, "spotify", { ...current, loading: true, error: null });
          const library = await loadLibrary(services);
          return setFeatureState(next, "spotify", {
            ...normalize(next),
            ...library,
            connected: true,
            loading: false,
            selectedDeviceId: library.playback?.deviceId ?? chooseDeviceId({ ...current, ...library }),
            error: null
          });
        } catch (error) {
          return setFeatureState(state, "spotify", { ...current, loading: false, error: error instanceof Error ? error.message : String(error) });
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
          return setFeatureState(state, "spotify", {
            ...current,
            playback,
            selectedDeviceId: playback?.deviceId ?? deviceId,
            autoplayBlocked: false,
            error: null
          });
        } catch (error) {
          return setFeatureState(state, "spotify", {
            ...current,
            autoplayBlocked: true,
            error: error instanceof Error ? error.message : String(error)
          });
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
        "spotify.select-device": ({ event, target, dispatch }) => event.type === "change"
          ? dispatch("spotify:select-device", { deviceId: target.value })
          : undefined,
        "spotify.play-playlist": ({ target, dispatch }) => dispatch("spotify:play-playlist", { uri: target.dataset.uri }),
        "spotify.play-track": ({ target, dispatch }) => dispatch("spotify:play-track", { uri: target.dataset.uri }),
        "spotify.resume": ({ dispatch }) => dispatch("spotify:resume"),
        "spotify.pause": ({ dispatch }) => dispatch("spotify:pause")
      }
    }
  }
};
