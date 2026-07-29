import { LayoutGrid, CalendarDays, Users, Wallet, RefreshCw } from "lucide-react";
import TeamManager, { type TeamWithMembers } from "./team-manager";
import ImportInscriptions from "./import-inscriptions";
import ImportPlanning from "./import-planning";
import ImportCoaches from "./import-coaches";
import CotisationsTable from "./cotisations-table";
import AdminCalendar from "./admin-calendar";
import AdminSidebar, { type AdminSection } from "./admin-sidebar";
import FfbbManager from "./ffbb-manager";
import OverviewStats from "./overview-stats";
import type { AdminCotisation, AdminUpcomingEvent } from "./page";

type Person = { id: string; first_name: string | null; last_name: string | null };

export default function AdminView({
  clubFunction,
  teams,
  allProfiles,
  cotisations,
  upcomingEvents,
}: {
  clubFunction?: string | null;
  teams: TeamWithMembers[];
  allProfiles: Person[];
  cotisations: AdminCotisation[];
  upcomingEvents: AdminUpcomingEvent[];
}) {
  const teamRefs = teams.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
  }));

  const eventsByTeamId: Record<string, AdminUpcomingEvent[]> = {};
  upcomingEvents.forEach((e) => {
    if (!e.teamId) return;
    (eventsByTeamId[e.teamId] ??= []).push(e);
  });

  const iconClass = "h-4 w-4 shrink-0";
  const sections: AdminSection[] = [
    {
      key: "overview",
      label: "Aperçu",
      icon: <LayoutGrid className={iconClass} />,
      content: (
        <OverviewStats teamsCount={teams.length} members={allProfiles} />
      ),
    },
    {
      key: "calendar",
      label: "Calendrier",
      icon: <CalendarDays className={iconClass} />,
      content: <AdminCalendar events={upcomingEvents} />,
    },
    {
      key: "teams",
      label: "Équipes",
      icon: <Users className={iconClass} />,
      content: (
        <TeamManager
          teams={teams}
          allProfiles={allProfiles}
          eventsByTeamId={eventsByTeamId}
        />
      ),
    },
    {
      key: "cotisations",
      label: "Cotisations",
      icon: <Wallet className={iconClass} />,
      content: <CotisationsTable cotisations={cotisations} />,
    },
    {
      key: "ffbb",
      label: "FFBB",
      icon: <RefreshCw className={iconClass} />,
      content: (
        <div className="flex flex-col gap-4">
          <FfbbManager teams={teams} />
          <ImportInscriptions existingTeams={teamRefs} />
          <ImportPlanning existingTeams={teamRefs} />
          <ImportCoaches existingTeams={teamRefs} />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-ubac-yellow/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ubac-yellow-dark">
        Espace Bureau
        {clubFunction ? ` · ${clubFunction}` : ""}
      </span>
      <p className="text-sm text-zinc-500">
        Accès complet à la gestion du club.
      </p>

      <AdminSidebar sections={sections} />
    </div>
  );
}
