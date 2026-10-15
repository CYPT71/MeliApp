import { featureOverrides } from "./features-overrides.js";
import {
  ENERGY_MOODS,
  energyGuidance,
  energyMood,
  energyPercentToScore,
  energyScoreToPercent
} from "./domain/energy.js";

const node = (tag, attrs = {}, children = []) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "className") element.className = value;
    else if (key === "text") element.textContent = String(value);
    else if (key === "value") element.value = value;
    else element.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of (Array.isArray(children) ? children : [children])) {
    if (child === undefined || child === null || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
};

export const ENERGY_CHOICES = Object.freeze([
  { emoji: "😵", label: "À plat", percent: 8 },
  { emoji: "😟", label: "Très basse", percent: 22 },
  { emoji: "🙁", label: "Basse", percent: 36 },
  { emoji: "😕", label: "Mitigée", percent: 50 },
  { emoji: "😐", label: "Stable", percent: 64 },
  { emoji: "🙂", label: "Bonne", percent: 80 },
  { emoji: "😄", label: "Pleine", percent: 96 }
]);

const closestChoice = (percent) =>
  ENERGY_CHOICES.reduce((best, choice) =>
    Math.abs(choice.percent - percent) < Math.abs(best.percent - percent) ? choice : best
  );

const energyGauge = (score) => {
  const percent = energyScoreToPercent(score);
  const mood = energyMood(percent);
  const active = closestChoice(percent);
  const root = node("section", {
    className: "energy-feeling stack",
    style: `--energy:${percent}%`
  });

  root.append(
    node("div", { className: "energy-feeling__title" }, [
      node("span", { className: "energy-feeling__bolt", text: "⚡" }),
      node("strong", { text: "Comment tu te sens ?" })
    ]),
    node("p", {
      className: "energy-feeling__prompt muted",
      text: "Choisis la tête qui ressemble le plus à ton énergie du moment. Pas besoin de calculer quoi que ce soit, miracle administratif."
    })
  );

  const choices = node("div", {
    className: "energy-feeling__choices",
    role: "radiogroup",
    "aria-label": "Énergie du moment"
  });

  for (const choice of ENERGY_CHOICES) {
    const selected = choice === active;
    choices.append(node("button", {
      type: "button",
      className: `energy-feeling__choice${selected ? " is-current" : ""}`,
      "data-action": "energy.pick-feeling",
      "data-percent": choice.percent,
      role: "radio",
      "aria-checked": selected ? "true" : "false",
      "aria-label": choice.label,
      title: choice.label
    }, [
      node("span", { className: "energy-feeling__emoji", text: choice.emoji }),
      node("span", { className: "energy-feeling__choice-label", text: choice.label })
    ]));
  }

  const slider = node("input", {
    className: "energy-feeling__slider",
    type: "range",
    min: 0,
    max: 100,
    step: 1,
    value: percent,
    "data-action": "energy.set-percent-friendly",
    "aria-label": "Ajuster finement l’énergie",
    "aria-valuetext": mood.label
  });

  root.append(
    choices,
    node("div", { className: "energy-feeling__rail" }, [slider]),
    node("div", { className: "energy-feeling__status" }, [
      node("span", { className: "energy-feeling__status-emoji", text: mood.emoji }),
      node("div", { className: "stack compact" }, [
        node("strong", { text: mood.label }),
        node("small", { className: "muted", text: energyGuidance(percent) })
      ])
    ])
  );

  return root;
};

export const energyFriendlyOverride = {
  energy: {
    ...featureOverrides.energy,
    description: "Sélecteur d’énergie visuel et sans chiffres",
    ui: {
      ...featureOverrides.energy.ui,
      render: ({ state }) => energyGauge(state.features?.energy?.value ?? 5),
      actions: {
        ...featureOverrides.energy.ui.actions,
        "energy.pick-feeling": ({ target, dispatch }) =>
          dispatch("energy:set", { value: energyPercentToScore(target.dataset.percent) }),
        "energy.set-percent-friendly": ({ target, dispatch }) =>
          dispatch("energy:set", { value: energyPercentToScore(target.value) })
      }
    }
  }
};
