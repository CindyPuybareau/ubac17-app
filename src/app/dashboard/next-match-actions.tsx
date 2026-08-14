"use client";

import ItineraryButton from "./itinerary-button";

// Le covoiturage n'est plus un mailto ici : proposer des places, en
// réserver et voir qui part avec qui se fait désormais dans le panneau
// Organisation Parents (match-tasks-panel.tsx), avec de vraies places
// comptées plutôt qu'un e-mail informel qui ne synchronisait rien.
export default function NextMatchActions({
  venue,
}: {
  // Adresse déjà résolue par venueQuery : une salle du club vaut son
  // adresse postale, un déplacement le lieu saisi par le coach.
  venue: string | null;
}) {
  if (!venue) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <ItineraryButton
        query={venue}
        className="flex items-center gap-1.5 rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark"
      />
    </div>
  );
}
