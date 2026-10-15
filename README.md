# MeliApp / FlowQuest

PWA statique d’organisation adaptative et gamifiée, pensée pour réduire la friction de démarrage et adapter le planning à l’agenda Outlook, à l’énergie et au contexte réel de l’utilisateur.

Le projet est volontairement construit en **HTML/CSS/JavaScript pur** et déployable directement sur **GitHub Pages**. Pas de framework obligatoire, pas de backend obligatoire, pas de build runtime et pas d’APK.

> Outlook est l’intégration obligatoire. Spotify et l’IA sont optionnels.

## État du projet

La fondation technique est en place :

- moteur générique de features ;
- registre unique `features` ;
- état initial généré automatiquement depuis ce registre ;
- dispatch d’événements générique ;
- isolation des erreurs par feature ;
- persistance IndexedDB ;
- rendu et actions UI génériques ;
- pages de feature générées automatiquement via le paramètre `page` ;
- navigation automatique entre les pages ;
- helpers fonctionnels de scoring, planning, XP et reducers ;
- PWA minimale avec Service Worker ;
- tests unitaires avec le runner natif de Node ;
- pipeline CI/CD GitHub Actions vers GitHub Pages.

Les fonctionnalités métier elles-mêmes restent à ajouter dans l’objet `features` selon `SPECS.md` et `TODO.md`.

## Principe d’architecture

Le core ne connaît pas Outlook, Spotify, l’énergie, le Pomodoro ou l’IA. Il connaît seulement un registre d’objets.

```js
export const features = {
  energy: {
    description: "Gestion de l’énergie",
    state: {
      value: null,
      lowThreshold: 3
    },
    when: ["energy:set"],
    enabled: () => true,
    run: ({ state, payload }) => ({
      ...state,
      features: {
        ...state.features,
        energy: {
          ...state.features.energy,
          value: payload.value
        }
      }
    }),
    ui: {
      zone: "main",
      render: ({ state }) => {
        const button = document.createElement("button");
        button.dataset.action = "energy.demo";
        button.textContent = `Énergie : ${state.features.energy.value ?? "?"}`;
        return button;
      },
      actions: {
        "energy.demo": ({ dispatch }) =>
          dispatch("energy:set", { value: 5 })
      }
    }
  }
};
```

Le moteur :

1. génère automatiquement `state.features` à partir des propriétés `state` du registre ;
2. reçoit un événement ;
3. itère sur les features abonnées à cet événement ;
4. vérifie `enabled` ;
5. exécute `run` ;
6. enchaîne le nouvel état ;
7. persiste ;
8. relance le rendu ;
9. branche les actions UI via délégation d’événements ;
10. découvre automatiquement les features ayant une page et construit la navigation.

Ajouter une feature ne doit donc pas demander une modification de `main.js`, du runner, du renderer ou du routeur.

## Une feature peut avoir sa propre page

Une feature devient une page avec **un seul paramètre dans l’objet**.

Version minimale :

```js
export const features = {
  tasks: {
    description: "Mes tâches",
    page: true,
    ui: {
      render: ({ state }) => {
        const node = document.createElement("div");
        node.textContent = `${state.tasks.length} tâche(s)`;
        return node;
      }
    }
  }
};
```

Le core crée automatiquement :

- la route `#/tasks` ;
- l’entrée de navigation « Mes tâches » ;
- le titre de la page ;
- le rendu exclusif de cette feature sur sa route.

Aucun fichier de route, aucun menu et aucun branchement dans `main.js` ne sont à créer.

Pour personnaliser la page :

```js
export const features = {
  settings: {
    description: "Réglages",

    page: {
      path: "preferences",
      title: "Mes réglages",
      icon: "⚙️",
      nav: true,
      order: 20
    },

    ui: {
      render: () => document.createTextNode("Contenu de la page")
    }
  }
};
```

Cela produit la route :

```text
#/preferences
```

Paramètres disponibles :

| Paramètre | Rôle | Défaut |
|---|---|---|
| `page: true` | active une page avec les valeurs automatiques | - |
| `page.path` | chemin dans le hash | nom de la feature |
| `page.title` | titre et label de navigation | `description` puis nom |
| `page.icon` | préfixe visuel optionnel | aucun |
| `page.nav` | affiche ou masque la page dans la navigation | `true` |
| `page.order` | ordre dans le menu | `0` |

Une feature **sans `page`** reste un widget de l’accueil. Une feature **avec `page`** est rendue uniquement sur sa page.

Le routeur utilise des routes hash (`#/...`) afin de rester compatible avec GitHub Pages sans configuration serveur ni fallback exotique inventé à trois heures du matin.

## Arborescence actuelle

```text
.
├── .github/
│   └── workflows/
│       └── ci-pages.yml
├── css/
│   └── base.css
├── js/
│   ├── core/
│   │   ├── app.js
│   │   ├── events.js
│   │   ├── registry.js
│   │   ├── router.js
│   │   └── state.js
│   ├── domain/
│   │   ├── reducers.js
│   │   ├── scheduling.js
│   │   ├── scoring.js
│   │   └── xp.js
│   ├── services/
│   │   ├── notifications.js
│   │   └── storage.js
│   ├── ui/
│   │   ├── actions.js
│   │   └── render.js
│   └── main.js
├── tests/
│   ├── core.test.js
│   └── domain.test.js
├── index.html
├── manifest.webmanifest
├── service-worker.js
├── package.json
├── SPECS.md
└── TODO.md
```

