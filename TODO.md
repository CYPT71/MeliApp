# MeliApp / FlowQuest — TODO de développement

> Objectif : construire une PWA **full static GitHub Pages**, en **HTML/CSS/JavaScript pur**, avec une architecture fonctionnelle où chaque fonctionnalité est décrite dans un objet de registre et où le noyau de l'application se contente d'itérer, filtrer et exécuter ces fonctionnalités.

## 0. Contraintes non négociables

- [ ] Aucun APK, wrapper natif ou Capacitor.
- [ ] Aucun backend obligatoire pour le MVP.
- [ ] Hébergement sur GitHub Pages.
- [ ] HTML5 + CSS natif + JavaScript ES Modules.
- [ ] Pas de framework UI requis.
- [ ] Pas de TypeScript requis.
- [ ] Pas de build obligatoire pour exécuter l'application.
- [ ] Outlook obligatoire pour l'onboarding fonctionnel.
- [ ] Spotify optionnel.
- [ ] IA optionnelle.
- [ ] Pomodoro optionnel.
- [ ] Le mode libre / Flow doit fonctionner sans minuterie imposée.
- [ ] L'application doit rester utilisable sans Spotify et sans IA.
- [ ] Aucun `client_secret` ou secret développeur dans le dépôt ou le bundle.
- [ ] Toute logique métier importante doit être testable comme fonction pure.
- [ ] Tous les effets de bord doivent être regroupés dans des services dédiés.

# 1. Architecture fonctionnelle

## 1.1 Registre des fonctionnalités

- [ ] Créer `js/core/registry.js`.
- [ ] Définir un contrat minimal de fonctionnalité :

```js
{
  description: "...",
  enabled: (state) => true,
  when: ["event:name"],
  run: async (context) => context
}
```

- [ ] Créer un registre central exporté sous forme d'objet.
- [ ] Interdire les appels directs entre features lorsque ce n'est pas indispensable.
- [ ] Faire transiter les communications par événements, état et services injectés.

Exemple cible :

```js
export const features = {
  outlookSync: {
    description: "Synchroniser le calendrier Outlook",
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
  }
};
```

## 1.2 Runner générique

- [ ] Créer `runFeatures({ event, registry, context })`.
- [ ] Itérer avec `Object.values(registry)` ou `Object.entries(registry)`.
- [ ] Vérifier `when`.
- [ ] Vérifier `enabled`.
- [ ] Exécuter `run`.
- [ ] Retourner un nouveau contexte.
- [ ] Capturer les erreurs par fonctionnalité sans faire tomber tout le noyau.
- [ ] Journaliser localement les erreurs techniques sans données sensibles.

Exemple cible :

```js
export const runFeatures = async ({ event, registry, context }) =>
  Object.values(registry).reduce(async (pending, feature) => {
    const current = await pending;
    const listens = feature.when?.includes(event) ?? false;
    const enabled = feature.enabled?.(current.state) ?? true;

    if (!listens || !enabled) return current;

    try {
      return await feature.run(current);
    } catch (error) {
      return {
        ...current,
        state: {
          ...current.state,
          diagnostics: [
            ...current.state.diagnostics,
            {
              feature: feature.description,
              message: String(error),
              at: Date.now()
            }
          ]
        }
      };
    }
  }, Promise.resolve(context));
```

## 1.3 Événements

- [ ] Créer `js/core/events.js`.
- [ ] Définir les événements initiaux :
  - [ ] `app:start`
  - [ ] `app:resume`
  - [ ] `app:online`
  - [ ] `app:offline`
  - [ ] `auth:microsoft:connected`
  - [ ] `auth:microsoft:disconnected`
  - [ ] `calendar:synced`
  - [ ] `energy:changed`
  - [ ] `task:created`
  - [ ] `task:updated`
  - [ ] `task:completed`
  - [ ] `task:deferred`
  - [ ] `session:started`
  - [ ] `session:stopped`
  - [ ] `session:completed`
  - [ ] `spotify:connected`
  - [ ] `spotify:disconnected`
  - [ ] `ai:connected`
  - [ ] `ai:disconnected`
  - [ ] `sync:manual`
  - [ ] `install:available`
  - [ ] `notification:permission-changed`

## 1.4 État global immuable

- [ ] Créer `js/core/state.js`.
- [ ] Définir `initialState`.
- [ ] Aucun module ne doit modifier directement l'objet d'état courant.
- [ ] Les reducers doivent retourner de nouveaux objets.
- [ ] Prévoir la version du schéma de données.

Structure de départ :

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

# 2. Arborescence de base

