# MeliApp / FlowQuest — TODO de développement

> État réel du projet après implémentation du registre fonctionnel et des premières features produit.

## 0. Architecture

- [x] Full static GitHub Pages.
- [x] HTML/CSS/JavaScript ES Modules.
- [x] Registre runtime unique `features`.
- [x] État initial dérivé automatiquement de `feature.state`.
- [x] Runner générique par événements.
- [x] Isolation des erreurs par feature.
- [x] Dispatch unique.
- [x] Persistance IndexedDB.
- [x] Actions UI par délégation `data-action`.
- [x] Pages déclaratives via `page: true` ou `page: { ... }`.
- [x] Navigation et routes hash générées automatiquement.
- [x] `ui.visible` et `ui.order` pris en charge.
- [x] Services injectés au lieu d’appels réseau dans le domaine.
- [x] Aucun secret développeur prévu dans le frontend.

## 1. Registre de features produit

Implémenté dans `js/features.js`.

- [x] `microsoftAuth`.
- [x] `outlookSync`.
- [x] `calendarView`.
- [x] `manualSync`.
- [x] `energy`.
- [x] `tasks`.
- [x] `planner`.
- [x] `now`.
- [x] `flow`.
- [x] `game`.
- [x] `spotify`.
- [x] `ai`.
- [x] `notifications`.
- [x] `install`.

## 2. Outlook obligatoire

- [x] Service OAuth Authorization Code + PKCE côté navigateur.
- [x] Aucun `client_secret`.
- [x] Restauration de session depuis `sessionStorage`.
- [x] Lecture Microsoft Graph `calendarView`.
- [x] Normalisation des événements.
- [x] Synchronisation au démarrage / reprise / manuel.
- [x] Page Outlook.
- [x] Page Agenda.
- [ ] Renseigner le vrai `microsoftClientId` dans `js/config.js`.
- [ ] Enregistrer l’URL GitHub Pages comme redirect URI SPA dans Entra.
- [ ] Tester connexion et consentement sur le tenant cible.
- [ ] Tester comptes personnels Microsoft + comptes organisation si nécessaire.
- [ ] Gérer proprement refresh/expiration longue durée si le comportement SPA l’exige.

## 3. Énergie

- [x] Échelle 1 à 10.
- [x] Seuil faible énergie.
- [x] Timestamp de dernière mise à jour.
- [x] Expiration automatique.
- [x] Recalcul du planner sur changement.
- [x] Adaptation forte des chunks à faible énergie.
- [x] UI home.
- [ ] Ajouter préférences utilisateur pour le seuil et la durée d’expiration.

## 4. Tâches

- [x] Création.
- [x] Édition simple.
- [x] Suppression.
- [x] Complétion.
- [x] Report.
- [x] Progression interne.
- [x] Deadline.
- [x] Difficulté.
- [x] Importance.
- [x] Durée estimée.
- [x] Découpage activable.
- [x] Page dédiée générée depuis la feature.
- [ ] Remplacer l’édition `prompt()` par un formulaire inline ou modal déclaratif.
- [ ] Ajouter projets / Boss explicites.

## 5. Planner local

- [x] Recalcul au démarrage.
- [x] Recalcul à la reprise.
- [x] Recalcul après sync calendrier.
- [x] Recalcul après mutations de tâches.
- [x] Recalcul après énergie.
- [x] Score urgence / importance / énergie / contexte.
- [x] Découpage selon fenêtre libre.
- [x] Réduction manuelle en micro-action.
- [x] Rotation vers une autre mission.
- [x] Fonctionne sans IA.
- [ ] Ajouter stabilité avancée pour éviter trop de changements de mission.
- [ ] Ajouter préférence horaires de sommeil / plages interdites.

## 6. Écran « Maintenant »

- [x] Une mission principale.
- [x] Énergie affichée.
- [x] Prochain événement Outlook affiché.
- [x] Durée suggérée.
- [x] `COMMENCER`.
- [x] `Changer`.
- [x] `Réduire`.
- [x] `Reporter`.
- [x] `Je suis bloqué`.
- [x] Affichage de la dernière suggestion IA ou fallback local.

## 7. Libre / Flow / Focus / Pomodoro

- [x] État de session.
- [x] `startedAt` / `endedAt`.
- [x] Temps calculé depuis les timestamps.
- [x] Mode Libre.
- [x] Mode Flow.
- [x] Mode Focus guidé.
- [x] Mode Pomodoro optionnel.
- [x] Aucune dépendance à un `setInterval` permanent pour la durée réelle.
- [x] Page Focus.
- [ ] Ajouter rafraîchissement visuel léger du chrono sans utiliser le timer comme source de vérité.
- [ ] Ajouter rappel doux avant prochain événement Outlook.

