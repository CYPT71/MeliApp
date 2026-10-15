# Architecture des catégories

## But

Regrouper les features liées sur une même page sans ajouter de branchement métier au routeur ou au renderer.

## Contrats supportés

Une feature indépendante peut rester sur l’accueil sans `page` ni `category`.

Une feature peut avoir sa page :

```js
page: true
```

Une feature peut rejoindre une catégorie :

```js
category: "organize"
```

Ou déclarer la catégorie complète :

```js
category: {
  id: "organize",
  path: "organize",
  title: "Organisation",
  icon: "🧭",
  order: 20,
  nav: true
}
```

## Regroupement produit

Le fichier `js/feature-categories.js` évite la duplication de métadonnées :

```js
{
  organize: {
    id: "organize",
    path: "organize",
    title: "Organisation",
    icon: "🧭",
    order: 20,
    features: ["tasks", "taskEditor", "projects"]
  }
}
```

Le registre applique ce mapping avant validation.

## Priorité

1. `feature.category` explicite ;
2. mapping `featureCategories` ;
3. `feature.page` ;
4. aucune page = widget d’accueil.

Ainsi une feature peut quitter une catégorie ou changer de page en modifiant uniquement sa déclaration.

## Routage

`featurePages()` groupe les features par route finale et déduplique la navigation.

Exemple :

```text
tasks       ┐
taskEditor  ├── category organize ──> #/organize
projects    ┘
```

Le renderer affiche :

```text
Organisation
├── Tâches
├── Édition avancée des tâches
└── Projets / Boss
```

## Règles

- une feature ne doit pas appartenir à deux catégories via le mapping ;
- une catégorie produit doit avoir une route unique ;
- les features sans UI peuvent appartenir à une catégorie sans créer de section vide ;
- la navigation d’une catégorie n’apparaît que si au moins une feature UI de cette catégorie est visible ;
- `ui.order` ordonne les sections à l’intérieur de la page ;
- `category.order` ordonne les catégories dans la navigation ;
- les actions restent gérées par `data-action` et `dispatch`.

## Catégories actuelles

```text
calendar      Agenda
organize      Organisation
focus         Focus
progress      Progression
integrations  Connexions
settings      Réglages
```
