# MeliApp / FlowQuest

PWA statique d’organisation adaptative et gamifiée. Outlook sert de **calendrier**, puis MeliApp adapte la prochaine action aux tâches, aux échéances, à l’énergie et au mode de travail réel de l’utilisateur.

Le projet reste volontairement en **HTML/CSS/JavaScript pur**, sans framework UI obligatoire, sans APK et sans backend obligatoire pour le MVP. Le déploiement cible est **GitHub Pages**.

## État actuel

Le produit contient notamment :

- calendrier Outlook en OAuth/PKCE ;
- lecture et écriture de blocs de focus ;
- énergie visuelle sans chiffres ;
- tâches avec importance, échéance, durée, difficulté et progression ;
- matrice d’Eisenhower calculée automatiquement ;
- onglet Tâches dédié ;
- vue Liste et vue Mindmap ;
- projets / Boss reliés aux tâches ;
- sous-tâches reliées à leur tâche parente ;
- découpage manuel récompensé en XP ;
- option « Aide-moi » pour découpage IA, sans XP de découpage ;
- planner local adaptatif ;
- modes Libre / Flow / Focus / Pomodoro optionnel ;
- XP, niveaux, statistiques et succès ;
- Spotify optionnel ;
- assistant IA unifié limité à GPT, Claude et Gemini ;
- notifications, import/export, diagnostic et installation PWA.

## Navigation

| Catégorie | Route | Contenu principal |
|---|---|---|
| Agenda | `#/calendar` | Outlook, synchronisation, événements |
| Tâches | `#/tasks` | liste, matrice Eisenhower, mindmap, projets, découpage |
| Journée | `#/day` | Flow / focus de la journée |
| Progression | `#/progress` | XP, niveaux, stats, succès |
| Réglages & connexions | `#/settings` | Spotify, IA, préférences, notifications, données, diagnostic |

L’accueil garde les éléments immédiats, notamment l’énergie et la mission courante.

## Architecture déclarative

Le core ne connaît pas les noms métier. Le registre final est composé à partir d’objets de features :

```js
export const features = Object.freeze(
  applyFeatureCategories({
    ...baseFeatures,
    ...advancedFeatures,
    ...featureOverrides,
    ...energyFriendlyOverride,
    ...connectionFriendlyOverride,
    ...taskWorkspaceFeatures
  }, featureCategories)
);
```

Une feature peut déclarer :

- `state` ;
- `when` ;
- `enabled` ;
- `run` ;
- `ui.render` ;
- `ui.actions` ;
- `page` ou `category`.

Le core construit l’état, filtre les features concernées par un événement, exécute `run`, persiste, puis rerend. Ajouter une feature ne doit pas imposer d’ajouter des branchements métier dans `main.js`.

## Tâches et matrice d’Eisenhower

L’importance reste comprise entre **1 et 5**.

La matrice utilise deux axes :

- **important** : importance 4 ou 5 ;
- **urgent** : échéance atteinte ou située dans les 3 prochains jours.

Les quatre groupes sont :

- 🔥 À faire maintenant : important + urgent ;
- 📅 À planifier : important + non urgent ;
- ⚡ Rapide / délégable : urgent + moins important ;
- 🌿 À garder léger : ni urgent ni important.

La matrice est dérivée des données de tâche. Elle ne crée donc pas un deuxième état à synchroniser, ce qui évite une nouvelle petite usine à incohérences.

## Découpage des tâches et XP

Une tâche peut être découpée de deux façons.

### Découpage manuel

Le bouton **« Découper moi-même »** permet d’ajouter des sous-tâches concrètes. Chaque sous-tâche manuelle donne actuellement **8 XP**, avec un plafond de cinq récompenses par tâche parente pour éviter le farming d’XP par subdivision métaphysique.

Les sous-tâches héritent du projet, de l’échéance et de l’importance de leur tâche parente, avec une difficulté et une durée réduites.

### Aide-moi

Le bouton **« Aide-moi »** demande à une IA connectée de proposer de petites étapes. Les sous-tâches générées sont marquées `splitSource: "ai"`.

Le découpage IA donne **0 XP de découpage**. L’utilisateur peut toujours gagner les XP normaux en réalisant les sous-tâches elles-mêmes.

## Mindmap

La vue Mindmap représente :

```text
Projet / Boss
  └── Tâche
       ├── Sous-tâche
       └── Sous-tâche
```

Chaque nœud tâche affiche :

- titre ;
- position Eisenhower ;
- importance ;
- durée ;
- échéance ;
- progression.

Les tâches sans projet apparaissent dans un groupe **Sans projet**.

## Outlook

Outlook n’est pas une identité utilisateur MeliApp. Il sert uniquement de **source et destination calendrier**.

Le service Microsoft utilise Authorization Code + PKCE en client public avec `Calendars.ReadWrite`.

Le `microsoftClientId` est une configuration de déploiement de MeliApp, jamais quelque chose que l’utilisateur doit saisir dans l’interface.

## Spotify

Spotify est facultatif. L’intégration est isolée du planner : si Spotify est absent ou indisponible, les tâches et le planning continuent de fonctionner.

## Assistant IA

MeliApp expose un seul hub IA limité à :

- GPT / OpenAI ;
- Claude / Anthropic ;
- Gemini / Google.

L’interface utilisateur traite ces services comme des **connexions**, pas comme des formulaires d’endpoint arbitraire.

Le service interne conserve les modes Simple, Secours et Fusion pour normaliser les réponses quand des connexions compatibles sont disponibles.

Le planner local reste la solution de repli et fonctionne sans IA.

## Données locales

IndexedDB conserve l’état produit. Les données sensibles d’authentification ne font pas partie des exports JSON MeliApp.

## PWA

Présents :

- `manifest.webmanifest` ;
- Service Worker ;
- cache offline du shell ;
- installation lorsque le navigateur le permet ;
- raccourcis Tâches / Journée / Agenda / Réglages ;
- métadonnées standalone mobile.

## Arborescence principale

```text
.
├── .github/workflows/ci-pages.yml
├── assets/
├── css/
│   ├── base.css
│   ├── energy.css
│   ├── connections.css
│   └── tasks.css
├── js/
│   ├── feature-categories.js
│   ├── features.js
│   ├── features-advanced.js
│   ├── features-overrides.js
│   ├── features-energy-friendly.js
│   ├── features-connections-friendly.js
│   ├── features-tasks-workspace.js
│   ├── core/
│   ├── domain/
│   ├── services/
│   └── ui/
├── tests/
├── index.html
├── manifest.webmanifest
└── service-worker.js
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

Les tests couvrent le core fonctionnel, le routeur, les catégories, le planner, l’énergie, les connexions, la matrice d’Eisenhower et la règle XP du découpage manuel/IA.

## Sécurité

Ne jamais commiter :

- `client_secret` ;
- token OAuth ;
- clé API partagée ;
- mot de passe ;
- clé privée.

GitHub Pages est un client public. Les intégrations doivent rester compatibles avec ce modèle.
