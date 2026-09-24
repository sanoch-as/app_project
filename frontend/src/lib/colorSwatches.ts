/** Shared preset palettes for text color, highlight, and table-cell fill —
 * one curated set reused everywhere a color needs picking, instead of a
 * full color-wheel input (matches the "grid of swatches" pattern from the
 * reference screenshot, not a from-scratch color engine). */
export const COLOR_SWATCHES: { label: string; value: string }[] = [
  { label: "Blanco", value: "#ffffff" },
  { label: "Negro", value: "#172b4d" },
  { label: "Gris", value: "#626f86" },
  { label: "Rojo", value: "#e2483d" },
  { label: "Naranjo", value: "#e56910" },
  { label: "Amarillo", value: "#e2b203" },
  { label: "Verde", value: "#216e4e" },
  { label: "Celeste", value: "#0c66e4" },
  { label: "Azul", value: "#0055cc" },
  { label: "Morado", value: "#8270db" },
  { label: "Rosado", value: "#cd519d" },
];

export const HIGHLIGHT_SWATCHES: { label: string; value: string }[] = [
  { label: "Rojo", value: "#ffebe6" },
  { label: "Naranjo", value: "#fff0b3" },
  { label: "Amarillo", value: "#fffae6" },
  { label: "Verde", value: "#dcfff1" },
  { label: "Celeste", value: "#e9f2ff" },
  { label: "Morado", value: "#eae6ff" },
  { label: "Rosado", value: "#ffecf8" },
  { label: "Gris", value: "#f1f2f4" },
];