- [ ] Créer `index.html`.
- [ ] Créer `manifest.webmanifest`.
- [ ] Créer `service-worker.js`.
- [ ] Créer `css/base.css`.
- [ ] Créer `css/components.css`.
- [ ] Créer `css/screens.css`.
- [ ] Créer `js/main.js`.
- [ ] Créer `js/core/app.js`.
- [ ] Créer `js/core/events.js`.
- [ ] Créer `js/core/registry.js`.
- [ ] Créer `js/core/state.js`.
- [ ] Créer `js/domain/scoring.js`.
- [ ] Créer `js/domain/scheduling.js`.
- [ ] Créer `js/domain/xp.js`.
- [ ] Créer `js/domain/reducers.js`.
- [ ] Créer `js/services/storage.js`.
- [ ] Créer `js/services/outlook.js`.
- [ ] Créer `js/services/spotify.js`.
- [ ] Créer `js/services/ai.js`.
- [ ] Créer `js/services/notifications.js`.
- [ ] Créer `js/features/outlook.js`.
- [ ] Créer `js/features/tasks.js`.
- [ ] Créer `js/features/planner.js`.
- [ ] Créer `js/features/energy.js`.
- [ ] Créer `js/features/flow.js`.
- [ ] Créer `js/features/game.js`.
- [ ] Créer `js/features/spotify.js`.
- [ ] Créer `js/features/ai.js`.
- [ ] Créer `js/features/notifications.js`.
- [ ] Créer `js/features/install.js`.
- [ ] Créer `js/ui/render.js`.
- [ ] Créer `js/ui/actions.js`.
- [ ] Créer `js/ui/components.js`.

# 3. Noyau applicatif

- [ ] `main.js` ne doit faire que :
  1. charger l'état local ;
  2. créer les services ;
  3. charger le registre ;
  4. initialiser l'UI ;
  5. dispatcher `app:start` ;
  6. re-render après changement d'état.
- [ ] Ne pas mettre de logique métier spécifique dans `main.js`.
- [ ] Ne pas mettre de logique Outlook/Spotify/IA dans `main.js`.
- [ ] Créer une fonction `dispatch(event, payload)`.
- [ ] Faire persister l'état après chaque mutation significative.
- [ ] Mettre en place un mécanisme simple de souscription UI.

# 4. Persistance locale

## 4.1 IndexedDB

- [ ] Créer un wrapper IndexedDB minimal.
- [ ] Stores : `appState`, `tasks`, `projects`, `sessions`, `calendarCache`, `settings`, `diagnostics`.
- [ ] Prévoir migrations par `schemaVersion`.
- [ ] Ne jamais stocker inutilement des données Outlook complètes.
- [ ] Ne jamais stocker de mot de passe.
- [ ] Limiter la persistance des tokens selon le mode d'auth utilisé.

## 4.2 Import / export

- [ ] Bouton « Exporter mes données ».
- [ ] Export JSON local.
- [ ] Bouton « Importer mes données ».
- [ ] Validation du JSON importé.
- [ ] Bouton « Supprimer toutes mes données locales ».

# 5. PWA / GitHub Pages

## 5.1 Manifest

- [ ] Nom : MeliApp ou nom produit final.
- [ ] `display: standalone`.
- [ ] `start_url` compatible sous-chemin GitHub Pages.
- [ ] `scope` compatible repo GitHub Pages.
- [ ] Icônes 192 et 512 minimum.
- [ ] `theme_color`.
- [ ] `background_color`.

## 5.2 Service Worker

- [ ] Cache du shell applicatif.
- [ ] Stratégie cache-first pour assets versionnés.
- [ ] Network-first ou stale-while-revalidate pour fichiers appropriés.
- [ ] Fallback offline.
- [ ] Gestion d'une nouvelle version.
- [ ] Ne pas forcer le reload pendant une session Flow.

## 5.3 Installation

- [ ] Capturer `beforeinstallprompt` quand disponible.
- [ ] Afficher un bouton « Installer » uniquement si pertinent.
- [ ] Sur iOS, afficher une aide « Ajouter à l'écran d'accueil ».
- [ ] Masquer le bouton après installation.

# 6. Connexion Outlook obligatoire

## 6.1 Microsoft Identity

- [ ] Enregistrer l'application Microsoft comme SPA.
- [ ] Configurer l'URL GitHub Pages de redirect.
- [ ] Utiliser Authorization Code + PKCE.
- [ ] Ne jamais utiliser de `client_secret`.
- [ ] Charger MSAL uniquement si nécessaire.
- [ ] Prévoir logout.
- [ ] Prévoir expiration et renouvellement de session.

