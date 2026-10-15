# MeliApp / FlowQuest

PWA statique d’organisation adaptative et gamifiée. Elle utilise Outlook comme contrainte d’agenda obligatoire, puis adapte la prochaine action aux tâches, aux deadlines, à l’énergie et au mode de travail réel de l’utilisateur.

Le projet reste volontairement en **HTML/CSS/JavaScript pur**, sans framework UI obligatoire, sans APK et sans backend obligatoire pour le MVP. Le déploiement cible est **GitHub Pages**.

## État actuel

Le produit dépasse désormais le simple squelette technique. Le registre runtime contient des features utilisables pour :

- connexion Microsoft / Outlook en PKCE ;
- lecture de l’agenda ;
- synchronisation manuelle et automatique ;
- écriture d’un bloc de focus dans Outlook ;
- énergie 1-10 avec expiration ;
- tâches, progression, deadline, importance et difficulté ;
- éditeur détaillé inline ;
- planner local adaptatif avec stabilité anti-zapping ;
- écran « Maintenant » ;
- modes Libre / Flow / Focus / Pomodoro optionnel ;
- projets / Boss ;
- XP, niveaux et succès ;
- statistiques locales ;
- Spotify optionnel avec bibliothèque de playlists ;
- playlists faible énergie / focus / récupération / boss ;
- IA optionnelle avec fallback local ;
- notifications opportunistes et quiet hours ;
- export / import / reset des données ;
- diagnostic local ;
- installation PWA, icône et raccourcis.

Les intégrations Microsoft et Spotify nécessitent encore leurs **client IDs publics** dans `js/config.js` et la configuration des redirect URIs dans les consoles respectives. Voir [`TODO.md`](./TODO.md) pour les blocages externes et le reste du travail.

## Architecture déclarative

Le core ne connaît pas le métier. Il itère sur un registre d’objets.

Le registre final est composé sans changer le moteur :

```js
export const features = Object.freeze({
  ...baseFeatures,
  ...advancedFeatures
});
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
      "example.increment": ({ dispatch }) =>
        dispatch("example:increment")
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
9. découvre les pages et la navigation depuis les objets.

Aucun `if (spotify)`, `if (energy)` ou `if (outlook)` ne doit apparaître dans `main.js`.

## Pages déclaratives

Une feature obtient sa propre page avec :

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

Plusieurs features peuvent contribuer à la même route. Une feature complémentaire utilise simplement :

```js
page: {
  path: "tasks",
  nav: false
}
```

Cela permet, par exemple, d’ajouter l’éditeur détaillé des tâches sans modifier le routeur ou la feature principale.

## Outlook

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
- récupération jusqu’à 200 playlists utilisateur ;
- sélection depuis la page Spotify ;
- affectation aux modes `lowEnergy`, `focus`, `recovery` et `boss`.

Le comportement réel de lecture dépend encore des contraintes Spotify : compte, appareil actif, Premium et politiques d’autoplay.

## Planner et TDAH / fonctions exécutives

Le planner reste local et fonctionne sans IA. Il combine :

- urgence ;
- importance ;
- niveau d’énergie ;
- durée disponible ;
- possibilité de découper ;
- bonus de tâche déjà commencée.

Une couche de stabilité évite de changer de mission pour un gain minuscule : si l’ancienne mission reste faisable et que la nouvelle n’est que légèrement mieux classée, l’ancienne reste proposée. Le bouton « Changer » conserve évidemment la priorité, sinon l’application deviendrait ce collègue insupportable qui insiste après qu’on lui a dit non.

## Données locales

IndexedDB conserve l’état produit. La page Données permet :

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
- raccourcis Tâches / Focus / Préférences ;
- métadonnées standalone mobile.

## Arborescence principale

```text
.
├── .github/workflows/ci-pages.yml
├── assets/icon.svg
├── css/base.css
├── js/
│   ├── config.js
│   ├── features.js
│   ├── features-advanced.js
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

Puis ouvrir :

```text
http://localhost:8080
```

## Tests

```bash
npm test
npm run check
```

Les tests couvrent notamment le core fonctionnel, le routeur, le domaine, les features produit, les préférences, les projets, la stabilité du planner, l’écriture Outlook via mock, la bibliothèque Spotify via mock et la remise à zéro des données.

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
