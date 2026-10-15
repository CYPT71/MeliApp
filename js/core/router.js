import { entries } from "./registry.js";

const normalizePath = (value) =>
  String(value ?? "")
    .trim()
    .replace(/^#\/?/, "")
    .replace(/^\/+|\/+$/g, "");

export const pageConfig = (name, feature) => {
  if (!feature?.page) return null;

  if (feature.page === true) {
    return {
      path: name,
      title: feature.description ?? name,
      nav: true,
      order: 0
    };
  }

  return {
    path: normalizePath(feature.page.path ?? name),
    title: feature.page.title ?? feature.description ?? name,
    nav: feature.page.nav ?? true,
    order: Number(feature.page.order ?? 0),
    icon: feature.page.icon ?? null
  };
};

export const featurePages = (registry) =>
  entries(registry)
    .map(([name, feature]) => ({ name, feature, page: pageConfig(name, feature) }))
    .filter(({ page }) => page)
    .sort((a, b) => a.page.order - b.page.order || a.name.localeCompare(b.name));

export const routeFromHash = (hash = "") => normalizePath(hash);

export const hrefForPage = (page) => `#/${normalizePath(page.path)}`;

export const findPageByRoute = (registry, route) => {
  const normalized = normalizePath(route);
  if (!normalized) return null;
  return featurePages(registry).find(({ page }) => page.path === normalized) ?? null;
};

export const isFeatureVisibleOnRoute = ({ name, feature, route }) => {
  const page = pageConfig(name, feature);
  const normalized = normalizePath(route);

  if (!page) return normalized === "";
  return page.path === normalized;
};
