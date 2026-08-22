"use client";

import { useMemo, useState } from "react";
import { Cake, ChevronLeft, ChevronRight, LayoutGrid, List, MapPin, PartyPopper } from "lucide-react";
import {
  EVENT_TYPE_OPTIONS,
  styleFor,
  isMatchType,
  homeAwayLabel,
  formatEventTime,
} from "@/app/dashboard/event-style";
import { groupBirthdaysByMonthDay, type BirthdaySource } from "@/app/dashboard/birthdays";
import { parseMatchTitle } from "@/lib/match-display";
import { formatFirstName } from "@/lib/names";
import type { ChildEvent, ChildTeammate } from "./child-dashboard";

// Même grille mensuelle que le calendrier Parent (calendar-view.tsx) —
// mêmes fonctions de date, dupliquées ici plutôt que ré-exportées : ce
// composant est "use client" et ne doit dépendre d'aucune donnée
// nécessitant createClient()/RSVP/édition, pour rester lecture seule même
// en théorie.
function toKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthDayKey(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}-${day}`;
}

function startOfWeekMonday(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
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

function pillLabel(event: ChildEvent) {
  if (isMatchType(event.eventType)) {
    return parseMatchTitle(event.title).opponent;
  }
  return event.title ?? styleFor(event.eventType).label;
}

const weekdayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const today = new Date();
const todayKey = toKey(today);

export default function ChildCalendarTab({
  events,
  teammates = [],
}: {
  events: ChildEvent[];
  teammates?: ChildTeammate[];
}) {
  const [view, setView] = useState<"month" | "list">("month");
  const [viewMonth, setViewMonth] = useState<Date>(today);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [filter, setFilter] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filter ? events.filter((e) => e.eventType === filter) : events),
    [events, filter]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, ChildEvent[]>();
    filtered.forEach((e) => {
      const key = toKey(new Date(e.startTime));
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    });
    return map;
  }, [filtered]);

  const birthdaySources: BirthdaySource[] = useMemo(
    () => teammates.map((t) => ({ id: t.id, firstName: t.firstName, lastName: null, birthDate: t.birthDate })),
    [teammates]
  );
  const birthdaysByMonthDay = useMemo(
    () => groupBirthdaysByMonthDay(birthdaySources),
    [birthdaySources]
  );

  const gridDays = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const headerLabel = viewMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const selectedKey = toKey(selectedDate);
  const detailEvents = eventsByDate.get(selectedKey) ?? [];
  const detailBirthdays = birthdaysByMonthDay.get(monthDayKey(selectedDate)) ?? [];

  function step(amount: number) {
    const d = new Date(viewMonth);
    d.setMonth(d.getMonth() + amount);
    setViewMonth(d);
    setSelectedDate(d);
  }

  function goToday() {
    const now = new Date();
    setViewMonth(now);
    setSelectedDate(now);
  }

  const now = Date.now();
  const upcoming = filtered
    .filter((e) => new Date(e.startTime).getTime() >= now)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const past = filtered
    .filter((e) => new Date(e.startTime).getTime() < now)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilter(null)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            filter === null ? "border-navy bg-navy text-white" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
          }`}
        >
          Tout
        </button>
        {EVENT_TYPE_OPTIONS.map((opt) => {
          const style = styleFor(opt.value);
          const active = filter === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setFilter(active ? null : opt.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                active ? `border-transparent ${style.badge}` : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

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
            <span className="text-sm font-semibold capitalize text-zinc-900">{headerLabel}</span>
          </div>
        ) : (
          <div />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {view === "month" && (
            <button
              onClick={goToday}
              className="rounded-full border border-ubac-yellow px-3 py-1 text-xs font-semibold text-ubac-yellow-dark hover:bg-ubac-yellow/10"
            >
              Aujourd&apos;hui
            </button>
          )}
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
        </div>
      </div>

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
                d.getMonth() === viewMonth.getMonth() && d.getFullYear() === viewMonth.getFullYear();
              const isToday = key === todayKey;
              const isSelected = key === selectedKey;
              const visible = dayEvents.slice(0, 3);
              const overflow = dayEvents.length - visible.length;

              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(d)}
                  className={`flex min-h-[52px] w-full min-w-0 flex-col items-start gap-1 rounded-lg border p-1 text-left transition-colors sm:min-h-[104px] sm:rounded-xl sm:p-2 ${
                    isSelected ? "border-navy bg-navy/5" : "border-zinc-100 bg-white hover:border-ubac-yellow/50"
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
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${styleFor(e.eventType).pill.split(" ")[0]}`}
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
                          className={`inline-flex items-center justify-center truncate whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-semibold leading-none ${styleFor(e.eventType).pill}`}
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
                      <span className="text-[9px] font-semibold text-zinc-400 sm:text-[10px]">+{overflow}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {view === "month" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {selectedKey === todayKey
              ? "Aujourd'hui"
              : selectedDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          {detailEvents.length === 0 && detailBirthdays.length === 0 ? (
            <p className="rounded-2xl border border-zinc-100 bg-white p-4 text-sm text-zinc-500 shadow-sm">
              Aucun événement ce jour-là.
            </p>
          ) : (
            <>
              {detailBirthdays.map((m) => (
                <BirthdayRow key={`bday-${m.id}`} name={m.firstName} />
              ))}
              {detailEvents.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </>
          )}
        </div>
      )}

      {view === "list" && (
        <div className="flex flex-col gap-4">
          {upcoming.length === 0 && past.length === 0 && (
            <p className="rounded-2xl border border-zinc-100 bg-white p-4 text-sm text-zinc-500 shadow-sm">
              Aucun événement pour le moment.
            </p>
          )}
          {upcoming.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">À venir</p>
              {upcoming.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Passés</p>
              {past.map((e) => (
                <EventRow key={e.id} event={e} faded />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BirthdayRow({ name }: { name: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-pink-100 bg-pink-50/60 p-4 shadow-sm border-l-4 border-l-pink-400">
      <PartyPopper className="h-5 w-5 shrink-0 text-pink-500" />
      <div className="flex flex-col gap-1">
        <span className="w-fit rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pink-700">
          Anniversaire
        </span>
        <span className="font-semibold text-zinc-900">{formatFirstName(name)}</span>
      </div>
    </div>
  );
}

// Exporté : réutilisé tel quel par l'onglet "Événements" (voir
// child-events-tab.tsx) plutôt que de dupliquer ce même gabarit de carte.
export function EventRow({ event, faded }: { event: ChildEvent; faded?: boolean }) {
  const style = styleFor(event.eventType);
  const parsed = parseMatchTitle(event.title);
  const home = event.isHome ?? parsed.isHome;
  const lieu = event.salle || event.location;

  return (
    <div
      className={`rounded-2xl border border-zinc-100 bg-white p-3.5 shadow-sm border-l-4 ${style.border} ${
        faded ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}>
          {style.label}
        </span>
        {event.teamName && <span className="text-xs font-semibold text-zinc-500">{event.teamName}</span>}
      </div>
      <p className="mt-1 font-semibold text-zinc-900">
        {isMatchType(event.eventType)
          ? [homeAwayLabel(home), parsed.opponent ? `vs ${parsed.opponent}` : null].filter(Boolean).join(" · ")
          : event.title ?? style.label}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        <span>
          {new Date(event.startTime).toLocaleDateString("fr-FR", {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}
          , {formatEventTime(event.startTime, event.endTime)}
        </span>
        {lieu && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {lieu}
          </span>
        )}
      </div>
    </div>
  );
}
