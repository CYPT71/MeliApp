# MeliApp / FlowQuest — Cahier des charges & spécifications

Version 1.2

## 1. Vision

MeliApp est une PWA gamifiée d’organisation adaptative, pensée en priorité pour des personnes ayant des difficultés de fonctions exécutives, notamment TDAH/ADHD, sans positionnement médical.

Outlook est la seule intégration obligatoire. Spotify et l’IA sont optionnels.

Le principe directeur est : **l’application suggère et adapte, l’utilisateur garde toujours le contrôle**.

Le principe technique directeur est tout aussi important : **une fonctionnalité se déclare dans un objet, le noyau l’interprète**. Ajouter une fonctionnalité ne doit pas obliger à recréer manuellement son branchement, son rendu, ses événements, ses valeurs par défaut et sa logique de démarrage.

---

## 2. Contraintes techniques

- Full static.
- GitHub Pages.
- HTML5.
- CSS natif.
- JavaScript ES Modules.
- Aucun APK.
- Aucun framework UI obligatoire.
- Aucun TypeScript obligatoire.
- Aucun backend obligatoire pour le MVP.
- IndexedDB pour la persistance locale.
- Service Worker natif pour la PWA.
- Outlook obligatoire.
- Spotify optionnel.
- IA optionnelle.
- Aucun secret développeur dans le frontend.

---

# 3. Architecture fondamentale : Feature Registry

## 3.1 Règle absolue

**Toutes les fonctionnalités de l’application sont décrites dans un seul objet de registre.**

Le noyau applicatif ne connaît pas Outlook, Spotify, l’énergie, les tâches, le Flow, l’XP ou l’IA.

Il sait uniquement :

1. parcourir le registre ;
2. fusionner les états initiaux déclarés ;
3. monter les interfaces déclarées ;
4. binder automatiquement les actions UI ;
5. filtrer les features selon `enabled` ;
6. exécuter celles qui écoutent un événement ;
7. persister le nouvel état ;
8. refaire le rendu.

Le but est qu’une nouvelle feature soit ajoutée principalement en ajoutant **une nouvelle entrée dans l’objet `features`**.

Le développeur ne doit pas avoir à modifier le noyau pour chaque feature.

---

## 3.2 Contrat d’une feature

```js
export const features = {
  nomDeFeature: {
    description: "Description humaine",

    // Valeurs par défaut injectées automatiquement dans state.features.nomDeFeature
    state: {},

    // Activation de la feature
    enabled: ({ state }) => true,

    // Événements écoutés
    on: ["app:start"],

    // Logique métier / orchestration
    run: async ({ state, services, payload }) => state,

    // UI facultative
    ui: {
      zone: "main",
      order: 100,
      visible: ({ state }) => true,
      render: ({ state }) => "",
      actions: {}
    }
  }
};
```

Seuls `description` et au moins une capacité utile (`run`, `ui`, `state`) sont nécessaires.

Les autres clés ont des comportements par défaut gérés par le noyau.

---

# 4. Exemple concret du registre unique

```js
export const features = {
  energy: {
    description: "Gestion du niveau d'énergie",

    state: {
      value: null,
      lowThreshold: 3,
      updatedAt: null
    },

    on: ["energy:set"],

    run: async ({ state, payload }) => ({
      ...state,
      features: {
        ...state.features,
        energy: {
          ...state.features.energy,
          value: payload.value,
          updatedAt: Date.now()
        }
      }
    }),

    ui: {
      zone: "header",
      order: 10,
      render: ({ state }) => `
        <section class="energy-card">
          <label>Énergie : ${state.features.energy.value ?? "?"}/10</label>
          <input
            data-action="energy.set"
            type="range"
            min="1"
            max="10"
            value="${state.features.energy.value ?? 5}"
          >
        </section>
      `,
      actions: {
        "energy.set": ({ event, dispatch }) =>
          dispatch("energy:set", { value: Number(event.target.value) })
      }
    }
  },

  outlookSync: {
    description: "Synchronisation Outlook",

    state: {
      events: [],
      lastSyncAt: null
    },

    enabled: ({ state }) => Boolean(state.auth.microsoft),

    on: ["app:start", "app:resume", "sync:manual"],

    run: async ({ state, services }) => {
      const events = await services.outlook.getEvents();

      return {
        ...state,
        features: {
          ...state.features,
          outlookSync: {
            ...state.features.outlookSync,
            events,
            lastSyncAt: Date.now()
          }
        }
      };
    }
  },

  lowEnergyMusic: {
    description: "Playlist Spotify faible énergie",

    enabled: ({ state }) =>
      state.settings.spotifyEnabled &&
      state.features.energy.value !== null &&
      state.features.energy.value <= state.features.energy.lowThreshold,

    on: ["energy:set"],

    run: async ({ state, services }) => {
      await services.spotify.playConfiguredPlaylist("lowEnergy");
      return state;
    }
  }
};
```

