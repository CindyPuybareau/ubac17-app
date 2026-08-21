import { CalendarDays, ClipboardList, RefreshCw, ShoppingBag, Trophy, Users } from "lucide-react";
import { BOUTIQUE_URL } from "./boutique";
import CalendarView from "./calendar-view";
import CalendarSubscribe from "./calendar-subscribe";
import CoachTeams from "./coach-teams";
import CoachFfbb from "./coach-ffbb";
import CoachOrganisation, { type CoachTeamMatchCard } from "./coach-organisation";
import FamilyAttendanceRequests from "./family-attendance-requests";
import FamilyAttendanceSummary from "./family-attendance-summary";
import FamilyCotisationCard from "./family-cotisation-card";
import AdminSidebar, { type AdminSection } from "./admin-sidebar";
import type { TeamWithMembers } from "./team-manager";
import type {
  AdminCotisation,
  AdminMemberTeam,
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
      key: "teams",
      // "Mes Équipes" ne tenait pas dans la barre du bas mobile (retour de
      // Cindy du 2026-08-21) — au singulier/pluriel selon le nombre réel
      // d'équipes du coach plutôt qu'un "Mes" générique, à la fois plus
      // court et plus précis (un coach d'une seule équipe n'a pas
      // vraiment plusieurs "équipes").
      label: teams.length > 1 ? "Équipes" : "Équipe",
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
          />
          {/* Même emplacement que côté Parent (family-view.tsx, onglet
              "Mon Équipe") : la cotisation et le bilan d'assiduité vivent
              avec l'identité de l'équipe, pas en haut de page. Le bilan
              avait été oublié à la création de cet espace replié — un
              coach sans enfant n'avait alors aucun moyen de voir son
              propre taux de présence, contrairement à n'importe quel
              parent. */}
          {showOwnPlayerSummary && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FamilyCotisationCard cotisations={ownCotisations} />
              <FamilyAttendanceSummary
                events={events}
                players={rsvpPlayers.filter((p) => p.id === ownPlayerId)}
                rsvpStatusByKey={rsvpStatusByKey}
              />
            </div>
          )}
        </div>
      ),
    },
    {
      key: "organisation",
      // "Organisation & Bilan" se faisait tronquer en "Organisation ..."
      // dans la barre du bas mobile, et même son shortLabel "Organisation"
      // seul ne tenait pas (retour de Cindy du 2026-08-21) — "Suivi"
      // reprend les deux volets de cet onglet (rôles à venir ET bilan de
      // saison) en un mot assez court pour ne jamais se faire couper, plus
      // besoin d'un shortLabel séparé.
      label: "Suivi",
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
        />
      ),
    },
    {
      key: "results",
      label: "Résultats",
      icon: <Trophy className={iconClass} />,
      content: (
        <CalendarView
          events={events}
          createTeams={createTeams}
          scopeTeams={teams.map((t) => ({
            id: t.id,
            name: t.name,
            category: t.category,
          }))}
          forcedView="results"
          // Un coach qui encadre plusieurs équipes (et joue parfois dans
          // une autre) doit pouvoir choisir laquelle regarder, comme dans
          // "Mes Équipes" — sinon tous les matchs de toutes ses équipes
          // se mélangent dans un seul fil.
          resultsTeams={teams.map((t) => ({
            id: t.id,
            name: t.name,
            category: t.category,
            role: teamRoleByTeamId[t.id] ?? "COACH",
          }))}
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
      // Dernier de la liste, comme demandé : un lien externe, pas un onglet
      // de contenu (voir href sur AdminSection).
      key: "boutique",
      label: "Boutique",
      icon: <ShoppingBag className={iconClass} />,
      content: null,
      href: BOUTIQUE_URL,
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
