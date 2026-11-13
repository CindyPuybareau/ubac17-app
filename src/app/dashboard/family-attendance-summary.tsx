"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, Handshake, Sparkles, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getCurrentSeasonWindow } from "@/lib/season";
import { AttendanceHero, PresenceTiles } from "./attendance-hero";
import { seasonParticipationFromRows, type SeasonParticipationRow } from "./season-bilan";
import type { AdminUpcomingEvent } from "./page";

// Retour de Cindy du 24/09 ("il serait pas mal que les parents ait le bilan
// d'assiduité de leurs enfants aussi"). Retour du 13/11 : calcul fait en
// base sur la saison entière (season_participation, une seule requête pour
// tous les enfants affichés) -- l'ancien calcul ne voyait que les
// entraînements chargés pour le Calendrier (depuis le mois précédent).
// Chaque enfant n'est compté que pour ses propres équipes : deux enfants
// dans des équipes différentes ne partagent jamais le même total. Affichage
// "un peu de fun" : même bandeau à anneau que le Bilan de la saison, avec
// des verdicts encourageants.
export default function FamilyAttendanceSummary({
  events,
  players,
  rsvpStatusByKey,
}: {
  // events / rsvpStatusByKey changent à chaque rafraîchissement temps réel :
  // ils servent seulement à relancer le calcul quand une présence change.
  events: AdminUpcomingEvent[];
  players: { id: string; name: string; teamIds: string[] }[];
  rsvpStatusByKey: Record<string, string>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const playerKey = players.map((p) => p.id).join(",");
  const teamKey = Array.from(new Set(players.flatMap((p) => p.teamIds))).sort().join(",");
  // Résultat rangé avec la clé (enfants + équipes) qui l'a produit : en
  // changeant d'enfant, l'ancien résultat n'est jamais affiché pour le nouveau.
  const requestKey = `${playerKey}|${teamKey}`;
  const [result, setResult] = useState<{
    key: string;
    value: ReturnType<typeof seasonParticipationFromRows>;
  } | null>(null);
  const data = result?.key === requestKey ? result.value : null;

  useEffect(() => {
    if (!playerKey || !teamKey) return;
    let stale = false;
    const playerIds = playerKey.split(",");
    supabase
      .rpc("season_participation", {
        p_team_ids: teamKey.split(","),
        p_from: getCurrentSeasonWindow().startIso,
        p_player_ids: playerIds,
      })
      .then(({ data: rows, error }) => {
        if (stale || error) return;
        setResult({
          key: `${playerKey}|${teamKey}`,
          value: seasonParticipationFromRows((rows ?? []) as SeasonParticipationRow[], playerIds),
        });
      });
    return () => {
      stale = true;
    };
  }, [supabase, playerKey, teamKey, events, rsvpStatusByKey]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:p-5">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-900">
        <CalendarCheck2 className="h-3.5 w-3.5 text-blue-700" />
        Bilan de présence
      </p>
      {players.length === 0 ? (
        <p className="text-xs text-zinc-400">Pas encore d&apos;historique.</p>
      ) : !data ? (
        <div className="h-24 animate-pulse rounded-xl bg-zinc-100 motion-reduce:animate-none" />
      ) : (
        <div className="flex flex-col gap-4">
          {players.map((p) => {
            const trainings = data.attendanceByPlayerId[p.id] ?? { present: 0, total: 0 };
            const tally = data.participationByPlayerId[p.id];
            const rate = trainings.total > 0 ? (trainings.present / trainings.total) * 100 : null;
            return (
              <div key={p.id} className="flex flex-col gap-2">
                <div className="overflow-hidden rounded-xl">
                  <AttendanceHero
                    title={players.length > 1 ? `Entraînements · ${p.name}` : "Entraînements de la saison"}
                    rate={rate}
                    tone="personal"
                    subtitle={
                      trainings.total > 0
                        ? `${trainings.present} sur ${trainings.total} entraînement${trainings.total > 1 ? "s" : ""}`
                        : "Aucun entraînement passé"
                    }
                  />
                </div>
                {tally && (
                  <PresenceTiles
                    tiles={[
                      {
                        key: "official",
                        label: "Officiels",
                        present: tally.official.present,
                        total: tally.official.total,
                        icon: <Trophy className="h-3.5 w-3.5" />,
                        toneClassName: "bg-navy/10 text-navy",
                      },
                      {
                        key: "friendly",
                        label: "Amicaux",
                        present: tally.friendly.present,
                        total: tally.friendly.total,
                        icon: <Handshake className="h-3.5 w-3.5" />,
                        toneClassName: "bg-blue-50 text-blue-600",
                      },
                      {
                        key: "tournament",
                        label: "Tournois",
                        present: tally.tournament.present,
                        total: tally.tournament.total,
                        icon: <Sparkles className="h-3.5 w-3.5" />,
                        toneClassName: "bg-ubac-yellow/20 text-ubac-yellow-dark",
                      },
                    ]}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
