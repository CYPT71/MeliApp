# Migration vers les pages de catégories

Anciennes routes principales et nouvelles destinations :

| Ancienne route | Nouvelle route |
|---|---|
| `#/outlook` | `#/calendar` |
| `#/agenda` | `#/calendar` |
| `#/tasks` | `#/organize` |
| `#/projects` | `#/organize` |
| `#/stats` | `#/progress` |
| `#/achievements` | `#/progress` |
| `#/spotify` | `#/integrations` |
| `#/ai` | `#/integrations` |
| `#/notifications` | `#/settings` |
| `#/diagnostics` | `#/settings` |

Le routeur reste compatible avec les futures pages individuelles. Cette migration ne supprime pas le contrat `page`, elle ajoute le contrat `category` et fait primer la catégorie lorsqu’une feature en possède une.
