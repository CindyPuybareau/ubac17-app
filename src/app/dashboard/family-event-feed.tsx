"use client";

import { CalendarDays, MapPin, Navigation } from "lucide-react";
import { formatEventTime, homeAwayLabel, isMatchType, styleFor } from "./calendar-view";
import OpponentDisplay from "./opponent-display";
import RsvpControl from "./rsvp-control";
import SalleBadge from "./salle-badge";
import type { AdminUpcomingEvent } from "./page";
import type { CalendarRsvpPlayer } from "./calendar-view";

// Fonction ordinaire : la lecture de l'heure courante reste hors du corps
// du composant (règle react-hooks/purity, même motif que family-data.ts).
function upcomingSorted(events: AdminUpcomingEvent[]) {
  const now = Date.now();
  return events
    .filter((e) => new Date(e.start_time).getTime() >= now)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

// Le lieu tel qu'il servira à l'itinéraire : la salle nomme un gymnase du
// club, le lieu une adresse libre. Les deux valent une recherche Maps.
function mapsQuery(event: AdminUpcomingEvent) {
  const parts = [event.salle, event.location].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export default function FamilyEventFeed({
  events,
  players,
  rsvpStatusByKey,
  rsvpReasonByKey = {},
}: {
  events: AdminUpcomingEvent[];
  // Enfants concernés : déjà filtrés par le sélecteur d'enfant en amont.
  players: CalendarRsvpPlayer[];
  rsvpStatusByKey: Record<string, string>;
  rsvpReasonByKey?: Record<string, string | null>;
}) {
  const upcoming = upcomingSorted(events);

  if (upcoming.length === 0) {
    return <p className="text-sm text-zinc-500">Aucun rassemblement à venir.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {upcoming.map((e) => {
        const style = styleFor(e.event_type);
        // Un événement club (teamId null) concerne tout le monde.
        const concerned = e.teamId
          ? players.filter((p) => p.teamIds.includes(e.teamId as string))
          : players;
        const homeAway = isMatchType(e.event_type) ? homeAwayLabel(e.isHome) : null;
        const query = mapsQuery(e);

        return (
          <div
            key={e.id}
            className={`flex flex-col gap-3 rounded-2xl border border-zinc-100 border-l-4 bg-white p-4 shadow-sm ${style.border}`}
          >
            <div className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}
                >
                  {style.label}
                </span>
                {homeAway && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600">
                    {homeAway}
                  </span>
                )}
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {e.teamName}
                </span>
              </span>
              {isMatchType(e.event_type) ? (
                <OpponentDisplay title={e.title} size="sm" />
              ) : (
                <h3 className="font-semibold text-zinc-900">{e.title ?? style.label}</h3>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-4 w-4 shrink-0" />
                {new Date(e.start_time).toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
                , {formatEventTime(e.start_time, e.end_time)}
              </span>
              {e.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4 shrink-0" />
                  {e.location}
                </span>
              )}
              {e.salle && <SalleBadge salle={e.salle} />}
            </div>

            {query && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`}
                target="_blank"
                rel="noreferrer"
                className="flex w-fit items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
              >
                <Navigation className="h-3.5 w-3.5 shrink-0" />
                Itinéraire
              </a>
            )}

            {concerned.length > 0 ? (
              <div className="flex flex-col gap-3 border-t border-zinc-100 pt-3">
                {concerned.map((p) => (
                  <RsvpControl
                    key={p.id}
                    eventId={e.id}
                    playerId={p.id}
                    // Le nom n'a d'intérêt que si plusieurs enfants sont
                    // concernés par le même rassemblement.
                    playerName={concerned.length > 1 ? p.name : undefined}
                    currentStatus={rsvpStatusByKey[`${e.id}:${p.id}`] ?? "PENDING"}
                    currentReason={rsvpReasonByKey[`${e.id}:${p.id}`] ?? null}
                  />
                ))}
              </div>
            ) : (
              <p className="border-t border-zinc-100 pt-3 text-xs text-zinc-400">
                Aucun de tes enfants n&apos;est convoqué sur ce rassemblement.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
