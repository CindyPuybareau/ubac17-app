"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CalendarDays,
  Cake,
  Check,
  Clock,
  LayoutGrid,
  List,
  Mail,
  MapPin,
  ListOrdered,
  Pencil,
  PartyPopper,
  Plus,
  StickyNote,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildGmailComposeLink } from "@/lib/email";
import { formatFirstName, formatLastName, sortByLastName } from "@/lib/names";
import { parseMatchTitle } from "@/lib/match-display";
import { sortTeamsByGroup, teamLabel } from "@/lib/teams";
import OpponentDisplay from "./opponent-display";
import CreateEventForm from "./create-event-form";
import DateTimePicker from "./date-time-picker";
import RsvpButtons from "./rsvp-buttons";
import ItineraryButton from "./itinerary-button";
import MatchTasksPanel from "./match-tasks-panel";
import MatchScore from "./match-score";
import TeamSelectorPills from "./team-selector-pills";
import { sendEventPush } from "./event-push";
import type { AdminUpcomingEvent } from "./page";
import {
  groupBirthdaysByMonthDay,
  upcomingBirthdays,
  type BirthdaySource,
} from "./birthdays";
import { SALLES, shouldOfferCarpool, venueQuery } from "./salles";
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

const emptyEventTasks: EventTasksState = {};
const emptyVolunteerNeeds: VolunteerNeed[] = [];