Le registre peut contenir autant de features que nécessaire. Le noyau ne change pas.

---

# 5. Boot automatique

Le démarrage doit être générique.

```js
import { features } from "./features.js";
import { createApp } from "./core.js";
import { createServices } from "./services.js";

const app = createApp({
  features,
  services: createServices()
});

await app.start();
```

`main.js` doit rester extrêmement petit.

Il ne doit contenir aucune logique métier spécifique à une feature.

---

# 6. Génération automatique de l’état initial

Le noyau génère `state.features` depuis le registre.

```js
export const buildFeatureState = (registry) =>
  Object.fromEntries(
    Object.entries(registry).map(([name, feature]) => [
      name,
      structuredClone(feature.state ?? {})
    ])
  );
```

État global :

```js
export const createInitialState = (registry) => ({
  schemaVersion: 1,
  auth: {
    microsoft: null,
    spotify: null,
    ai: null
  },
  settings: {
    spotifyEnabled: false,
    aiEnabled: false,
    notificationsEnabled: false,
    workMode: "free"
  },
  features: buildFeatureState(registry),
  diagnostics: []
});
```

Ainsi, ajouter une feature avec :

```js
state: {
  count: 0
}
```

ajoute automatiquement :

```js
state.features.maFeature.count
```

Aucune modification manuelle de `initialState` n’est nécessaire.

---

# 7. Runner générique

```js
export const runFeatures = async ({
  event,
  payload,
  registry,
  state,
  services,
  dispatch
}) => {
  let nextState = state;

  for (const [name, feature] of Object.entries(registry)) {
    const listens = feature.on?.includes(event) ?? false;
    if (!listens) continue;

    const enabled = feature.enabled?.({
      state: nextState,
      services,
      feature: name
    }) ?? true;

    if (!enabled) continue;

    try {
      nextState = await feature.run?.({
        state: nextState,
        payload,
        services,
        dispatch,
        feature: name
      }) ?? nextState;
    } catch (error) {
      nextState = addDiagnostic(nextState, {
        feature: name,
        event,
        message: String(error),
        at: Date.now()
      });
    }
  }

  return nextState;
};
```

Le runner :

- itère ;
- filtre ;
- exécute ;
- gère les erreurs ;
- ne connaît aucune feature concrète.

---

# 8. UI générée depuis le registre

Le rendu général doit lui aussi itérer sur `features`.

```js
export const renderZone = ({ zone, registry, state }) =>
  Object.entries(registry)
    .filter(([, feature]) => feature.ui?.zone === zone)
    .filter(([, feature]) =>
      feature.ui.visible?.({ state }) ?? true
    )
    .sort(([, a], [, b]) =>
      (a.ui.order ?? 100) - (b.ui.order ?? 100)
    )
    .map(([name, feature]) => `
      <div data-feature="${name}">
        ${feature.ui.render({ state, feature: name })}
      </div>
    `)
    .join("");
```

Zones standards :

```js
export const UI_ZONES = [
  "header",
  "main",
  "sidebar",
  "footer",
  "settings",
  "modal"
];
```

Ajouter une carte, un réglage ou un composant visible doit donc se faire dans la définition de la feature.

---

# 9. Binding automatique des actions UI

Pas de `addEventListener` dispersés partout.

Le noyau utilise une délégation d’événements unique.

