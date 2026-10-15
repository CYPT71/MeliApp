# Assistant IA fusionné

MeliApp expose **une seule feature `ai`**. GPT, Claude et Gemini sont des fournisseurs derrière cette feature, pas trois assistants indépendants.

## Fournisseurs principaux

| ID | Fournisseur | API normalisée |
|---|---|---|
| `openai` | GPT / OpenAI | Responses API |
| `anthropic` | Claude / Anthropic | Messages API |
| `gemini` | Gemini / Google | `models.generateContent` |
| `custom` | Proxy / compatible | POST JSON configurable |

Les noms de modèles restent configurables par l’utilisateur. MeliApp ne doit pas supposer qu’un nom de modèle restera éternellement valide, parce que les catalogues IA ont manifestement décidé de vivre comme des collections de baskets.

## Modes

### `single`

Utilise la première IA active et configurée.

### `fallback`

Essaie les fournisseurs dans l’ordre. Une erreur HTTP, un timeout ou une réponse invalide fait passer au fournisseur suivant.

### `fusion`

1. construit un contexte minimal depuis le planner ;
2. appelle en parallèle tous les fournisseurs actifs ;
3. conserve les réponses valides ;
4. demande à `synthesisProvider` de fusionner ces réponses ;
5. retourne une seule prochaine action ;
6. si la synthèse échoue, conserve une réponse fournisseur valide ;
7. si tout échoue, la feature revient au fallback local.

Le but n’est pas de faire voter trois modèles sur la couleur d’un bouton. La fusion sert uniquement lorsqu’une recommandation adaptative bénéficie de plusieurs propositions.

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

Comme l’application est statique, une clé utilisée directement dans le navigateur reste accessible à son propriétaire via les outils du navigateur. Pour une distribution publique à grande échelle, un proxy/backend avec authentification utilisateur serait préférable à une clé partagée côté frontend.

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

La feature UI ne connaît donc pas les formats de réponse propres à chaque API. Cette absurdité reste confinée dans le service, là où elle peut souffrir en silence.
