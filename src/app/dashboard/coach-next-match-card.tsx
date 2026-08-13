import { CalendarDays, Check, Clock, MapPin, X } from "lucide-react";
import OpponentDisplay from "./opponent-display";
import NextMatchActions from "./next-match-actions";
import MatchTasksPanel from "./match-tasks-panel";
import AttendanceBadges from "./attendance-badges";
import RequestAttendanceButton from "./request-attendance-button";
import SalleBadge from "./salle-badge";
import { isMatchType, styleFor } from "./event-style";
import type { RosterPlayer, RsvpCounts, UpcomingEvent } from "./family-data";
import { formatPersonName } from "@/lib/names";
import { rolesForEventType } from "./event-tasks";
import { shouldOfferCarpool } from "./salles";
import type { CarpoolOffer, EventRoleType, EventTasksState } from "./event-tasks";

function fullName(p: RosterPlayer) {
  return formatPersonName(p.first_name, p.last_name);
}

export default function CoachNextMatchCard({
  teamName,
  event,
  counts,
  roster,
  tasks,
  carpool,
  roles,
  rsvpStatusByKey = {},
  rsvpReasonByKey = {},
}: {
  teamName: string;
  event: UpcomingEvent | null;
  counts: RsvpCounts | null;
  roster: RosterPlayer[];
  tasks: EventTasksState;
  carpool: CarpoolOffer[];
  roles: EventRoleType[];
  // Réponses de l'effectif sur cet événement, clé "eventId:playerId".
  rsvpStatusByKey?: Record<string, string>;
  rsvpReasonByKey?: Record<string, string | null>;
}) {
  const style = event ? styleFor(event.event_type) : null;

  return (
    <div
      className={`rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm ${
        style ? `border-l-4 ${style.border}` : ""
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-ubac-blue">
        {teamName}
      </p>

      {event && style ? (
        <>
          {/* En-tête : de quoi il s'agit à gauche, et à droite le geste du
              jour J — l'appel — plutôt qu'enfoui en bas de carte. */}
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span
                className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}
              >
                {style.label}
              </span>
              {isMatchType(event.event_type) ? (
                <OpponentDisplay title={event.title} />
              ) : (
                <h3 className="text-lg font-bold text-zinc-900">
                  {event.title ?? style.label}
                </h3>
              )}
            </div>
            {/* Le coach ne pointe plus à la place des familles : il leur
                demande de répondre, et un bandeau s'affiche dans leur
                espace tant que la réponse manque. */}
            <RequestAttendanceButton
              eventId={event.id}
              requestedAt={event.attendance_requested_at ?? null}
              pendingCount={counts?.pending ?? 0}
              teamName={teamName}
              startTime={event.start_time}
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-zinc-700">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 shrink-0 text-zinc-400" />
              {new Date(event.start_time).toLocaleString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {event.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0 text-zinc-400" />
                {event.location}
              </span>
            )}
            {event.salle && <SalleBadge salle={event.salle} />}
          </div>

          {counts && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                <Check className="h-3 w-3 shrink-0" />
                {counts.present} présent{counts.present > 1 ? "s" : ""}
              </span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">
                <X className="h-3 w-3 shrink-0" />
                {counts.absent} absent{counts.absent > 1 ? "s" : ""}
              </span>
              {counts.late > 0 && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  <Clock className="h-3 w-3 shrink-0" />
                  {counts.late} en retard
                </span>
              )}
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                <Clock className="h-3 w-3 shrink-0" />
                {counts.pending} en attente
              </span>
            </div>
          )}

          <NextMatchActions
            location={event.location}
            context={event.title ?? "match"}
            showCarpool={shouldOfferCarpool(event)}
          />

          {/* Le détail des réponses remplace la liste de prénoms séparés
              par des virgules : elle ne disait pas qui avait répondu quoi. */}
          <div className="mt-3 border-t border-zinc-100 pt-3">
            <AttendanceBadges
              eventId={event.id}
              roster={roster}
              statusByKey={rsvpStatusByKey}
              reasonByKey={rsvpReasonByKey}
            />
          </div>

          <MatchTasksPanel
            eventId={event.id}
            roster={roster.map((p) => ({ id: p.id, name: fullName(p) }))}
            myPlayerIds={[]}
            canAssignAnyone
            initialTasks={tasks}
            initialCarpool={carpool}
            roles={rolesForEventType(roles, event.event_type)}
            showCarpool={shouldOfferCarpool(event)}
          />
        </>
      ) : (
        <p className="mt-1 text-sm text-zinc-500">Aucun événement à venir.</p>
      )}
    </div>
  );
}
