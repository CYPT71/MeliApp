# MeliApp / FlowQuest — Cahier des charges & spécifications

Version 1.1

## 1. Vision

MeliApp / FlowQuest est une PWA gamifiée d’organisation adaptative destinée en priorité aux personnes ayant des difficultés de fonctions exécutives, notamment TDAH/ADHD, sans positionnement médical.

Le produit transforme l’agenda Outlook, les tâches, les deadlines, l’énergie déclarée et l’avancement réel en une prochaine action simple à démarrer. Outlook est la seule intégration obligatoire. Spotify et l’IA sont optionnels.

Le principe directeur est : **l’application suggère et adapte, l’utilisateur garde toujours le contrôle**.

Le produit ne doit pas devenir un système punitif. Une tâche non faite est replanifiée, le Pomodoro n’est jamais imposé, le mode Flow ne coupe pas l’utilisateur arbitrairement et l’IA ne remplace jamais le moteur local.

## 2. Contraintes techniques non négociables

- Full static.
- Hébergement GitHub Pages.
- HTML5.
- CSS natif.
- JavaScript moderne ES Modules.
- Aucun APK.
- Aucun wrapper natif obligatoire.
- Aucun backend obligatoire pour le MVP.
- Aucun framework UI obligatoire.
- Aucun TypeScript obligatoire.
- Aucun build requis pour exécuter le produit en production.
- IndexedDB pour les données structurées locales.
- Service Worker natif pour l’offline et le cycle PWA.
- Outlook obligatoire.
- Spotify optionnel.
- IA optionnelle.
- Aucun `client_secret`, mot de passe ou secret développeur dans le dépôt ou le bundle.

Un outil de lint ou de test peut utiliser Node.js en CI, mais la version livrée doit rester un ensemble de fichiers statiques directement exécutables par le navigateur.

## 3. Architecture de programmation fonctionnelle

L’application doit être conçue autour d’un **registre de fonctionnalités**. Chaque fonctionnalité est un objet décrivant son rôle, ses conditions d’activation, les événements qu’elle écoute et sa fonction d’exécution.

Forme minimale :

```js
export const features = {
  nom: {
    description: "Description de la fonctionnalité",
    run: (context) => context
  }
};
```

Forme recommandée :

```js
export const features = {
  outlookSync: {
    description: "Synchronise le calendrier Outlook",
    enabled: (state) => Boolean(state.auth.microsoft),
    when: ["app:start", "app:resume", "sync:manual"],
    run: async (context) => {
      const events = await context.services.outlook.sync();
      return {
        ...context,
        state: {
          ...context.state,
          calendar: {
            ...context.state.calendar,
            events
          }
        }
      };
    }
  },

  lowEnergyMusic: {
    description: "Propose ou lance la playlist faible énergie",
    enabled: (state) =>
      state.settings.spotifyEnabled &&
      state.energy.value !== null &&
      state.energy.value <= state.energy.lowThreshold,
    when: ["energy:changed"],
    run: async (context) => {
      await context.services.spotify.playLowEnergy();
      return context;
    }
  }
};
```

Le gros de l’application doit se contenter d’itérer sur ce registre :

```js
export const runFeatures = async ({ event, registry, context }) =>
  Object.values(registry).reduce(async (pending, feature) => {
    const current = await pending;
    const listens = feature.when?.includes(event) ?? false;
    const enabled = feature.enabled?.(current.state) ?? true;

    if (!listens || !enabled) return current;
    return feature.run(current);
  }, Promise.resolve(context));
```

### 3.1 Règles fonctionnelles

Le code métier doit privilégier :

- fonctions pures pour le scoring, la planification, l’XP et les transformations d’état ;
- état immuable ;
- reducers retournant un nouvel état ;
- effets de bord isolés dans `services/` ;
- dépendances injectées via `context` ;
- aucune variable globale mutable pour la logique métier ;
- aucune classe nécessaire au domaine métier ;
- composition de petites fonctions ;
- événements explicites pour découpler les features.

Exemple :