## 6.2 Permissions

- [ ] Commencer avec le strict minimum.
- [ ] Lecture calendrier.
- [ ] Ajouter écriture calendrier uniquement si nécessaire à la feature de planification Outlook.
- [ ] Afficher clairement pourquoi la permission est demandée.

## 6.3 Calendrier

- [ ] Lire les événements de la période utile.
- [ ] Normaliser les événements vers un format interne.
- [ ] Calculer les créneaux occupés.
- [ ] Calculer les créneaux libres.
- [ ] Ajouter un buffer configurable avant un rendez-vous.
- [ ] Synchronisation au démarrage.
- [ ] Synchronisation au retour au premier plan.
- [ ] Synchronisation manuelle.
- [ ] Éviter les synchronisations agressives.

# 7. Écran principal « Maintenant »

- [ ] Afficher énergie actuelle.
- [ ] Afficher prochaine contrainte Outlook.
- [ ] Afficher temps disponible avant la prochaine contrainte.
- [ ] Afficher une seule mission principale.
- [ ] Afficher durée suggérée si pertinente.
- [ ] Afficher XP potentiel.
- [ ] Bouton principal `COMMENCER`.
- [ ] Action `Changer`.
- [ ] Action `Réduire`.
- [ ] Action `Reporter`.
- [ ] Action `Je suis bloqué`.
- [ ] Éviter un mur de cartes et de métriques.

# 8. Tâches et projets

## 8.1 CRUD tâches

- [ ] Créer.
- [ ] Modifier.
- [ ] Terminer.
- [ ] Reporter.
- [ ] Supprimer.
- [ ] Priorité.
- [ ] Importance.
- [ ] Difficulté.
- [ ] Durée estimée.
- [ ] Deadline.
- [ ] Progression.
- [ ] Tâche découpable ou non.
- [ ] Énergie minimale préférée.

## 8.2 Projets / Boss

- [ ] Créer un projet.
- [ ] Associer des tâches.
- [ ] Deadline projet.
- [ ] Calcul de progression.
- [ ] Affichage Boss.
- [ ] Ne jamais masquer la vraie deadline derrière la métaphore de jeu.

# 9. Moteur local de planification

## 9.1 Fonctions pures

- [ ] `computeUrgency(task, now)`.
- [ ] `computeEnergyFit(task, energy)`.
- [ ] `computeContextFit(task, freeWindow)`.
- [ ] `computePriorityScore(task, context)`.
- [ ] `findFreeWindows(events, settings)`.
- [ ] `splitTask(task, freeWindow)`.
- [ ] `selectNextAction(tasks, context)`.
- [ ] `replan(tasks, calendar, state)`.

## 9.2 Règles

- [ ] Aucun chevauchement avec Outlook.
- [ ] Marge avant rendez-vous.
- [ ] Préférer ce qui tient dans le créneau.
- [ ] Découper si la tâche est découpable.
- [ ] Adapter la difficulté à l'énergie.
- [ ] Bonus aux tâches déjà commencées.
- [ ] Éviter de faire varier sans cesse la mission principale.
- [ ] En cas d'égalité, préférer l'action la plus facile à démarrer.

# 10. Gestion de l'énergie

- [ ] Saisie 1 à 10 en une interaction.
- [ ] Valeur expirable après durée configurable.
- [ ] Seuil faible énergie par défaut : 3.
- [ ] Dispatch `energy:changed`.
- [ ] Recalcul de la mission principale.
- [ ] Si énergie 1-2 : micro-actions / récupération.
- [ ] Si énergie 3-4 : tâches courtes / faible friction.
- [ ] Si énergie 5-7 : fonctionnement normal.
- [ ] Si énergie 8-10 : tâches profondes possibles.
- [ ] Ne jamais étiqueter moralement une énergie basse.

# 11. Mode Libre / Flow / Focus / Pomodoro

## 11.1 Libre

- [ ] Démarrage sans durée obligatoire.
- [ ] Stocker `startedAt`.
- [ ] Temps calculé depuis `Date.now()`.
- [ ] Ne pas dépendre d'un `setInterval` continu.

## 11.2 Flow

- [ ] Ne jamais stopper automatiquement.
- [ ] Afficher durée écoulée.
- [ ] Afficher prochain événement Outlook.
- [ ] Alerte douce avant événement.
- [ ] Boutons : continuer / pause / terminer.

## 11.3 Focus guidé

- [ ] Proposer durée selon énergie et créneau.
- [ ] Toujours permettre le mode libre.

## 11.4 Pomodoro

- [ ] Totalement optionnel.
- [ ] Désactivable à tout moment.
- [ ] Ne jamais être utilisé comme règle universelle.

