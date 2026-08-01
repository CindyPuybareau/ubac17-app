import { CalendarDays, ClipboardList, Dumbbell, MessageCircle, Trophy, Users } from "lucide-react";
import CalendarView from "./calendar-view";
import CoachTeams from "./coach-teams";
import CoachTrainings from "./coach-trainings";
import CoachFfbb from "./coach-ffbb";
import CoachOrganisation, { type CoachTeamMatchCard } from "./coach-organisation";
import AdminSidebar, { type AdminSection } from "./admin-sidebar";
import WhatsAppGroupsManager from "./whatsapp-groups-manager";
import type { TeamWithMembers } from "./team-manager";
import type { AdminUpcomingEvent, MemberDetail, WhatsAppGroup } from "./page";
import type { CarpoolOffer, EventTasksState, SeasonTaskTally } from "./event-tasks";
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
  birthdayMembers,
  organisationCards,
  tasksByEventId,
  carpoolByEventId,
  whatsappGroups,
}: {
  teams: TeamWithMembers[];
  events: AdminUpcomingEvent[];
  contactPhoneByPlayerId: Record<string, string>;
  contactEmailByPlayerId: Record<string, string>;
  memberDetailsByPlayerId: Record<string, MemberDetail>;
  rsvpPlayers: { id: string; name: string; teamIds: string[] }[];
  rsvpStatusByKey: Record<string, string>;
  taskTallyByTeamId: Record<string, SeasonTaskTally>;
  birthdayMembers: BirthdaySource[];
  organisationCards: CoachTeamMatchCard[];
  tasksByEventId: Record<string, EventTasksState>;
  carpoolByEventId: Record<string, CarpoolOffer[]>;
  whatsappGroups: WhatsAppGroup[];
}) {
  const createTeams = teams.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
  }));

  const eventsByTeamId: Record<string, AdminUpcomingEvent[]> = {};
  events.forEach((e) => {
    if (!e.teamId) return;
    (eventsByTeamId[e.teamId] ??= []).push(e);
  });

  const whatsappCandidatesById = new Map<
    string,
    { id: string; firstName: string | null; lastName: string | null }
  >();
  teams.forEach((t) => {
    t.players.forEach((p) => {
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
        />
      ),
    },
    {
      key: "teams",
      label: "Équipe(s)",
      icon: <Users className={iconClass} />,
      content: (
        <CoachTeams
          teams={teams}
          allProfiles={[]}
          eventsByTeamId={eventsByTeamId}
          contactPhoneByPlayerId={contactPhoneByPlayerId}
          memberDetailsByPlayerId={memberDetailsByPlayerId}
          taskTallyByTeamId={taskTallyByTeamId}
        />
      ),
    },
    {
      key: "organisation",
      label: "Organisation",
      icon: <ClipboardList className={iconClass} />,
      content: (
        <CoachOrganisation
          cards={organisationCards}
          tasksByEventId={tasksByEventId}
          carpoolByEventId={carpoolByEventId}
        />
      ),
    },
    {
      key: "trainings",
      label: "Entraînements",
      icon: <Dumbbell className={iconClass} />,
      content: (
        <CoachTrainings teams={teams} events={events} rsvpStatusByKey={rsvpStatusByKey} />
      ),
    },
    {
      key: "ffbb",
      label: "FFBB",
      icon: <Trophy className={iconClass} />,
      content: <CoachFfbb teams={teams} />,
    },
    {
      key: "whatsapp",
      label: "Groupes WhatsApp",
      icon: <MessageCircle className={iconClass} />,
      content: (
        <WhatsAppGroupsManager groups={whatsappGroups} candidates={whatsappCandidates} />
      ),
    },
  ];

  return <AdminSidebar sections={sections} />;
}