```js
export const bindActions = ({ root, registry, dispatch, getState }) => {
  root.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    const actionName = target.dataset.action;

    for (const feature of Object.values(registry)) {
      const handler = feature.ui?.actions?.[actionName];
      if (!handler) continue;

      handler({
        event,
        target,
        dispatch,
        state: getState()
      });

      break;
    }
  });

  root.addEventListener("input", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    const actionName = target.dataset.action;

    for (const feature of Object.values(registry)) {
      const handler = feature.ui?.actions?.[actionName];
      if (handler) {
        handler({ event, target, dispatch, state: getState() });
        break;
      }
    }
  });
};
```

Ainsi, une feature peut fournir son interface et ses actions sans toucher au noyau.

---

# 10. Services et effets de bord

Les fonctions métier restent fonctionnelles et testables.

Les effets externes sont injectés dans `services`.

```js
export const createServices = () => ({
  storage,
  outlook,
  spotify,
  ai,
  notifications
});
```

Les features peuvent appeler les services mais ne doivent pas recréer directement les clients externes.

Exemples d’effets :

- `fetch` Microsoft Graph ;
- Spotify Web API ;
- IndexedDB ;
- Notifications ;
- IA distante.

---

# 11. Arborescence cible simplifiée

L’architecture précédente avec un fichier JavaScript par feature n’est **pas obligatoire**.

Le but est précisément d’éviter de devoir créer quinze modules avant d’ajouter une fonctionnalité simple.

Structure recommandée :

```text
/
├── index.html
├── manifest.webmanifest
├── service-worker.js
├── css/
│   └── app.css
├── js/
│   ├── main.js
│   ├── core.js
│   ├── features.js
│   ├── services.js
│   ├── domain.js
│   └── storage.js
└── assets/
```

Au début, **toutes les features peuvent vivre dans `features.js` dans un seul objet**.

Quand ce fichier devient trop gros, il est permis de répartir les définitions dans plusieurs fichiers uniquement pour la lisibilité, puis de les fusionner :

```js
export const features = {
  ...coreFeatures,
  ...outlookFeatures,
  ...spotifyFeatures
};
```

Le contrat reste un objet unique au runtime.

---

# 12. Composition et dépendances entre features

Une feature ne doit pas appeler directement une autre feature par son implémentation.

Elle peut :

- écouter le même événement ;
- dispatcher un nouvel événement ;
- lire l’état produit par une autre feature ;
- utiliser un service partagé.

Exemple :

```text
energy:set
   ↓
energy
   ↓
planner
   ↓
lowEnergyMusic
   ↓
render
```

Chaque élément réagit parce qu’il écoute l’événement, pas parce que `energy.js` importe `spotify.js`.

---

# 13. Fonctionnalités produit

## 13.1 Outlook obligatoire

- OAuth Authorization Code + PKCE.
- SPA Microsoft.
- Lecture calendrier.
- Écriture calendrier seulement si nécessaire.
- Synchronisation au démarrage, au retour au premier plan et manuellement.
- Calcul des créneaux libres.
- Buffer configurable avant événement.

## 13.2 Tâches

Chaque tâche contient notamment :

```json
{
  "id": "task_123",
  "title": "Rapport marketing",
  "deadline": "2026-10-20T23:59:00+02:00",
  "estimateMinutes": 90,
  "difficulty": 4,
  "importance": 5,
  "progress": 0.35,
  "splittable": true,
  "minimumChunkMinutes": 10,
  "preferredEnergyMin": 5,
  "status": "active"
}
```

## 13.3 Planner local

Fonctions pures :

- `computeUrgency`
- `computeEnergyFit`
- `computeContextFit`
- `computePriorityScore`
- `findFreeWindows`
- `splitTask`
- `selectNextAction`
- `replan`

Le planner doit fonctionner sans IA.

## 13.4 Énergie

Échelle 1 à 10.

- 1-2 : récupération / micro-actions.
- 3-4 : tâches courtes / faible friction.
- 5-7 : rythme normal.
- 8-10 : tâches profondes possibles.

Changer l’énergie dispatch `energy:set`, et toutes les features intéressées réagissent automatiquement.

## 13.5 Modes de travail

### Libre

