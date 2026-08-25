import { useMemo, useState } from "react";
import { Clock, ListOrdered, Shield } from "lucide-react";
import { formatEventTime, homeAwayLabel } from "@/app/dashboard/event-style";
import { parseMatchTitle } from "@/lib/match-display";
import { sortTeamsByGroup, teamLabel } from "@/lib/teams";
import { EventRow } from "./child-calendar-tab";
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
  const alreadyPlayed = new Date(event.startTime).getTime() < new Date().getTime();
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
        {/* Retour de Cindy du 2026-08-22 : côté Joueur, l'heure du match
            n'apparaissait nulle part sur cette page — seule la date, en
            petit gris pâle. Icône horloge + heure ajoutées, même codes
            visuels que "Prochains événements" (team-card.tsx) plutôt
            qu'un nouveau traitement, sans changer le gabarit compact de
            la ligne. */}
        <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-500">
          {new Date(event.startTime).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          <Clock className="h-3 w-3 shrink-0" />
          {formatEventTime(event.startTime, null)}
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

// "Matchs & Résultats" (retour de Cindy du 2026-08-22) : les matchs
// officiels et leurs résultats. "Matchs officiels" / "Résultats" sont
// maintenant deux sous-onglets de menu à part entière (voir
// child-dashboard.tsx, forcedMode) plutôt qu'un bouton interne — même
// bascule que forcedTab côté Coach/Bureau (coach-organisation.tsx,
// cotisations-manager.tsx). "Matchs officiels" montre tout le calendrier
// (à venir compris), "Résultats" ne montre que ceux déjà joués. En
// lecture seule ici comme tout le reste de l'espace Enfant.
export default function ChildResultsTab({
  events,
  teams,
  forcedMode,
  nextEventId,
  nextEventAttendance,
}: {
  events: ChildEvent[];
  // Un enfant qui joue dans deux équipes (ex. "monte" ponctuellement dans
  // la catégorie au-dessus) voyait tous les matchs des deux équipes
  // mélangés dans un seul fil sans distinction — même sélecteur que côté
  // Bureau/Coach/Parent (calendar-view.tsx) pour s'y retrouver.
  teams: { id: string; name: string | null; category: string | null }[];
  forcedMode?: "officialMatches" | "officialResults";
  // Retour de Cindy du 2026-08-25 : si le prochain rendez-vous est un
  // match officiel, sa carte de présences vit ici plutôt que dans
  // "Événements" — voir child-events-tab.tsx pour le cas symétrique.
  nextEventId?: string | null;
  nextEventAttendance?: { name: string | null; status: string }[];
}) {
  const [mode, setMode] = useState<"officialMatches" | "officialResults">(
    forcedMode ?? "officialMatches"
  );
  const shownMode = forcedMode ?? mode;
  const sortedTeams = useMemo(() => sortTeamsByGroup(teams), [teams]);
  const [activeTeamId, setActiveTeamId] = useState<string | undefined>(undefined);
  const activeTeamIdResolved = sortedTeams.some((t) => t.id === activeTeamId)
    ? activeTeamId
    : sortedTeams[0]?.id;

  const visibleMatches = useMemo(
    () =>
      events
        .filter((e) => e.eventType === "MATCH")
        .filter(
          (e) =>
            shownMode === "officialMatches" || new Date(e.startTime).getTime() < new Date().getTime()
        )
        .filter((e) => sortedTeams.length <= 1 || e.teamId === activeTeamIdResolved)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [events, shownMode, sortedTeams, activeTeamIdResolved]
  );

  // Carte détaillée du prochain match, avec ses présences (retour de
  // Cindy du 2026-08-25) : uniquement en mode "Matchs officiels" (un match
  // déjà joué dans "Résultats" n'a plus de présences à afficher) et
  // seulement s'il fait partie des matchs visibles ici — sinon c'est
  // child-events-tab.tsx qui s'en charge (prochain rendez-vous = un
  // entraînement/tournoi, pas un match officiel). Retiré de la liste
  // compacte ci-dessous pour ne pas l'y montrer deux fois.
  const nextMatch =
    shownMode === "officialMatches" ? visibleMatches.find((e) => e.id === nextEventId) ?? null : null;
  const listedMatches = nextMatch ? visibleMatches.filter((e) => e.id !== nextMatch.id) : visibleMatches;

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      {!forcedMode && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            onClick={() => setMode("officialMatches")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              mode === "officialMatches"
                ? "bg-navy text-white"
                : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <Shield className="h-3.5 w-3.5" />
            Matchs officiels
          </button>
          <button
            onClick={() => setMode("officialResults")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              mode === "officialResults"
                ? "bg-navy text-white"
                : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <ListOrdered className="h-3.5 w-3.5" />
            Résultats
          </button>
        </div>
      )}
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
      {nextMatch && (
        <div className="mb-3">
          <EventRow event={nextMatch} attendance={nextEventAttendance} />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {visibleMatches.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {shownMode === "officialMatches"
              ? "Aucun match officiel programmé pour le moment."
              : "Aucun résultat pour le moment."}
          </p>
        ) : (
          listedMatches.map((e) => <ResultRow key={e.id} event={e} />)
        )}
      </div>
    </div>
  );
}
