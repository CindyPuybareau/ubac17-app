"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  AlarmClock,
  CalendarDays,
  Cake,
  Check,
  Clock,
  Euro,
  ExternalLink,
  HeartHandshake,
  LayoutGrid,
  List,
  Mail,
  MapPin,
  ListOrdered,
  Pencil,
  PartyPopper,
  Plus,
  Sparkles,
  StickyNote,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildGmailComposeLink } from "@/lib/email";
import EmptyState from "./empty-state";
import { formatFirstName, formatLastName, sortByLastName } from "@/lib/names";
import { parseMatchTitle } from "@/lib/match-display";
import { sortTeamsByGroup, teamLabel } from "@/lib/teams";
import OpponentDisplay from "./opponent-display";
import CreateEventForm from "./create-event-form";
import RsvpButtons from "./rsvp-buttons";
import ItineraryButton from "./itinerary-button";
import MatchTasksPanel from "./match-tasks-panel";
import MatchScore from "./match-score";
import TeamSelectorPills from "./team-selector-pills";
import TeamFilterDropdown from "./team-filter-dropdown";
import EventTypeFilterDropdown from "./event-type-filter-dropdown";
import { sendEventPush } from "./event-push";
import type { AdminBenevole, AdminUpcomingEvent, BenevoleInviteStatus } from "./page";
import {
  groupBirthdaysByMonthDay,
  upcomingBirthdays,
  type BirthdaySource,
} from "./birthdays";
import { shouldOfferCarpool, venueQuery } from "./salles";
import { schoolHolidayFor, toKey } from "@/lib/school-holidays";
import SalleBadge from "./salle-badge";
import {
  EVENT_TYPE_OPTIONS,
  formatEventTime,
  formatImpactTime,
  homeAwayLabel,
  isMatchType,
  styleFor,
} from "./event-style";
import {
  rolesForEventType,
  type CarpoolOffer,
  type EventRoleType,
  type EventTasksState,
} from "./event-tasks";
import VolunteerNeedsPanel from "./volunteer-needs-panel";
import type { VolunteerNeed } from "./event-volunteer-needs";
import ConfirmDialog from "./confirm-dialog";
import OrganisationCard from "./organisation-card";
import MatchResultCelebration from "@/components/match-result-celebration";

const emptyEventTasks: EventTasksState = {};
const emptyVolunteerNeeds: VolunteerNeed[] = [];
// Constante de module, comme les deux ci-dessus — retour d'audit du 28/08 :
// `carpoolByEventId[event.id] ?? []` recréait un tableau neuf à chaque
// rendu de CalendarView, ce qui redéclenchait l'effet de synchronisation
// de MatchTasksPanel (dépendance [initialCarpool]) et effaçait la
// proposition de covoiturage affichée de façon optimiste jusqu'au retour
// serveur suivant.
const emptyCarpool: CarpoolOffer[] = [];

// Ré-exportés : beaucoup d'écrans les importent historiquement d'ici, et
// ce fichier reste le point d'entrée naturel du calendrier.
export { EVENT_TYPE_OPTIONS, formatEventTime, homeAwayLabel, isMatchType, styleFor };

function pillLabel(event: AdminUpcomingEvent) {
  if (isMatchType(event.event_type)) {
    return parseMatchTitle(event.title).opponent;
  }
  return event.title ?? styleFor(event.event_type).label;
}

// Fonction ordinaire et non calcul en plein rendu : la lecture de l'heure
// courante reste hors du corps du composant.
function startOfTodayMs() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

// Fonction ordinaire, hors du corps d'un composant, même raison que
// startOfTodayMs ci-dessus (react-hooks/purity : Date.now() appelé en
// plein rendu est signalé, pas quand il vit dans un simple helper de
// module). Une victoire "fraîche" seulement (retour de Cindy du 26/08,
// confettis) — 5 jours couvre large une saisie de score en retard sans
// rester "périmé" jusqu'au week-end suivant.
// Nettoyage du 31/08 : ce comparateur était réécrit à trois endroits du
// fichier plutôt que partagé une seule fois.
function byStartTime(a: { start_time: string }, b: { start_time: string }) {
  return a.start_time.localeCompare(b.start_time);
}

function isRecentWin(event: { teamScore: number | null; opponentScore: number | null; start_time: string }) {
  return (
    event.teamScore !== null &&
    event.opponentScore !== null &&
    event.teamScore > event.opponentScore &&
    Date.now() - new Date(event.start_time).getTime() < 5 * 24 * 60 * 60 * 1000
  );
}