Aucune durée obligatoire.

### Flow

Aucun arrêt automatique. Durée calculée avec timestamps.

### Focus guidé

Durée proposée, jamais imposée.

### Pomodoro

Totalement optionnel.

## 13.6 Gamification

- XP.
- niveaux.
- progression.
- Boss de projets.
- aucun retrait d’XP pour report.
- aucune mécanique punitive.

## 13.7 Spotify optionnel

- PKCE.
- playlists choisies par l’utilisateur.
- playlist faible énergie.
- focus.
- récupération.
- boss.
- fallback bouton manuel si autoplay bloqué.

## 13.8 IA optionnelle

L’IA peut :

- découper une tâche ;
- reformuler une prochaine action ;
- proposer une durée ;
- aider sur « Je suis bloqué » ;
- expliquer une recommandation.

Elle ne remplace jamais le planner local.

---

# 14. PWA et background

- `manifest.webmanifest`.
- `service-worker.js`.
- installation via navigateur.
- cache du shell.
- mode offline partiel.
- timestamps au lieu de compter sur un `setInterval` permanent.

Exemple :

```js
const elapsed = Date.now() - session.startedAt;
```

Le produit ne doit pas promettre un vrai processus permanent en arrière-plan sur une PWA.

---

# 15. Persistance

IndexedDB.

L’état persistant peut être sauvegardé après chaque dispatch significatif.

```js
await services.storage.save(state);
```

Prévoir :

- migration de schéma ;
- export JSON ;
- import JSON validé ;
- suppression locale complète.

---

# 16. Sécurité

- aucun `client_secret` ;
- aucun mot de passe ;
- aucune clé développeur secrète dans GitHub Pages ;
- scopes OAuth minimaux ;
- CSP ;
- pas de `eval` ;
- validation des imports ;
- validation des réponses IA ;
- aucun token dans les logs.

---

# 17. Tests d’architecture obligatoires

Il faut tester spécifiquement que l’architecture reste générique.

### Test 1 : nouvelle feature sans modification du noyau

Ajouter :

```js
helloWorld: {
  description: "Test architecture",
  state: { count: 0 },
  on: ["hello:increment"],
  run: ({ state }) => ({
    ...state,
    features: {
      ...state.features,
      helloWorld: {
        count: state.features.helloWorld.count + 1
      }
    }
  }),
  ui: {
    zone: "main",
    render: ({ state }) => `
      <button data-action="hello.increment">
        ${state.features.helloWorld.count}
      </button>
    `,
    actions: {
      "hello.increment": ({ dispatch }) => dispatch("hello:increment")
    }
  }
}
```

Résultat attendu :

- état créé automatiquement ;
- UI affichée automatiquement ;
- action bindée automatiquement ;
- événement exécuté automatiquement ;
- persistance automatique ;
- **aucune modification de `main.js`, `core.js` ou du renderer générique**.

Si ce test échoue, l’architecture n’atteint pas son objectif.

---

# 18. Definition of Done architecture

L’architecture est validée lorsque :

- `main.js` ne contient aucune logique spécifique à une fonctionnalité ;
- les features sont regroupées dans un objet ;
- le noyau itère sur l’objet ;
- l’état par défaut des features est construit automatiquement ;
- les événements sont routés automatiquement ;
- les interfaces déclarées dans les features sont rendues automatiquement ;
- les actions UI sont bindées automatiquement ;
- les effets externes passent par les services ;
- ajouter une feature simple ne demande pas de modifier plusieurs fichiers ;
- supprimer une feature consiste principalement à retirer son entrée du registre ;
- désactiver une feature peut se faire via `enabled` ;
- Outlook, Spotify, IA, énergie, planner et gamification respectent tous le même contrat.

---

# 19. Règle de développement

Avant de créer un nouveau fichier ou une nouvelle branche conditionnelle dans le noyau, se demander :

> **Est-ce que cette information pourrait simplement être une propriété de l’objet feature ?**

Si oui, elle doit probablement l’être.

Le noyau doit rester générique, petit et ennuyeux. C’est précisément ce qui permet au reste de l’application d’évoluer sans reconstruire la plomberie à chaque fonctionnalité.