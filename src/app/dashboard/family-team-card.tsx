"use client";

import { ExternalLink } from "lucide-react";
import { formatFirstName, formatLastName, sortByLastName } from "@/lib/names";
import { computePlayerYearStatus } from "@/lib/season";
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

// Même tableau que team-card.tsx (Nom/Prénom/Rôle/Statut/Catégorie, lignes
// d'en-tête de groupe COACHS/JOUEURS) — retour de Cindy du 2026-08-24,
// "mon équipe doit avoir les cartes ressemblante à celle des coachs et
// bureau au niveau du visuel". Volontairement plus léger que la version
// Coach/Bureau : ni colonnes Téléphone/E-mail (le contact d'un coach reste
// accessible par son propre canal, WhatsApp, pas exposé ligne par ligne
// dans un tableau vu par toutes les familles), ni actions de gestion
// (Retirer/Affecter, réservées au Bureau) — seulement l'habillage visuel.
function roleBadge(role: "COACH" | "COACH_PENDING" | "JOUEUR") {
  if (role === "COACH") return { label: "Coach", className: "bg-navy/10 text-navy" };
  // Libellé aligné sur "Coach" tout court (retour de Cindy du 2026-08-24) :
  // "en attente" faisait croire à la secrétaire du Bureau qu'il fallait
  // changer un statut à la main quand le coach avait confirmé par SMS,
  // alors que ça décrit uniquement l'absence de compte confirmé — une
  // information déjà portée par le repère de connexion du tableau
  // Membres (members-table.tsx), pas par ce badge-ci. Le fond ambre reste
  // pour garder le repère visuel utile en interne, sans le mot trompeur.
  if (role === "COACH_PENDING")
    return { label: "Coach", className: "bg-amber-100 text-amber-700" };
  return { label: "Joueur", className: "bg-emerald-100 text-emerald-700" };
}

export default function FamilyTeamCard({ card }: { card: FamilyTeamCardData }) {
  const theme = categoryTheme(card.category ?? card.teamName);
  const categoryLabel = card.category ?? card.teamName;

  const coachRows = [
    ...sortByLastName(card.coaches, (c) => c.last_name).map((c) => ({
      key: c.id,
      person: c as Person,
      role: "COACH" as const,
    })),
    ...sortByLastName(card.pendingCoaches, (c) => c.last_name).map((c) => ({
      key: `pending-${c.id}`,
      person: c,
      role: "COACH_PENDING" as const,
    })),
  ];
  const playerRows = sortByLastName(card.roster, (p) => p.last_name);

  function renderRow(
    key: string,
    person: Person,
    role: "COACH" | "COACH_PENDING" | "JOUEUR",
    birthDate: string | null
  ) {
    const badge = roleBadge(role);
    const yearStatus = role === "JOUEUR" ? computePlayerYearStatus(birthDate, card.category) : null;
    return (
      <tr key={key} className="border-b border-zinc-50 last:border-0">
        <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-zinc-900">
          {formatLastName(person.last_name) || "—"}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-zinc-700">
          {person.first_name ? formatFirstName(person.first_name) : "—"}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5">
          <span
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${badge.className}`}
          >
            {badge.label}
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2.5">
          {yearStatus ? (
            <PlayerYearBadge birthDate={birthDate} category={card.category} />
          ) : (
            <span className="text-zinc-300">—</span>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5">
          {categoryLabel ? (
            <span
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${theme.badge}`}
            >
              {categoryLabel}
            </span>
          ) : (
            <span className="text-zinc-400">—</span>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div className="rounded-2xl border border-l-4 border-zinc-100 border-l-ubac-yellow bg-white p-5 shadow-sm">
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

      <div className="mt-3 w-full overflow-x-auto rounded-xl border border-zinc-100">
        <table className="w-full table-auto border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <th className="whitespace-nowrap px-3 py-2.5">Nom</th>
              <th className="whitespace-nowrap px-3 py-2.5">Prénom</th>
              <th className="whitespace-nowrap px-3 py-2.5">Rôle</th>
              <th className="whitespace-nowrap px-3 py-2.5">Statut</th>
              <th className="whitespace-nowrap px-3 py-2.5">Catégorie</th>
            </tr>
          </thead>
          <tbody>
            {coachRows.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={5}
                    className="border-b border-navy/10 bg-navy/[0.07] px-3 py-2 text-xs font-bold uppercase tracking-wide text-navy"
                  >
                    Coachs ({coachRows.length})
                  </td>
                </tr>
                {coachRows.map((r) => renderRow(r.key, r.person, r.role, null))}
              </>
            )}
            {card.coaches.length === 0 &&
              card.pendingCoaches.length === 0 &&
              card.pendingCoachNames && (
                <tr>
                  <td colSpan={5} className="px-3 py-2.5 text-sm text-blue-950">
                    {card.pendingCoachNames}
                  </td>
                </tr>
              )}
            {playerRows.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={5}
                    className="border-b border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-700"
                  >
                    Joueurs ({playerRows.length})
                  </td>
                </tr>
                {playerRows.map((p) => renderRow(p.id, p, "JOUEUR", p.birthDate))}
              </>
            )}
            {coachRows.length === 0 &&
              !card.pendingCoachNames &&
              playerRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-sm text-zinc-400">
                    Aucun membre pour le moment.
                  </td>
                </tr>
              )}
          </tbody>
        </table>
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
