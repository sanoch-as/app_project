import type { UpcomingMilestone } from "@/types/api";

export function UpcomingMilestonesList({ milestones }: { milestones: UpcomingMilestone[] }) {
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Upcoming milestones</h3>
      {milestones.length === 0 ? (
        <p className="text-sm text-slate-400">No upcoming milestones.</p>
      ) : (
        <ul className="space-y-2">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-slate-700">
                <span aria-hidden="true">🔶</span>
                {m.name}
              </span>
              <span className="text-xs text-slate-500">{m.start_date}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
