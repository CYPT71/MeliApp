import test from "node:test";
import assert from "node:assert/strict";

import { ENERGY_CHOICES } from "../js/features-energy-friendly.js";

test("friendly energy selector exposes human labels without visible numbers", () => {
  assert.equal(ENERGY_CHOICES.length, 7);
  for (const choice of ENERGY_CHOICES) {
    assert.match(choice.emoji, /\p{Extended_Pictographic}/u);
    assert.doesNotMatch(choice.label, /\d/);
    assert.equal(typeof choice.percent, "number");
  }
});

test("energy choices progress from depleted to full without numeric wording", () => {
  assert.equal(ENERGY_CHOICES[0].label, "Vidée");
  assert.equal(ENERGY_CHOICES.at(-1).label, "Cerveau en feu");
  assert.equal(ENERGY_CHOICES.at(-1).emoji, "🤯");
  assert.equal(new Set(ENERGY_CHOICES.map((choice) => choice.emoji)).size, ENERGY_CHOICES.length);
  for (let index = 1; index < ENERGY_CHOICES.length; index += 1) {
    assert.ok(ENERGY_CHOICES[index].percent > ENERGY_CHOICES[index - 1].percent);
  }
});
