"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Cake,
  Check,
  Clock,
  LayoutGrid,
  List,
  Mail,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildGmailComposeLink } from "@/lib/email";
import { parseMatchTitle } from "@/lib/match-display";
import { teamLabel } from "@/lib/teams";
import OpponentDisplay from "./opponent-display";
import CreateEventForm from "./create-event-form";
import AppelExpressModal from "./appel-express-modal";
import RsvpButtons from "./rsvp-buttons";
import BirthdayWidget from "./birthday-widget";
import type { AdminUpcomingEvent } from "./page";
import {
  groupBirthdaysByMonthDay,
  upcomingBirthdays,
  type BirthdaySource,
} from "./birthdays";
import { SALLES } from "./salles";
import SalleBadge from "./salle-badge";

export const EVENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "TRAINING", label: "Entraînement" },
  { value: "MATCH", label: "Match officiel" },
  { value: "FRIENDLY", label: "Match amical" },
  { value: "TOURNAMENT", label: "Tournoi / Plateau" },
  { value: "OTHER", label: "Événement club" },
];

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

// Un code couleur par type, repris à l'identique partout (pastilles du
// calendrier, badges des cartes, bordure gauche) : rouge = match officiel,
// bleu = amical, orange = tournoi, vert = entraînement.
const typeStyles: Record<
  string,
  { pill: string; border: string; badge: string; label: string }
> = {
  MATCH: {
    pill: "bg-red-100 text-red-700",
    border: "border-l-red-400",
    badge: "bg-red-100 text-red-700",
    label: "Match officiel",
  },
  FRIENDLY: {
    pill: "bg-blue-100 text-blue-700",
    border: "border-l-blue-400",
    badge: "bg-blue-100 text-blue-700",
    label: "Match amical",
  },
  TOURNAMENT: {
    pill: "bg-amber-100 text-amber-800",
    border: "border-l-amber-400",
    badge: "bg-amber-100 text-amber-800",
    label: "Tournoi / Plateau",
  },
  OTHER: {
    pill: "bg-purple-100 text-purple-700",
    border: "border-l-purple-400",
    badge: "bg-purple-100 text-purple-700",
    label: "Événement club",
  },
  TRAINING: {
    pill: "bg-green-100 text-green-700",
    border: "border-l-green-400",
    badge: "bg-green-100 text-green-700",
    label: "Entraînement",
  },
};

// Les deux types qui opposent le club à un adversaire : eux seuls
// affichent un nom d'adversaire et la mention domicile / extérieur.
export function isMatchType(eventType: string | null) {
  return eventType === "MATCH" || eventType === "FRIENDLY";
}

// Exported so team-card.tsx and family-team-card.tsx can badge each
// event's type with the exact same palette/labels used here, instead of
// duplicating (and inevitably drifting from) this mapping.
export function styleFor(eventType: string | null) {
  return typeStyles[eventType ?? "OTHER"] ?? typeStyles.OTHER;
}

