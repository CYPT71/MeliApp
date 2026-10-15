# Exemple minimal

```js
export const features = {
  tasks: {
    description: "Tâches",
    category: "organize",
    ui: { render: () => document.createElement("div") }
  },
  projects: {
    description: "Boss",
    category: "organize",
    ui: { render: () => document.createElement("div") }
  }
};
```

Résultat : une seule route `#/organize`, une seule entrée de navigation et deux sections rendues sur la même page.