# 12. Gamification

- [ ] XP de démarrage.
- [ ] XP de progression.
- [ ] XP de complétion.
- [ ] Bonus de reprise après pause longue.
- [ ] Niveaux.
- [ ] Boss projets.
- [ ] Animations de progression.
- [ ] Réduction des animations si `prefers-reduced-motion`.
- [ ] Aucune perte d'XP pour tâche reportée.
- [ ] Aucun streak punitif.

Fonctions pures :

- [ ] `computeXp(session, task)`.
- [ ] `computeLevel(xp)`.
- [ ] `computeBossProgress(project, tasks)`.

# 13. Spotify optionnel

## 13.1 Auth

- [ ] Authorization Code + PKCE.
- [ ] Aucun secret dans le front.
- [ ] Connexion séparée d'Outlook.
- [ ] Déconnexion indépendante.

## 13.2 Playlists

- [ ] Lire les playlists utilisateur.
- [ ] Choisir une playlist faible énergie.
- [ ] Choisir une playlist focus.
- [ ] Choisir une playlist récupération.
- [ ] Choisir une playlist boss.

## 13.3 Faible énergie

- [ ] Feature `lowEnergyMusic` écoutant `energy:changed`.
- [ ] Condition : Spotify actif + seuil atteint + playlist configurée.
- [ ] Essayer la lecture uniquement si le contexte navigateur le permet.
- [ ] Si autoplay bloqué : afficher un bouton de lecture explicite.
- [ ] Ne jamais bloquer le planner si Spotify échoue.

# 14. IA optionnelle

## 14.1 Intégration

- [ ] Fournisseur choisi par l'utilisateur.
- [ ] Aucun fournisseur obligatoire.
- [ ] BYOK seulement si explicitement accepté.
- [ ] Ne pas stocker la clé dans les logs.
- [ ] Suppression de clé simple.

## 14.2 Usage

- [ ] Découper une tâche.
- [ ] Reformuler une prochaine action.
- [ ] Proposer une durée.
- [ ] Détecter un planning incohérent.
- [ ] Expliquer une recommandation.
- [ ] Bouton « Je suis bloqué ».

## 14.3 Contraintes

- [ ] Entrées minimales.
- [ ] Sorties JSON structurées.
- [ ] Validation du schéma.
- [ ] Timeout.
- [ ] Fallback local.
- [ ] L'IA ne modifie jamais seule une permission.
- [ ] L'IA ne déploie jamais seule du code en production.

# 15. Notifications

- [ ] Demander la permission uniquement après une action explicite pertinente.
- [ ] Prévenir avant prochain événement Outlook.
- [ ] Notification de reprise optionnelle.
- [ ] Notification de pause optionnelle.
- [ ] Pas de spam.
- [ ] Quiet hours.
- [ ] Pas de notification culpabilisante.
- [ ] Si permission refusée, app parfaitement utilisable.
- [ ] Ne pas promettre de push distant fiable avec GitHub Pages seul.
- [ ] Les minuteurs doivent être basés sur timestamps, pas sur une boucle permanente en arrière-plan.

# 16. Interface et design

- [ ] Mobile-first.
- [ ] Thème ludique mais pas infantile.
- [ ] Une action principale à la fois.
- [ ] Faible densité cognitive.
- [ ] Contraste AA minimum.
- [ ] Touch targets confortables.
- [ ] Navigation clavier desktop.
- [ ] ARIA sur les contrôles nécessaires.
- [ ] Respect `prefers-reduced-motion`.
- [ ] L'état ne doit jamais être exprimé uniquement par couleur.

Écrans minimum : onboarding, Maintenant, Planning / Agenda, Tâches, Projet / Boss, Session Flow, Réglages, Connexions, Diagnostics.

# 17. Diagnostics

- [ ] Version app.
- [ ] Statut Outlook.
- [ ] Dernière synchro.
- [ ] Statut Spotify.
- [ ] Statut IA.
- [ ] Statut réseau.
- [ ] Statut PWA.
- [ ] Statut Service Worker.
- [ ] Version du schéma IndexedDB.
- [ ] Logs récents nettoyés.
- [ ] Bouton copier diagnostic sans données sensibles.

# 18. Sécurité

- [ ] CSP adaptée à GitHub Pages et APIs utilisées.
- [ ] Aucune insertion de HTML non nettoyée.
- [ ] Utiliser `textContent` par défaut.
- [ ] Pas de `eval`.
- [ ] Pas de `new Function`.
- [ ] Pas de secrets en dur.
- [ ] Vérifier les URLs de redirect OAuth.
- [ ] Minimiser scopes Microsoft/Spotify.
- [ ] Valider toutes les données importées.
- [ ] Valider les réponses IA.
- [ ] Ne pas enregistrer les tokens dans les diagnostics.

