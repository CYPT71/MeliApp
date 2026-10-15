# MeliApp / FlowQuest — TODO de développement

> Objectif : construire une PWA **full static GitHub Pages**, en **HTML/CSS/JavaScript pur**, avec une architecture où **toutes les fonctionnalités sont déclarées dans un objet `features`** et où le noyau se contente d’itérer dessus.

Le but est d’éviter le piège merveilleux consistant à créer 14 fichiers, 9 listeners et 3 morceaux de plomberie pour ajouter un bouton.

---

# 0. Contraintes non négociables

- [ ] Aucun APK.
- [ ] Aucun backend obligatoire pour le MVP.
- [ ] GitHub Pages.
- [ ] HTML5 + CSS natif + JavaScript ES Modules.
- [ ] Pas de framework UI obligatoire.
- [ ] Outlook obligatoire.
- [ ] Spotify optionnel.
- [ ] IA optionnelle.
- [ ] Pomodoro optionnel.
- [ ] Aucun secret développeur dans le frontend.
- [ ] Les fonctions métier importantes restent testables comme fonctions pures.
- [ ] Les effets de bord passent par `services`.
- [ ] Ajouter une feature simple ne doit pas demander de modifier le noyau.

---

# 1. Créer le registre unique des features

## 1.1 `js/features.js`

- [ ] Créer **un seul objet `features`**.
- [ ] Toutes les fonctionnalités commencent dans ce fichier.
- [ ] Chaque clé représente une feature.
- [ ] Chaque feature peut déclarer :
  - [ ] `description`
  - [ ] `state`
  - [ ] `enabled`
  - [ ] `on`
  - [ ] `run`
  - [ ] `ui.zone`
  - [ ] `ui.order`
  - [ ] `ui.visible`
  - [ ] `ui.render`
  - [ ] `ui.actions`

Contrat cible :

```js
export const features = {
  example: {
    description: "Exemple",

    state: {
      value: 0
    },

    enabled: ({ state }) => true,

    on: ["example:increment"],

    run: async ({ state }) => ({
      ...state,
      features: {
        ...state.features,
        example: {
          value: state.features.example.value + 1
        }
      }
    }),

    ui: {
      zone: "main",
      order: 100,
      visible: ({ state }) => true,
      render: ({ state }) => `
        <button data-action="example.increment">
          ${state.features.example.value}
        </button>
      `,
      actions: {
        "example.increment": ({ dispatch }) =>
          dispatch("example:increment")
      }
    }
  }
};
```

- [ ] Ne pas créer un fichier par feature au départ.
- [ ] Ne séparer le registre en plusieurs fichiers que si `features.js` devient vraiment trop gros.
- [ ] Même dans ce cas, fusionner les morceaux en **un objet runtime unique**.

Exemple futur possible :

```js
export const features = {
  ...coreFeatures,
  ...outlookFeatures,
  ...spotifyFeatures
};
```

---

# 2. Construire automatiquement l’état depuis les features

## 2.1 `buildFeatureState`

- [ ] Lire `feature.state` pour chaque entrée.
- [ ] Construire automatiquement `state.features`.
- [ ] Utiliser une copie indépendante des valeurs par défaut.
- [ ] Ne pas modifier `initialState` à la main lorsqu’une nouvelle feature apparaît.

```js
export const buildFeatureState = (registry) =>
  Object.fromEntries(
    Object.entries(registry).map(([name, feature]) => [
      name,
      structuredClone(feature.state ?? {})
    ])
  );
```

## 2.2 `createInitialState`

- [ ] Construire l’état global depuis le registre.

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

---

# 3. Créer le runner générique

## 3.1 `runFeatures`

- [ ] Itérer avec `Object.entries(features)`.
- [ ] Vérifier si `feature.on` contient l’événement.
- [ ] Vérifier `feature.enabled`.
- [ ] Appeler `feature.run` si elle existe.
- [ ] Retourner le nouvel état.
- [ ] Isoler les erreurs par feature.
- [ ] Ajouter un diagnostic local sans faire tomber toute l’application.

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
    if (!feature.on?.includes(event)) continue;

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

---

# 4. Créer un `dispatch` unique

- [ ] Créer `dispatch(event, payload)`.
- [ ] `dispatch` appelle `runFeatures`.
- [ ] `dispatch` remplace l’état courant.
- [ ] `dispatch` persiste l’état si nécessaire.
- [ ] `dispatch` déclenche ensuite un rendu.
- [ ] Aucun module métier ne doit appeler directement un autre module métier.

