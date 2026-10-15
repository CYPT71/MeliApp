# MeliApp / FlowQuest — TODO

> État réel du projet. Une case cochée correspond à du code présent dans le dépôt. On essaie ainsi d’éviter la tradition ancestrale du README qui décrit un produit trois versions en avance sur la réalité.

## 0. Architecture

- [x] Full static GitHub Pages.
- [x] HTML/CSS/JavaScript ES Modules.
- [x] Registre runtime unique de features.
- [x] Registre extensible par composition `baseFeatures + advancedFeatures + overrides`.
- [x] État initial dérivé de `feature.state`.
- [x] Runner générique par événements.
- [x] `dispatch` unique et queue d’exécution.
- [x] Isolation des erreurs feature par feature.
- [x] Persistance IndexedDB.
- [x] Actions UI via délégation `data-action`.
- [x] Pages déclaratives via `page`.
- [x] Catégories déclaratives via `category`.
- [x] Une feature peut rejoindre une catégorie avec `category: "nom"`.
- [x] Une catégorie peut aussi être détaillée avec `id/path/title/icon/order`.
- [x] Plusieurs features d’une même catégorie sont rendues sur la même page.
- [x] Une seule entrée de navigation est générée par catégorie.
- [x] `feature-categories.js` évite de répéter les métadonnées de catégorie.
- [x] Une catégorie déclarée directement sur une feature prend priorité.
- [x] `ui.visible`, `ui.order`, état et actions sans câblage métier dans le core.
- [x] Services injectés pour tous les effets externes.
- [x] Tests unitaires avec `node:test`.
- [x] CI/CD GitHub Actions vers GitHub Pages.

## 1. Navigation produit

- [x] Accueil minimal : énergie + mission actuelle.
- [x] `#/calendar` : Outlook + synchronisation + agenda.
- [x] `#/organize` : tâches + éditeur + projets/Boss.
- [x] `#/focus` : modes de session.
- [x] `#/progress` : XP + statistiques + succès.
- [x] `#/integrations` : Spotify + IA.
- [x] `#/settings` : préférences + notifications + installation + données + diagnostic.
- [x] Raccourcis PWA alignés sur les nouvelles catégories.
- [x] En-tête unique de catégorie + sous-sections par feature.
- [ ] Tester la densité visuelle réelle sur petit écran Android.
- [ ] Ajouter éventuellement des ancres internes de section si une catégorie devient trop longue.

## 2. Outlook = calendrier

- [x] Outlook traité comme calendrier, pas comme identité métier MeliApp.
- [x] Authorization Code + PKCE, client public.
- [x] Aucun `client_secret`.
- [x] Scope `Calendars.ReadWrite`.
- [x] Lecture `calendarView` Microsoft Graph.
- [x] Normalisation des événements.
- [x] Synchronisation au démarrage, reprise et manuelle.
- [x] Refresh OAuth quand disponible.
- [x] Écriture d’un bloc de focus depuis la mission courante.
- [x] Toutes les fonctions Outlook regroupées dans la catégorie Agenda.
- [ ] Renseigner `microsoftClientId` dans `js/config.js`.
- [ ] Enregistrer l’URL GitHub Pages comme redirect URI SPA dans Entra.
- [ ] Valider consentement sur comptes personnels et tenant cible.
- [ ] Tester les politiques d’entreprise qui bloquent `Calendars.ReadWrite`.

## 3. Énergie et préférences

- [x] Énergie 1 à 10.
- [x] Seuil faible énergie.
- [x] Expiration de l’énergie.
- [x] Recalcul du planner.
- [x] Adaptation des chunks à faible énergie.
- [x] Seuil énergie configurable.
- [x] Expiration configurable.
- [x] Marge agenda configurable dans l’état.
- [x] Mode de travail par défaut configurable.
- [x] Début / fin de journée enregistrés.
- [x] Fenêtre silencieuse pour rappels.
- [ ] Faire utiliser `calendarBufferMinutes`, `dayStart` et `dayEnd` directement par tous les calculs du planner.

## 4. Tâches / Organisation

- [x] Création.
- [x] Mise à jour.
- [x] Suppression.
- [x] Complétion.
- [x] Report.
- [x] Progression.
- [x] Deadline.
- [x] Difficulté.
- [x] Importance.
- [x] Durée estimée.
- [x] Découpage.
- [x] Éditeur détaillé inline.
- [x] Association à un projet/Boss.
- [x] Tâches + éditeur + Boss regroupés sur Organisation.
- [ ] Retirer définitivement l’ancien fallback d’édition `prompt()`.
- [ ] Ajouter dépendances entre tâches uniquement si besoin produit réel.

## 5. Projets / Boss

- [x] Création de projet.
- [x] Deadline projet.
- [x] Association de tâches.
- [x] Progression calculée depuis les tâches.
- [x] Succès « Boss vaincu ».
- [ ] Édition du nom/deadline depuis l’UI.
- [ ] Barre de vie plus visuelle avec `prefers-reduced-motion` respecté.

## 6. Planner local

- [x] Score urgence.
- [x] Importance.
- [x] adéquation énergie.
- [x] adéquation au créneau.
- [x] découpage automatique.
- [x] changement manuel de mission.
- [x] réduction en micro-action.
- [x] fonctionnement sans IA.
- [x] stabilité anti-zapping.
- [x] changement volontaire respecté.
- [ ] Utiliser toutes les préférences horaires dans le calcul des fenêtres libres.
- [ ] Ajouter pénalité de changement de contexte par projet/catégorie si les tests utilisateurs le justifient.

