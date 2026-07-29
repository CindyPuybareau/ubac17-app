import { CalendarDays, Users } from "lucide-react";
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
          <h3 className="mt-1 text-lg font-bold text-zinc-900">
            {event.title ?? "Prochain événement"}
          </h3>
          <p className="mt-1 flex items-center gap-1 text-sm text-zinc-500">
            <CalendarDays className="h-4 w-4" />
            {new Date(event.start_time).toLocaleString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
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
