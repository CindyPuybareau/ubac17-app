"use client";

import { useMemo, useState } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import OpponentDisplay from "./opponent-display";
import type { AdminUpcomingEvent } from "./page";

type EventFilter = "ALL" | "MATCH" | "OTHER" | "TRAINING";

const filterLabels: Record<EventFilter, string> = {
  ALL: "Tous",
  MATCH: "Matchs FFBB",
  OTHER: "Événements club",
  TRAINING: "Entraînements",
};

const typeStyles: Record<
  string,
  { dot: string; border: string; badge: string; label: string }
> = {
  MATCH: {
    dot: "bg-navy",
    border: "border-l-navy",
    badge: "bg-navy/10 text-navy",
    label: "Match FFBB",
  },
  OTHER: {
    dot: "bg-ubac-yellow",
    border: "border-l-ubac-yellow",
    badge: "bg-ubac-yellow/15 text-ubac-yellow-dark",
    label: "Événement club",
  },
  TRAINING: {
    dot: "bg-green-500",
    border: "border-l-green-500",
    badge: "bg-green-100 text-green-700",
    label: "Entraînement",
  },
};

function styleFor(eventType: string | null) {
  return typeStyles[eventType ?? "OTHER"] ?? typeStyles.OTHER;
}

function dateKey(iso: string) {
  return iso.slice(0, 10);
}

export default function AdminCalendar({
  events,
}: {
  events: AdminUpcomingEvent[];
}) {
  const [filter, setFilter] = useState<EventFilter>("ALL");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const filteredByType = useMemo(
    () =>
      filter === "ALL"
        ? events
        : events.filter((e) => (e.event_type ?? "OTHER") === filter),
    [events, filter]
  );

  const dateCells = useMemo(() => {
    const map = new Map<string, Set<string>>();
    filteredByType.forEach((e) => {
      const key = dateKey(e.start_time);
      const types = map.get(key) ?? new Set<string>();
      types.add(e.event_type ?? "OTHER");
      map.set(key, types);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, types]) => ({ date, types: Array.from(types) }));
  }, [filteredByType]);

  const visibleEvents = useMemo(
    () =>
      selectedDate
        ? filteredByType.filter((e) => dateKey(e.start_time) === selectedDate)
        : filteredByType,
    [filteredByType, selectedDate]
  );

  function selectFilter(key: EventFilter) {
    setFilter(key);
    setSelectedDate(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(filterLabels) as EventFilter[]).map((key) => (
          <button
            key={key}
            onClick={() => selectFilter(key)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === key
                ? "border-ubac-yellow bg-ubac-yellow/10 text-ubac-yellow-dark"
                : "border-zinc-200 text-zinc-600"
            }`}
          >
            {filterLabels[key]}
          </button>
        ))}
      </div>

      {dateCells.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {dateCells.map(({ date, types }) => {
            const d = new Date(`${date}T00:00:00`);
            const isSelected = selectedDate === date;
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(isSelected ? null : date)}
                className={`flex min-w-[52px] shrink-0 flex-col items-center gap-1 rounded-xl border px-2 py-2 transition-colors ${
                  isSelected
                    ? "border-navy bg-navy text-white"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-ubac-yellow"
                }`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide">
                  {d.toLocaleDateString("fr-FR", { weekday: "short" })}
                </span>
                <span className="text-sm font-bold">{d.getDate()}</span>
                <span className="flex gap-0.5">
                  {types.map((t) => (
                    <span
                      key={t}
                      className={`h-1.5 w-1.5 rounded-full ${styleFor(t).dot}`}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {visibleEvents.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Aucun événement à venir pour ce filtre.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleEvents.map((event) => {
            const style = styleFor(event.event_type);
            const rsvp = event.rsvpCounts;
            const hasRoster =
              rsvp.present + rsvp.absent + rsvp.late + rsvp.pending > 0;

            return (
              <div
                key={event.id}
                className={`flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm border-l-4 ${style.border}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
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
                      ✅ {rsvp.present} présent{rsvp.present > 1 ? "s" : ""}
                    </span>
                    {rsvp.late > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        ⏰ {rsvp.late} en retard
                      </span>
                    )}
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                      ❌ {rsvp.absent} absent{rsvp.absent > 1 ? "s" : ""}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">
                      ⏳ {rsvp.pending} en attente
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
