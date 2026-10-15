// Microsoft Graph outlookCategory preset0–preset24, in Outlook palette order.
export const OUTLOOK_CATEGORY_COLORS = Object.freeze({
  preset0: "#e74856", preset1: "#ff8c00", preset2: "#a0522d", preset3: "#fff100", preset4: "#47d041",
  preset5: "#30d5c8", preset6: "#b5bd00", preset7: "#4f9bed", preset8: "#a67be8", preset9: "#d95b96",
  preset10: "#a7b9c7", preset11: "#6b7b8d", preset12: "#bfbfbf", preset13: "#757575", preset14: "#333333",
  preset15: "#a4262c", preset16: "#c45100", preset17: "#694026", preset18: "#b59b00", preset19: "#0b6a0b",
  preset20: "#006666", preset21: "#6b7000", preset22: "#004e8c", preset23: "#5c2d91", preset24: "#8c1d53"
});

export const categoryPresentation = (event) => {
  const names = (event.categories ?? []).filter((name) => typeof name === "string");
  const category = (event.categoryColors ?? []).find(({ color }) => Object.hasOwn(OUTLOOK_CATEGORY_COLORS, color));
  if (!category) return { label: names.join(", "), style: "" };
  const color = OUTLOOK_CATEGORY_COLORS[category.color];
  const rgb = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  const luminance = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  const ink = luminance > .179 ? "#101820" : "#ffffff";
  return { label: names.join(", "), style: `--category-color:${color};--category-ink:${ink};` };
};
