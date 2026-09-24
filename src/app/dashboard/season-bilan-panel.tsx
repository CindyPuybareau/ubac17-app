"use client";

import { useMemo, useState } from "react";
import { sortTeamsByGroup } from "@/lib/teams";
import TeamSelectorPills from "./team-selector-pills";
import { ParticipationTable, VolunteerTable } from "./season-bilan-tables";
import { computeSeasonParticipation } from "./season-bilan";
import type { SeasonVolunteerTally } from "./season-bilan";
import type { RosterPlayer } from "./team-manager";
import type { AdminUpcomingEvent } from "./page";

type SubTab = "joueurs" | "benevoles";

export type BilanTeamRoster = {
  team: { id: string; name: string | null; category: string | null };
  roster: RosterPlayer[];
};

// "Bilan de la saison" (retour de Cindy du 24/09, refonte "Organisation &
// Bilan") : "Planning & Rôles" a disparu (carte "prochain match" et liste
// "prochains événements" déjà couvertes par Calendrier -- plus rien de
// propre à garder) et l'ancien tableau de rôles Maillots/Table de marque
// (catalogue archivé, 0 rôle actif en base) est remplacé par deux volets
// réellement vivants : la participation aux événements (assiduité + matchs
// officiels/amicaux/tournois/autres) et le bénévolat (besoins classiques,
// rôles officiels, covoiturage proposé) -- voir season-bilan.ts et
// season-bilan-tables.tsx. Un seul composant pour les deux espaces
// concernés (retour de Cindy) : côté Coach, `teams` porte les équipes
// coachées ; côté Bureau (admin-view.tsx), le club entier -- le sélecteur
// de pastilles au-dessus du tableau fonctionne à l'identique dans les deux
// cas (une équipe affichée à la fois), seul le nombre de pastilles change.
export default function SeasonBilanPanel({
  teams,
  events,
  rsvpStatusByKey,
  volunteerTallyByPlayerId,
  forcedTab,
}: {
  teams: BilanTeamRoster[];
  events: AdminUpcomingEvent[];
  rsvpStatusByKey: Record<string, string>;
  volunteerTallyByPlayerId: Record<string, SeasonVolunteerTally>;
  // Retour de Cindy du 2026-08-22 : "Organisation et Bilan" éclatée en
  // entrées du menu latéral ("Joueurs" / "Bénévoles") plutôt qu'un choix
  // d'onglet en haut de page — même convention que `forcedView` sur
  // CalendarView. Non fourni : conserve un choix d'onglet interne.
  forcedTab?: SubTab;
}) {
  const [tab, setTab] = useState<SubTab>(forcedTab ?? "joueurs");
  const shownTab = forcedTab ?? tab;

  const sortedTeams = useMemo(() => sortTeamsByGroup(teams.map((t) => t.team)), [teams]);
  const [activeTeamId, setActiveTeamId] = useState<string | undefined>(sortedTeams[0]?.id);
  const activeTeamIdResolved = sortedTeams.some((t) => t.id === activeTeamId)
    ? activeTeamId
    : sortedTeams[0]?.id;
  const visibleTeams =
    sortedTeams.length > 1 ? teams.filter((t) => t.team.id === activeTeamIdResolved) : teams;

  if (teams.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Aucune équipe ne t&apos;est rattachée pour le moment.
      </p>
    );
  }

  const tabButtonClass = (active: boolean) =>
    `flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
      active ? "bg-navy text-white" : "text-navy hover:bg-blue-50"
    }`;

  return (
    <div className="flex flex-col gap-4">
      {!forcedTab && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setTab("joueurs")} className={tabButtonClass(tab === "joueurs")}>
            Joueurs
          </button>
          <button onClick={() => setTab("benevoles")} className={tabButtonClass(tab === "benevoles")}>
            Bénévoles
          </button>
        </div>
      )}

      <TeamSelectorPills teams={sortedTeams} activeId={activeTeamIdResolved} onSelect={setActiveTeamId} />

      <p className="text-xs text-zinc-500">
        {shownTab === "joueurs"
          ? "Assiduité et participation depuis le début de la saison. Cliquez sur une colonne pour trier — par défaut, l'assiduité la plus faible apparaît en premier."
          : "Bénévolat depuis le début de la saison, classé du plus au moins actif."}
      </p>

      <div className="flex flex-col gap-4">
        {visibleTeams.map(({ team, roster }) => {
          const playerIds = roster.map((p) => p.id);
          const { attendanceByPlayerId, participationByPlayerId } = computeSeasonParticipation(
            events,
            (eventId, playerId) => rsvpStatusByKey[`${eventId}:${playerId}`],
            playerIds
          );
          return (
            <div key={team.id} className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:p-5">
              <p className="mb-3 text-sm font-semibold text-zinc-900">
                {team.name ?? "Équipe"}
                {team.category && team.category !== team.name && (
                  <span className="text-xs font-medium text-zinc-400"> · {team.category}</span>
                )}
              </p>
              {shownTab === "joueurs" ? (
                <ParticipationTable
                  roster={roster}
                  attendanceByPlayerId={attendanceByPlayerId}
                  tallyByPlayerId={participationByPlayerId}
                />
              ) : (
                <VolunteerTable roster={roster} tallyByPlayerId={volunteerTallyByPlayerId} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
