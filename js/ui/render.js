import { entries } from "../core/registry.js";
import {
  featurePages,
  findPageByRoute,
  hrefForPage,
  isFeatureVisibleOnRoute
} from "../core/router.js";

const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
};

const appendRenderable = (host, rendered) => {
  if (!rendered) return;
  if (typeof Node !== "undefined" && rendered instanceof Node) {
    host.append(rendered);
    return;
  }
  if (Array.isArray(rendered)) {
    rendered.forEach((item) => appendRenderable(host, item));
    return;
  }
  host.append(document.createTextNode(String(rendered)));
};

const renderNavigation = ({ root, registry, state, route }) => {
  const pages = featurePages(registry).filter(({ feature, page }) => {
    if (!page.nav) return false;
    return feature.enabled?.(state) ?? true;
  });

  if (pages.length === 0) return;

  const nav = document.createElement("nav");
  nav.className = "feature-nav";
  nav.setAttribute("aria-label", "Navigation principale");

  const home = document.createElement("a");
  home.href = "#";
  home.className = route ? "feature-nav__link" : "feature-nav__link is-active";
  home.textContent = "Accueil";
  nav.append(home);

  for (const { page } of pages) {
    const link = document.createElement("a");
    link.href = hrefForPage(page);
    link.className = page.path === route ? "feature-nav__link is-active" : "feature-nav__link";
    link.setAttribute("aria-current", page.path === route ? "page" : "false");
    link.textContent = page.icon ? `${page.icon} ${page.title}` : page.title;
    nav.append(link);
  }

  root.append(nav);
};

export const renderFeatures = ({ root, registry, state, dispatch, route = "" }) => {
  clear(root);
  renderNavigation({ root, registry, state, route });

  const activePage = findPageByRoute(registry, route);
  let renderedCount = 0;

  if (route && !activePage) {
    const notFound = document.createElement("section");
    notFound.className = "empty-state";
    notFound.innerHTML = "<h2>Page introuvable</h2><p>Cette route ne correspond à aucune feature.</p><p><a href=\"#\">Retour à l’accueil</a></p>";
    root.append(notFound);
    return;
  }

  for (const [name, feature] of entries(registry)) {
    if (typeof feature.ui?.render !== "function") continue;
    if (feature.enabled && !feature.enabled(state)) continue;
    if (!isFeatureVisibleOnRoute({ name, feature, route })) continue;

    const section = document.createElement("section");
    section.dataset.feature = name;
    section.dataset.zone = feature.ui.zone ?? "main";
    section.className = feature.page ? "feature feature--page" : "feature";

    const page = activePage?.name === name ? activePage.page : null;
    if (page) {
      const title = document.createElement("h1");
      title.className = "feature-page__title";
      title.textContent = page.icon ? `${page.icon} ${page.title}` : page.title;
      section.append(title);
    }

    appendRenderable(section, feature.ui.render({ state, dispatch, feature: name, route }));
    root.append(section);
    renderedCount += 1;
  }

  if (renderedCount === 0 && !route) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<h2>Noyau prêt</h2><p>Ajoute des fonctionnalités dans l’objet <code>features</code>. Le core fera le reste.</p>";
    root.append(empty);
  }
};
