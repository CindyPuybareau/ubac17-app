import {
  Building2,
  CalendarDays,
  Contact,
  Flag,
  Gavel,
  HandHeart,
  Handshake,
  ListOrdered,
  LogOut,
  MessageCircle,
  ScrollText,
  Shield,
  ShoppingBag,
  Tag,
  Ticket,
  Trophy,
  Users,
  Wallet,
  RefreshCw,
} from "lucide-react";
import DocumentsPanel from "@/components/club-documents";
import ClubReportsSection from "./club-reports-section";
import { BOUTIQUE_URL } from "./boutique";
import TeamManager, { type Person, type TeamWithMembers } from "./team-manager";
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
import SponsorsDisplay from "./sponsors-display";
import BenevolesManager from "./benevoles-manager";
import BureauDashboard from "./bureau-dashboard";
import type { AutomationKey } from "./automation-settings";
import type {
  AdminBenevole,
  AdminCategoryTariff,
  AdminCollecte,
  AdminCotisation,
  AdminMember,
  AdminPenalite,
  AdminSponsor,
  AdminUpcomingEvent,
  ClubReport,
  MemberDetail,
  SponsorDisplay,
  WhatsAppGroup,
} from "./page";
import type { BirthdaySource } from "./birthdays";
import type { EventRoleType } from "./event-tasks";
import type { VolunteerNeed } from "./event-volunteer-needs";

