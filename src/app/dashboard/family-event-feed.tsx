"use client";

import FamilyEventCard from "./family-event-card";
import type { AdminUpcomingEvent } from "./page";
import type { CalendarRsvpPlayer } from "./calendar-view";

// Fonction ordinaire : la lecture de l'heure courante reste hors du corps
// du composant (règle react-hooks/purity, même motif que family-data.ts).
// Exportée : family-team-card.tsx s'en sert pour trier les événements
// d'une seule équipe avec la même règle plutôt que d'en réécrire une.
export function upcomingSorted(events: AdminUpcomingEvent[]) {
  const now = Date.now();
  return events
    .filter((e) => new Date(e.start_time).getTime() >= now)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export default function FamilyEventFeed({
  events,
  players,
  rsvpStatusByKey,
}: {
  events: AdminUpcomingEvent[];
  // Enfants concernés : déjà filtrés par le sélecteur d'enfant en amont.
  players: CalendarRsvpPlayer[];
  rsvpStatusByKey: Record<string, string>;
}) {
  const upcoming = upcomingSorted(events);

  if (upcoming.length === 0) {
    return <p className="text-sm text-zinc-500">Aucun rassemblement à venir.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {upcoming.map((e) => {
        // Un événement club (teamId null) concerne tout le monde.
        const concerned = e.teamId
          ? players.filter((p) => p.teamIds.includes(e.teamId as string))
          : players;
        return (
          <FamilyEventCard
            key={e.id}
            event={e}
            concerned={concerned}
            rsvpStatusByKey={rsvpStatusByKey}
          />
        );
      })}
    </div>
  );
}