Flow cible :

```text
UI
 ↓
dispatch("energy:set")
 ↓
runFeatures()
 ↓
features intéressées
 ↓
newState
 ↓
persist
 ↓
render
```

---

# 5. Générer l’UI depuis le registre

## 5.1 Zones génériques

- [ ] Créer les zones :
  - [ ] `header`
  - [ ] `main`
  - [ ] `sidebar`
  - [ ] `footer`
  - [ ] `settings`
  - [ ] `modal`

## 5.2 `renderZone`

- [ ] Itérer sur les features.
- [ ] Garder celles qui ont `ui.zone === zone`.
- [ ] Vérifier `ui.visible`.
- [ ] Trier par `ui.order`.
- [ ] Appeler `ui.render`.
- [ ] Injecter le résultat.

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

- [ ] Aucun renderer spécifique `renderEnergy()`, `renderSpotify()`, `renderPlanner()` dans le noyau.
- [ ] Si un rendu est spécifique, il vit dans la feature concernée ou dans une fonction pure appelée par elle.

---

# 6. Binder automatiquement les actions UI

## 6.1 Event delegation

- [ ] Ajouter **un seul listener `click`** sur la racine.
- [ ] Ajouter **un seul listener `input`** sur la racine.
- [ ] Lire `data-action`.
- [ ] Chercher automatiquement le handler correspondant dans `feature.ui.actions`.
- [ ] Appeler le premier handler trouvé.

- [ ] Ne pas faire des dizaines de `querySelector(...).addEventListener(...)` manuels.

```js
export const bindActions = ({ root, registry, dispatch, getState }) => {
  const handle = (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    const action = target.dataset.action;

    for (const feature of Object.values(registry)) {
      const handler = feature.ui?.actions?.[action];
      if (!handler) continue;

      handler({
        event,
        target,
        dispatch,
        state: getState()
      });
      break;
    }
  };

  root.addEventListener("click", handle);
  root.addEventListener("input", handle);
};
```

---

# 7. Garder `main.js` minuscule

`main.js` doit uniquement :

- [ ] importer `features` ;
- [ ] créer les services ;
- [ ] créer l’application ;
- [ ] charger l’état ;
- [ ] binder les actions ;
- [ ] lancer `app:start`.

Cible :

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

- [ ] Aucun `if (spotify)` dans `main.js`.
- [ ] Aucun `if (energy)` dans `main.js`.
- [ ] Aucun `if (outlook)` dans `main.js`.
- [ ] Aucun rendu métier dans `main.js`.

---

# 8. Arborescence minimale

Créer seulement :

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

- [ ] Ne pas créer préventivement 30 fichiers vides.
- [ ] Faire grossir l’architecture uniquement lorsque la complexité réelle le justifie.

---

# 9. Services

## 9.1 `services.js`

- [ ] Exporter un objet de services stable.

```js
export const createServices = () => ({
  storage,
  outlook,
  spotify,
  ai,
  notifications
});
```

- [ ] Les appels réseau passent par les services.
- [ ] IndexedDB passe par le service storage.
- [ ] Les features reçoivent les services en injection.
- [ ] Les features ne recréent pas des clients externes.

---

# 10. Domaine fonctionnel pur

## 10.1 `domain.js`

Ajouter des fonctions pures :

- [ ] `computeUrgency`
- [ ] `computeEnergyFit`
- [ ] `computeContextFit`
- [ ] `computePriorityScore`
- [ ] `findFreeWindows`
- [ ] `splitTask`
- [ ] `selectNextAction`
- [ ] `computeXp`
- [ ] `computeLevel`
- [ ] `computeBossProgress`

- [ ] Ces fonctions ne doivent pas accéder au DOM.
- [ ] Ces fonctions ne doivent pas faire de `fetch`.
- [ ] Ces fonctions ne doivent pas modifier l’état reçu.

---

# 11. Feature Outlook

Ajouter dans `features` les entrées nécessaires, sans modifier le noyau :

- [ ] `microsoftAuth`
- [ ] `outlookSync`
- [ ] `calendarView`
- [ ] `manualSync`

Fonctions :

- [ ] OAuth PKCE.
- [ ] Connexion Microsoft obligatoire.
- [ ] Lecture calendrier.
- [ ] Normalisation des événements.
- [ ] Calcul créneaux libres.
- [ ] Synchronisation démarrage.
- [ ] Synchronisation retour app.
- [ ] Synchronisation manuelle.