export default function AdminView({
  clubFunction,
  teams,
  allProfiles,
  cotisations,
  collectes,
  categoryTariffs,
  upcomingEvents,
  contactPhoneByPlayerId,
  contactEmailByPlayerId,
  members,
  birthdayMembers,
  canonicalTeamRefs,
  whatsappGroups,
  sponsors,
  sponsorDisplay,
  benevoles,
  penalites,
  automationSettings,
  eventRoles,
  volunteerNeedsByEventId,
  clubReports,
}: {
  clubFunction?: string | null;
  teams: TeamWithMembers[];
  allProfiles: Person[];
  cotisations: AdminCotisation[];
  collectes: AdminCollecte[];
  categoryTariffs: AdminCategoryTariff[];
  upcomingEvents: AdminUpcomingEvent[];
  contactPhoneByPlayerId: Record<string, string>;
  contactEmailByPlayerId: Record<string, string>;
  members: AdminMember[];
  birthdayMembers: BirthdaySource[];
  canonicalTeamRefs: { id: string; name: string | null; category: string | null }[];
  whatsappGroups: WhatsAppGroup[];
  sponsors: AdminSponsor[];
  sponsorDisplay: SponsorDisplay[];
  benevoles: AdminBenevole[];
  penalites: AdminPenalite[];
  automationSettings: Record<AutomationKey, boolean>;
  // Catalogue des rôles d'organisation (buvette, table de marque...) et
  // besoins déjà définis par événement — pour créer/gérer les besoins en
  // bénévoles directement depuis la carte de l'événement.
  eventRoles: EventRoleType[];
  volunteerNeedsByEventId: Record<string, VolunteerNeed[]>;
  clubReports: ClubReport[];
}) {
  const teamRefs = teams.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
  }));

  // Retour d'audit du 28/08 : un événement ciblant plusieurs équipes
  // précises (targetTeamIds) n'a pas de teamId — il n'apparaissait dans
  // "Prochains rendez-vous" d'AUCUNE des équipes qu'il vise pourtant
  // nommément.
  const eventsByTeamId: Record<string, AdminUpcomingEvent[]> = {};
  upcomingEvents.forEach((e) => {
    if (e.teamId) {
      (eventsByTeamId[e.teamId] ??= []).push(e);
    } else {
      e.targetTeamIds?.forEach((id) => {
        (eventsByTeamId[id] ??= []).push(e);
      });
    }
  });

  // AdminMember est un MemberDetail (+ des champs propres au Bureau) : pas
  // besoin d'une requête séparée, ce même tableau ré-indexé par id sert de
  // memberDetailsByPlayerId pour "Affecter à une autre équipe" dans
  // l'onglet Équipes (voir team-card.tsx) — même donnée déjà chargée pour
  // la table Membres.
  const memberDetailsByPlayerId: Record<string, MemberDetail> = Object.fromEntries(
    members.map((m) => [m.id, m])
  );
  // Retour de Cindy du 29/08 (Basile LAMOURET, coach sans numéro/email/
  // statut alors que sa fiche membre les a) : team-card.tsx cherche les
  // coachs par l'id de leur COMPTE (team_coaches.coach_id), jamais par
  // celui de leur fiche joueur — sans cette deuxième clé, un coach qui a
  // aussi une fiche Membre (ex. Basile, joueur Séniors 1) ne la retrouvait
  // jamais depuis sa ligne de coach. Même correctif déjà en place côté
  // Coach (page.tsx, coachMemberDetailsByPlayerId) — jamais répercuté ici.
  members.forEach((m) => {
    if (m.profileId) memberDetailsByPlayerId[m.profileId] = m;
  });

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
        <div className="flex flex-col gap-4">
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
            benevoles={benevoles}
          />
          <SponsorsDisplay sponsors={sponsorDisplay} />
        </div>
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
          contactEmailByPlayerId={contactEmailByPlayerId}
          memberDetailsByPlayerId={memberDetailsByPlayerId}
          clubTeams={canonicalTeamRefs}
          whatsappGroups={whatsappGroups}
        />
      ),
    },
    {
      // Sous-menu (retour de Cindy du 2026-08-22) : "cotisations et
      // licences" / "évenements payants" / "pénalités". La section
      // parente n'a plus de contenu propre, elle ne fait plus que
      // déplier/replier — chaque enfant verrouille CotisationsManager sur
      // son propre onglet interne (voir forcedTab). Renommé "Paiements"
      // (retour de Cindy du 29/08, menu Bureau à simplifier) : "Cotisations"
      // se répétait avec son propre premier sous-onglet "Cotisations &
      // Licences", et le groupe couvre plus large (pénalités aussi). key
      // inchangée pour ne pas casser un lien profond "?section=cotisations"
      // déjà partagé.
      key: "cotisations",
      label: "Paiements",
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
          benevoles={benevoles}
          allowClubWide
          forcedView="clubEvents"
          resultsTeams={teamRefs}
          resultsTeamSelector="dropdown"
          eventRoles={eventRoles}
          volunteerNeedsByEventId={volunteerNeedsByEventId}
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
              benevoles={benevoles}
              allowClubWide
              forcedView="officialMatches"
              resultsTeams={teamRefs}
              resultsTeamSelector="dropdown"
              eventRoles={eventRoles}
              volunteerNeedsByEventId={volunteerNeedsByEventId}
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
              benevoles={benevoles}
              allowClubWide
              forcedView="officialResults"
              resultsTeams={teamRefs}
              resultsTeamSelector="dropdown"
              eventRoles={eventRoles}
              volunteerNeedsByEventId={volunteerNeedsByEventId}
            />
          ),
        },
      ],
    },
    {
      // Regroupement (retour de Cindy du 29/08, menu Bureau à simplifier) :
      // ces 6 onglets sont des ressources/outils annexes consultés
      // ponctuellement, pas des outils du quotidien comme Membres/Équipes/
      // Paiements — les sortir du premier niveau fait passer le Bureau de
      // 12 à 7 entrées. keys inchangées (sponsors/benevoles/ffbb/whatsapp/
      // documents/boutique) : sectionExists/findSection cherchent
      // récursivement dans les enfants, donc un lien profond
      // "?openGroup=…" (implique la section "whatsapp") continue de
      // fonctionner tel quel une fois nichée ici.
      key: "club-life",
      label: "Vie du club",
      icon: <Building2 className={iconClass} />,
      content: null,
      children: [
        {
          key: "sponsors",
          label: "Sponsors",
          icon: <Handshake className={iconClass} />,
          content: <SponsorsManager sponsors={sponsors} />,
        },
        {
          // Retour de Cindy du 2026-08-25 : membres non-joueurs mobilisables
          // pour les besoins d'organisation (buvette, table de marque...)
          // d'un événement, sans être ni joueur ni forcément parent — voir
          // benevoles-manager.tsx et la section "Bénévoles invités" sur
          // CreateEventForm.
          key: "benevoles",
          label: "Bénévoles",
          icon: <HandHeart className={iconClass} />,
          content: <BenevolesManager benevoles={benevoles} />,
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
          // Retour de Cindy du 25/08 : le Bureau voit les 3 documents
          // (comme partout ailleurs dans l'app, le Bureau a une vision à
          // 100%) — voir club-documents.tsx pour le contenu et la
          // répartition par rôle.
          key: "documents",
          label: "Documents",
          icon: <ScrollText className={iconClass} />,
          content: (
            <div className="flex flex-col gap-4">
              <DocumentsPanel
                documentIds={["charte-joueur", "charte-parent", "reglement-interieur"]}
              />
              {/* Comptes rendus (retour de Cindy du 2026-09-01) : texte
                  simple rédigé dans l'appli, jamais un fichier déposé pour
                  ces trois catégories — voir club-reports-section.tsx.
                  isAdmin={true} : le Bureau peut tout modifier/supprimer,
                  y compris les comptes rendus des coachs — RLS
                  (is_club_admin()) l'autorise déjà côté base. CD17/Ligue
                  (fichier verrouillé après dépôt) viendra dans un second
                  temps, volontairement laissé pour la fin. */}
              <ClubReportsSection
                category="MAIRIE"
                title="Comptes rendus mairies"
                emptyLabel="Aucun compte rendu de réunion avec une mairie pour le moment."
                canCreate
                isAdmin
                reports={clubReports}
              />
              <ClubReportsSection
                category="BUREAU"
                title="Comptes rendus Bureau"
                emptyLabel="Aucun compte rendu de réunion du Bureau pour le moment."
                canCreate
                isAdmin
                reports={clubReports}
              />
              {/* Retour de Cindy du 2026-09-01 ("ce n'est pas ce que j'ai
                  demandé") : le Bureau voit AUSSI les comptes rendus des
                  coachs (jamais n'en rédige depuis cet écran, canCreate
                  false) — showAuthor pour savoir qui a écrit quoi, plusieurs
                  coachs partageant cette même liste. */}
              <ClubReportsSection
                category="COACH"
                title="Comptes rendus des coachs"
                emptyLabel="Aucun compte rendu de coach pour le moment."
                canCreate={false}
                isAdmin
                showAuthor
                reports={clubReports}
              />
            </div>
          ),
        },
        {
          // Un lien externe, pas un onglet de contenu (voir href sur AdminSection).
          key: "boutique",
          label: "Boutique en ligne",
          icon: <ShoppingBag className={iconClass} />,
          content: null,
          href: BOUTIQUE_URL,
        },
      ],
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
      <span className="inline-flex w-fit items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-ubac-yellow/15 px-3 py-1 text-xs font-semibold uppercase leading-none text-ubac-yellow-dark">
        Espace Bureau
        {clubFunction ? ` · ${clubFunction}` : ""}
      </span>

      <AdminSidebar sections={sections} />
    </div>
  );
}
