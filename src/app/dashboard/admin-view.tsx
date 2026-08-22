import {
  CalendarDays,
  Contact,
  Flag,
  Gavel,
  Handshake,
  Heart,
  ListOrdered,
  LogOut,
  MessageCircle,
  Shield,
  ShoppingBag,
  Tag,
  Ticket,
  Trophy,
  Users,
  Wallet,
  RefreshCw,
} from "lucide-react";
import { BOUTIQUE_URL } from "./boutique";
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
import SponsorsManager from "./sponsors-manager";
import BureauDashboard from "./bureau-dashboard";
import type { AutomationKey } from "./automation-settings";
import type {
  AdminCategoryTariff,
  AdminCollecte,
  AdminCotisation,
  AdminMember,
  AdminPenalite,
  AdminSponsor,
  AdminUpcomingEvent,
  MemberDetail,
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
  sponsors,
  penalites,
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
  sponsors: AdminSponsor[];
  penalites: AdminPenalite[];
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

  // AdminMember est un MemberDetail (+ des champs propres au Bureau) : pas
  // besoin d'une requête séparée, ce même tableau ré-indexé par id sert de
  // memberDetailsByPlayerId pour "Affecter à une autre équipe" dans
  // l'onglet Équipes (voir team-card.tsx) — même donnée déjà chargée pour
  // la table Membres.
  const memberDetailsByPlayerId: Record<string, MemberDetail> = Object.fromEntries(
    members.map((m) => [m.id, m])
  );

  const iconClass = "h-4 w-4 shrink-0";
  const sections: AdminSection[] = [
    {
      // Premier onglet : fusionné avec l'ancien onglet "Calendrier" séparé
      // (retour de Cindy du 2026-08-21 : "l'onglet accueil devrait être
      // calendrier et intégrer l'onglet existant 'calendrier'), pour ne
      // plus avoir à ouvrir deux onglets pour voir "où est-ce que ça
      // coince" PUIS le planning complet. Le résumé (chiffres clés,
      // prochain événement, alertes) reste en haut, le calendrier complet
      // juste en dessous.
      key: "home",
      label: "Calendrier",
      icon: <CalendarDays className={iconClass} />,
      content: (
        <BureauDashboard
          cotisations={cotisations}
          members={members}
          events={upcomingEvents}
          automationSettings={automationSettings}
          createTeams={teamRefs}
          birthdayMembers={birthdayMembers}
          eventRoles={eventRoles}
          volunteerNeedsByEventId={volunteerNeedsByEventId}
          sponsors={sponsors}
          penalites={penalites}
        />
      ),
    },
    ...(familySection
      ? [
          {
            // Juste après le premier onglet : c'est la partie personnelle,
            // avant les outils de gestion du club qui suivent.
            key: "family",
            label: "Ma famille",
            icon: <Heart className={iconClass} />,
            content: familySection,
          },
        ]
      : []),
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
          memberDetailsByPlayerId={memberDetailsByPlayerId}
          clubTeams={canonicalTeamRefs}
        />
      ),
    },
    {
      // Sous-menu (retour de Cindy du 2026-08-22) : "cotisations et
      // licences" / "évenements payants" / "pénalités". La section
      // parente n'a plus de contenu propre, elle ne fait plus que
      // déplier/replier — chaque enfant verrouille CotisationsManager sur
      // son propre onglet interne (voir forcedTab).
      key: "cotisations",
      label: "Cotisations",
      icon: <Wallet className={iconClass} />,
      content: null,
      children: [
        {
          key: "cotisations-licences",
          label: "Cotisations & Licences",
          icon: <Tag className={iconClass} />,
          content: (
            <CotisationsManager
              cotisations={cotisations}
              collectes={collectes}
              members={members}
              categoryTariffs={categoryTariffs}
              canonicalTeamRefs={canonicalTeamRefs}
              penalites={penalites}
              forcedTab="cotisations"
            />
          ),
        },
        {
          key: "cotisations-evenements",
          label: "Événements payants",
          icon: <Ticket className={iconClass} />,
          content: (
            <CotisationsManager
              cotisations={cotisations}
              collectes={collectes}
              members={members}
              categoryTariffs={categoryTariffs}
              canonicalTeamRefs={canonicalTeamRefs}
              penalites={penalites}
              forcedTab="collectes"
            />
          ),
        },
        {
          key: "cotisations-penalites",
          label: "Pénalités",
          icon: <Gavel className={iconClass} />,
          content: (
            <CotisationsManager
              cotisations={cotisations}
              collectes={collectes}
              members={members}
              categoryTariffs={categoryTariffs}
              canonicalTeamRefs={canonicalTeamRefs}
              penalites={penalites}
              forcedTab="penalites"
            />
          ),
        },
      ],
    },
    {
      // Retour de Cindy du 2026-08-22 : "Événements" regroupe tout le
      // calendrier du club sauf les matchs officiels, avec le sélecteur
      // d'équipe façon case à cocher de l'onglet "Équipes" du Bureau
      // (TeamFilterDropdown, voir resultsTeamSelector="dropdown" sur
      // CalendarView) plutôt que le sélecteur compact "une équipe à la
      // fois" utilisé côté Coach.
      key: "events",
      label: "Événements",
      icon: <Flag className={iconClass} />,
      content: (
        <CalendarView
          events={upcomingEvents}
          createTeams={teamRefs}
          allowClubWide
          forcedView="clubEvents"
          resultsTeams={teamRefs}
          resultsTeamSelector="dropdown"
        />
      ),
    },
    {
      // Retour de Cindy du 2026-08-22 : "Matchs officiels" / "Résultats"
      // deviennent un vrai sous-menu (comme Cotisations) au lieu d'un
      // bouton interne sur la page.
      key: "matches",
      label: "Matchs & Résultats",
      icon: <Trophy className={iconClass} />,
      content: null,
      children: [
        {
          key: "matches-official",
          label: "Matchs officiels",
          icon: <Shield className={iconClass} />,
          content: (
            <CalendarView
              events={upcomingEvents}
              createTeams={teamRefs}
              allowClubWide
              forcedView="officialMatches"
              resultsTeams={teamRefs}
              resultsTeamSelector="dropdown"
            />
          ),
        },
        {
          key: "matches-results",
          label: "Résultats",
          icon: <ListOrdered className={iconClass} />,
          content: (
            <CalendarView
              events={upcomingEvents}
              createTeams={teamRefs}
              allowClubWide
              forcedView="officialResults"
              resultsTeams={teamRefs}
              resultsTeamSelector="dropdown"
            />
          ),
        },
      ],
    },
    {
      key: "sponsors",
      label: "Sponsors",
      icon: <Handshake className={iconClass} />,
      content: <SponsorsManager sponsors={sponsors} />,
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
    {
      // Retour de Cindy du 2026-08-22 : renommé et déplacé après FFBB
      // (était juste après "Événements et Résultats").
      key: "whatsapp",
      label: "Groupes WhatsApp",
      icon: <MessageCircle className={iconClass} />,
      content: <WhatsAppGroupsManager groups={whatsappGroups} teams={canonicalTeamRefs} />,
    },
    {
      // Un lien externe, pas un onglet de contenu (voir href sur AdminSection).
      key: "boutique",
      label: "Boutique en ligne",
      icon: <ShoppingBag className={iconClass} />,
      content: null,
      href: BOUTIQUE_URL,
    },
    {
      // Tout à la fin du menu (retour de Cindy du 2026-08-22) — déplacé
      // depuis la bande bleue.
      key: "logout",
      label: "Déconnexion",
      icon: <LogOut className={iconClass} />,
      content: null,
      logoutAction: "supabase",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <span className="inline-flex w-fit items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-ubac-yellow/15 px-3 py-1 text-xs font-semibold uppercase leading-none tracking-wide text-ubac-yellow-dark">
        Espace Bureau
        {clubFunction ? ` · ${clubFunction}` : ""}
      </span>

      <AdminSidebar sections={sections} />
    </div>
  );
}
