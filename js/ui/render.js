import { entries } from "../core/registry.js";

const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
};

const appendRenderable = (host, rendered) => {
  if (!rendered) return;
  if (rendered instanceof Node) {
    host.append(rendered);
    return;
  }
  if (Array.isArray(rendered)) {
    rendered.forEach((item) => appendRenderable(host, item));
    return;
  }
  host.append(document.createTextNode(String(rendered)));
};

export const renderFeatures = ({ root, registry, state, dispatch }) => {
  clear(root);
  let renderedCount = 0;

  for (const [name, feature] of entries(registry)) {
    if (typeof feature.ui?.render !== "function") continue;
    if (feature.enabled && !feature.enabled(state)) continue;

    const section = document.createElement("section");
    section.dataset.feature = name;
    section.dataset.zone = feature.ui.zone ?? "main";
    section.className = "feature";

    appendRenderable(section, feature.ui.render({ state, dispatch, feature: name }));
    root.append(section);
    renderedCount += 1;
  }

  if (renderedCount === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<h2>Noyau prêt</h2><p>Ajoute des fonctionnalités dans l’objet <code>features</code>. Le core fera le reste.</p>";
    root.append(empty);
  }
};
