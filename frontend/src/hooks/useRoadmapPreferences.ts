import { useCallback, useState } from "react";

export type RoadmapScale = "weekly" | "biweekly" | "monthly";

interface RoadmapPreferences {
  scale: RoadmapScale;
  showMilestones: boolean;
  showToday: boolean;
}

const DEFAULT_PREFERENCES: RoadmapPreferences = {
  scale: "weekly",
  showMilestones: true,
  showToday: true,
};
const VALID_SCALES: RoadmapScale[] = ["weekly", "biweekly", "monthly"];

function readPreferences(storageKey: string): RoadmapPreferences {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<RoadmapPreferences>;
    return {
      scale: VALID_SCALES.includes(parsed.scale as RoadmapScale)
        ? (parsed.scale as RoadmapScale)
        : DEFAULT_PREFERENCES.scale,
      showMilestones:
        typeof parsed.showMilestones === "boolean"
          ? parsed.showMilestones
          : DEFAULT_PREFERENCES.showMilestones,
      showToday:
        typeof parsed.showToday === "boolean" ? parsed.showToday : DEFAULT_PREFERENCES.showToday,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function writePreferences(storageKey: string, preferences: RoadmapPreferences): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(preferences));
  } catch {
    // Private browsing / storage disabled / quota exceeded — the roadmap's
    // scale and milestone-visibility just won't persist across reloads.
  }
}

/** Per-browser display preferences for the Resumen tab's Roadmap widget
 * (time scale + whether milestone labels and the "HOY" marker are shown).
 * Which tasks appear on the roadmap at all (`Task.on_timeline`) is real,
 * server-persisted data — this hook only covers the purely visual toggles
 * on top of it. */
export function useRoadmapPreferences(projectId: string) {
  const storageKey = `pmp:roadmap-prefs:${projectId}`;
  const [preferences, setPreferences] = useState<RoadmapPreferences>(() =>
    readPreferences(storageKey),
  );

  const setScale = useCallback(
    (scale: RoadmapScale) => {
      setPreferences((prev) => {
        const next = { ...prev, scale };
        writePreferences(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const setShowMilestones = useCallback(
    (showMilestones: boolean) => {
      setPreferences((prev) => {
        const next = { ...prev, showMilestones };
        writePreferences(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const setShowToday = useCallback(
    (showToday: boolean) => {
      setPreferences((prev) => {
        const next = { ...prev, showToday };
        writePreferences(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  return {
    scale: preferences.scale,
    showMilestones: preferences.showMilestones,
    showToday: preferences.showToday,
    setScale,
    setShowMilestones,
    setShowToday,
  };
}