// Matches groupBirthdaysByMonthDay's "MM-DD" key format so a Date on the
// grid can be looked up regardless of year.
function monthDayKey(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}-${day}`;
}

function startOfWeekMonday(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function buildMonthGrid(monthDate: Date): Date[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const gridStart = startOfWeekMonday(firstOfMonth);
  const lastWeekStart = startOfWeekMonday(lastOfMonth);
  const gridEnd = new Date(lastWeekStart);
  gridEnd.setDate(gridEnd.getDate() + 6);

  const days: Date[] = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

const weekdayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export type CalendarTeamRef = {
  id: string;
  name: string | null;
  category: string | null;
};

export type CalendarRsvpPlayer = {
  id: string;
  name: string;
  teamIds: string[];
  // Photo mise en ligne par l'enfant lui-même (players.avatar_url, voir
  // ChildAvatarUpload) — optionnel : absent côté Coach (coachRsvpPlayers,
  // page.tsx, où seul un joueur/coach adulte apparaît, jamais un enfant).
  avatarUrl?: string | null;
};

// Module "Qui sera là ?" : repliée par défaut pour garder la carte
// compacte (une famille avec plusieurs enfants voit vite s'empiler
// beaucoup de cartes), un tap dévoile la liste nominative. Le nombre reste
// visible même repliée — c'est justement ce qui donne envie ou non de
// déplier. Composant à part (et non une fonction interne à
// renderEventCard) : lui seul a besoin d'un état local d'ouverture, et un
// Hook ne peut pas vivre dans une fonction appelée comme un simple
// callback de rendu.
function PresentPlayersList({
  players,
}: {
  players: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    // Retour de Cindy du 10/09 ("ce que j'apporte") : ce que ce membre
    // apporte/prend en charge, affiché aux organisateurs (Bureau/Coach/
    // Famille voient tous "Qui sera là ?") — jamais recalculé ici, déjà
    // filtré côté serveur sur les Présents uniquement (buildPresentPlayers).
    note?: string | null;
  }[];
}) {
  const [open, setOpen] = useState(false);

  if (players.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 border-t border-zinc-100 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:text-zinc-900"
      >
        <Users className="h-3.5 w-3.5 shrink-0 text-status-success" />
        {players.length} {players.length > 1 ? "joueurs/joueuses présent(e)s" : "joueur/joueuse présent(e)"}
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        )}
      </button>
      {open && (
        <div className="flex flex-wrap gap-1.5">
          {sortByLastName(players, (p) => p.lastName).map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-status-success/10 px-2.5 py-1 text-xs font-medium text-status-success"
            >
              {formatFirstName(p.firstName)}{" "}
              <span className="font-bold uppercase">{formatLastName(p.lastName)}</span>
              {/* Retour de Cindy du 10/09 ("ce que j'apporte") : facultatif,
                  n'apparaît que si renseigné. */}
              {p.note && <span className="font-normal opacity-80">— {p.note}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Retour de Cindy du 11/09 ("qui est absent ?") : même principe que
// PresentPlayersList ci-dessus (repliée par défaut, dépliable), en rouge
// (status-urgent) plutôt qu'en émeraude -- même charte que le badge
// "absent" du résumé juste au-dessus sur la carte. `players` arrive déjà
// scopé par l'appelant (page.tsx, ownTeamRoster/ownFamilyRoster) : jamais
// l'effectif complet d'un événement multi-équipes, seulement les équipes
// que ce viewer a le droit de voir.
function AbsentPlayersList({
  players,
}: {
  players: { id: string; firstName: string | null; lastName: string | null }[];
}) {
  const [open, setOpen] = useState(false);

  if (players.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 border-t border-zinc-100 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:text-zinc-900"
      >
        <Users className="h-3.5 w-3.5 shrink-0 text-status-urgent-dark" />
        {players.length} {players.length > 1 ? "joueurs/joueuses absent(e)s" : "joueur/joueuse absent(e)"}
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        )}
      </button>
      {open && (
        <div className="flex flex-wrap gap-1.5">
          {sortByLastName(players, (p) => p.lastName).map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-status-urgent/10 px-2.5 py-1 text-xs font-medium text-status-urgent-dark"
            >
              {formatFirstName(p.firstName)}{" "}
              <span className="font-bold uppercase">{formatLastName(p.lastName)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Même principe que PresentPlayersList ci-dessus, en ambre plutôt qu'en
// émeraude pour ne jamais se confondre avec "Qui sera là ?" (retour de
// Cindy du 2026-08-25, "il faut que l'on comprenne le stage concerné") :
// qui est inscrit/concerné par le paiement, pas qui a répondu présent à
// CET événement précis — deux informations différentes, même sur la même
// carte.
function PaidParticipantsList({
  players,
}: {
  players: { id: string; firstName: string | null; lastName: string | null }[];
}) {
  const [open, setOpen] = useState(false);

  if (players.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 border-t border-zinc-100 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:text-zinc-900"
      >
        <Euro className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        {players.length} {players.length > 1 ? "joueurs/joueuses concerné(e)s" : "joueur/joueuse concerné(e)"}
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        )}
      </button>
      {open && (
        <div className="flex flex-wrap gap-1.5">
          {sortByLastName(players, (p) => p.lastName).map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800"
            >
              {formatFirstName(p.firstName)}{" "}
              <span className="font-bold uppercase">{formatLastName(p.lastName)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Retour de Cindy du 06/09 ("le bureau ou les coachs doivent avoir la
// vision des bénévoles qui ont répondu présent") : même principe que
// PresentPlayersList ci-dessus (repliée par défaut, dépliable), mais pour
// les bénévoles invités à cet événement — jamais affichée si personne n'a
// été invité (contrairement aux joueurs, systématiquement de la partie).
function BenevoleInvitesList({
  invites,
}: {
  invites: { id: string; firstName: string; lastName: string; status: BenevoleInviteStatus }[];
}) {
  const [open, setOpen] = useState(false);

  if (invites.length === 0) return null;

  const present = invites.filter((b) => b.status === "PRESENT");
  const absent = invites.filter((b) => b.status === "ABSENT");
  const pending = invites.filter((b) => b.status === "PENDING");
  // Retour de Cindy du 09/09 (phase 1 UX, couleurs sémantiques) : status-*
  // (globals.css) plutôt qu'emerald/red codées en dur -- même migration
  // que les badges résumé plus bas dans ce fichier.
  const statusClass = (status: BenevoleInviteStatus) =>
    status === "PRESENT"
      ? "bg-status-success/10 text-status-success"
      : status === "ABSENT"
        ? "bg-status-urgent/10 text-status-urgent-dark"
        : "bg-zinc-100 text-zinc-500";

  return (
    <div className="flex flex-col gap-1.5 border-t border-zinc-100 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:text-zinc-900"
      >
        <HeartHandshake className="h-3.5 w-3.5 shrink-0 text-navy" />
        {invites.length} bénévole{invites.length > 1 ? "s" : ""} invité{invites.length > 1 ? "s" : ""}
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        )}
      </button>
      <div className="flex flex-wrap gap-1.5">
        {present.length > 0 && (
          <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full bg-status-success/10 px-2 py-0.5 text-xs font-semibold leading-none text-status-success">
            <Check className="h-3 w-3" />
            {present.length} présent{present.length > 1 ? "s" : ""}
          </span>
        )}
        {absent.length > 0 && (
          <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full bg-status-urgent/10 px-2 py-0.5 text-xs font-semibold leading-none text-status-urgent-dark">
            <X className="h-3 w-3" />
            {absent.length} absent{absent.length > 1 ? "s" : ""}
          </span>
        )}
        {pending.length > 0 && (
          <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold leading-none text-zinc-600">
            <Clock className="h-3 w-3" />
            {pending.length} en attente
          </span>
        )}
      </div>
      {open && (
        <div className="flex flex-wrap gap-1.5">
          {sortByLastName(invites, (b) => b.lastName).map((b) => (
            <span
              key={b.id}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(b.status)}`}
            >
              {formatFirstName(b.firstName)}{" "}
              <span className="font-bold uppercase">{formatLastName(b.lastName)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CalendarView({
  events,
  createTeams,
  rsvp,
  contactEmailByPlayerId,
  allowClubWide = false,
  birthdayMembers = [],
  scopeTeams = [],
  scopeTeamRoleById,
  tasksByEventId = {},
  carpoolByEventId = {},
  eventRoles = [],
  volunteerNeedsByEventId = {},
  selfPlayerId = null,
  forcedView,
  resultsTeamSelector = "pills",
  resultsTeams,
  benevoles = [],
  celebrateWins = false,
  commissionGroups = [],
}: {
  events: AdminUpcomingEvent[];
  createTeams?: CalendarTeamRef[];
  rsvp?: {
    players: CalendarRsvpPlayer[];
    statusByKey: Record<string, string>;
    // Retour de Cindy du 10/09 ("ce que j'apporte") : voir rsvp-buttons.tsx.
    noteByKey?: Record<string, string | null>;
  };
  contactEmailByPlayerId?: Record<string, string>;
  allowClubWide?: boolean;
  birthdayMembers?: BirthdaySource[];
  // Équipes dont ce calendrier montre les événements. Affiché tel quel :
  // sans cette ligne, un calendrier vide ne dit pas s'il ne couvre rien ou
  // s'il n'y a simplement rien de programmé.
  scopeTeams?: { id: string; name: string | null; category: string | null }[];
  // Retour de Cindy du 2026-09-02 (Basile, "le texte ne va pas") : côté
  // Coach, scopeTeams mélange volontairement les équipes coachées et celle
  // où la personne n'est QUE joueuse (son propre calendrier de joueur ne
  // doit pas disparaître selon l'onglet — voir coach-view.tsx) — mais
  // "Événements de X, Y, Z" à plat laissait croire que tout était coaché,
  // sous un onglet nommé "Équipes coachées". Optionnel : sans lui (Bureau,
  // Famille), le texte reste une simple liste comme avant.
  scopeTeamRoleById?: Record<string, "COACH" | "PLAYER">;
  // Rôles attribués (voiture, maillots, goûter...) et places de covoiturage,
  // affichés dans la carte d'un match/tournoi côté famille — seulement là où
  // ils sont fournis : ni Bureau ni Coach n'en ont besoin sur leur propre
  // calendrier, ils ont déjà leur onglet Organisation dédié pour ça.
  tasksByEventId?: Record<string, EventTasksState>;
  carpoolByEventId?: Record<string, CarpoolOffer[]>;
  eventRoles?: EventRoleType[];
  // Besoins en bénévoles (buvette, table de marque...) d'un événement club
  // — auto-serve (Je m'en occupe) partout ; qui gère l'événement peut en
  // plus définir/ajuster le nombre requis et retirer quelqu'un, mais
  // n'affecte plus personne à la main (les membres se proposent eux-mêmes).
  volunteerNeedsByEventId?: Record<string, VolunteerNeed[]>;
  // La propre fiche joueur de qui consulte ce calendrier (coach qui joue
  // aussi dans une autre équipe) — jamais fourni côté Bureau/Famille.
  // Permet à un coach de répondre présent/absent pour LUI-MÊME sur un
  // événement d'une équipe qu'il ne coache pas, sans jamais lui montrer
  // le bouton de ses coéquipiers (voir rsvpVisiblePlayers plus bas).
  selfPlayerId?: string | null;
  // Utilisé par les onglets dédiés "Événements" / "Matchs & Résultats"
  // (sidebar Bureau/Coach/Parent) : verrouille la vue sur un
  // sous-ensemble filtré par type d'événement, cette page n'ayant plus
  // besoin de bascule Liste/Mois — celle-ci reste dans l'onglet Calendrier.
  // - "results" : matchs officiels + amicaux, avec score (Famille/Enfant,
  //   inchangé — jamais retouché par le découpage Bureau/Coach ci-dessous).
  // - "officialMatches" : uniquement les matchs officiels (type MATCH),
  //   joués ou non — le planning.
  // - "officialResults" : uniquement les matchs officiels déjà joués — les
  //   résultats à proprement parler, sans les matchs encore à venir.
  // - "clubEvents" : tout le calendrier du club sauf les matchs officiels
  //   (entraînements, amicaux, tournois, événements club) en un seul fil.
  forcedView?: "results" | "officialMatches" | "officialResults" | "clubEvents";
  // Sélecteur d'équipe façon "Mes Équipes" (voir coach-teams.tsx) : sans
  // lui, ces vues mélangeaient les événements de toutes les équipes dans
  // un seul fil, sans aucun moyen de s'y retrouver — vrai pour un coach
  // multi-équipes comme pour le Bureau qui voit tout le club. Omis
  // (undefined) là où une seule équipe est en jeu (le sélecteur ne
  // s'affiche de toute façon qu'à partir de deux équipes, voir
  // sortedResultsTeams.length > 1 plus bas).
  resultsTeams?: {
    id: string;
    name: string | null;
    category: string | null;
    role?: "COACH" | "PLAYER";
    // Retour de Cindy du 11/09 ("fusion des calendriers équipe
    // principale/secondaire") : un onglet "U13M" peut représenter
    // PLUSIEURS vraies équipes à la fois (U13M + U13M-1, voir
    // groupTeamsByPrimarySecondary dans lib/teams.ts) -- l'appelant
    // (coach-view.tsx, family-view.tsx...) construit déjà ce
    // regroupement, CalendarView n'a pas besoin de connaître la notion
    // de principale/secondaire, juste de filtrer sur cet ensemble
    // plutôt que sur `id` seul. Omis (undefined) pour une équipe qui ne
    // représente qu'elle-même -- matchesTeamFilter retombe alors sur
    // [id].
    memberTeamIds?: string[];
  }[];
  // "pills" (défaut) : une équipe active à la fois, façon "Mes Équipes"
  // (Coach). "dropdown" (retour de Cindy du 2026-08-22, "comme dans
  // l'onglet équipe du bureau") : case à cocher par équipe, plusieurs
  // équipes à la fois dans le même fil — réutilise TeamFilterDropdown,
  // déjà utilisé par team-manager.tsx (Bureau).
  resultsTeamSelector?: "pills" | "dropdown";
  // Liste des bénévoles du club, transmise telle quelle à CreateEventForm
  // (section "Bénévoles invités") — Bureau et Coach depuis le 06/09, vide
  // ailleurs (Famille, Espace Enfant).
  benevoles?: AdminBenevole[];
  // Confettis sur un match gagné (retour de Cindy du 26/08) — réservé à
  // l'équipe gagnante (Coach de cette équipe, Famille/Enfant des joueurs
  // concernés) : jamais côté Bureau, qui voit tous les matchs de toutes
  // les équipes et perdrait le côté personnel de la célébration. Ce
  // composant ne sait pas lui-même qui regarde — c'est à l'appelant
  // (coach-view.tsx, family-view.tsx : true ; admin-view.tsx : jamais
  // passé, donc false) de trancher.
  celebrateWins?: boolean;
  // Retour de Cindy du 10/09 ("Accès Commissions & Administration") :
  // transmis tel quel à VolunteerNeedsPanel (voir son propre commentaire)
  // pour rattacher un besoin à une commission à la création.
  commissionGroups?: { id: string; name: string }[];
}) {
  // Recalculés à chaque rendu (pas au chargement du module) : un onglet
  // Bureau laissé ouvert toute la nuit gardait sinon la pastille "jour
  // même" sur la veille jusqu'au rechargement complet de la page — le
  // rafraîchissement déclenché ailleurs par le temps réel (realtime-sync.tsx)
  // suffit maintenant à corriger l'affichage sans reload.
  // Copie locale affichée immédiatement à la création/modification/
  // suppression d'un événement, plutôt que d'attendre le rafraîchissement
  // temps réel (débounce ~0,8s + un aller-retour serveur complet qui
  // recharge tout le tableau de bord) — retour de Cindy du 2026-08-21 :
  // "7-8 secondes... c'est long" à la création comme à la suppression.
  // Même principe que volunteer-needs-panel.tsx/match-tasks-panel.tsx.
  const [localEvents, setLocalEvents] = useState(events);
  useEffect(() => {
    setLocalEvents(events);
  }, [events]);

  // Retour de Cindy du 29/08 ("le délai pour afficher '1 présent' est trop
  // long") : rsvpCounts/presentPlayers sont des champs calculés côté
  // serveur, embarqués dans `event` — jusqu'ici seul le rafraîchissement
  // temps réel (realtime-sync.tsx, débounce ~0,8s + un aller-retour serveur
  // complet) les mettait à jour, alors que le bouton Présent/Absent
  // lui-même répond déjà instantanément (affichage optimiste, voir
  // rsvp-buttons.tsx). Répercute ici, dans la même copie locale que
  // localEvents, le même geste optimiste pour ces deux compteurs — le
  // prochain rafraîchissement temps réel écrasera cette approximation par
  // la vraie valeur serveur de toute façon.
  function updateLocalRsvpStatus(
    eventId: string,
    playerId: string,
    playerName: string,
    previousStatus: string,
    newStatus: string
  ) {
    if (previousStatus === newStatus) return;
    const bucketFor = (status: string) =>
      status === "PRESENT" || status === "ABSENT" || status === "LATE"
        ? (status.toLowerCase() as "present" | "absent" | "late")
        : "pending";
    setLocalEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const rsvpCounts = { ...e.rsvpCounts };
        rsvpCounts[bucketFor(previousStatus)] = Math.max(
          0,
          rsvpCounts[bucketFor(previousStatus)] - 1
        );
        rsvpCounts[bucketFor(newStatus)] += 1;
        let presentPlayers = e.presentPlayers;
        if (presentPlayers) {
          if (newStatus === "PRESENT" && !presentPlayers.some((p) => p.id === playerId)) {
            presentPlayers = [
              ...presentPlayers,
              { id: playerId, firstName: playerName, lastName: null, note: null },
            ];
          } else if (previousStatus === "PRESENT" && newStatus !== "PRESENT") {
            presentPlayers = presentPlayers.filter((p) => p.id !== playerId);
          }
        }
        return { ...e, rsvpCounts, presentPlayers };
      })
    );
  }

  // Même geste optimiste que updateLocalRsvpStatus ci-dessus, pour la
  // saisie du score (match-score.tsx) : sans lui, l'affichage du score ET
  // les confettis (qui lisent event.teamScore/opponentScore du même
  // localEvents) attendaient tous les deux le rafraîchissement temps réel.
  function updateLocalEventScore(eventId: string, teamScore: number, opponentScore: number) {
    setLocalEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, teamScore, opponentScore } : e))
    );
  }

  const today = new Date();
  const todayKey = toKey(today);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isMonthPending, startMonthTransition] = useTransition();
  // Retour de Cindy du 05/09 ("le calendrier ralentit tout") : les
  // entraînements récurrents affichés dans la grille ne sont plus chargés
  // sur toute la saison, seulement autour du mois demandé par ?month=...
  // (voir page.tsx, trainingsWindowStart/End) -- ce composant part donc du
  // mois que le serveur a déjà résolu, plutôt que "aujourd'hui" par défaut,
  // pour ne jamais afficher un mois différent de celui réellement chargé.
  const monthParam = searchParams.get("month");
  const initialViewMonth =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? new Date(Number(monthParam.slice(0, 4)), Number(monthParam.slice(5, 7)) - 1, 1)
      : today;
  const [viewMonth, setViewMonth] = useState<Date>(initialViewMonth);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  // Retour de Cindy/Sandrine Manzelle du 2026-08-24 : "les entraînements
  // polluent le calendrier" — un cumul Bureau + joueuse + parent voit tout
  // empilé, et les entraînements (2-3 par semaine et par équipe) noient
  // les événements plus rares. Remplacé le 10/09 (retour de Cindy) par un
  // filtre par type plus général ("Filtrer par type", voir hiddenEventTypes
  // ci-dessous) : filtre la grille du mois, le panneau du jour et la liste
  // Événements en même temps (voir visibleEvents plus bas), jamais
  // localEvents lui-même (les formulaires d'édition en ont besoin en
  // entier).
  //
  // Stocke les types MASQUÉS (pas les affichés) : un Set vide veut dire
  // "tout affiché", cohérent avec profiles.calendar_hidden_event_types
  // (colonne ajoutée le 10/09) qui stocke la même chose. Chargé une fois
  // au montage puis ré-écrit à chaque case cochée/décochée -- retrouvé à
  // la prochaine connexion, sur n'importe quel appareil (retour de Cindy :
  // "pas juste en local dans le navigateur"), pas juste dans CE
  // navigateur. Même schéma que calendar-subscribe.tsx (auth.getUser() +
  // repli silencieux sur un raté réseau plutôt qu'un blocage).
  const [hiddenEventTypes, setHiddenEventTypes] = useState<Set<string>>(new Set());
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        userIdRef.current = userData.user.id;
        const { data } = await supabase
          .from("profiles")
          .select("calendar_hidden_event_types")
          .eq("id", userData.user.id)
          .maybeSingle();
        const stored = data?.calendar_hidden_event_types as string[] | null;
        if (!cancelled && stored && stored.length > 0) {
          setHiddenEventTypes(new Set(stored));
        }
      } catch {
        // Un raté réseau garde simplement "tout affiché" (l'état initial) —
        // jamais bloqué en attente, jamais d'erreur visible pour un simple
        // réglage d'affichage.
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateHiddenEventTypes(next: Set<string>) {
    setHiddenEventTypes(next);
    const userId = userIdRef.current;
    if (!userId) return;
    const supabase = createClient();
    supabase
      .from("profiles")
      .update({ calendar_hidden_event_types: Array.from(next) })
      .eq("id", userId)
      .then(({ error }) => {
        if (error) {
          console.error("[CalendarView] sauvegarde du filtre par type échouée:", error);
        }
      });
  }
  // Le calendrier s'ouvre sur la grille : on veut d'abord voir le mois.
  // La liste chronologique reste à un clic pour répondre à "c'est quoi la
  // suite ?".
  const [view, setView] = useState<
    "list" | "month" | "results" | "officialMatches" | "officialResults" | "clubEvents"
  >(forcedView ?? "month");
  const [createOpen, setCreateOpen] = useState(false);

  // Même ordre que "Mes Équipes" : l'équipe mère avant ses déclinaisons.
  const sortedResultsTeams = useMemo(
    () => (resultsTeams ? sortTeamsByGroup(resultsTeams) : []),
    [resultsTeams]
  );
  const [activeResultsTeamId, setActiveResultsTeamId] = useState<string | undefined>(
    sortedResultsTeams[0]?.id
  );
  // Ne fait pas juste confiance à l'état : si resultsTeams change de forme
  // après le montage (enfant sélectionné différent côté Famille, effectif
  // d'un coach modifié en direct via useRealtimeRefresh) et que l'équipe
  // choisie n'existe plus dans la nouvelle liste, l'id retenu deviendrait
  // orphelin et seasonListEvents ne matcherait plus rien — un fil Résultats
  // vide sans raison apparente. On retombe alors sur la première équipe
  // disponible plutôt que de garder un id qui ne correspond plus à rien.
  const activeResultsTeamIdResolved = sortedResultsTeams.some(
    (t) => t.id === activeResultsTeamId
  )
    ? activeResultsTeamId
    : sortedResultsTeams[0]?.id;

  // Mode "dropdown" (resultsTeamSelector) : plusieurs équipes cochées à la
  // fois plutôt qu'une seule active, même principe que TeamFilterDropdown
  // dans team-manager.tsx (Bureau, onglet Équipes) — retour de Cindy du
  // 2026-08-22, "comme dans l'onglet équipe du bureau". Tout coché par
  // défaut. Même astuce que team-manager.tsx pour les équipes qui
  // apparaissent après le montage (temps réel) : ajoutées automatiquement
  // à la sélection plutôt que masquées par défaut.
  const [selectedResultTeamIds, setSelectedResultTeamIds] = useState<Set<string>>(
    () => new Set(sortedResultsTeams.map((t) => t.id))
  );
  const knownResultTeamIdsRef = useRef(new Set(sortedResultsTeams.map((t) => t.id)));
  useEffect(() => {
    const newIds = sortedResultsTeams
      .map((t) => t.id)
      .filter((id) => !knownResultTeamIdsRef.current.has(id));
    if (newIds.length > 0) {
      setSelectedResultTeamIds((prev) => {
        const next = new Set(prev);
        newIds.forEach((id) => next.add(id));
        return next;
      });
    }
    knownResultTeamIdsRef.current = new Set(sortedResultsTeams.map((t) => t.id));
  }, [sortedResultsTeams]);

  // Extrait de seasonListEvents (retour de Cindy du 09/09 : "le calendrier
  // devient illisible... sans filtre par équipe visible" -- la grille du
  // mois/la vue Liste n'avaient jusqu'ici jamais accès à ce filtre,
  // pourtant déjà là pour les vues Résultats/Matchs/Événements). Fonction
  // partagée plutôt que deux copies : le bug du 2026-08-25 (un événement
  // "Équipes spécifiques" invisible du filtre parce que seul event.teamId
  // était regardé, jamais targetTeamIds) ne doit pouvoir se corriger qu'à
  // UN seul endroit, pas être réparé ici et oublié là.
  // Retour de Cindy du 11/09 : l'onglet actif ("pills") peut représenter
  // plusieurs vraies équipes à la fois (memberTeamIds, voir resultsTeams
  // ci-dessus) -- un événement matche dès qu'il touche N'IMPORTE
  // LAQUELLE d'entre elles, pas seulement l'id de l'onglet lui-même.
  // Repli sur [activeResultsTeamIdResolved] pour un onglet qui ne
  // représente que lui-même (cas de tous les jours, memberTeamIds
  // absent).
  const activeMemberTeamIds =
    sortedResultsTeams.find((t) => t.id === activeResultsTeamIdResolved)?.memberTeamIds ??
    (activeResultsTeamIdResolved != null ? [activeResultsTeamIdResolved] : []);

  function matchesTeamFilter(e: AdminUpcomingEvent) {
    if (!resultsTeams || resultsTeams.length <= 1) return true;
    return resultsTeamSelector === "dropdown"
      ? e.teamId
        ? selectedResultTeamIds.has(e.teamId)
        : e.targetTeamIds && e.targetTeamIds.length > 0
          ? e.targetTeamIds.some((id) => selectedResultTeamIds.has(id))
          : true
      : e.teamId
        ? activeMemberTeamIds.includes(e.teamId)
        : !e.targetTeamIds ||
          e.targetTeamIds.length === 0 ||
          e.targetTeamIds.some((id) => activeMemberTeamIds.includes(id));
  }

  const canManage = Boolean(createTeams && createTeams.length > 0);

  // canManage dit "cet utilisateur gère AU MOINS une équipe" — un coach qui
  // coache l'U13F et joue en Séniors 1 voit les deux dans la même liste,
  // mais la policy RLS "coach update own team events" ne matche que
  // l'équipe réellement coachée. Sans ce calcul par carte, les crayons
  // Modifier/Supprimer/Ajouter le score apparaissaient aussi sur les
  // matchs Séniors — un clic dessus échouait sans le moindre message (une
  // policy RLS en UPDATE filtre la ligne au lieu de rejeter). Partagé
  // entre renderEventCard et renderResultCard (nettoyage du 31/08, même
  // formule dupliquée aux deux endroits).
  function canManageThisEvent(event: { teamId: string | null }) {
    return canManage && (event.teamId ? Boolean(createTeams?.some((t) => t.id === event.teamId)) : allowClubWide);
  }

  // Différenciation visuelle par nature d'événement (direction artistique
  // validée le 2026-08-23), partagée entre renderEventCard et
  // renderResultCard (nettoyage du 31/08 — même formule dupliquée aux deux
  // endroits, avec un léger écart préservé ici via `variant` plutôt que de
  // trancher lequel des deux avait raison) : "upcoming" ne porte "relative"
  // que pour un tournoi (badge interne positionné dessus) ; "result" porte
  // en plus "overflow-hidden" sur toutes les cartes depuis les confettis du
  // 26/08 (retour de Cindy) — ConfettiBurst se pose en position:fixed
  // plein écran depuis le 28/08 donc ces classes n'ont plus d'effet sur
  // LUI, mais gardées pour ne rien changer au reste du contenu de la carte.
  function eventCardShellClass(
    event: { event_type: string | null },
    style: { border: string },
    variant: "upcoming" | "result"
  ) {
    const isTournament = event.event_type === "TOURNAMENT";
    const prefix =
      variant === "result" ? "relative overflow-hidden " : isTournament ? "relative " : "";
    if (isTournament) {
      return `${prefix}rounded-2xl border-2 border-dashed border-ubac-yellow bg-white p-4 shadow-sm`;
    }
    if (event.event_type === "MATCH") {
      return `${prefix}rounded-2xl border border-navy/15 bg-white p-4 shadow-sm border-l-8 ${style.border}`;
    }
    return `${prefix}rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm border-l-4 ${style.border}`;
  }

  // Retour de Cindy du 2026-08-25 ("je ne peux pas modifier ce que je veux,
  // il faudrait qu'il se réouvre comme lors d'une création, meme visuel,
  // pas un popup") : le formulaire de modification n'est plus une modale à
  // part (state edit* + confirmEdit, retiré) mais CreateEventForm lui-même
  // en mode édition (prop editingEvent) — mêmes champs, y compris
  // "Événement payant", jamais en reste par rapport à la création.
  const [editingEvent, setEditingEvent] = useState<AdminUpcomingEvent | null>(null);
  const [deleteEventTarget, setDeleteEventTarget] = useState<AdminUpcomingEvent | null>(null);
  // Retour de Cindy du 29/08 ("Test vue bénévoles" resté sans qu'on
  // comprenne comment supprimer l'événement) : supprimer un événement ne
  // supprime jamais sa collecte de suivi (event_id passé à null plutôt que
  // supprimée en cascade, exprès — voir 20260825000000_paid_events.sql,
  // pour ne jamais perdre un historique de paiements réels). Sans
  // avertissement, une collecte de test/événement payant supprimé restait
  // orpheline sans que rien ne le signale ici. Décoché par défaut : garde
  // le même filet de sécurité qu'avant pour un vrai stage déjà payé par des
  // familles — supprimer les paiements reste un choix explicite, jamais
  // la conséquence machinale d'un clic sur "Supprimer l'événement".
  const [deleteCollecteToo, setDeleteCollecteToo] = useState(false);
  // Retour de Cindy du 12/09 ("Répéter") : "cette occurrence uniquement"
  // par défaut -- ne s'affiche/ne compte que pour un événement issu d'une
  // série (deleteEventTarget.seriesId non nul), voir le ConfirmDialog plus
  // bas.
  const [deleteSeriesScope, setDeleteSeriesScope] = useState<"one" | "following">("one");

  // Retour de Cindy du 12/09 ("Répéter") : même choix qu'à la suppression,
  // mais pour "Modifier" -- editSeriesChoiceTarget porte l'événement en
  // attente de ce choix (avant d'ouvrir CreateEventForm), editScope le choix
  // retenu (lu une fois dans onUpdated ci-dessous pour décider de propager
  // ou non). Jamais affiché pour un événement isolé (seriesId nul) : le clic
  // sur "Modifier" ouvre alors directement le formulaire, comme avant.
  const [editSeriesChoiceTarget, setEditSeriesChoiceTarget] = useState<AdminUpcomingEvent | null>(null);
  const [editScope, setEditScope] = useState<"one" | "following">("one");

  function startEditingEvent(event: AdminUpcomingEvent) {
    if (event.seriesId) {
      setEditScope("one");
      setEditSeriesChoiceTarget(event);
    } else {
      setEditingEvent(event);
    }
  }

  // Déclenché par le bouton "Supprimer" ; la confirmation elle-même vit
  // dans deleteEventTarget + le <ConfirmDialog> rendu plus bas (retour de
  // Cindy du 2026-08-21 : la popup native window.confirm() ne ressemble
  // pas à l'appli et affiche son propre chrome de navigateur, impossible
  // à styler ou à retirer).
  async function confirmDeleteEvent(
    event: AdminUpcomingEvent,
    alsoDeleteCollecte: boolean,
    seriesScope: "one" | "following" = "one"
  ) {
    setDeleteEventTarget(null);
    // Retour de Cindy du 12/09 ("cette occurrence uniquement" / "cette
    // occurrence et les suivantes") : n'a d'effet que si l'événement fait
    // partie d'une série (seriesId non nul) -- sinon deleteFollowing reste
    // toujours false, comportement identique à avant ce correctif.
    const deleteFollowing = seriesScope === "following" && Boolean(event.seriesId);
    // Disparition immédiate plutôt que d'attendre le rafraîchissement
    // temps réel — retour de Cindy du 2026-08-21, même correctif que la
    // création/modification ci-dessus. Levée avant sendEventPush (network,
    // potentiellement lent) et pas seulement avant le delete : sinon le
    // clic restait bloqué en apparence jusqu'à ce que CET appel-là
    // termine, reproduisant exactement le même délai perçu sous un autre
    // nom.
    setLocalEvents((prev) =>
      prev.filter((e) =>
        deleteFollowing
          ? !(e.seriesId === event.seriesId && e.start_time >= event.start_time)
          : e.id !== event.id
      )
    );

    // Bonus, pas bloquant pour l'utilisateur (déjà reparti visuellement
    // ci-dessus) mais toujours attendu ici : voir event-push.ts. Envoyé
    // avant la suppression — push_targets_for_event a besoin de retrouver
    // l'événement pour savoir à qui l'envoyer, ce qui ne serait plus
    // possible une fois la ligne effacée. Une seule notification même pour
    // "et les suivantes" : elle mentionne cette occurrence précise, pas
    // question d'en envoyer une par occurrence supprimée.
    const when = new Date(event.start_time).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const heure = new Date(event.start_time).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const lieu = event.salle || event.location;
    // Attendu, cette fois : la ligne doit encore exister côté serveur au
    // moment où push_targets_for_event la cherche.
    await sendEventPush(
      event.id,
      `UBAC — ${event.teamName}`,
      deleteFollowing
        ? `Annulé : ${when} à ${heure}${lieu ? ` · ${lieu}` : ""} et les suivant(e)s.`
        : `Annulé : ${when} à ${heure}${lieu ? ` · ${lieu}` : ""}.`
    );

    const supabase = createClient();
    // Vérifiés (audit du 31/08) : RLS peut bloquer une suppression sans
    // lever d'erreur (0 ligne affectée) — l'événement resterait alors en
    // base, prêt à réapparaître au prochain rafraîchissement temps réel,
    // alors que la notification d'annulation ci-dessus est déjà partie.
    const { error: deleteEventError } = deleteFollowing
      ? await supabase
          .from("events")
          .delete()
          .eq("series_id", event.seriesId!)
          .gte("start_time", event.start_time)
      : await supabase.from("events").delete().eq("id", event.id);
    if (deleteEventError) {
      console.error("[calendar-view] suppression de l'événement échouée:", deleteEventError);
    }
    if (alsoDeleteCollecte && event.collecteId) {
      // cotisations.collecte_id est en "on delete cascade" (migration
      // 20260802000000) : ses participants et paiements enregistrés
      // disparaissent avec elle, pas besoin d'un second appel.
      const { error: deleteCollecteError } = await supabase
        .from("collectes")
        .delete()
        .eq("id", event.collecteId);
      if (deleteCollecteError) {
        console.error("[calendar-view] suppression de la collecte échouée:", deleteCollecteError);
      }
    }
  }

  // Retour de Cindy du 12/09 ("Répéter", "cette occurrence et les
  // suivantes") : appliqué APRÈS que l'occurrence éditée elle-même a été
  // enregistrée par CreateEventForm (onUpdated) -- ne touche jamais
  // start_time/end_time/impact_time, propres à chaque date, seulement les
  // champs qui décrivent l'événement lui-même. `gt` (strictement après),
  // pas `gte` : l'occurrence éditée a déjà reçu son propre update, un
  // `gte` la réécrirait une seconde fois pour rien.
  async function propagateToFollowingOccurrences(updated: AdminUpcomingEvent) {
    const supabase = createClient();
    const { error } = await supabase
      .from("events")
      .update({
        title: updated.title,
        event_type: updated.event_type,
        is_home: updated.isHome,
        location: updated.location,
        salle: updated.salle,
        notes: updated.notes,
        team_id: updated.teamId,
        target_team_ids: updated.targetTeamIds,
        commission_group_ids: updated.commissionGroupIds,
      })
      .eq("series_id", updated.seriesId!)
      .gt("start_time", updated.start_time);
    if (error) {
      console.error("[calendar-view] propagation aux occurrences suivantes échouée:", error);
      return;
    }
    const teamName = createTeams?.find((t) => t.id === updated.teamId)?.name ?? updated.teamName;
    setLocalEvents((prev) =>
      prev.map((e) =>
        e.seriesId === updated.seriesId && e.start_time > updated.start_time
          ? {
              ...e,
              title: updated.title,
              event_type: updated.event_type,
              isHome: updated.isHome,
              location: updated.location,
              salle: updated.salle,
              notes: updated.notes,
              teamId: updated.teamId,
              targetTeamIds: updated.targetTeamIds,
              commissionGroupIds: updated.commissionGroupIds,
              teamName,
            }
          : e
      )
    );
  }

  function relanceMailto(event: AdminUpcomingEvent) {
    if (!rsvp || !contactEmailByPlayerId || !event.teamId) return null;
    const emails = rsvp.players
      .filter((p) => event.teamId && p.teamIds.includes(event.teamId))
      .map((p) => contactEmailByPlayerId[p.id])
      .filter((e): e is string => Boolean(e));
    if (emails.length === 0) return null;
    const when = `${new Date(event.start_time).toLocaleString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })}, ${formatEventTime(event.start_time, event.end_time)}`;
    return buildGmailComposeLink({
      bcc: emails.join(","),
      subject: `UBAC - Convocation ${event.teamName}`,
      body: `Bonjour,\n\nMerci de confirmer votre présence pour : ${event.title ?? styleFor(event.event_type).label}, le ${when}${event.location ? ` (${event.location})` : ""}.\n\nSportivement,\nLe coach`,
    });
  }

  // Source unique des filtres "Masquer les entraînements" ET équipe
  // (retour de Cindy du 09/09, ajouté ici pour que la grille du mois/le
  // panneau du jour/la liste Événements en bénéficient aussi) : localEvents
  // reste intact (édition/suppression en ont besoin en entier), seule
  // cette liste dérivée alimente l'affichage. matchesTeamFilter est un
  // no-op (retourne toujours true) tant que `resultsTeams` n'est pas
  // fourni ou n'a qu'une seule équipe -- inchangé pour tous les appels
  // existants qui ne le passent pas encore. matchesTeamFilter n'est pas
  // dans les deps : c'est une fonction déclarée dans le corps du
  // composant (pas un Hook), ses propres dépendances (resultsTeams,
  // resultsTeamSelector, selectedResultTeamIds, activeResultsTeamIdResolved)
  // sont listées explicitement ci-dessous à sa place.
  const visibleEvents = useMemo(
    () =>
      localEvents
        .filter((e) => !hiddenEventTypes.has(e.event_type ?? "OTHER"))
        .filter(matchesTeamFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      localEvents,
      hiddenEventTypes,
      resultsTeams,
      resultsTeamSelector,
      selectedResultTeamIds,
      activeResultsTeamIdResolved,
    ]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, AdminUpcomingEvent[]>();
    visibleEvents.forEach((e) => {
      const key = toKey(new Date(e.start_time));
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    });
    return map;
  }, [visibleEvents]);

  const birthdaysByMonthDay = useMemo(
    () => groupBirthdaysByMonthDay(birthdayMembers),
    [birthdayMembers]
  );

  // Anniversaires à moins de 7 jours : ex-encart "Anniversaires de la
  // semaine" (supprimé), désormais réinjectés à leur date exacte dans le
  // fil chronologique de la vue Liste — même donnée, même fenêtre de 7
  // jours, juste plus d'encart séparé qui doublonnait l'info.
  const nearBirthdays = useMemo(() => upcomingBirthdays(birthdayMembers), [birthdayMembers]);

  // Retour de Cindy du 05/09 : changer de mois redemande désormais la page
  // avec le bon ?month=... (préservant les autres paramètres, ex: ?tab=...)
  // pour que le serveur recharge les entraînements de CE mois précis --
  // exactement le même principe que dashboard-tabs.tsx pour les espaces.
  // L'état local (viewMonth/selectedDate) change immédiatement, pour un
  // retour visuel sans attendre l'aller-retour ; seuls les entraînements
  // du nouveau mois arrivent un instant après.
  function monthParamFor(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function hrefForMonth(d: Date) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", monthParamFor(d));
    return `/dashboard?${params.toString()}`;
  }

  function navigateToMonth(d: Date) {
    startMonthTransition(() => {
      router.push(hrefForMonth(d));
    });
  }

  function prefetchMonth(d: Date) {
    router.prefetch(hrefForMonth(d));
  }

  function goToday() {
    const now = new Date();
    setViewMonth(now);
    setSelectedDate(now);
    navigateToMonth(now);
  }

  function step(amount: number) {
    const d = new Date(viewMonth);
    d.setMonth(d.getMonth() + amount);
    setViewMonth(d);
    setSelectedDate(d);
    navigateToMonth(d);
  }

  const selectedKey = toKey(selectedDate);

  // Précalculés pour le préchargement au survol des flèches (voir leur
  // onMouseEnter plus bas) -- même principe que dashboard-tabs.tsx.
  const prevMonthDate = useMemo(() => {
    const d = new Date(viewMonth);
    d.setMonth(d.getMonth() - 1);
    return d;
  }, [viewMonth]);
  const nextMonthDate = useMemo(() => {
    const d = new Date(viewMonth);
    d.setMonth(d.getMonth() + 1);
    return d;
  }, [viewMonth]);

  const headerLabel = viewMonth.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  const gridDays = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  const detailEvents = eventsByDate.get(selectedKey) ?? [];
  const detailBirthdays = birthdaysByMonthDay.get(monthDayKey(selectedDate)) ?? [];

  // Vue Liste : tout ce qui reste à venir, du plus proche au plus lointain.
  // Le seuil est le début de la journée pour qu'un match du matin ne
  // disparaisse pas de la liste l'après-midi même.
  const upcomingEvents = useMemo(() => {
    const from = startOfTodayMs();
    return visibleEvents
      .filter((e) => new Date(e.start_time).getTime() >= from)
      .sort(byStartTime);
  }, [visibleEvents]);

  // Retour de Cindy du 12/09 ("ouvrir les besoins d'organisation en
  // automatique dès le prochain événement") : upcomingEvents ci-dessus est
  // déjà trié du plus proche au plus lointain -- le premier élément EST le
  // prochain événement, peu importe son type (voir renderEventCard, seul
  // à comparer son event.id à celui-ci pour ouvrir sa boîte Organisation
  // par défaut). Recalculé à chaque changement de upcomingEvents (filtre
  // équipe compris) : si le prochain événement sort du filtre actif, plus
  // aucune carte visible n'est ouverte d'office, jamais une carte au
  // hasard.
  const nextEventId = upcomingEvents[0]?.id ?? null;

  // Les vues "saison" (Résultats / Matchs officiels / Résultats officiels /
  // Événements) partagent le même principe : tout le calendrier de la
  // saison filtré par type, joué ou non, dans l'ordre chronologique — même
  // logique que la page FFBB (J1, J2, J3...) plutôt qu'un historique
  // séparé du planning. Un événement à venir apparaît donc aussi (sans
  // score pour un match — renderResultCard gère l'affichage "à venir" et
  // empêche d'en saisir un avant que le match ait réellement eu lieu).
  function matchesSeasonView(eventType: string | null, kind: typeof view) {
    switch (kind) {
      case "results":
        return isMatchType(eventType); // MATCH + FRIENDLY (Famille/Enfant, inchangé).
      case "officialMatches":
      case "officialResults":
        // Les deux angles sur le même sous-ensemble ("Matchs & Résultats") :
        // le filtre "déjà joué" de officialResults s'applique en plus, plus
        // bas dans seasonListEvents.
        return eventType === "MATCH";
      case "clubEvents":
        // Tout le calendrier du club sauf les matchs officiels.
        return eventType !== "MATCH";
      default:
        return false;
    }
  }

  const seasonListEvents = useMemo(() => {
    return visibleEvents
      .filter((e) => {
        if (!matchesSeasonView(e.event_type, view)) return false;
        // "Résultats" (des matchs officiels) : seulement ceux déjà joués,
        // à la différence de "Matchs officiels" qui montre tout le
        // calendrier (à venir compris).
        if (view === "officialResults" && new Date(e.start_time).getTime() >= new Date().getTime()) {
          return false;
        }
        // Retour de Cindy du 29/08 : "Événements" (clubEvents) ne doit plus
        // montrer un entraînement/événement passé dès le lendemain — seuil
        // sur le début de journée (comme upcomingEvents plus haut) pour
        // qu'un événement du matin reste visible tout le jour même, et ne
        // disparaisse que le jour suivant. "Matchs officiels"/"Résultats"
        // gardent leur logique saison complète, inchangée.
        if (view === "clubEvents" && new Date(e.start_time).getTime() < startOfTodayMs()) {
          return false;
        }
        // Filtre équipe : plus besoin de le refaire ici, déjà appliqué en
        // amont par visibleEvents (voir matchesTeamFilter) -- chaque
        // événement qui arrive jusqu'ici le respecte déjà.
        return true;
      })
      .sort(byStartTime);
    // matchesSeasonView n'est pas dans les deps : fonction déclarée dans
    // le corps du composant (pas un Hook), sans état propre -- son seul
    // paramètre variable (`view`) est déjà listé ci-dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEvents, view]);

  // Anniversaires + événements mélangés dans un seul fil chronologique,
  // triés ensemble : un anniversaire vaut minuit ce jour-là (avant tout
  // événement du même jour, qui a lui une vraie heure), donc il ouvre
  // naturellement la journée plutôt que de s'intercaler au hasard.
  const upcomingListItems = useMemo(() => {
    type ListItem =
      | { kind: "event"; date: Date; event: AdminUpcomingEvent }
      | { kind: "birthday"; date: Date; member: BirthdaySource };
    const items: ListItem[] = upcomingEvents.map((event) => ({
      kind: "event",
      date: new Date(event.start_time),
      event,
    }));
    nearBirthdays.forEach((member) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + member.daysUntil);
      items.push({ kind: "birthday", date, member });
    });
    return items.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [upcomingEvents, nearBirthdays]);

  // Une seule carte pour les deux vues : la liste et le detail du jour
  // affichent exactement le meme evenement, avec les memes compteurs.
  function renderEventCard(event: AdminUpcomingEvent) {
    const style = styleFor(event.event_type);
    const rsvpCounts = event.rsvpCounts;
    const hasRoster =
      rsvpCounts.present + rsvpCounts.absent + rsvpCounts.late + rsvpCounts.pending > 0;
    // Bug trouvé le 26/08 (retour de Cindy : "je ne peux pas me porter
    // volontaire pour l'arbitrage" sur un stage ciblant U13M via
    // "Équipes spécifiques") : cette liste ne regardait QUE event.teamId,
    // l'équipe unique d'un match classique — vide pour un événement à
    // équipes spécifiques (event.targetTeamIds, une liste), donc AUCUN
    // enfant n'y apparaissait jamais comme "concerné", même membre d'une
    // des équipes ciblées. Touchait RSVP, tâches et besoins d'organisation
    // à la fois, pour toutes les familles, sur tout événement à équipes
    // spécifiques.
    const respondingPlayers = rsvp
      ? rsvp.players.filter(
          (p) =>
            (event.teamId && p.teamIds.includes(event.teamId)) ||
            (event.targetTeamIds?.some((id) => p.teamIds.includes(id)) ?? false)
        )
      : [];
    const mailto = relanceMailto(event);
    const homeAway = isMatchType(event.event_type) ? homeAwayLabel(event.isHome) : null;
    const canManageEvent = canManageThisEvent(event);
    // Une famille voit tous ses enfants concernés (respondingPlayers peut
    // en contenir plusieurs). Un coach, lui, ne doit jamais voir le bouton
    // de ses coéquipiers — seulement le sien, quand il en a un sur cette
    // équipe précise : coachRsvpPlayers (page.tsx) porte tout l'effectif
    // des équipes coachées, pas seulement sa propre fiche. canManage sert
    // ici à distinguer les deux contextes (toujours faux côté famille).
    const rsvpVisiblePlayers = canManage
      ? respondingPlayers.filter((p) => p.id === selfPlayerId)
      : respondingPlayers;
    // Différenciation visuelle par nature d'événement (direction
    // artistique validée le 2026-08-23) : un match officiel doit peser un
    // peu plus qu'un entraînement ordinaire, un tournoi doit sauter aux
    // yeux avant même d'être lu. Volontairement limité à la bordure/au
    // fond (jamais aux couleurs de texte à l'intérieur) : cette carte
    // porte beaucoup de contenu (RSVP, tâches, covoiturage...) partagé
    // sur les 4 espaces — un vrai fond sombre façon maquette aurait
    // demandé de recolorer chaque élément interne un par un, bien plus
    // risqué qu'un simple accent de bordure pour le même effet de lecture
    // rapide.
    const cardShellClass = eventCardShellClass(event, style, "upcoming");
    // Toujours utile plus bas (fanion "Spécial") même si le calcul de
    // cardShellClass ci-dessus est maintenant partagé.
    const isTournament = event.event_type === "TOURNAMENT";

    return (
      <div key={event.id} className={`flex flex-col gap-2 ${cardShellClass}`}>
        {/* Retour de Cindy du 29/08 : les confettis (MatchResultCelebration)
            ne se déclenchaient que sur "Matchs & Résultats" (renderResultCard
            plus bas), qui ne montre QUE les matchs officiels (MATCH) — un
            match amical (FRIENDLY) gagné vit sous "Événements" et n'était
            donc jamais fêté. isMatchType couvre les deux ; hasCelebratedMatch
            (via resultKey) empêche un double déclenchement si ce même match
            apparaît aussi ailleurs. */}
        {isMatchType(event.event_type) && (
          <MatchResultCelebration
            resultKey={`${event.id}:${event.teamScore}-${event.opponentScore}`}
            isWin={isRecentWin(event)}
            enabled={celebrateWins}
          />
        )}
        {/* Fanion "Spécial" (retour de Cindy du 2026-08-24, item 6 du topo :
            "le tournoi exceptionnel doit sauter aux yeux") — s'ajoute à la
            bordure pointillée ci-dessus plutôt que de la remplacer, pour
            que l'effet reste lisible même en survol rapide de la liste. */}
        {isTournament && (
          <span className="absolute -top-2.5 right-3 flex items-center gap-1 rounded-full bg-ubac-yellow px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-navy shadow-sm">
            <Sparkles className="h-3 w-3" />
            Spécial
          </span>
        )}
        <div className="flex items-start justify-between gap-2">
          {/* min-w-0 : même correctif que renderResultCard plus bas — sans
              lui, le nom d'adversaire le plus long forçait toute la carte
              (et l'écran, en mobile) à déborder au lieu de tronquer. */}
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {event.teamName}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${style.badge}`}
              >
                {style.label}
              </span>
              {homeAway && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-600">
                  {homeAway}
                </span>
              )}
              {/* Retour de Cindy du 2026-08-25 ("Créer un événement" ->
                  "Événement payant") : badge visible sur tous les espaces
                  (y compris Enfant, en lecture seule) — voir
                  child-calendar-tab.tsx pour son équivalent. */}
              {event.isPaid && (
                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                  <Euro className="h-3 w-3" />
                  Payant
                </span>
              )}
            </span>
            {isMatchType(event.event_type) ? (
              <>
                <OpponentDisplay title={event.title} size="sm" />
                <MatchScore
                  eventId={event.id}
                  teamScore={event.teamScore}
                  opponentScore={event.opponentScore}
                  canEdit={canManageEvent}
                  onSaved={(teamScore, opponentScore) =>
                    updateLocalEventScore(event.id, teamScore, opponentScore)
                  }
                />
              </>
            ) : (
              <span className="font-semibold text-zinc-900">
                {event.title ?? style.label}
              </span>
            )}
          </div>
          {canManageEvent && (
            <div className="flex shrink-0 items-center gap-1">
              {mailto && (
                <a
                  href={mailto}
                  target="_blank"
                  rel="noreferrer"
                  title="Relancer les convoqués"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                >
                  <Mail className="h-4 w-4" />
                </a>
              )}
              <button
                onClick={() => startEditingEvent(event)}
                title="Modifier"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setDeleteEventTarget(event);
                  setDeleteCollecteToo(false);
                  setDeleteSeriesScope("one");
                }}
                title="Supprimer"
                className="flex h-8 w-8 items-center justify-center rounded-full text-red-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
          <span className="flex items-center gap-1">
            {/* Bleu (retour de Cindy du 2026-08-23) : la petite icône
                calendrier se fondait dans le texte gris de la date. */}
            <CalendarDays className="h-4 w-4 text-navy" />
            {new Date(event.start_time).toLocaleString("fr-FR", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
            , {formatEventTime(event.start_time, event.end_time)}
          </span>
          {/* Retour de Cindy du 12/09 ("heure d'impact") : visuellement
              distincte de l'heure de début (ambre plutôt que le gris
              neutre de la ligne date/heure) -- affichée dès qu'elle
              existe, sur les 4 espaces qui voient cette carte
              (Bureau/Coach/Famille/Enfant, plus Commissions/Bénévoles via
              child-calendar-tab.tsx). */}
          {event.impactTime && (
            <span className="flex items-center gap-1 font-semibold text-amber-700">
              <AlarmClock className="h-4 w-4" />
              {formatImpactTime(event.impactTime)}
            </span>
          )}
          {event.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {event.location}
            </span>
          )}
          {event.salle && <SalleBadge salle={event.salle} />}
        </div>

        {/* Écrite par le coach/Bureau à la création ou la modification,
            mais jusqu'ici jamais réaffichée nulle part — une note comme
            "RDV 45 min avant, tenue blanche" partait dans le vide. */}
        {event.notes && (
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
            <StickyNote className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
            {event.notes}
          </p>
        )}

        {/* Bouton "Payer" (retour de Cindy du 2026-08-25) : accessible à
            qui voit la carte (Bureau/Coach/Famille — jamais côté Enfant,
            qui n'a que le badge "Payant" ci-dessus), pas seulement à
            canManageEvent — chaque famille paie elle-même, sans envoi
            groupé à faire à la main. */}
        {event.isPaid && event.paymentLink && (
          <a
            href={event.paymentLink}
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            Payer via HelloAsso
          </a>
        )}

        {/* Qui est concerné par ce stage/événement payant (retour de Cindy
            du 2026-08-25) — distinct de "Qui sera là ?" plus bas, qui ne
            parle que de présence à cet événement précis. */}
        {event.isPaid && <PaidParticipantsList players={event.paidParticipants} />}

        <ItineraryButton query={venueQuery(event)} />

        {hasRoster && (
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full bg-status-success/10 px-2 py-0.5 text-xs font-semibold leading-none text-status-success">
              <Check className="h-3 w-3" />
              {rsvpCounts.present} présent
              {rsvpCounts.present > 1 ? "s" : ""}
            </span>
            {rsvpCounts.late > 0 && (
              <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full bg-status-pending/10 px-2 py-0.5 text-xs font-semibold leading-none text-status-pending-dark">
                <Clock className="h-3 w-3" />
                {rsvpCounts.late} en retard
              </span>
            )}
            <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full bg-status-urgent/10 px-2 py-0.5 text-xs font-semibold leading-none text-status-urgent-dark">
              <X className="h-3 w-3" />
              {rsvpCounts.absent} absent
              {rsvpCounts.absent > 1 ? "s" : ""}
            </span>
            <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold leading-none text-zinc-600">
              <Clock className="h-3 w-3" />
              {rsvpCounts.pending} en attente
            </span>
          </div>
        )}

        {/* "Qui sera là ?" — retour de Cindy du 30/08 : visible sur tous
            les espaces (Bureau/Coach/Famille), plus seulement côté Famille
            comme avant (voir presentPlayers sur AdminUpcomingEvent). */}
        <PresentPlayersList players={event.presentPlayers ?? []} />

        {/* Retour de Cindy du 11/09 ("qui est absent ?") : même endroit,
            juste après "Qui sera là ?". */}
        <AbsentPlayersList players={event.absentPlayers ?? []} />

        {/* Retour de Cindy du 06/09 : vision des bénévoles invités et de
            leur réponse, même endroit que "Qui sera là ?" ci-dessus. */}
        <BenevoleInvitesList invites={event.benevoleInvites ?? []} />

        {/* Plus d'appel express ici pour une équipe gérée : le coach ne
            répond pas à la place des familles, il leur demande de le
            faire depuis sa carte d'événement (Organisation & Bilan).
            Mais sur une équipe qu'il ne gère pas (ex. sa propre équipe de
            joueur), personne d'autre ne répond pour lui : il doit voir
            son propre bouton, comme n'importe quel joueur. */}
        {!canManageEvent && rsvpVisiblePlayers.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-zinc-100 pt-2">
            {rsvpVisiblePlayers.map((p) => {
              const playerStatus =
                rsvp?.statusByKey[`${event.id}:${p.id}`] ?? "PENDING";
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-2">
                  {rsvpVisiblePlayers.length > 1 && (
                    <span className="min-w-0 truncate text-xs font-medium text-zinc-500">
                      {p.name}
                    </span>
                  )}
                  {/* Plus de pastille "Présent/Absent" séparée à côté des
                      boutons : le bouton actif (RsvpButtons) porte déjà
                      cette information, la répéter juste à côté faisait
                      doublon (retour de Cindy du 2026-08-20). */}
                  <RsvpButtons
                    eventId={event.id}
                    playerId={p.id}
                    currentStatus={playerStatus}
                    onStatusChange={(previousStatus, newStatus) =>
                      updateLocalRsvpStatus(event.id, p.id, p.name, previousStatus, newStatus)
                    }
                    hasOrganisationNeeds={(volunteerNeedsByEventId[event.id]?.length ?? 0) > 0}
                    currentNote={rsvp?.noteByKey?.[`${event.id}:${p.id}`] ?? null}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Rôles et covoiturage : mêmes données, même composant que les
            onglets Organisation / Prochains Événements — pas une version
            allégée propre au calendrier, pour ne jamais afficher deux
            vérités différentes du même trajet. Condition par ÉVÉNEMENT
            (canManageEvent), pas par instance entière (canManage) : un
            coach qui gère au moins une équipe voyait ce bloc disparaître
            partout, y compris sur les matchs d'une équipe où il n'est que
            joueur — alors que Bureau/Coach n'ont un onglet Organisation
            dédié que pour les équipes qu'ils gèrent réellement, jamais
            pour celles où ils ne sont que joueur. MatchTasksPanel se
            masque déjà tout seul s'il n'y a ni rôle ni covoiturage
            applicable : pas besoin d'un filtre par type d'événement en
            plus pour un "Événement club" pourtant organisé. L'entraînement
            reste l'exception explicite ci-dessous. */}
        {/* MatchTasksPanel (Maillots/Table de marque, ancien système) et
            VolunteerNeedsPanel (Besoins d'organisation, nouveau système)
            regroupés sous un seul titre "Organisation" plutôt que deux
            encarts séparés qui répétaient la même idée visuellement
            (retour de Cindy du 2026-08-20). Chacun garde son mode `bare`
            (sans cadre ni titre propres) et reste responsable de sa
            propre visibilité (roles/showCarpool pour l'un, needs pour
            l'autre) — la boîte partagée ne s'affiche donc que si l'un des
            deux a quelque chose à montrer. Règle explicite de Cindy du
            2026-08-24 : un entraînement ne montre JAMAIS cet onglet, sur
            aucun espace, même si un rôle/besoin lui est un jour rattaché
            en base — la carte entraînement doit rester sobre par
            construction, pas juste par absence de données. */}
        {!canManageEvent && event.event_type !== "TRAINING" && (() => {
          const roles = rolesForEventType(eventRoles, event.event_type);
          const hasTasks = roles.length > 0 || shouldOfferCarpool(event);
          const needs = volunteerNeedsByEventId[event.id] ?? emptyVolunteerNeeds;
          const hasNeeds = needs.length > 0;
          if (!hasTasks && !hasNeeds) return null;
          return (
            <OrganisationCard defaultOpen={event.id === nextEventId}>
              {hasTasks && (
                <MatchTasksPanel
                  eventId={event.id}
                  eventDate={event.start_time}
                  // rsvpVisiblePlayers plutôt que [] (audit du 31/08) :
                  // vide, l'affichage optimiste d'un engagement montrait un
                  // nom blanc jusqu'au prochain rafraîchissement temps réel
                  // — myPlayerIds ci-dessous vient déjà de ce même tableau,
                  // donc aucun risque d'exposer plus que "SA propre fiche".
                  roster={rsvpVisiblePlayers}
                  // rsvpVisiblePlayers, pas respondingPlayers : un coach
                  // qui gère au moins une équipe (canManage) mais pas
                  // celle-ci (!canManageEvent) ne doit voir que SA propre
                  // fiche ici, pas tout l'effectif de l'équipe.
                  // respondingPlayers contient tout le roster côté Coach
                  // (coachRsvpPlayers, page.tsx) — l'utiliser tel quel
                  // ferait écrire volunteer()/reserve() sur
                  // myPlayerIds[0], c'est-à-dire un coéquipier arbitraire,
                  // pas le coach lui-même.
                  myPlayerIds={rsvpVisiblePlayers.map((p) => p.id)}
                  canAssignAnyone={false}
                  initialTasks={tasksByEventId[event.id] ?? emptyEventTasks}
                  initialCarpool={carpoolByEventId[event.id] ?? emptyCarpool}
                  roles={roles}
                  showCarpool={shouldOfferCarpool(event)}
                  bare
                />
              )}
              {hasNeeds && (
                <VolunteerNeedsPanel
                  eventId={event.id}
                  needs={needs}
                  myPlayerIds={rsvpVisiblePlayers.map((p) => p.id)}
                  canManage={false}
                  bare
                />
              )}
            </OrganisationCard>
          );
        })()}
        {/* Même boîte "Organisation" rétractable que la branche
            !canManageEvent ci-dessus — elle en était encore dépourvue
            (juste "Besoins d'organisation" nu, sans repli), alors que
            c'est justement la vue Bureau/Coach qui gère l'événement,
            probablement la plus consultée (retour de Cindy du
            2026-08-21 : "dans le bureau aussi il y en a"). Même règle
            "jamais sur un entraînement" que ci-dessus (retour de Cindy du
            2026-08-24). */}
        {canManageEvent && event.event_type !== "TRAINING" && (
          <OrganisationCard defaultOpen={event.id === nextEventId}>
            <VolunteerNeedsPanel
              eventId={event.id}
              needs={volunteerNeedsByEventId[event.id] ?? emptyVolunteerNeeds}
              myPlayerIds={[]}
              canManage
              bare
            />
          </OrganisationCard>
        )}
      </div>
    );
  }

  // Carte dédiée à un match déjà joué, volontairement plus légère que
  // renderEventCard : pas de compteurs de présence, pas de bouton
  // Présent/Absent, pas de répartition covoiturage/goûter — tout ça n'a
  // plus de sens une fois le match passé. Seuls restent l'essentiel (contre
  // qui, le score) et, pour qui gère l'équipe, de quoi corriger une
  // erreur de saisie après coup.
  function renderResultCard(event: AdminUpcomingEvent) {
    const style = styleFor(event.event_type);
    const homeAway = homeAwayLabel(event.isHome);
    const canManageEvent = canManageThisEvent(event);
    // Les vues Résultats/Matchs officiels montrent désormais toute la
    // saison, match à venir compris (voir seasonListEvents) : le bouton
    // "Ajouter le score" ne doit s'afficher qu'une fois le match
    // réellement joué, jamais avant.
    const alreadyPlayed = new Date(event.start_time).getTime() < Date.now();
    // Même logique d'accent que renderEventCard ci-dessus (direction
    // artistique du 2026-08-23), gardée cohérente entre "à venir" et
    // "résultats" pour ne pas avoir deux traitements différents du même
    // match selon l'onglet où on le regarde.
    const cardShellClass = eventCardShellClass(event, style, "result");
    return (
      <div key={event.id} className={`flex flex-col gap-1.5 ${cardShellClass}`}>
        {alreadyPlayed && (
          <MatchResultCelebration
            resultKey={`${event.id}:${event.teamScore}-${event.opponentScore}`}
            isWin={isRecentWin(event)}
            enabled={celebrateWins}
          />
        )}
        {/* Retour de Cindy du 2026-08-22 : reprend le visuel déjà en place
            pour "Prochains événements" (team-card.tsx) plutôt qu'un
            nouveau traitement — date en badge bleu bien visible en haut à
            droite, heure et lieu sur leur propre ligne avec icône, au lieu
            de tout reléguer dans un texte gris pâle qu'il fallait deviner
            ou aller chercher dans "Modifier". */}
        <div className="flex items-start justify-between gap-2">
          {/* min-w-0 indispensable ici : sans lui, un flex-item garde par
              défaut sa largeur de contenu maximale (min-width: auto), donc
              le nom de l'adversaire le plus long forçait toute la carte —
              et la page entière en mobile — à déborder à droite. */}
          <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {event.teamName}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <span className="whitespace-nowrap text-xs font-bold text-ubac-blue">
              {new Date(event.start_time).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
              })}
            </span>
            {canManageEvent && (
              <>
                <button
                  onClick={() => startEditingEvent(event)}
                  title="Modifier"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setDeleteEventTarget(event);
                    setDeleteCollecteToo(false);
                    setDeleteSeriesScope("one");
                  }}
                  title="Supprimer"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-red-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        <span className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${style.badge}`}
          >
            {style.label}
          </span>
          {homeAway && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-600">
              {homeAway}
            </span>
          )}
        </span>

        <OpponentDisplay title={event.title} size="sm" />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 shrink-0" />
            {formatEventTime(event.start_time, event.end_time)}
          </span>
          {/* Retour de Cindy du 12/09 ("heure d'impact") : même principe
              que renderEventCard plus haut. */}
          {event.impactTime && (
            <span className="flex items-center gap-1 font-semibold text-amber-700">
              <AlarmClock className="h-3 w-3 shrink-0" />
              {formatImpactTime(event.impactTime)}
            </span>
          )}
          {(event.salle || event.location) && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" />
              {event.salle ? <SalleBadge salle={event.salle} /> : event.location}
            </span>
          )}
        </div>

        {alreadyPlayed ? (
          <MatchScore
            eventId={event.id}
            teamScore={event.teamScore}
            opponentScore={event.opponentScore}
            canEdit={canManageEvent}
            onSaved={(teamScore, opponentScore) =>
              updateLocalEventScore(event.id, teamScore, opponentScore)
            }
          />
        ) : (
          <span className="w-fit rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-400">
            À venir
          </span>
        )}
      </div>
    );
  }

  // Une carte à part, pas une simple ligne : un anniversaire est traité
  // comme un événement à part entière du fil chronologique du jour
  // (ex-encart "Anniversaires de la semaine", supprimé — voir
  // nearBirthdays). Même gabarit que renderEventCard (arrondi, bordure de
  // couleur à gauche, ombre légère) pour s'intégrer au même fil sans
  // détonner, coloré rose/festif pour rester identifiable au premier coup
  // d'œil.
  function renderBirthdayCard(member: BirthdaySource) {
    return (
      <div
        key={`bday-${member.id}`}
        className="flex items-center gap-3 rounded-2xl border border-pink-100 bg-pink-50/60 p-4 shadow-sm border-l-4 border-l-pink-400"
      >
        <PartyPopper className="h-5 w-5 shrink-0 text-pink-500" />
        <div className="flex flex-col gap-1">
          <span className="w-fit rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-bold uppercase text-pink-700">
            Anniversaire
          </span>
          <span className="font-semibold text-zinc-900">
            {formatFirstName(member.firstName)}{" "}
            <span className="font-bold uppercase">{formatLastName(member.lastName)}</span>
            {member.category ? (
              <span className="font-normal text-zinc-500"> · {member.category}</span>
            ) : null}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Retour de Cindy du 2026-08-22 : l'action principale de l'écran
              passe avant la navigation de date (flèches + mois), pas
              après. */}
          {canManage && (
            <button
              onClick={() => setCreateOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-full bg-ubac-yellow px-4 py-2 text-sm font-semibold text-navy shadow-sm transition-colors hover:bg-ubac-yellow-dark"
            >
              <Plus className="h-4 w-4 shrink-0" />
              Créer un événement
            </button>
          )}

          {view === "month" && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => step(-1)}
                onMouseEnter={() => prefetchMonth(prevMonthDate)}
                onFocus={() => prefetchMonth(prevMonthDate)}
                onTouchStart={() => prefetchMonth(prevMonthDate)}
                aria-label="Précédent"
                disabled={isMonthPending}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-white transition-colors hover:bg-navy-dark disabled:opacity-60"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => step(1)}
                onMouseEnter={() => prefetchMonth(nextMonthDate)}
                onFocus={() => prefetchMonth(nextMonthDate)}
                onTouchStart={() => prefetchMonth(nextMonthDate)}
                aria-label="Suivant"
                disabled={isMonthPending}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-white transition-colors hover:bg-navy-dark disabled:opacity-60"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {/* Bouton "Aujourd'hui" retiré (retour de Cindy du 10/09) :
                  redondant avec la case du jour déjà surlignée dans la
                  grille du mois. La fonction "revenir au mois courant"
                  (utile après avoir navigué ailleurs) est conservée en
                  fusionnant avec la navigation de mois -- le libellé du
                  mois lui-même redevient cliquable, mêmes préchargements
                  au survol que l'ancien bouton. */}
              <button
                type="button"
                onClick={goToday}
                onMouseEnter={() => prefetchMonth(today)}
                onFocus={() => prefetchMonth(today)}
                onTouchStart={() => prefetchMonth(today)}
                disabled={isMonthPending}
                title="Revenir au mois en cours"
                className="rounded-full px-1.5 py-0.5 text-sm font-semibold capitalize text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-60"
              >
                {headerLabel}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Retour de Cindy du 09/09 ("le calendrier devient illisible...
              sans filtre par équipe visible") : même sélecteur que les
              vues Résultats/Matchs/Événements plus bas (TeamFilterDropdown/
              TeamSelectorPills), jusqu'ici jamais montré pour Mois/Liste --
              alors que c'est justement là que plusieurs équipes chargées le
              même jour rendaient la grille illisible ("+1", "+4"). Masqué
              sur les pages dédiées (forcedView) : elles ont déjà leur
              propre sélecteur plus bas, pas la peine de le doubler ici. */}
          {!forcedView && resultsTeams && resultsTeams.length > 1 && (
            <div className="w-full sm:w-auto">
              {resultsTeamSelector === "dropdown" ? (
                <TeamFilterDropdown
                  teams={sortedResultsTeams}
                  selectedIds={selectedResultTeamIds}
                  onChange={setSelectedResultTeamIds}
                  compact
                />
              ) : (
                <TeamSelectorPills
                  teams={sortedResultsTeams}
                  activeId={activeResultsTeamIdResolved}
                  onSelect={setActiveResultsTeamId}
                />
              )}
            </div>
          )}

          {/* Remplace "Masquer les entraînements" (retour de Cindy du
              10/09) : filtre par type d'événement plutôt qu'un seul
              interrupteur entraînements/reste -- visible sur le Calendrier
              et sur "Événements" (là où les entraînements peuvent
              apparaître), masqué sur les vues Matchs/Résultats où ils
              n'apparaissent de toute façon jamais (même condition
              qu'avant). Retour de Cindy du 12/09 : placé juste après le
              filtre par équipe et juste avant Liste/Mois (pas avant le
              filtre équipe comme avant) -- vérifié sur les 3 espaces
              (Bureau/Coach/Famille), un seul composant partagé ici. */}
          {(!forcedView || forcedView === "clubEvents") && (
            <EventTypeFilterDropdown
              hiddenTypes={hiddenEventTypes}
              onChange={updateHiddenEventTypes}
            />
          )}

          {/* Tout à droite : c'est un réglage d'affichage, pas une action
              sur les données — il vient après ce qu'on fait, pas avant.
              Masqué sur les pages dédiées "Événements" / "Matchs
              officiels" / "Résultats" (forcedView) : basculer vers Mois
              n'y aurait pas de sens, l'onglet Calendrier existe déjà pour
              ça. */}
          {!forcedView && (
            // bg-white (retour de Cindy du 2026-08-25, "le bouton liste doit
            // etre blanc on ne le voit pas") : sans fond propre, ce groupe
            // laissait transparaître le fond pâle de la page — seul "Mois"
            // (actif, fond bleu marine) ressortait, "Liste" (texte gris pâle
            // sans fond) devenait quasi invisible sur un fond du même ton.
            <div className="flex items-center gap-0.5 rounded-full border border-zinc-200 bg-white p-0.5">
              <button
                onClick={() => setView("list")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  view === "list" ? "bg-navy text-white" : "text-zinc-500 hover:bg-zinc-50"
                }`}
              >
                <List className="h-3.5 w-3.5" />
                Liste
              </button>
              <button
                onClick={() => setView("month")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  view === "month" ? "bg-navy text-white" : "text-zinc-500 hover:bg-zinc-50"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Mois
              </button>
            </div>
          )}
        </div>
      </div>

      {scopeTeams.length > 0 &&
        (() => {
          // scopeTeamRoleById absent (Bureau/Famille) : simple liste, comme
          // avant — retour de Cindy du 2026-09-02 pour le cas où il est
          // fourni (Coach), voir le commentaire sur ce prop plus haut.
          if (!scopeTeamRoleById) {
            return (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                <Users className="h-3.5 w-3.5 shrink-0" />
                Événements de {scopeTeams.map((t) => teamLabel(t)).join(", ")}
              </p>
            );
          }
          const coached = scopeTeams.filter((t) => scopeTeamRoleById[t.id] !== "PLAYER");
          const playedOnly = scopeTeams.filter((t) => scopeTeamRoleById[t.id] === "PLAYER");
          return (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
              <Users className="h-3.5 w-3.5 shrink-0" />
              Événements de{" "}
              {coached.length > 0 && (
                <>
                  {coached.map((t) => teamLabel(t)).join(", ")} (coaché
                  {coached.length > 1 ? "es" : "e"})
                </>
              )}
              {coached.length > 0 && playedOnly.length > 0 && " et "}
              {playedOnly.length > 0 && (
                <>
                  {playedOnly.map((t) => teamLabel(t)).join(", ")} (joué
                  {playedOnly.length > 1 ? "es" : "e"})
                </>
              )}
            </p>
          );
        })()}

      {createTeams && createTeams.length > 0 && (
        <CreateEventForm
          // Remonte le formulaire à chaque changement d'événement édité (ou
          // au retour en mode création) : ses champs se préremplissent via
          // de simples initialiseurs d'état plutôt qu'un useEffect qui
          // ferait setState après coup (voir create-event-form.tsx).
          key={editingEvent?.id ?? "create"}
          teams={createTeams}
          benevoles={benevoles}
          commissionGroups={commissionGroups}
          existingNeeds={editingEvent ? (volunteerNeedsByEventId[editingEvent.id] ?? emptyVolunteerNeeds) : emptyVolunteerNeeds}
          allowClubWide={allowClubWide}
          open={createOpen || Boolean(editingEvent)}
          editingEvent={editingEvent}
          onClose={() => {
            setCreateOpen(false);
            setEditingEvent(null);
          }}
          onCreated={(created) =>
            setLocalEvents((prev) =>
              [...prev, ...created].sort(byStartTime)
            )
          }
          onUpdated={(updated) => {
            setLocalEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            setEditingEvent(null);
            // Retour de Cindy du 12/09 ("Répéter", "cette occurrence et les
            // suivantes") : propagation volontairement limitée aux champs
            // qui ne dépendent pas de la date -- jamais start_time/end_time/
            // impact_time, propres à chaque occurrence (voir le choix fait
            // dans le ConfirmDialog ci-dessus).
            if (editScope === "following" && updated.seriesId) {
              void propagateToFollowingOccurrences(updated);
            }
            setEditScope("one");
          }}
        />
      )}

      {view === "month" && (
      <div className="w-full max-w-full overflow-hidden">
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {weekdayLabels.map((label) => (
            <div
              key={label}
              className="truncate px-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-400 sm:text-xs"
            >
              <span className="sm:hidden">{label.slice(0, 1)}</span>
              <span className="hidden sm:inline">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-1.5">
          {gridDays.map((d) => {
            const key = toKey(d);
            const dayEvents = eventsByDate.get(key) ?? [];
            const dayBirthdays = birthdaysByMonthDay.get(monthDayKey(d)) ?? [];
            const isCurrentMonth =
              d.getMonth() === viewMonth.getMonth() &&
              d.getFullYear() === viewMonth.getFullYear();
            const isToday = key === todayKey;
            const isSelected = key === selectedKey;
            const visible = dayEvents.slice(0, 3);
            const overflow = dayEvents.length - visible.length;
            // Retour de Cindy du 2026-08-25 : teinte les jours de vacances
            // scolaires (zone A) sur le grand calendrier — jamais sur le
            // bandeau "Cette semaine" de l'en-tête (voir week-strip-banner.tsx,
            // volontairement non touché). Un jour sélectionné garde sa
            // propre couleur, la sélection prime toujours sur la teinte.
            // orange-200/300 (retour de Cindy, "crème dans crème on y voit
            // rien") : orange-50/100, essayé d'abord, se fondait dans le
            // fond crème général de l'appli — teinte nettement plus soutenue
            // ici pour rester visible au premier coup d'œil.
            const holiday = schoolHolidayFor(d);

            return (
              <button
                key={key}
                onClick={() => setSelectedDate(d)}
                title={holiday ?? undefined}
                className={`flex min-h-[52px] w-full min-w-0 flex-col items-start gap-1 rounded-lg border p-1 text-left transition-colors sm:min-h-[104px] sm:rounded-xl sm:p-2 ${
                  isSelected
                    ? "border-navy bg-navy/5"
                    : holiday
                      ? "border-orange-300 bg-orange-200 hover:border-ubac-yellow/50"
                      : "border-zinc-100 bg-white hover:border-ubac-yellow/50"
                } ${!isCurrentMonth ? "opacity-40" : ""}`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold sm:h-6 sm:w-6 sm:text-xs ${
                    isToday ? "bg-ubac-yellow text-navy" : "text-zinc-700"
                  }`}
                >
                  {d.getDate()}
                </span>
                <div className="flex w-full min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap gap-0.5 sm:hidden">
                    {visible.map((e) => (
                      <span
                        key={e.id}
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${styleFor(e.event_type).dot}`}
                      />
                    ))}
                    {dayBirthdays.length > 0 && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-purple-400" />
                    )}
                  </div>
                  <div className="hidden sm:flex sm:flex-col sm:gap-0.5">
                    {visible.map((e) => (
                      <span
                        key={e.id}
                        className={`inline-flex items-center justify-center truncate whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-semibold leading-none ${styleFor(e.event_type).pill}`}
                      >
                        {pillLabel(e)}
                      </span>
                    ))}
                    {dayBirthdays.length > 0 && (
                      <span className="inline-flex items-center justify-center gap-0.5 truncate whitespace-nowrap rounded bg-purple-100 px-1 py-0.5 text-[10px] font-semibold leading-none text-purple-700">
                        <Cake className="h-2.5 w-2.5 shrink-0" />
                        {dayBirthdays.length === 1
                          ? formatFirstName(dayBirthdays[0].firstName)
                          : `${dayBirthdays.length} anniv.`}
                      </span>
                    )}
                  </div>
                  {overflow > 0 && (
                    <span className="text-[9px] font-semibold text-zinc-400 sm:text-[10px]">
                      +{overflow}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      )}

      {view === "list" && (
        // gap-4 (retour de Cindy du 2026-08-25, "pas assez de marges entre
        // elles") : gap-2 laissait à peine 8px entre deux cartes, alors
        // que le fanion "Spécial" d'un tournoi déborde de -10px au-dessus
        // de sa propre carte (absolute -top-2.5) — la carte suivante s'en
        // trouvait quasiment collée dessus.
        <div className="flex flex-col gap-4">
          {upcomingListItems.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucun événement à venir.</p>
          ) : (
            upcomingListItems.map((item) => (
              <div
                key={item.kind === "event" ? item.event.id : `bday-${item.member.id}`}
                className="flex flex-col gap-1"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {toKey(item.date) === todayKey
                    ? "Aujourd'hui"
                    : item.date.toLocaleDateString("fr-FR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                </p>
                {item.kind === "event" ? renderEventCard(item.event) : renderBirthdayCard(item.member)}
              </div>
            ))
          )}
        </div>
      )}

      {(view === "results" ||
        view === "officialMatches" ||
        view === "officialResults" ||
        view === "clubEvents") && (
        <div className="flex flex-col gap-3">
          {/* Même sélecteur que "Mes Équipes" (team-selector-pills.tsx), ou
              la version "case à cocher" façon team-manager.tsx (Bureau) —
              voir resultsTeamSelector. Indispensable dès qu'on encadre ou
              joue dans plusieurs équipes, sans quoi les événements de
              toutes se mélangeaient dans un seul fil illisible. */}
          {resultsTeamSelector === "dropdown" ? (
            sortedResultsTeams.length > 1 && (
              <TeamFilterDropdown
                teams={sortedResultsTeams}
                selectedIds={selectedResultTeamIds}
                onChange={setSelectedResultTeamIds}
              />
            )
          ) : (
            <TeamSelectorPills
              teams={sortedResultsTeams}
              activeId={activeResultsTeamIdResolved}
              onSelect={setActiveResultsTeamId}
            />
          )}
          {/* Emplacement réservé du classement officiel FFBB, propre à une
              équipe précise (chaque équipe joue dans sa propre poule) —
              n'a donc de sens qu'avec le sélecteur "une équipe active à la
              fois", jamais en mode case à cocher (plusieurs équipes en
              même temps) ni pour les vues qui ne sont pas centrées sur les
              matchs officiels. Pas encore de données à afficher : la FFBB
              ne publie le classement qu'une fois les premiers résultats de
              la saison tombés. Cette carte disparaît d'elle-même le jour
              où le classement réel prend sa place ici — même
              emplacement, pas de nouvel onglet à chercher. */}
          {resultsTeamSelector !== "dropdown" &&
            (view === "results" || view === "officialMatches" || view === "officialResults") &&
            sortedResultsTeams.length > 0 && (
              <div className="flex items-start gap-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-3">
                <ListOrdered className="h-4 w-4 shrink-0 text-zinc-400" />
                <p className="text-sm text-zinc-500">
                  <span className="font-semibold text-zinc-600">Classement</span>
                  {(() => {
                    const activeTeam = sortedResultsTeams.find(
                      (t) => t.id === activeResultsTeamIdResolved
                    );
                    return activeTeam ? ` — ${teamLabel(activeTeam)}` : "";
                  })()}{" "}
                  : pas encore publié par la FFBB — apparaîtra ici automatiquement dès les
                  premiers résultats de la saison.
                </p>
              </div>
            )}
          {seasonListEvents.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              message={
                (view === "results" &&
                  "Aucun match programmé pour le moment — le calendrier de la saison apparaîtra ici.") ||
                (view === "officialMatches" && "Aucun match officiel programmé pour le moment.") ||
                (view === "officialResults" && "Aucun résultat pour le moment.") ||
                (view === "clubEvents" && "Aucun événement programmé pour le moment.") ||
                ""
              }
            />
          ) : view === "results" || view === "officialMatches" || view === "officialResults" ? (
            // gap-4 (voir plus haut, vue "list") : même filet contre le
            // fanion "Spécial" qui déborde au-dessus de sa carte.
            <div className="flex flex-col gap-4">
              {seasonListEvents.map((event) => renderResultCard(event))}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {seasonListEvents.map((event) => renderEventCard(event))}
            </div>
          )}
        </div>
      )}

      {view === "month" && (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {selectedKey === todayKey
            ? "Aujourd'hui"
            : selectedDate.toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
        </p>

        {detailEvents.length === 0 && detailBirthdays.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucun événement ce jour-là.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {detailBirthdays.map((m) => renderBirthdayCard(m))}
            {detailEvents.map((event) => renderEventCard(event))}
          </div>
        )}
      </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteEventTarget)}
        title="Supprimer l'événement ?"
        message={
          <>
            <p>Êtes-vous sûr de vouloir supprimer définitivement cet événement ?</p>
            {/* Retour de Cindy du 12/09 ("Répéter") : ne s'affiche que si
                l'événement fait partie d'une série -- pour un événement isolé,
                seriesId est null et ce bloc entier n'apparaît pas. */}
            {deleteEventTarget?.seriesId && (
              <div className="mt-3 flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                <p className="font-semibold text-zinc-800">
                  Cet événement fait partie d&apos;une série répétée.
                </p>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="delete-series-scope"
                    checked={deleteSeriesScope === "one"}
                    onChange={() => setDeleteSeriesScope("one")}
                    className="h-4 w-4 border-zinc-300 text-red-600 focus:ring-red-500"
                  />
                  Cette occurrence uniquement
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="delete-series-scope"
                    checked={deleteSeriesScope === "following"}
                    onChange={() => setDeleteSeriesScope("following")}
                    className="h-4 w-4 border-zinc-300 text-red-600 focus:ring-red-500"
                  />
                  Cette occurrence et toutes les suivantes
                </label>
              </div>
            )}
            {deleteEventTarget?.collecteId && (
              <label className="mt-3 flex items-start gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={deleteCollecteToo}
                  onChange={(e) => setDeleteCollecteToo(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-red-600 focus:ring-red-500"
                />
                <span>
                  Cet événement a une collecte de suivi dans Cotisations → Événements
                  payants ({deleteEventTarget.paidParticipants.length} participant
                  {deleteEventTarget.paidParticipants.length > 1 ? "s" : ""}). Supprimer
                  aussi cette collecte et les paiements déjà enregistrés dessus ?
                </span>
              </label>
            )}
          </>
        }
        confirmLabel="Supprimer"
        onConfirm={() =>
          deleteEventTarget &&
          confirmDeleteEvent(deleteEventTarget, deleteCollecteToo, deleteSeriesScope)
        }
        onCancel={() => setDeleteEventTarget(null)}
      />

      {/* Retour de Cindy du 12/09 ("Répéter") : demandé AVANT d'ouvrir
          CreateEventForm (jamais dedans) -- le formulaire d'édition reste
          identique pour tout le monde, seule la portée de l'enregistrement
          diffère (voir onUpdated de CreateEventForm ci-dessus). */}
      <ConfirmDialog
        open={Boolean(editSeriesChoiceTarget)}
        title="Modifier cet événement"
        destructive={false}
        message={
          <div className="flex flex-col gap-2">
            <p>Cet événement fait partie d&apos;une série répétée. Que souhaitez-vous modifier ?</p>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="edit-series-scope"
                checked={editScope === "one"}
                onChange={() => setEditScope("one")}
                className="h-4 w-4 border-zinc-300 text-navy focus:ring-navy"
              />
              Cette occurrence uniquement
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="edit-series-scope"
                checked={editScope === "following"}
                onChange={() => setEditScope("following")}
                className="h-4 w-4 border-zinc-300 text-navy focus:ring-navy"
              />
              Cette occurrence et toutes les suivantes
            </label>
            {editScope === "following" && (
              <p className="text-xs text-zinc-500">
                Seuls le titre, le type, le lieu, les notes et les équipes/commissions
                seront appliqués aux occurrences suivantes -- leurs horaires et heure
                d&apos;impact resteront ceux déjà enregistrés pour chaque date.
              </p>
            )}
          </div>
        }
        confirmLabel="Continuer"
        onConfirm={() => {
          if (editSeriesChoiceTarget) setEditingEvent(editSeriesChoiceTarget);
          setEditSeriesChoiceTarget(null);
        }}
        onCancel={() => setEditSeriesChoiceTarget(null)}
      />
    </div>
  );
}
