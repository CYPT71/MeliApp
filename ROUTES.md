# Routes MeliApp

Le routage est en hash afin de rester compatible avec GitHub Pages sans serveur de réécriture.

```text
#/               Accueil / Maintenant
#/calendar       Agenda Outlook
#/organize       Tâches + projets/Boss
#/focus          Sessions de focus
#/progress       XP + statistiques + succès
#/integrations   Spotify + IA
#/settings       Préférences + notifications + données + diagnostic
```

Les routes ne sont pas câblées manuellement dans `main.js`. Elles sont dérivées des propriétés `page` et `category` du registre de features.