Événements possibles :

```text
app:start
app:resume
auth:microsoft:login
auth:microsoft:connected
sync:manual
calendar:synced
```

---

# 12. Feature énergie

Ajouter dans `features` :

- [ ] état `value`, `lowThreshold`, `updatedAt` ;
- [ ] UI slider 1-10 ;
- [ ] action `energy.set` ;
- [ ] event `energy:set` ;
- [ ] expiration optionnelle ;
- [ ] déclenchement automatique du planner.

Règles :

- [ ] 1-2 → récupération / micro-actions.
- [ ] 3-4 → tâches courtes.
- [ ] 5-7 → normal.
- [ ] 8-10 → tâches profondes possibles.

---

# 13. Feature tâches

Ajouter dans `features` :

- [ ] liste des tâches ;
- [ ] création ;
- [ ] édition ;
- [ ] suppression ;
- [ ] complétion ;
- [ ] report ;
- [ ] progression ;
- [ ] deadline ;
- [ ] difficulté ;
- [ ] importance ;
- [ ] durée estimée ;
- [ ] tâche découpable.

- [ ] Les actions UI doivent être déclarées dans `ui.actions`.
- [ ] Les mutations passent par dispatch + runner.

---

# 14. Feature planner

Ajouter dans `features` :

- [ ] écoute `energy:set` ;
- [ ] écoute `calendar:synced` ;
- [ ] écoute `task:created` ;
- [ ] écoute `task:updated` ;
- [ ] écoute `task:completed` ;
- [ ] calcule la prochaine mission ;
- [ ] stocke le résultat dans son propre état de feature.

- [ ] Le planner appelle les fonctions pures de `domain.js`.
- [ ] Le planner fonctionne sans IA.

---

# 15. Feature écran « Maintenant »

Ajouter dans `features` :

- [ ] UI zone `main` ;
- [ ] affiche une seule mission principale ;
- [ ] affiche le prochain événement Outlook ;
- [ ] affiche le temps disponible ;
- [ ] affiche l’énergie ;
- [ ] bouton `COMMENCER` ;
- [ ] action `Changer` ;
- [ ] action `Réduire` ;
- [ ] action `Reporter` ;
- [ ] action `Je suis bloqué`.

- [ ] Aucun renderer spécial à ajouter dans `core.js`.

---

# 16. Feature Flow / Libre / Focus

Ajouter dans `features` :

- [ ] état de session ;
- [ ] `startedAt` ;
- [ ] `endedAt` ;
- [ ] mode courant ;
- [ ] tâche courante.

Modes :

- [ ] Libre.
- [ ] Flow.
- [ ] Focus guidé.
- [ ] Pomodoro optionnel.

- [ ] Ne jamais dépendre d’un `setInterval` permanent pour calculer la durée réelle.
- [ ] Recalculer avec `Date.now() - startedAt`.

---

# 17. Feature gamification

Ajouter dans `features` :

- [ ] XP.
- [ ] niveau.
- [ ] progression Boss.
- [ ] animation légère.
- [ ] aucun retrait d’XP en cas de report.

Événements écoutés :

```text
session:started
session:completed
task:completed
project:progress
```

---

# 18. Feature Spotify optionnelle

Ajouter dans `features` :

- [ ] connexion PKCE ;
- [ ] playlists utilisateur ;
- [ ] playlist lowEnergy ;
- [ ] playlist focus ;
- [ ] playlist recovery ;
- [ ] playlist boss ;
- [ ] bouton fallback si autoplay bloqué.

Feature `lowEnergyMusic` :

- [ ] écoute `energy:set` ;
- [ ] activée seulement si Spotify est connecté ;
- [ ] activée seulement si énergie <= seuil ;
- [ ] utilise `services.spotify` ;
- [ ] ne casse jamais le planner si Spotify échoue.

---

# 19. Feature IA optionnelle

Ajouter dans `features` :

- [ ] connexion/provider utilisateur ;
- [ ] `aiEnabled` ;
- [ ] aide « Je suis bloqué » ;
- [ ] découpage ;
- [ ] reformulation ;
- [ ] explication.

- [ ] Le planner local reste prioritaire.
- [ ] Valider les sorties JSON.
- [ ] Timeout.
- [ ] Fallback local.
- [ ] Ne jamais exécuter une réponse IA arbitraire comme du code.

---

# 20. Feature PWA / installation

Ajouter dans `features` si possible côté UI :

