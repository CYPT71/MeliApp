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
    if (!(feature.enabled?.(state) ?? true)) return false;
    return feature.ui?.visible?.({ state, route }) ?? true;
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
    if (page.path === route) link.setAttribute("aria-current", "page");
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

  const visible = entries(registry)
    .filter(([name, feature]) => typeof feature.ui?.render === "function")
    .filter(([name, feature]) => !feature.enabled || feature.enabled(state))
    .filter(([name, feature]) => feature.ui?.visible?.({ state, route, feature: name }) ?? true)
    .filter(([name, feature]) => isFeatureVisibleOnRoute({ name, feature, route }))
    .sort(([, a], [, b]) => Number(a.ui?.order ?? 100) - Number(b.ui?.order ?? 100));

  for (const [name, feature] of visible) {
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
    empty.innerHTML = "<h2>Aucune mission à afficher</h2><p>Le noyau tourne, les features décideront du reste.</p>";
    root.append(empty);
  }
};
