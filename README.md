# MeliApp / FlowQuest

PWA statique d’organisation adaptative et gamifiée. Outlook sert de **calendrier**, puis MeliApp adapte la prochaine action aux tâches, aux deadlines, à l’énergie et au mode de travail réel de l’utilisateur.

Le projet reste volontairement en **HTML/CSS/JavaScript pur**, sans framework UI obligatoire, sans APK et sans backend obligatoire pour le MVP. Le déploiement cible est **GitHub Pages**.

## État actuel

Le produit dépasse désormais le simple squelette technique. Le registre runtime contient des features utilisables pour :

- connexion calendrier Microsoft / Outlook en PKCE ;
- lecture et synchronisation de l’agenda ;
- écriture d’un bloc de focus dans Outlook ;
- énergie 1-10 avec expiration ;
- tâches, progression, deadline, importance et difficulté ;
- éditeur détaillé inline ;
- planner local adaptatif avec stabilité anti-zapping ;
- écran « Maintenant » ;
- modes Libre / Flow / Focus / Pomodoro optionnel ;
- projets / Boss ;
- XP, niveaux, statistiques et succès ;
- Spotify optionnel avec bibliothèque de playlists ;
- playlists faible énergie / focus / récupération / boss ;
- IA optionnelle avec fallback local ;
- notifications opportunistes et quiet hours ;
- export / import / reset des données ;
- diagnostic local ;
- installation PWA, icône et raccourcis.

Les intégrations Microsoft et Spotify nécessitent encore leurs **client IDs publics** dans `js/config.js` et les redirect URIs correspondantes.

## Navigation par catégories

Les features proches ne créent plus une forêt de pages séparées. Elles sont regroupées automatiquement par catégorie :

| Catégorie | Route | Features principales |
|---|---|---|
| Agenda | `#/calendar` | Outlook, synchronisation, événements |
| Organisation | `#/organize` | tâches, éditeur, projets / Boss |
| Focus | `#/focus` | sessions Libre / Flow / Focus / Pomodoro |
| Progression | `#/progress` | XP, niveaux, stats, succès |
| Connexions | `#/integrations` | Spotify, IA |
| Réglages | `#/settings` | préférences, notifications, installation, données, diagnostic |

L’accueil garde uniquement ce qui mérite d’être devant les yeux immédiatement, notamment l’énergie et la mission « Maintenant ». Une rare victoire contre le syndrome du tableau de bord qui finit par nécessiter son propre tableau de bord.

## Architecture déclarative

Le core ne connaît pas le métier. Il itère sur un registre d’objets.

Le registre final est composé sans changer le moteur :

```js
export const features = Object.freeze(
  applyFeatureCategories({
    ...baseFeatures,
    ...advancedFeatures,
    ...featureOverrides
  }, featureCategories)
);
```

Une feature typique déclare son état, ses événements, son comportement et éventuellement son UI :

```js
{
  description: "Exemple",
  state: { count: 0 },
  when: ["example:increment"],
  run: ({ state }) => ({
    ...state,
    features: {
      ...state.features,
      example: {
        count: state.features.example.count + 1
      }
    }
  }),
  ui: {
    render: ({ state }) => {
      const button = document.createElement("button");
      button.dataset.action = "example.increment";
      button.textContent = state.features.example.count;
      return button;
    },
    actions: {
      "example.increment": ({ dispatch }) => dispatch("example:increment")
    }
  }
}
```

Le core :

1. construit l’état depuis `feature.state` ;
2. reçoit un événement ;
3. itère sur les features concernées ;
4. vérifie `enabled` ;
5. exécute `run` ;
6. persiste ;
7. relance le rendu ;
8. résout les actions `data-action` ;
9. construit pages, catégories et navigation depuis les objets.

Aucun `if (spotify)`, `if (energy)` ou `if (outlook)` ne doit apparaître dans `main.js`.

## Page individuelle ou catégorie partagée

Une feature peut avoir sa propre page avec :

```js
page: true
```

ou :

```js
page: {
  path: "preferences",
  title: "Mes réglages",
  icon: "⚙️",
  nav: true,
  order: 20
}
```

Une feature peut aussi rejoindre une page de catégorie avec **un seul paramètre** :

```js
category: "organize"
```

Ou avec métadonnées complètes :

