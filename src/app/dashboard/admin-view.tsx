import {
  CalendarDays,
  Contact,
  Heart,
  LayoutDashboard,
  MessageCircle,
  Trophy,
  Users,
  Wallet,
  RefreshCw,
} from "lucide-react";
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
import BureauDashboard from "./bureau-dashboard";
import type { AutomationKey } from "./automation-settings";
import type {
  AdminCategoryTariff,
  AdminCollecte,
  AdminCotisation,
  AdminMember,
  AdminUpcomingEvent,
  WhatsAppGroup,
} from "./page";
import type { BirthdaySource } from "./birthdays";
import type { EventRoleType } from "./event-tasks";
import type { VolunteerNeed } from "./event-volunteer-needs";

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
  automationSettings,
  eventRoles,
  volunteerNeedsByEventId,
  familySection = null,
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
  automationSettings: Record<AutomationKey, boolean>;
  // Catalogue des rôles d'organisation (buvette, table de marque...) et
  // besoins déjà définis par événement — pour créer/gérer les besoins en
  // bénévoles directement depuis la carte de l'événement.
  eventRoles: EventRoleType[];
  volunteerNeedsByEventId: Record<string, VolunteerNeed[]>;
  // Repris de l'espace Parent (family-view.tsx) : un membre du Bureau qui
  // a aussi des enfants (ou sa propre fiche joueur) n'a plus un onglet
  // "Mon espace" séparé, du même poids que "Bureau" — sa vie de parent
  // devient une section ici, comme l'a été "Mes Équipes" pour un coach
  // sans enfant (voir page.tsx, foldFamilyIntoCoach/foldFamilyIntoAdmin).
  familySection?: React.ReactNode;
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
      // Premier onglet, avant Calendrier : le Bureau atterrissait jusqu'ici
      // directement dans le détail (grille du mois), sans jamais voir de
      // résumé "où est-ce que ça coince" avant d'ouvrir un onglet précis.
      key: "home",
      label: "Accueil",
      icon: <LayoutDashboard className={iconClass} />,
      content: (
        <BureauDashboard
          cotisations={cotisations}
          members={members}
          teams={teams}
          events={upcomingEvents}
          automationSettings={automationSettings}
        />
      ),
    },
    ...(familySection
      ? [
          {
            // Juste après "Accueil" : c'est la partie personnelle, avant
            // les outils de gestion du club qui suivent.
            key: "family",
            label: "Ma famille",
            icon: <Heart className={iconClass} />,
            content: familySection,
          },
        ]
      : []),
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
          eventRoles={eventRoles}
          volunteerNeedsByEventId={volunteerNeedsByEventId}
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
      key: "results",
      label: "Résultats",
      icon: <Trophy className={iconClass} />,
      content: (
        <CalendarView
          events={upcomingEvents}
          createTeams={teamRefs}
          allowClubWide
          forcedView="results"
          // Sans ça, toutes les équipes du club défilaient dans un seul
          // fil de ~200 matchs sur la saison — même sélecteur que côté
          // Coach/Parents (voir calendar-view.tsx), une équipe à la fois.
          resultsTeams={teamRefs}
        />
      ),
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: <MessageCircle className={iconClass} />,
      content: <WhatsAppGroupsManager groups={whatsappGroups} teams={canonicalTeamRefs} />,
    },
    {
      key: "ffbb",
      label: "FFBB",
      icon: <RefreshCw className={iconClass} />,
      content: (
        <div className="flex flex-col gap-4">
          <FfbbManager teams={teams} />
          <ImportInscriptions />
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
