"use client";

import { useState } from "react";
import { ChevronDown, Home, MapPin, Trophy } from "lucide-react";

// "Ce week-end au club" en haut du Calendrier général du Bureau (retour de
// Cindy du 13/11). D'abord prévue aussi pour Coach / Famille, retirée
// ("pas utile, on vient puisqu'on est concerné" -- leurs matchs sont déjà
// dans leur calendrier et "Ma semaine"). Résumé sur une ligne
// ("10 matchs · 4 à domicile"), qui se déplie en liste par jour : heure,
// équipe, adversaire EN ENTIER sur sa propre ligne (jamais coupé), bande
// verte pour un match à domicile. Domicile d'abord, puis par heure. Un
// appui sur un match ouvre son jour dans la grille du mois.
export type WeekendMatch = {
  id: string;
  dayKey: string;
  startTime: string;
  endTime: string | null;
  teamName: string | null;
  opponent: string | null;
  isHome: boolean | null;
  isTournament: boolean;
};

function timeLabel(iso: string) {
  return new Date(iso)
    .toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })
    .replace(":", "h");
}

function dayLabel(iso: string) {
  const label = new Date(iso).toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function WeekendStrip({
  matches,
  onSelectDay,
}: {
  matches: WeekendMatch[];
  onSelectDay: (dayKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (matches.length === 0) return null;

  const homeCount = matches.filter((m) => m.isHome === true).length;
  // Par jour (samedi puis dimanche), domicile d'abord dans chaque jour.
  const days = Array.from(new Set([...matches].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((m) => m.dayKey)));
  const byDay = days.map((dayKey) => ({
    dayKey,
    matches: matches
      .filter((m) => m.dayKey === dayKey)
      .sort((a, b) => {
        const homeA = a.isHome === true ? 0 : 1;
        const homeB = b.isHome === true ? 0 : 1;
        return homeA - homeB || a.startTime.localeCompare(b.startTime);
      }),
  }));

  return (
    <div className="overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 bg-gradient-to-br from-navy via-navy to-navy-dark px-4 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ubac-yellow text-navy shadow-sm">
            <Trophy className="h-4 w-4" />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ubac-yellow">Ce week-end au club</span>
            <span className="text-base font-bold text-white">
              {matches.length} match{matches.length > 1 ? "s" : ""}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {homeCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white">
              <Home className="h-3 w-3" />
              {homeCount} à domicile
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-white/80 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 p-3">
          {byDay.map(({ dayKey, matches: dayMatches }) => (
            <div key={dayKey} className="flex flex-col gap-1.5">
              <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-zinc-900">
                {dayLabel(dayMatches[0].startTime)}
              </p>
              <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                {dayMatches.map((m) => {
                  const home = m.isHome === true;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onSelectDay(m.dayKey)}
                      className={`flex items-start gap-3 rounded-xl border border-l-4 px-3 py-2 text-left transition-colors hover:bg-zinc-50 ${
                        home ? "border-court-green/20 border-l-court-green bg-court-green/5" : "border-zinc-100 border-l-navy/30 bg-white"
                      }`}
                    >
                      <span className="w-12 shrink-0 pt-0.5 text-sm font-bold tabular-nums text-navy">
                        {timeLabel(m.startTime)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold uppercase tracking-wide text-ubac-blue">{m.teamName}</span>
                          <span
                            className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              home ? "bg-court-green text-white" : "bg-zinc-100 text-zinc-500"
                            }`}
                          >
                            {home ? <Home className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                            {home ? "Domicile" : m.isHome === false ? "Extérieur" : "Lieu ?"}
                          </span>
                        </span>
                        {/* Adversaire en entier, sur sa propre ligne (retour
                            de Cindy du 13/11, "on ne voit rien des matchs"). */}
                        <span className="break-words text-sm font-semibold leading-snug text-zinc-900">
                          {m.isTournament ? "Tournoi" : (m.opponent ?? "Match")}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
