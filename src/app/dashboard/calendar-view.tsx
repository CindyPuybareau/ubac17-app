"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, MapPin } from "lucide-react";
import { parseMatchTitle } from "@/lib/match-display";
import OpponentDisplay from "./opponent-display";
import CreateEventForm from "./create-event-form";
import RsvpButtons from "./rsvp-buttons";
import type { AdminUpcomingEvent } from "./page";

const typeStyles: Record<
  string,
  { pill: string; border: string; badge: string; label: string }
> = {
  MATCH: {
    pill: "bg-blue-100 text-blue-700",
    border: "border-l-blue-400",
    badge: "bg-blue-100 text-blue-700",
    label: "Match",
  },
  TOURNAMENT: {
    pill: "bg-purple-100 text-purple-700",
    border: "border-l-purple-400",
    badge: "bg-purple-100 text-purple-700",
    label: "Tournoi",
  },
  OTHER: {
    pill: "bg-orange-100 text-orange-700",
    border: "border-l-orange-400",
    badge: "bg-orange-100 text-orange-700",
    label: "Événement club",
  },
  TRAINING: {
    pill: "bg-green-100 text-green-700",
    border: "border-l-green-400",
    badge: "bg-green-100 text-green-700",
    label: "Entraînement",
  },
};

function styleFor(eventType: string | null) {
  return typeStyles[eventType ?? "OTHER"] ?? typeStyles.OTHER;
}

function pillLabel(event: AdminUpcomingEvent) {
  if (event.event_type === "MATCH") {
    return parseMatchTitle(event.title).opponent;
  }
  return event.title ?? styleFor(event.event_type).label;
}

function toKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
}: {
  events: AdminUpcomingEvent[];
  createTeams?: CalendarTeamRef[];
  rsvp?: {
    players: CalendarRsvpPlayer[];
    statusByKey: Record<string, string>;
  };
}) {
  const [selectedDate, setSelectedDate] = useState<Date>(today);

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

  function goToday() {
    setSelectedDate(new Date());
  }

  function step(amount: number) {
    const d = new Date(selectedDate);
    d.setMonth(d.getMonth() + amount);
    setSelectedDate(d);
  }

  const selectedKey = toKey(selectedDate);

  const headerLabel = selectedDate.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  const gridDays = useMemo(() => buildMonthGrid(selectedDate), [selectedDate]);

  const detailEvents = eventsByDate.get(selectedKey) ?? [];

  return (
    <div className="flex w-full max-w-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <button
          onClick={goToday}
          className="rounded-full border border-ubac-yellow px-3 py-1 text-xs font-semibold text-ubac-yellow-dark hover:bg-ubac-yellow/10"
        >
          Aujourd&apos;hui
        </button>
      </div>

      {createTeams && createTeams.length > 0 && (
        <CreateEventForm teams={createTeams} />
      )}

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
            const isCurrentMonth =
              d.getMonth() === selectedDate.getMonth() &&
              d.getFullYear() === selectedDate.getFullYear();
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
                  </div>
                  <div className="hidden sm:flex sm:flex-col sm:gap-0.5">
                    {visible.map((e) => (
                      <span
                        key={e.id}
                        className={`truncate rounded px-1 py-0.5 text-[10px] font-semibold ${styleFor(e.event_type).pill}`}
                      >
                        {pillLabel(e)}
                      </span>
                    ))}
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

        {detailEvents.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucun événement ce jour-là.</p>
        ) : (
          detailEvents.map((event) => {
            const style = styleFor(event.event_type);
            const rsvpCounts = event.rsvpCounts;
            const hasRoster =
              rsvpCounts.present +
                rsvpCounts.absent +
                rsvpCounts.late +
                rsvpCounts.pending >
              0;
            const respondingPlayers = rsvp
              ? rsvp.players.filter(
                  (p) => event.teamId && p.teamIds.includes(event.teamId)
                )
              : [];

            return (
              <div
                key={event.id}
                className={`flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm border-l-4 ${style.border}`}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {event.teamName}
                  </span>
                  {event.event_type === "MATCH" ? (
                    <OpponentDisplay title={event.title} size="sm" />
                  ) : (
                    <span className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}
                      >
                        {style.label}
                      </span>
                      <span className="font-semibold text-zinc-900">
                        {event.title ?? style.label}
                      </span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-4 w-4" />
                    {new Date(event.start_time).toLocaleString("fr-FR", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {event.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {event.location}
                    </span>
                  )}
                </div>

                {hasRoster && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                      ✅ {rsvpCounts.present} présent
                      {rsvpCounts.present > 1 ? "s" : ""}
                    </span>
                    {rsvpCounts.late > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        ⏰ {rsvpCounts.late} en retard
                      </span>
                    )}
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                      ❌ {rsvpCounts.absent} absent
                      {rsvpCounts.absent > 1 ? "s" : ""}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">
                      ⏳ {rsvpCounts.pending} en attente
                    </span>
                  </div>
                )}

                {respondingPlayers.length > 0 && (
                  <div className="flex flex-col gap-2 border-t border-zinc-100 pt-2">
                    {respondingPlayers.map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        {respondingPlayers.length > 1 && (
                          <span className="text-xs font-medium text-zinc-500">
                            {p.name}
                          </span>
                        )}
                        <RsvpButtons
                          eventId={event.id}
                          playerId={p.id}
                          currentStatus={
                            rsvp?.statusByKey[`${event.id}:${p.id}`] ??
                            "PENDING"
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
