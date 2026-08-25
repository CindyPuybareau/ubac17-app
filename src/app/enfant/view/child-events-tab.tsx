"use client";

import { useMemo, useState } from "react";
import { sortTeamsByGroup, teamLabel } from "@/lib/teams";
import { EventRow } from "./child-calendar-tab";
import type { ChildEvent } from "./child-dashboard";

// Onglet "Événements" (retour de Cindy du 2026-08-22) : tout le calendrier
// du club sauf les matchs officiels — entraînements, amicaux, tournois,
// événements club — en un seul fil chronologique, même principe que côté
// Bureau/Coach/Parent (calendar-view.tsx, forcedView="clubEvents"). Les
// matchs officiels et leurs résultats vivent désormais dans leur propre
// onglet "Matchs & Résultats" (voir child-results-tab.tsx).
export default function ChildEventsTab({
  events,
  teams,
  nextEventId,
  nextEventAttendance,
}: {
  events: ChildEvent[];
  // Un enfant qui joue dans deux équipes voyait tous les événements des
  // deux équipes mélangés sans distinction — même sélecteur que côté
  // Bureau/Coach/Parent.
  teams: { id: string; name: string | null; category: string | null }[];
  // Retour de Cindy du 2026-08-25 : les présences au prochain rendez-vous
  // vivent désormais sur la carte de CET événement précis, ici ou dans
  // "Matchs officiels" (child-results-tab.tsx) selon son type — plus dans
  // l'onglet "Mon Équipe", "rien à voir avec l'équipe".
  nextEventId?: string | null;
  nextEventAttendance?: { name: string | null; status: string }[];
}) {
  const sortedTeams = useMemo(() => sortTeamsByGroup(teams), [teams]);
  const [activeTeamId, setActiveTeamId] = useState<string | undefined>(undefined);
  const activeTeamIdResolved = sortedTeams.some((t) => t.id === activeTeamId)
    ? activeTeamId
    : sortedTeams[0]?.id;

  const clubEvents = useMemo(
    () =>
      events
        .filter((e) => e.eventType !== "MATCH")
        .filter((e) => sortedTeams.length <= 1 || e.teamId === activeTeamIdResolved)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [events, sortedTeams, activeTeamIdResolved]
  );

  return (
    <div className="flex flex-col gap-3">
      {sortedTeams.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {sortedTeams.map((t) => {
            const isActive = activeTeamIdResolved === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTeamId(t.id)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-navy bg-navy text-white"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {teamLabel(t)}
              </button>
            );
          })}
        </div>
      )}
      {clubEvents.length === 0 ? (
        <p className="rounded-2xl border border-zinc-100 bg-white p-4 text-sm text-zinc-500 shadow-sm">
          Aucun événement programmé pour le moment.
        </p>
      ) : (
        clubEvents.map((e) => (
          <EventRow
            key={e.id}
            event={e}
            attendance={e.id === nextEventId ? nextEventAttendance : undefined}
          />
        ))
      )}
    </div>
  );
}
