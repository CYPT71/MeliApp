import { entries } from "./registry.js";

const normalizePath = (value) =>
  String(value ?? "")
    .trim()
    .replace(/^#\/?/, "")
    .replace(/^\/+|\/+$/g, "");

const humanize = (value) =>
  String(value ?? "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const categoryConfig = (name, feature) => {
  if (!feature?.category) return null;

  if (typeof feature.category === "string") {
    const path = normalizePath(feature.category);
    return {
      id: path,
      path,
      title: humanize(path),
      nav: true,
      order: 0,
      icon: null,
      grouped: true
    };
  }

  const id = normalizePath(feature.category.id ?? feature.category.path ?? name);
  const path = normalizePath(feature.category.path ?? id);
  return {
    id,
    path,
    title: feature.category.title ?? humanize(id),
    nav: feature.category.nav ?? true,
    order: Number(feature.category.order ?? 0),
    icon: feature.category.icon ?? null,
    grouped: true
  };
};

export const pageConfig = (name, feature) => {
  const category = categoryConfig(name, feature);
  if (category) return category;
  if (!feature?.page) return null;

  if (feature.page === true) {
    return {
      path: name,
      title: feature.description ?? name,
      nav: true,
      order: 0,
      icon: null,
      grouped: false
    };
  }

  return {
    path: normalizePath(feature.page.path ?? name),
    title: feature.page.title ?? feature.description ?? name,
    nav: feature.page.nav ?? true,
    order: Number(feature.page.order ?? 0),
    icon: feature.page.icon ?? null,
    grouped: false
  };
};

export const featurePages = (registry) => {
  const grouped = new Map();

  for (const [name, feature] of entries(registry)) {
    const page = pageConfig(name, feature);
    if (!page) continue;

    const existing = grouped.get(page.path);
    if (!existing) {
      grouped.set(page.path, {
        name,
        names: [name],
        feature,
        page: { ...page }
      });
      continue;
    }

    existing.names.push(name);
    existing.page.nav = existing.page.nav || page.nav;
    existing.page.order = Math.min(existing.page.order, page.order);
    existing.page.grouped = existing.page.grouped || page.grouped;

    if (!existing.page.icon && page.icon) existing.page.icon = page.icon;
    if ((!existing.page.title || existing.page.title === humanize(existing.page.path)) && page.title) {
      existing.page.title = page.title;
    }
  }

  return [...grouped.values()].sort(
    (a, b) => a.page.order - b.page.order || a.page.path.localeCompare(b.page.path)
  );
};

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