```js
export const priorityScore = ({ task, energy, now }) => {
  const urgency = computeUrgency({ task, now });
  const energyFit = computeEnergyFit({ task, energy });
  return urgency + energyFit + task.importance * 2;
};
```

Les effets de bord sont centralisés :

```js
export const createServices = ({ graphClient, spotifyClient, db }) => ({
  outlook: {
    sync: () => graphClient.getEvents()
  },
  spotify: {
    playLowEnergy: () => spotifyClient.playConfiguredPlaylist("lowEnergy")
  },
  storage: {
    saveState: (state) => db.put("appState", state)
  }
});
```

## 4. Structure de fichiers cible

```text
/
├── index.html
├── manifest.webmanifest
├── service-worker.js
├── css/
│   ├── base.css
│   ├── components.css
│   └── screens.css
├── js/
│   ├── main.js
│   ├── core/
│   │   ├── app.js
│   │   ├── events.js
│   │   ├── registry.js
│   │   └── state.js
│   ├── features/
│   │   ├── outlook.js
│   │   ├── tasks.js
│   │   ├── planner.js
│   │   ├── energy.js
│   │   ├── flow.js
│   │   ├── game.js
│   │   ├── spotify.js
│   │   ├── ai.js
│   │   ├── notifications.js
│   │   └── install.js
│   ├── domain/
│   │   ├── scoring.js
│   │   ├── scheduling.js
│   │   ├── xp.js
│   │   └── reducers.js
│   ├── services/
│   │   ├── outlook.js
│   │   ├── spotify.js
│   │   ├── ai.js
│   │   ├── storage.js
│   │   └── notifications.js
│   └── ui/
│       ├── render.js
│       ├── actions.js
│       └── components.js
└── assets/
```

`main.js` doit principalement : charger l’état, créer les services, charger le registre, initialiser l’UI, dispatcher les événements et déclencher un nouveau rendu lorsque l’état change. Il ne doit pas contenir une série de `if/else` spécifiques à Outlook, Spotify, au planner ou à l’IA.

## 5. État applicatif

Structure initiale recommandée :

```js
export const initialState = {
  schemaVersion: 1,
  auth: {
    microsoft: null,
    spotify: null,
    ai: null
  },
  calendar: {
    events: [],
    lastSyncAt: null
  },
  tasks: [],
  projects: [],
  sessions: [],
  energy: {
    value: null,
    lowThreshold: 3,
    updatedAt: null,
    expiresAt: null
  },
  game: {
    xp: 0,
    level: 1,
    streak: 0
  },
  settings: {
    workMode: "free",
    pomodoroEnabled: false,
    notificationsEnabled: false,
    spotifyEnabled: false,
    aiEnabled: false
  },
  diagnostics: []
};
```

Événements initiaux :

- `app:start`
- `app:resume`
- `app:online`
- `app:offline`
- `auth:microsoft:connected`
- `auth:microsoft:disconnected`
- `calendar:synced`
- `energy:changed`
- `task:created`
- `task:updated`
- `task:completed`
- `task:deferred`
- `session:started`
- `session:stopped`
- `session:completed`
- `spotify:connected`
- `spotify:disconnected`
- `ai:connected`
- `ai:disconnected`
- `sync:manual`
- `install:available`

## 6. Périmètre fonctionnel MVP

Fonctionnalités obligatoires :

- connexion Microsoft OAuth 2.0 / PKCE ;
- lecture de l’agenda Outlook ;
- cache local de l’agenda ;
- calcul des créneaux libres ;
- CRUD des tâches ;
- projets / grosses deadlines ;
- niveau d’énergie manuel 1 à 10 ;
- moteur local de scoring ;
- moteur local de planification ;
- écran « Maintenant » ;
- mode Libre ;
- mode Flow ;
- Focus guidé ;
- Pomodoro optionnel ;
- XP et niveaux ;
- Boss de projet ;
- PWA installable ;
- fonctionnement offline partiel ;
- notifications opportunistes ;
- import/export local des données ;
- diagnostic local.

Fonctionnalités optionnelles :

