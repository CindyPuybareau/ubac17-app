"use client";

import { CalendarDays, ClipboardList, ExternalLink, Users } from "lucide-react";
import { formatFirstName, formatLastName } from "@/lib/names";
import FamilyEventCard from "./family-event-card";
import { upcomingSorted } from "./family-event-feed";
import WhatsAppGroupButton from "./whatsapp-group-button";
import PlayerYearBadge from "./player-year-badge";
import { categoryTheme } from "./team-card";
import type { AdminUpcomingEvent } from "./page";

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

export default function FamilyTeamCard({
  card,
  events,
  rsvpStatusByKey,
  rsvpReasonByKey = {},
}: {
  card: FamilyTeamCardData;
  // Événements de cette équipe uniquement — déjà filtrés par FamilyView à
  // partir de la même liste que l'onglet "Prochains Événements", pour que
  // les deux vues lisent exactement le même statut RSVP.
  events: AdminUpcomingEvent[];
  rsvpStatusByKey: Record<string, string>;
  rsvpReasonByKey?: Record<string, string | null>;
}) {
  const theme = categoryTheme(card.category ?? card.teamName);
  const categoryLabel = card.category ?? card.teamName;
  // Même plafond que l'ancien affichage statique : les 3 prochains
  // rassemblements suffisent ici, la liste complète reste dans l'onglet
  // "Prochains Événements".
  const upcomingEvents = upcomingSorted(events).slice(0, 3);
  const concerned = [{ id: card.playerId, name: card.playerName }];

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
            {card.coaches.map((c) => (
              <li
                key={c.id}
                className="truncate rounded-lg bg-blue-50/70 p-2.5 text-sm text-blue-950"
              >
                <PersonNameInline p={c} />
              </li>
            ))}
            {card.pendingCoaches.map((c) => (
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
            {card.roster.map((p) => (
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

      <div className="mt-4">
        <div className="mb-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
            <CalendarDays className="h-3.5 w-3.5" />
            Prochains événements
          </p>
          <p className="text-[11px] text-zinc-400">
            Matchs, entraînements &amp; événements du club
          </p>
        </div>
        {upcomingEvents.length > 0 ? (
          <div className="flex flex-col gap-3">
            {upcomingEvents.map((e) => (
              <FamilyEventCard
                key={e.id}
                event={e}
                concerned={concerned}
                rsvpStatusByKey={rsvpStatusByKey}
                rsvpReasonByKey={rsvpReasonByKey}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Aucun événement à venir</p>
        )}
      </div>

      <div className="mt-3">
        <WhatsAppGroupButton
          teamName={card.teamName ?? "l'équipe"}
          defaultMessage={`Bonjour à tous, je suis un parent de l'équipe ${card.teamName ?? ""}.`}
          className="flex items-center gap-1.5 rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
        />
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
