import { CalendarDays, Contact, MessageCircle, Users, Wallet, RefreshCw } from "lucide-react";
import TeamManager, { type TeamWithMembers } from "./team-manager";
import ImportInscriptions from "./import-inscriptions";
import ImportPlanning from "./import-planning";
import ImportCoaches from "./import-coaches";
import CotisationsManager from "./cotisations-manager";
import CalendarView from "./calendar-view";
import MembersTable from "./members-table";
import AdminSidebar, { type AdminSection } from "./admin-sidebar";
import FfbbManager from "./ffbb-manager";
import WhatsAppGroupsManager from "./whatsapp-groups-manager";
import type {
  AdminCategoryTariff,
  AdminCollecte,
  AdminCotisation,
  AdminMember,
  AdminUpcomingEvent,
  WhatsAppGroup,
} from "./page";
import type { BirthdaySource } from "./birthdays";

type Person = { id: string; first_name: string | null; last_name: string | null };

export default function AdminView({
  clubFunction,
  teams,
  allProfiles,
  cotisations,
  collectes,
  categoryTariffs,
  upcomingEvents,
  contactPhoneByPlayerId,
  members,
  birthdayMembers,
  canonicalTeamRefs,
  whatsappGroups,
}: {
  clubFunction?: string | null;
  teams: TeamWithMembers[];
  allProfiles: Person[];
  cotisations: AdminCotisation[];
  collectes: AdminCollecte[];
  categoryTariffs: AdminCategoryTariff[];
  upcomingEvents: AdminUpcomingEvent[];
  contactPhoneByPlayerId: Record<string, string>;
  members: AdminMember[];
  birthdayMembers: BirthdaySource[];
  canonicalTeamRefs: { id: string; name: string | null; category: string | null }[];
  whatsappGroups: WhatsAppGroup[];
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
      key: "calendar",
      label: "Calendrier",
      icon: <CalendarDays className={iconClass} />,
      content: (
        <CalendarView
          events={upcomingEvents}
          createTeams={teamRefs}
          allowClubWide
          birthdayMembers={birthdayMembers}
        />
      ),
    },
    {
      key: "members",
      label: "Membres",
      icon: <Contact className={iconClass} />,
      content: (
        <MembersTable members={members} teams={canonicalTeamRefs} />
      ),
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
          contactPhoneByPlayerId={contactPhoneByPlayerId}
        />
      ),
    },
    {
      key: "cotisations",
      label: "Cotisations",
      icon: <Wallet className={iconClass} />,
      content: (
        <CotisationsManager
          cotisations={cotisations}
          collectes={collectes}
          members={members}
          categoryTariffs={categoryTariffs}
          canonicalTeamRefs={canonicalTeamRefs}
        />
      ),
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: <MessageCircle className={iconClass} />,
      content: (
        <WhatsAppGroupsManager
          groups={whatsappGroups}
          candidates={members
            .filter((m) => !m.archivedAt)
            .map((m) => ({
              id: m.id,
              firstName: m.firstName,
              lastName: m.lastName,
            }))}
        />
      ),
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
      <span className="inline-flex w-fit items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-ubac-yellow/15 px-3 py-1 text-xs font-semibold uppercase leading-none tracking-wide text-ubac-yellow-dark">
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