- Spotify avec PKCE ;
- playlists personnelles par contexte ;
- lecture faible énergie ;
- fournisseur IA utilisateur ;
- découpage IA ;
- reformulation de prochaine action ;
- explication IA du planning.

## 7. Outlook obligatoire

### 7.1 Authentification

L’application Microsoft doit être enregistrée comme **Single Page Application** et utiliser Authorization Code Flow + PKCE.

Le `client_id` est public. Aucun `client_secret` ne doit exister dans le frontend.

Scopes de départ :

- `Calendars.Read`
- éventuellement `Calendars.ReadWrite` uniquement si l’écriture de sessions dans Outlook est activée.

### 7.2 Synchronisation

Déclencheurs :

- `app:start` ;
- `app:resume` avec temporisation ;
- `sync:manual`.

L’application normalise les événements vers un modèle interne minimal. Les événements Outlook restent propriété d’Outlook. Les tâches FlowQuest restent propriété de FlowQuest.

Le moteur doit éviter tout chevauchement avec les événements Outlook et préserver une marge configurable avant un rendez-vous.

## 8. Tâches et planning

Modèle recommandé :

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
  "status": "active",
  "projectId": "project_1"
}
```

Fonctions pures principales :

- `computeUrgency`
- `computeEnergyFit`
- `computeContextFit`
- `computePriorityScore`
- `findFreeWindows`
- `splitTask`
- `selectNextAction`
- `replan`

Score indicatif :

```text
score = urgence + importance + adéquation énergie + adéquation créneau + bonus déjà commencé - pénalité durée
```

Règles :

- ne jamais chevaucher Outlook ;
- conserver une marge avant événement ;
- préférer une tâche qui tient dans le créneau ;
- découper si nécessaire et autorisé ;
- adapter la difficulté à l’énergie ;
- préserver les tâches déjà commencées ;
- limiter la volatilité de la mission principale.

## 9. Énergie

L’utilisateur choisit une énergie de 1 à 10 en une interaction.

La donnée peut expirer après une durée configurable afin d’éviter de supposer qu’un état est valide toute la journée.

Interprétation indicative :

- 1-2 : récupération, micro-actions, tâches mécaniques ;
- 3-4 : tâches courtes, faible friction, découpage ;
- 5-7 : rythme normal ;
- 8-10 : tâches profondes et difficiles possibles.

Une énergie basse ne doit jamais être présentée comme un échec moral.

## 10. Spotify optionnel

Spotify utilise Authorization Code + PKCE.

L’utilisateur choisit ses playlists :

```json
{
  "lowEnergy": "spotify:playlist:...",
  "focus": "spotify:playlist:...",
  "recovery": "spotify:playlist:...",
  "boss": "spotify:playlist:..."
}
```

Quand `energy <= lowThreshold`, la feature `lowEnergyMusic` peut :

1. vérifier que Spotify est activé ;
2. vérifier qu’une playlist est configurée ;
3. tenter de lancer la lecture si le navigateur le permet ;
4. afficher un bouton manuel si l’autoplay est bloqué.

Spotify ne doit jamais bloquer le planner ou le reste de l’application.

## 11. IA optionnelle

L’IA ne remplace pas le moteur local. Le moteur doit toujours produire une prochaine action valide sans IA.

L’IA peut :

- découper une tâche ;
- reformuler une action ;
- proposer une durée ;
- expliquer une recommandation ;
- aider lorsque l’utilisateur clique « Je suis bloqué » ;
- détecter un planning irréaliste.

Entrée minimale structurée :

```json
{
  "energy": 3,
  "nextCalendarEvent": { "startsInMin": 75 },
  "freeWindows": [{ "start": "17:00", "end": "18:15" }],
  "tasks": [{
    "id": "t1",
    "title": "Rapport",
    "deadline": "2026-10-20",
    "estimateMin": 90,
    "progress": 0.35,
    "difficulty": 4
  }],
  "preferences": {
    "pomodoro": false,
    "defaultMode": "free"
  }
}
```

Sortie attendue :

```json
{
  "action": {
    "taskId": "t1",
    "label": "Ouvre le rapport et écris trois phrases",
    "suggestedMinutes": 10,
    "mode": "free"
  },
  "reason": "Énergie faible et créneau limité",
  "spotifyMode": "lowEnergy"
}
```

Toutes les réponses doivent être validées avant utilisation. En cas d’erreur, timeout ou JSON invalide, utiliser le moteur local.

## 12. Modes de travail

### Mode Libre

- aucune durée obligatoire ;
- enregistrement de `startedAt` ;
- durée calculée depuis les timestamps ;
- l’utilisateur termine quand il veut.

### Mode Flow

- aucun arrêt automatique ;
- durée écoulée visible ;
- prochain rendez-vous visible ;
- rappel doux avant une contrainte Outlook ;
- boutons continuer / pause / terminer.

### Focus guidé

L’application propose une durée selon l’énergie et le créneau, mais l’utilisateur peut choisir Libre.

### Pomodoro

Optionnel, désactivable, jamais utilisé comme règle universelle.

## 13. Gamification

La gamification doit favoriser le démarrage, la progression et la reprise, sans culpabilisation.

- XP de démarrage ;
- XP de progression ;
- XP de complétion ;
- bonus de reprise après inactivité ;
- niveaux ;
- Boss de projets ;
- animations courtes ;
- aucune perte d’XP pour report ;
- aucun streak punitif.

Un Boss doit toujours afficher aussi la vraie deadline et la vraie progression.

## 14. Écran principal « Maintenant »

Afficher en priorité :

1. mission actuelle ;
2. temps avant prochain événement Outlook ;
3. énergie ;
4. bouton principal Commencer ;
5. progression ;
6. informations secondaires.

Actions :

- Commencer ;
- Changer ;
- Réduire ;
- Reporter ;
- Je suis bloqué.

Le bouton « Je suis bloqué » doit proposer une action faisable, même sans IA, par exemple : « Ouvre simplement le document ».

## 15. PWA et offline

Fichiers minimum :

- `manifest.webmanifest`
- `service-worker.js`

Le bouton Installer utilise `beforeinstallprompt` lorsqu’il est disponible. Sur iOS, afficher une aide « Ajouter à l’écran d’accueil ».

Offline :

Doivent rester disponibles :

- shell de l’app ;
- tâches ;
- projets ;
- paramètres ;
- dernière copie agenda ;
- progression ;
- sessions locales.

Ne seront pas disponibles hors ligne :

- nouvelle synchronisation Outlook ;
- Spotify distant ;
- IA distante.

## 16. Background et notifications

Une PWA ne doit jamais supposer qu’un `setInterval()` continue à tourner en arrière-plan.

Pour une session :

```js
const session = {
  startedAt: Date.now(),
  endsAt: Date.now() + duration
};
```

Au retour :

```js
const remaining = session.endsAt - Date.now();
```

Notifications possibles :

- rappel avant événement Outlook ;
- reprise optionnelle ;
- fin de pause optionnelle ;
- planning recalculé lorsque l’app est active.

Sans backend, ne pas promettre de push distant fiable en permanence. GitHub Pages seul ne peut pas jouer le rôle d’émetteur push serveur.

## 17. Persistance locale

IndexedDB contient uniquement ce qui est nécessaire :

- état applicatif ;
- tâches ;
- projets ;
- sessions ;
- cache calendrier minimal ;
- paramètres ;
- diagnostics nettoyés.

Prévoir :

- export JSON ;
- import JSON validé ;
- suppression de toutes les données locales ;
- migrations via `schemaVersion`.

## 18. Sécurité

- aucun secret dans le repo ;
- CSP adaptée ;
- pas de `eval` ;
- pas de `new Function` ;
- `textContent` par défaut ;
- éviter `innerHTML` non nettoyé ;
- scopes OAuth minimaux ;
- redirect URIs exactes ;
- ne jamais logger les tokens ;
- valider toutes les données importées ;
- valider les sorties IA.

## 19. Accessibilité et UX

- mobile-first ;
- design ludique mais pas infantile ;
- faible densité cognitive ;
- contraste WCAG AA ;
- tailles tactiles confortables ;
- navigation clavier desktop ;
- ARIA où nécessaire ;
- respect `prefers-reduced-motion` ;
- aucune information exprimée uniquement par la couleur.

## 20. Diagnostic

Écran diagnostic :

- version ;
- statut Outlook ;
- dernière synchronisation ;
- statut Spotify ;
- statut IA ;
- statut réseau ;
- statut PWA ;
- statut Service Worker ;
- version du schéma IndexedDB ;
- erreurs locales nettoyées.

## 21. Tests

Tests unitaires :

- urgence ;
- priorité ;
- adéquation énergie ;
- créneaux libres ;
- découpage ;
- XP ;
- niveau ;
- progression Boss ;
- reducers ;
- migrations.

Tests de parcours :

- Outlook connecté → événements visibles ;
- énergie basse → mission plus simple ;
- Spotify absent → aucun crash ;
- autoplay bloqué → bouton manuel ;
- IA absente → planner local fonctionnel ;
- IA invalide → fallback local ;
- app suspendue → durée Flow correcte au retour ;
- offline → tâches accessibles ;
- notification refusée → app utilisable ;
- nouvelle version SW → update non destructif.

## 22. CI / GitHub Pages

Pipeline recommandé :

```text
Push / Pull Request
      ↓
