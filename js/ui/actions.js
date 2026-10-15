import { findAction } from "../core/registry.js";

export const bindFeatureActions = ({ root, registry, dispatch, getState }) => {
  const listener = async (event) => {
    const target = event.target.closest?.("[data-action]");
    if (!target || !root.contains(target)) return;
    if (event.type === "click" && target.type === "submit" && target.form?.dataset.submitAction) return;

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

  const submit = (event) => {
    const form = event.target;
    if (!form.matches?.('form[data-submit-action]')) return;
    event.preventDefault();
    const button = [...form.querySelectorAll('[data-action]')].find(
      button => button.dataset.action === form.dataset.submitAction
    );
    const found = findAction(registry, form.dataset.submitAction);
    if (!button || !found) return;
    return found.handler({ event, target: button, state: getState(), dispatch, feature: found.featureName });
  };
  root.addEventListener("submit", submit);
  root.addEventListener("click", listener);
  root.addEventListener("input", listener);
  root.addEventListener("change", listener);

  return () => {
    root.removeEventListener("submit", submit);
    root.removeEventListener("click", listener);
    root.removeEventListener("input", listener);
    root.removeEventListener("change", listener);
  };
};
