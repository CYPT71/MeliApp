import { featureOverrides } from "./features-overrides.js";
import {
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
  { emoji: "🪫", label: "Vidée", percent: 8 },
  { emoji: "🫠", label: "En vrac", percent: 22 },
  { emoji: "🐢", label: "Au ralenti", percent: 36 },
  { emoji: "🌿", label: "Tranquille", percent: 50 },
  { emoji: "⚡", label: "En forme", percent: 64 },
  { emoji: "🚀", label: "À fond", percent: 80 },
  { emoji: "🤯", label: "Cerveau en feu", percent: 96 }
]);

const closestChoice = (percent) =>
  ENERGY_CHOICES.reduce((best, choice) =>
    Math.abs(choice.percent - percent) < Math.abs(best.percent - percent) ? choice : best
  );

const updatePreview = (slider) => {
  const percent = Number(slider.value);
  const root = slider.closest(".energy-feeling");
  if (!root) return;

  const mood = energyMood(percent);
  const active = closestChoice(percent);
  root.style.setProperty("--energy", `${percent}%`);
  slider.setAttribute("aria-valuetext", mood.label);

  for (const choice of root.querySelectorAll(".energy-feeling__choice")) {
    const selected = Number(choice.dataset.percent) === active.percent;
    choice.classList.toggle("is-current", selected);
    choice.setAttribute("aria-checked", selected ? "true" : "false");
  }

  const statusEmoji = root.querySelector(".energy-feeling__status-emoji");
  const statusLabel = root.querySelector(".energy-feeling__status-label");
  const statusGuidance = root.querySelector(".energy-feeling__status-guidance");
  if (statusEmoji) statusEmoji.textContent = mood.emoji;
  if (statusLabel) statusLabel.textContent = mood.label;
  if (statusGuidance) statusGuidance.textContent = energyGuidance(percent);
};

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
      text: "Choisis le symbole qui correspond le mieux à ton niveau d’énergie maintenant."
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
    node("div", { className: "energy-feeling__status", "aria-live": "polite" }, [
      node("span", { className: "energy-feeling__status-emoji", text: mood.emoji }),
      node("div", { className: "stack compact" }, [
        node("strong", { className: "energy-feeling__status-label", text: mood.label }),
        node("small", { className: "muted energy-feeling__status-guidance", text: energyGuidance(percent) })
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
        "energy.pick-feeling": ({ event, target, dispatch }) => {
          if (event.type !== "click") return;
          return dispatch("energy:set", { value: energyPercentToScore(target.dataset.percent) });
        },
        "energy.set-percent-friendly": ({ event, target, dispatch }) => {
          if (event.type === "input") {
            updatePreview(target);
            return;
          }
          if (event.type === "change") {
            return dispatch("energy:set", { value: energyPercentToScore(target.value) });
          }
        }
      }
    }
  }
};
