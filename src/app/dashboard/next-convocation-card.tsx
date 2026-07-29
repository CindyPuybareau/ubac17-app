import { CalendarDays, MapPin } from "lucide-react";
import RsvpButtons from "./rsvp-buttons";
import type { UpcomingEvent } from "./family-data";

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NextConvocationCard({
  playerName,
  playerId,
  event,
  status,
}: {
  playerName: string;
  playerId: string;
  event: UpcomingEvent;
  status: string;
}) {
  return (
    <div className="rounded-2xl border border-ubac-yellow/40 bg-ubac-yellow/5 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ubac-yellow-dark">
        Prochaine convocation · {playerName}
      </p>
      <h3 className="mt-1 text-lg font-bold text-zinc-900">
        {event.title ??
          (event.event_type === "MATCH" ? "Match" : "Entraînement")}
      </h3>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
        <span className="flex items-center gap-1">
          <CalendarDays className="h-4 w-4" />
          {formatEventDate(event.start_time)}
        </span>
        {event.location && (
          <span className="flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {event.location}
          </span>
        )}
      </div>
      <div className="mt-3">
        <RsvpButtons
          eventId={event.id}
          playerId={playerId}
          currentStatus={status}
        />
      </div>
    </div>
  );
}
