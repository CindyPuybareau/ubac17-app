"use client";

import { useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import { sortTeamsByGroup } from "@/lib/teams";
import { useScrollTopOnChange } from "@/lib/use-scroll-top-on-change";
import TeamCard from "./team-card";
import TeamSelectorPills from "./team-selector-pills";
import WhatsAppGroupButton from "./whatsapp-group-button";
import type { TeamWithMembers } from "./team-manager";
import type { AdminMemberTeam, AdminUpcomingEvent, MemberDetail, WhatsAppGroup } from "./page";

type Person = { id: string; first_name: string | null; last_name: string | null };

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
  forcedTeamId,
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
  // Utilisé par les sous-onglets "Équipe" dédiés (un par équipe+rôle,
  // sidebar Coach) : verrouille la carte sur cette équipe précise, cette
  // page n'ayant plus besoin de son propre sélecteur — la navigation vit
  // maintenant dans le sous-menu (même principe que forcedTab/forcedView
  // ailleurs). Le bloc "Commissions & Admin" (ni lié à une équipe ni
  // propre à celle-ci) est alors masqué : il vit dans son propre
  // sous-onglet, voir CommissionGroups plus bas.
  forcedTeamId?: string;
}) {
  // L'équipe mère passe avant ses déclinaisons : U13M, puis U13M-1, U13M-2.
  const sortedTeams = useMemo(() => sortTeamsByGroup(teams), [teams]);
  const [activeId, setActiveId] = useState(forcedTeamId ?? sortedTeams[0]?.id);
  const active = forcedTeamId
    ? (sortedTeams.find((t) => t.id === forcedTeamId) ?? sortedTeams[0])
    : (sortedTeams.find((t) => t.id === activeId) ?? sortedTeams[0]);

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

  return (
    <div className="flex flex-col gap-4">
      {!forcedTeamId && (
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
      )}
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
        showWhatsApp={false}
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
        whatsappGroup={activeWhatsappGroup}
      />
    </div>
  );
}

// Groupes "Commission" (Bureau, Coachs UBAC, Buvette...) : jamais liés à
// une équipe, donc jamais gérables par un coach (seul le Bureau le peut),
// mais toujours affichés si RLS les a renvoyés — c'est-à-dire seulement
// ceux dont il est déjà membre. Vivait à l'intérieur de CoachTeams,
// accroché à l'équipe active ; extrait en composant à part (retour de
// Cindy du 2026-08-22, sous-menus "Équipe") puisque ce bloc n'a lui-même
// rien à voir avec une équipe précise — il a maintenant son propre
// sous-onglet "Commissions & Admin" plutôt que d'apparaître accroché à
// une équipe au hasard.
export function CoachCommissionGroups({ whatsappGroups }: { whatsappGroups: WhatsAppGroup[] }) {
  const commissionGroups = whatsappGroups.filter((g) => g.category === "COMMISSION");

  if (commissionGroups.length === 0) {
    return <p className="text-sm text-zinc-500">Aucune commission à te proposer pour le moment.</p>;
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
        Commissions &amp; Admin
      </p>
      <div className="flex flex-wrap gap-2">
        {commissionGroups.map((g) => (
          <WhatsAppGroupButton
            key={g.id}
            teamName={g.name}
            defaultMessage="Bonjour à tous,"
            className="flex items-center gap-1.5 rounded-full border border-emerald-200 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
          />
        ))}
      </div>
    </div>
  );
}
