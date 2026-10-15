import test from "node:test";
import assert from "node:assert/strict";

const memory = new Map();
globalThis.sessionStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};

const { createSpotifyService } = await import("../js/services/spotify.js");

test("Spotify requires a public client id and exposes user-library scopes", () => {
  const missing = createSpotifyService({ clientId: "" });
  assert.equal(missing.isConfigured(), false);

  const service = createSpotifyService({ clientId: "spotify-public-client-id" });
  assert.equal(service.isConfigured(), true);
  assert.deepEqual(service.scopes(), [
    "user-read-playback-state",
    "user-modify-playback-state",
    "playlist-read-private",
    "user-library-read"
  ]);
});

test("Spotify service exposes playlist, liked-track and player controls", () => {
  const service = createSpotifyService({ clientId: "spotify-public-client-id" });
  for (const method of [
    "listPlaylists",
    "listSavedTracks",
    "listDevices",
    "getPlayback",
    "play",
    "playTrack",
    "resume",
    "pause"
  ]) {
    assert.equal(typeof service[method], "function", `${method} should be available`);
  }
});