## Responsabilités des couches

### `js/core`

Infrastructure agnostique du produit.

- `registry.js` : contrat des features, validation, sélection par événement, actions UI.
- `router.js` : découverte automatique des pages, routes hash, métadonnées de navigation.
- `state.js` : état de base, état initial généré depuis le registre, merge du stockage local.
- `app.js` : runner, queue de dispatch, persistance, isolation des erreurs.
- `events.js` : noms d’événements partagés.

### `js/domain`

Fonctions pures et testables sans navigateur.

- scoring de priorité ;
- adéquation énergie ;
- calcul des créneaux libres ;
- découpage des tâches ;
- sélection de prochaine action ;
- XP / niveaux ;
- reducers immuables.

### `js/services`

Effets de bord. C’est ici que doivent arriver les futurs clients Outlook, Spotify et IA.

Le domaine ne doit pas appeler directement `fetch`, IndexedDB, Notification ou une API distante.

### `js/ui`

Infrastructure UI générique :

- rendu des `feature.ui.render` ;
- navigation des pages générée à partir de `feature.page` ;
- délégation de `data-action` vers `feature.ui.actions`.

Les features peuvent produire des `Node`/`DocumentFragment` sans que le renderer connaisse leur métier.

## Contrat d’une feature

Toutes les clés sont optionnelles selon le besoin métier :

```js
{
  description: "Texte humain",

  state: {
    // état initial spécifique à la feature
  },

  page: true,
  // ou :
  // page: {
  //   path: "route",
  //   title: "Titre",
  //   icon: "⚡",
  //   nav: true,
  //   order: 10
  // },

  when: [
    "event:name"
  ],

  enabled: (state) => true,

  run: async ({
    state,
    payload,
    event,
    services,
    dispatch,
    getState,
    feature
  }) => {
    return state;
  },

  ui: {
    zone: "main",
    render: ({ state, dispatch, feature, route }) => document.createElement("div"),
    actions: {
      "feature.action": ({ event, target, state, dispatch }) => {}
    }
  }
}
```

`run` peut retourner soit un nouvel état, soit un contexte contenant `{ state: nouvelEtat }`.

Une exception dans une feature crée un diagnostic local et n’empêche pas les suivantes de s’exécuter.

## Programmation fonctionnelle

Règles du projet :

- état métier traité comme immuable ;
- fonctions pures pour la logique métier ;
- pas de classe nécessaire au domaine ;
- pas de variable globale mutable pour les données métier ;
- effets de bord derrière des services ;
- composition de petites fonctions ;
- `Date.now()` ou accès externes injectés/testés lorsque la déterminisation est importante ;
- pas de logique métier spécifique dans `main.js`.

## Lancer localement

Comme les ES Modules navigateur ne fonctionnent pas correctement avec `file://`, servir le dossier avec n’importe quel serveur HTTP statique.

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.

Node n’est nécessaire que pour les tests et vérifications de CI.

## Tests

Aucune dépendance de test externe n’est requise.

```bash
npm test
npm run check
```

Les tests couvrent notamment :

- génération automatique de l’état depuis le registre ;
- sélection des features par événement ;
- ordre d’exécution et chaînage d’état ;
- isolation des erreurs ;
- persistance après dispatch ;
- validation du contrat ;
- création automatique d’une page avec `page: true` ;
- métadonnées de page ;
- découverte et ordre des pages ;
- résolution des routes hash ;
- visibilité accueil/page ;
- urgence, énergie, scoring, créneaux, découpage, XP et reducers.

## CI/CD

Workflow : `.github/workflows/ci-pages.yml`.

Sur Pull Request vers `main` :

1. checkout ;
2. Node 22 ;
3. vérifications syntaxiques ;
4. tests unitaires ;
5. scan simple de secrets accidentellement commités.

Sur push vers `main`, après succès de la CI : configuration et déploiement GitHub Pages.

Le runtime de production reste uniquement HTML/CSS/JS statique.

## PWA

Le projet contient `manifest.webmanifest`, `service-worker.js`, un cache du shell applicatif et une stratégie réseau avec fallback cache.

Le routeur est inclus dans le cache PWA afin que les pages de features restent navigables avec le shell déjà chargé hors connexion.

## Stockage

`createIndexedDbStorage()` sauvegarde l’état global dans IndexedDB.

Un adapter mémoire est également fourni pour les tests ou environnements sans IndexedDB.

## Sécurité

Ne jamais commiter :

- `client_secret` Microsoft ou Spotify ;
- clé API IA appartenant au projet ;
- token OAuth ;
- clé privée ;
- mot de passe.

Une PWA GitHub Pages est un client public. Les intégrations OAuth doivent utiliser PKCE.

## Développement d’une nouvelle feature

La règle architecturale est volontairement stricte : **ajouter une fonctionnalité doit principalement consister à ajouter une entrée dans l’objet `features`.**

Même chose pour les pages : **une feature obtient sa page en ajoutant `page: true` ou un objet `page`, sans créer une route manuellement.**

Le test mental :

> Est-ce que je dois modifier `main.js`, le runner, le renderer ou le routeur pour ajouter cette feature ou sa page ?

Si oui, il faut vérifier si le contrat générique est réellement incomplet avant d’introduire du câblage métier dans le core.

## Documentation

- [`SPECS.md`](./SPECS.md) : cahier des charges et décisions d’architecture.
- [`TODO.md`](./TODO.md) : backlog de développement.

## Licence

Aucune licence n’est encore définie dans le dépôt.
