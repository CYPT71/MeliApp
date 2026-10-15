import test from "node:test";
import assert from "node:assert/strict";

import {
  energyGuidance,
  energyMood,
  energyPercentToScore,
  energyScoreToPercent
} from "../js/domain/energy.js";

test("energy UI maps internal 1-10 score to a 0-100 gauge", () => {
  assert.equal(energyScoreToPercent(1), 10);
  assert.equal(energyScoreToPercent(5), 50);
  assert.equal(energyScoreToPercent(10), 100);
});

test("energy gauge maps 0-100 back to planner score without changing planner contracts", () => {
  assert.equal(energyPercentToScore(0), 1);
  assert.equal(energyPercentToScore(30), 3);
  assert.equal(energyPercentToScore(67), 6.7);
  assert.equal(energyPercentToScore(100), 10);
});

test("energy mood follows low to high visual states", () => {
  assert.equal(energyMood(5).emoji, "😠");
  assert.equal(energyMood(50).emoji, "😕");
  assert.equal(energyMood(95).emoji, "😄");
});

test("energy guidance becomes more ambitious as energy rises", () => {
  assert.match(energyGuidance(10), /récupération/i);
  assert.match(energyGuidance(90), /travail profond/i);
});
