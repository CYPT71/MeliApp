# MeliApp / FlowQuest — TODO

> État réel du projet. Une case cochée correspond à du code présent dans le dépôt.

## 0. Architecture

- [x] Full static GitHub Pages.
- [x] HTML/CSS/JavaScript ES Modules.
- [x] Registre runtime unique de features.
- [x] Composition `base + advanced + overrides`.
- [x] État dérivé de `feature.state`.
- [x] Runner générique par événements.
- [x] Persistance IndexedDB.
- [x] Actions UI via `data-action`.
- [x] Pages et catégories déclaratives.
- [x] Services injectés pour les effets externes.
- [x] Tests unitaires `node:test`.
- [x] CI/CD GitHub Actions.

## 1. Navigation produit

- [x] `#/calendar` : Outlook + agenda.
- [x] `#/tasks` : tâches + matrice + mindmap + projets + découpage.
- [x] `#/day` : Flow / focus.
- [x] `#/progress` : XP + statistiques + succès.
- [x] `#/settings` : connexions + préférences + données + diagnostic.
- [x] Raccourci PWA Tâches.
- [ ] Tester la densité réelle sur petit écran Android.

## 2. Outlook = calendrier

- [x] PKCE public client.
- [x] Aucun `client_secret`.
- [x] Lecture et écriture calendrier.
- [x] Erreurs de configuration techniques masquées à l’utilisateur.
- [ ] Renseigner le `microsoftClientId` du déploiement.
- [ ] Enregistrer la redirect URI GitHub Pages dans Entra.
- [ ] Tester comptes personnels + tenant cible.

## 3. Énergie

- [x] Sélecteur visuel sans chiffres.
- [x] Interaction fluide sans rerender global pendant le drag.
- [x] Adaptation du planner.
- [x] Seuil faible énergie et expiration.
- [ ] Faire utiliser toutes les préférences horaires par tous les calculs de fenêtre.

## 4. Tâches

- [x] CRUD tâches.
- [x] Échéance.
- [x] Difficulté.
- [x] Importance 1 à 5.
- [x] Durée estimée.
- [x] Progression.
- [x] Projet/Boss.
- [x] Onglet Tâches dédié.
- [x] Vue Liste.
- [x] Matrice d’Eisenhower calculée depuis importance + échéance.
- [x] Vue Mindmap projet → tâche → sous-tâche.
- [x] Nœuds Mindmap avec échéance, importance, durée, progression et quadrant.
- [x] Tâches sans projet visibles dans « Sans projet ».
- [x] Découpage manuel en sous-tâches.
- [x] Découpage manuel récompensé en XP.
- [x] Plafond anti-farming des XP de découpage.
- [x] Bouton « Aide-moi » pour découpage IA.
- [x] Découpage IA marqué `splitSource: ai`.
- [x] Découpage IA = 0 XP de découpage.
- [ ] Ajouter édition directe d’une sous-tâche depuis la Mindmap si les tests utilisateurs le justifient.
- [ ] Ajouter dépendances entre tâches uniquement si besoin produit réel.

## 5. Matrice d’Eisenhower

- [x] Important = importance 4 ou 5.
- [x] Urgent = échéance dans les 3 jours ou dépassée.
- [x] Important + urgent → À faire maintenant.
- [x] Important + non urgent → À planifier.
- [x] Urgent + moins important → Rapide / délégable.
- [x] Ni urgent ni important → À garder léger.
- [x] Tests unitaires des quatre quadrants.
- [ ] Rendre le seuil d’urgence configurable si les retours utilisateurs le demandent.

## 6. Projets / Boss

- [x] Création.
- [x] Deadline projet.
- [x] Association tâches.
- [x] Progression calculée.
- [x] Présence comme racines de la Mindmap.
- [ ] Édition nom/deadline depuis l’UI.

## 7. Planner local

- [x] Urgence.
- [x] Importance.
- [x] Énergie.
- [x] Créneau disponible.
- [x] Découpage automatique.
- [x] Stabilité anti-zapping.
- [x] Fonctionnement sans IA.
- [ ] Ajouter pénalité de changement de contexte par projet si nécessaire.

## 8. Gamification

- [x] XP.
- [x] Niveaux.
- [x] XP de session et tâche.
- [x] Aucun retrait d’XP au report.
- [x] XP de découpage manuel.
- [x] Aucun XP de découpage IA.
- [x] Limite anti-farming du découpage manuel.
- [ ] Ajuster les valeurs XP après tests d’usage.

## 9. IA optionnelle

- [x] Hub unique limité à GPT, Claude et Gemini.
- [x] Interface sous forme de connexions.
- [x] Simple / Secours / Fusion.
- [x] Fallback local.
- [x] Méthode `decompose()` pour petites étapes structurées.
- [x] Validation du tableau JSON retourné pour le découpage.
- [ ] Brancher les vrais adaptateurs d’authentification fournisseur quand disponibles pour le déploiement.
- [ ] Ajouter schéma structuré pour d’autres recommandations multi-champs.

## 10. Spotify

- [x] PKCE.
- [x] Bibliothèque de playlists.
- [x] Modes low-energy/focus/recovery/boss.
- [x] Fallback lecture.
- [ ] Renseigner `spotifyClientId`.
- [ ] Tester avec compte/appareil réels.

## 11. PWA / offline

- [x] Manifest.
- [x] Service Worker.
- [x] Cache shell.
- [x] Cache styles/modules Tâches.
- [x] Installation navigateur.
- [x] Raccourci `#/tasks`.
- [ ] UX de mise à jour contrôlée pendant une session Flow.

## 12. Tests

- [x] Core / registry / runner.
- [x] Routing / catégories.
- [x] Scoring / scheduling / XP.
- [x] Énergie.
- [x] Connexions.
- [x] Eisenhower.
- [x] Découpage manuel → XP.
- [x] Découpage IA → 0 XP.
- [x] Cap anti-farming.
- [ ] E2E navigateur Playwright ou équivalent.
- [ ] Tests OAuth réels.
- [ ] Audit Lighthouse PWA/accessibilité.

## 13. Bloquants externes

- [ ] `microsoftClientId` du déploiement.
- [ ] Redirect URI Entra.
- [ ] Consentement Microsoft Graph.
- [ ] `spotifyClientId` si Spotify est activé.
- [ ] Redirect URI Spotify.
- [ ] Adaptateurs d’auth IA réellement supportés par les fournisseurs ciblés.

## 14. Definition of Done MVP

- [x] site statique ;
- [x] architecture déclarative ;
- [x] planner sans IA ;
- [x] onglet Tâches dédié ;
- [x] matrice Eisenhower ;
- [x] mindmap ;
- [x] découpage manuel/IA avec règle XP ;
- [x] état persistant localement ;
- [ ] Outlook testé avec vrai calendrier ;
- [ ] pipeline final vert ;
- [ ] test manuel Android PWA ;
- [ ] principaux parcours E2E navigateur.
