"use client";

import { CalendarDays, MapPin } from "lucide-react";
import { formatEventTime, homeAwayLabel, isMatchType, styleFor } from "./calendar-view";
import ItineraryButton from "./itinerary-button";
import OpponentDisplay from "./opponent-display";
import RsvpControl from "./rsvp-control";
import SalleBadge from "./salle-badge";
import { venueQuery } from "./salles";
import type { AdminUpcomingEvent } from "./page";

// Carte d'événement interactive partagée entre l'onglet "Prochains
// Événements" (family-event-feed.tsx, tous enfants confondus) et l'onglet
// "Mon Équipe" (family-team-card.tsx, un enfant à la fois) : même source
// d'événements, même statut RSVP, donc même carte plutôt que deux rendus
// qui pourraient diverger.
export default function FamilyEventCard({
  event: e,
  concerned,
  rsvpStatusByKey,
}: {
  event: AdminUpcomingEvent;
  concerned: { id: string; name: string }[];
  rsvpStatusByKey: Record<string, string>;
}) {
  const style = styleFor(e.event_type);
  const homeAway = isMatchType(e.event_type) ? homeAwayLabel(e.isHome) : null;
  const query = venueQuery(e);

  return (
    <div
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

      <ItineraryButton query={query} />

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
}
