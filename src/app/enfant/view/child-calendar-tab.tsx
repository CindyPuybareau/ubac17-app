"use client";

import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { EVENT_TYPE_OPTIONS, styleFor, isMatchType, homeAwayLabel, formatEventTime } from "@/app/dashboard/event-style";
import { parseMatchTitle } from "@/lib/match-display";
import type { ChildEvent } from "./child-dashboard";

// Liste filtrable plutôt qu'une grille de mois complète : celle-ci est
// intimement liée aux RSVP/actions du calendrier interactif (réservé aux
// parents/coachs) — une simple liste triée avec filtre par type couvre le
// besoin ("vue calendrier/liste") sans risquer d'emprunter, même
// visuellement, un composant taillé pour l'édition.
export default function ChildCalendarTab({ events }: { events: ChildEvent[] }) {
  const [filter, setFilter] = useState<string | null>(null);

  const now = Date.now();
  const filtered = useMemo(
    () => (filter ? events.filter((e) => e.eventType === filter) : events),
    [events, filter]
  );
  const upcoming = filtered.filter((e) => new Date(e.startTime).getTime() >= now);
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
  );
}

function EventRow({ event, faded }: { event: ChildEvent; faded?: boolean }) {
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
