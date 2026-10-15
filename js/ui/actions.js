import { findAction } from "../core/registry.js";

export const bindFeatureActions = ({ root, registry, dispatch, getState }) => {
  const listener = async (event) => {
    const target = event.target.closest?.("[data-action]");
    if (!target || !root.contains(target)) return;

    const actionName = target.dataset.action;
    const found = findAction(registry, actionName);
    if (!found) return;

    await found.handler({
      event,
      target,
      state: getState(),
      dispatch,
      feature: found.featureName
    });
  };

  root.addEventListener("click", listener);
  root.addEventListener("input", listener);
  root.addEventListener("change", listener);

  return () => {
    root.removeEventListener("click", listener);
    root.removeEventListener("input", listener);
    root.removeEventListener("change", listener);
  };
};
