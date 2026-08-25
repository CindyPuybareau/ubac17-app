"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CalendarDays,
  Cake,
  Check,
  Clock,
  Euro,
  ExternalLink,
  Eye,
  EyeOff,
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
import { sendEventPush } from "./event-push";
import type { AdminUpcomingEvent } from "./page";
import {
  groupBirthdaysByMonthDay,
  upcomingBirthdays,
  type BirthdaySource,
} from "./birthdays";
import { shouldOfferCarpool, venueQuery } from "./salles";
import { schoolHolidayFor } from "@/lib/school-holidays";
import SalleBadge from "./salle-badge";
import {
  EVENT_TYPE_OPTIONS,
  formatEventTime,
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

const emptyEventTasks: EventTasksState = {};
const emptyVolunteerNeeds: VolunteerNeed[] = [];

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

function toKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
        <Users className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
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
              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
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

export default function CalendarView({
  events,
  createTeams,
  rsvp,
  contactEmailByPlayerId,
  allowClubWide = false,
  birthdayMembers = [],
  scopeTeams = [],
  tasksByEventId = {},
  carpoolByEventId = {},
  eventRoles = [],
  volunteerNeedsByEventId = {},
  selfPlayerId = null,
  forcedView,
  resultsTeamSelector = "pills",
  resultsTeams,
}: {
  events: AdminUpcomingEvent[];
  createTeams?: CalendarTeamRef[];
  rsvp?: {
    players: CalendarRsvpPlayer[];
    statusByKey: Record<string, string>;
  };
  contactEmailByPlayerId?: Record<string, string>;
  allowClubWide?: boolean;
  birthdayMembers?: BirthdaySource[];
  // Équipes dont ce calendrier montre les événements. Affiché tel quel :
  // sans cette ligne, un calendrier vide ne dit pas s'il ne couvre rien ou
  // s'il n'y a simplement rien de programmé.
  scopeTeams?: { id: string; name: string | null; category: string | null }[];
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
  }[];
  // "pills" (défaut) : une équipe active à la fois, façon "Mes Équipes"
  // (Coach). "dropdown" (retour de Cindy du 2026-08-22, "comme dans
  // l'onglet équipe du bureau") : case à cocher par équipe, plusieurs
  // équipes à la fois dans le même fil — réutilise TeamFilterDropdown,
  // déjà utilisé par team-manager.tsx (Bureau).
  resultsTeamSelector?: "pills" | "dropdown";
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

  const today = new Date();
  const todayKey = toKey(today);
  const [viewMonth, setViewMonth] = useState<Date>(today);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  // Retour de Cindy/Sandrine Manzelle du 2026-08-24 : "les entraînements
  // polluent le calendrier" — un cumul Bureau + joueuse + parent voit tout
  // empilé, et les entraînements (2-3 par semaine et par équipe) noient
  // les événements plus rares. Un simple interrupteur, pas de nouveau
  // menu : filtre la grille du mois, le panneau du jour et la liste
  // Événements en même temps (voir visibleEvents plus bas), jamais
  // localEvents lui-même (les formulaires d'édition en ont besoin en
  // entier). Volontairement en mémoire seulement (pas persistant) — un
  // interrupteur toujours visible se retrouve facilement à chaque visite.
  const [hideTrainings, setHideTrainings] = useState(false);
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

  const canManage = Boolean(createTeams && createTeams.length > 0);

  // Retour de Cindy du 2026-08-25 ("je ne peux pas modifier ce que je veux,
  // il faudrait qu'il se réouvre comme lors d'une création, meme visuel,
  // pas un popup") : le formulaire de modification n'est plus une modale à
  // part (state edit* + confirmEdit, retiré) mais CreateEventForm lui-même
  // en mode édition (prop editingEvent) — mêmes champs, y compris
  // "Événement payant", jamais en reste par rapport à la création.
  const [editingEvent, setEditingEvent] = useState<AdminUpcomingEvent | null>(null);
  const [deleteEventTarget, setDeleteEventTarget] = useState<AdminUpcomingEvent | null>(null);

  // Déclenché par le bouton "Supprimer" ; la confirmation elle-même vit
  // dans deleteEventTarget + le <ConfirmDialog> rendu plus bas (retour de
  // Cindy du 2026-08-21 : la popup native window.confirm() ne ressemble
  // pas à l'appli et affiche son propre chrome de navigateur, impossible
  // à styler ou à retirer).
  async function confirmDeleteEvent(event: AdminUpcomingEvent) {
    setDeleteEventTarget(null);
    // Disparition immédiate plutôt que d'attendre le rafraîchissement
    // temps réel — retour de Cindy du 2026-08-21, même correctif que la
    // création/modification ci-dessus. Levée avant sendEventPush (network,
    // potentiellement lent) et pas seulement avant le delete : sinon le
    // clic restait bloqué en apparence jusqu'à ce que CET appel-là
    // termine, reproduisant exactement le même délai perçu sous un autre
    // nom.
    setLocalEvents((prev) => prev.filter((e) => e.id !== event.id));

    // Bonus, pas bloquant pour l'utilisateur (déjà reparti visuellement
    // ci-dessus) mais toujours attendu ici : voir event-push.ts. Envoyé
    // avant la suppression — push_targets_for_event a besoin de retrouver
    // l'événement pour savoir à qui l'envoyer, ce qui ne serait plus
    // possible une fois la ligne effacée.
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
      `Annulé : ${when} à ${heure}${lieu ? ` · ${lieu}` : ""}.`
    );

    const supabase = createClient();
    await supabase.from("events").delete().eq("id", event.id);
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

  // Source unique du filtre "Masquer les entraînements" : localEvents
  // reste intact (édition/suppression en ont besoin en entier), seule
  // cette liste dérivée alimente l'affichage (grille du mois, panneau du
  // jour, liste Événements).
  const visibleEvents = useMemo(
    () => (hideTrainings ? localEvents.filter((e) => e.event_type !== "TRAINING") : localEvents),
    [localEvents, hideTrainings]
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

  function goToday() {
    const now = new Date();
    setViewMonth(now);
    setSelectedDate(now);
  }

  function step(amount: number) {
    const d = new Date(viewMonth);
    d.setMonth(d.getMonth() + amount);
    setViewMonth(d);
    setSelectedDate(d);
  }

  const selectedKey = toKey(selectedDate);

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
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [visibleEvents]);

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
        if (!resultsTeams || resultsTeams.length <= 1) return true;
        // Deux modes de filtrage par équipe selon resultsTeamSelector :
        // une équipe active à la fois (pills) ou plusieurs cochées à la
        // fois (dropdown) — voir sa définition plus haut.
        //
        // Retour de Cindy du 2026-08-25 ("mon evenement payant ne se voit
        // pas dans événement U13") : ce filtre ne regardait que
        // event.teamId (portée "Une équipe"), jamais targetTeamIds (portée
        // "Équipes spécifiques") ni le cas vraiment club-wide (teamId ET
        // targetTeamIds tous les deux null) — un événement créé avec l'une
        // de ces deux autres portées disparaissait silencieusement de
        // "Événements" dès que plus d'une équipe existait, quel que soit
        // le filtre choisi.
        return resultsTeamSelector === "dropdown"
          ? e.teamId
            ? selectedResultTeamIds.has(e.teamId)
            : e.targetTeamIds && e.targetTeamIds.length > 0
              ? e.targetTeamIds.some((id) => selectedResultTeamIds.has(id))
              : true
          : e.teamId
            ? e.teamId === activeResultsTeamIdResolved
            : !e.targetTeamIds ||
              e.targetTeamIds.length === 0 ||
              (activeResultsTeamIdResolved != null &&
                e.targetTeamIds.includes(activeResultsTeamIdResolved));
      })
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visibleEvents,
    resultsTeams,
    resultsTeamSelector,
    activeResultsTeamIdResolved,
    selectedResultTeamIds,
    view,
  ]);

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
    const respondingPlayers = rsvp
      ? rsvp.players.filter((p) => event.teamId && p.teamIds.includes(event.teamId))
      : [];
    const mailto = relanceMailto(event);
    const homeAway = isMatchType(event.event_type) ? homeAwayLabel(event.isHome) : null;
    // canManage dit "cet utilisateur gère AU MOINS une équipe" — un coach
    // qui coache l'U13F et joue en Séniors 1 voit les deux dans la même
    // liste, mais la policy RLS "coach update own team events" ne matche
    // que l'équipe réellement coachée. Sans ce calcul par carte, les
    // crayons Modifier/Supprimer/Ajouter le score apparaissaient aussi sur
    // les matchs Séniors — un clic dessus échouait sans le moindre message
    // (une policy RLS en UPDATE filtre la ligne au lieu de rejeter, donc
    // Supabase ne remonte aucune erreur).
    const canManageEvent =
      canManage &&
      (event.teamId
        ? Boolean(createTeams?.some((t) => t.id === event.teamId))
        : allowClubWide);
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
    const isTournament = event.event_type === "TOURNAMENT";
    const isOfficialMatch = event.event_type === "MATCH";
    const cardShellClass = isTournament
      ? "relative rounded-2xl border-2 border-dashed border-ubac-yellow bg-white p-4 shadow-sm"
      : isOfficialMatch
        ? `rounded-2xl border border-navy/15 bg-white p-4 shadow-sm border-l-8 ${style.border}`
        : `rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm border-l-4 ${style.border}`;

    return (
      <div key={event.id} className={`flex flex-col gap-2 ${cardShellClass}`}>
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
                onClick={() => setEditingEvent(event)}
                title="Modifier"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => setDeleteEventTarget(event)}
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
            <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold leading-none text-green-700">
              <Check className="h-3 w-3" />
              {rsvpCounts.present} présent
              {rsvpCounts.present > 1 ? "s" : ""}
            </span>
            {rsvpCounts.late > 0 && (
              <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold leading-none text-amber-700">
                <Clock className="h-3 w-3" />
                {rsvpCounts.late} en retard
              </span>
            )}
            <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold leading-none text-red-700">
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

        {/* "Qui sera là ?" : uniquement renseigné côté Famille (voir
            presentPlayers sur AdminUpcomingEvent) — ne rend donc jamais
            rien côté Bureau/Coach, qui ont déjà leur propre vue de
            l'effectif ailleurs. */}
        <PresentPlayersList players={event.presentPlayers ?? []} />

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
          const hasTasks =
            rolesForEventType(eventRoles, event.event_type).length > 0 || shouldOfferCarpool(event);
          const needs = volunteerNeedsByEventId[event.id] ?? emptyVolunteerNeeds;
          const hasNeeds = needs.length > 0;
          if (!hasTasks && !hasNeeds) return null;
          return (
            <OrganisationCard>
              {hasTasks && (
                <MatchTasksPanel
                  eventId={event.id}
                  eventDate={event.start_time}
                  roster={[]}
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
                  initialCarpool={carpoolByEventId[event.id] ?? []}
                  roles={rolesForEventType(eventRoles, event.event_type)}
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
          <OrganisationCard>
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
    const canManageEvent =
      canManage &&
      (event.teamId
        ? Boolean(createTeams?.some((t) => t.id === event.teamId))
        : allowClubWide);
    // Les vues Résultats/Matchs officiels montrent désormais toute la
    // saison, match à venir compris (voir seasonListEvents) : le bouton
    // "Ajouter le score" ne doit s'afficher qu'une fois le match
    // réellement joué, jamais avant.
    const alreadyPlayed = new Date(event.start_time).getTime() < Date.now();
    // Même logique d'accent que renderEventCard ci-dessus (direction
    // artistique du 2026-08-23), gardée cohérente entre "à venir" et
    // "résultats" pour ne pas avoir deux traitements différents du même
    // match selon l'onglet où on le regarde.
    const isTournament = event.event_type === "TOURNAMENT";
    const isOfficialMatch = event.event_type === "MATCH";
    const cardShellClass = isTournament
      ? "rounded-2xl border-2 border-dashed border-ubac-yellow bg-white p-4 shadow-sm"
      : isOfficialMatch
        ? `rounded-2xl border border-navy/15 bg-white p-4 shadow-sm border-l-8 ${style.border}`
        : `rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm border-l-4 ${style.border}`;

    return (
      <div key={event.id} className={`flex flex-col gap-1.5 ${cardShellClass}`}>
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
                  onClick={() => setEditingEvent(event)}
                  title="Modifier"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteEventTarget(event)}
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
                aria-label="Précédent"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-white transition-colors hover:bg-navy-dark"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => step(1)}
                aria-label="Suivant"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-white transition-colors hover:bg-navy-dark"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold capitalize text-zinc-900">
                {headerLabel}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {view === "month" && (
            <button
              onClick={goToday}
              className="rounded-full border border-ubac-yellow px-3 py-1 text-xs font-semibold text-ubac-yellow-dark hover:bg-ubac-yellow/10"
            >
              Aujourd&apos;hui
            </button>
          )}

          {/* Retour Cindy/Sandrine Manzelle du 2026-08-24 : les
              entraînements (2-3 par semaine et par équipe) noient les
              événements plus rares pour qui cumule Bureau + joueuse +
              parent. Un interrupteur simple, visible sur le Calendrier et
              sur "Événements" (là où les entraînements peuvent
              apparaître), masqué sur les vues Matchs/Résultats où ils
              n'apparaissent de toute façon jamais. */}
          {(!forcedView || forcedView === "clubEvents") && (
            <button
              onClick={() => setHideTrainings((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                hideTrainings
                  ? "border-navy/30 bg-navy/10 text-navy"
                  : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
              }`}
            >
              {hideTrainings ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              {hideTrainings ? "Entraînements masqués" : "Masquer les entraînements"}
            </button>
          )}

          {/* Tout à droite : c'est un réglage d'affichage, pas une action
              sur les données — il vient après ce qu'on fait, pas avant.
              Masqué sur les pages dédiées "Événements" / "Matchs
              officiels" / "Résultats" (forcedView) : basculer vers Mois
              n'y aurait pas de sens, l'onglet Calendrier existe déjà pour
              ça. */}
          {!forcedView && (
            <div className="flex items-center gap-0.5 rounded-full border border-zinc-200 p-0.5">
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

      {scopeTeams.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
          <Users className="h-3.5 w-3.5 shrink-0" />
          Événements de {scopeTeams.map((t) => teamLabel(t)).join(", ")}
        </p>
      )}

      {createTeams && createTeams.length > 0 && (
        <CreateEventForm
          // Remonte le formulaire à chaque changement d'événement édité (ou
          // au retour en mode création) : ses champs se préremplissent via
          // de simples initialiseurs d'état plutôt qu'un useEffect qui
          // ferait setState après coup (voir create-event-form.tsx).
          key={editingEvent?.id ?? "create"}
          teams={createTeams}
          allowClubWide={allowClubWide}
          open={createOpen || Boolean(editingEvent)}
          editingEvent={editingEvent}
          onClose={() => {
            setCreateOpen(false);
            setEditingEvent(null);
          }}
          onCreated={(created) =>
            setLocalEvents((prev) =>
              [...prev, ...created].sort((a, b) => a.start_time.localeCompare(b.start_time))
            )
          }
          onUpdated={(updated) => {
            setLocalEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            setEditingEvent(null);
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
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${styleFor(e.event_type).pill.split(" ")[0]}`}
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
        message="Êtes-vous sûr de vouloir supprimer définitivement cet événement ?"
        confirmLabel="Supprimer"
        onConfirm={() => deleteEventTarget && confirmDeleteEvent(deleteEventTarget)}
        onCancel={() => setDeleteEventTarget(null)}
      />
    </div>
  );
}
