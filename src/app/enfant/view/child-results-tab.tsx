import { useMemo, useState } from "react";
import { Clock, ListOrdered, MapPin, Shield } from "lucide-react";
import { formatEventTime, homeAwayLabel, styleFor } from "@/app/dashboard/event-style";
import { sortTeamsByGroup, teamLabel } from "@/lib/teams";
import EmptyState from "@/app/dashboard/empty-state";
import MatchResultCelebration from "@/components/match-result-celebration";
import MatchScore from "@/app/dashboard/match-score";
import OpponentDisplay from "@/app/dashboard/opponent-display";
import SalleBadge from "@/app/dashboard/salle-badge";
import { EventRow } from "./child-calendar-tab";
import type { ChildEvent } from "./child-dashboard";

// Même règle que côté Bureau/Coach/Famille (calendar-view.tsx) : victoire
// dans les 5 derniers jours -> confettis. Ici, contrairement au Bureau,
// tout ce qui s'affiche dans l'espace Enfant est déjà l'équipe de l'enfant
// — pas besoin d'un flag "celebrateWins" par appelant, c'est toujours
// activé. Extrait au niveau du module (pas dans le corps du composant)
// pour respecter react-hooks/purity (Date.now() n'est pas pur).
function isRecentWin(event: { teamScore: number | null; opponentScore: number | null; startTime: string }) {
  return (
    event.teamScore !== null &&
    event.opponentScore !== null &&
    event.teamScore > event.opponentScore &&
    Date.now() - new Date(event.startTime).getTime() < 5 * 24 * 60 * 60 * 1000
  );
}

// Retour de Cindy du 06/09 ("les cartes des matchs sont moches et ne
// ressemble pas au reste de l'application") : cette ligne compacte
// (fond gris plat, sans liseré) tranchait avec le reste de l'appli --
// reprend ici le même gabarit que renderResultCard côté Bureau/Coach/
// Famille (calendar-view.tsx) : liseré coloré par type d'événement,
// badge + Domicile/Extérieur, avatar adversaire (OpponentDisplay),
// salle (SalleBadge) et score (MatchScore). Simplement en lecture
// seule : aucun enfant/bénévole ne peut jamais modifier un score
// (canEdit toujours à false).
function ResultRow({ event }: { event: ChildEvent }) {
  const style = styleFor(event.eventType);
  const homeAway = homeAwayLabel(event.isHome);
  const hasScore = event.teamScore !== null && event.opponentScore !== null;
  const alreadyPlayed = new Date(event.startTime).getTime() < new Date().getTime();
  // Même différenciation que renderResultCard/EventRow (direction
  // artistique validée par Cindy le 2026-08-23) : un match officiel porte
  // un liseré épais, un tournoi une bordure pointillée, tout le reste un
  // liseré fin.
  const isTournament = event.eventType === "TOURNAMENT";
  const isOfficialMatch = event.eventType === "MATCH";
  const shellClass = isTournament
    ? "relative overflow-hidden rounded-2xl border-2 border-dashed border-ubac-yellow bg-white p-4 shadow-sm"
    : isOfficialMatch
      ? `relative overflow-hidden rounded-2xl border border-navy/15 bg-white p-4 shadow-sm border-l-8 ${style.border}`
      : `relative overflow-hidden rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm border-l-4 ${style.border}`;

  return (
    <div className={`flex flex-col gap-1.5 ${shellClass}`}>
      {alreadyPlayed && (
        <MatchResultCelebration
          resultKey={`${event.id}:${event.teamScore}-${event.opponentScore}`}
          isWin={isRecentWin(event)}
          enabled
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {event.teamName}
        </span>
        <span className="shrink-0 whitespace-nowrap text-xs font-bold text-ubac-blue">
          {new Date(event.startTime).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
        </span>
      </div>

      <span className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${style.badge}`}>
          {style.label}
        </span>
        {homeAway && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-600">
            {homeAway}
          </span>
        )}
      </span>

      <OpponentDisplay title={event.title} size="sm" />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3 shrink-0" />
          {formatEventTime(event.startTime, null)}
        </span>
        {(event.salle || event.location) && (
          <span className="flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0" />
            {event.salle ? <SalleBadge salle={event.salle} /> : event.location}
          </span>
        )}
      </div>

      {alreadyPlayed ? (
        hasScore ? (
          <MatchScore
            eventId={event.id}
            teamScore={event.teamScore}
            opponentScore={event.opponentScore}
            canEdit={false}
          />
        ) : (
          <span className="w-fit rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-400">
            —
          </span>
        )
      ) : (
        <span className="w-fit rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-400">
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
        .filter(
          (e) =>
            sortedTeams.length <= 1 ||
            e.teamId === activeTeamIdResolved ||
            (activeTeamIdResolved ? (e.targetTeamIds?.includes(activeTeamIdResolved) ?? false) : false)
        )
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
      {/* gap-4 (et non plus 1.5) : les cartes ont désormais la même
          hauteur/densité que renderResultCard et EventRow, qui utilisent
          ce même espacement entre elles. */}
      <div className="flex flex-col gap-4">
        {visibleMatches.length === 0 ? (
          <EmptyState
            icon={Shield}
            message={
              shownMode === "officialMatches"
                ? "Aucun match officiel programmé pour le moment."
                : "Aucun résultat pour le moment."
            }
          />
        ) : (
          listedMatches.map((e) => <ResultRow key={e.id} event={e} />)
        )}
      </div>
    </div>
  );
}
