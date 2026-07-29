import { Users, CalendarDays, ClipboardCheck } from "lucide-react";
import CreateEventForm from "./create-event-form";
import FfbbSync from "./ffbb-sync";
import type { UpcomingEvent } from "./family-data";

type Team = {
  id: string;
  name: string | null;
  category: string | null;
  ffbb_url: string | null;
};

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const eventTypeLabels: Record<string, string> = {
  MATCH: "Match",
  TRAINING: "Entraînement",
  OTHER: "Autre",
};

export default function CoachView({
  teams,
  eventsByTeam,
}: {
  teams: Team[];
  eventsByTeam: Record<string, UpcomingEvent[]>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-ubac-blue">
          <Users className="h-5 w-5" />
          <h3 className="font-semibold text-zinc-900">Mes équipes</h3>
        </div>
        <ul className="mt-2 flex flex-wrap gap-2">
          {teams.map((team) => (
            <li
              key={team.id}
              className="rounded-full bg-ubac-blue/10 px-3 py-1 text-sm font-medium text-ubac-blue"
            >
              {team.name}
              {team.category ? ` · ${team.category}` : ""}
            </li>
          ))}
        </ul>
      </div>

      <CreateEventForm teams={teams} />

      <div className="flex flex-col gap-3">
        {teams.map((team) => {
          const events = eventsByTeam[team.id] ?? [];
          return (
            <div
              key={team.id}
              className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center gap-2 text-ubac-blue">
                <CalendarDays className="h-5 w-5" />
                <h3 className="font-semibold text-zinc-900">
                  {team.name}
                  {team.category ? ` · ${team.category}` : ""}
                </h3>
              </div>
              {events.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">
                  Aucun événement à venir.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {events.map((event) => (
                    <li
                      key={event.id}
                      className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-zinc-700">
                        {event.title ??
                          eventTypeLabels[event.event_type ?? ""] ??
                          "Événement"}
                      </span>
                      <span className="text-zinc-500">
                        {formatEventDate(event.start_time)}
                        {event.location ? ` · ${event.location}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3">
                <FfbbSync teamId={team.id} initialUrl={team.ffbb_url} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-4 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ubac-blue/10 text-ubac-blue">
          <ClipboardCheck className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-semibold text-zinc-900">Présences</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Le statut détaillé des convocations de chaque match arrive
            bientôt ici.
          </p>
        </div>
      </div>
    </div>
  );
}
