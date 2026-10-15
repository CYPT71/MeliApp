# Catégories fusionnées

La navigation produit est volontairement limitée à quatre pages principales :

| Route | Catégorie | Features |
|---|---|---|
| `#/calendar` | Agenda | Outlook, synchronisation, événements |
| `#/day` | Journée | tâches, éditeur, projets/Boss, Focus/Flow/Pomodoro optionnel |
| `#/progress` | Progression | XP, niveaux, statistiques, succès |
| `#/settings` | Réglages & connexions | Spotify, assistant IA GPT/Claude/Gemini, préférences, notifications, installation, données, diagnostic |

L’accueil conserve uniquement l’énergie et la mission « Maintenant ».

Les anciennes routes `#/organize`, `#/focus` et `#/integrations` ne sont plus les routes canoniques. Le but est de réduire la navigation et de garder les fonctions qui servent le même moment d’usage sur la même page.

## IA

L’assistant IA n’accepte que trois fournisseurs :

- GPT / OpenAI ;
- Claude / Anthropic ;
- Gemini / Google.

Aucun endpoint libre ou compatible ne peut être ajouté depuis l’interface. Les URLs des APIs sont fixées dans `js/services/ai.js` et le service refuse tout identifiant de fournisseur qui n’est pas dans cette allowlist.
