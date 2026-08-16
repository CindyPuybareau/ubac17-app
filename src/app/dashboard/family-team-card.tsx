"use client";

import { ClipboardList, ExternalLink, Users } from "lucide-react";
import { formatFirstName, formatLastName, sortByLastName } from "@/lib/names";
import PlayerYearBadge from "./player-year-badge";
import { categoryTheme } from "./team-card";

type Person = { id: string; first_name: string | null; last_name: string | null };
type CoachContact = Person & { phone: string | null };
type RosterMate = Person & { birthDate: string | null };

export type FamilyTeamCardData = {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string | null;
  category: string | null;
  coaches: CoachContact[];
  // Named coaches assigned via a member's fiche (team_pending_coaches)
  // before they have a real account yet — same source as the Membres
  // table's amber "en attente" badge.
  pendingCoaches: Person[];
  roster: RosterMate[];
  ffbbUrl: string | null;
  sortOrder: number | null;
  pendingCoachNames: string | null;
};

// Rendu inline harmonisé avec le reste de l'app : prénom en casse normale,
// nom de famille en gras et majuscules (calendar-view.tsx, team-card.tsx).
function PersonNameInline({ p }: { p: Person }) {
  return (
    <>
      {formatFirstName(p.first_name)} <span className="font-bold uppercase">{formatLastName(p.last_name)}</span>
    </>
  );
}

// Carte d'identité de l'équipe : qui l'entraîne, qui la compose. Les
// événements de l'équipe ne sont plus dupliqués ici — l'onglet "Planning &
// Matchs" est désormais l'unique endroit où les consulter, pour ne jamais
// avoir à comparer deux listes qui pourraient diverger.
export default function FamilyTeamCard({ card }: { card: FamilyTeamCardData }) {
  const theme = categoryTheme(card.category ?? card.teamName);
  const categoryLabel = card.category ?? card.teamName;

  return (
    <div className="rounded-2xl border border-t-4 border-zinc-100 border-t-ubac-yellow bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ubac-blue">
          Équipe de {card.playerName}
        </p>
        {categoryLabel && (
          <span
            className={`inline-flex w-fit items-center justify-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold leading-none ${theme.badge}`}
          >
            {categoryLabel}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
            <ClipboardList className="h-3.5 w-3.5" />
            Coachs
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {sortByLastName(card.coaches, (c) => c.last_name).map((c) => (
              <li
                key={c.id}
                className="truncate rounded-lg bg-blue-50/70 p-2.5 text-sm text-blue-950"
              >
                <PersonNameInline p={c} />
              </li>
            ))}
            {sortByLastName(card.pendingCoaches, (c) => c.last_name).map((c) => (
              <li
                key={`pending-${c.id}`}
                className="truncate rounded-lg bg-blue-50/70 p-2.5 text-sm text-blue-950"
              >
                <PersonNameInline p={c} />
              </li>
            ))}
            {/* Legacy free-text fallback, only shown if this team has no
                structured pending coach (team_pending_coaches) at all —
                keeps older, never-migrated teams from silently going blank. */}
            {card.pendingCoaches.length === 0 && card.pendingCoachNames && (
              <li className="truncate rounded-lg bg-blue-50/70 p-2.5 text-sm text-blue-950">
                {card.pendingCoachNames}
              </li>
            )}
            {card.coaches.length === 0 &&
              card.pendingCoaches.length === 0 &&
              !card.pendingCoachNames && (
                <li className="text-sm text-zinc-400">Aucun coach assigné</li>
              )}
          </ul>
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
            <Users className="h-3.5 w-3.5" />
            Joueurs
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {sortByLastName(card.roster, (p) => p.last_name).map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-2 py-1 text-sm text-zinc-700"
              >
                <span className="truncate">
                  <PersonNameInline p={p} />
                </span>
                <PlayerYearBadge birthDate={p.birthDate} category={card.category} />
              </li>
            ))}
            {card.roster.length === 0 && (
              <li className="text-sm text-zinc-400">Aucun joueur</li>
            )}
          </ul>
        </div>
      </div>

      {card.ffbbUrl && (
        <a
          href={card.ffbbUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-ubac-blue hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          Voir la fiche équipe FFBB
        </a>
      )}
    </div>
  );
}
