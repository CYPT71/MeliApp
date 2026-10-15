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

const featureState = (state, name, fallback = {}) => state.features?.[name] ?? fallback;

const pageCopy = Object.freeze({
  calendar: {
    intro: "Visualise ton temps réel, repère les créneaux exploitables et garde l’agenda comme source de vérité.",
    quest: "Quête du moment",
    questHint: "Trouver le prochain créneau utile"
  },
  tasks: {
    intro: "Capture vite, clarifie ensuite. Priorités, échéances et contexte doivent rester lisibles en un coup d’œil.",
    quest: "Mission",
    questHint: "Fermer une tâche importante"
  },
  projects: {
    intro: "Regroupe les tâches autour d’un résultat concret. Chaque projet doit avoir une prochaine action visible.",
    quest: "Boss",
    questHint: "Faire avancer un projet actif"
  },
  mindmap: {
    intro: "Prends de la hauteur sur les projets et leurs branches sans perdre le fil dans un défilement horizontal sans fin.",
    quest: "Exploration",
    questHint: "Clarifier une branche"
  },
  day: {
    intro: "Transforme l’énergie disponible et les contraintes du calendrier en prochaine action réaliste.",
    quest: "Combo du jour",
    questHint: "Enchaîner une session utile"
  },
  progress: {
    intro: "Mesure la constance plutôt que la culpabilité. L’XP résume l’effort utile déjà accompli.",
    quest: "Progression",
    questHint: "Gagner de l’XP sans surcharger la journée"
  },
  settings: {
    intro: "Configure les connexions, préférences et données. Les réglages sont regroupés pour rester trouvables sans chasse au trésor.",
    quest: "Configuration",
    questHint: "Garder les intégrations saines"
  }
});

const gameSnapshot = (state) => {
  const game = featureState(state, "game", state.game ?? { xp: 0, level: 1, streak: 0 });
  const xp = Math.max(0, Number(game.xp ?? state.game?.xp ?? 0));
  const level = Math.max(1, Number(game.level ?? state.game?.level ?? 1));
  const streak = Math.max(0, Number(game.streak ?? state.game?.streak ?? 0));
  const levelStart = (level - 1) ** 2 * 100;
  const levelEnd = level ** 2 * 100;
  const span = Math.max(1, levelEnd - levelStart);
  const progress = Math.min(100, Math.max(0, ((xp - levelStart) / span) * 100));
  return { xp, level, streak, levelStart, levelEnd, progress };
};

const renderGameHud = ({ root, state, route }) => {
  if (route === "step-by-step") return;
  const { xp, level, streak, levelEnd, progress } = gameSnapshot(state);
  const copy = pageCopy[route] ?? {
    quest: "Mission en cours",
    questHint: route ? "Faire progresser cette zone" : "Choisir la prochaine action utile"
  };

  const hud = document.createElement("aside");
  hud.className = "global-game-hud";
  hud.setAttribute("aria-label", "Progression globale");

  const identity = document.createElement("div");
  identity.className = "global-game-hud__identity";
  identity.innerHTML = `
    <p class="global-game-hud__eyebrow">FlowQuest</p>
    <strong class="global-game-hud__title">Progression globale</strong>
    <div class="global-game-hud__meta">
      <span>${xp} XP</span>
      <span>${streak > 0 ? `🔥 ${streak} jour${streak > 1 ? "s" : ""}` : "🔥 série à lancer"}</span>
    </div>
  `;

  const levelBox = document.createElement("div");
  levelBox.className = "global-game-hud__level";
  levelBox.innerHTML = `<strong>${level}</strong><span>niveau</span>`;

  const progressBox = document.createElement("div");
  progressBox.className = "global-game-hud__progress";
  progressBox.innerHTML = `
    <div class="global-game-hud__track" aria-label="Progression vers le prochain niveau" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}">
      <span class="global-game-hud__fill" style="--xp-progress:${progress.toFixed(1)}%"></span>
    </div>
    <span class="global-game-hud__xp">${Math.max(0, levelEnd - xp)} XP avant niv. ${level + 1}</span>
  `;

  const quest = document.createElement("div");
  quest.className = "global-game-hud__quest";
  quest.innerHTML = `<strong>${copy.quest}</strong><span>${copy.questHint}</span>`;

  hud.append(identity, levelBox, progressBox, quest);
  root.append(hud);
};

const pageIsVisible = ({ names, registry, state, route }) =>
  names.some((name) => {
    const feature = registry[name];
    if (!feature || typeof feature.ui?.render !== "function") return false;
    if (!(feature.enabled?.(state) ?? true)) return false;
    return feature.ui?.visible?.({ state, route, feature: name }) ?? true;
  });

const renderNavigation = ({ root, registry, state, route }) => {
  const pages = featurePages(registry).filter(({ names, page }) =>
    page.nav && pageIsVisible({ names, registry, state, route })
  );

  if (pages.length === 0) return;

  const nav = document.createElement("nav");
  nav.className = "feature-nav scroll-region";
  nav.setAttribute("aria-label", "Navigation principale");

  const home = document.createElement("a");
  home.href = "#";
  home.className = route ? "feature-nav__link" : "feature-nav__link is-active";
  home.textContent = "🏠 Accueil";
  if (!route) home.setAttribute("aria-current", "page");
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

  const copy = pageCopy[activePage.page.path];
  if (copy?.intro) {
    const intro = document.createElement("div");
    intro.className = "ui-intro";
    intro.innerHTML = `<strong>À quoi sert cet écran ?</strong><span>${copy.intro}</span>`;
    header.append(intro);
  } else if (activePage.names.length > 1) {
    const meta = document.createElement("p");
    meta.className = "muted category-header__meta";
    meta.textContent = `${activePage.names.length} modules réunis sur cette page`;
    header.append(meta);
  }

  root.append(header);
};

const syncActiveNavigation = (root) => {
  const active = root.querySelector(".feature-nav__link.is-active");
  active?.scrollIntoView?.({ block: "nearest", inline: "center" });
};

export const renderFeatures = ({ root, registry, state, dispatch, route = "" }) => {
  clear(root);
  renderNavigation({ root, registry, state, route });
  renderGameHud({ root, state, route });

  const activePage = findPageByRoute(registry, route);
  let renderedCount = 0;

  if (route && !activePage) {
    const notFound = document.createElement("section");
    notFound.className = "empty-state";
    notFound.innerHTML = "<h2>Page introuvable</h2><p>Cette route ne correspond à aucune catégorie ou feature.</p><p><a href=\"#\">Retour à l’accueil</a></p>";
    root.append(notFound);
    syncActiveNavigation(root);
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

  syncActiveNavigation(root);
};