# 19. Tests

## 19.1 Fonctions pures

- [ ] Priorité.
- [ ] Urgence.
- [ ] Energy fit.
- [ ] Créneaux libres.
- [ ] Split de tâche.
- [ ] XP.
- [ ] Level.
- [ ] Boss progress.
- [ ] Reducers.
- [ ] Migrations.

## 19.2 Parcours

- [ ] Outlook connecté → événements affichés.
- [ ] Outlook obligatoire → pas de planner complet sans compte.
- [ ] Énergie basse → mission plus simple.
- [ ] Spotify absent → aucun crash.
- [ ] Spotify autoplay bloqué → bouton manuel.
- [ ] IA absente → planner local fonctionnel.
- [ ] IA invalide → fallback local.
- [ ] Suspension navigateur → session Flow garde la bonne durée.
- [ ] Offline → tâches et état lisibles.
- [ ] Nouvelle version SW → update non destructif.

# 20. GitHub Pages / CI

- [ ] Activer GitHub Pages sur `main` ou via Actions.
- [ ] Vérifier chemins relatifs sous `/MeliApp/`.
- [ ] Ajouter un workflow de vérification HTML/JS.
- [ ] Ajouter un lint JS optionnel sans rendre le runtime dépendant de Node.
- [ ] Ajouter tests unitaires en CI.
- [ ] Ajouter secret scan.
- [ ] Ajouter audit des dépendances uniquement si des SDK externes sont ajoutés.

# 21. Ordre recommandé d'implémentation

## Sprint 1 — squelette

- [ ] Arborescence.
- [ ] `index.html`.
- [ ] CSS de base.
- [ ] `initialState`.
- [ ] `registry`.
- [ ] `dispatch`.
- [ ] `runFeatures`.
- [ ] stockage IndexedDB.
- [ ] rendu UI minimal.

## Sprint 2 — Outlook

- [ ] OAuth Microsoft.
- [ ] sync agenda.
- [ ] normalisation.
- [ ] créneaux libres.
- [ ] affichage du prochain événement.

## Sprint 3 — tâches / planner

- [ ] CRUD tâches.
- [ ] scoring local.
- [ ] prochaine action.
- [ ] replanification.
- [ ] bouton « Je suis bloqué » local sans IA.

## Sprint 4 — énergie / flow

- [ ] énergie 1-10.
- [ ] adaptation planner.
- [ ] sessions libres.
- [ ] mode Flow.
- [ ] timestamps robustes.

## Sprint 5 — game layer

- [ ] XP.
- [ ] niveaux.
- [ ] Boss.
- [ ] animations sobres.

## Sprint 6 — PWA

- [ ] manifest.
- [ ] service worker.
- [ ] offline.
- [ ] install button.
- [ ] update flow.

## Sprint 7 — Spotify

- [ ] OAuth PKCE.
- [ ] playlists.
- [ ] low-energy playlist.
- [ ] fallback autoplay.

## Sprint 8 — IA

- [ ] provider adapter.
- [ ] sortie JSON.
- [ ] validation.
- [ ] fallback local.
- [ ] découpage / next action.

## Sprint 9 — polish / sécurité

- [ ] accessibilité.
- [ ] diagnostics.
- [ ] CSP.
- [ ] tests E2E.
- [ ] performance.

# 22. Definition of Done globale

Une version MVP est considérée terminée uniquement si :

- [ ] elle fonctionne sur GitHub Pages ;
- [ ] elle ne nécessite aucun serveur applicatif pour démarrer ;
- [ ] Outlook est connecté via PKCE ;
- [ ] elle calcule une prochaine action localement ;
- [ ] elle s'adapte à l'énergie ;
- [ ] elle permet le mode libre / Flow ;
- [ ] elle fonctionne sans Pomodoro ;
- [ ] elle fonctionne sans Spotify ;
- [ ] elle fonctionne sans IA ;
- [ ] elle fonctionne partiellement offline ;
- [ ] elle est installable comme PWA lorsque le navigateur le permet ;
- [ ] aucun secret n'est exposé dans le dépôt ;
- [ ] la logique métier principale est fonctionnelle et testable ;
- [ ] le noyau n'encode pas en dur chaque fonctionnalité ;
- [ ] les fonctionnalités sont définies dans des objets de registre ;
- [ ] le gros de l'application consiste à itérer sur ces objets selon les événements et conditions.
