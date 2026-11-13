"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { ProgressRing } from "./attendance-hero";
import type { SpaceDashboardRecentResult } from "@/lib/space-dashboard";

// Bandeau "matchs" du tableau de bord (retour de Cindy du 13/11, "un peu de
// fun dans cette appli") : même famille que le bandeau présence
// (attendance-hero.tsx) -- anneau du % de victoires (jaune club), série en
// cours, barre victoires / défaites, puis la "forme du moment" : pastilles
// V / D des derniers matchs, la plus récente en premier.
const FORM_SIZE = 5;

export default function MatchFormHero({
  title,
  played,
  won,
  results,
  showTeamName,
}: {
  title: string;
  played: number;
  won: number;
  // Déjà filtrés (Officiels / Amicaux / Tous), du plus récent au plus ancien.
  results: SpaceDashboardRecentResult[];
  // Club entier (Bureau) : nom de l'équipe sous chaque pastille plutôt que
  // le score, plusieurs équipes se mélangeant dans la même série.
  showTeamName: boolean;
}) {
  const lost = Math.max(0, played - won);
  const rate = played > 0 ? (won / played) * 100 : null;
  const form = results.slice(0, FORM_SIZE);

  // Série en cours : victoires d'affilée en partant du dernier match.
  let winStreak = 0;
  for (const r of results) {
    if (r.teamScore > r.opponentScore) winStreak += 1;
    else break;
  }

  // Barre victoires / défaites : part de 0 et se remplit à l'apparition.
  const [barShown, setBarShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setBarShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm md:flex md:items-stretch">
      <div className="flex items-center gap-4 bg-gradient-to-br from-navy via-navy to-navy-dark px-4 py-4 md:min-w-[18rem]">
        <ProgressRing rate={rate} strokeClassName="stroke-ubac-yellow" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ubac-yellow">{title}</p>
          <p className="mt-0.5 text-sm font-medium text-white/85">
            {played > 0 ? "de victoires" : "Pas encore de match joué"}
          </p>
          {winStreak >= 2 ? (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-ubac-yellow/20 px-2 py-0.5 text-[11px] font-semibold text-ubac-yellow">
              <Flame className="h-3 w-3" />
              {winStreak} victoires d&apos;affilée
            </span>
          ) : winStreak === 1 ? (
            <span className="mt-1.5 inline-flex rounded-full bg-emerald-400/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
              Dernier match gagné
            </span>
          ) : null}
        </div>
      </div>

      {played > 0 && (
        <div className="flex flex-1 flex-col justify-center gap-3 p-3 md:px-4">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-semibold tabular-nums">
              <span className="text-emerald-700">
                {won} victoire{won > 1 ? "s" : ""}
              </span>
              <span className="text-red-600">
                {lost} défaite{lost > 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full bg-emerald-500 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{ width: barShown ? `${(won / played) * 100}%` : "0%" }}
              />
              <div
                className="h-full bg-red-400 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{ width: barShown ? `${(lost / played) * 100}%` : "0%" }}
              />
            </div>
          </div>

          {form.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Forme du moment <span className="font-medium normal-case tracking-normal">· le plus récent à gauche</span>
              </p>
              <div className="flex gap-2">
                {form.map((r, i) => {
                  const outcome = r.teamScore > r.opponentScore ? "V" : r.teamScore < r.opponentScore ? "D" : "N";
                  const color =
                    outcome === "V" ? "bg-emerald-500" : outcome === "D" ? "bg-red-500" : "bg-zinc-400";
                  const date = new Date(r.startTime).toLocaleDateString("fr-FR", {
                    timeZone: "Europe/Paris",
                    day: "numeric",
                    month: "short",
                  });
                  return (
                    <div
                      key={r.id}
                      title={`${r.title ?? "Match"} · ${date} · ${r.teamScore}-${r.opponentScore}`}
                      className="flex min-w-0 flex-1 flex-col items-center gap-1"
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm ${color} ${
                          i === 0 ? "ring-2 ring-navy/30 ring-offset-2" : ""
                        }`}
                      >
                        {outcome}
                      </span>
                      <span className="max-w-full truncate text-[10px] font-medium tabular-nums text-zinc-500">
                        {showTeamName ? (r.teamName ?? "") : `${r.teamScore}-${r.opponentScore}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
