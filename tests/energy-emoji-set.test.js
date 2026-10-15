import test from "node:test";
import assert from "node:assert/strict";

import { ENERGY_CHOICES } from "../js/features-energy-friendly.js";
import { ENERGY_MOODS } from "../js/domain/energy.js";

test("energy choices use visually distinct emojis", () => {
  const emojis = ENERGY_CHOICES.map((choice) => choice.emoji);
  assert.equal(new Set(emojis).size, emojis.length);
});

test("highest energy state uses exploding brain", () => {
  assert.equal(ENERGY_CHOICES.at(-1)?.emoji, "🤯");
  assert.equal(ENERGY_MOODS.at(-1)?.emoji, "🤯");
});
