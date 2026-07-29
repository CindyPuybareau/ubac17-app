import { CalendarDays, MapPin, Users } from "lucide-react";
import OpponentDisplay from "./opponent-display";
import type { RosterPlayer, RsvpCounts, UpcomingEvent } from "./family-data";

export default function CoachNextMatchCard({
  teamName,
  event,
  counts,
  roster,
}: {
  teamName: string;
  event: UpcomingEvent | null;
  counts: RsvpCounts | null;
  roster: RosterPlayer[];
}) {
  return (
    <div className="rounded-2xl border border-ubac-blue/30 bg-ubac-blue/5 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ubac-blue">
        {teamName}
      </p>

      {event ? (
        <>
          <div className="mt-1">
            <OpponentDisplay title={event.title} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-4 w-4" />
              {new Date(event.start_time).toLocaleString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {event.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {event.location}
              </span>
            )}
          </div>
          {counts && (
            <p className="mt-2 text-sm font-medium text-zinc-700">
              {counts.present} Présents · {counts.pending} En attente
              {counts.absent > 0 ? ` · ${counts.absent} Absents` : ""}
              {counts.late > 0 ? ` · ${counts.late} Retards` : ""}
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm text-zinc-500">Aucun événement à venir.</p>
      )}

      <div className="mt-3 flex items-start gap-1.5 text-sm text-zinc-500">
        <Users className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {roster
            .map((p) => p.first_name)
            .filter(Boolean)
            .join(", ") || "Aucun joueur dans l'équipe"}
        </span>
      </div>
    </div>
  );
}
