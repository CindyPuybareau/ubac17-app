import {
  CalendarDays,
  ClipboardList,
  Flag,
  ListOrdered,
  LogOut,
  MessageCircle,
  RefreshCw,
  ShoppingBag,
  Trophy,
  Users,
} from "lucide-react";
import { sortTeamsByGroup, teamLabel } from "@/lib/teams";
import { BOUTIQUE_URL } from "./boutique";
import CalendarView from "./calendar-view";
import CalendarSubscribe from "./calendar-subscribe";
import CoachTeams, { CoachCommissionGroups } from "./coach-teams";
import CoachFfbb from "./coach-ffbb";
import CoachOrganisation, { type CoachTeamMatchCard } from "./coach-organisation";
import FamilyAttendanceRequests from "./family-attendance-requests";
import FamilyAttendanceSummary from "./family-attendance-summary";
import FamilyCotisationCard from "./family-cotisation-card";
import PenalitesCard from "./penalites-card";
import AdminSidebar, { type AdminSection } from "./admin-sidebar";
import type { TeamWithMembers } from "./team-manager";
import type {
  AdminCotisation,
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
  showOwnPlayerSummary = false,
  ownCotisations = [],
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
  // true seulement quand ce coach n'a aucun enfant rattaché (juste sa
  // propre fiche joueur) : l'onglet "Mon espace" est alors retiré et cet
  // espace reprend ses deux derniers morceaux (relance de présence,
  // cotisation) pour rester le seul endroit à consulter. Un coach qui a
  // aussi des enfants garde les deux onglets séparés — page.tsx ne
  // fournit ces informations qu'à ce moment-là (ownCotisations reste
  // vide sinon), pour ne jamais les faire apparaître en double.
  showOwnPlayerSummary?: boolean;
  ownCotisations?: AdminCotisation[];
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

  const eventsByTeamId: Record<string, AdminUpcomingEvent[]> = {};
  events.forEach((e) => {
    if (!e.teamId) return;
    (eventsByTeamId[e.teamId] ??= []).push(e);
  });

  // Même ordre canonique que CoachTeams (l'équipe mère avant ses
  // déclinaisons) pour que les sous-onglets "Équipe" du menu suivent
  // exactement l'ordre déjà vu partout ailleurs dans l'app.
  const sortedTeamsForMenu = sortTeamsByGroup(teams);
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
          />
          {/* Même bloc que l'espace parent : un coach a lui aussi son
              propre agenda, et être coach ne devrait pas le priver de cet
              outil — il fallait juste l'y ajouter aussi. */}
          <CalendarSubscribe />
        </div>
      ),
    },
    {
      // Sous-menu déroulant (retour de Cindy du 2026-08-22) : un enfant par
      // équipe+rôle réellement tenu (utile à un coach multi-équipes comme
      // Basile, "U13F Coach" / "U13M Coach" / "U13M-1 Coach" / "Séniors 1
      // Joueur"), plus un dernier enfant pour les commissions (Bureau,
      // Coachs UBAC...), qui ne sont rattachées à aucune équipe. La
      // section parente elle-même n'a pas de contenu propre — cliquer
      // dessus ne fait plus que déplier/replier la liste.
      key: "teams",
      label: teams.length > 1 ? "Équipes" : "Équipe",
      icon: <Users className={iconClass} />,
      content: null,
      children: [
        ...sortedTeamsForMenu.map((t) => ({
          key: `team-${t.id}`,
          label: `${teamLabel(t)} ${teamRoleByTeamId[t.id] === "PLAYER" ? "Joueur" : "Coach"}`,
          icon: <Users className={iconClass} />,
          content: (
            <div className="flex flex-col gap-4">
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
                forcedTeamId={t.id}
              />
              {/* Ni l'un ni l'autre de ces deux blocs n'est propre à une
                  équipe précise (voir plus haut, CoachTeams) — ils
                  apparaissaient déjà quel que soit l'onglet équipe actif
                  avant l'introduction des sous-menus, donc répétés
                  ici sur chaque équipe pour garder ce même repère
                  toujours visible. */}
              {showOwnPlayerSummary && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <FamilyCotisationCard cotisations={ownCotisations} />
                  <FamilyAttendanceSummary
                    events={events}
                    players={rsvpPlayers.filter((p) => p.id === ownPlayerId)}
                    rsvpStatusByKey={rsvpStatusByKey}
                  />
                  <PenalitesCard
                    title="Mes pénalités"
                    penalites={penalites.filter((p) => p.playerId === ownPlayerId)}
                  />
                </div>
              )}
              <PenalitesCard
                title="Pénalités de l'équipe"
                penalites={penalites}
                showPlayerName
                emptyLabel="Aucune pénalité pour tes joueurs."
              />
            </div>
          ),
        })),
        {
          key: "team-commissions",
          label: "Commissions & Admin",
          icon: <MessageCircle className={iconClass} />,
          content: <CoachCommissionGroups whatsappGroups={whatsappGroups} />,
        },
      ],
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
          scopeTeams={teams.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
          forcedView="clubEvents"
          // Un coach qui encadre plusieurs équipes (et joue parfois dans
          // une autre) doit pouvoir choisir laquelle regarder, comme dans
          // "Équipe" — sinon tous les événements de toutes ses équipes se
          // mélangent dans un seul fil.
          resultsTeams={resultsTeamsForCalendar}
        />
      ),
    },
    {
      // "Matchs et Résultats" (retour de Cindy du 2026-08-22) : les
      // matchs officiels et leurs résultats restent groupés dans un seul
      // onglet de menu, avec un petit bouton interne pour basculer entre
      // les deux (voir forcedViewOptions sur CalendarView) plutôt que
      // deux entrées de menu séparées.
      key: "matches",
      label: "Matchs & Résultats",
      icon: <Trophy className={iconClass} />,
      content: (
        <CalendarView
          events={events}
          createTeams={createTeams}
          scopeTeams={teams.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
          forcedViewOptions={["officialMatches", "officialResults"]}
          resultsTeams={resultsTeamsForCalendar}
        />
      ),
    },
    {
      key: "ffbb",
      label: "FFBB",
      icon: <RefreshCw className={iconClass} />,
      content: <CoachFfbb teams={teams} teamRoleByTeamId={teamRoleByTeamId} />,
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
      {/* Repris de l'espace Parent (voir family-view.tsx) pour un coach
          sans enfant, dont "Mon espace" a été retiré : sa propre relance
          de présence doit se voir en ouvrant l'app, comme côté Parent —
          la cotisation, elle, vit dans "Mes Équipes" (voir plus bas),
          même emplacement que côté Parent. */}
      {showOwnPlayerSummary && ownPlayerId && (
        <FamilyAttendanceRequests
          events={events}
          players={rsvpPlayers.filter((p) => p.id === ownPlayerId)}
          statusByKey={rsvpStatusByKey}
        />
      )}
      <AdminSidebar sections={sections} />
    </div>
  );
}
