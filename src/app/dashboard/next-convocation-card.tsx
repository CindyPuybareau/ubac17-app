import { CalendarDays, MapPin } from "lucide-react";
import RsvpButtons from "./rsvp-buttons";
import OpponentDisplay from "./opponent-display";
import NextMatchActions from "./next-match-actions";
import MatchTasksPanel from "./match-tasks-panel";
import type { UpcomingEvent } from "./family-data";
import { rolesForEventType } from "./event-tasks";
import { shouldOfferCarpool } from "./salles";
import type { CarpoolOffer, EventRoleType, EventTasksState } from "./event-tasks";

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
  roster,
  tasks,
  carpool,
  roles,
}: {
  playerName: string;
  playerId: string;
  event: UpcomingEvent;
  status: string;
  roster: { id: string; name: string }[];
  tasks: EventTasksState;
  carpool: CarpoolOffer[];
  roles: EventRoleType[];
}) {
  return (
    <div className="rounded-2xl border border-ubac-yellow/40 bg-ubac-yellow/5 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ubac-yellow-dark">
        Prochaine convocation · {playerName}
      </p>
      <div className="mt-1">
        {event.event_type === "MATCH" ? (
          <OpponentDisplay title={event.title} />
        ) : (
          <h3 className="text-lg font-bold text-zinc-900">
            {event.title ?? "Entraînement"}
          </h3>
        )}
      </div>
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
      <NextMatchActions
        location={event.location}
        context={event.title ?? "match"}
        showCarpool={shouldOfferCarpool(event)}
      />
      <MatchTasksPanel
        eventId={event.id}
        roster={roster}
        myPlayerIds={[playerId]}
        canAssignAnyone={false}
        initialTasks={tasks}
        initialCarpool={carpool}
        roles={rolesForEventType(roles, event.event_type)}
        showCarpool={shouldOfferCarpool(event)}
      />
    </div>
  );
}
