import {
  Building2,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  MessageCircle,
  RefreshCw,
  ScrollText,
  Shield,
  ShoppingBag,
  Trophy,
  Users,
} from "lucide-react";
import DocumentsPanel from "@/components/club-documents";
import ClubReportsSection from "./club-reports-section";
import Cd17LigueSection from "./cd17-ligue-section";
import { BOUTIQUE_URL } from "./boutique";
import CalendarView from "./calendar-view";
import CalendarSubscribe from "./calendar-subscribe";
import CoachTeams from "./coach-teams";
import CoachFfbb from "./coach-ffbb";
import CoachOrganisation, { type CoachTeamMatchCard } from "./coach-organisation";
import WhatsAppGroupsManager from "./whatsapp-groups-manager";
import SponsorsDisplay from "./sponsors-display";
import AdminSidebar, { type AdminSection } from "./admin-sidebar";
import type { TeamWithMembers } from "./team-manager";
import type {
  AdminBenevole,
  AdminMemberTeam,
  AdminPenalite,
  AdminUpcomingEvent,
  ClubReport,
  MemberDetail,
  SponsorDisplay,
  WhatsAppGroup,
} from "./page";
import type {
  CarpoolOffer,
  EventRoleType,
  EventTasksState,
  SeasonTaskTally,
} from "./event-tasks";
import type { VolunteerNeed } from "./event-volunteer-needs";
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
  rsvpNoteByKey,
  taskTallyByTeamId,
  teamRoleByTeamId,
  clubTeams,
  birthdayMembers,
  organisationCards,
  tasksByEventId,
  carpoolByEventId,
  whatsappGroups,
  eventRoles,
  volunteerNeedsByEventId = {},
  ownPlayerId,
  penalites = [],
  sponsorDisplay = [],
  clubReports,
  currentUserId,
  benevoles = [],
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
  // Retour de Cindy du 10/09 ("ce que j'apporte") : même principe, côté
  // Présent -- voir attendance-badges.tsx.
  rsvpNoteByKey: Record<string, string | null>;
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
  // Besoins en bénévoles d'un événement club (buvette...) — un coach qui
  // joue aussi dans une équipe ciblée doit pouvoir s'y inscrire depuis son
  // propre calendrier, comme n'importe quel joueur/parent. Optionnel : vide
  // par défaut plutôt qu'exigé partout où CoachView est instancié.
  volunteerNeedsByEventId?: Record<string, VolunteerNeed[]>;
  // Sa propre fiche joueur (players.profile_id = son compte), si elle
  // existe — un coach qui joue aussi dans une autre équipe doit pouvoir
  // répondre présent/absent pour LUI-MÊME sur ses propres matchs.
  ownPlayerId: string | null;
  // Lecture seule (retour de Cindy du 2026-08-22) : les pénalités des
  // joueurs de TOUTES les équipes de ce coach, saisies par le Bureau
  // (voir penalites-manager.tsx) — jamais de droit de saisie ici.
  penalites?: AdminPenalite[];
  sponsorDisplay?: SponsorDisplay[];
  clubReports: ClubReport[];
  // Retour de Cindy du 2026-09-01 : les comptes rendus COACH sont
  // désormais visibles par tous les coachs, mais seul leur auteur (compte
  // de connexion, pas la fiche joueur) peut les modifier/supprimer — voir
  // canEditRow dans club-reports-section.tsx.
  currentUserId: string;
  // Retour de Cindy du 06/09 ("pour tous ceux qui peuvent modifier un
  // événement ou en créer un : bureau et coach") : un coach peut désormais
  // lui aussi inviter un bénévole du club sur un événement de SA propre
  // équipe (voir create-event-form.tsx, section "Bénévoles invités" —
  // n'exige plus allowClubWide, seulement une liste non vide) — jamais le
  // droit de créer/modifier un bénévole lui-même, juste de l'inviter.
  benevoles?: AdminBenevole[];
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

  // Retour d'audit du 28/08 : un événement ciblant plusieurs équipes
  // précises (targetTeamIds) n'a pas de teamId — il n'apparaissait dans
  // "Prochains rendez-vous" d'AUCUNE des équipes qu'il vise pourtant
  // nommément.
  const eventsByTeamId: Record<string, AdminUpcomingEvent[]> = {};
  events.forEach((e) => {
    if (e.teamId) {
      (eventsByTeamId[e.teamId] ??= []).push(e);
    } else {
      e.targetTeamIds?.forEach((id) => {
        (eventsByTeamId[id] ??= []).push(e);
      });
    }
  });

  const resultsTeamsForCalendar = teams.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    role: teamRoleByTeamId[t.id] ?? "COACH",
  }));

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
            benevoles={benevoles}
            rsvp={{ players: rsvpPlayers, statusByKey: rsvpStatusByKey, noteByKey: rsvpNoteByKey }}
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
            scopeTeamRoleById={teamRoleByTeamId}
            // Retour de Cindy du 10/09 (fusion Calendrier/Événements) :
            // manquait ici alors que "Événements" (retiré plus bas) l'avait
            // déjà -- un coach qui encadre plusieurs équipes n'avait aucun
            // filtre par équipe sur son Calendrier, seulement sur
            // "Événements". Même sélecteur "pills" (une équipe active à la
            // fois, le défaut de CalendarView) que "Événements" avait.
            resultsTeams={resultsTeamsForCalendar}
            selfPlayerId={ownPlayerId}
            eventRoles={eventRoles}
            volunteerNeedsByEventId={volunteerNeedsByEventId}
            celebrateWins
          />
          <SponsorsDisplay sponsors={sponsorDisplay} />
        </div>
      ),
    },
    {
      // Retour de Cindy du 10/09 ("alléger l'onglet calendrier") : le lien
      // d'abonnement agenda quitte le Calendrier pour ce nouvel onglet,
      // volontairement second dans la liste (jamais premier — l'ouverture
      // de l'appli doit toujours se faire sur "Calendrier", voir
      // admin-sidebar.tsx : le premier onglet du tableau est l'onglet actif
      // par défaut). Premier contenu d'un onglet pensé pour accueillir
      // d'autres blocs secondaires plus tard.
      key: "dashboard",
      label: "Tableau de bord",
      icon: <LayoutDashboard className={iconClass} />,
      content: (
        <div className="flex flex-col gap-4">
          <CalendarSubscribe />
        </div>
      ),
    },
    {
      // Retour de Cindy du 2026-08-22 : "remettre les petits onglets bleu
      // comme avant" — retour au sélecteur pill compact (TeamSelectorPills,
      // via CoachTeams non forcé) plutôt qu'un sous-menu déroulant par
      // équipe+rôle. Reste un seul onglet de menu plat.
      key: "teams",
      label: teams.length > 1 ? "Équipes" : "Équipe",
      icon: <Users className={iconClass} />,
      content: (
        <div className="flex flex-col gap-4">
          {/* Retour de Cindy du 29/08 : la cotisation/présence personnelles
              d'un coach qui joue aussi lui-même vivent désormais dans
              l'onglet "Mon équipe" à part entière (page.tsx), plus ici en
              repli — ça évite de les montrer en double. "Pénalités de
              l'équipe" vit maintenant DANS CoachTeams (même retour du
              29/08) : elle doit être filtrée sur l'équipe actuellement
              sélectionnée dans son pill switcher, pas mélanger toutes les
              équipes coachées (ex. U13F + U13M pour Basile) dans une seule
              liste — impossible à faire correctement depuis ici, en dehors
              du composant qui connaît l'équipe active. */}
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
            penalites={penalites}
          />
        </div>
      ),
    },
    {
      // "Suivi" (retour de Cindy du 2026-08-21) redevient "Organisation et
      // Bilan" (retour de Cindy du 2026-08-22), maintenant en sous-menu
      // (retour de Cindy du 2026-08-22) plutôt qu'en bascule interne.
      key: "organisation",
      label: "Organisation & Bilan",
      icon: <ClipboardList className={iconClass} />,
      content: null,
      children: [
        {
          key: "organisation-planning",
          label: "Planning & Rôles",
          icon: <ClipboardList className={iconClass} />,
          content: (
            <CoachOrganisation
              cards={organisationCards}
              tasksByEventId={tasksByEventId}
              carpoolByEventId={carpoolByEventId}
              volunteerNeedsByEventId={volunteerNeedsByEventId}
              events={events}
              taskTallyByTeamId={taskTallyByTeamId}
              rsvpStatusByKey={rsvpStatusByKey}
              rsvpReasonByKey={rsvpReasonByKey}
              rsvpNoteByKey={rsvpNoteByKey}
              roles={eventRoles}
              ownPlayerId={ownPlayerId}
              forcedTab="planning"
            />
          ),
        },
        {
          key: "organisation-bilan",
          label: "Bilan de la saison",
          icon: <ListOrdered className={iconClass} />,
          content: (
            <CoachOrganisation
              cards={organisationCards}
              tasksByEventId={tasksByEventId}
              carpoolByEventId={carpoolByEventId}
              volunteerNeedsByEventId={volunteerNeedsByEventId}
              events={events}
              taskTallyByTeamId={taskTallyByTeamId}
              rsvpStatusByKey={rsvpStatusByKey}
              rsvpReasonByKey={rsvpReasonByKey}
              rsvpNoteByKey={rsvpNoteByKey}
              roles={eventRoles}
              ownPlayerId={ownPlayerId}
              forcedTab="bilan"
            />
          ),
        },
      ],
    },
    // Retour de Cindy du 10/09 (fusion Calendrier/Événements) : l'onglet
    // "Événements" qui vivait ici est retiré -- son filtre par équipe
    // (resultsTeams) a été reporté sur "Calendrier" ci-dessus, sa carte
    // d'événement (renderEventCard) et son icône mail étaient déjà
    // strictement identiques à celles de "Calendrier".
    {
      // Retour de Cindy du 2026-08-22 : "Matchs officiels" / "Résultats"
      // deviennent un vrai sous-menu (comme Organisation & Bilan) au lieu
      // d'un bouton interne sur la page — moins de contrôles empilés
      // quand il y a aussi le sélecteur d'équipe à afficher.
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
              events={events}
              createTeams={createTeams}
              benevoles={benevoles}
              rsvp={{ players: rsvpPlayers, statusByKey: rsvpStatusByKey, noteByKey: rsvpNoteByKey }}
              scopeTeams={teams.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
              scopeTeamRoleById={teamRoleByTeamId}
              forcedView="officialMatches"
              resultsTeams={resultsTeamsForCalendar}
              selfPlayerId={ownPlayerId}
              volunteerNeedsByEventId={volunteerNeedsByEventId}
              celebrateWins
            />
          ),
        },
        {
          key: "matches-results",
          label: "Résultats",
          icon: <ListOrdered className={iconClass} />,
          content: (
            <CalendarView
              events={events}
              createTeams={createTeams}
              benevoles={benevoles}
              rsvp={{ players: rsvpPlayers, statusByKey: rsvpStatusByKey, noteByKey: rsvpNoteByKey }}
              scopeTeams={teams.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
              scopeTeamRoleById={teamRoleByTeamId}
              forcedView="officialResults"
              resultsTeams={resultsTeamsForCalendar}
              selfPlayerId={ownPlayerId}
              volunteerNeedsByEventId={volunteerNeedsByEventId}
              celebrateWins
            />
          ),
        },
        {
          // Retour de Cindy du 10/09 : déplacé depuis "Vie du club" (en
          // dernier ici) — même déplacement que côté Bureau (admin-view.tsx).
          key: "ffbb",
          label: "FFBB",
          icon: <RefreshCw className={iconClass} />,
          content: <CoachFfbb teams={teams} teamRoleByTeamId={teamRoleByTeamId} />,
        },
      ],
    },
    {
      // Retour de Cindy du 30/08 : même sous-menu "Vie du club" que côté
      // Bureau (admin-view.tsx), réduit aux entrées qui concernent aussi un
      // coach (pas Sponsors/Bénévoles, réservés au Bureau). FFBB a depuis
      // rejoint "Matchs & Résultats" (retour de Cindy du 10/09).
      key: "club-life",
      label: "Vie du club",
      icon: <Building2 className={iconClass} />,
      content: null,
      children: [
        {
          // Retour de Cindy du 29/08 : "Commissions & Admin" (Bureau,
          // Coachs UBAC, Buvette...) vivait uniquement comme un bloc
          // attaché à l'onglet Équipe, redondant pour qui cumule aussi le
          // Bureau (même liste que "Vie du club" -> "Groupes WhatsApp"
          // là-bas) — mais c'était le SEUL accès pour un coach sans accès
          // Bureau (ex. à son propre groupe "Coachs UBAC"). Un vrai onglet
          // dédié ici plutôt qu'une suppression pure et simple.
          // WhatsAppGroupsManager gère déjà canManage par groupe (RLS),
          // donc un coach ne voit le crayon d'édition que sur les groupes
          // qu'il gère réellement (sa propre équipe) — rien de plus exposé
          // qu'avant.
          key: "whatsapp",
          label: "Groupes WhatsApp",
          icon: <MessageCircle className={iconClass} />,
          content: <WhatsAppGroupsManager groups={whatsappGroups} teams={clubTeams} />,
        },
        {
          // Retour de Cindy du 26/08 : les 3 documents sur tous les
          // espaces sauf Bénévoles (Règlement Intérieur seul là-bas) —
          // voir club-documents.tsx.
          key: "documents",
          label: "Documents",
          icon: <ScrollText className={iconClass} />,
          content: (
            <div className="flex flex-col gap-4">
              <DocumentsPanel
                documentIds={["charte-joueur", "charte-parent", "reglement-interieur"]}
              />
              {/* Comptes rendus (retour de Cindy du 2026-09-01) : un coach
                  consulte Mairies/Bureau (lecture seule) et voit AUSSI les
                  comptes rendus de tous les coachs (pas seulement les
                  siens — correction du 2026-09-01, "ce n'est pas ce que
                  j'ai demandé") ; isAdmin={false} + currentUserId : il ne
                  peut modifier/supprimer que ceux qu'il a lui-même écrits
                  (les lignes Mairies/Bureau, jamais créées par un coach,
                  restent donc non modifiables ici quoi qu'il arrive).
                  CD17/Ligue viendra plus tard, volontairement en dernier. */}
              <ClubReportsSection
                category="MAIRIE"
                title="Comptes rendus mairies"
                emptyLabel="Aucun compte rendu de réunion avec une mairie pour le moment."
                canCreate={false}
                isAdmin={false}
                currentUserId={currentUserId}
                reports={clubReports}
              />
              <ClubReportsSection
                category="BUREAU"
                title="Comptes rendus bureau"
                emptyLabel="Aucun compte rendu de réunion du Bureau pour le moment."
                canCreate={false}
                isAdmin={false}
                currentUserId={currentUserId}
                reports={clubReports}
              />
              <ClubReportsSection
                category="COACH"
                title="Comptes rendus des coachs"
                emptyLabel="Aucun compte rendu de coach pour le moment."
                canCreate
                isAdmin={false}
                currentUserId={currentUserId}
                showAuthor
                reports={clubReports}
              />
              {/* CD17/Ligue : consultation seule pour un coach, jamais de
                  dépôt (canUpload={false}) — voir cd17-ligue-section.tsx. */}
              <Cd17LigueSection canUpload={false} reports={clubReports} />
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
      {/* Retour de Cindy du 29/08 : la relance de présence d'un coach qui
          joue aussi lui-même vit désormais dans l'onglet "Mon équipe" à
          part entière (FamilyView la rend déjà en tête, voir page.tsx) —
          plus ici en repli. */}
      <AdminSidebar sections={sections} />
    </div>
  );
}
