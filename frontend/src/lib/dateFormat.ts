import type { DateFormat } from "@/types/api";

/** Formats an ISO "YYYY-MM-DD" date string per the user's preference. Pass-through
 * (with the raw value) for anything that isn't a plain ISO date — never throws. */
export function formatDate(iso: string | null | undefined, pref: DateFormat): string {
  if (!iso) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  return pref === "dmy" ? `${day}/${month}/${year}` : `${year}-${month}-${day}`;
}
