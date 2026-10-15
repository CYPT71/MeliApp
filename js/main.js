import { trackVisibleViewport } from "./ui/viewport.js";
import { createDraftService, DRAFT_FORMS } from "./services/drafts.js";
import { createUpdateService } from "./services/updates.js";
import { createRewardFeedback } from "./ui/rewards.js";
import { createApp } from "./core/app.js";
import { EVENTS } from "./core/events.js";
import { features } from "./core/registry.js";
import { routeFromHash } from "./core/router.js";
import { createInitialState, mergePersistedState } from "./core/state.js";
import { createServices } from "./services/index.js";
import { bindFeatureActions } from "./ui/actions.js";
import { renderFeatures } from "./ui/render.js";

trackVisibleViewport();
const root = document.querySelector("#app");
const services = createServices();
let pairing = null;
if (location.hash.startsWith('#pair=')) {
  try { pairing = JSON.parse(decodeURIComponent(location.hash.slice(6))); } catch { pairing = {}; }
  history.replaceState(null, '', location.pathname + location.search + '#/settings');
}
const saveStatus = document.querySelector("#storage-status");
const showStorageError = () => {
  saveStatus.textContent = "Sauvegarde indisponible. Garde cet onglet ouvert et exporte tes données depuis Données.";
  saveStatus.classList.add("is-error");
};
let loadError;
const drafts = createDraftService({ storage: services.storage, onError: showStorageError });
let persisted;
try { persisted = await services.storage.load(); await drafts.load(); }
catch (error) { loadError = error; showStorageError(); }
const reward = createRewardFeedback(document.body);
const initialState = mergePersistedState(createInitialState(features), persisted);

let app;
let route = routeFromHash(window.location.hash);

const rerender = (state, change = {}) => {
  renderFeatures({ root, registry: features, state, dispatch: app.dispatch, route, event: change.event });
  drafts.restore(root, route);
  reward(state);
};

app = createApp({
  registry: features,
  initialState,
  services,
  persist: async (state, change = {}) => {
    // A failed read must never be replaced by an empty initial state.
    if (loadError) throw loadError;
    await services.storage.save(state);
    await drafts.clearFor(change.event, route, change.payload);
  },
  onPersistenceError: showStorageError,
  onPersisted: () => {
    saveStatus.textContent = "Données sauvegardées sur cet appareil · IndexedDB";
    saveStatus.classList.remove("is-error");
  },
  onChange: rerender
});

const rememberDraft = event => {
  if (loadError) return;
  drafts.remember(event.target.closest?.('form'), route)?.catch(showStorageError);
};
root.addEventListener('input', rememberDraft);
root.addEventListener('change', rememberDraft);

bindFeatureActions({
  root,
  registry: features,
  dispatch: app.dispatch,
  getState: app.getState
});

window.addEventListener("hashchange", () => {
  route = routeFromHash(window.location.hash);
  rerender(app.getState());
});

rerender(app.getState());
await app.dispatch(EVENTS.APP_START);
services.peerLink.configure({
  getData: () => ({ tasks: app.getState().features.tasks?.items ?? [], projects: app.getState().features.projects?.items ?? [], energy: app.getState().features.energy, events: app.getState().calendar?.events ?? [] }),
  onStatus: status => app.dispatch('cli-ai:peer-status', status),
  onData: async data => { await app.dispatch('cli-ai:peer-data', data); await app.dispatch('adaptive-plan:refresh'); },
  prompt: (provider, prompt) => services.cliAi.prompt(provider, prompt)
});
if (pairing) { await app.dispatch('cli-ai:peer-join', pairing); pairing = null; }

window.addEventListener("online", () => app.dispatch(EVENTS.APP_ONLINE));
window.addEventListener("offline", () => app.dispatch(EVENTS.APP_OFFLINE));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") app.dispatch(EVENTS.APP_RESUME);
});

const updates = createUpdateService({
  beforeReload: async () => {
    if (loadError) throw loadError;
    for (const form of root.querySelectorAll(DRAFT_FORMS)) await drafts.remember(form, route);
    await app.flush();
    await drafts.flush();
  }
});
updates.start();