## 8. Gamification

- [x] XP de démarrage.
- [x] XP de session terminée.
- [x] XP de tâche terminée.
- [x] Niveaux.
- [x] Aucun retrait d’XP en cas de report.
- [ ] Projets / Boss avec HP/progression.
- [ ] Animations de gain et niveau.
- [ ] Récompenses cosmétiques.

## 9. Spotify optionnel

- [x] OAuth PKCE côté navigateur.
- [x] Aucun `client_secret`.
- [x] Lecture sur appareil Spotify actif via Web API.
- [x] Playlist faible énergie.
- [x] Playlist focus.
- [x] Playlist récupération.
- [x] Playlist boss.
- [x] Fallback manuel si lecture automatique impossible.
- [x] Page Spotify.
- [ ] Renseigner le vrai `spotifyClientId` dans `js/config.js`.
- [ ] Enregistrer l’URL GitHub Pages dans le dashboard Spotify.
- [ ] Tester avec compte Premium et appareil actif.
- [ ] Ajouter sélecteur de playlists depuis l’API au lieu de saisir uniquement une URI.

## 10. IA optionnelle

- [x] Feature désactivable.
- [x] Endpoint configurable.
- [x] Modèle configurable.
- [x] `Je suis bloqué`.
- [x] Fallback local garanti.
- [x] Timeout réseau.
- [x] Aucune exécution de code provenant de l’IA.
- [x] Page IA.
- [ ] Définir le contrat final du fournisseur IA choisi.
- [ ] Ajouter schéma JSON strict pour découpage/reformulation/explication.
- [ ] Ajouter authentification IA si le fournisseur retenu propose OAuth adapté au navigateur.

## 11. Notifications

- [x] Demande de permission déclarative.
- [x] Page Notifications.
- [x] Application utilisable si permission refusée.
- [ ] Rappels de rendez-vous.
- [ ] Rappels de reprise.
- [ ] Notifications via Service Worker quand disponibles.
- [ ] Ne pas promettre de push distant fiable sans backend.

## 12. PWA / installation

- [x] Manifest.
- [x] Service Worker.
- [x] Cache shell.
- [x] Offline partiel.
- [x] Capture `beforeinstallprompt` dans un service.
- [x] Bouton Installer exposé par la feature.
- [x] Aide iOS.
- [ ] Ajouter icônes PWA définitives 192/512.
- [ ] Ajouter stratégie d’update qui ne coupe pas une session Flow.

## 13. Tests

- [x] Registre / état auto.
- [x] Runner.
- [x] Filtre événements / enabled.
- [x] Isolation des erreurs.
- [x] Pages automatiques.
- [x] Scoring / scheduling / XP.
- [x] Énergie.
- [x] Création de tâche + planner.
- [x] Complétion + XP.
- [x] Session Flow.
- [x] Fallback IA local.
- [x] Sync Outlook avec service injecté fake.
- [ ] Tests DOM des actions et rendus.
- [ ] Tests E2E navigateur réels.
- [ ] Tests OAuth E2E sur environnements de développement.

## 14. CI/CD

- [x] Vérification syntaxique.
- [x] Tests unitaires Node natifs.
- [x] Scan simple de secrets.
- [x] Déploiement GitHub Pages sur `main`.
- [ ] Ajouter test smoke navigateur avant déploiement.
- [ ] Ajouter audit PWA/Lighthouse si utile.

## 15. Configuration requise avant MVP réellement utilisable

- [ ] Créer/configurer l’application Microsoft Entra.
- [ ] Renseigner `config.microsoftClientId`.
- [ ] Vérifier redirect URI GitHub Pages.
- [ ] Activer GitHub Pages via GitHub Actions si ce n’est pas déjà fait.
- [ ] Tester la PWA installée sur Android Chrome.
- [ ] Tester le comportement en arrière-plan réel sur Android.
- [ ] Tester Spotify avec le vrai client ID.

## Definition of Done MVP

- [ ] Outlook réel fonctionne via PKCE.
- [ ] Agenda réel visible.
- [x] Tâches locales fonctionnelles.
- [x] Planner local fonctionnel.
- [x] Énergie prise en compte.
- [x] Mode Libre fonctionnel.
- [x] Mode Flow fonctionnel.
- [x] Pomodoro optionnel.
- [x] Gamification minimale.
- [x] PWA installable lorsque supportée par le navigateur.
- [x] Offline partiel.
- [x] Spotify non requis.
- [x] IA non requise.
- [ ] Parcours complet validé sur téléphone réel.
