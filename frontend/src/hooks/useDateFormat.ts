import { useCallback } from "react";
import { useAuthStore } from "@/store/authStore";
import { formatDate as formatDateWithPref } from "@/lib/dateFormat";

/** Sessions persisted before this feature shipped have no `date_format` on `user`
 * (it didn't exist yet) — fall back to the same "dmy" default the backend uses for
 * new users, rather than assuming it's always present. */
export function useDateFormat() {
  const pref = useAuthStore((s) => s.user?.date_format ?? "dmy");
  return useCallback((iso: string | null | undefined) => formatDateWithPref(iso, pref), [pref]);
}