```js
category: {
  id: "organize",
  path: "organize",
  title: "Organisation",
  icon: "🧭",
  order: 20
}
```

Toutes les features ayant la même route sont rendues sur la même page. Le routeur déduplique automatiquement la navigation et le renderer affiche un seul titre de catégorie puis une section par feature.

Pour éviter de répéter la même catégorie partout, `js/feature-categories.js` permet de grouper déclarativement plusieurs features :

```js
export const featureCategories = {
  organize: {
    id: "organize",
    title: "Organisation",
    icon: "🧭",
    features: ["tasks", "taskEditor", "projects"]
  }
};
```

Une catégorie définie directement sur une feature reste prioritaire.

## Outlook

Outlook n’est pas une identité utilisateur MeliApp. Il sert uniquement de **source et destination calendrier**.

Le service Microsoft utilise Authorization Code + PKCE en client public, avec `Calendars.ReadWrite`.

Fonctions présentes :

- restauration de session ;
- refresh token quand Microsoft en fournit un ;
- lecture `calendarView` ;
- création d’un événement de focus depuis la mission courante ;
- aucune clé secrète dans le frontend.

Configuration :

```js
export const config = {
  microsoftClientId: "PUBLIC_CLIENT_ID",
  microsoftTenant: "common",
  spotifyClientId: "PUBLIC_CLIENT_ID"
};
```

## Spotify

Spotify est facultatif. Le service utilise PKCE et prend en charge :

- refresh token ;
- contrôle de lecture ;
- récupération de la bibliothèque de playlists ;
- sélection depuis la catégorie Connexions ;
- affectation aux modes `lowEnergy`, `focus`, `recovery` et `boss` ;
- déclenchement low-energy uniquement sous le seuil configuré.

Le comportement réel de lecture dépend des contraintes Spotify : compte, appareil actif, Premium et politiques d’autoplay.

## Planner et fonctions exécutives

Le planner reste local et fonctionne sans IA. Il combine :

- urgence ;
- importance ;
- niveau d’énergie ;
- durée disponible ;
- possibilité de découper ;
- bonus de tâche déjà commencée.

Une couche de stabilité évite de changer de mission pour un gain minuscule. Le bouton « Changer » reste prioritaire, puisque lutter contre la volonté de l’utilisateur serait un choix de design assez spectaculaire.

## Données locales

IndexedDB conserve l’état produit. Les outils de données permettent :

- export JSON ;
- import JSON ;
- reset des tâches, projets, sessions et progression ;
- conservation des tokens OAuth en dehors de l’export, dans `sessionStorage`.

## PWA

Présents :

- `manifest.webmanifest` ;
- Service Worker ;
- cache offline du shell ;
- installation Chromium quand disponible ;
- aide iOS ;
- icône SVG ;
- raccourcis Agenda / Organisation / Focus / Réglages ;
- métadonnées standalone mobile.

## Arborescence principale

```text
.
├── .github/workflows/ci-pages.yml
├── assets/icon.svg
├── css/base.css
├── js/
│   ├── config.js
│   ├── feature-categories.js
│   ├── features.js
│   ├── features-advanced.js
│   ├── features-overrides.js
│   ├── main.js
│   ├── core/
│   ├── domain/
│   ├── services/
│   └── ui/
├── tests/
├── index.html
├── manifest.webmanifest
├── service-worker.js
├── SPECS.md
└── TODO.md
```

## Lancer en local

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.

## Tests

```bash
npm test
npm run check
```

Les tests couvrent notamment le core fonctionnel, le routeur, les catégories partagées, le domaine, les features produit, les préférences, les projets, la stabilité du planner, l’écriture Outlook via mock, Spotify via mock et la remise à zéro des données.

## CI/CD

`.github/workflows/ci-pages.yml` exécute les vérifications syntaxiques, les tests et le scan simple de secrets. Sur `main`, le workflow prépare ensuite le déploiement GitHub Pages.

## Sécurité

Ne jamais commiter :

- `client_secret` ;
- token OAuth ;
- clé API partagée ;
- mot de passe ;
- clé privée.

GitHub Pages est un client public. Les intégrations doivent rester compatibles avec ce modèle.

## Documentation

- [`SPECS.md`](./SPECS.md) : cahier des charges.
- [`TODO.md`](./TODO.md) : avancement réel, limites et blocages externes.
