import {
  CalendarDays,
  ClipboardList,
  Flag,
  ListOrdered,
  LogOut,
  RefreshCw,
  ScrollText,
  Shield,
  ShoppingBag,
  Trophy,
  Users,
} from "lucide-react";
import DocumentsPanel from "@/components/club-documents";
import { BOUTIQUE_URL } from "./boutique";
import CalendarView from "./calendar-view";
import CalendarSubscribe from "./calendar-subscribe";
import CoachTeams, { CoachCommissionGroups } from "./coach-teams";
import CoachFfbb from "./coach-ffbb";
import CoachOrganisation, { type CoachTeamMatchCard } from "./coach-organisation";
import AdminSidebar, { type AdminSection } from "./admin-sidebar";
import type { TeamWithMembers } from "./team-manager";
import type {
  AdminMemberTeam,
  AdminPenalite,
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
import type { VolunteerNeed } from "./event-volunteer-needs";
import type { BirthdaySource } from "./birthdays";
import type { ConvocationCard } from "./family-data";

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
  volunteerNeedsByEventId = {},
  ownPlayerId,
  ownPlayerNextEvent = null,
  penalites = [],
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
  // Besoins en bénévoles d'un événement club (buvette...) — un coach qui
  // joue aussi dans une équipe ciblée doit pouvoir s'y inscrire depuis son
  // propre calendrier, comme n'importe quel joueur/parent. Optionnel : vide
  // par défaut plutôt qu'exigé partout où CoachView est instancié.
  volunteerNeedsByEventId?: Record<string, VolunteerNeed[]>;
  // Sa propre fiche joueur (players.profile_id = son compte), si elle
  // existe — un coach qui joue aussi dans une autre équipe doit pouvoir
  // répondre présent/absent pour LUI-MÊME sur ses propres matchs.
  ownPlayerId: string | null;
  // Le prochain événement de ce coach en tant que JOUEUR, sur une équipe
  // qu'il ne coache pas (ex. Basile, joueur Séniors 1) — null si aucun, ou
  // si son équipe de joueur est de toute façon déjà une équipe coachée
  // (voir page.tsx, ownPlayerNextEvent). Affiché en tête de "Planning &
  // Rôles", trié par date avec les cartes des équipes coachées (retour de
  // Cindy du 2026-08-20).
  ownPlayerNextEvent?: ConvocationCard | null;
  // Lecture seule (retour de Cindy du 2026-08-22) : les pénalités des
  // joueurs de TOUTES les équipes de ce coach, saisies par le Bureau
  // (voir penalites-manager.tsx) — jamais de droit de saisie ici.
  penalites?: AdminPenalite[];
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
            eventRoles={eventRoles}
            volunteerNeedsByEventId={volunteerNeedsByEventId}
            celebrateWins
          />
          {/* Même bloc que l'espace parent : un coach a lui aussi son
              propre agenda, et être coach ne devrait pas le priver de cet
              outil — il fallait juste l'y ajouter aussi. */}
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
          {/* Groupes "Commission" (Bureau, Coachs UBAC...), ni liés à une
              équipe ni propres à celle sélectionnée ci-dessus — vivait
              déjà ici, hors de CoachTeams, avant l'essai de sous-menu. */}
          <CoachCommissionGroups whatsappGroups={whatsappGroups} />
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
              roles={eventRoles}
              ownPlayerId={ownPlayerId}
              ownPlayerNextEvent={ownPlayerNextEvent}
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
              roles={eventRoles}
              ownPlayerId={ownPlayerId}
              ownPlayerNextEvent={ownPlayerNextEvent}
              forcedTab="bilan"
            />
          ),
        },
      ],
    },
    {
      // Retour de Cindy du 2026-08-22 : l'ancien parent "Événements et
      // Résultats" à 4 sous-onglets est retiré au profit de deux onglets
      // de menu directs. "Événements" regroupe tout le calendrier du club
      // sauf les matchs officiels (entraînements, amicaux, tournois,
      // événements club) en un seul fil, plus besoin de les voir séparés.
      key: "events",
      label: "Événements",
      icon: <Flag className={iconClass} />,
      content: (
        <CalendarView
          events={events}
          createTeams={createTeams}
          rsvp={{ players: rsvpPlayers, statusByKey: rsvpStatusByKey }}
          scopeTeams={teams.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
          forcedView="clubEvents"
          // Un coach qui encadre plusieurs équipes (et joue parfois dans
          // une autre) doit pouvoir choisir laquelle regarder, comme dans
          // "Équipe" — sinon tous les événements de toutes ses équipes se
          // mélangent dans un seul fil.
          resultsTeams={resultsTeamsForCalendar}
          volunteerNeedsByEventId={volunteerNeedsByEventId}
          celebrateWins
        />
      ),
    },
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
              rsvp={{ players: rsvpPlayers, statusByKey: rsvpStatusByKey }}
              scopeTeams={teams.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
              forcedView="officialMatches"
              resultsTeams={resultsTeamsForCalendar}
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
              rsvp={{ players: rsvpPlayers, statusByKey: rsvpStatusByKey }}
              scopeTeams={teams.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
              forcedView="officialResults"
              resultsTeams={resultsTeamsForCalendar}
              volunteerNeedsByEventId={volunteerNeedsByEventId}
              celebrateWins
            />
          ),
        },
      ],
    },
    {
      key: "ffbb",
      label: "FFBB",
      icon: <RefreshCw className={iconClass} />,
      content: <CoachFfbb teams={teams} teamRoleByTeamId={teamRoleByTeamId} />,
    },
    {
      // Retour de Cindy du 26/08 : les 3 documents sur tous les espaces
      // sauf Bénévoles (Règlement Intérieur seul là-bas) — voir
      // club-documents.tsx.
      key: "documents",
      label: "Documents",
      icon: <ScrollText className={iconClass} />,
      content: (
        <DocumentsPanel documentIds={["charte-joueur", "charte-parent", "reglement-interieur"]} />
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
