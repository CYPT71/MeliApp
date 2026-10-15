# MeliApp / FlowQuest — TODO

> État réel du projet. Les cases cochées correspondent à du code présent dans le dépôt, pas à des intentions héroïques écrites à 2 h du matin.

## 0. Architecture

- [x] Full static GitHub Pages.
- [x] HTML/CSS/JavaScript ES Modules.
- [x] Registre runtime unique de features.
- [x] Registre extensible par composition d’objets (`baseFeatures + advancedFeatures`).
- [x] État initial dérivé de `feature.state`.
- [x] Runner générique par événements.
- [x] `dispatch` unique et queue d’exécution.
- [x] Isolation des erreurs feature par feature.
- [x] Persistance IndexedDB.
- [x] Actions UI via délégation `data-action`.
- [x] Pages déclaratives via `page`.
- [x] Navigation générée depuis les features.
- [x] Plusieurs features peuvent contribuer à la même route avec `nav: false`.
- [x] `ui.visible`, `ui.order`, état et actions sans câblage métier dans le core.
- [x] Services injectés pour tous les effets externes.
- [x] Tests unitaires avec `node:test`.
- [x] CI/CD GitHub Actions vers GitHub Pages.

## 1. Outlook obligatoire

- [x] Authorization Code + PKCE, client public.
- [x] Aucun `client_secret`.
- [x] Scope `Calendars.ReadWrite`.
- [x] Lecture `calendarView` Microsoft Graph.
- [x] Normalisation des événements.
- [x] Synchronisation au démarrage, reprise et manuelle.
- [x] Rafraîchissement OAuth via `refresh_token` quand disponible.
- [x] Écriture d’un bloc de focus dans Outlook depuis la mission courante.
- [x] Page Outlook et page Agenda.
- [ ] Renseigner `microsoftClientId` dans `js/config.js`.
- [ ] Enregistrer l’URL GitHub Pages comme redirect URI SPA dans Entra.
- [ ] Valider consentement sur comptes personnels et tenant cible.
- [ ] Tester les politiques d’entreprise qui bloquent `Calendars.ReadWrite`.

## 2. Énergie et préférences

- [x] Énergie 1 à 10.
- [x] Seuil faible énergie.
- [x] Expiration de l’énergie.
- [x] Recalcul du planner.
- [x] Adaptation des chunks à faible énergie.
- [x] Page Préférences.
- [x] Seuil énergie configurable.
- [x] Expiration configurable.
- [x] Marge agenda configurable dans l’état.
- [x] Mode de travail par défaut configurable.
- [x] Début / fin de journée enregistrés.
- [x] Fenêtre silencieuse pour rappels.
- [ ] Faire utiliser `calendarBufferMinutes`, `dayStart` et `dayEnd` directement par le planner de base au lieu de sa valeur historique fixe.

## 3. Tâches

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
- [x] Page dédiée.
- [x] Éditeur détaillé inline déclaratif sans dépendance au core.
- [x] Association d’une tâche à un projet/Boss.
- [ ] Retirer l’ancien bouton d’édition `prompt()` quand l’éditeur inline sera considéré stable.
- [ ] Ajouter dépendances entre tâches si besoin réel.

## 4. Projets / Boss

- [x] Création de projet.
- [x] Deadline projet.
- [x] Association de tâches.
- [x] Progression calculée depuis les tâches.
- [x] Page Boss.
- [x] Succès « Boss vaincu ».
- [ ] Édition du nom/deadline d’un Boss depuis l’UI.
- [ ] Barre de vie plus visuelle et animations discrètes.

## 5. Planner local

- [x] Score urgence.
- [x] Importance.
- [x] adéquation énergie.
- [x] adéquation au créneau.
- [x] découpage automatique.
- [x] changement manuel de mission.
- [x] réduction en micro-action.
- [x] fonctionnement sans IA.
- [x] couche de stabilité : conserve la mission précédente si la nouvelle n’est pas significativement meilleure.
- [x] changement volontaire (`planner:cycle`) respecté.
- [ ] Utiliser toutes les préférences horaires dans le calcul des fenêtres libres.
- [ ] Ajouter pénalité de changement de contexte par catégorie/projet.

## 6. Écran Maintenant

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

## 7. Flow / Libre / Focus / Pomodoro

- [x] Session avec timestamps.
- [x] Mode Libre.
- [x] Flow.
- [x] Focus guidé.
- [x] Pomodoro optionnel.
- [x] Calcul de durée sans dépendre d’un `setInterval` persistant.
- [x] historique de sessions.
- [ ] Ajouter compteur visuel réactif lorsque la page Focus reste ouverte.
- [ ] Ajouter reprise explicite d’une session interrompue.

## 8. Gamification

