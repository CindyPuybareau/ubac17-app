import { CalendarDays, Users } from "lucide-react";
import CalendarView from "./calendar-view";
import AdminSidebar, { type AdminSection } from "./admin-sidebar";
import CoachTeams from "./coach-teams";
import type { TeamWithMembers } from "./team-manager";
import type { AdminUpcomingEvent, MemberDetail } from "./page";

export default function CoachView({
  teams,
  events,
  contactPhoneByPlayerId,
  memberDetailsByPlayerId,
}: {
  teams: TeamWithMembers[];
  events: AdminUpcomingEvent[];
  contactPhoneByPlayerId: Record<string, string>;
  memberDetailsByPlayerId: Record<string, MemberDetail>;
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
      content: <CalendarView events={events} createTeams={createTeams} />,
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
          memberDetailsByPlayerId={memberDetailsByPlayerId}
        />
      ),
    },
  ];

  return <AdminSidebar sections={sections} />;
}
