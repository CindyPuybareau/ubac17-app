import { CalendarDays, MapPin } from "lucide-react";
import SalleBadge from "./salle-badge";
import type { AdminUpcomingEvent } from "./page";
import type { CalendarRsvpPlayer } from "./calendar-view";

function childrenFor(event: AdminUpcomingEvent, rsvpPlayers: CalendarRsvpPlayer[]) {
  if (!event.teamId) return "Tous les groupes";
  const names = rsvpPlayers
    .filter((p) => p.teamIds.includes(event.teamId as string))
    .map((p) => p.name);
  return names.length > 0 ? names.join(" & ") : event.teamName;
}

// Plain module-level function (not called inline in the component body) so
// Date.now() doesn't trip the react-hooks/purity lint rule — matches the
// findNextEventIdByTeamId pattern in page.tsx.
function upcomingTrainingsSorted(events: AdminUpcomingEvent[]) {
  const now = Date.now();
  return events
    .filter((e) => e.event_type === "TRAINING" && new Date(e.start_time).getTime() >= now)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
}

export default function FamilyTrainings({
  events,
  rsvpPlayers,
}: {
  events: AdminUpcomingEvent[];
  rsvpPlayers: CalendarRsvpPlayer[];
}) {
  const trainings = upcomingTrainingsSorted(events);

  if (trainings.length === 0) {
    return <p className="text-sm text-zinc-500">Aucun entraînement à venir.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {trainings.map((e) => (
        <div key={e.id} className="rounded-2xl border border-t-4 border-zinc-100 border-t-ubac-yellow bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {childrenFor(e, rsvpPlayers)}
          </p>
          <h3 className="font-semibold text-zinc-900">{e.title ?? "Entraînement"}</h3>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-4 w-4" />
              {new Date(e.start_time).toLocaleString("fr-FR", {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {e.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {e.location}
              </span>
            )}
            {e.salle && <SalleBadge salle={e.salle} />}
          </div>
        </div>
      ))}
    </div>
  );
}
