import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { homeAwayLabel } from "@/app/dashboard/event-style";
import { parseMatchTitle } from "@/lib/match-display";
import { sortTeamsByGroup, teamLabel } from "@/lib/teams";
import type { ChildEvent } from "./child-dashboard";

// Même code couleur que MatchScore côté Bureau/Coach (victoire/défaite/nul)
// mais en lecture seule : aucun enfant ne peut jamais modifier un score.
// Un match pas encore joué affiche "À venir" plutôt qu'un tiret ou un
// 0-0 — jamais laisser croire qu'un résultat existe avant que le match
// ait réellement eu lieu.
function ResultRow({ event }: { event: ChildEvent }) {
  const { opponent } = parseMatchTitle(event.title);
  const home = homeAwayLabel(event.isHome);
  const hasScore = event.teamScore !== null && event.opponentScore !== null;
  const alreadyPlayed = new Date(event.startTime).getTime() < Date.now();
  const diff = hasScore ? (event.teamScore as number) - (event.opponentScore as number) : 0;
  const resultClass = !hasScore
    ? "bg-zinc-100 text-zinc-400"
    : diff > 0
      ? "bg-green-100 text-green-700"
      : diff < 0
        ? "bg-red-100 text-red-700"
        : "bg-zinc-100 text-zinc-600";

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-zinc-800">{opponent}</span>
        <span className="text-[11px] text-zinc-400">
          {new Date(event.startTime).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          {home ? ` · ${home}` : ""}
        </span>
      </div>
      {alreadyPlayed ? (
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums ${resultClass}`}>
          {hasScore ? `${event.teamScore} – ${event.opponentScore}` : "—"}
        </span>
      ) : (
        <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-400">
          À venir
        </span>
      )}
    </div>
  );
}

export default function ChildResultsTab({
  seasonMatches,
  teams,
}: {
  seasonMatches: ChildEvent[];
  // Un enfant qui joue dans deux équipes (ex. "monte" ponctuellement dans
  // la catégorie au-dessus) voyait tous les matchs des deux équipes
  // mélangés dans un seul fil sans distinction — même sélecteur que côté
  // Bureau/Coach/Parent (calendar-view.tsx) pour s'y retrouver.
  teams: { id: string; name: string | null; category: string | null }[];
}) {
  const sortedTeams = useMemo(() => sortTeamsByGroup(teams), [teams]);
  const [activeTeamId, setActiveTeamId] = useState<string | undefined>(undefined);
  const activeTeamIdResolved = sortedTeams.some((t) => t.id === activeTeamId)
    ? activeTeamId
    : sortedTeams[0]?.id;

  const visibleMatches = useMemo(
    () =>
      sortedTeams.length > 1
        ? seasonMatches.filter((e) => e.teamId === activeTeamIdResolved)
        : seasonMatches,
    [seasonMatches, sortedTeams, activeTeamIdResolved]
  );

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <Trophy className="h-3.5 w-3.5 text-navy" />
        Résultats
      </p>
      {sortedTeams.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
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
      <div className="flex flex-col gap-1.5">
        {visibleMatches.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucun match programmé pour le moment.</p>
        ) : (
          visibleMatches.map((e) => <ResultRow key={e.id} event={e} />)
        )}
      </div>
    </div>
  );
}
