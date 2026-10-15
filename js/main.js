import { createApp } from "./core/app.js";
import { EVENTS } from "./core/events.js";
import { routeFromHash } from "./core/router.js";
import { createInitialState, mergePersistedState } from "./core/state.js";
import { features } from "./features.js";
import { createServices } from "./services/index.js";
import { bindFeatureActions } from "./ui/actions.js";
import { renderFeatures } from "./ui/render.js";

const root = document.querySelector("#app");
const services = createServices();
const persisted = await services.storage.load().catch(() => null);
const initialState = mergePersistedState(createInitialState(features), persisted);

let app;
let route = routeFromHash(window.location.hash);

const rerender = (state) => renderFeatures({
  root,
  registry: features,
  state,
  dispatch: app.dispatch,
  route
});

app = createApp({
  registry: features,
  initialState,
  services,
  persist: (state) => services.storage.save(state),
  onChange: rerender
});

bindFeatureActions({
  root,
  registry: features,
  dispatch: app.dispatch,
  getState: app.getState
});

rerender(app.getState());
await app.dispatch(EVENTS.APP_START);

window.addEventListener("hashchange", () => {
  route = routeFromHash(window.location.hash);
  rerender(app.getState());
});
window.addEventListener("online", () => app.dispatch(EVENTS.APP_ONLINE));
window.addEventListener("offline", () => app.dispatch(EVENTS.APP_OFFLINE));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") app.dispatch(EVENTS.APP_RESUME);
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(console.error);
