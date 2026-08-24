"use client";

import { useState } from "react";
import { MapPin, Sparkles } from "lucide-react";
import { styleFor, isMatchType, homeAwayLabel } from "@/app/dashboard/event-style";
import { parseMatchTitle } from "@/lib/match-display";

// Bandeau "Cette semaine" intégré directement dans l'en-tête bleu marine
// (direction artistique validée par Cindy le 2026-08-24, sur maquette :
// "implanter dans le bandeau bleu ça fait joli"). Remplace l'ancienne
// carte crème séparée au-dessus du calendrier (family-week-banner.tsx,
// ajoutée le 2026-08-23 puis retirée le lendemain, "pas necessaire") —
// cette fois fondue dans l'en-tête existant plutôt qu'en doublon visuel.
//
// Semaine calendaire (lundi -> dimanche), pas une fenêtre glissante de 7
// jours à partir d'aujourd'hui : la frise reste la même toute la semaine,
// seul le jour surligné avance.
//
// "use client" nécessaire (retour de Cindy du 2026-08-24, après la
// première version en lecture seule) : un jour avec un point bien visible
// doit être cliquable et déplier la ou les cartes événement du jour juste
// en dessous, même habillage que le reste de l'app (voir EventRow,
// child-calendar-tab.tsx / renderEventCard, calendar-view.tsx).
const DAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

export type WeekStripEvent = {
  id: string;
  title: string | null;
  eventType: string | null;
  startTime: string;
  location: string | null;
  salle: string | null;
  isHome: boolean | null;
  teamName: string | null;
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function weekSummary(events: WeekStripEvent[], weekStart: Date, weekEnd: Date): string {
  const inWeek = events.filter((e) => {
    const t = new Date(e.startTime);
    return t >= weekStart && t < weekEnd;
  });
  if (inWeek.length === 0) return "Rien de prévu cette semaine.";

  let trainings = 0;
  let matches = 0;
  let others = 0;
  let soleMatch: WeekStripEvent | null = null;
  inWeek.forEach((e) => {
    if (e.eventType === "TRAINING") {
      trainings += 1;
    } else if (e.eventType === "MATCH" || e.eventType === "FRIENDLY" || e.eventType === "TOURNAMENT") {
      matches += 1;
      soleMatch = matches === 1 ? e : null;
    } else {
      others += 1;
    }
  });

  const parts: string[] = [];
  if (trainings > 0) parts.push(`${trainings} entraînement${trainings > 1 ? "s" : ""}`);
  if (matches > 0) parts.push(`${matches} match${matches > 1 ? "s" : ""}`);
  if (others > 0) {
    parts.push(`${others} autre${others > 1 ? "s" : ""} événement${others > 1 ? "s" : ""}`);
  }

  // Un seul match dans la semaine : on nomme directement son jour (et son
  // lieu si connu) dans la phrase — évite d'avoir à ouvrir le calendrier
  // pour une info aussi simple.
  let suffix = "";
  if (soleMatch) {
    const day = new Date((soleMatch as WeekStripEvent).startTime).toLocaleDateString("fr-FR", {
      weekday: "long",
    });
    const loc = (soleMatch as WeekStripEvent).location;
    suffix = ` ${day}${loc ? ` à ${loc}` : ""}`;
  }

  return `Cette semaine : ${parts.join(", ")}.${suffix}`;
}

// Même habillage que EventRow (child-calendar-tab.tsx) et renderEventCard
// (calendar-view.tsx) : bordure pointillée + fanion "Spécial" pour un
// tournoi, bordure gauche épaisse pour un match officiel, fine sinon.
function DayEventCard({ event }: { event: WeekStripEvent }) {
  const style = styleFor(event.eventType);
  const parsed = parseMatchTitle(event.title);
  const home = event.isHome ?? parsed.isHome;
  const lieu = event.salle || event.location;
  const isTournament = event.eventType === "TOURNAMENT";
  const isOfficialMatch = event.eventType === "MATCH";
  const shellClass = isTournament
    ? "relative rounded-2xl border-2 border-dashed border-ubac-yellow bg-white p-3.5 shadow-sm"
    : isOfficialMatch
      ? `rounded-2xl border border-navy/15 bg-white p-3.5 shadow-sm border-l-8 ${style.border}`
      : `rounded-2xl border border-zinc-100 bg-white p-3.5 shadow-sm border-l-4 ${style.border}`;

  return (
    <div className={shellClass}>
      {isTournament && (
        <span className="absolute -top-2.5 right-3 flex items-center gap-1 rounded-full bg-ubac-yellow px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-navy shadow-sm">
          <Sparkles className="h-3 w-3" />
          Spécial
        </span>
      )}
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
          {new Date(event.startTime).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {lieu && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0" />
            {lieu}
          </span>
        )}
      </div>
    </div>
  );
}

export default function WeekStripBanner({ events }: { events: WeekStripEvent[] }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const today = startOfDay(new Date());
  const mondayOffset = (today.getDay() + 6) % 7; // lundi = 0 ... dimanche = 6
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const summary = weekSummary(events, weekStart, weekEnd);
  const selectedDayEvents = selectedKey
    ? events
        .filter((e) => isSameDay(new Date(e.startTime), new Date(selectedKey)))
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
    : [];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {/* Retour de Cindy du 2026-08-24 ("même emplacement, plus gros") :
            même poids typographique que l'ancienne carte séparée
            (family-week-banner.tsx) — eyebrow "CETTE SEMAINE" + phrase en
            grand et gras, plutôt qu'une simple ligne discrète. */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ubac-yellow">
            Cette semaine
          </p>
          <p className="mt-0.5 text-lg font-bold text-white">{summary}</p>
        </div>
        <div className="grid grid-cols-7 gap-1.5 sm:w-auto sm:shrink-0">
          {days.map((d) => {
            const isToday = isSameDay(d, today);
            const hasEvents = events.some((e) => isSameDay(new Date(e.startTime), d));
            const key = d.toISOString();
            const isSelected = selectedKey === key;
            return (
              <button
                key={key}
                type="button"
                disabled={!hasEvents}
                onClick={() => setSelectedKey(isSelected ? null : key)}
                className={`flex flex-col items-center gap-1 rounded-xl px-1.5 py-1.5 text-center transition-colors ${
                  isToday ? "bg-ubac-yellow text-navy-dark" : "bg-white/10 text-white/70"
                } ${hasEvents ? "cursor-pointer hover:brightness-110" : "cursor-default"} ${
                  isSelected ? "ring-2 ring-white" : ""
                }`}
              >
                <span className="text-[10px] font-semibold uppercase">
                  {DAY_LETTERS[(d.getDay() + 6) % 7]}
                </span>
                <span className="text-sm font-bold">{d.getDate()}</span>
                {/* Point bien visible (retour de Cindy) : couleur fixe
                    (pas par type d'événement) pour rester lisible quel que
                    soit le fond de la pastille (aujourd'hui en jaune, les
                    autres jours en blanc translucide). */}
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    hasEvents ? (isToday ? "bg-navy-dark" : "bg-ubac-yellow") : "bg-transparent"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {selectedDayEvents.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl bg-white/95 p-3 shadow-sm sm:p-3.5">
          {selectedDayEvents.map((event) => (
            <DayEventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