- [ ] état `installPromptAvailable` ;
- [ ] bouton Installer ;
- [ ] event `install:available` ;
- [ ] action `install.run` ;
- [ ] aide iOS.

Créer également :

- [ ] `manifest.webmanifest` ;
- [ ] `service-worker.js` ;
- [ ] cache shell ;
- [ ] offline partiel ;
- [ ] update flow.

---

# 21. Persistance IndexedDB

- [ ] Implémenter `storage.load()`.
- [ ] Implémenter `storage.save(state)`.
- [ ] Implémenter les migrations de schéma.
- [ ] Fusionner intelligemment un ancien état avec les nouveaux `feature.state` par défaut.
- [ ] Une nouvelle feature doit apparaître automatiquement même chez un utilisateur ayant un ancien état sauvegardé.

Fonction nécessaire :

```js
mergeStoredStateWithRegistry({ storedState, registry })
```

- [ ] Conserver les données existantes.
- [ ] Ajouter les nouvelles clés manquantes.
- [ ] Ne pas réinitialiser toute l’app lorsqu’une feature est ajoutée.

---

# 22. Test critique de l’architecture

Créer temporairement cette feature :

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
      "hello.increment": ({ dispatch }) =>
        dispatch("hello:increment")
    }
  }
}
```

Le test est réussi si :

- [ ] l’état `helloWorld` apparaît automatiquement ;
- [ ] le bouton apparaît automatiquement ;
- [ ] le click fonctionne automatiquement ;
- [ ] le compteur change ;
- [ ] l’état est persisté ;
- [ ] aucune modification n’est faite dans `main.js` ;
- [ ] aucune modification n’est faite dans `core.js` ;
- [ ] aucune modification n’est faite dans le renderer générique ;
- [ ] supprimer l’entrée retire la feature.

**Ce test est bloquant.**

---

# 23. Tests unitaires

- [ ] `buildFeatureState`.
- [ ] `createInitialState`.
- [ ] `runFeatures`.
- [ ] filtre `enabled`.
- [ ] filtre `on`.
- [ ] isolation des erreurs.
- [ ] `renderZone`.
- [ ] ordre UI.
- [ ] visibilité UI.
- [ ] binding `data-action`.
- [ ] fusion ancien état + nouvelles features.
- [ ] fonctions planner.
- [ ] fonctions XP.

---

# 24. Definition of Done architecture

- [ ] Toutes les features sont représentées par des objets.
- [ ] Un registre unique existe au runtime.
- [ ] Le noyau itère uniquement sur le registre.
- [ ] L’état par défaut est dérivé du registre.
- [ ] Les événements sont dérivés du registre.
- [ ] Les interfaces sont rendues depuis le registre.
- [ ] Les actions sont bindées depuis le registre.
- [ ] Les features activables utilisent `enabled`.
- [ ] Les effets passent par `services`.
- [ ] Une feature simple peut être ajoutée en une seule entrée d’objet.
- [ ] Aucune modification du noyau n’est requise pour le test `helloWorld`.
- [ ] Une feature peut être retirée sans nettoyage dispersé dans cinq fichiers.

---

# 25. Definition of Done produit MVP

- [ ] Déployé sur GitHub Pages.
- [ ] Outlook fonctionne via PKCE.
- [ ] Agenda visible.
- [ ] Tâches fonctionnelles.
- [ ] Planner local fonctionnel.
- [ ] Énergie prise en compte.
- [ ] Mode Libre fonctionnel.
- [ ] Mode Flow fonctionnel.
- [ ] Pomodoro optionnel.
- [ ] Gamification minimale.
- [ ] PWA installable lorsque supportée.
- [ ] Offline partiel.
- [ ] Spotify non requis.
- [ ] IA non requise.
- [ ] Aucun secret exposé.
- [ ] L’architecture reste entièrement pilotée par le registre de features.

---

# 26. Règle pour chaque nouvelle fonctionnalité

Avant de créer quoi que ce soit, suivre cet ordre :

```text
1. Ajouter une entrée dans features
2. Déclarer son state si nécessaire
3. Déclarer ses événements dans on
4. Déclarer run
5. Déclarer ui si nécessaire
6. Déclarer ses actions
7. Utiliser un service si effet externe
8. Tester
```

Ne créer un nouveau module que si une fonction devient assez grosse pour mériter d’être extraite.

**On part donc de l’objet feature, pas d’une arborescence de fichiers à remplir.**