// "18h30" alone, or "18h30 – 20h00" once an end time is set — shared by
// this file's own day list/day-detail views and every team card
// (team-card.tsx, family-team-card.tsx) so the range format is identical
// everywhere instead of three slightly different implementations.
export function formatEventTime(startIso: string, endIso: string | null) {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours()}h${String(d.getMinutes()).padStart(2, "0")}`;
  };
  return endIso ? `${fmt(startIso)} – ${fmt(endIso)}` : fmt(startIso);
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

export function homeAwayLabel(isHome: boolean | null) {
  if (isHome === null) return null;
  return isHome ? "Domicile" : "Extérieur";
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
const today = new Date();
const todayKey = toKey(today);

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

export default function CalendarView({
  events,
  createTeams,
  rsvp,
  contactEmailByPlayerId,
  allowClubWide = false,
  birthdayMembers = [],
  scopeTeams = [],
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
}) {
  const router = useRouter();
  const [viewMonth, setViewMonth] = useState<Date>(today);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [openBirthday, setOpenBirthday] = useState<BirthdaySource | null>(null);
  // Le calendrier s'ouvre sur la grille : on veut d'abord voir le mois.
  // La liste chronologique reste à un clic pour répondre à "c'est quoi la
  // suite ?".
  const [view, setView] = useState<"list" | "month">("month");
  const [appelEventId, setAppelEventId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

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
    setEditError(null);
  }

  async function confirmEdit() {
    if (!editingEvent) return;
    if (editType === "TRAINING" && !editEndTime) {
      setEditError("L'heure de fin est obligatoire pour un entraînement.");
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
        ...(allowClubWide ? { team_id: editTeamId || null } : {}),
      })
      .eq("id", editingEvent.id);
    setEditSaving(false);
    if (error) {
      setEditError(error.message);
      return;
    }
    setEditingEvent(null);
    router.refresh();
  }

  async function handleDeleteEvent(eventId: string) {
    const ok = window.confirm(
      "Supprimer définitivement cet événement ? Cette action est irréversible."
    );
    if (!ok) return;
    const supabase = createClient();
    await supabase.from("events").delete().eq("id", eventId);
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

  const birthdayWidgetEntries = useMemo(
    () => upcomingBirthdays(birthdayMembers),
    [birthdayMembers]
  );

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

  // Le club convoque par équipe : l'effectif d'un événement, ce sont les
  // joueurs de son équipe. Un événement club (teamId null) n'a donc pas
  // d'appel possible ici.
  function rosterFor(event: AdminUpcomingEvent) {
    if (!rsvp || !event.teamId) return [];
    return rsvp.players
      .filter((p) => p.teamIds.includes(event.teamId!))
      .map((p) => ({ id: p.id, name: p.name }));
  }

  const appelEvent = appelEventId ? events.find((e) => e.id === appelEventId) ?? null : null;

  // Une seule carte pour les deux vues : la liste et le detail du jour
  // affichent exactement le meme evenement, avec les memes compteurs et le
  // meme appel express.
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
              <OpponentDisplay title={event.title} size="sm" />
            ) : (
              <span className="font-semibold text-zinc-900">
                {event.title ?? style.label}
              </span>
            )}
          </div>
          {canManage && (
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
                onClick={() => handleDeleteEvent(event.id)}
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

        {/* Le coach pointe tout l'effectif d'un coup ; la famille répond
            joueur par joueur. Empiler les deux donnerait une carte
            interminable pour un effectif de quinze. */}
        {canManage && rosterFor(event).length > 0 && (
          <button
            onClick={() => setAppelEventId(event.id)}
            className="mt-1 w-full rounded-full bg-ubac-yellow px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
          >
            Faire l&apos;appel express
          </button>
        )}

        {!canManage && respondingPlayers.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-zinc-100 pt-2">
            {respondingPlayers.map((p) => {
              const playerStatus =
                rsvp?.statusByKey[`${event.id}:${p.id}`] ?? "PENDING";
              const badge =
                playerStatus === "PRESENT"
                  ? { label: "Présent", dotClassName: "bg-green-500", className: "bg-green-100 text-green-700" }
                  : playerStatus === "ABSENT"
                    ? { label: "Absent", dotClassName: "bg-red-500", className: "bg-red-100 text-red-700" }
                    : { label: "En attente", dotClassName: "bg-amber-500", className: "bg-amber-100 text-amber-700" };
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-2">
                  {respondingPlayers.length > 1 && (
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
          {view === "month" && (
            <button
              onClick={goToday}
              className="rounded-full border border-ubac-yellow px-3 py-1 text-xs font-semibold text-ubac-yellow-dark hover:bg-ubac-yellow/10"
            >
              Aujourd&apos;hui
            </button>
          )}

          {/* Action principale de l'écran : elle mérite un fond plein, sur
              la même ligne que la navigation de date plutôt qu'un bouton
              de plus empilé au-dessus de la grille. */}
          {canManage && (
            <button
              onClick={() => setCreateOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              <Plus className="h-4 w-4 shrink-0" />
              Créer un événement
            </button>
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
                          ? dayBirthdays[0].firstName
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

      {birthdayWidgetEntries.length > 0 && (
        <BirthdayWidget entries={birthdayWidgetEntries} />
      )}

      {view === "list" && (
        <div className="flex flex-col gap-2">
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucun événement à venir.</p>
          ) : (
            upcomingEvents.map((event) => (
              <div key={event.id} className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {toKey(new Date(event.start_time)) === todayKey
                    ? "Aujourd'hui"
                    : new Date(event.start_time).toLocaleDateString("fr-FR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                </p>
                {renderEventCard(event)}
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

        {detailBirthdays.length > 0 && (
          <div className="flex flex-col gap-2">
            {detailBirthdays.map((m) => (
              <button
                key={m.id}
                onClick={() => setOpenBirthday(m)}
                className="flex items-center gap-2 rounded-xl border border-purple-100 bg-purple-50/60 px-3 py-2.5 text-left transition-colors hover:border-purple-200"
              >
                <Cake className="h-4 w-4 shrink-0 text-purple-600" />
                <span className="text-sm font-medium text-zinc-900">
                  Anniversaire : {[m.firstName, m.lastName].filter(Boolean).join(" ")}
                  {m.category ? ` · ${m.category}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}

        {detailEvents.length === 0 && detailBirthdays.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucun événement ce jour-là.</p>
        ) : (
          detailEvents.map((event) => renderEventCard(event))
        )}
      </div>
      )}

      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
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
                <label className="mb-1 block text-xs font-medium text-zinc-600">Lieu</label>
                <input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
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
                <input
                  type="datetime-local"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
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

      {appelEvent && (
        <AppelExpressModal
          eventId={appelEvent.id}
          title={appelEvent.teamName}
          roster={rosterFor(appelEvent)}
          statusByPlayerId={Object.fromEntries(
            rosterFor(appelEvent).map((p) => [
              p.id,
              rsvp?.statusByKey[`${appelEvent.id}:${p.id}`] ?? "PENDING",
            ])
          )}
          onClose={() => setAppelEventId(null)}
        />
      )}

      {openBirthday && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpenBirthday(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cake className="h-5 w-5 text-purple-600" />
                <h3 className="font-semibold text-zinc-900">Anniversaire</h3>
              </div>
              <button
                onClick={() => setOpenBirthday(null)}
                className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-zinc-700">
              {selectedKey === todayKey
                ? "Aujourd'hui"
                : `Le ${selectedDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`}
              , c&apos;est l&apos;anniversaire de{" "}
              <span className="font-semibold">
                {[openBirthday.firstName, openBirthday.lastName].filter(Boolean).join(" ")}
              </span>
              {openBirthday.category ? ` - ${openBirthday.category}` : ""} !
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
