import { CalendarDays, Dumbbell, Trophy, Users } from "lucide-react";
import CalendarView from "./calendar-view";
import CoachTeams from "./coach-teams";
import CoachTrainings from "./coach-trainings";
import CoachFfbb from "./coach-ffbb";
import AdminSidebar, { type AdminSection } from "./admin-sidebar";
import type { TeamWithMembers } from "./team-manager";
import type { AdminUpcomingEvent, MemberDetail } from "./page";
import type { SeasonTaskTally } from "./event-tasks";
import type { BirthdayEntry, BirthdaySource } from "./birthdays";

export default function CoachView({
  teams,
  events,
  contactPhoneByPlayerId,
  contactEmailByPlayerId,
  memberDetailsByPlayerId,
  rsvpPlayers,
  rsvpStatusByKey,
  taskTallyByTeamId,
  birthdayEntries,
}: {
  teams: TeamWithMembers[];
  events: AdminUpcomingEvent[];
  contactPhoneByPlayerId: Record<string, string>;
  contactEmailByPlayerId: Record<string, string>;
  memberDetailsByPlayerId: Record<string, MemberDetail>;
  rsvpPlayers: { id: string; name: string; teamIds: string[] }[];
  rsvpStatusByKey: Record<string, string>;
  taskTallyByTeamId: Record<string, SeasonTaskTally>;
  birthdayEntries: BirthdayEntry<BirthdaySource>[];
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
          birthdayEntries={birthdayEntries}
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
  ];

  return <AdminSidebar sections={sections} />;
}
