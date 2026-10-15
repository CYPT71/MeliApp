import test from "node:test";
import assert from "node:assert/strict";
import { formatYmDhmsDuration, parseYmDhmsDuration } from "../js/features-item-inspector.js";

test("la syntaxe YMdhms convertit les durées lisibles en minutes", () => {
  assert.equal(parseYmDhmsDuration("45m"), 45);
  assert.equal(parseYmDhmsDuration("2h30m"), 150);
  assert.equal(parseYmDhmsDuration("1d"), 1440);
  assert.equal(parseYmDhmsDuration("90s"), 15);
});

test("la durée compacte est réaffichée avec la syntaxe YMdhms", () => {
  assert.equal(formatYmDhmsDuration(45), "45m");
  assert.equal(formatYmDhmsDuration(150), "2h30m");
  assert.equal(formatYmDhmsDuration(1440), "1d");
});

test("une durée invalide garde la valeur précédente et la fenêtre reste bornée", () => {
  assert.equal(parseYmDhmsDuration("n'importe quoi", 180), 180);
  assert.equal(parseYmDhmsDuration("2d", 120), 1440);
});
