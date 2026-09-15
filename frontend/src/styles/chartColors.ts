/**
 * Hex mirrors of the `brand`/`jira` tokens in tailwind.config.js, for
 * libraries (Recharts) that need literal color values instead of classes.
 */
export const chartColors = {
  blue: "#0c66e4",
  blueDark: "#0055cc",
  blueSoft: "#4c9aff",
  purple: "#8270db",
  green: "#57d9a3",
  greenText: "#216e4e",
  orange: "#e56910",
  red: "#e2483d",
  text: "#172b4d",
  textSub: "#626f86",
  border: "#dcdfe4",
  panel: "#fafbfc",
} as const;

export const chartSeriesPalette = [
  chartColors.blue,
  chartColors.green,
  chartColors.purple,
  chartColors.orange,
  chartColors.red,
] as const;