Validation HTML/JS
      ↓
Tests unitaires
      ↓
Tests smoke navigateur
      ↓
Secret scan
      ↓
Deploy GitHub Pages
```

Le runtime de production reste HTML/CSS/JS statique, même si certains outils de CI utilisent Node.

## 23. Roadmap

### P0 — Squelette

- structure fichiers ;
- état ;
- registre ;
- événements ;
- runner ;
- rendu minimal ;
- IndexedDB.

### P1 — Outlook

- OAuth PKCE ;
- Microsoft Graph ;
- événements ;
- cache ;
- créneaux libres.

### P2 — Planner

- CRUD tâches ;
- scoring ;
- prochaine action ;
- replanification ;
- « Je suis bloqué » local.

### P3 — Énergie / Flow

- énergie 1-10 ;
- adaptation ;
- sessions libres ;
- mode Flow ;
- timestamps robustes.

### P4 — Gamification

- XP ;
- niveaux ;
- Boss ;
- feedback.

### P5 — PWA

- manifest ;
- Service Worker ;
- offline ;
- install ;
- update flow.

### P6 — Spotify

- OAuth PKCE ;
- playlists ;
- low-energy trigger ;
- fallback autoplay.

### P7 — IA

- provider utilisateur ;
- validation JSON ;
- recommandations ;
- fallback local.

### P8 — Hardening

- accessibilité ;
- diagnostic ;
- CSP ;
- tests E2E ;
- performance.

## 24. Definition of Done MVP

Le MVP est terminé lorsque :

- il fonctionne sur GitHub Pages ;
- aucun serveur applicatif n’est requis pour démarrer ;
- Outlook est connecté via PKCE ;
- une prochaine action est calculée localement ;
- le planner tient compte de l’énergie ;
- Libre et Flow fonctionnent ;
- Pomodoro reste optionnel ;
- l’application fonctionne sans Spotify ;
- l’application fonctionne sans IA ;
- le fonctionnement offline partiel est opérationnel ;
- la PWA est installable lorsque le navigateur le permet ;
- aucun secret n’est exposé ;
- le noyau n’encode pas en dur chaque fonctionnalité ;
- les fonctionnalités sont décrites par des objets de registre ;
- le gros de l’application consiste à itérer sur ces objets selon les événements et les conditions.

## 25. Sources techniques à vérifier à l’implémentation

- Microsoft Identity Platform / MSAL / SPA / PKCE : https://learn.microsoft.com/en-us/entra/identity-platform/
- Microsoft Graph Calendar : https://learn.microsoft.com/en-us/graph/api/resources/calendar
- Spotify PKCE : https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- Spotify Web Playback SDK : https://developer.spotify.com/documentation/web-playback-sdk
- MDN PWA : https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps
