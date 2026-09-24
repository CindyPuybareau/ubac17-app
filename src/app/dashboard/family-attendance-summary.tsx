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
                <StatPill
                  icon={<Activity className="h-3 w-3" />}
                  label="Entraînements"
                  stat={trainings}
                  colorClass="bg-emerald-50 text-emerald-700"
                />
                <StatPill
                  icon={<Trophy className="h-3 w-3" />}
                  label="Officiels"
                  stat={tally.official}
                  colorClass="bg-navy/10 text-navy"
                />
                <StatPill
                  icon={<Handshake className="h-3 w-3" />}
                  label="Amicaux"
                  stat={tally.friendly}
                  colorClass="bg-blue-50 text-blue-700"
                />
                <StatPill
                  icon={<Sparkles className="h-3 w-3" />}
                  label="Tournois"
                  stat={tally.tournament}
                  colorClass="bg-ubac-yellow/20 text-ubac-yellow-dark"
                />
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
  colorClass,
}: {
  icon: ReactNode;
  label: string;
  stat: { present: number; total: number } | undefined;
  // Même palette que les compteurs Coach/Bureau (CountChip, season-bilan-tables.tsx)
  // -- retour de Cindy du 24/09 ("des icônes colorés comme pour les coachs et
  // le bureau"), plutôt qu'un gris neutre pour les 4 types.
  colorClass: string;
}) {
  const total = stat?.total ?? 0;
  const present = stat?.present ?? 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
        total === 0 ? "bg-zinc-50 text-zinc-300" : colorClass
      }`}
    >
      {icon}
      {label}
      <span className="font-semibold tabular-nums">
        {present}/{total}
      </span>
    </span>
  );
}
