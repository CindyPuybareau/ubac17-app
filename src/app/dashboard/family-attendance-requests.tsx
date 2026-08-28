"use client";

import { BellRing } from "lucide-react";
import { formatEventTime, styleFor } from "./event-style";
import RsvpControl from "./rsvp-control";
import SalleBadge from "./salle-badge";
import type { AdminUpcomingEvent } from "./page";
import type { CalendarRsvpPlayer } from "./calendar-view";

// Fonction ordinaire : la lecture de l'heure courante reste hors du corps
// du composant (règle react-hooks/purity).
function pendingRequests(
  events: AdminUpcomingEvent[],
  players: CalendarRsvpPlayer[],
  statusByKey: Record<string, string>
) {
  const now = Date.now();
  return events
    .filter((e) => e.attendanceRequestedAt !== null)
    .filter((e) => new Date(e.start_time).getTime() >= now)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((event) => {
      // Un événement club (teamId et targetTeamIds null) concerne toute la
      // famille ; un événement ciblant des équipes précises via
      // targetTeamIds (retour d'audit du 28/08, même bug que
      // respondingPlayers de calendar-view.tsx) ne doit concerner que les
      // enfants de CES équipes-là, pas toute la famille.
      const concerned =
        event.teamId || event.targetTeamIds
          ? players.filter(
              (p) =>
                (event.teamId && p.teamIds.includes(event.teamId)) ||
                (event.targetTeamIds?.some((id) => p.teamIds.includes(id)) ?? false)
            )
          : players;
      // Seuls les enfants sans réponse : une fois répondu, la demande est
      // satisfaite et le bandeau n'a plus lieu d'insister.
      const waiting = concerned.filter((p) => {
        const status = statusByKey[`${event.id}:${p.id}`];
        return status !== "PRESENT" && status !== "ABSENT" && status !== "LATE";
      });
      return { event, waiting };
    })
    .filter((r) => r.waiting.length > 0);
}

// Le coach a demandé les présences : la famille doit le voir en ouvrant
// l'app, pas le découvrir en fouillant un onglet. D'où un bandeau en tête
// de page, qui disparaît de lui-même une fois la réponse donnée.
export default function FamilyAttendanceRequests({
  events,
  players,
  statusByKey,
}: {
  events: AdminUpcomingEvent[];
  players: CalendarRsvpPlayer[];
  statusByKey: Record<string, string>;
}) {
  const requests = pendingRequests(events, players, statusByKey);

  if (requests.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-ubac-yellow/50 bg-ubac-yellow/10 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-navy">
        <BellRing className="h-4 w-4 shrink-0" />
        {requests.length === 1
          ? "Le coach attend ta réponse"
          : `Le coach attend ta réponse sur ${requests.length} rassemblements`}
      </p>

      {requests.map(({ event, waiting }) => {
        const style = styleFor(event.event_type);
        return (
          <div
            key={event.id}
            className="flex flex-col gap-2 rounded-xl bg-white px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${style.badge}`}
              >
                {style.label}
              </span>
              <span className="text-sm font-semibold text-zinc-900">
                {event.teamName}
              </span>
              <span className="text-sm text-zinc-600">
                {new Date(event.start_time).toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
                , {formatEventTime(event.start_time, event.end_time)}
              </span>
              {event.salle && <SalleBadge salle={event.salle} />}
            </div>

            {waiting.map((p) => (
              <RsvpControl
                key={p.id}
                eventId={event.id}
                playerId={p.id}
                // Le nom n'a d'intérêt que si plusieurs enfants sont
                // attendus sur le même rassemblement.
                playerName={waiting.length > 1 ? p.name : undefined}
                currentStatus="PENDING"
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
