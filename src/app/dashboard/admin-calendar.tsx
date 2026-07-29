import { CalendarDays, MapPin } from "lucide-react";
import OpponentDisplay from "./opponent-display";
import type { AdminUpcomingEvent } from "./page";

const eventTypeLabels: Record<string, string> = {
  MATCH: "Match",
  TRAINING: "Entraînement",
  OTHER: "Autre",
};

export default function AdminCalendar({
  events,
}: {
  events: AdminUpcomingEvent[];
}) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Aucun événement à venir pour le moment sur l&apos;ensemble du club.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex flex-col gap-1 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {event.teamName}
            </span>
            {event.event_type === "MATCH" ? (
              <OpponentDisplay title={event.title} size="sm" />
            ) : (
              <span className="font-semibold text-zinc-900">
                {event.title ?? eventTypeLabels[event.event_type ?? ""] ?? "Événement"}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-4 w-4" />
              {new Date(event.start_time).toLocaleString("fr-FR", {
                weekday: "short",
                day: "numeric",
                month: "short",
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
        </div>
      ))}
    </div>
  );
}
