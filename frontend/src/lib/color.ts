// Same tone family Jira/Atlassian avatars use for name-derived colors.
const PALETTE = [
  "#0c66e4",
  "#8270db",
  "#de350b",
  "#e56910",
  "#216e4e",
  "#0055cc",
  "#5e4db2",
  "#ae2e24",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Deterministic color for any label — used by Avatar and square project icons. */
export function stringToColor(value: string): string {
  return PALETTE[hashString(value || "?") % PALETTE.length];
}
