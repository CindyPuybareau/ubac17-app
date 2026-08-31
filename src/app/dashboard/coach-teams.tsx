"use client";

import { useMemo, useState } from "react";
import { sortTeamsByGroup } from "@/lib/teams";
import { useScrollTopOnChange } from "@/lib/use-scroll-top-on-change";
import PenalitesCard from "./penalites-card";
import TeamCard from "./team-card";
import TeamSelectorPills from "./team-selector-pills";
import type { Person, TeamWithMembers } from "./team-manager";
import type {
  AdminMemberTeam,
  AdminPenalite,
  AdminUpcomingEvent,
  MemberDetail,
  WhatsAppGroup,
} from "./page";

export default function CoachTeams({
  teams,
  allProfiles,
  eventsByTeamId,
  contactPhoneByPlayerId,
  contactEmailByPlayerId,
  memberDetailsByPlayerId,
  teamRoleByTeamId,
  clubTeams,
  whatsappGroups,
  penalites = [],
}: {
  teams: TeamWithMembers[];
  allProfiles: Person[];
  eventsByTeamId: Record<string, AdminUpcomingEvent[]>;
  contactPhoneByPlayerId: Record<string, string>;
  contactEmailByPlayerId: Record<string, string>;
  memberDetailsByPlayerId: Record<string, MemberDetail>;
  teamRoleByTeamId: Record<string, "COACH" | "PLAYER">;
  clubTeams: AdminMemberTeam[];
  whatsappGroups: WhatsAppGroup[];
  // Retour de Cindy du 29/08 : "Pénalités de l'équipe" mélangeait les
  // pénalités de TOUTES les équipes coachées (ex. U13F + U13M pour Basile)
  // dans une seule liste, quelle que soit l'équipe sélectionnée ci-dessus —
  // désormais filtrée sur l'effectif de l'équipe active uniquement.
  penalites?: AdminPenalite[];
}) {
  // L'équipe mère passe avant ses déclinaisons : U13M, puis U13M-1, U13M-2.
  const sortedTeams = useMemo(() => sortTeamsByGroup(teams), [teams]);
  const [activeId, setActiveId] = useState(sortedTeams[0]?.id);
  const active = sortedTeams.find((t) => t.id === activeId) ?? sortedTeams[0];

  useScrollTopOnChange(active?.id);

  if (!active) {
    return (
      <p className="text-sm text-zinc-500">
        Aucune équipe ne t&apos;est rattachée pour le moment.
      </p>
    );
  }

  // A team they only play in is consultable, never editable: the club's
  // roster/coach management stays with the team's own coaches and the
  // Bureau (the RLS wouldn't accept the write either).
  const activeRole = teamRoleByTeamId[active.id] ?? "COACH";
  const isPlayerTeam = activeRole === "PLAYER";
  const activeWhatsappGroup = whatsappGroups.find((g) => g.teamId === active.id) ?? null;
  const activeRosterIds = new Set(active.players.map((p) => p.id));
  const activeTeamPenalites = penalites.filter((p) => activeRosterIds.has(p.playerId));

  return (
    <div className="flex flex-col gap-4">
      <TeamSelectorPills
        teams={sortedTeams.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          role: teamRoleByTeamId[t.id] ?? "COACH",
        }))}
        activeId={active.id}
        onSelect={setActiveId}
      />
      {isPlayerTeam && (
        <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Tu figures dans cette équipe en tant que joueur : l&apos;effectif est
          consultable, mais sa gestion reste à ses coachs et au Bureau.
        </p>
      )}
      <TeamCard
        // Remount on team change: otherwise a search still typed in the
        // roster filter (or a half-open form) would carry over and make
        // the next team look empty.
        key={active.id}
        team={active}
        allProfiles={allProfiles}
        eventsByTeamId={eventsByTeamId}
        contactPhoneByPlayerId={contactPhoneByPlayerId}
        contactEmailByPlayerId={contactEmailByPlayerId}
        createCotisationOnNewPlayer={false}
        memberDetailsByPlayerId={memberDetailsByPlayerId}
        readOnly={isPlayerTeam}
        showRosterSearch
        clubTeams={clubTeams}
        // La création de membres et la gestion des coachs sont centralisées
        // côté Bureau : un coach ne crée pas de fiche joueur et ne retire
        // pas un collègue de l'encadrement. Idem pour retirer un joueur de
        // l'équipe (retour de Cindy du 2026-08-20) : readOnly ne suffit
        // pas ici puisqu'il vaut déjà false pour l'équipe que ce coach
        // entraîne (il doit pouvoir ajouter/gérer), donc le droit de
        // retrait doit être coupé explicitement plutôt que déduit.
        allowCreatePlayer={false}
        allowAssignCoach={false}
        canRemoveMembers={false}
        // Relier un compte parent à un enfant reste un geste du Bureau.
        canManageParentLinks={false}
        // Retour de Cindy du 30/08 : un coach ne corrige que les
        // coordonnées de contact d'un joueur qu'il gère, jamais le reste
        // de sa fiche (nom, catégorie, licence, notes médicales...) — voir
        // le déclencheur protect_sensitive_player_fields côté base, qui
        // applique la même règle même hors de cette interface.
        canEditFullProfile={false}
        whatsappGroup={activeWhatsappGroup}
      />
      <PenalitesCard
        title="Pénalités de l'équipe"
        penalites={activeTeamPenalites}
        showPlayerName
        emptyLabel="Aucune pénalité pour tes joueurs."
      />
    </div>
  );
}
