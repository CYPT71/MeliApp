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

const pageIsVisible = ({ names, registry, state, route }) =>
  names.some((name) => {
    const feature = registry[name];
    if (!feature) return false;
    if (!(feature.enabled?.(state) ?? true)) return false;
    return feature.ui?.visible?.({ state, route, feature: name }) ?? true;
  });

const renderNavigation = ({ root, registry, state, route }) => {
  const pages = featurePages(registry).filter(({ names, page }) =>
    page.nav && pageIsVisible({ names, registry, state, route })
  );

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

const renderPageHeader = ({ root, activePage }) => {
  if (!activePage) return;

  const header = document.createElement("header");
  header.className = "category-header";

  const title = document.createElement("h1");
  title.className = "feature-page__title";
  title.textContent = activePage.page.icon
    ? `${activePage.page.icon} ${activePage.page.title}`
    : activePage.page.title;

  header.append(title);
  if (activePage.names.length > 1) {
    const meta = document.createElement("p");
    meta.className = "muted category-header__meta";
    meta.textContent = `${activePage.names.length} modules réunis sur cette page`;
    header.append(meta);
  }

  root.append(header);
};

export const renderFeatures = ({ root, registry, state, dispatch, route = "" }) => {
  clear(root);
  renderNavigation({ root, registry, state, route });

  const activePage = findPageByRoute(registry, route);
  let renderedCount = 0;

  if (route && !activePage) {
    const notFound = document.createElement("section");
    notFound.className = "empty-state";
    notFound.innerHTML = "<h2>Page introuvable</h2><p>Cette route ne correspond à aucune catégorie ou feature.</p><p><a href=\"#\">Retour à l’accueil</a></p>";
    root.append(notFound);
    return;
  }

  if (route) renderPageHeader({ root, activePage });

  const visible = entries(registry)
    .filter(([, feature]) => typeof feature.ui?.render === "function")
    .filter(([, feature]) => !feature.enabled || feature.enabled(state))
    .filter(([name, feature]) => feature.ui?.visible?.({ state, route, feature: name }) ?? true)
    .filter(([name, feature]) => isFeatureVisibleOnRoute({ name, feature, route }))
    .sort(([, a], [, b]) => Number(a.ui?.order ?? 100) - Number(b.ui?.order ?? 100));

  for (const [name, feature] of visible) {
    const section = document.createElement("section");
    section.dataset.feature = name;
    section.dataset.zone = feature.ui.zone ?? "main";
    section.className = route ? "feature feature--page-section" : "feature";

    if (route && activePage?.names.length > 1) {
      const subtitle = document.createElement("h2");
      subtitle.className = "feature-section__title";
      subtitle.textContent = feature.description ?? name;
      section.append(subtitle);
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

  if (renderedCount === 0 && route) {
    const empty = document.createElement("section");
    empty.className = "empty-state";
    empty.innerHTML = "<h2>Rien à afficher ici</h2><p>Les modules de cette catégorie sont actuellement masqués ou désactivés.</p>";
    root.append(empty);
  }
};
