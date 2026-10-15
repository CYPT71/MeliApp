import test from "node:test";
import assert from "node:assert/strict";
import { categoryPresentation, OUTLOOK_CATEGORY_COLORS } from "../js/domain/outlook-categories.js";

test("the 25 Outlook category presets have distinct colors", () => {
  assert.equal(Object.keys(OUTLOOK_CATEGORY_COLORS).length, 25);
  assert.equal(new Set(Object.values(OUTLOOK_CATEGORY_COLORS)).size, 25);
});

test("category labels include all names and first known preset determines the event color", () => {
  const result = categoryPresentation({ categories: ["Travail", "Santé"], categoryColors: [{ name: "Travail", color: "preset0" }, { name: "Santé", color: "preset4" }] });
  assert.equal(result.label, "Travail, Santé");
  assert.ok(result.style.includes(OUTLOOK_CATEGORY_COLORS.preset0));
});

test("unknown and absent category colors retain neutral rendering without inserting arbitrary styles", () => {
  assert.equal(categoryPresentation({}).style, "");
  assert.equal(categoryPresentation({ categories: ["Sans couleur"], categoryColors: [{ name: "Sans couleur", color: "none" }] }).style, "");
  assert.equal(categoryPresentation({ categoryColors: [{ color: "red;background:url(example)" }] }).style, "");
});

test("dark and light categories use contrasting text", () => {
  assert.match(categoryPresentation({ categoryColors: [{ color: "preset14" }] }).style, /--category-ink:#ffffff/);
  assert.match(categoryPresentation({ categoryColors: [{ color: "preset3" }] }).style, /--category-ink:#101820/);
});