// Ré-exportés : beaucoup d'écrans les importent historiquement d'ici, et
// ce fichier reste le point d'entrée naturel du calendrier.
export { EVENT_TYPE_OPTIONS, formatEventTime, homeAwayLabel, isMatchType, styleFor };

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Just "HH:MM" — the end time field only ever asks for the hour, since an
// event's end is always the same calendar day as its start for this club.
function toTimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  volunteerRoster = [],
  selfPlayerId = null,
  forcedView,
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
  // — auto-serve (Je m'en occupe) partout, gestion complète (affecter,
  // retirer, ajouter/supprimer un besoin) réservée au Bureau, voir
  // canManageEvent && allowClubWide dans renderEventCard.
  volunteerNeedsByEventId?: Record<string, VolunteerNeed[]>;
  // Membres du club pour le "+ Affecter..." du Bureau — jamais fourni côté
  // Coach/Famille (pas de gestion là-bas, juste l'auto-inscription).
  volunteerRoster?: { id: string; name: string }[];
  // La propre fiche joueur de qui consulte ce calendrier (coach qui joue
  // aussi dans une autre équipe) — jamais fourni côté Bureau/Famille.
  // Permet à un coach de répondre présent/absent pour LUI-MÊME sur un
  // événement d'une équipe qu'il ne coache pas, sans jamais lui montrer
  // le bouton de ses coéquipiers (voir rsvpVisiblePlayers plus bas).
  selfPlayerId?: string | null;
  // Utilisé par l'onglet "Résultats" dédié (sidebar Bureau/Coach/Parent) :
  // verrouille la vue sur les résultats, cette page n'ayant plus besoin
  // de bascule Liste/Mois — celle-ci reste dans l'onglet Calendrier.
  forcedView?: "results";
  // Sélecteur d'équipe façon "Mes Équipes" (voir coach-teams.tsx) : sans
  // lui, la vue Résultats mélangeait les matchs de toutes les équipes dans
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
}) {
  const router = useRouter();
  // Recalculés à chaque rendu (pas au chargement du module) : un onglet
  // Bureau laissé ouvert toute la nuit gardait sinon la pastille "jour
  // même" sur la veille jusqu'au rechargement complet de la page — un
  // simple router.refresh() (déclenché ailleurs par useRealtimeRefresh)
  // suffit maintenant à corriger l'affichage sans reload.
  const today = new Date();
  const todayKey = toKey(today);
  const [viewMonth, setViewMonth] = useState<Date>(today);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  // Le calendrier s'ouvre sur la grille : on veut d'abord voir le mois.
  // La liste chronologique reste à un clic pour répondre à "c'est quoi la
  // suite ?".
  const [view, setView] = useState<"list" | "month" | "results">(forcedView ?? "month");
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
  // orphelin et seasonMatches ne matcherait plus rien — un fil Résultats
  // vide sans raison apparente. On retombe alors sur la première équipe
  // disponible plutôt que de garder un id qui ne correspond plus à rien.
  const activeResultsTeamIdResolved = sortedResultsTeams.some(
    (t) => t.id === activeResultsTeamId
  )
    ? activeResultsTeamId
    : sortedResultsTeams[0]?.id;

  const canManage = Boolean(createTeams && createTeams.length > 0);

  const [editingEvent, setEditingEvent] = useState<AdminUpcomingEvent | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("MATCH");
  const [editIsHome, setEditIsHome] = useState<"" | "true" | "false">("");
  const [editLocation, setEditLocation] = useState("");
  const [editSalle, setEditSalle] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editTeamId, setEditTeamId] = useState("");
  // Même portée "Tous les groupes" à préciser qu'en création (voir
  // create-event-form.tsx) — préremplie depuis event.targetTeamIds.
  const [editClubScope, setEditClubScope] = useState<"all" | "specific">("all");
  const [editTargetTeamIds, setEditTargetTeamIds] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function openEdit(event: AdminUpcomingEvent) {
    setEditingEvent(event);
    setEditTitle(event.title ?? "");
    setEditType(event.event_type ?? "MATCH");
    setEditIsHome(event.isHome === null ? "" : event.isHome ? "true" : "false");
    setEditLocation(event.location ?? "");
    setEditSalle(event.salle ?? "");
    setEditStartTime(toDatetimeLocal(event.start_time));
    setEditEndTime(event.end_time ? toTimeLocal(event.end_time) : "");
    setEditNotes(event.notes ?? "");
    setEditTeamId(event.teamId ?? "");
    setEditClubScope(event.targetTeamIds && event.targetTeamIds.length > 0 ? "specific" : "all");
    setEditTargetTeamIds(event.targetTeamIds ?? []);
    setEditError(null);
  }

  function toggleEditTargetTeam(id: string) {
    setEditTargetTeamIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function confirmEdit() {
    if (!editingEvent) return;
    if (!editStartTime) {
      setEditError("La date et l'heure de début sont requises.");
      return;
    }
    if (editType === "TRAINING" && !editEndTime) {
      setEditError("L'heure de fin est obligatoire pour un entraînement.");
      return;
    }
    if (allowClubWide && !editTeamId && editClubScope === "specific" && editTargetTeamIds.length === 0) {
      setEditError("Choisis au moins une équipe pour un événement réservé.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("events")
      .update({
        title: editTitle || null,
        event_type: editType,
        // Le domicile/extérieur ne veut rien dire hors d'un match : le
        // remettre à null évite qu'un entraînement garde la mention d'un
        // ancien type.
        is_home: isMatchType(editType) && editIsHome !== "" ? editIsHome === "true" : null,
        location: editLocation || null,
        salle: editSalle || null,
        start_time: new Date(editStartTime).toISOString(),
        end_time: editEndTime
          ? new Date(`${editStartTime.slice(0, 10)}T${editEndTime}`).toISOString()
          : null,
        notes: editNotes || null,
        ...(allowClubWide
          ? {
              team_id: editTeamId || null,
              target_team_ids:
                !editTeamId && editClubScope === "specific" ? editTargetTeamIds : null,
            }
          : {}),
      })
      .eq("id", editingEvent.id);
    setEditSaving(false);
    if (error) {
      setEditError(error.message);
      return;
    }

    // Bonus, pas bloquant : voir event-push.ts. Seul un vrai changement
    // d'horaire ou de lieu justifie de déranger les familles — pas une
    // note ou un titre corrigé. Tolérance d'une minute sur l'heure pour
    // ignorer un arrondi de saisie sans rapport avec un vrai déplacement.
    const newStartIso = new Date(editStartTime).toISOString();
    const timeMoved =
      Math.abs(new Date(newStartIso).getTime() - new Date(editingEvent.start_time).getTime()) >
      60000;
    const placeMoved =
      (editLocation || "") !== (editingEvent.location ?? "") ||
      (editSalle || "") !== (editingEvent.salle ?? "");
    if (timeMoved || placeMoved) {
      const when = new Date(newStartIso).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      const heure = new Date(newStartIso).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const lieu = editSalle || editLocation;
      sendEventPush(
        editingEvent.id,
        `UBAC — ${editingEvent.teamName}`,
        `Changement : ${when} à ${heure}${lieu ? ` · ${lieu}` : ""}.`
      );
    }

    setEditingEvent(null);
    router.refresh();
  }

  async function handleDeleteEvent(event: AdminUpcomingEvent) {
    const ok = window.confirm(
      "Supprimer définitivement cet événement ? Cette action est irréversible."
    );
    if (!ok) return;

    // Bonus, pas bloquant : voir event-push.ts. Envoyé avant la
    // suppression — push_targets_for_event a besoin de retrouver
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
    router.refresh();
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

  const eventsByDate = useMemo(() => {
    const map = new Map<string, AdminUpcomingEvent[]>();
    events.forEach((e) => {
      const key = toKey(new Date(e.start_time));
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    });
    return map;
  }, [events]);

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
    return events
      .filter((e) => new Date(e.start_time).getTime() >= from)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [events]);

  // Vue Résultats : tout le calendrier de matchs/amicaux de la saison,
  // joués ou non, dans l'ordre chronologique — même principe que la page
  // FFBB (J1, J2, J3...) plutôt qu'un historique séparé du planning. Un
  // match à venir apparaît donc aussi, sans score (renderResultCard gère
  // l'affichage "à venir" et empêche d'en saisir un avant que le match
  // ait réellement eu lieu).
  const seasonMatches = useMemo(() => {
    return events
      .filter(
        (e) =>
          isMatchType(e.event_type) &&
          // Filtré sur l'équipe active du sélecteur seulement quand il y en
          // a un (plusieurs équipes en jeu) — sinon (Bureau, ou une seule
          // équipe) on garde tout, comme avant.
          (!resultsTeams || resultsTeams.length <= 1 || e.teamId === activeResultsTeamIdResolved)
      )
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [events, resultsTeams, activeResultsTeamIdResolved]);

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

    return (
      <div
        key={event.id}
        className={`flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm border-l-4 ${style.border}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {event.teamName}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}
              >
                {style.label}
              </span>
              {homeAway && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600">
                  {homeAway}
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
                onClick={() => openEdit(event)}
                title="Modifier"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleDeleteEvent(event)}
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
            <CalendarDays className="h-4 w-4" />
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
              const badge =
                playerStatus === "PRESENT"
                  ? { label: "Présent", dotClassName: "bg-green-500", className: "bg-green-100 text-green-700" }
                  : playerStatus === "ABSENT"
                    ? { label: "Absent", dotClassName: "bg-red-500", className: "bg-red-100 text-red-700" }
                    : playerStatus === "LATE"
                      ? { label: "En retard", dotClassName: "bg-amber-500", className: "bg-amber-100 text-amber-700" }
                      : { label: "En attente", dotClassName: "bg-zinc-400", className: "bg-zinc-100 text-zinc-600" };
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-2">
                  {rsvpVisiblePlayers.length > 1 && (
                    <span className="min-w-0 truncate text-xs font-medium text-zinc-500">
                      {p.name}
                    </span>
                  )}
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${badge.dotClassName}`} />
                    {badge.label}
                  </span>
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
            applicable (ex. un entraînement) : pas besoin d'un filtre par
            type d'événement en plus, qui ferait justement disparaître ce
            bloc sur un "Événement club" pourtant organisé. */}
        {!canManageEvent && (
          <MatchTasksPanel
            eventId={event.id}
            eventDate={event.start_time}
            roster={[]}
            // rsvpVisiblePlayers, pas respondingPlayers : un coach qui gère
            // au moins une équipe (canManage) mais pas celle-ci
            // (!canManageEvent) ne doit voir que SA propre fiche ici, pas
            // tout l'effectif de l'équipe. respondingPlayers contient tout
            // le roster côté Coach (coachRsvpPlayers, page.tsx) — l'utiliser
            // tel quel ferait écrire volunteer()/reserve() sur
            // myPlayerIds[0], c'est-à-dire un coéquipier arbitraire, pas le
            // coach lui-même.
            myPlayerIds={rsvpVisiblePlayers.map((p) => p.id)}
            canAssignAnyone={false}
            initialTasks={tasksByEventId[event.id] ?? emptyEventTasks}
            initialCarpool={carpoolByEventId[event.id] ?? []}
            roles={rolesForEventType(eventRoles, event.event_type)}
            showCarpool={shouldOfferCarpool(event)}
          />
        )}

        {/* Besoins en bénévoles (buvette, table de marque...) : lecture +
            auto-inscription pour qui ne gère pas l'événement, gestion
            complète (affecter/retirer/ajouter un besoin) pour le Bureau —
            jamais pour un coach, même sur une équipe qu'il gère, ce type de
            besoin restant centralisé au Bureau (voir CLAUDE.md de la
            demande). Catalogue complet (pas filtré par type d'événement,
            contrairement à MatchTasksPanel) : un tournoi ou une fête peut
            avoir besoin de n'importe quel rôle. */}
        {!canManageEvent && (
          <VolunteerNeedsPanel
            eventId={event.id}
            needs={volunteerNeedsByEventId[event.id] ?? emptyVolunteerNeeds}
            roles={eventRoles}
            myPlayerIds={rsvpVisiblePlayers.map((p) => p.id)}
            canManage={false}
            roster={[]}
          />
        )}
        {canManageEvent && allowClubWide && (
          <VolunteerNeedsPanel
            eventId={event.id}
            needs={volunteerNeedsByEventId[event.id] ?? emptyVolunteerNeeds}
            roles={eventRoles}
            myPlayerIds={[]}
            canManage
            roster={volunteerRoster}
          />
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
    // La vue Résultats montre désormais toute la saison, match à venir
    // compris (voir seasonMatches) : le bouton "Ajouter le score" ne doit
    // s'afficher qu'une fois le match réellement joué, jamais avant.
    const alreadyPlayed = new Date(event.start_time).getTime() < Date.now();

    return (
      <div
        key={event.id}
        className={`flex items-start justify-between gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm border-l-4 ${style.border}`}
      >
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {event.teamName}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}
            >
              {style.label}
            </span>
            {homeAway && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600">
                {homeAway}
              </span>
            )}
            {event.salle && <SalleBadge salle={event.salle} />}
          </span>
          <OpponentDisplay title={event.title} size="sm" />
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
        {canManageEvent && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => openEdit(event)}
              title="Modifier"
              className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleDeleteEvent(event)}
              title="Supprimer"
              className="flex h-8 w-8 items-center justify-center rounded-full text-red-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
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
          <span className="w-fit rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pink-700">
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
        {view === "month" ? (
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
        ) : (
          // Rien à gauche en vue Liste : le titre de la page dit déjà où on
          // est. Le div vide garde la bascule alignée à droite.
          <div />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/* Action principale de l'écran : elle mérite un fond plein, sur
              la même ligne que la navigation de date plutôt qu'un bouton
              de plus empilé au-dessus de la grille. */}
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
            <button
              onClick={goToday}
              className="rounded-full border border-ubac-yellow px-3 py-1 text-xs font-semibold text-ubac-yellow-dark hover:bg-ubac-yellow/10"
            >
              Aujourd&apos;hui
            </button>
          )}

          {/* Tout à droite : c'est un réglage d'affichage, pas une action
              sur les données — il vient après ce qu'on fait, pas avant.
              Masqué sur la page "Résultats" dédiée (forcedView) : basculer
              vers Mois n'y aurait pas de sens, l'onglet Calendrier existe
              déjà pour ça. */}
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
          teams={createTeams}
          allowClubWide={allowClubWide}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
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

            return (
              <button
                key={key}
                onClick={() => setSelectedDate(d)}
                className={`flex min-h-[52px] w-full min-w-0 flex-col items-start gap-1 rounded-lg border p-1 text-left transition-colors sm:min-h-[104px] sm:rounded-xl sm:p-2 ${
                  isSelected
                    ? "border-navy bg-navy/5"
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
        <div className="flex flex-col gap-2">
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

      {view === "results" && (
        <div className="flex flex-col gap-3">
          {/* Même sélecteur que "Mes Équipes" (team-selector-pills.tsx) :
              indispensable dès qu'on encadre ou joue dans plusieurs
              équipes, sans quoi les résultats de toutes se mélangeaient
              dans un seul fil illisible. */}
          <TeamSelectorPills
            teams={sortedResultsTeams}
            activeId={activeResultsTeamIdResolved}
            onSelect={setActiveResultsTeamId}
          />
          {/* Emplacement réservé du classement officiel FFBB, propre à
              l'équipe sélectionnée ci-dessus (chaque équipe joue dans sa
              propre poule). Pas encore de données à afficher : la FFBB ne
              publie le classement qu'une fois les premiers résultats de
              la saison tombés. Cette carte disparaît d'elle-même le jour
              où le classement réel prend sa place ici — même
              emplacement, pas de nouvel onglet à chercher. */}
          {sortedResultsTeams.length > 0 && (
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
          {seasonMatches.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Aucun match programmé pour le moment — le calendrier de la saison apparaîtra ici.
            </p>
          ) : (
            seasonMatches.map((event) => (
              <div key={event.id} className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {new Date(event.start_time).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </p>
                {renderResultCard(event)}
              </div>
            ))
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
          <>
            {detailBirthdays.map((m) => renderBirthdayCard(m))}
            {detailEvents.map((event) => renderEventCard(event))}
          </>
        )}
      </div>
      )}

      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-zinc-900">Modifier l&apos;événement</h3>
              <button
                onClick={() => setEditingEvent(null)}
                className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Titre</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Type</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                >
                  {EVENT_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {isMatchType(editType) && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">
                    Lieu du match
                  </label>
                  <select
                    value={editIsHome}
                    onChange={(e) => setEditIsHome(e.target.value as "" | "true" | "false")}
                    className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                  >
                    <option value="">Non précisé</option>
                    <option value="true">Domicile</option>
                    <option value="false">Extérieur</option>
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Adresse ou lieu
                </label>
                <input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
                {/* Même rappel qu'à la création : sans salle du club
                    reconnue, c'est ce texte qui part vers l'itinéraire et
                    le covoiturage — une adresse précise vaut mieux qu'un
                    nom de ville. */}
                <p className="mt-1 text-[11px] text-zinc-400">
                  Utilisée pour l&apos;itinéraire et le covoiturage.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Salle</label>
                <select
                  value={editSalle}
                  onChange={(e) => setEditSalle(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  {SALLES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Date &amp; heure de début
                </label>
                <DateTimePicker value={editStartTime} onChange={setEditStartTime} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Heure de fin
                  {editType === "TRAINING" ? " *" : " (optionnel)"}
                </label>
                <input
                  type="time"
                  required={editType === "TRAINING"}
                  value={editEndTime}
                  onChange={(e) => setEditEndTime(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Notes
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              {allowClubWide && createTeams && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">
                    Groupe
                  </label>
                  <select
                    value={editTeamId}
                    onChange={(e) => setEditTeamId(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                  >
                    <option value="">Tous les groupes (stage club)</option>
                    {createTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {teamLabel(t)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {allowClubWide && createTeams && !editTeamId && (
                <div className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-2.5">
                  <div className="flex gap-1.5">
                    {(
                      [
                        { value: "all" as const, label: "Tout le club" },
                        { value: "specific" as const, label: "Équipes spécifiques" },
                      ]
                    ).map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setEditClubScope(c.value)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                          editClubScope === c.value
                            ? "border-navy bg-navy/10 text-navy"
                            : "border-zinc-200 text-zinc-500 hover:bg-white"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  {editClubScope === "specific" && (
                    <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2">
                      {createTeams.map((t) => (
                        <label key={t.id} className="flex items-center gap-1.5 text-xs text-zinc-700">
                          <input
                            type="checkbox"
                            checked={editTargetTeamIds.includes(t.id)}
                            onChange={() => toggleEditTargetTeam(t.id)}
                            className="h-3.5 w-3.5 rounded border-zinc-300 text-navy focus:ring-navy"
                          />
                          {teamLabel(t)}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {editError && <p className="text-xs text-red-600">{editError}</p>}
              <button
                onClick={confirmEdit}
                disabled={editSaving}
                className="mt-1 rounded-full bg-ubac-yellow px-3 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
              >
                {editSaving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
