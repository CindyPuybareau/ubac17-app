import { CalendarDays, ClipboardList, Trophy, Users } from "lucide-react";
import CalendarView from "./calendar-view";
import CalendarSubscribe from "./calendar-subscribe";
import PushSubscribe from "./push-subscribe";
import CoachTeams from "./coach-teams";
import CoachFfbb from "./coach-ffbb";
import CoachOrganisation, { type CoachTeamMatchCard } from "./coach-organisation";
import AdminSidebar, { type AdminSection } from "./admin-sidebar";
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
  rsvpReasonByKey,
  taskTallyByTeamId,
  teamRoleByTeamId,
  clubTeams,
  birthdayMembers,
  organisationCards,
  tasksByEventId,
  carpoolByEventId,
  whatsappGroups,
  eventRoles,
  ownPlayerId,
}: {
  teams: TeamWithMembers[];
  events: AdminUpcomingEvent[];
  contactPhoneByPlayerId: Record<string, string>;
  contactEmailByPlayerId: Record<string, string>;
  memberDetailsByPlayerId: Record<string, MemberDetail>;
  rsvpPlayers: { id: string; name: string; teamIds: string[] }[];
  rsvpStatusByKey: Record<string, string>;
  // Motif d'absence saisi par la famille, affiché sur les cartes.
  rsvpReasonByKey: Record<string, string | null>;
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
  // Catalogue des roles d organisation (event_role_types).
  eventRoles: EventRoleType[];
  // Sa propre fiche joueur (players.profile_id = son compte), si elle
  // existe — un coach qui joue aussi dans une autre équipe doit pouvoir
  // répondre présent/absent pour LUI-MÊME sur ses propres matchs.
  ownPlayerId: string | null;
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

  const iconClass = "h-4 w-4 shrink-0";
  const sections: AdminSection[] = [
    {
      key: "calendar",
      label: "Calendrier",
      icon: <CalendarDays className={iconClass} />,
      content: (
        <div className="flex flex-col gap-4">
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
            selfPlayerId={ownPlayerId}
          />
          {/* Même bloc que l'espace parent : un coach a lui aussi son
              propre agenda, et être coach ne devrait pas le priver de cet
              outil — il fallait juste l'y ajouter aussi. */}
          <CalendarSubscribe />
        </div>
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
          whatsappGroups={whatsappGroups}
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
          rsvpStatusByKey={rsvpStatusByKey}
          rsvpReasonByKey={rsvpReasonByKey}
          roles={eventRoles}
        />
      ),
    },
    {
      key: "ffbb",
      label: "FFBB",
      icon: <Trophy className={iconClass} />,
      content: <CoachFfbb teams={teams} teamRoleByTeamId={teamRoleByTeamId} />,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Même emplacement que côté Famille, hors des onglets : un coach
          doit pouvoir l'activer sans avoir à deviner dans quel onglet elle
          se cache. Ne s'affiche que là où le navigateur sait recevoir un
          push (sur iPhone, seulement si l'app est installée à l'écran
          d'accueil). */}
      <PushSubscribe />
      <AdminSidebar sections={sections} />
    </div>
  );
}
