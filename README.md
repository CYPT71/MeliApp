# MeliApp / FlowQuest

PWA statique d’organisation adaptative et gamifiée. Elle utilise Outlook comme contrainte d’agenda obligatoire, puis adapte la prochaine action aux tâches, aux deadlines, au niveau d’énergie et au mode de travail de l’utilisateur.

Le projet est en **HTML/CSS/JavaScript pur**, sans framework UI obligatoire, sans APK et sans backend obligatoire pour le MVP. Le déploiement cible est **GitHub Pages**.

## État actuel

Le noyau et les premières features produit sont implémentés.

Features présentes dans le registre unique `js/features.js` :

- connexion Microsoft / Outlook ;
- synchronisation agenda ;
- page Agenda ;
- énergie 1-10 ;
- tâches ;
- planner local ;
- écran « Maintenant » ;
- Libre / Flow / Focus / Pomodoro optionnel ;
- XP et niveaux ;
- Spotify optionnel ;
- IA optionnelle avec fallback local ;
- notifications ;
- installation PWA.

Les intégrations Microsoft et Spotify nécessitent encore leurs **client IDs publics** dans `js/config.js` et la configuration des redirect URIs dans les consoles respectives. Voir [`TODO.md`](./TODO.md) pour l’état précis.

## Principe d’architecture

Le métier vit dans un seul objet `features`.

```js
export const features = {
  example: {
    description: "Exemple",
    state: { count: 0 },
    when: ["example:increment"],

    run: ({ state }) => ({
      ...state,
      features: {
        ...state.features,
        example: {
          ...state.features.example,
          count: state.features.example.count + 1
        }
      }
    }),

    ui: {
      order: 10,
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
};
```

Le core se contente principalement de :

1. générer l’état depuis `feature.state` ;
2. recevoir un événement ;
3. itérer sur les features abonnées ;
4. exécuter `run` ;
5. persister le nouvel état ;
6. rendre les features visibles ;
7. déléguer les actions `data-action`.

Le core ne contient donc pas de branchements métier du genre `if (spotify)` ou `if (energy)`.

## Pages déclaratives

Une feature obtient sa propre page avec un paramètre :

```js
page: true
```

Cela crée automatiquement une route `#/nomFeature`, une entrée de navigation et le titre.

Configuration avancée :

```js
page: {
  path: "preferences",
  title: "Mes réglages",
  icon: "⚙️",
  nav: true,
  order: 20
}
```

Aucun fichier de route ou menu spécifique n’est nécessaire.

## Arborescence principale

```text
.
├── .github/workflows/ci-pages.yml
├── css/base.css
├── js/
│   ├── config.js
│   ├── features.js
│   ├── main.js
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
│   │   ├── ai.js
│   │   ├── index.js
│   │   ├── install.js
│   │   ├── notifications.js
│   │   ├── oauth.js
│   │   ├── outlook.js
│   │   ├── spotify.js
│   │   └── storage.js
│   └── ui/
│       ├── actions.js
│       └── render.js
├── tests/
├── index.html
├── manifest.webmanifest
├── service-worker.js
├── SPECS.md
└── TODO.md
```

## Configuration

`js/config.js` ne doit contenir que des identifiants **publics** :

```js
export const config = {
  microsoftClientId: "PUBLIC_CLIENT_ID",
  microsoftTenant: "common",
  spotifyClientId: "PUBLIC_CLIENT_ID"
};
```

Ne jamais ajouter de `client_secret`, token utilisateur, mot de passe ou clé privée dans ce dépôt.

## Lancer en local

Les ES Modules doivent être servis via HTTP :

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

Les tests couvrent le core fonctionnel, le routeur, le domaine, les tâches, l’énergie, le planner, Flow, l’XP, le fallback IA et la synchronisation Outlook avec service injecté.

## CI/CD

`.github/workflows/ci-pages.yml` exécute les vérifications syntaxiques, les tests et le scan simple de secrets. Sur `main`, le workflow prépare ensuite le déploiement GitHub Pages.

## Documentation

- [`SPECS.md`](./SPECS.md) : cahier des charges.
- [`TODO.md`](./TODO.md) : avancement réel et travail restant.
