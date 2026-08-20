import { CalendarDays, MapPin, StickyNote } from "lucide-react";
import RsvpButtons from "./rsvp-buttons";
import OpponentDisplay from "./opponent-display";
import NextMatchActions from "./next-match-actions";
import MatchTasksPanel from "./match-tasks-panel";
import VolunteerNeedsPanel from "./volunteer-needs-panel";
import OrganisationCard from "./organisation-card";
import type { UpcomingEvent } from "./family-data";
import { isMatchType } from "./event-style";
import { rolesForEventType } from "./event-tasks";
import { shouldOfferCarpool, venueQuery } from "./salles";
import type { CarpoolOffer, EventRoleType, EventTasksState } from "./event-tasks";
import type { VolunteerNeed } from "./event-volunteer-needs";

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
  volunteerNeeds = [],
}: {
  playerName: string;
  playerId: string;
  event: UpcomingEvent;
  status: string;
  roster: { id: string; name: string }[];
  tasks: EventTasksState;
  carpool: CarpoolOffer[];
  roles: EventRoleType[];
  volunteerNeeds?: VolunteerNeed[];
}) {
  return (
    <div className="rounded-2xl border border-ubac-yellow/40 bg-ubac-yellow/5 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ubac-yellow-dark">
        Prochaine convocation · {playerName}
      </p>
      <div className="mt-1">
        {isMatchType(event.event_type) ?  (
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
      {event.notes && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
          <StickyNote className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
          {event.notes}
        </p>
      )}
      <div className="mt-3">
        <RsvpButtons
          eventId={event.id}
          playerId={playerId}
          currentStatus={status}
        />
      </div>
      <NextMatchActions venue={venueQuery(event)} />
      {(() => {
        const applicableRoles = rolesForEventType(roles, event.event_type);
        const hasTasks = applicableRoles.length > 0 || shouldOfferCarpool(event);
        const hasNeeds = volunteerNeeds.length > 0;
        // MatchTasksPanel et VolunteerNeedsPanel regroupés sous un seul
        // titre "Organisation" (retour de Cindy du 2026-08-20) — même
        // correctif que calendar-view.tsx/coach-next-match-card.tsx.
        if (!hasTasks && !hasNeeds) return null;
        return (
          <OrganisationCard>
            {hasTasks && (
              <MatchTasksPanel
                eventId={event.id}
                eventDate={event.start_time}
                roster={roster}
                myPlayerIds={[playerId]}
                canAssignAnyone={false}
                initialTasks={tasks}
                initialCarpool={carpool}
                roles={applicableRoles}
                showCarpool={shouldOfferCarpool(event)}
                bare
              />
            )}
            {hasNeeds && (
              <VolunteerNeedsPanel
                eventId={event.id}
                needs={volunteerNeeds}
                myPlayerIds={[playerId]}
                canManage={false}
                bare
              />
            )}
          </OrganisationCard>
        );
      })()}
    </div>
  );
}