- [x] XP.
- [x] niveaux.
- [x] XP de démarrage et de complétion.
- [x] aucun retrait d’XP en cas de report.
- [x] Boss/projets.
- [x] Succès déclaratifs.
- [x] statistiques de tâches, minutes et XP.
- [ ] Ajouter cosmétiques purement locaux si cela reste utile et non distrayant.

## 9. Spotify optionnel

- [x] PKCE public client.
- [x] lecture via Web API.
- [x] rafraîchissement de token.
- [x] playlists low-energy/focus/recovery/boss.
- [x] chargement de la bibliothèque de playlists utilisateur.
- [x] sélection d’une playlist depuis l’UI.
- [x] fallback si lecture automatique échoue.
- [ ] Renseigner `spotifyClientId`.
- [ ] Enregistrer la redirect URI Spotify.
- [ ] Tester compte Premium, appareil actif et restrictions Web API réelles.
- [ ] Ajouter deep-link natif Spotify en fallback si aucun device actif.

## 10. IA optionnelle

- [x] Désactivable.
- [x] Endpoint et modèle configurables.
- [x] aide « Je suis bloqué ».
- [x] fallback local si fournisseur absent/erreur.
- [x] aucun code arbitraire exécuté depuis la réponse.
- [ ] Ajouter schéma JSON strict pour recommandations multi-champs.
- [ ] Ajouter timeout via `AbortController` si le service IA courant ne le fait pas encore.
- [ ] Ajouter politique explicite de minimisation des données envoyées.
- [ ] Décider du mécanisme d’authentification fournisseur réellement utilisé avant toute mise en production.

## 11. Notifications

- [x] permission utilisateur.
- [x] service natif Notification.
- [x] rappels opportunistes avant le prochain événement.
- [x] quiet hours.
- [x] prévention des doublons d’un même événement.
- [ ] Push distant fiable nécessite un émetteur/backend : hors périmètre full static.
- [ ] Tester comportement Android installé / iOS home-screen.

## 12. PWA

- [x] Manifest.
- [x] Service Worker.
- [x] cache offline du shell.
- [x] bouton d’installation lorsque supporté.
- [x] aide iOS.
- [x] icône SVG scalable.
- [x] raccourcis Tâches / Focus / Préférences.
- [x] métadonnées mobile standalone.
- [ ] Ajouter icônes PNG 192/512 si les audits navigateur ciblés l’exigent.
- [ ] UX de mise à jour contrôlée pendant une session Flow.

## 13. Données / confidentialité locale

- [x] IndexedDB.
- [x] export JSON.
- [x] import JSON.
- [x] réinitialisation des données produit.
- [x] diagnostic local.
- [x] effacement des diagnostics.
- [x] jetons OAuth conservés hors export applicatif dans `sessionStorage`.
- [ ] Versionner formellement les migrations de schéma au-delà du merge actuel.
- [ ] Ajouter validation JSON plus stricte lors de l’import.

## 14. Diagnostic / observabilité

- [x] page Diagnostic.
- [x] réseau.
- [x] Outlook.
- [x] Spotify.
- [x] IA.
- [x] Service Worker.
- [x] IndexedDB.
- [x] erreurs features locales.
- [ ] Afficher numéro de version / commit au build sans introduire de build runtime obligatoire.

## 15. Tests

- [x] core / registry / runner.
- [x] router pages déclaratives.
- [x] scoring et scheduling.
- [x] XP / reducers.
- [x] premières features produit.
- [x] préférences avancées.
- [x] projets.
- [x] stabilité planner.
- [x] écriture Outlook via service mocké.
- [x] bibliothèque Spotify via service mocké.
- [x] reset données.
- [ ] E2E navigateur avec Playwright ou équivalent.
- [ ] tests réels OAuth nécessitent environnement/configuration dédiée.
- [ ] audit Lighthouse PWA/accessibilité après configuration Pages.

## 16. Bloquants externes avant validation réelle

- [ ] `microsoftClientId`.
- [ ] Redirect URI Entra.
- [ ] Consentement Microsoft Graph.
- [ ] `spotifyClientId` si Spotify est testé.
- [ ] Redirect URI Spotify.
- [ ] Choix concret du fournisseur IA si l’intégration IA doit sortir du mode expérimental.

## 17. Definition of Done MVP réaliste

Le MVP est considéré validé quand :

- [x] il peut être servi comme site statique ;
- [x] toutes les features restent déclaratives ;
- [x] aucune feature produit n’oblige à ajouter un branchement dans `main.js` ;
- [x] le planner fonctionne sans IA ;
- [x] Spotify reste optionnel ;
- [x] Pomodoro reste optionnel ;
- [x] Flow n’est pas interrompu arbitrairement ;
- [x] l’état persiste localement ;
- [x] export/import existent ;
- [ ] Outlook est testé avec de vrais identifiants et un vrai calendrier ;
- [ ] le pipeline de la branche finale est vert ;
- [ ] un test manuel Android PWA est effectué ;
- [ ] les principaux parcours passent en E2E navigateur.