## 7. Écran Maintenant

- [x] Mission principale unique.
- [x] Énergie.
- [x] prochain événement Outlook.
- [x] durée suggérée.
- [x] COMMENCER.
- [x] Changer.
- [x] Réduire.
- [x] Reporter.
- [x] Je suis bloqué.
- [x] Suggestion IA ou fallback local.
- [x] Bouton pour bloquer la mission dans Outlook.

## 8. Flow / Libre / Focus / Pomodoro

- [x] Session avec timestamps.
- [x] Mode Libre.
- [x] Flow.
- [x] Focus guidé.
- [x] Pomodoro optionnel.
- [x] Calcul sans dépendre d’un `setInterval` persistant.
- [x] historique de sessions.
- [ ] Ajouter compteur visuel réactif tant que la page Focus est visible.
- [ ] Ajouter reprise explicite d’une session interrompue.

## 9. Gamification / Progression

- [x] XP.
- [x] niveaux.
- [x] XP démarrage et complétion.
- [x] aucun retrait d’XP en cas de report.
- [x] Boss/projets.
- [x] succès déclaratifs.
- [x] statistiques de tâches, minutes et XP.
- [x] progression regroupée sur une seule page.
- [ ] Ajouter cosmétiques locaux seulement si cela reste non distrayant.

## 10. Spotify optionnel

- [x] PKCE public client.
- [x] lecture via Web API.
- [x] refresh token.
- [x] playlists low-energy/focus/recovery/boss.
- [x] bibliothèque de playlists utilisateur.
- [x] sélection depuis l’UI.
- [x] fallback si lecture automatique échoue.
- [x] low-energy déclenché seulement sous le seuil configuré.
- [x] Spotify regroupé avec IA dans Connexions.
- [ ] Renseigner `spotifyClientId`.
- [ ] Enregistrer la redirect URI Spotify.
- [ ] Tester Premium + appareil actif + restrictions Web API.
- [ ] Ajouter deep-link natif Spotify en fallback sans device actif.

## 11. IA optionnelle

- [x] Désactivable.
- [x] endpoint et modèle configurables.
- [x] aide « Je suis bloqué ».
- [x] fallback local.
- [x] aucun code arbitraire exécuté depuis une réponse.
- [ ] Ajouter schéma JSON strict pour recommandations multi-champs.
- [ ] Vérifier/ajouter timeout `AbortController`.
- [ ] Ajouter minimisation explicite des données envoyées.
- [ ] Choisir le mécanisme d’authentification du fournisseur réellement retenu.

## 12. Notifications

- [x] permission utilisateur.
- [x] service Notification natif.
- [x] rappels opportunistes avant événement.
- [x] quiet hours.
- [x] prévention des doublons.
- [ ] Push distant fiable hors périmètre full static sans émetteur/backend.
- [ ] Tester Android installé / iOS home-screen.

## 13. PWA

- [x] Manifest.
- [x] Service Worker.
- [x] cache offline du shell.
- [x] cache des fichiers de catégories/features.
- [x] bouton installation si supporté.
- [x] aide iOS.
- [x] icône SVG scalable.
- [x] raccourcis Agenda / Organisation / Focus / Réglages.
- [x] métadonnées standalone.
- [ ] Ajouter PNG 192/512 si les audits ciblés l’exigent.
- [ ] UX de mise à jour contrôlée pendant une session Flow.

## 14. Données / confidentialité locale

- [x] IndexedDB.
- [x] export JSON.
- [x] import JSON.
- [x] reset données produit.
- [x] diagnostic local.
- [x] effacement diagnostics.
- [x] tokens OAuth exclus de l’export et stockés en `sessionStorage`.
- [ ] Versionner formellement les migrations futures.
- [ ] Validation JSON plus stricte à l’import.

## 15. Tests

- [x] core / registry / runner.
- [x] pages déclaratives.
- [x] catégories déclaratives.
- [x] déduplication d’une route de catégorie.
- [x] priorité catégorie déclarée directement sur la feature.
- [x] détection d’une feature placée dans deux catégories.
- [x] scoring / scheduling / XP / reducers.
- [x] features produit.
- [x] projets / stabilité planner.
- [x] Outlook mocké.
- [x] Spotify mocké.
- [x] reset données.
- [ ] E2E navigateur Playwright ou équivalent.
- [ ] tests OAuth réels avec configuration dédiée.
- [ ] audit Lighthouse PWA/accessibilité après configuration Pages.

## 16. Bloquants externes

- [ ] `microsoftClientId`.
- [ ] Redirect URI Entra.
- [ ] Consentement Microsoft Graph.
- [ ] `spotifyClientId` si Spotify est activé.
- [ ] Redirect URI Spotify.
- [ ] Choix concret du fournisseur IA pour sortir du mode expérimental.

## 17. Definition of Done MVP réaliste

- [x] site statique servable directement ;
- [x] features déclaratives ;
- [x] catégories déclaratives sans câblage du routeur par feature ;
- [x] planner fonctionnel sans IA ;
- [x] Spotify optionnel ;
- [x] Pomodoro optionnel ;
- [x] Flow non interrompu arbitrairement ;
- [x] état persisté localement ;
- [x] export/import ;
- [ ] Outlook testé avec vrais identifiants et vrai calendrier ;
- [ ] pipeline de la branche finale vert ;
- [ ] test manuel Android PWA ;
- [ ] principaux parcours E2E navigateur.
