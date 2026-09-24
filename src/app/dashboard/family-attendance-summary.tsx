"use client";

import type { ReactNode } from "react";
import { Activity, CalendarCheck2, Handshake, Sparkles, Trophy } from "lucide-react";
import { computeSeasonParticipation } from "./season-bilan";
import type { AdminUpcomingEvent } from "./page";

// Retour de Cindy du 24/09 ("il serait pas mal que les parents ait le bilan
// d'assiduité de leurs enfants aussi") : réutilise le même calcul que
// Coach/Bureau/Espace Enfant (computeSeasonParticipation, season-bilan.ts)
// plutôt qu'un comptage bespoke qui mélangeait tous les types d'événements
// -- "une seule vérité 'présence' dans toute l'appli". Un appel par enfant
// (teamIds propre à chacun) : deux enfants dans des équipes différentes ne
// doivent pas partager le même dénominateur d'entraînements.
export default function FamilyAttendanceSummary({
  events,
  players,
  rsvpStatusByKey,
}: {
  events: AdminUpcomingEvent[];
  players: { id: string; name: string; teamIds: string[] }[];
  rsvpStatusByKey: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:p-5">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <CalendarCheck2 className="h-3.5 w-3.5 text-blue-700" />
        Bilan de présence
      </p>
      <div className="flex flex-col gap-4">
        {players.map((p) => {
          const { attendanceByPlayerId, participationByPlayerId } = computeSeasonParticipation(
            events,
            (eventId, playerId) => rsvpStatusByKey[`${eventId}:${playerId}`],
            [p.id],
            p.teamIds
          );
          const trainings = attendanceByPlayerId[p.id];
          const tally = participationByPlayerId[p.id];
          return (
            <div key={p.id} className="flex flex-col gap-2">
              {players.length > 1 && (
                <p className="truncate text-sm font-semibold text-zinc-800">{p.name}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                <StatPill icon={<Activity className="h-3 w-3" />} label="Entraînements" stat={trainings} />
                <StatPill icon={<Trophy className="h-3 w-3" />} label="Officiels" stat={tally.official} />
                <StatPill icon={<Handshake className="h-3 w-3" />} label="Amicaux" stat={tally.friendly} />
                <StatPill icon={<Sparkles className="h-3 w-3" />} label="Tournois" stat={tally.tournament} />
              </div>
            </div>
          );
        })}
        {players.length === 0 && (
          <p className="text-xs text-zinc-400">Pas encore d&apos;historique.</p>
        )}
      </div>
    </div>
  );
}

function StatPill({
  icon,
  label,
  stat,
}: {
  icon: ReactNode;
  label: string;
  stat: { present: number; total: number } | undefined;
}) {
  const total = stat?.total ?? 0;
  const present = stat?.present ?? 0;
  if (total === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600">
      <span className="text-zinc-400">{icon}</span>
      {label}
      <span className="font-semibold tabular-nums text-zinc-900">
        {present}/{total}
      </span>
    </span>
  );
}
