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
9. branche les actions UI via délégation d’événements.

Ajouter une feature ne doit donc pas demander une modification de `main.js` ou du runner générique.

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
- délégation de `data-action` vers `feature.ui.actions`.

Les features peuvent produire des `Node`/`DocumentFragment` sans que le renderer connaisse leur métier.

## Contrat d’une feature

Toutes les clés sauf `description` sont techniquement optionnelles, mais une feature métier utilisera généralement :

```js
{
  description: "Texte humain",

  state: {
    // état initial spécifique à la feature
  },

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
    render: ({ state, dispatch, feature }) => document.createElement("div"),
    actions: {
      "feature.action": ({ event, target, state, dispatch }) => {}
    }
  }
}
```

`run` peut retourner soit :

- un nouvel état ;
- un contexte contenant `{ state: nouvelEtat }`.

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

Avec Python :

```bash
python3 -m http.server 8080
```

Puis ouvrir :

```text
http://localhost:8080
```

Node n’est nécessaire que pour les tests et vérifications de CI.

## Tests

Aucune dépendance de test externe n’est requise.

```bash
npm test
```

Vérification syntaxique :

```bash
npm run check
```

Les tests couvrent actuellement :

- génération automatique de l’état depuis le registre ;
- sélection des features par événement ;
- ordre d’exécution ;
- chaînage d’état ;
- isolation des erreurs ;
- persistance après dispatch ;
- validation du contrat ;
- urgence ;
- adéquation énergie ;
- score de priorité ;
- créneaux libres et buffer ;
- découpage ;
- sélection d’une action faisable ;
- XP et niveaux ;
- reducers immuables.

## CI/CD

Workflow : `.github/workflows/ci-pages.yml`.

Sur Pull Request vers `main` :

1. checkout ;
2. Node 22 ;
3. vérifications syntaxiques ;
4. tests unitaires ;
5. scan simple de secrets accidentellement commités.

Sur push vers `main`, après succès de la CI :

1. configuration GitHub Pages ;
2. upload du dépôt comme site statique ;
3. déploiement GitHub Pages.

Le dépôt doit être configuré pour utiliser **GitHub Actions** comme source de Pages.

## PWA

Le projet contient :

- `manifest.webmanifest` ;
- `service-worker.js` ;
- cache du shell applicatif ;
- stratégie réseau avec fallback cache.

La PWA reste volontairement minimale pour le moment. Les icônes, l’UX d’installation et la stratégie de mise à jour contrôlée pendant une session Flow seront ajoutées avec les features correspondantes.

## Stockage

`createIndexedDbStorage()` sauvegarde l’état global dans IndexedDB.

Un adapter mémoire est également fourni :

```js
import { createMemoryStorage } from "./js/services/storage.js";

const storage = createMemoryStorage();
```

Il est utile pour les tests ou les environnements sans IndexedDB.

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

Le test mental à appliquer :

> Est-ce que je dois modifier `main.js`, le runner ou le renderer pour ajouter cette fonctionnalité ?

Si oui, il faut d’abord vérifier si le contrat générique est réellement incomplet. Il ne faut pas rajouter un branchement métier dans le core juste parce que c’est plus rapide pendant cinq minutes et plus pénible pendant cinq ans. Ce petit rite sacrificiel est précisément ce que l’architecture essaie d’éviter.

## Documentation

- [`SPECS.md`](./SPECS.md) : cahier des charges et décisions d’architecture.
- [`TODO.md`](./TODO.md) : backlog de développement.

## Licence

Aucune licence n’est encore définie dans le dépôt.
