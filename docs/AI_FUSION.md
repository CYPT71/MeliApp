# Assistant IA fusionné

MeliApp expose **une seule feature `ai`**. GPT, Claude et Gemini sont des fournisseurs derrière cette feature, pas trois assistants indépendants.

## Fournisseurs autorisés

| ID | Fournisseur | API |
|---|---|---|
| `openai` | GPT / OpenAI | Responses API |
| `anthropic` | Claude / Anthropic | Messages API |
| `gemini` | Gemini / Google | `models.generateContent` |

Il n’existe **aucun endpoint compatible**, aucun proxy libre saisi par l’utilisateur et aucun quatrième fournisseur dynamique. Le service applique une allowlist stricte sur ces trois IDs. Les URLs d’API sont définies dans le code du service et ne sont pas configurables depuis l’interface.

Les noms de modèles restent configurables par l’utilisateur afin de ne pas verrouiller MeliApp sur un catalogue de modèles qui changera probablement de nom avant que quelqu’un ait fini son café.

## Modes

### `single`

Utilise la première IA active et configurée parmi GPT, Claude et Gemini.

### `fallback`

Essaie les trois fournisseurs autorisés dans l’ordre. Une erreur HTTP, un timeout ou une réponse invalide fait passer au suivant.

### `fusion`

1. construit un contexte minimal depuis le planner ;
2. appelle en parallèle les IA activées ;
3. conserve les réponses valides ;
4. demande à `synthesisProvider` de fusionner ces réponses ;
5. retourne une seule prochaine action ;
6. si la synthèse échoue, conserve une réponse valide ;
7. si tout échoue, la feature revient au fallback local.

`synthesisProvider` doit lui aussi être `openai`, `anthropic` ou `gemini`.

## Données envoyées

Le prompt est volontairement réduit à :

- énergie courante ;
- mission sélectionnée ;
- maximum 8 tâches actives ;
- prochain événement calendrier ;
- mode de travail courant.

Les tokens Outlook, Spotify et autres secrets ne doivent jamais entrer dans le prompt.

## Clés API

Les clés utilisateur sont gérées par `js/services/ai.js`.

Elles sont :

- stockées dans `sessionStorage` ;
- absentes de l’état IndexedDB ;
- absentes de l’export JSON ;
- effaçables fournisseur par fournisseur ;
- jamais définies dans `js/config.js`.

Comme l’application est statique, une clé utilisée directement dans le navigateur reste accessible à son propriétaire via les outils du navigateur. Il ne faut donc jamais embarquer une clé partagée de production dans MeliApp.

## Contrat du service

```js
services.ai.suggest({
  state,
  mode: "fusion",
  synthesisProvider: "openai",
  providers: {
    openai: { enabled: true, model: "..." },
    anthropic: { enabled: true, model: "..." },
    gemini: { enabled: true, model: "..." }
  }
});
```

Résultat :

```js
{
  text: "Ouvre le document et écris seulement trois phrases.",
  mode: "fusion",
  providersUsed: ["openai", "anthropic", "gemini"],
  synthesisProvider: "openai",
  errors: []
}
```

La feature UI ne connaît pas les formats de réponse propres à chaque API. Les trois bizarreries propriétaires restent confinées dans le service, là où elles peuvent se chamailler sans contaminer le reste de l’application.
