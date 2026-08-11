import { CalendarDays, ClipboardList, MessageCircle, Trophy, Users } from "lucide-react";
import CalendarView from "./calendar-view";
import CoachTeams from "./coach-teams";
import CoachFfbb from "./coach-ffbb";
import CoachOrganisation, { type CoachTeamMatchCard } from "./coach-organisation";
import AdminSidebar, { type AdminSection } from "./admin-sidebar";
import WhatsAppGroupsManager from "./whatsapp-groups-manager";
import type { TeamWithMembers } from "./team-manager";
import type {
  AdminMemberTeam,
  AdminUpcomingEvent,
  MemberDetail,
  WhatsAppGroup,
} from "./page";
import type {
  CarpoolOffer,
  EventRoleType,
  EventTasksState,
  SeasonTaskTally,
} from "./event-tasks";
import type { BirthdaySource } from "./birthdays";

export default function CoachView({
  teams,
  events,
  contactPhoneByPlayerId,
  contactEmailByPlayerId,
  memberDetailsByPlayerId,
  rsvpPlayers,
  rsvpStatusByKey,
  taskTallyByTeamId,
  teamRoleByTeamId,
  clubTeams,
  birthdayMembers,
  organisationCards,
  tasksByEventId,
  carpoolByEventId,
  whatsappGroups,
  archivedPlayerIds,
  eventRoles,
}: {
  teams: TeamWithMembers[];
  events: AdminUpcomingEvent[];
  contactPhoneByPlayerId: Record<string, string>;
  contactEmailByPlayerId: Record<string, string>;
  memberDetailsByPlayerId: Record<string, MemberDetail>;
  rsvpPlayers: { id: string; name: string; teamIds: string[] }[];
  rsvpStatusByKey: Record<string, string>;
  taskTallyByTeamId: Record<string, SeasonTaskTally>;
  // "COACH" for a team they coach, "PLAYER" for one they only play in —
  // drives both the team selector's badge and the read-only mode.
  teamRoleByTeamId: Record<string, "COACH" | "PLAYER">;
  // Every club team, for the roster's "Changer d'équipe" picker.
  clubTeams: AdminMemberTeam[];
  birthdayMembers: BirthdaySource[];
  organisationCards: CoachTeamMatchCard[];
  tasksByEventId: Record<string, EventTasksState>;
  carpoolByEventId: Record<string, CarpoolOffer[]>;
  whatsappGroups: WhatsAppGroup[];
  // Archived members shouldn't be offered in "Ajouter un membre" on the
  // Groupes WhatsApp screen — see admin-view.tsx's equivalent filter,
  // done here from a plain id list since a coach's roster (RosterPlayer)
  // doesn't carry archived status itself.
  archivedPlayerIds: string[];
  // Catalogue des roles d organisation (event_role_types).
  eventRoles: EventRoleType[];
}) {
  // Créer / modifier / supprimer un événement n'est permis que pour les
  // équipes réellement entraînées : proposer celle où l'utilisateur n'est
  // que joueur donnerait un choix que la RLS refuserait à l'enregistrement.
  const createTeams = teams
    .filter((t) => teamRoleByTeamId[t.id] !== "PLAYER")
    .map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
    }));

  const eventsByTeamId: Record<string, AdminUpcomingEvent[]> = {};
  events.forEach((e) => {
    if (!e.teamId) return;
    (eventsByTeamId[e.teamId] ??= []).push(e);
  });

  const archivedPlayerIdSet = new Set(archivedPlayerIds);
  const whatsappCandidatesById = new Map<
    string,
    { id: string; firstName: string | null; lastName: string | null }
  >();
  teams.forEach((t) => {
    t.players.forEach((p) => {
      if (archivedPlayerIdSet.has(p.id)) return;
      whatsappCandidatesById.set(p.id, {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
      });
    });
  });
  const whatsappCandidates = Array.from(whatsappCandidatesById.values());

  const iconClass = "h-4 w-4 shrink-0";
  const sections: AdminSection[] = [
    {
      key: "calendar",
      label: "Calendrier",
      icon: <CalendarDays className={iconClass} />,
      content: (
        <CalendarView
          events={events}
          createTeams={createTeams}
          rsvp={{ players: rsvpPlayers, statusByKey: rsvpStatusByKey }}
          contactEmailByPlayerId={contactEmailByPlayerId}
          birthdayMembers={birthdayMembers}
          // Toutes ses équipes, y compris celle où il n'est que joueur :
          // le calendrier les montre, même si créer un événement n'y est
          // permis que pour celles qu'il entraîne.
          scopeTeams={teams.map((t) => ({
            id: t.id,
            name: t.name,
            category: t.category,
          }))}
        />
      ),
    },
    {
      key: "teams",
      label: "Mes Équipes",
      icon: <Users className={iconClass} />,
      content: (
        <CoachTeams
          teams={teams}
          allProfiles={[]}
          eventsByTeamId={eventsByTeamId}
          contactPhoneByPlayerId={contactPhoneByPlayerId}
          contactEmailByPlayerId={contactEmailByPlayerId}
          memberDetailsByPlayerId={memberDetailsByPlayerId}
          teamRoleByTeamId={teamRoleByTeamId}
          clubTeams={clubTeams}
        />
      ),
    },
    {
      key: "organisation",
      label: "Organisation & Bilan",
      icon: <ClipboardList className={iconClass} />,
      content: (
        <CoachOrganisation
          cards={organisationCards}
          tasksByEventId={tasksByEventId}
          carpoolByEventId={carpoolByEventId}
          events={events}
          taskTallyByTeamId={taskTallyByTeamId}
          roles={eventRoles}
        />
      ),
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: <MessageCircle className={iconClass} />,
      content: (
        <WhatsAppGroupsManager groups={whatsappGroups} candidates={whatsappCandidates} />
      ),
    },
    {
      key: "ffbb",
      label: "FFBB",
      icon: <Trophy className={iconClass} />,
      content: <CoachFfbb teams={teams} />,
    },
  ];

  return <AdminSidebar sections={sections} />;
}
